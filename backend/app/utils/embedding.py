import hashlib
import json as _json
import logging
import threading
from functools import lru_cache
from typing import AsyncIterator, List

import httpx

from ..config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Query-embedding cache (LRU, in-memory, per-process)
# ---------------------------------------------------------------------------
@lru_cache(maxsize=256)
def _cached_hash_embedding(text: str) -> tuple:
    """Cache hash-fallback embeddings so identical text isn't recomputed."""
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    return tuple(
        (digest[i % len(digest)] - 128) / 128.0
        for i in range(settings.embedding_dimension)
    )


_embed_cache: dict[str, List[float]] = {}
_embed_lock = threading.Lock()
_EMBED_CACHE_MAX = 512


def _put_embed_cache(text: str, vec: List[float]) -> None:
    with _embed_lock:
        if len(_embed_cache) >= _EMBED_CACHE_MAX:
            keys = list(_embed_cache.keys())[: _EMBED_CACHE_MAX // 4]
            for k in keys:
                _embed_cache.pop(k, None)
        _embed_cache[text] = vec


def _ensure_embedding_dimension(vec: List[float]) -> List[float]:
    expected = settings.embedding_dimension
    actual = len(vec)
    if actual != expected:
        raise ValueError(
            f"Embedding 维度不匹配：期望 {expected}，实际 {actual}。"
            "请检查 EMBEDDING_MODEL 与 EMBEDDING_DIMENSION 配置。"
        )
    return vec


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------
def is_ai_enabled() -> bool:
    """Return True when a real embedding / LLM provider is configured."""
    return bool(settings.openai_api_key)


class AINotConfiguredError(Exception):
    """Raised when an AI operation is attempted without an API key."""


# ---------------------------------------------------------------------------
# Embed single text
# ---------------------------------------------------------------------------
async def embed_text(text: str) -> List[float]:
    """
    Embed *text* into a 1536-dim vector.

    • Embedding key present  → calls configured embeddings model
    • No key              → deterministic SHA-256 hash fallback (not semantic)
    """
    clean = text.strip()

    with _embed_lock:
        if clean in _embed_cache:
            return _embed_cache[clean]

    if settings.embedding_api_key:
        headers = {
            "Authorization": f"Bearer {settings.embedding_api_key}",
            "Content-Type": "application/json",
        }
        payload = {"model": settings.embedding_model, "input": clean}
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{settings.embedding_api_base}/embeddings",
                headers=headers,
                json=payload,
            )
            resp.raise_for_status()
            vec = _ensure_embedding_dimension(resp.json()["data"][0]["embedding"])
            _put_embed_cache(clean, vec)
            return vec

    # Fallback – deterministic hash embedding (no semantic meaning)
    vec = _ensure_embedding_dimension(list(_cached_hash_embedding(clean)))
    _put_embed_cache(clean, vec)
    return vec


# ---------------------------------------------------------------------------
# Batch embed  (reduces HTTP round-trips during document ingestion)
# ---------------------------------------------------------------------------
async def embed_texts(texts: List[str]) -> List[List[float]]:
    """Embed multiple texts.  Uses the OpenAI batch API when available."""
    cleaned = [t.strip() for t in texts]

    if not settings.embedding_api_key:
        return [_ensure_embedding_dimension(list(_cached_hash_embedding(t))) for t in cleaned]

    BATCH = 64
    all_vecs: List[List[float]] = [[] for _ in cleaned]
    for start in range(0, len(cleaned), BATCH):
        batch = cleaned[start : start + BATCH]
        headers = {
            "Authorization": f"Bearer {settings.embedding_api_key}",
            "Content-Type": "application/json",
        }
        payload = {"model": settings.embedding_model, "input": batch}
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{settings.embedding_api_base}/embeddings",
                headers=headers,
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()["data"]
            data.sort(key=lambda d: d["index"])
            for i, item in enumerate(data):
                idx = start + i
                vec = _ensure_embedding_dimension(item["embedding"])
                all_vecs[idx] = vec
                _put_embed_cache(cleaned[idx], vec)
    return all_vecs


# ---------------------------------------------------------------------------
# LLM system prompt
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """\
你是山东大学校史档案智能助手。请严格基于【引用档案】回答用户的问题。

要求：
1. **仅**根据引用档案回答，不要编造任何信息。
2. 如果档案不足以回答，明确回复"档案中未找到相关记载"。
3. 回答要分点、简洁、专业。
4. 在关键事实后用 [来源N] 标注引用编号，N 对应引用档案序号。
5. 使用中文回答。"""


def _build_user_prompt(query: str, context: str) -> str:
    return f"用户问题：{query}\n\n引用档案：\n{context}\n\n请基于以上引用档案回答用户的问题。"


# ---------------------------------------------------------------------------
# Non-streaming answer generation
# ---------------------------------------------------------------------------
async def generate_answer(query: str, context: str) -> str:
    """Non-streaming answer generation.  Raises on error instead of silently degrading."""
    if not settings.openai_api_key:
        raise AINotConfiguredError("AI 功能未启用，请联系管理员配置 OPENAI_API_KEY")

    try:
        headers = {
            "Authorization": f"Bearer {settings.openai_api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": settings.openai_model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": _build_user_prompt(query, context)},
            ],
            "temperature": 0.3,
            "max_tokens": 1200,
        }
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{settings.openai_api_base}/chat/completions",
                headers=headers,
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"].strip()
    except AINotConfiguredError:
        raise
    except Exception as exc:
        logger.exception("LLM generation error: %s", exc)
        raise


# ---------------------------------------------------------------------------
# Streaming answer generation  (yields SSE-friendly text chunks)
# ---------------------------------------------------------------------------
async def generate_answer_stream(query: str, context: str) -> AsyncIterator[str]:
    """Async generator – yields text *chunks* as they arrive from the LLM."""
    if not settings.openai_api_key:
        raise AINotConfiguredError("AI 功能未启用，请联系管理员配置 OPENAI_API_KEY")

    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.openai_model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _build_user_prompt(query, context)},
        ],
        "temperature": 0.3,
        "max_tokens": 1200,
        "stream": True,
    }

    async with httpx.AsyncClient(timeout=60) as client:
        async with client.stream(
            "POST",
            f"{settings.openai_api_base}/chat/completions",
            headers=headers,
            json=payload,
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data_str = line[len("data: "):]
                if data_str.strip() == "[DONE]":
                    break
                try:
                    chunk = _json.loads(data_str)
                except Exception:
                    continue
                delta = chunk.get("choices", [{}])[0].get("delta", {})
                text_piece = delta.get("content")
                if text_piece:
                    yield text_piece

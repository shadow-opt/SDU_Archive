import hashlib
from functools import lru_cache
from typing import List

from openai import AsyncOpenAI

from ..config import get_settings

settings = get_settings()


@lru_cache
def _get_client(api_key: str, base_url: str | None) -> AsyncOpenAI:
    return AsyncOpenAI(api_key=api_key, base_url=base_url)


async def embed_text(text: str) -> List[float]:
    """
    Prefer external provider (e.g., OpenAI or compatible endpoints) when key is configured; otherwise use a deterministic
    hash embedding to keep the pipeline functional without heavy local models.
    """
    clean_text = text.strip()
    if settings.openai_api_key:
        client = _get_client(settings.openai_api_key, settings.openai_base_url)
        resp = await client.embeddings.create(model="text-embedding-3-small", input=clean_text)
        return resp.data[0].embedding

    # Deterministic fallback: hash text into 1536-dim float vector
    digest = hashlib.sha256(clean_text.encode("utf-8")).digest()
    floats = []
    for i in range(1536):
        byte = digest[i % len(digest)]
        floats.append((byte - 128) / 128.0)
    return floats


async def generate_answer(query: str, context: str) -> str:
    """
    Generate a natural language answer using LLM based on the query and retrieved context.
    Falls back to returning context directly if OpenAI API key is not configured.

    Uses gpt-4o by default (configurable via OPENAI_MODEL env var).
    """
    if not settings.openai_api_key:
        # Fallback: return context as-is
        return context

    try:
        client = _get_client(settings.openai_api_key, settings.openai_base_url)

        system_prompt = """你是山东大学校史档案智能助手。请基于提供的档案内容回答用户的问题。

要求：
1. 仅根据提供的档案内容回答，不要编造信息
2. 如果档案内容不足以回答问题，明确说明"档案中未找到相关记载"
3. 回答要准确、简洁、专业
4. 可以引用具体的档案内容"""

        user_prompt = f"""用户问题：{query}

相关档案内容：
{context}

请基于以上档案内容回答用户的问题。"""

        resp = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=800,
        )
        return resp.choices[0].message.content.strip()

    except Exception as e:
        # Log error for debugging (in production, use proper logging)
        print(f"LLM generation error: {e}")
        # On error, fallback to returning context
        return context

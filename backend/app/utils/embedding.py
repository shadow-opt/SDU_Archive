import hashlib
from typing import List

import httpx

from ..config import get_settings

settings = get_settings()


async def embed_text(text: str) -> List[float]:
    """
    Prefer external provider (e.g., OpenAI) when key is configured; otherwise use a deterministic hash embedding
    to keep the pipeline functional without heavy local models.
    """
    clean_text = text.strip()
    if settings.openai_api_key:
        headers = {
            "Authorization": f"Bearer {settings.openai_api_key}",
            "Content-Type": "application/json",
        }
        payload = {"model": "text-embedding-3-small", "input": clean_text}
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post("https://api.openai.com/v1/embeddings", headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data["data"][0]["embedding"]

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
    """
    if not settings.openai_api_key:
        # Fallback: return context as-is
        return context

    try:
        headers = {
            "Authorization": f"Bearer {settings.openai_api_key}",
            "Content-Type": "application/json",
        }

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

        payload = {
            "model": "gpt-3.5-turbo",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.3,
            "max_tokens": 800
        }

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"].strip()

    except Exception:
        # On error, fallback to returning context
        return context

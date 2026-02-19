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

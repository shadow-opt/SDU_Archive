import asyncio

from backend.app.documents import split_text
from backend.app.config import get_settings
from backend.app.utils.embedding import embed_text


def test_split_text_respects_overlap():
    text = "0123456789" * 10  # 100 chars
    chunks = split_text(text, chunk_size=20, overlap=5)
    # Current logic keeps overlapping until tail included
    assert len(chunks) == 7
    # Overlap check: next chunk starts within previous 5 chars
    assert chunks[1].startswith(chunks[0][-5:])


def test_embed_text_returns_fixed_length():
    result = asyncio.run(embed_text("hello world"))
    assert len(result) == 1536
    # deterministic fallback: same input -> same vector
    again = asyncio.run(embed_text("hello world"))
    assert result == again
    different = asyncio.run(embed_text("another text"))
    assert result != different


def test_default_llm_settings(monkeypatch):
    # Ensure defaults are picked when env vars are absent
    monkeypatch.delenv("OPENAI_MODEL", raising=False)
    monkeypatch.delenv("OPENAI_BASE_URL", raising=False)
    get_settings.cache_clear()
    settings = get_settings()
    assert settings.openai_model == "gpt-4o"
    assert settings.openai_base_url is None

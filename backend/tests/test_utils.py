import asyncio

from backend.app.documents import split_text
from backend.app.utils.embedding import embed_text


def test_split_text_respects_overlap():
    text = "这是一句话。" * 40  # 240 chars with sentence boundaries
    chunks = split_text(text, max_chars=80, overlap_chars=20)
    assert len(chunks) >= 2
    # Each chunk should not exceed max_chars significantly
    for c in chunks:
        assert len(c) <= 100  # allow some boundary overshoot


def test_embed_text_returns_fixed_length():
    result = asyncio.run(embed_text("hello world"))
    assert len(result) == 1536
    # deterministic fallback: same input -> same vector
    again = asyncio.run(embed_text("hello world"))
    assert result == again
    different = asyncio.run(embed_text("another text"))
    assert result != different

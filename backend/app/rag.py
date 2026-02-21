import json as _json
import logging

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from .deps import get_current_user, get_db, rate_limiter
from .models import Chunk, Document
from .schemas import RagQuery, RagResponse, RagCitation
from .utils.embedding import (
    AINotConfiguredError,
    embed_text,
    generate_answer,
    generate_answer_stream,
    is_ai_enabled,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/rag", tags=["rag"], dependencies=[Depends(rate_limiter)])

# Maximum cosine distance to accept (lower = stricter relevance)
DISTANCE_THRESHOLD = 0.55


def _retrieve(db: Session, query_embedding: list[float], top_k: int):
    """Return (chunk, distance) pairs filtered by DISTANCE_THRESHOLD."""
    dist_col = Chunk.embedding.cosine_distance(query_embedding).label("distance")
    rows = (
        db.query(Chunk, dist_col)
        .options(joinedload(Chunk.document))
        .order_by(dist_col)
        .limit(top_k)
        .all()
    )
    return [(chunk, dist) for chunk, dist in rows if dist <= DISTANCE_THRESHOLD]


def _build_context_and_citations(results):
    citations: list[RagCitation] = []
    context_parts: list[str] = []
    for idx, (chunk, _dist) in enumerate(results, 1):
        doc: Document | None = chunk.document
        title = doc.title if doc else chunk.source_url
        snippet = chunk.content[:200]
        citations.append(
            RagCitation(source=chunk.source_url, snippet=snippet, document_title=title)
        )
        context_parts.append(f"[来源{idx}] {chunk.content}")
    context = "\n\n".join(context_parts)
    return context, citations


# ── Non-streaming endpoint ──────────────────────────────────────────────
@router.post("/query", response_model=RagResponse)
async def query_rag(
    payload: RagQuery,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    query_embedding = await embed_text(payload.query)
    results = _retrieve(db, query_embedding, payload.top_k)

    if not results:
        return RagResponse(answer="暂无相关档案记载。", citations=[], degraded=False)

    context, citations = _build_context_and_citations(results)

    try:
        answer_text = await generate_answer(payload.query, context)
        return RagResponse(answer=answer_text, citations=citations, degraded=False)
    except AINotConfiguredError:
        # Graceful fallback – return raw context
        return RagResponse(
            answer="AI 回答功能暂未开启，以下是检索到的相关档案片段：\n\n" + context,
            citations=citations,
            degraded=True,
        )


# ── SSE streaming endpoint ──────────────────────────────────────────────
@router.post("/stream")
async def query_rag_stream(
    payload: RagQuery,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    query_embedding = await embed_text(payload.query)
    results = _retrieve(db, query_embedding, payload.top_k)

    if not results:
        async def _empty():
            yield f"data: {_json.dumps({'citations': [], 'done': True, 'text': '暂无相关档案记载。'}, ensure_ascii=False)}\n\n"
        return StreamingResponse(_empty(), media_type="text/event-stream")

    context, citations = _build_context_and_citations(results)
    cit_dicts = [c.model_dump() for c in citations]

    async def _generate():
        # First event: send citations
        yield f"data: {_json.dumps({'citations': cit_dicts}, ensure_ascii=False)}\n\n"

        try:
            async for chunk in generate_answer_stream(payload.query, context):
                yield f"data: {_json.dumps({'text': chunk}, ensure_ascii=False)}\n\n"
        except AINotConfiguredError:
            fallback = "AI 回答功能暂未开启，以下是检索到的相关档案片段：\n\n" + context
            yield f"data: {_json.dumps({'text': fallback, 'degraded': True}, ensure_ascii=False)}\n\n"
        except Exception:
            logger.exception("Stream generation failed")
            yield f"data: {_json.dumps({'error': '生成回答时出错，请稍后重试'}, ensure_ascii=False)}\n\n"

        yield f"data: {_json.dumps({'done': True}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

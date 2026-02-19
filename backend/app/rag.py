from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .deps import get_current_user, get_db, rate_limiter
from .models import Chunk
from .schemas import RagQuery, RagResponse, RagCitation
from .utils.embedding import embed_text

router = APIRouter(prefix="/api/rag", tags=["rag"], dependencies=[Depends(rate_limiter)])


@router.post("/query", response_model=RagResponse)
async def query_rag(
    payload: RagQuery,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
):
    query_embedding = await embed_text(payload.query)
    results = (
        db.query(Chunk)
        .order_by(Chunk.embedding.cosine_distance(query_embedding))
        .limit(payload.top_k)
        .all()
    )
    if not results:
        return RagResponse(answer="暂无记载", citations=[])

    citations: list[RagCitation] = []
    snippets = []
    for chunk in results:
        snippet = chunk.content[:200]
        citations.append(RagCitation(source=chunk.source_url, snippet=snippet))
        snippets.append(snippet)

    answer_text = "\n".join(snippets)
    return RagResponse(answer=answer_text, citations=citations)

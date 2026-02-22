import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from sqlalchemy.orm import joinedload

from .deps import get_db, escape_like, rate_limiter, require_admin
from .models import Chunk
from .schemas import ChunkListResponse, ChunkOut, ChunkUpdate
from .utils.embedding import embed_text

router = APIRouter(prefix="/api/chunks", tags=["chunks"], dependencies=[Depends(rate_limiter)])


def _chunk_to_out(chunk: Chunk) -> ChunkOut:
    return ChunkOut(
        id=chunk.id,
        document_id=chunk.document_id,
        content=chunk.content,
        source_url=chunk.source_url,
        document_title=chunk.document.title if chunk.document else None,
        char_count=len(chunk.content),
        token_count=max(1, len(chunk.content) // 4),
        created_at=chunk.created_at,
        updated_at=chunk.updated_at,
    )


@router.get("/", response_model=ChunkListResponse)
def list_chunks(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, le=200),
    q: str | None = Query(default=None, min_length=1),
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    base_query = db.query(Chunk)
    if q:
        like_pattern = f"%{escape_like(q)}%"
        base_query = base_query.filter(or_(Chunk.content.ilike(like_pattern), Chunk.source_url.ilike(like_pattern)))
    total = base_query.count()
    chunks = base_query.options(joinedload(Chunk.document)).order_by(Chunk.updated_at.desc()).offset(skip).limit(limit).all()

    return ChunkListResponse(
        items=[_chunk_to_out(c) for c in chunks],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.patch("/{chunk_id}", response_model=ChunkOut)
async def update_chunk(
    chunk_id: uuid.UUID,
    payload: ChunkUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    chunk = db.get(Chunk, chunk_id)
    if not chunk:
        raise HTTPException(status_code=404, detail="Chunk not found")
    chunk.content = payload.content
    chunk.embedding = await embed_text(payload.content)
    db.add(chunk)
    db.commit()
    db.refresh(chunk)
    return _chunk_to_out(chunk)


@router.delete("/{chunk_id}")
def delete_chunk(chunk_id: uuid.UUID, db: Session = Depends(get_db), _: None = Depends(require_admin)):
    chunk = db.get(Chunk, chunk_id)
    if not chunk:
        raise HTTPException(status_code=404, detail="Chunk not found")
    db.delete(chunk)
    db.commit()
    return {"ok": True}

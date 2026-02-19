import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .deps import get_db, rate_limiter, require_admin
from .models import Chunk
from .schemas import ChunkOut, ChunkUpdate
from .utils.embedding import embed_text

router = APIRouter(prefix="/api/chunks", tags=["chunks"], dependencies=[Depends(rate_limiter)])


@router.get("/", response_model=list[ChunkOut])
def list_chunks(
    skip: int = 0,
    limit: int = Query(default=50, le=200),
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    return db.query(Chunk).offset(skip).limit(limit).all()


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
    return chunk


@router.delete("/{chunk_id}")
def delete_chunk(chunk_id: uuid.UUID, db: Session = Depends(get_db), _: None = Depends(require_admin)):
    chunk = db.get(Chunk, chunk_id)
    if not chunk:
        raise HTTPException(status_code=404, detail="Chunk not found")
    db.delete(chunk)
    db.commit()
    return {"ok": True}

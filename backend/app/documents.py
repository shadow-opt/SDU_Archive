import io
import uuid
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .config import get_settings
from .deps import get_current_user, get_db, rate_limiter
from .models import Chunk, Document, User
from .schemas import DocumentOut
from .utils.embedding import embed_text
from .utils.storage import upload_file

router = APIRouter(prefix="/api/documents", tags=["documents"])
settings = get_settings()


def split_text(text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
    chunks = []
    start = 0
    while start < len(text):
        end = min(len(text), start + chunk_size)
        chunk = text[start:end]
        chunks.append(chunk.strip())
        if end >= len(text):
            break
        start = end - overlap
    return [c for c in chunks if c]


@router.post("/upload", response_model=DocumentOut, dependencies=[Depends(rate_limiter)])
async def upload_document(
    title: str = Form(...),
    description: str | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    contents = await file.read()
    if len(contents) > 100 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 100MB)")

    object_name = f"{uuid.uuid4()}-{file.filename}"
    upload_file(object_name, io.BytesIO(contents), length=len(contents), content_type=file.content_type or "application/octet-stream")

    document = Document(
        title=title,
        filename=file.filename,
        content_type=file.content_type or "application/octet-stream",
        object_name=object_name,
        description=description,
        uploader_id=current_user.id,
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    text_body = None
    if file.content_type and file.content_type.startswith("text"):
        try:
            text_body = contents.decode("utf-8")
        except UnicodeDecodeError:
            text_body = None
    elif file.filename.lower().endswith((".txt", ".md")):
        try:
            text_body = contents.decode("utf-8")
        except UnicodeDecodeError:
            text_body = None
    else:
        text_body = description or title

    if text_body:
        for chunk in split_text(text_body):
            embedding = await embed_text(chunk)
            db_chunk = Chunk(
                document_id=document.id,
                content=chunk,
                embedding=embedding,
                source_url=object_name,
            )
            db.add(db_chunk)
        db.commit()

    return document

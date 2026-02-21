import io
import logging
import re
import uuid
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from .config import get_settings
from .deps import get_db, rate_limiter, require_admin
from .models import Chunk, Document, User
from .schemas import DocumentListResponse, DocumentOut
from .utils.embedding import embed_texts
from .utils.storage import upload_file

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/documents", tags=["documents"])
settings = get_settings()

# ---------------------------------------------------------------------------
# Chinese-aware sentence-boundary text splitter
# ---------------------------------------------------------------------------
_SENTENCE_RE = re.compile(r"(?<=[。！？\n])")


def split_text(
    text: str,
    max_chars: int = 800,
    overlap_chars: int = 150,
) -> List[str]:
    """
    Split *text* on Chinese / common sentence boundaries, respecting
    *max_chars* per chunk with *overlap_chars* of trailing context.
    """
    sentences = _SENTENCE_RE.split(text)
    sentences = [s.strip() for s in sentences if s.strip()]

    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    for sent in sentences:
        if current_len + len(sent) > max_chars and current:
            chunks.append("".join(current))
            # keep tail sentences that fit within overlap
            tail: list[str] = []
            tail_len = 0
            for s in reversed(current):
                if tail_len + len(s) > overlap_chars:
                    break
                tail.insert(0, s)
                tail_len += len(s)
            current = tail
            current_len = tail_len

        current.append(sent)
        current_len += len(sent)

    if current:
        chunks.append("".join(current))

    return [c for c in chunks if c]


# ---------------------------------------------------------------------------
# PDF text extraction (PyMuPDF)
# ---------------------------------------------------------------------------
def _extract_pdf_text(data: bytes) -> str:
    try:
        import fitz  # PyMuPDF
    except ImportError:
        logger.warning("PyMuPDF not installed – PDF text extraction skipped")
        return ""
    text_parts: list[str] = []
    with fitz.open(stream=data, filetype="pdf") as doc:
        for page in doc:
            text_parts.append(page.get_text())
    return "\n".join(text_parts)


# ---------------------------------------------------------------------------
# Upload endpoint
# ---------------------------------------------------------------------------
ALLOWED_PREFIXES = ("text/", "image/", "application/pdf")


@router.post("/upload", response_model=DocumentOut, dependencies=[Depends(rate_limiter)])
async def upload_document(
    title: str = Form(...),
    description: str | None = Form(None),
    year_or_period: str | None = Form(None),
    doc_type: str | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    contents = await file.read()
    if len(contents) > 100 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="文件过大（最大 100 MB）")

    ct = file.content_type or ""
    fname = (file.filename or "").lower()
    if not any(ct.startswith(p) for p in ALLOWED_PREFIXES) and not fname.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="仅支持文本、图片或 PDF 文件")

    object_name = f"{uuid.uuid4()}-{file.filename}"
    upload_file(
        object_name,
        io.BytesIO(contents),
        length=len(contents),
        content_type=ct or "application/octet-stream",
    )

    document = Document(
        title=title,
        filename=file.filename,
        content_type=ct or "application/octet-stream",
        object_name=object_name,
        description=description,
        year_or_period=year_or_period,
        doc_type=doc_type,
        uploader_id=current_user.id,
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    # --- Extract text body ---
    text_body: str | None = None

    if ct == "application/pdf" or fname.endswith(".pdf"):
        text_body = _extract_pdf_text(contents)
    elif ct.startswith("text") or fname.endswith((".txt", ".md")):
        try:
            text_body = contents.decode("utf-8")
        except UnicodeDecodeError:
            text_body = None

    if not text_body:
        # Use description / title as minimal content
        text_body = description or title

    # --- Chunk + batch embed ---
    text_chunks = split_text(text_body)
    if text_chunks:
        embeddings = await embed_texts(text_chunks)
        for chunk_text, embedding in zip(text_chunks, embeddings):
            db.add(
                Chunk(
                    document_id=document.id,
                    content=chunk_text,
                    embedding=embedding,
                    source_url=object_name,
                )
            )
        db.commit()

    return document


# ---------------------------------------------------------------------------
# List documents (admin only)
# ---------------------------------------------------------------------------
@router.get("/", response_model=DocumentListResponse)
def list_documents(
    skip: int = 0,
    limit: int = Query(default=20, le=100),
    q: str | None = Query(default=None, min_length=1),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    query = db.query(Document)
    if q:
        like_pattern = f"%{q}%"
        query = query.filter(Document.title.ilike(like_pattern))
    total = query.count()
    docs = query.order_by(Document.created_at.desc()).offset(skip).limit(limit).all()
    return DocumentListResponse(items=docs, total=total, skip=skip, limit=limit)


# ---------------------------------------------------------------------------
# Delete document (admin only, cascades to chunks)
# ---------------------------------------------------------------------------
@router.delete("/{document_id}")
def delete_document(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    # Chunks cascade via FK ondelete; explicitly delete for safety
    db.query(Chunk).filter(Chunk.document_id == document_id).delete()
    db.delete(doc)
    db.commit()
    return {"ok": True}

import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from sqlalchemy import text
from sqlalchemy.orm import Session

import re as _re

from . import auth, documents, rag, chunks, quiz, dashboard, admin_users
from .config import get_settings
from .database import Base, engine, init_db, get_session
from .models import User
from .utils.security import get_password_hash

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    Base.metadata.create_all(bind=engine)
    run_compat_migrations()
    with get_session() as db:
        ensure_admin(db)
        quiz.ensure_quiz_collections(db)
    yield
    # Shutdown (nothing needed)


app = FastAPI(title=settings.app_name, lifespan=lifespan, docs_url=None, redoc_url=None)


@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    request.state.request_id = request_id
    response: Response = await call_next(request)
    response.headers["X-Request-Id"] = request_id
    return response

# Parse CORS origins from comma-separated string
cors_origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(chunks.router)
app.include_router(rag.router)
app.include_router(quiz.router)
app.include_router(dashboard.router)
app.include_router(admin_users.router)


@app.get("/api/health")
def health():
    return {"ok": True}


def _validate_admin_password(pw: str) -> None:
    """Raise if the initial admin password is too weak."""
    if len(pw) < 8:
        raise ValueError("ADMIN_PASSWORD 长度不足 8 位")
    if not _re.search(r'[A-Za-z]', pw):
        raise ValueError("ADMIN_PASSWORD 需包含至少一个字母")
    if not _re.search(r'\d', pw):
        raise ValueError("ADMIN_PASSWORD 需包含至少一个数字")


def ensure_admin(db: Session):
    if settings.admin_email and settings.admin_password:
        existing = db.query(User).filter(User.email == settings.admin_email).first()
        if not existing:
            _validate_admin_password(settings.admin_password)
            admin = User(
                id=uuid.uuid4(),
                email=settings.admin_email,
                password_hash=get_password_hash(settings.admin_password),
                role="admin",
            )
            db.add(admin)
            db.commit()


def run_compat_migrations():
    if engine.dialect.name != "postgresql":
        return

    statements = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS year_or_period VARCHAR(64)",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_type VARCHAR(64)",
        "ALTER TABLE chunks ADD COLUMN IF NOT EXISTS source_url VARCHAR(255) NOT NULL DEFAULT ''",
        "ALTER TABLE chunks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "ALTER TABLE chunks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        """
        CREATE TABLE IF NOT EXISTS quiz_collections (
            id UUID PRIMARY KEY,
            title VARCHAR(255) NOT NULL UNIQUE,
            description TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_published BOOLEAN NOT NULL DEFAULT TRUE,
            created_by UUID REFERENCES users(id),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        "ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS collection_id UUID REFERENCES quiz_collections(id)",
        "ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS question_type VARCHAR(32) NOT NULL DEFAULT 'single_choice'",
        "ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS explanation TEXT",
        "ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS order_index INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "ALTER TABLE user_scores ADD COLUMN IF NOT EXISTS total_answers INTEGER NOT NULL DEFAULT 0",
        """
        CREATE TABLE IF NOT EXISTS answer_records (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id),
            question_id UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
            selected_index INTEGER NOT NULL,
            is_correct BOOLEAN NOT NULL DEFAULT FALSE,
            points_awarded INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_answer_record_user_question UNIQUE (user_id, question_id)
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_answer_records_user_id ON answer_records(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_answer_records_question_id ON answer_records(question_id)",
        "CREATE INDEX IF NOT EXISTS idx_quiz_questions_collection_id ON quiz_questions(collection_id)",
        """
        CREATE TABLE IF NOT EXISTS conversations (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS messages (
            id UUID PRIMARY KEY,
            conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            role VARCHAR(16) NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at ASC)",
        # HNSW index for fast vector similarity search
        "CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks USING hnsw (embedding vector_cosine_ops)",
    ]

    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))

import uuid
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from . import auth, documents, rag, chunks, quiz, dashboard
from .config import get_settings
from .database import Base, engine, init_db, get_session
from .models import User
from .utils.security import get_password_hash

settings = get_settings()

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(chunks.router)
app.include_router(rag.router)
app.include_router(quiz.router)
app.include_router(dashboard.router)


@app.get("/api/health")
def health():
    return {"ok": True}


def ensure_admin(db: Session):
    if settings.admin_email and settings.admin_password:
        existing = db.query(User).filter(User.email == settings.admin_email).first()
        if not existing:
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
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS year_or_period VARCHAR(64)",
        "ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_type VARCHAR(64)",
        "ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS question_type VARCHAR(32) NOT NULL DEFAULT 'single_choice'",
        "ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS explanation TEXT",
        "ALTER TABLE user_scores ADD COLUMN IF NOT EXISTS total_answers INTEGER NOT NULL DEFAULT 0",
        """
        CREATE TABLE IF NOT EXISTS answer_records (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id),
            question_id UUID NOT NULL REFERENCES quiz_questions(id),
            selected_index INTEGER NOT NULL,
            is_correct BOOLEAN NOT NULL DEFAULT FALSE,
            points_awarded INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_answer_record_user_question UNIQUE (user_id, question_id)
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_answer_records_user_id ON answer_records(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_answer_records_question_id ON answer_records(question_id)",
    ]

    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))


@app.on_event("startup")
def on_startup():
    init_db()
    Base.metadata.create_all(bind=engine)
    run_compat_migrations()
    with get_session() as db:
        ensure_admin(db)

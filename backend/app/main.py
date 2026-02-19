import uuid
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from . import auth, documents, rag, chunks, quiz
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


@app.on_event("startup")
def on_startup():
    init_db()
    Base.metadata.create_all(bind=engine)
    with get_session() as db:
        ensure_admin(db)

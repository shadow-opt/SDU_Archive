import os
import uuid

os.environ.setdefault("SECRET_KEY", "test-secret-key")

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app import rag
from backend.app.deps import get_current_user, get_db, rate_limiter
from backend.app.models import Conversation, Message, User


class _DummyDoc:
    title = "档案A"
    filename = "archive-a.pdf"
    year_or_period = "近现代"
    doc_type = "校史档案"


class _DummyChunk:
    source_url = "archive://a"
    content = "山东大学相关档案内容"
    document = _DummyDoc()


def _build_test_client(monkeypatch):
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

    User.__table__.create(bind=engine)
    Conversation.__table__.create(bind=engine)
    Message.__table__.create(bind=engine)

    db = SessionLocal()
    user1 = User(id=uuid.uuid4(), email="u1@example.com", password_hash="x", role="user", is_active=True)
    user2 = User(id=uuid.uuid4(), email="u2@example.com", password_hash="x", role="user", is_active=True)
    db.add_all([user1, user2])
    db.commit()

    prompts: list[str] = []

    async def fake_embed_text(_query: str):
        return [0.1] * 1536

    def fake_retrieve(_db, _embedding, _top_k):
        return [(_DummyChunk(), 0.1)]

    async def fake_generate_answer(query: str, _context: str):
        prompts.append(query)
        return f"answer-{len(prompts)}"

    monkeypatch.setattr(rag, "embed_text", fake_embed_text)
    monkeypatch.setattr(rag, "_retrieve", fake_retrieve)
    monkeypatch.setattr(rag, "generate_answer", fake_generate_answer)

    app = FastAPI()
    app.include_router(rag.router)

    def override_get_db():
        try:
            yield db
        finally:
            pass

    current_user_ref = {"value": user1}

    def override_get_current_user():
        return current_user_ref["value"]

    def override_rate_limiter():
        return True

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    app.dependency_overrides[rate_limiter] = override_rate_limiter

    client = TestClient(app)
    return client, db, user1, user2, prompts, current_user_ref


def test_query_without_conversation_creates_one(monkeypatch):
    client, db, _user1, _user2, _prompts, _user_ref = _build_test_client(monkeypatch)

    resp = client.post("/api/rag/query", json={"query": "Q1"})
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["conversation_id"]
    assert payload["answer"] == "answer-1"

    conv_id = uuid.UUID(payload["conversation_id"])
    messages = db.query(Message).filter(Message.conversation_id == conv_id).order_by(Message.created_at.asc()).all()
    assert len(messages) == 2
    assert messages[0].role == "user"
    assert messages[0].content == "Q1"
    assert messages[1].role == "assistant"


def test_query_with_conversation_uses_history(monkeypatch):
    client, _db, _user1, _user2, prompts, _user_ref = _build_test_client(monkeypatch)

    first = client.post("/api/rag/query", json={"query": "Q1"})
    conv_id = first.json()["conversation_id"]

    second = client.post(
        "/api/rag/query",
        json={"query": "Q2", "conversation_id": conv_id, "history_window": 4},
    )
    assert second.status_code == 200
    assert len(prompts) == 2
    assert "对话历史" in prompts[1]
    assert "用户: Q1" in prompts[1]
    assert "助手: answer-1" in prompts[1]
    assert "当前问题：Q2" in prompts[1]


def test_cross_user_conversation_forbidden(monkeypatch):
    client, _db, _user1, user2, _prompts, user_ref = _build_test_client(monkeypatch)

    first = client.post("/api/rag/query", json={"query": "Q1"})
    conv_id = first.json()["conversation_id"]

    user_ref["value"] = user2
    forbidden = client.post("/api/rag/query", json={"query": "Q2", "conversation_id": conv_id})
    assert forbidden.status_code == 403


def test_legacy_payload_still_works(monkeypatch):
    client, _db, _user1, _user2, _prompts, _user_ref = _build_test_client(monkeypatch)

    resp = client.post("/api/rag/query", json={"query": "legacy"})
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["conversation_id"]

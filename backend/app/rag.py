import json as _json
import logging
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import StatementError
from sqlalchemy.orm import Session, joinedload

from .deps import get_current_user, get_db, rate_limiter
from .models import Chunk, Conversation, Document, Message, User
from .schemas import RagQuery, RagResponse, RagCitation
from .utils.embedding import (
    AINotConfiguredError,
    embed_text,
    generate_answer,
    generate_answer_stream,
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
            RagCitation(
                source=chunk.source_url,
                snippet=snippet,
                document_title=title,
                filename=doc.filename if doc else None,
                year_or_period=doc.year_or_period if doc else None,
                doc_type=doc.doc_type if doc else None,
            )
        )
        context_parts.append(f"[来源{idx}] {chunk.content}")
    context = "\n\n".join(context_parts)
    return context, citations


def _get_or_create_conversation(db: Session, user: User, conversation_id):
    if conversation_id is not None:
        conversation = db.get(Conversation, conversation_id)
        if not conversation:
            raise HTTPException(status_code=404, detail="会话不存在")
        if conversation.user_id != user.id:
            raise HTTPException(status_code=403, detail="无权访问该会话")
        return conversation

    conversation = Conversation(user_id=user.id)
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


def _reject_guest_user(user: User) -> None:
    if user.role == "guest":
        raise HTTPException(status_code=403, detail="游客身份仅可用于互动答题")


def _load_recent_messages(db: Session, conversation_id, history_window: int) -> list[Message]:
    if history_window <= 0:
        return []
    limit = history_window * 2
    rows = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc(), Message.role.asc())
        .limit(limit)
        .all()
    )
    return list(reversed(rows))


def _compose_query_with_history(query: str, history: list[Message]) -> str:
    if not history:
        return query
    history_lines = []
    for item in history:
        role_name = "用户" if item.role == "user" else "助手"
        history_lines.append(f"{role_name}: {item.content}")
    history_text = "\n".join(history_lines)
    return f"对话历史：\n{history_text}\n\n当前问题：{query}"


def _persist_turn(db: Session, conversation: Conversation, user_query: str, assistant_answer: str) -> None:
    user_created_at = datetime.now(timezone.utc)
    assistant_created_at = user_created_at + timedelta(microseconds=1)
    db.add(
        Message(
            conversation_id=conversation.id,
            role="user",
            content=user_query,
            created_at=user_created_at,
        )
    )
    db.add(
        Message(
            conversation_id=conversation.id,
            role="assistant",
            content=assistant_answer,
            created_at=assistant_created_at,
        )
    )
    conversation.updated_at = assistant_created_at
    db.commit()


# ── Non-streaming endpoint ──────────────────────────────────────────────
@router.post("/query", response_model=RagResponse)
async def query_rag(
    payload: RagQuery,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _reject_guest_user(current_user)
    started = time.perf_counter()
    request_id = getattr(request.state, "request_id", "")
    conversation = _get_or_create_conversation(db, current_user, payload.conversation_id)
    history = _load_recent_messages(db, conversation.id, payload.history_window)
    prompt_query = _compose_query_with_history(payload.query, history)

    retrieve_ms = 0.0
    llm_ms = 0.0
    citations: list[RagCitation] = []
    degraded = False

    try:
        retrieve_start = time.perf_counter()
        query_embedding = await embed_text(payload.query)
        results = _retrieve(db, query_embedding, payload.top_k)
        retrieve_ms = (time.perf_counter() - retrieve_start) * 1000
    except (ValueError, StatementError) as exc:
        logger.exception("RAG retrieve failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="向量检索配置错误：请检查 EMBEDDING_MODEL 与 EMBEDDING_DIMENSION 是否一致",
        )

    if not results:
        answer_text = "暂无相关档案记载。"
        _persist_turn(db, conversation, payload.query, answer_text)
        total_ms = (time.perf_counter() - started) * 1000
        logger.info(
            "rag.query metrics=%s",
            _json.dumps(
                {
                    "request_id": request_id,
                    "user_id": str(current_user.id),
                    "conversation_id": str(conversation.id),
                    "top_k": payload.top_k,
                    "history_window": payload.history_window,
                    "retrieve_ms": round(retrieve_ms, 2),
                    "llm_ms": round(llm_ms, 2),
                    "total_ms": round(total_ms, 2),
                    "citations_count": 0,
                    "degraded": False,
                    "status": "ok",
                },
                ensure_ascii=False,
            ),
        )
        return RagResponse(answer=answer_text, citations=[], degraded=False, conversation_id=conversation.id)

    context, citations = _build_context_and_citations(results)

    try:
        llm_start = time.perf_counter()
        answer_text = await generate_answer(prompt_query, context)
        llm_ms = (time.perf_counter() - llm_start) * 1000
        _persist_turn(db, conversation, payload.query, answer_text)
        total_ms = (time.perf_counter() - started) * 1000
        logger.info(
            "rag.query metrics=%s",
            _json.dumps(
                {
                    "request_id": request_id,
                    "user_id": str(current_user.id),
                    "conversation_id": str(conversation.id),
                    "top_k": payload.top_k,
                    "history_window": payload.history_window,
                    "retrieve_ms": round(retrieve_ms, 2),
                    "llm_ms": round(llm_ms, 2),
                    "total_ms": round(total_ms, 2),
                    "citations_count": len(citations),
                    "degraded": False,
                    "status": "ok",
                },
                ensure_ascii=False,
            ),
        )
        return RagResponse(answer=answer_text, citations=citations, degraded=False, conversation_id=conversation.id)
    except AINotConfiguredError:
        # Graceful fallback – return raw context
        degraded = True
        answer_text = "AI 回答功能暂未开启，以下是检索到的相关档案片段：\n\n" + context
        _persist_turn(db, conversation, payload.query, answer_text)
        total_ms = (time.perf_counter() - started) * 1000
        logger.info(
            "rag.query metrics=%s",
            _json.dumps(
                {
                    "request_id": request_id,
                    "user_id": str(current_user.id),
                    "conversation_id": str(conversation.id),
                    "top_k": payload.top_k,
                    "history_window": payload.history_window,
                    "retrieve_ms": round(retrieve_ms, 2),
                    "llm_ms": round(llm_ms, 2),
                    "total_ms": round(total_ms, 2),
                    "citations_count": len(citations),
                    "degraded": degraded,
                    "status": "ok",
                },
                ensure_ascii=False,
            ),
        )
        return RagResponse(
            answer="AI 回答功能暂未开启，以下是检索到的相关档案片段：\n\n" + context,
            citations=citations,
            degraded=True,
            conversation_id=conversation.id,
        )


# ── SSE streaming endpoint ──────────────────────────────────────────────
@router.post("/stream")
async def query_rag_stream(
    payload: RagQuery,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _reject_guest_user(current_user)
    started = time.perf_counter()
    request_id = getattr(request.state, "request_id", "")
    conversation = _get_or_create_conversation(db, current_user, payload.conversation_id)
    user_id_str = str(current_user.id)
    conversation_id_str = str(conversation.id)
    history = _load_recent_messages(db, conversation.id, payload.history_window)
    prompt_query = _compose_query_with_history(payload.query, history)
    retrieve_ms = 0.0

    try:
        retrieve_start = time.perf_counter()
        query_embedding = await embed_text(payload.query)
        results = _retrieve(db, query_embedding, payload.top_k)
        retrieve_ms = (time.perf_counter() - retrieve_start) * 1000
    except (ValueError, StatementError):

        async def _dim_error():
            err = "向量检索配置错误：请检查 EMBEDDING_MODEL 与 EMBEDDING_DIMENSION 是否一致"
            try:
                _persist_turn(db, conversation, payload.query, err)
            except Exception:
                logger.exception("Persist failed in stream dim_error")
            yield f"data: {_json.dumps({'error': err, 'conversation_id': conversation_id_str, 'done': True}, ensure_ascii=False)}\n\n"

        return StreamingResponse(_dim_error(), media_type="text/event-stream")

    if not results:

        async def _empty():
            answer_text = "暂无相关档案记载。"
            try:
                _persist_turn(db, conversation, payload.query, answer_text)
                total_ms = (time.perf_counter() - started) * 1000
                logger.info(
                    "rag.stream metrics=%s",
                    _json.dumps(
                        {
                            "request_id": request_id,
                            "user_id": user_id_str,
                            "conversation_id": conversation_id_str,
                            "top_k": payload.top_k,
                            "history_window": payload.history_window,
                            "retrieve_ms": round(retrieve_ms, 2),
                            "llm_ms": 0,
                            "total_ms": round(total_ms, 2),
                            "citations_count": 0,
                            "degraded": False,
                            "status": "ok",
                        },
                        ensure_ascii=False,
                    ),
                )
            except Exception:
                logger.exception("Persist/log failed in stream empty")
            yield f"data: {_json.dumps({'citations': [], 'conversation_id': conversation_id_str, 'done': True, 'text': answer_text}, ensure_ascii=False)}\n\n"

        return StreamingResponse(_empty(), media_type="text/event-stream")

    context, citations = _build_context_and_citations(results)
    cit_dicts = [c.model_dump() for c in citations]

    async def _generate():
        # First event: send citations
        llm_start = time.perf_counter()
        answer_parts: list[str] = []
        degraded = False
        status = "ok"
        yield f"data: {_json.dumps({'citations': cit_dicts, 'conversation_id': conversation_id_str}, ensure_ascii=False)}\n\n"

        try:
            async for chunk in generate_answer_stream(prompt_query, context):
                answer_parts.append(chunk)
                yield f"data: {_json.dumps({'text': chunk}, ensure_ascii=False)}\n\n"
        except AINotConfiguredError:
            fallback = "AI 回答功能暂未开启，以下是检索到的相关档案片段：\n\n" + context
            answer_parts = [fallback]
            degraded = True
            yield f"data: {_json.dumps({'text': fallback, 'degraded': True}, ensure_ascii=False)}\n\n"
        except Exception:
            status = "error"
            logger.exception("Stream generation failed")
            answer_parts = ["生成回答时出错，请稍后重试"]
            yield f"data: {_json.dumps({'error': '生成回答时出错，请稍后重试'}, ensure_ascii=False)}\n\n"
        finally:
            llm_ms = (time.perf_counter() - llm_start) * 1000
            assistant_answer = "".join(answer_parts).strip() or "暂无相关档案记载。"
            try:
                _persist_turn(db, conversation, payload.query, assistant_answer)
                total_ms = (time.perf_counter() - started) * 1000
                logger.info(
                    "rag.stream metrics=%s",
                    _json.dumps(
                        {
                            "request_id": request_id,
                            "user_id": user_id_str,
                            "conversation_id": conversation_id_str,
                            "top_k": payload.top_k,
                            "history_window": payload.history_window,
                            "retrieve_ms": round(retrieve_ms, 2),
                            "llm_ms": round(llm_ms, 2),
                            "total_ms": round(total_ms, 2),
                            "citations_count": len(citations),
                            "degraded": degraded,
                            "status": status,
                        },
                        ensure_ascii=False,
                    ),
                )
            except Exception:
                logger.exception("Persist/log failed in stream finalize")
            yield f"data: {_json.dumps({'done': True}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

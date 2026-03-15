import csv
import uuid
from io import StringIO

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import ValidationError
from sqlalchemy import case, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .deps import get_current_user, get_db, rate_limiter, require_admin
from .models import AnswerRecord, QuizCollection, QuizQuestion, User
from .schemas import (
    AnswerHistoryItem,
    QuestionAdminOut,
    QuestionCreate,
    QuestionOut,
    QuestionSubmit,
    QuestionUpdate,
    QuizCollectionCreate,
    QuizCollectionOut,
    QuizCollectionUpdate,
    QuizImportResult,
    QuizImportRowIssue,
    QuizUserSummary,
    SubmissionResult,
)

router = APIRouter(prefix="/api/quiz", tags=["quiz"], dependencies=[Depends(rate_limiter)])

DEFAULT_COLLECTION_TITLE = "默认题库"


def _get_or_create_default_collection(db: Session) -> QuizCollection:
    collection = db.query(QuizCollection).filter(QuizCollection.title == DEFAULT_COLLECTION_TITLE).first()
    if collection:
        return collection
    collection = QuizCollection(title=DEFAULT_COLLECTION_TITLE, description="历史存量题目默认归档专题", sort_order=0, is_published=True)
    db.add(collection)
    db.flush()
    return collection


def ensure_quiz_collections(db: Session) -> None:
    existing_collection_count = db.query(func.count(QuizCollection.id)).scalar() or 0
    unassigned_questions = db.query(QuizQuestion).filter(QuizQuestion.collection_id.is_(None)).all()
    if not unassigned_questions and existing_collection_count > 0:
        if normalize_all_question_orders(db):
            db.commit()
        return
    default_collection = _get_or_create_default_collection(db)
    for index, question in enumerate(unassigned_questions):
        question.collection_id = default_collection.id
        if question.order_index == 0:
            question.order_index = index + 1
        db.add(question)
    changed = normalize_all_question_orders(db)
    if unassigned_questions or existing_collection_count == 0 or changed:
        db.commit()


def _commit_or_raise_conflict(db: Session, detail: str) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=detail) from exc


def _normalize_order_target(raw_order_index: int, upper_bound: int) -> int:
    if upper_bound <= 0:
        return 1
    return max(1, min(raw_order_index, upper_bound))


def _next_order_index(db: Session, collection_id: uuid.UUID) -> int:
    max_order = (
        db.query(func.max(QuizQuestion.order_index))
        .filter(QuizQuestion.collection_id == collection_id)
        .scalar()
    )
    return int(max_order or 0) + 1


def _shift_for_insert(db: Session, collection_id: uuid.UUID, order_index: int) -> None:
    affected_questions = (
        db.query(QuizQuestion)
        .filter(
            QuizQuestion.collection_id == collection_id,
            QuizQuestion.order_index >= order_index,
        )
        .order_by(QuizQuestion.order_index.desc(), QuizQuestion.id.desc())
        .all()
    )
    staged_updates: list[tuple[QuizQuestion, int]] = []
    for question in affected_questions:
        staged_updates.append((question, question.order_index + 1))
    for index, (question, _) in enumerate(staged_updates, start=1):
        question.order_index = -index
        db.add(question)
    if staged_updates:
        db.flush()
    for question, target_order in staged_updates:
        question.order_index = target_order
        db.add(question)


def _shift_after_delete(db: Session, collection_id: uuid.UUID, deleted_order_index: int) -> None:
    affected_questions = (
        db.query(QuizQuestion)
        .filter(
            QuizQuestion.collection_id == collection_id,
            QuizQuestion.order_index > deleted_order_index,
        )
        .order_by(QuizQuestion.order_index.asc(), QuizQuestion.id.asc())
        .all()
    )
    staged_updates: list[tuple[QuizQuestion, int]] = []
    for question in affected_questions:
        staged_updates.append((question, question.order_index - 1))
    for index, (question, _) in enumerate(staged_updates, start=1):
        question.order_index = -index
        db.add(question)
    if staged_updates:
        db.flush()
    for question, target_order in staged_updates:
        question.order_index = target_order
        db.add(question)


def _move_within_collection(
    db: Session,
    collection_id: uuid.UUID,
    question_id: uuid.UUID,
    current_order: int,
    target_order: int,
) -> None:
    if target_order == current_order:
        return
    if target_order < current_order:
        affected_questions = (
            db.query(QuizQuestion)
            .filter(
                QuizQuestion.collection_id == collection_id,
                QuizQuestion.id != question_id,
                QuizQuestion.order_index >= target_order,
                QuizQuestion.order_index < current_order,
            )
            .order_by(QuizQuestion.order_index.desc(), QuizQuestion.id.desc())
            .all()
        )
        staged_updates: list[tuple[QuizQuestion, int]] = []
        for question in affected_questions:
            staged_updates.append((question, question.order_index + 1))
        for index, (question, _) in enumerate(staged_updates, start=1):
            question.order_index = -index
            db.add(question)
        if staged_updates:
            db.flush()
        for question, next_order in staged_updates:
            question.order_index = next_order
            db.add(question)
        return
    affected_questions = (
        db.query(QuizQuestion)
        .filter(
            QuizQuestion.collection_id == collection_id,
            QuizQuestion.id != question_id,
            QuizQuestion.order_index > current_order,
            QuizQuestion.order_index <= target_order,
        )
        .order_by(QuizQuestion.order_index.asc(), QuizQuestion.id.asc())
        .all()
    )
    staged_updates: list[tuple[QuizQuestion, int]] = []
    for question in affected_questions:
        staged_updates.append((question, question.order_index - 1))
    for index, (question, _) in enumerate(staged_updates, start=1):
        question.order_index = -index
        db.add(question)
    if staged_updates:
        db.flush()
    for question, next_order in staged_updates:
        question.order_index = next_order
        db.add(question)


def _compact_collection_orders(db: Session, collection_id: uuid.UUID) -> bool:
    questions = (
        db.query(QuizQuestion)
        .filter(QuizQuestion.collection_id == collection_id)
        .order_by(QuizQuestion.order_index.asc(), QuizQuestion.created_at.asc(), QuizQuestion.id.asc())
        .all()
    )
    changed = False
    for index, question in enumerate(questions, start=1):
        if question.order_index != index:
            question.order_index = index
            db.add(question)
            changed = True
    return changed


def normalize_all_question_orders(db: Session) -> bool:
    collection_ids = [collection_id for (collection_id,) in db.query(QuizCollection.id).all()]
    changed = False
    for collection_id in collection_ids:
        if _compact_collection_orders(db, collection_id):
            changed = True
    return changed


def _get_collection_or_404(db: Session, collection_id: uuid.UUID, include_unpublished: bool = False) -> QuizCollection:
    query = db.query(QuizCollection).filter(QuizCollection.id == collection_id)
    if not include_unpublished:
        query = query.filter(QuizCollection.is_published.is_(True))
    collection = query.first()
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    return collection


def _build_question_out(question: QuizQuestion, answered: bool) -> QuestionOut:
    if question.collection_id is None:
        raise HTTPException(status_code=500, detail="Question missing collection")
    return QuestionOut(
        id=question.id,
        collection_id=question.collection_id,
        prompt=question.prompt,
        options=question.options,
        points=question.points,
        order_index=question.order_index,
        question_type="single_choice",
        answered=answered,
    )


def _option_text(options: list[str], index: int) -> str:
    if 0 <= index < len(options):
        return options[index]
    return ""


def _compute_record_result(record: AnswerRecord, question: QuizQuestion) -> tuple[bool, int]:
    is_correct = record.selected_index == question.correct_index
    points_awarded = question.points if is_correct else 0
    return is_correct, points_awarded


def _build_history_item(record: AnswerRecord, question: QuizQuestion) -> AnswerHistoryItem:
    is_correct, points_awarded = _compute_record_result(record, question)
    return AnswerHistoryItem(
        question_id=question.id,
        prompt=question.prompt,
        question_type="single_choice",
        selected_index=record.selected_index,
        selected_option=_option_text(question.options, record.selected_index),
        correct_index=question.correct_index,
        correct_option=_option_text(question.options, question.correct_index),
        is_correct=is_correct,
        points_awarded=points_awarded,
        explanation=question.explanation,
        answered_at=record.created_at,
    )


def _build_summary(db: Session, user_id: uuid.UUID, collection_id: uuid.UUID | None = None) -> QuizUserSummary:
    rows_query = (
        db.query(AnswerRecord, QuizQuestion)
        .join(QuizQuestion, QuizQuestion.id == AnswerRecord.question_id)
        .filter(AnswerRecord.user_id == user_id)
    )
    question_query = db.query(QuizQuestion)
    if collection_id is not None:
        rows_query = rows_query.filter(QuizQuestion.collection_id == collection_id)
        question_query = question_query.filter(QuizQuestion.collection_id == collection_id)

    rows = rows_query.order_by(AnswerRecord.created_at.desc()).all()
    answer_history = [_build_history_item(record, question) for record, question in rows]
    total_questions = question_query.count()
    return QuizUserSummary(
        collection_id=collection_id,
        total_points=sum(item.points_awarded for item in answer_history),
        total_answers=len(answer_history),
        total_questions=total_questions,
        answer_history=answer_history,
    )


def _build_collection_out(collection: QuizCollection, question_count: int, answered_count: int, total_points: int) -> QuizCollectionOut:
    return QuizCollectionOut(
        id=collection.id,
        title=collection.title,
        description=collection.description,
        sort_order=collection.sort_order,
        is_published=collection.is_published,
        question_count=question_count,
        answered_count=answered_count,
        total_points=total_points,
        created_at=collection.created_at,
        updated_at=collection.updated_at,
    )


@router.get("/collections", response_model=list[QuizCollectionOut])
def list_collections(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    ensure_quiz_collections(db)
    collections = (
        db.query(QuizCollection)
        .filter(QuizCollection.is_published.is_(True))
        .order_by(QuizCollection.sort_order.asc(), QuizCollection.created_at.asc())
        .all()
    )
    question_stats = {
        row.collection_id: int(row.question_count or 0)
        for row in (
            db.query(QuizQuestion.collection_id, func.count(QuizQuestion.id).label("question_count"))
            .group_by(QuizQuestion.collection_id)
            .all()
        )
    }
    answer_stats = {
        row.collection_id: {
            "answered_count": int(row.answered_count or 0),
            "total_points": int(row.total_points or 0),
        }
        for row in (
            db.query(
                QuizQuestion.collection_id.label("collection_id"),
                func.count(AnswerRecord.id).label("answered_count"),
                func.sum(case((AnswerRecord.selected_index == QuizQuestion.correct_index, QuizQuestion.points), else_=0)).label("total_points"),
            )
            .join(QuizQuestion, QuizQuestion.id == AnswerRecord.question_id)
            .filter(AnswerRecord.user_id == current_user.id)
            .group_by(QuizQuestion.collection_id)
            .all()
        )
    }
    return [
        _build_collection_out(
            collection,
            question_count=question_stats.get(collection.id, 0),
            answered_count=answer_stats.get(collection.id, {}).get("answered_count", 0),
            total_points=answer_stats.get(collection.id, {}).get("total_points", 0),
        )
        for collection in collections
    ]


@router.get("/collections/{collection_id}/questions", response_model=list[QuestionOut])
def list_questions_by_collection(
    collection_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_quiz_collections(db)
    _get_collection_or_404(db, collection_id)
    questions = (
        db.query(QuizQuestion)
        .filter(QuizQuestion.collection_id == collection_id)
        .order_by(QuizQuestion.order_index.asc(), QuizQuestion.created_at.asc())
        .all()
    )
    answered_ids = {
        row[0]
        for row in db.query(AnswerRecord.question_id)
        .join(QuizQuestion, QuizQuestion.id == AnswerRecord.question_id)
        .filter(AnswerRecord.user_id == current_user.id, QuizQuestion.collection_id == collection_id)
        .all()
    }
    return [_build_question_out(question, question.id in answered_ids) for question in questions]


@router.get("/collections/{collection_id}/summary", response_model=QuizUserSummary)
def get_collection_summary(
    collection_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_quiz_collections(db)
    _get_collection_or_404(db, collection_id)
    return _build_summary(db, current_user.id, collection_id)


@router.get("/questions", response_model=list[QuestionOut])
def list_questions(
    collection_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_quiz_collections(db)
    if collection_id is not None:
        return list_questions_by_collection(collection_id, db, current_user)

    questions = (
        db.query(QuizQuestion)
        .join(QuizCollection, QuizCollection.id == QuizQuestion.collection_id)
        .filter(QuizCollection.is_published.is_(True))
        .order_by(QuizCollection.sort_order.asc(), QuizQuestion.order_index.asc(), QuizQuestion.created_at.asc())
        .all()
    )
    answered_ids = {row[0] for row in db.query(AnswerRecord.question_id).filter(AnswerRecord.user_id == current_user.id).all()}
    return [_build_question_out(question, question.id in answered_ids) for question in questions]


@router.get("/me/summary", response_model=QuizUserSummary)
def get_quiz_summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    ensure_quiz_collections(db)
    return _build_summary(db, current_user.id)


@router.get("/collections/admin", response_model=list[QuizCollectionOut])
def list_collections_admin(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    ensure_quiz_collections(db)
    collections = db.query(QuizCollection).order_by(QuizCollection.sort_order.asc(), QuizCollection.created_at.asc()).all()
    question_stats = {
        row.collection_id: int(row.question_count or 0)
        for row in (
            db.query(QuizQuestion.collection_id, func.count(QuizQuestion.id).label("question_count"))
            .group_by(QuizQuestion.collection_id)
            .all()
        )
    }
    return [_build_collection_out(collection, question_stats.get(collection.id, 0), 0, 0) for collection in collections]


@router.post("/collections", response_model=QuizCollectionOut)
def create_collection(payload: QuizCollectionCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    collection = QuizCollection(
        title=payload.title,
        description=payload.description,
        sort_order=payload.sort_order,
        is_published=payload.is_published,
        created_by=admin.id,
    )
    db.add(collection)
    _commit_or_raise_conflict(db, "Collection title already exists")
    db.refresh(collection)
    return _build_collection_out(collection, 0, 0, 0)


@router.put("/collections/{collection_id}", response_model=QuizCollectionOut)
def update_collection(
    collection_id: uuid.UUID,
    payload: QuizCollectionUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    collection = _get_collection_or_404(db, collection_id, include_unpublished=True)
    collection.title = payload.title
    collection.description = payload.description
    collection.sort_order = payload.sort_order
    collection.is_published = payload.is_published
    db.add(collection)
    _commit_or_raise_conflict(db, "Collection title already exists")
    db.refresh(collection)
    question_count = db.query(func.count(QuizQuestion.id)).filter(QuizQuestion.collection_id == collection.id).scalar() or 0
    return _build_collection_out(collection, int(question_count), 0, 0)


@router.delete("/collections/{collection_id}")
def delete_collection(collection_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    collection = _get_collection_or_404(db, collection_id, include_unpublished=True)
    if collection.title == DEFAULT_COLLECTION_TITLE:
        raise HTTPException(status_code=400, detail="Default collection cannot be deleted")
    question_count = db.query(func.count(QuizQuestion.id)).filter(QuizQuestion.collection_id == collection.id).scalar() or 0
    if question_count:
        raise HTTPException(status_code=400, detail="Collection still contains questions")
    db.delete(collection)
    db.commit()
    return {"ok": True}


@router.post("/questions", response_model=QuestionAdminOut)
def create_question(payload: QuestionCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    ensure_quiz_collections(db)
    collection = (
        _get_collection_or_404(db, payload.collection_id, include_unpublished=True)
        if payload.collection_id
        else _get_or_create_default_collection(db)
    )
    target_order = payload.order_index
    if payload.collection_id is None:
        target_order = _next_order_index(db, collection.id)
    else:
        question_count = db.query(func.count(QuizQuestion.id)).filter(QuizQuestion.collection_id == collection.id).scalar() or 0
        target_order = _normalize_order_target(payload.order_index, int(question_count) + 1)
    _shift_for_insert(db, collection.id, target_order)

    question = QuizQuestion(
        collection_id=collection.id,
        prompt=payload.prompt,
        options=payload.options,
        correct_index=payload.correct_index,
        question_type="single_choice",
        explanation=payload.explanation,
        points=payload.points,
        order_index=target_order,
        created_by=admin.id,
    )
    db.add(question)
    _commit_or_raise_conflict(db, "Question order conflict")
    db.refresh(question)
    return question


@router.get("/questions/admin", response_model=list[QuestionAdminOut])
def list_questions_admin(
    collection_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    ensure_quiz_collections(db)
    query = db.query(QuizQuestion)
    if collection_id is not None:
        query = query.filter(QuizQuestion.collection_id == collection_id)
    return query.order_by(QuizQuestion.order_index.asc(), QuizQuestion.created_at.asc()).all()


@router.put("/questions/{question_id}", response_model=QuestionAdminOut)
def update_question(
    question_id: uuid.UUID,
    payload: QuestionUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    ensure_quiz_collections(db)
    question = db.get(QuizQuestion, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    _get_collection_or_404(db, payload.collection_id, include_unpublished=True)

    source_collection_id = question.collection_id or payload.collection_id
    source_order = question.order_index
    target_collection_id = payload.collection_id

    if source_collection_id == target_collection_id:
        question_count = db.query(func.count(QuizQuestion.id)).filter(QuizQuestion.collection_id == target_collection_id).scalar() or 0
        target_order = _normalize_order_target(payload.order_index, int(question_count))
        if target_order != source_order:
            question.order_index = 0
            db.add(question)
            db.flush()
        _move_within_collection(db, target_collection_id, question.id, source_order, target_order)
    else:
        _shift_after_delete(db, source_collection_id, source_order)
        target_count = db.query(func.count(QuizQuestion.id)).filter(QuizQuestion.collection_id == target_collection_id).scalar() or 0
        target_order = _normalize_order_target(payload.order_index, int(target_count) + 1)
        _shift_for_insert(db, target_collection_id, target_order)

    question.collection_id = payload.collection_id
    question.prompt = payload.prompt
    question.options = payload.options
    question.correct_index = payload.correct_index
    question.points = payload.points
    question.order_index = target_order
    question.question_type = "single_choice"
    question.explanation = payload.explanation
    db.add(question)
    _commit_or_raise_conflict(db, "Question order conflict")
    db.refresh(question)
    return question


@router.delete("/questions/{question_id}")
def delete_question(question_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    question = db.get(QuizQuestion, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    collection_id = question.collection_id
    order_index = question.order_index
    db.query(AnswerRecord).filter(AnswerRecord.question_id == question_id).delete()
    db.delete(question)
    if collection_id is not None:
        _shift_after_delete(db, collection_id, order_index)
    db.commit()
    return {"ok": True}


@router.post("/questions/import-csv", response_model=QuizImportResult)
async def import_questions_csv(
    file: UploadFile = File(...),
    collection_id: uuid.UUID | None = Form(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    ensure_quiz_collections(db)
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="仅支持 CSV 文件")
    raw = await file.read()
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="CSV 文件过大（最大 5 MB）")
    try:
        content = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="CSV 编码必须为 UTF-8") from exc
    target_collection = _get_collection_or_404(db, collection_id, include_unpublished=True) if collection_id else _get_or_create_default_collection(db)
    reader = csv.DictReader(StringIO(content))
    required_headers = {"prompt", "options", "correct_index", "points"}
    if not required_headers.issubset(set(reader.fieldnames or [])):
        raise HTTPException(status_code=400, detail="CSV 列缺失，需包含 prompt, options, correct_index, points")

    issues: list[QuizImportRowIssue] = []
    created = 0
    total_rows = 0
    next_order = _next_order_index(db, target_collection.id)
    for row_number, row in enumerate(reader, start=2):
        total_rows += 1
        prompt = (row.get("prompt") or "").strip()
        question_type = (row.get("question_type") or "single_choice").strip() or "single_choice"
        if not any((value or "").strip() for value in row.values()):
            issues.append(QuizImportRowIssue(row_number=row_number, prompt=None, error="空行或无有效内容"))
            continue
        if question_type != "single_choice":
            issues.append(QuizImportRowIssue(row_number=row_number, prompt=prompt or None, error="仅支持 single_choice 题型"))
            continue
        try:
            raw_order_index = (row.get("order_index") or "").strip()
            parsed_order_index = int(raw_order_index) if raw_order_index else next_order
            payload = QuestionCreate(
                collection_id=target_collection.id,
                prompt=prompt,
                options=[opt.strip() for opt in (row.get("options") or "").split("|") if opt.strip()],
                correct_index=int(row.get("correct_index") or 0),
                points=int(row.get("points") or 1),
                question_type="single_choice",
                explanation=(row.get("explanation") or None),
                order_index=parsed_order_index,
            )
        except ValidationError as exc:
            issues.append(
                QuizImportRowIssue(
                    row_number=row_number,
                    prompt=prompt or None,
                    error="；".join(err.get("msg", "字段校验失败") for err in exc.errors()),
                )
            )
            continue
        except ValueError as exc:
            issues.append(QuizImportRowIssue(row_number=row_number, prompt=prompt or None, error=str(exc)))
            continue
        target_order = _normalize_order_target(payload.order_index, next_order)
        _shift_for_insert(db, target_collection.id, target_order)
        db.add(
            QuizQuestion(
                collection_id=target_collection.id,
                prompt=payload.prompt,
                options=payload.options,
                correct_index=payload.correct_index,
                points=payload.points,
                question_type="single_choice",
                explanation=payload.explanation,
                order_index=target_order,
            )
        )
        created += 1
        next_order += 1
    _commit_or_raise_conflict(db, "CSV import conflicts with question ordering")
    return QuizImportResult(
        collection_id=target_collection.id,
        collection_title=target_collection.title,
        total_rows=total_rows,
        created=created,
        skipped=len(issues),
        issues=issues,
    )


@router.post("/questions/{question_id}/submit", response_model=SubmissionResult)
def submit_answer(
    question_id: uuid.UUID,
    payload: QuestionSubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_quiz_collections(db)
    question = db.get(QuizQuestion, question_id)
    if not question or question.collection_id is None:
        raise HTTPException(status_code=404, detail="Question not found")
    collection = _get_collection_or_404(db, question.collection_id)
    if payload.answer_index < 0 or payload.answer_index >= len(question.options):
        raise HTTPException(status_code=400, detail="Invalid answer index")
    existing = db.query(AnswerRecord).filter(
        AnswerRecord.user_id == current_user.id,
        AnswerRecord.question_id == question_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already answered")
    is_correct = payload.answer_index == question.correct_index
    awarded = question.points if is_correct else 0
    db.add(
        AnswerRecord(
            user_id=current_user.id,
            question_id=question_id,
            selected_index=payload.answer_index,
            is_correct=is_correct,
            points_awarded=awarded,
        )
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Already answered") from exc

    summary = _build_summary(db, current_user.id, collection.id)
    return SubmissionResult(
        question_id=question.id,
        collection_id=collection.id,
        selected_index=payload.answer_index,
        selected_option=_option_text(question.options, payload.answer_index),
        correct=is_correct,
        awarded=awarded,
        total_points=summary.total_points,
        total_answers=summary.total_answers,
        correct_index=question.correct_index,
        correct_option=_option_text(question.options, question.correct_index),
        explanation=question.explanation,
    )

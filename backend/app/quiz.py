import uuid
import csv
from io import StringIO

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select, update as sa_update
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from .deps import get_current_user, get_db, rate_limiter, require_admin
from .models import AnswerRecord, QuizQuestion, User, UserScore
from .schemas import QuestionAdminOut, QuestionCreate, QuestionOut, QuestionSubmit, QuestionUpdate, SubmissionResult

router = APIRouter(prefix="/api/quiz", tags=["quiz"], dependencies=[Depends(rate_limiter)])


@router.get("/questions", response_model=list[QuestionOut])
def list_questions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    questions = db.query(QuizQuestion).order_by(QuizQuestion.created_at.desc()).all()
    answered_ids = set(
        row[0] for row in db.query(AnswerRecord.question_id)
        .filter(AnswerRecord.user_id == current_user.id)
        .all()
    )
    return [
        QuestionOut(
            id=q.id,
            prompt=q.prompt,
            options=q.options,
            points=q.points,
            answered=q.id in answered_ids,
        )
        for q in questions
    ]


@router.post("/questions", response_model=QuestionOut)
def create_question(payload: QuestionCreate, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    if payload.correct_index < 0 or payload.correct_index >= len(payload.options):
        raise HTTPException(status_code=400, detail="Invalid correct_index")
    q = QuizQuestion(
        prompt=payload.prompt,
        options=payload.options,
        correct_index=payload.correct_index,
        question_type=payload.question_type,
        explanation=payload.explanation,
        points=payload.points,
    )
    db.add(q)
    db.commit()
    db.refresh(q)
    return q


@router.get("/questions/admin", response_model=list[QuestionAdminOut])
def list_questions_admin(db: Session = Depends(get_db), _: str = Depends(require_admin)):
    return db.query(QuizQuestion).order_by(QuizQuestion.created_at.desc()).all()


@router.put("/questions/{question_id}", response_model=QuestionAdminOut)
def update_question(
    question_id: uuid.UUID,
    payload: QuestionUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
):
    if payload.correct_index < 0 or payload.correct_index >= len(payload.options):
        raise HTTPException(status_code=400, detail="Invalid correct_index")
    question = db.get(QuizQuestion, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    question.prompt = payload.prompt
    question.options = payload.options
    question.correct_index = payload.correct_index
    question.points = payload.points
    question.question_type = payload.question_type
    question.explanation = payload.explanation
    db.add(question)
    db.commit()
    db.refresh(question)
    return question


@router.delete("/questions/{question_id}")
def delete_question(question_id: uuid.UUID, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    question = db.get(QuizQuestion, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    # Answers cascade via FK ondelete; explicitly delete for safety
    db.query(AnswerRecord).filter(AnswerRecord.question_id == question_id).delete()
    db.delete(question)
    db.commit()
    return {"ok": True}


@router.post("/questions/import-csv")
async def import_questions_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: str = Depends(require_admin),
):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="仅支持 CSV 文件")
    raw = await file.read()
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="CSV 文件过大（最大 5 MB）")
    content = raw.decode("utf-8")
    reader = csv.DictReader(StringIO(content))
    required_headers = {"prompt", "options", "correct_index", "points"}
    if not required_headers.issubset(set(reader.fieldnames or [])):
        raise HTTPException(status_code=400, detail="CSV 列缺失，需包含 prompt, options, correct_index, points")

    created = 0
    for row in reader:
        options = [opt.strip() for opt in (row.get("options") or "").split("|") if opt.strip()]
        if len(options) < 2:
            continue
        try:
            correct_index = int(row.get("correct_index") or 0)
            points = int(row.get("points") or 1)
        except ValueError:
            continue
        if correct_index < 0 or correct_index >= len(options):
            continue
        db.add(
            QuizQuestion(
                prompt=(row.get("prompt") or "").strip(),
                options=options,
                correct_index=correct_index,
                points=max(points, 1),
                question_type=(row.get("question_type") or "single_choice").strip() or "single_choice",
                explanation=(row.get("explanation") or "").strip() or None,
            )
        )
        created += 1
    db.commit()
    return {"created": created}


@router.post("/questions/{question_id}/submit", response_model=SubmissionResult)
def submit_answer(
    question_id: uuid.UUID,
    payload: QuestionSubmit,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    question = db.get(QuizQuestion, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    if payload.answer_index < 0 or payload.answer_index >= len(question.options):
        raise HTTPException(status_code=400, detail="Invalid answer index")
    existing = db.query(AnswerRecord).filter(
        AnswerRecord.user_id == current_user.id, AnswerRecord.question_id == question_id
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

    # Ensure UserScore row exists
    score = db.get(UserScore, current_user.id)
    if not score:
        score = UserScore(user_id=current_user.id, total_points=0, total_answers=0)
        db.add(score)
        db.flush()  # persist before atomic update

    # Atomic SQL update to avoid read-then-write race condition
    db.execute(
        sa_update(UserScore)
        .where(UserScore.user_id == current_user.id)
        .values(
            total_points=UserScore.total_points + awarded,
            total_answers=UserScore.total_answers + 1,
        )
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Already answered")

    score = db.get(UserScore, current_user.id)

    return SubmissionResult(
        correct=is_correct,
        awarded=awarded,
        total_points=score.total_points if score else awarded,
        total_answers=score.total_answers if score else 1,
        explanation=question.explanation
    )

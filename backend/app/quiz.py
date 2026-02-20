import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .deps import get_current_user, get_db, rate_limiter, require_admin
from .models import QuizQuestion, QuizSubmission, UserScore
from .schemas import QuestionCreate, QuestionOut, QuestionSubmit, SubmissionResult

router = APIRouter(prefix="/api/quiz", tags=["quiz"], dependencies=[Depends(rate_limiter)])


@router.get("/questions", response_model=list[QuestionOut])
def list_questions(db: Session = Depends(get_db), _: str = Depends(get_current_user)):
    return db.query(QuizQuestion).order_by(QuizQuestion.created_at.desc()).all()


@router.post("/questions", response_model=QuestionOut)
def create_question(payload: QuestionCreate, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    if payload.correct_index < 0 or payload.correct_index >= len(payload.options):
        raise HTTPException(status_code=400, detail="Invalid correct_index")
    q = QuizQuestion(
        prompt=payload.prompt,
        options=payload.options,
        correct_index=payload.correct_index,
        points=payload.points,
    )
    db.add(q)
    db.commit()
    db.refresh(q)
    return q


@router.delete("/questions/{question_id}")
def delete_question(question_id: uuid.UUID, db: Session = Depends(get_db), _: str = Depends(require_admin)):
    question = db.get(QuizQuestion, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    db.delete(question)
    db.commit()
    return {"ok": True}


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
    existing = db.query(QuizSubmission).filter(
        QuizSubmission.user_id == current_user.id, QuizSubmission.question_id == question_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already answered")
    is_correct = payload.answer_index == question.correct_index
    awarded = question.points if is_correct else 0
    submission = QuizSubmission(
        user_id=current_user.id,
        question_id=question_id,
        is_correct=is_correct,
        points_awarded=awarded,
    )
    db.add(submission)

    score = db.get(UserScore, current_user.id)
    if not score:
        score = UserScore(user_id=current_user.id, total_points=0)
        db.add(score)
    score.total_points += awarded
    db.commit()
    db.refresh(score)

    return SubmissionResult(correct=is_correct, awarded=awarded, total_points=score.total_points)

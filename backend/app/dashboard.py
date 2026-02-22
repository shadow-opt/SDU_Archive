from datetime import datetime, time, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from .deps import get_db, rate_limiter, require_admin
from .models import AnswerRecord, QuizQuestion, User, UserScore
from .schemas import DashboardKpi, DashboardSummary, TopUserItem, WrongQuestionItem

router = APIRouter(prefix="/api/admin/dashboard", tags=["admin-dashboard"], dependencies=[Depends(rate_limiter)])


@router.get("", response_model=DashboardSummary)
def get_dashboard_summary(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    total_users = db.query(func.count(User.id)).scalar() or 0
    total_answers = db.query(func.count(AnswerRecord.id)).scalar() or 0

    average_accuracy_raw = db.query(
        func.avg(case((AnswerRecord.is_correct.is_(True), 1.0), else_=0.0))
    ).scalar()
    average_accuracy = round(float(average_accuracy_raw or 0) * 100, 2)

    today_start = datetime.combine(datetime.now(timezone.utc).date(), time.min, tzinfo=timezone.utc)
    today_points = db.query(func.sum(AnswerRecord.points_awarded)).filter(AnswerRecord.created_at >= today_start).scalar() or 0

    wrong_rows = (
        db.query(
            QuizQuestion.id,
            QuizQuestion.prompt,
            func.sum(case((AnswerRecord.is_correct.is_(False), 1), else_=0)).label("wrong_count"),
            func.count(AnswerRecord.id).label("attempt_count"),
            func.avg(case((AnswerRecord.is_correct.is_(True), 1.0), else_=0.0)).label("accuracy"),
        )
        .join(AnswerRecord, AnswerRecord.question_id == QuizQuestion.id)
        .group_by(QuizQuestion.id, QuizQuestion.prompt)
        .order_by(func.sum(case((AnswerRecord.is_correct.is_(False), 1), else_=0)).desc())
        .limit(5)
        .all()
    )

    wrong_questions = [
        WrongQuestionItem(
            question_id=row.id,
            prompt=row.prompt,
            wrong_count=int(row.wrong_count or 0),
            accuracy_rate=round(float((row.accuracy or 0) * 100), 2),
        )
        for row in wrong_rows
    ]

    top_rows = (
        db.query(User.id, User.email, UserScore.total_points, UserScore.total_answers)
        .join(UserScore, UserScore.user_id == User.id)
        .order_by(UserScore.total_points.desc(), UserScore.total_answers.desc())
        .limit(10)
        .all()
    )

    top_users = [
        TopUserItem(
            user_id=row.id,
            email=row.email,
            total_points=int(row.total_points or 0),
            total_answers=int(row.total_answers or 0),
        )
        for row in top_rows
    ]

    return DashboardSummary(
        kpi=DashboardKpi(
            total_users=int(total_users),
            total_answers=int(total_answers),
            average_accuracy=average_accuracy,
            today_points=int(today_points),
        ),
        wrong_questions=wrong_questions,
        top_users=top_users,
    )

import uuid
import csv
from datetime import datetime, time, timedelta, timezone
from io import StringIO
from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from .deps import get_db, rate_limiter, require_admin
from .models import AnswerRecord, QuizCollection, QuizQuestion, User
from .schemas import (
    DashboardKpi,
    DashboardSummary,
    QuizCollectionDashboard,
    QuizCollectionLeaderboardItem,
    QuizCollectionSegmentItem,
    QuizCollectionStatsItem,
    QuizCollectionTrendItem,
    QuizCollectionWrongQuestionItem,
    TopUserItem,
    WrongQuestionItem,
)

router = APIRouter(prefix="/api/admin/dashboard", tags=["admin-dashboard"], dependencies=[Depends(rate_limiter)])
UserSegment = Literal["all", "guest", "registered"]
ExportKind = Literal["collections", "wrong_questions", "leaderboard"]


def _correct_expr():
    return case((AnswerRecord.selected_index == QuizQuestion.correct_index, 1.0), else_=0.0)


def _points_expr():
    return case((AnswerRecord.selected_index == QuizQuestion.correct_index, QuizQuestion.points), else_=0)


def _apply_range_filter(query, days: int | None):
    if days is None:
        return query
    since = datetime.now(timezone.utc) - timedelta(days=days)
    return query.filter(AnswerRecord.created_at >= since)


def _apply_collection_filter(query, collection_id: uuid.UUID | None):
    if collection_id is None:
        return query
    return query.filter(QuizQuestion.collection_id == collection_id)


def _apply_user_segment_filter(query, user_segment: UserSegment):
    if user_segment == "guest":
        return query.filter(User.role == "guest")
    if user_segment == "registered":
        return query.filter(User.role != "guest")
    return query


def _display_user(email: str, role: str) -> str:
    return "游客用户" if role == "guest" else email


def _build_collection_dashboard_payload(
    db: Session,
    collection_id: uuid.UUID | None,
    days: int | None,
    user_segment: UserSegment,
    leaderboard_limit: int,
) -> QuizCollectionDashboard:
    correct_expr = _correct_expr()
    points_expr = _points_expr()

    collections_query = db.query(QuizCollection)
    if collection_id is not None:
        collections_query = collections_query.filter(QuizCollection.id == collection_id)
    collections = collections_query.order_by(QuizCollection.sort_order.asc(), QuizCollection.created_at.asc()).all()

    question_count_query = db.query(
        QuizQuestion.collection_id,
        func.count(QuizQuestion.id).label("question_count"),
    ).group_by(QuizQuestion.collection_id)
    if collection_id is not None:
        question_count_query = question_count_query.filter(QuizQuestion.collection_id == collection_id)
    question_counts = {row.collection_id: int(row.question_count or 0) for row in question_count_query.all()}

    user_progress_query = (
        db.query(
            QuizQuestion.collection_id.label("collection_id"),
            AnswerRecord.user_id.label("user_id"),
            func.count(AnswerRecord.id).label("answered_count"),
            func.sum(points_expr).label("points_awarded"),
            func.sum(case((AnswerRecord.selected_index == QuizQuestion.correct_index, 1), else_=0)).label("correct_count"),
        )
        .join(QuizQuestion, QuizQuestion.id == AnswerRecord.question_id)
        .join(User, User.id == AnswerRecord.user_id)
    )
    user_progress_query = _apply_range_filter(user_progress_query, days)
    user_progress_query = _apply_collection_filter(user_progress_query, collection_id)
    user_progress_query = _apply_user_segment_filter(user_progress_query, user_segment)
    user_progress_rows = user_progress_query.group_by(QuizQuestion.collection_id, AnswerRecord.user_id).all()

    stats_map: dict[uuid.UUID, dict[str, float | int]] = {
        collection.id: {
            "participant_count": 0,
            "completed_user_count": 0,
            "total_answers": 0,
            "total_points_awarded": 0,
            "total_correct_answers": 0,
        }
        for collection in collections
    }

    for row in user_progress_rows:
        if row.collection_id is None or row.collection_id not in stats_map:
            continue
        question_count = question_counts.get(row.collection_id, 0)
        current = stats_map[row.collection_id]
        answered_count = int(row.answered_count or 0)
        points_awarded = int(row.points_awarded or 0)
        correct_count = int(row.correct_count or 0)
        current["participant_count"] = int(current["participant_count"]) + 1
        current["total_answers"] = int(current["total_answers"]) + answered_count
        current["total_points_awarded"] = int(current["total_points_awarded"]) + points_awarded
        current["total_correct_answers"] = int(current["total_correct_answers"]) + correct_count
        if question_count > 0 and answered_count >= question_count:
            current["completed_user_count"] = int(current["completed_user_count"]) + 1

    collection_stats = []
    for collection in collections:
        current = stats_map.get(
            collection.id,
            {"participant_count": 0, "completed_user_count": 0, "total_answers": 0, "total_points_awarded": 0, "total_correct_answers": 0},
        )
        participant_count = int(current["participant_count"])
        completed_user_count = int(current["completed_user_count"])
        total_answers = int(current["total_answers"])
        total_points_awarded = int(current["total_points_awarded"])
        total_correct_answers = int(current["total_correct_answers"])
        completion_rate = round((completed_user_count / participant_count) * 100, 2) if participant_count else 0.0
        average_score = round(total_points_awarded / participant_count, 2) if participant_count else 0.0
        average_accuracy = round((total_correct_answers / total_answers) * 100, 2) if total_answers else 0.0
        collection_stats.append(
            QuizCollectionStatsItem(
                collection_id=collection.id,
                title=collection.title,
                is_published=collection.is_published,
                question_count=question_counts.get(collection.id, 0),
                participant_count=participant_count,
                completed_user_count=completed_user_count,
                completion_rate=completion_rate,
                total_answers=total_answers,
                total_points_awarded=total_points_awarded,
                average_score=average_score,
                average_accuracy=average_accuracy,
            )
        )

    wrong_query = (
        db.query(
            QuizQuestion.id.label("question_id"),
            QuizQuestion.collection_id.label("collection_id"),
            QuizCollection.title.label("collection_title"),
            QuizQuestion.prompt.label("prompt"),
            func.sum(case((AnswerRecord.selected_index != QuizQuestion.correct_index, 1), else_=0)).label("wrong_count"),
            func.count(AnswerRecord.id).label("attempt_count"),
            func.avg(correct_expr).label("accuracy"),
        )
        .join(AnswerRecord, AnswerRecord.question_id == QuizQuestion.id)
        .join(User, User.id == AnswerRecord.user_id)
        .join(QuizCollection, QuizCollection.id == QuizQuestion.collection_id)
    )
    wrong_query = _apply_range_filter(wrong_query, days)
    wrong_query = _apply_collection_filter(wrong_query, collection_id)
    wrong_query = _apply_user_segment_filter(wrong_query, user_segment)
    wrong_rows = wrong_query.group_by(
        QuizQuestion.id,
        QuizQuestion.collection_id,
        QuizCollection.title,
        QuizQuestion.prompt,
    ).order_by(
        func.sum(case((AnswerRecord.selected_index != QuizQuestion.correct_index, 1), else_=0)).desc(),
        func.count(AnswerRecord.id).desc(),
    ).limit(10).all()

    wrong_questions = [
        QuizCollectionWrongQuestionItem(
            question_id=row.question_id,
            collection_id=row.collection_id,
            collection_title=row.collection_title,
            prompt=row.prompt,
            wrong_count=int(row.wrong_count or 0),
            attempt_count=int(row.attempt_count or 0),
            accuracy_rate=round(float((row.accuracy or 0) * 100), 2),
        )
        for row in wrong_rows
        if row.collection_id is not None
    ]

    leaderboard_query = (
        db.query(
            User.id.label("user_id"),
            User.email.label("email"),
            User.role.label("role"),
            func.coalesce(func.sum(points_expr), 0).label("total_points"),
            func.count(AnswerRecord.id).label("total_answers"),
            func.avg(correct_expr).label("accuracy"),
        )
        .join(AnswerRecord, AnswerRecord.user_id == User.id)
        .join(QuizQuestion, QuizQuestion.id == AnswerRecord.question_id)
    )
    leaderboard_query = _apply_range_filter(leaderboard_query, days)
    leaderboard_query = _apply_collection_filter(leaderboard_query, collection_id)
    leaderboard_query = _apply_user_segment_filter(leaderboard_query, user_segment)
    leaderboard_rows = leaderboard_query.group_by(User.id, User.email, User.role).order_by(
        func.coalesce(func.sum(points_expr), 0).desc(),
        func.count(AnswerRecord.id).desc(),
    ).limit(leaderboard_limit).all()

    leaderboard = [
        QuizCollectionLeaderboardItem(
            user_id=row.user_id,
            email=row.email,
            role=row.role,
            total_points=int(row.total_points or 0),
            total_answers=int(row.total_answers or 0),
            accuracy_rate=round(float((row.accuracy or 0) * 100), 2),
        )
        for row in leaderboard_rows
    ]

    trend_query = (
        db.query(
            func.date(AnswerRecord.created_at).label("answer_date"),
            AnswerRecord.user_id.label("user_id"),
            User.role.label("role"),
            func.count(AnswerRecord.id).label("answer_count"),
            func.sum(points_expr).label("points_awarded"),
            func.sum(case((AnswerRecord.selected_index == QuizQuestion.correct_index, 1), else_=0)).label("correct_count"),
        )
        .join(QuizQuestion, QuizQuestion.id == AnswerRecord.question_id)
        .join(User, User.id == AnswerRecord.user_id)
    )
    trend_query = _apply_range_filter(trend_query, days)
    trend_query = _apply_collection_filter(trend_query, collection_id)
    trend_query = _apply_user_segment_filter(trend_query, user_segment)
    trend_rows = trend_query.group_by(func.date(AnswerRecord.created_at), AnswerRecord.user_id, User.role).all()

    trend_map: dict[str, dict[str, int | set[uuid.UUID]]] = {}
    for row in trend_rows:
        date_key = str(row.answer_date)
        current = trend_map.setdefault(
            date_key,
            {
                "participants": set(),
                "total_answers": 0,
                "total_points_awarded": 0,
                "correct_count": 0,
                "guest_answers": 0,
                "registered_answers": 0,
            },
        )
        participants = current["participants"]
        if isinstance(participants, set):
            participants.add(row.user_id)
        answer_count = int(row.answer_count or 0)
        current["total_answers"] = int(current["total_answers"]) + answer_count
        current["total_points_awarded"] = int(current["total_points_awarded"]) + int(row.points_awarded or 0)
        current["correct_count"] = int(current["correct_count"]) + int(row.correct_count or 0)
        if row.role == "guest":
            current["guest_answers"] = int(current["guest_answers"]) + answer_count
        else:
            current["registered_answers"] = int(current["registered_answers"]) + answer_count

    daily_trend = []
    for date_key in sorted(trend_map):
        current = trend_map[date_key]
        total_answers = int(current["total_answers"])
        correct_count = int(current["correct_count"])
        participants = current["participants"]
        daily_trend.append(
            QuizCollectionTrendItem(
                date=date_key,
                participant_count=len(participants) if isinstance(participants, set) else 0,
                total_answers=total_answers,
                total_points_awarded=int(current["total_points_awarded"]),
                accuracy_rate=round((correct_count / total_answers) * 100, 2) if total_answers else 0.0,
                guest_answers=int(current["guest_answers"]),
                registered_answers=int(current["registered_answers"]),
            )
        )

    segment_query = (
        db.query(
            User.role.label("role"),
            AnswerRecord.user_id.label("user_id"),
            func.count(AnswerRecord.id).label("answer_count"),
            func.sum(points_expr).label("points_awarded"),
            func.sum(case((AnswerRecord.selected_index == QuizQuestion.correct_index, 1), else_=0)).label("correct_count"),
        )
        .join(AnswerRecord, AnswerRecord.user_id == User.id)
        .join(QuizQuestion, QuizQuestion.id == AnswerRecord.question_id)
    )
    segment_query = _apply_range_filter(segment_query, days)
    segment_query = _apply_collection_filter(segment_query, collection_id)
    segment_query = _apply_user_segment_filter(segment_query, user_segment)
    segment_rows = segment_query.group_by(User.role, AnswerRecord.user_id).all()
    segment_map = {
        "guest": {"participants": set(), "total_answers": 0, "total_points_awarded": 0, "correct_count": 0},
        "registered": {"participants": set(), "total_answers": 0, "total_points_awarded": 0, "correct_count": 0},
    }
    for row in segment_rows:
        segment = "guest" if row.role == "guest" else "registered"
        current = segment_map[segment]
        participants = current["participants"]
        if isinstance(participants, set):
            participants.add(row.user_id)
        current["total_answers"] = int(current["total_answers"]) + int(row.answer_count or 0)
        current["total_points_awarded"] = int(current["total_points_awarded"]) + int(row.points_awarded or 0)
        current["correct_count"] = int(current["correct_count"]) + int(row.correct_count or 0)

    segments = []
    for segment in ("guest", "registered"):
        current = segment_map[segment]
        total_answers = int(current["total_answers"])
        participants = current["participants"]
        segments.append(
            QuizCollectionSegmentItem(
                segment=segment,
                participant_count=len(participants) if isinstance(participants, set) else 0,
                total_answers=total_answers,
                total_points_awarded=int(current["total_points_awarded"]),
                accuracy_rate=round((int(current["correct_count"]) / total_answers) * 100, 2) if total_answers else 0.0,
            )
        )

    return QuizCollectionDashboard(
        range_days=days,
        collection_id=collection_id,
        user_segment=user_segment,
        collections=collection_stats,
        wrong_questions=wrong_questions,
        leaderboard=leaderboard,
        daily_trend=daily_trend,
        segments=segments,
    )


@router.get("", response_model=DashboardSummary)
def get_dashboard_summary(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    total_users = db.query(func.count(User.id)).filter(User.role != "guest").scalar() or 0
    total_answers = db.query(func.count(AnswerRecord.id)).scalar() or 0
    correct_expr = _correct_expr()
    points_expr = _points_expr()

    average_accuracy_raw = (
        db.query(func.avg(correct_expr))
        .select_from(AnswerRecord)
        .join(QuizQuestion, QuizQuestion.id == AnswerRecord.question_id)
        .scalar()
    )
    average_accuracy = round(float(average_accuracy_raw or 0) * 100, 2)

    today_start = datetime.combine(datetime.now(timezone.utc).date(), time.min, tzinfo=timezone.utc)
    today_points = (
        db.query(func.sum(points_expr))
        .select_from(AnswerRecord)
        .join(QuizQuestion, QuizQuestion.id == AnswerRecord.question_id)
        .filter(AnswerRecord.created_at >= today_start)
        .scalar()
        or 0
    )

    wrong_rows = (
        db.query(
            QuizQuestion.id,
            QuizQuestion.prompt,
            func.sum(case((AnswerRecord.selected_index != QuizQuestion.correct_index, 1), else_=0)).label("wrong_count"),
            func.count(AnswerRecord.id).label("attempt_count"),
            func.avg(correct_expr).label("accuracy"),
        )
        .join(AnswerRecord, AnswerRecord.question_id == QuizQuestion.id)
        .group_by(QuizQuestion.id, QuizQuestion.prompt)
        .order_by(func.sum(case((AnswerRecord.selected_index != QuizQuestion.correct_index, 1), else_=0)).desc())
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
        db.query(
            User.id,
            User.email,
            func.coalesce(func.sum(points_expr), 0).label("total_points"),
            func.count(AnswerRecord.id).label("total_answers"),
        )
        .join(AnswerRecord, AnswerRecord.user_id == User.id)
        .join(QuizQuestion, QuizQuestion.id == AnswerRecord.question_id)
        .group_by(User.id, User.email)
        .order_by(func.coalesce(func.sum(points_expr), 0).desc(), func.count(AnswerRecord.id).desc())
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


@router.get("/quiz-collections", response_model=QuizCollectionDashboard)
def get_quiz_collection_dashboard(
    collection_id: uuid.UUID | None = Query(default=None),
    days: int | None = Query(default=None, ge=1, le=365),
    user_segment: UserSegment = Query(default="all"),
    leaderboard_limit: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return _build_collection_dashboard_payload(db, collection_id, days, user_segment, leaderboard_limit)


def _csv_response(filename: str, rows: list[dict[str, object]]) -> Response:
    stream = StringIO()
    fieldnames = list(rows[0].keys()) if rows else ["message"]
    writer = csv.DictWriter(stream, fieldnames=fieldnames)
    writer.writeheader()
    if rows:
        writer.writerows(rows)
    else:
        writer.writerow({"message": "暂无数据"})
    content = "\ufeff" + stream.getvalue()
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/quiz-collections/export")
def export_quiz_collection_dashboard(
    kind: ExportKind = Query(default="collections"),
    collection_id: uuid.UUID | None = Query(default=None),
    days: int | None = Query(default=None, ge=1, le=365),
    user_segment: UserSegment = Query(default="all"),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    payload = _build_collection_dashboard_payload(db, collection_id, days, user_segment, 100)
    if kind == "wrong_questions":
        return _csv_response(
            "quiz-wrong-questions.csv",
            [
                {
                    "专题": item.collection_title,
                    "题干": item.prompt,
                    "答错次数": item.wrong_count,
                    "尝试数": item.attempt_count,
                    "正确率": f"{item.accuracy_rate:.2f}%",
                }
                for item in payload.wrong_questions
            ],
        )
    if kind == "leaderboard":
        return _csv_response(
            "quiz-leaderboard.csv",
            [
                {
                    "用户": _display_user(item.email, item.role),
                    "用户类型": "游客" if item.role == "guest" else "实名用户",
                    "积分": item.total_points,
                    "答题数": item.total_answers,
                    "正确率": f"{item.accuracy_rate:.2f}%",
                }
                for item in payload.leaderboard
            ],
        )
    return _csv_response(
        "quiz-collections.csv",
        [
            {
                "专题": item.title,
                "发布状态": "已发布" if item.is_published else "未发布",
                "题目数": item.question_count,
                "参与人数": item.participant_count,
                "完成人数": item.completed_user_count,
                "完成率": f"{item.completion_rate:.2f}%",
                "答题数": item.total_answers,
                "发放积分": item.total_points_awarded,
                "平均得分": f"{item.average_score:.2f}",
                "平均正确率": f"{item.average_accuracy:.2f}%",
            }
            for item in payload.collections
        ],
    )

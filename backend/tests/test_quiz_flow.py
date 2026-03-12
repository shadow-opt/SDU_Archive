import os
import uuid

os.environ.setdefault("SECRET_KEY", "test-secret-key")

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app import dashboard, quiz
from backend.app.deps import get_current_user, get_db, rate_limiter, require_admin
from backend.app.models import AnswerRecord, QuizCollection, QuizQuestion, User, UserScore


def _build_test_client():
	engine = create_engine(
		"sqlite+pysqlite:///:memory:",
		connect_args={"check_same_thread": False},
		poolclass=StaticPool,
	)
	SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

	User.__table__.create(bind=engine)
	QuizCollection.__table__.create(bind=engine)
	QuizQuestion.__table__.create(bind=engine)
	AnswerRecord.__table__.create(bind=engine)
	UserScore.__table__.create(bind=engine)

	db = SessionLocal()
	user = User(id=uuid.uuid4(), email="quiz-user@example.com", password_hash="x", role="user", is_active=True)
	admin = User(id=uuid.uuid4(), email="quiz-admin@example.com", password_hash="x", role="admin", is_active=True)
	db.add_all([user, admin])
	collection = QuizCollection(
		id=uuid.uuid4(),
		title="校史入门专题",
		description="测试专题",
		sort_order=1,
		is_published=True,
		created_by=admin.id,
	)
	db.add(collection)

	q1 = QuizQuestion(
		id=uuid.uuid4(),
		collection_id=collection.id,
		prompt="山东大学前身山东大学堂创办于哪一年？",
		options=["1900", "1901", "1902", "1903"],
		correct_index=1,
		points=2,
		question_type="single_choice",
		explanation="山东大学堂创办于1901年。",
		order_index=1,
	)
	q2 = QuizQuestion(
		id=uuid.uuid4(),
		collection_id=collection.id,
		prompt="山东大学校训中不包含下列哪项？",
		options=["学无止境", "气有浩然", "学术自由", "海纳百川"],
		correct_index=3,
		points=3,
		question_type="single_choice",
		explanation="校训为学无止境，气有浩然。",
		order_index=2,
	)
	db.add_all([q1, q2])
	db.commit()

	app = FastAPI()
	app.include_router(quiz.router)
	app.include_router(dashboard.router)

	current_user_ref = {"value": user}

	def override_get_db():
		try:
			yield db
		finally:
			pass

	def override_get_current_user():
		return current_user_ref["value"]

	def override_require_admin():
		return admin

	def override_rate_limiter():
		return True

	app.dependency_overrides[get_db] = override_get_db
	app.dependency_overrides[get_current_user] = override_get_current_user
	app.dependency_overrides[require_admin] = override_require_admin
	app.dependency_overrides[rate_limiter] = override_rate_limiter

	return TestClient(app), db, user, admin, collection, q1, q2, current_user_ref


def test_collections_questions_and_summary_are_recoverable():
	client, _db, _user, _admin, collection, q1, q2, _user_ref = _build_test_client()

	collections = client.get("/api/quiz/collections")
	assert collections.status_code == 200
	collections_payload = collections.json()
	assert len(collections_payload) == 1
	assert collections_payload[0]["id"] == str(collection.id)
	assert collections_payload[0]["question_count"] == 2
	assert collections_payload[0]["answered_count"] == 0

	questions = client.get(f"/api/quiz/collections/{collection.id}/questions")
	assert questions.status_code == 200
	payload = questions.json()
	assert len(payload) == 2
	by_id = {item["id"]: item for item in payload}
	assert by_id[str(q1.id)]["answered"] is False
	assert by_id[str(q1.id)]["collection_id"] == str(collection.id)
	assert by_id[str(q2.id)]["question_type"] == "single_choice"

	summary = client.get(f"/api/quiz/collections/{collection.id}/summary")
	assert summary.status_code == 200
	summary_payload = summary.json()
	assert summary_payload["collection_id"] == str(collection.id)
	assert summary_payload["total_points"] == 0
	assert summary_payload["total_answers"] == 0
	assert summary_payload["total_questions"] == 2
	assert summary_payload["answer_history"] == []


def test_submit_answer_updates_summary_and_history():
	client, _db, _user, _admin, collection, q1, _q2, _user_ref = _build_test_client()

	submit = client.post(f"/api/quiz/questions/{q1.id}/submit", json={"answer_index": 1})
	assert submit.status_code == 200
	submit_payload = submit.json()
	assert submit_payload["question_id"] == str(q1.id)
	assert submit_payload["collection_id"] == str(collection.id)
	assert submit_payload["correct"] is True
	assert submit_payload["awarded"] == 2
	assert submit_payload["total_points"] == 2
	assert submit_payload["total_answers"] == 1
	assert submit_payload["correct_index"] == 1
	assert submit_payload["correct_option"] == "1901"
	assert submit_payload["selected_option"] == "1901"

	summary = client.get(f"/api/quiz/collections/{collection.id}/summary")
	assert summary.status_code == 200
	summary_payload = summary.json()
	assert summary_payload["total_points"] == 2
	assert summary_payload["total_answers"] == 1
	assert summary_payload["total_questions"] == 2
	assert len(summary_payload["answer_history"]) == 1

	history_item = summary_payload["answer_history"][0]
	assert history_item["question_id"] == str(q1.id)
	assert history_item["is_correct"] is True
	assert history_item["selected_option"] == "1901"
	assert history_item["correct_option"] == "1901"
	assert history_item["explanation"] == "山东大学堂创办于1901年。"

	questions = client.get(f"/api/quiz/collections/{collection.id}/questions")
	assert questions.status_code == 200
	questions_payload = {item["id"]: item for item in questions.json()}
	assert questions_payload[str(q1.id)]["answered"] is True


def test_question_update_recomputes_existing_scores():
	client, _db, _user, _admin, collection, q1, _q2, _user_ref = _build_test_client()

	first = client.post(f"/api/quiz/questions/{q1.id}/submit", json={"answer_index": 0})
	assert first.status_code == 200
	assert first.json()["correct"] is False

	update = client.put(
		f"/api/quiz/questions/{q1.id}",
		json={
			"collection_id": str(collection.id),
			"prompt": "山东大学前身山东大学堂创办于哪一年？",
			"options": ["1900", "1901", "1902", "1903"],
			"correct_index": 0,
			"points": 5,
			"question_type": "single_choice",
			"explanation": "按最新题库规则，1900 被设置为正确答案。",
			"order_index": 1,
		},
	)
	assert update.status_code == 200

	summary = client.get(f"/api/quiz/collections/{collection.id}/summary")
	assert summary.status_code == 200
	payload = summary.json()
	assert payload["total_points"] == 5
	assert payload["total_answers"] == 1
	assert payload["answer_history"][0]["is_correct"] is True
	assert payload["answer_history"][0]["points_awarded"] == 5
	assert payload["answer_history"][0]["correct_option"] == "1900"


def test_question_delete_removes_score_from_summary():
	client, _db, _user, _admin, collection, q1, _q2, _user_ref = _build_test_client()

	first = client.post(f"/api/quiz/questions/{q1.id}/submit", json={"answer_index": 1})
	assert first.status_code == 200

	delete = client.delete(f"/api/quiz/questions/{q1.id}")
	assert delete.status_code == 200

	summary = client.get(f"/api/quiz/collections/{collection.id}/summary")
	assert summary.status_code == 200
	payload = summary.json()
	assert payload["total_points"] == 0
	assert payload["total_answers"] == 0
	assert payload["total_questions"] == 1
	assert payload["answer_history"] == []


def test_duplicate_submission_is_rejected():
	client, _db, _user, _admin, _collection, q1, _q2, _user_ref = _build_test_client()

	first = client.post(f"/api/quiz/questions/{q1.id}/submit", json={"answer_index": 0})
	assert first.status_code == 200

	second = client.post(f"/api/quiz/questions/{q1.id}/submit", json={"answer_index": 1})
	assert second.status_code == 400
	assert second.json()["detail"] == "Already answered"


def test_import_csv_returns_detailed_feedback():
	client, _db, _user, _admin, collection, _q1, _q2, _user_ref = _build_test_client()

	files = {
		"file": (
			"questions.csv",
			"prompt,options,correct_index,points,explanation,order_index\n"
			"新增题目,A|B|C,1,2,解析,3\n"
			"新增题目,A|B|C,1,2,重复题干,4\n"
			"坏题目,A,5,0,参数错误,5\n",
			"text/csv",
		),
	}
	response = client.post(
		"/api/quiz/questions/import-csv",
		data={"collection_id": str(collection.id)},
		files=files,
	)
	assert response.status_code == 200
	payload = response.json()
	assert payload["collection_id"] == str(collection.id)
	assert payload["collection_title"] == collection.title
	assert payload["total_rows"] == 3
	assert payload["created"] == 1
	assert payload["skipped"] == 2
	assert len(payload["issues"]) == 2
	assert payload["issues"][0]["row_number"] == 3
	assert payload["issues"][1]["row_number"] == 4

	questions = client.get(f"/api/quiz/questions/admin?collection_id={collection.id}")
	assert questions.status_code == 200
	assert len(questions.json()) == 3


def test_collection_dashboard_supports_topic_metrics_and_filters():
	client, _db, user, admin, collection, q1, q2, user_ref = _build_test_client()

	user_ref["value"] = admin
	assert client.post(f"/api/quiz/questions/{q1.id}/submit", json={"answer_index": 1}).status_code == 200
	assert client.post(f"/api/quiz/questions/{q2.id}/submit", json={"answer_index": 0}).status_code == 200
	user_ref["value"] = user
	assert client.post(f"/api/quiz/questions/{q1.id}/submit", json={"answer_index": 0}).status_code == 200

	dashboard_response = client.get(f"/api/admin/dashboard/quiz-collections?collection_id={collection.id}&days=30")
	assert dashboard_response.status_code == 200
	payload = dashboard_response.json()
	assert payload["collection_id"] == str(collection.id)
	assert payload["range_days"] == 30
	assert len(payload["collections"]) == 1
	stats = payload["collections"][0]
	assert stats["collection_id"] == str(collection.id)
	assert stats["participant_count"] == 2
	assert stats["completed_user_count"] == 1
	assert stats["total_answers"] == 3
	assert stats["total_points_awarded"] == 2
	assert stats["completion_rate"] == 50.0
	assert stats["average_accuracy"] == 33.33
	assert payload["wrong_questions"][0]["collection_title"] == collection.title
	assert payload["leaderboard"][0]["email"] == admin.email

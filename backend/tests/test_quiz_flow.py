import os
import uuid

os.environ.setdefault("SECRET_KEY", "test-secret-key")

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app import dashboard, quiz, rag
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
	app.include_router(rag.router)

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


def _build_empty_quiz_client():
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
	db.commit()

	app = FastAPI()
	app.include_router(quiz.router)

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

	return TestClient(app), db, user, admin, current_user_ref


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


def test_guest_session_can_answer_and_is_isolated():
	client, db, user, _admin, collection, q1, _q2, user_ref = _build_test_client()

	session_response = client.post("/api/quiz/guest-session")
	assert session_response.status_code == 200
	token_payload = session_response.json()
	assert token_payload["access_token"]

	guest = db.query(User).filter(User.role == "guest").first()
	assert guest is not None
	assert guest.email.endswith("@guest.quiz.sdu.edu.cn")

	user_ref["value"] = guest
	assert client.post(f"/api/quiz/questions/{q1.id}/submit", json={"answer_index": 1}).status_code == 200
	duplicate = client.post(f"/api/quiz/questions/{q1.id}/submit", json={"answer_index": 1})
	assert duplicate.status_code == 400

	guest_summary = client.get(f"/api/quiz/collections/{collection.id}/summary")
	assert guest_summary.status_code == 200
	assert guest_summary.json()["total_answers"] == 1

	user_ref["value"] = user
	user_summary = client.get(f"/api/quiz/collections/{collection.id}/summary")
	assert user_summary.status_code == 200
	assert user_summary.json()["total_answers"] == 0


def test_guest_user_cannot_use_rag():
	client, _db, _user, _admin, _collection, _q1, _q2, user_ref = _build_test_client()

	user_ref["value"] = User(id=uuid.uuid4(), email="guest@example.com", password_hash="x", role="guest", is_active=True)
	response = client.post("/api/rag/query", json={"query": "山东大学"})
	assert response.status_code == 403


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


def test_invalid_answer_index_is_rejected():
	client, _db, _user, _admin, _collection, q1, _q2, _user_ref = _build_test_client()

	negative = client.post(f"/api/quiz/questions/{q1.id}/submit", json={"answer_index": -1})
	assert negative.status_code == 422

	too_large = client.post(f"/api/quiz/questions/{q1.id}/submit", json={"answer_index": 99})
	assert too_large.status_code == 400
	assert too_large.json()["detail"] == "Invalid answer index"


def test_duplicate_collection_title_returns_400():
	client, _db, _user, _admin, collection, _q1, _q2, _user_ref = _build_test_client()

	response = client.post(
		"/api/quiz/collections",
		json={
			"title": collection.title,
			"description": "重复标题",
			"sort_order": 2,
			"is_published": True,
		},
	)
	assert response.status_code == 400
	assert response.json()["detail"] == "Collection title already exists"


def test_update_collection_with_duplicate_title_returns_400():
	client, db, _user, admin, collection, _q1, _q2, _user_ref = _build_test_client()

	extra_collection = QuizCollection(
		id=uuid.uuid4(),
		title="第二专题",
		description="用于冲突测试",
		sort_order=2,
		is_published=True,
		created_by=admin.id,
	)
	db.add(extra_collection)
	db.commit()

	response = client.put(
		f"/api/quiz/collections/{extra_collection.id}",
		json={
			"title": collection.title,
			"description": extra_collection.description,
			"sort_order": extra_collection.sort_order,
			"is_published": True,
		},
	)
	assert response.status_code == 400
	assert response.json()["detail"] == "Collection title already exists"


def test_unpublished_collection_is_hidden_for_user_endpoints():
	client, db, admin_user, _admin, _collection, _q1, _q2, _user_ref = _build_test_client()

	hidden_collection = QuizCollection(
		id=uuid.uuid4(),
		title="未发布专题",
		description="仅管理员可见",
		sort_order=99,
		is_published=False,
		created_by=admin_user.id,
	)
	hidden_question = QuizQuestion(
		id=uuid.uuid4(),
		collection_id=hidden_collection.id,
		prompt="未发布问题",
		options=["A", "B", "C", "D"],
		correct_index=0,
		points=1,
		question_type="single_choice",
		order_index=1,
	)
	db.add_all([hidden_collection, hidden_question])
	db.commit()

	response = client.get(f"/api/quiz/collections/{hidden_collection.id}/questions")
	assert response.status_code == 404
	assert response.json()["detail"] == "Collection not found"


def test_empty_quiz_bootstrap_persists_default_collection():
	client, db, _user, _admin, _user_ref = _build_empty_quiz_client()

	first = client.get("/api/quiz/collections")
	assert first.status_code == 200
	first_payload = first.json()
	assert len(first_payload) == 1
	assert first_payload[0]["title"] == quiz.DEFAULT_COLLECTION_TITLE
	assert db.query(QuizCollection).count() == 1

	second = client.get("/api/quiz/collections")
	assert second.status_code == 200
	assert len(second.json()) == 1
	assert db.query(QuizCollection).count() == 1


def test_create_question_without_collection_id_falls_back_to_default_collection():
	client, _db, _user, _admin, _collection, _q1, _q2, _user_ref = _build_test_client()

	response = client.post(
		"/api/quiz/questions",
		json={
			"prompt": "未指定专题时应落到默认题库",
			"options": ["A", "B", "C", "D"],
			"correct_index": 1,
			"points": 2,
			"question_type": "single_choice",
			"explanation": "兼容旧调用方",
		},
	)
	assert response.status_code == 200
	payload = response.json()
	assert payload["collection_id"] is not None
	assert payload["order_index"] >= 1


def test_create_question_with_conflicting_order_reorders_existing_questions():
	client, _db, _user, _admin, collection, q1, q2, _user_ref = _build_test_client()

	response = client.post(
		"/api/quiz/questions",
		json={
			"collection_id": str(collection.id),
			"prompt": "插入到第一题",
			"options": ["A", "B", "C", "D"],
			"correct_index": 0,
			"points": 1,
			"question_type": "single_choice",
			"explanation": "测试自动重排",
			"order_index": 1,
		},
	)
	assert response.status_code == 200
	created = response.json()
	assert created["order_index"] == 1

	questions = client.get(f"/api/quiz/questions/admin?collection_id={collection.id}")
	assert questions.status_code == 200
	by_id = {item["id"]: item for item in questions.json()}
	assert by_id[created["id"]]["order_index"] == 1
	assert by_id[str(q1.id)]["order_index"] == 2
	assert by_id[str(q2.id)]["order_index"] == 3


def test_update_question_order_reorders_within_collection():
	client, _db, _user, _admin, collection, q1, q2, _user_ref = _build_test_client()

	response = client.put(
		f"/api/quiz/questions/{q2.id}",
		json={
			"collection_id": str(collection.id),
			"prompt": "山东大学校训中不包含下列哪项？",
			"options": ["学无止境", "气有浩然", "学术自由", "海纳百川"],
			"correct_index": 3,
			"points": 3,
			"question_type": "single_choice",
			"explanation": "校训为学无止境，气有浩然。",
			"order_index": 1,
		},
	)
	assert response.status_code == 200

	questions = client.get(f"/api/quiz/questions/admin?collection_id={collection.id}")
	assert questions.status_code == 200
	by_id = {item["id"]: item for item in questions.json()}
	assert by_id[str(q2.id)]["order_index"] == 1
	assert by_id[str(q1.id)]["order_index"] == 2


def test_delete_question_compacts_order_index():
	client, _db, _user, _admin, collection, q1, q2, _user_ref = _build_test_client()

	delete = client.delete(f"/api/quiz/questions/{q1.id}")
	assert delete.status_code == 200

	questions = client.get(f"/api/quiz/questions/admin?collection_id={collection.id}")
	assert questions.status_code == 200
	payload = questions.json()
	assert len(payload) == 1
	assert payload[0]["id"] == str(q2.id)
	assert payload[0]["order_index"] == 1


def test_import_csv_returns_detailed_feedback():
	client, _db, _user, _admin, collection, _q1, _q2, _user_ref = _build_test_client()

	files = {
		"file": (
			"questions.csv",
			"prompt,options,correct_index,points,explanation,order_index\n"
			"新增题目,A|B|C,1,2,解析,\n"
			"新增题目,A|B|C,1,2,重复题干,\n"
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
	assert payload["created"] == 2
	assert payload["skipped"] == 1
	assert len(payload["issues"]) == 1
	assert payload["issues"][0]["row_number"] == 4

	questions = client.get(f"/api/quiz/questions/admin?collection_id={collection.id}")
	assert questions.status_code == 200
	assert len(questions.json()) == 4
	assert [item["order_index"] for item in questions.json()] == [1, 2, 3, 4]


def test_collection_dashboard_supports_topic_metrics_and_filters():
	client, _db, user, admin, collection, q1, q2, user_ref = _build_test_client()
	guest = User(id=uuid.uuid4(), email="guest-dashboard@guest.quiz.sdu.edu.cn", password_hash="x", role="guest", is_active=True)
	_db.add(guest)
	_db.commit()

	user_ref["value"] = admin
	assert client.post(f"/api/quiz/questions/{q1.id}/submit", json={"answer_index": 1}).status_code == 200
	assert client.post(f"/api/quiz/questions/{q2.id}/submit", json={"answer_index": 0}).status_code == 200
	user_ref["value"] = user
	assert client.post(f"/api/quiz/questions/{q1.id}/submit", json={"answer_index": 0}).status_code == 200
	user_ref["value"] = guest
	assert client.post(f"/api/quiz/questions/{q2.id}/submit", json={"answer_index": 2}).status_code == 200

	dashboard_response = client.get(f"/api/admin/dashboard/quiz-collections?collection_id={collection.id}&days=30")
	assert dashboard_response.status_code == 200
	payload = dashboard_response.json()
	assert payload["collection_id"] == str(collection.id)
	assert payload["range_days"] == 30
	assert payload["user_segment"] == "all"
	assert len(payload["collections"]) == 1
	stats = payload["collections"][0]
	assert stats["collection_id"] == str(collection.id)
	assert stats["participant_count"] == 3
	assert stats["completed_user_count"] == 1
	assert stats["total_answers"] == 4
	assert stats["total_points_awarded"] == 2
	assert stats["completion_rate"] == 33.33
	assert stats["average_accuracy"] == 25.0
	assert payload["wrong_questions"][0]["collection_title"] == collection.title
	assert payload["leaderboard"][0]["email"] == admin.email
	assert payload["daily_trend"]
	assert payload["daily_trend"][0]["guest_answers"] == 1
	assert payload["daily_trend"][0]["registered_answers"] == 3
	assert {item["segment"] for item in payload["segments"]} == {"guest", "registered"}

	guest_response = client.get(f"/api/admin/dashboard/quiz-collections?collection_id={collection.id}&user_segment=guest")
	assert guest_response.status_code == 200
	guest_payload = guest_response.json()
	assert guest_payload["collections"][0]["participant_count"] == 1
	assert guest_payload["collections"][0]["total_answers"] == 1
	assert guest_payload["leaderboard"][0]["role"] == "guest"

	export_response = client.get(f"/api/admin/dashboard/quiz-collections/export?kind=leaderboard&collection_id={collection.id}&user_segment=guest")
	assert export_response.status_code == 200
	assert export_response.headers["content-type"].startswith("text/csv")
	assert export_response.text.startswith("\ufeff")
	assert "游客用户" in export_response.text

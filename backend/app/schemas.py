import re
import uuid
from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator


def _check_password_complexity(v: str) -> str:
    """Shared password complexity check for all password fields."""
    if not re.search(r'[A-Za-z]', v):
        raise ValueError('密码需包含至少一个字母')
    if not re.search(r'\d', v):
        raise ValueError('密码需包含至少一个数字')
    return v


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: uuid.UUID
    role: str


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)

    @field_validator('password')
    @classmethod
    def password_complexity(cls, v: str) -> str:
        return _check_password_complexity(v)


class UserCreateAdmin(BaseModel):
    """Used by admin endpoint — includes role."""
    email: EmailStr
    password: str = Field(min_length=8)
    role: str = "user"

    @field_validator('password')
    @classmethod
    def password_complexity(cls, v: str) -> str:
        return _check_password_complexity(v)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: EmailStr
    role: str
    is_active: bool
    created_at: datetime


class UserAdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: EmailStr
    role: str
    is_active: bool
    created_at: datetime


class UserListResponse(BaseModel):
    items: List[UserAdminOut]
    total: int
    skip: int
    limit: int


class UserRoleUpdate(BaseModel):
    role: str


class UserStatusUpdate(BaseModel):
    is_active: bool


class UserPasswordReset(BaseModel):
    new_password: str = Field(min_length=8)

    @field_validator('new_password')
    @classmethod
    def password_complexity(cls, v: str) -> str:
        return _check_password_complexity(v)


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    title: str
    filename: str
    content_type: str
    object_name: str
    description: Optional[str]
    year_or_period: Optional[str]
    doc_type: Optional[str]
    created_at: datetime


class DocumentListResponse(BaseModel):
    items: List[DocumentOut]
    total: int
    skip: int
    limit: int


class ChunkUpdate(BaseModel):
    content: str = Field(max_length=50000)


class ChunkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    document_id: uuid.UUID
    content: str
    source_url: str
    document_title: Optional[str] = None
    char_count: Optional[int] = None
    token_count: Optional[int] = None
    created_at: datetime
    updated_at: datetime


class ChunkListResponse(BaseModel):
    items: List[ChunkOut]
    total: int
    skip: int
    limit: int


class RagQuery(BaseModel):
    query: str = Field(max_length=2000)
    top_k: int = Field(default=4, le=10)
    conversation_id: Optional[uuid.UUID] = None
    history_window: int = Field(default=4, ge=0, le=12)


class RagCitation(BaseModel):
    source: str
    snippet: str
    document_title: Optional[str] = None
    filename: Optional[str] = None
    year_or_period: Optional[str] = None
    doc_type: Optional[str] = None


class RagResponse(BaseModel):
    answer: str
    citations: List[RagCitation]
    degraded: bool = False
    conversation_id: Optional[uuid.UUID] = None


def _normalize_quiz_text(value: str, field_name: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError(f"{field_name}不能为空")
    return normalized


class QuestionBase(BaseModel):
    prompt: str
    options: List[str] = Field(min_length=2)
    correct_index: int = Field(ge=0)
    points: int = Field(default=1, ge=1)
    question_type: Literal["single_choice"] = "single_choice"
    explanation: Optional[str] = None
    order_index: int = Field(default=1, ge=1)

    @field_validator('prompt')
    @classmethod
    def normalize_prompt(cls, value: str) -> str:
        return _normalize_quiz_text(value, '题干')

    @field_validator('options')
    @classmethod
    def normalize_options(cls, value: List[str]) -> List[str]:
        normalized = [_normalize_quiz_text(option, '选项') for option in value]
        if len(normalized) < 2:
            raise ValueError('至少需要两个选项')
        return normalized

    @field_validator('explanation')
    @classmethod
    def normalize_explanation(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator('correct_index')
    @classmethod
    def validate_correct_index(cls, value: int, info) -> int:
        options = info.data.get('options') or []
        if options and value >= len(options):
            raise ValueError('正确答案序号超出范围')
        return value


class QuestionCreate(QuestionBase):
    collection_id: Optional[uuid.UUID] = None


class QuestionUpdate(QuestionBase):
    collection_id: uuid.UUID


class QuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    collection_id: uuid.UUID
    prompt: str
    options: List[str]
    points: int
    order_index: int
    question_type: Literal["single_choice"] = "single_choice"
    answered: bool = False


class QuestionAdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    collection_id: Optional[uuid.UUID] = None
    prompt: str
    options: List[str]
    correct_index: int
    question_type: str
    explanation: Optional[str]
    points: int
    order_index: int
    created_at: datetime
    updated_at: datetime


class QuizCollectionBase(BaseModel):
    title: str
    description: Optional[str] = None
    sort_order: int = Field(default=0, ge=0)
    is_published: bool = True

    @field_validator('title')
    @classmethod
    def normalize_collection_title(cls, value: str) -> str:
        return _normalize_quiz_text(value, '专题名称')

    @field_validator('description')
    @classmethod
    def normalize_collection_description(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class QuizCollectionCreate(QuizCollectionBase):
    pass


class QuizCollectionUpdate(QuizCollectionBase):
    pass


class QuizCollectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    title: str
    description: Optional[str] = None
    sort_order: int
    is_published: bool
    question_count: int = 0
    answered_count: int = 0
    total_points: int = 0
    created_at: datetime
    updated_at: datetime


class QuizImportRowIssue(BaseModel):
    row_number: int
    prompt: Optional[str] = None
    error: str


class QuizImportResult(BaseModel):
    collection_id: uuid.UUID
    collection_title: str
    total_rows: int
    created: int
    skipped: int
    issues: List[QuizImportRowIssue]


class QuestionSubmit(BaseModel):
    answer_index: int = Field(ge=0)


class SubmissionResult(BaseModel):
    question_id: uuid.UUID
    collection_id: uuid.UUID
    selected_index: int
    selected_option: str
    correct: bool
    awarded: int
    total_points: int
    total_answers: int
    correct_index: int
    correct_option: str
    explanation: Optional[str] = None


class AnswerHistoryItem(BaseModel):
    question_id: uuid.UUID
    prompt: str
    question_type: Literal["single_choice"] = "single_choice"
    selected_index: int
    selected_option: str
    correct_index: int
    correct_option: str
    is_correct: bool
    points_awarded: int
    explanation: Optional[str] = None
    answered_at: datetime


class QuizUserSummary(BaseModel):
    collection_id: Optional[uuid.UUID] = None
    total_points: int
    total_answers: int
    total_questions: int
    answer_history: List[AnswerHistoryItem]


class DashboardKpi(BaseModel):
    total_users: int
    total_answers: int
    average_accuracy: float
    today_points: int


class WrongQuestionItem(BaseModel):
    question_id: uuid.UUID
    prompt: str
    wrong_count: int
    accuracy_rate: float


class TopUserItem(BaseModel):
    user_id: uuid.UUID
    email: EmailStr
    total_points: int
    total_answers: int


class DashboardSummary(BaseModel):
    kpi: DashboardKpi
    wrong_questions: List[WrongQuestionItem]
    top_users: List[TopUserItem]


class QuizCollectionStatsItem(BaseModel):
    collection_id: uuid.UUID
    title: str
    is_published: bool
    question_count: int
    participant_count: int
    completed_user_count: int
    completion_rate: float
    total_answers: int
    total_points_awarded: int
    average_score: float
    average_accuracy: float


class QuizCollectionWrongQuestionItem(BaseModel):
    question_id: uuid.UUID
    collection_id: uuid.UUID
    collection_title: str
    prompt: str
    wrong_count: int
    attempt_count: int
    accuracy_rate: float


class QuizCollectionLeaderboardItem(BaseModel):
    user_id: uuid.UUID
    email: EmailStr
    total_points: int
    total_answers: int
    accuracy_rate: float


class QuizCollectionDashboard(BaseModel):
    range_days: Optional[int] = None
    collection_id: Optional[uuid.UUID] = None
    collections: List[QuizCollectionStatsItem]
    wrong_questions: List[QuizCollectionWrongQuestionItem]
    leaderboard: List[QuizCollectionLeaderboardItem]

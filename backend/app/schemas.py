import re
import uuid
from datetime import datetime
from typing import List, Optional

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


class RagResponse(BaseModel):
    answer: str
    citations: List[RagCitation]
    degraded: bool = False
    conversation_id: Optional[uuid.UUID] = None


class QuestionCreate(BaseModel):
    prompt: str
    options: List[str]
    correct_index: int
    points: int = 1
    question_type: str = "single_choice"
    explanation: Optional[str] = None


class QuestionUpdate(BaseModel):
    prompt: str
    options: List[str]
    correct_index: int
    points: int = 1
    question_type: str = "single_choice"
    explanation: Optional[str] = None


class QuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    prompt: str
    options: List[str]
    points: int
    answered: bool = False


class QuestionAdminOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    prompt: str
    options: List[str]
    correct_index: int
    question_type: str
    explanation: Optional[str]
    points: int
    created_at: datetime


class QuestionSubmit(BaseModel):
    answer_index: int


class SubmissionResult(BaseModel):
    correct: bool
    awarded: int
    total_points: int
    total_answers: int
    explanation: Optional[str] = None


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

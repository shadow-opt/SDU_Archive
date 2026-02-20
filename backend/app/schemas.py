import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field, ConfigDict


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: uuid.UUID
    role: str


class UserCreate(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: EmailStr
    role: str
    created_at: datetime


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


class ChunkUpdate(BaseModel):
    content: str


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


class RagQuery(BaseModel):
    query: str
    top_k: int = Field(default=4, le=10)


class RagCitation(BaseModel):
    source: str
    snippet: str


class RagResponse(BaseModel):
    answer: str
    citations: List[RagCitation]


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

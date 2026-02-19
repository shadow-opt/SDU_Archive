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
    created_at: datetime


class ChunkUpdate(BaseModel):
    content: str


class ChunkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    document_id: uuid.UUID
    content: str
    source_url: str
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


class QuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    prompt: str
    options: List[str]
    points: int


class QuestionSubmit(BaseModel):
    answer_index: int


class SubmissionResult(BaseModel):
    correct: bool
    awarded: int
    total_points: int

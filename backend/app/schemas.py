import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field


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
    id: uuid.UUID
    email: EmailStr
    role: str
    created_at: datetime

    class Config:
        from_attributes = True


class DocumentOut(BaseModel):
    id: uuid.UUID
    title: str
    filename: str
    content_type: str
    object_name: str
    description: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ChunkUpdate(BaseModel):
    content: str


class ChunkOut(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    content: str
    source_url: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


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
    id: uuid.UUID
    prompt: str
    options: List[str]
    points: int

    class Config:
        from_attributes = True


class QuestionSubmit(BaseModel):
    answer_index: int


class SubmissionResult(BaseModel):
    correct: bool
    awarded: int
    total_points: int

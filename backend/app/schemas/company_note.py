from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class AuthorBase(BaseModel):
    id: int
    name: str
    email: str

    class Config:
        from_attributes = True

class CompanyNoteCreate(BaseModel):
    content: str
    company_id: int

class CompanyNoteUpdate(BaseModel):
    content: str

class CompanyNoteResponse(BaseModel):
    id: int
    company_id: int
    author_id: int
    content: str
    created_at: datetime
    author: Optional[AuthorBase] = None

    class Config:
        from_attributes = True

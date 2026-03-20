from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime

class LeadBase(BaseModel):
    name: str = Field(..., max_length=255)
    email: EmailStr
    whatsapp: Optional[str] = Field(None, max_length=50)
    need_type: str = Field(..., max_length=100)
    description: Optional[str] = Field(None, max_length=2000)
    status: Optional[str] = Field("new", max_length=50)

class LeadCreate(LeadBase):
    pass

class LeadStatusUpdate(BaseModel):
    status: str

class Lead(LeadBase):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True

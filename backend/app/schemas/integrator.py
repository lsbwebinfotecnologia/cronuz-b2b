from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class IntegratorCreate(BaseModel):
    company_id: int
    platform: str
    credentials: Optional[str] = None
    active: bool = True

class IntegratorUpdate(BaseModel):
    platform: Optional[str] = None
    credentials: Optional[str] = None
    active: Optional[bool] = None

class IntegratorResponse(BaseModel):
    id: int
    company_id: int
    platform: str
    credentials: Optional[str] = None
    active: bool
    created_at: datetime

    class Config:
        from_attributes = True

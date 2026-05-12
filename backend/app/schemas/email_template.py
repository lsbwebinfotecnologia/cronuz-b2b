from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class SysEmailTemplateBase(BaseModel):
    type: str
    name: str
    subject: str
    body_template: str
    is_default: bool = True
    is_active: bool = True

class SysEmailTemplateCreate(SysEmailTemplateBase):
    pass

class SysEmailTemplateUpdate(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    body_template: Optional[str] = None
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None

class SysEmailTemplateSchema(SysEmailTemplateBase):
    id: int
    company_id: int
    variables_schema: List[str]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True

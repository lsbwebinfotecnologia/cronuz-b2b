from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime

AlertType = Literal["info", "warning", "success", "urgent"]


class AlertBase(BaseModel):
    title: str = Field(..., max_length=120)
    message: str
    type: AlertType = "info"
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    active: bool = True
    dismissible: bool = True


class AlertCreate(AlertBase):
    pass


class AlertUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=120)
    message: Optional[str] = None
    type: Optional[AlertType] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    active: Optional[bool] = None
    dismissible: Optional[bool] = None


class AlertResponse(AlertBase):
    id: int
    company_id: int
    created_by: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

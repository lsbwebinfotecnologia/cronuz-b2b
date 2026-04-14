from typing import Optional, List
from pydantic import BaseModel, ConfigDict
from datetime import datetime

class PrintPointBase(BaseModel):
    name: str
    document_type: str
    is_service: bool = False
    is_electronic: bool = True
    current_number: int = 1
    serie: Optional[str] = None
    is_active: bool = True

class PrintPointCreate(PrintPointBase):
    pass

class PrintPointUpdate(BaseModel):
    name: Optional[str] = None
    document_type: Optional[str] = None
    is_service: Optional[bool] = None
    is_electronic: Optional[bool] = None
    current_number: Optional[int] = None
    serie: Optional[str] = None
    is_active: Optional[bool] = None

class PrintPointResponse(PrintPointBase):
    id: int
    company_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

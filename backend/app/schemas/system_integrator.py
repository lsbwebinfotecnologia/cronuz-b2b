from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class SystemIntegratorBase(BaseModel):
    name: str = Field(..., max_length=100)
    code: str = Field(..., max_length=50)
    description: Optional[str] = None
    logo: Optional[str] = None
    active: bool = True

class SystemIntegratorCreate(SystemIntegratorBase):
    pass

class SystemIntegratorUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    code: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = None
    logo: Optional[str] = None
    active: Optional[bool] = None

class SystemIntegratorFieldBase(BaseModel):
    name: str = Field(..., max_length=100)
    label: str = Field(..., max_length=100)
    type: str = "TEXT"
    is_required: bool = True
    order_index: int = 0

class SystemIntegratorFieldCreate(SystemIntegratorFieldBase):
    pass

class SystemIntegratorFieldUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    label: Optional[str] = Field(None, max_length=100)
    type: Optional[str] = None
    is_required: Optional[bool] = None
    order_index: Optional[int] = None

class SystemIntegratorFieldResponse(SystemIntegratorFieldBase):
    id: int
    group_id: int
    class Config:
        from_attributes = True

class SystemIntegratorGroupBase(BaseModel):
    name: str = Field(..., max_length=100)
    order_index: int = 0

class SystemIntegratorGroupCreate(SystemIntegratorGroupBase):
    pass

class SystemIntegratorGroupUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    order_index: Optional[int] = None

class SystemIntegratorGroupResponse(SystemIntegratorGroupBase):
    id: int
    system_integrator_id: int
    fields: List[SystemIntegratorFieldResponse] = []
    class Config:
        from_attributes = True


class SystemIntegratorResponse(SystemIntegratorBase):
    id: int
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    groups: List[SystemIntegratorGroupResponse] = []

    class Config:
        from_attributes = True

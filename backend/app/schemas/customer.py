from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class CustomerBase(BaseModel):
    name: str
    document: str
    credit_limit: Optional[float] = 0.0
    consignment_status: Optional[str] = "INACTIVE"
    open_debts: Optional[float] = 0.0

class CustomerCreate(CustomerBase):
    pass

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    document: Optional[str] = None
    credit_limit: Optional[float] = None
    consignment_status: Optional[str] = None
    open_debts: Optional[float] = None

class CustomerInDBBase(CustomerBase):
    id: int
    company_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class Customer(CustomerInDBBase):
    pass

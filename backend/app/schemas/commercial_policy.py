from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class CommercialPolicyBase(BaseModel):
    name: str
    description: Optional[str] = None
    discount_sale_percent: float = 0.0
    discount_consignment_percent: float = 0.0
    min_order_total: float = 0.0
    allow_consignment: bool = False
    max_installments: int = 1
    min_installment_value: float = 50.0
    is_active: bool = True

class CommercialPolicyCreate(CommercialPolicyBase):
    pass

class CommercialPolicyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    discount_sale_percent: Optional[float] = None
    discount_consignment_percent: Optional[float] = None
    min_order_total: Optional[float] = None
    allow_consignment: Optional[bool] = None
    max_installments: Optional[int] = None
    min_installment_value: Optional[float] = None
    is_active: Optional[bool] = None

class CommercialPolicyResponse(CommercialPolicyBase):
    id: int
    company_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

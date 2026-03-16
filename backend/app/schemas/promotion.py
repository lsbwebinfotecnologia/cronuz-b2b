from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class PromotionTargetBase(BaseModel):
    target_type: str # CATEGORY, BRAND, PRODUCT
    category_id: Optional[int] = None
    brand_id: Optional[int] = None
    product_id: Optional[int] = None

class PromotionTargetCreate(PromotionTargetBase):
    pass

class PromotionTargetResponse(PromotionTargetBase):
    id: int
    promotion_id: int

    class Config:
        from_attributes = True

class PromotionBase(BaseModel):
    name: str
    description: Optional[str] = None
    start_date: datetime
    end_date: datetime
    discount_type: str # PERCENTAGE, FIXED_AMOUNT
    discount_value: float
    status: str = "INACTIVE"

class PromotionCreate(PromotionBase):
    targets: List[PromotionTargetCreate] = []

class PromotionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    discount_type: Optional[str] = None
    discount_value: Optional[float] = None
    status: Optional[str] = None
    # We won't allow inline target updates for safety. They should be deleted & recreated.

class PromotionResponse(PromotionBase):
    id: int
    company_id: int
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    targets: List[PromotionTargetResponse] = []

    class Config:
        from_attributes = True

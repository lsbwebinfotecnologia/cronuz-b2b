from pydantic import BaseModel, Field
from typing import Optional, List
from app.models.marketing_showcase import ShowcaseRuleType, ShowcaseSortBy
from app.schemas.product import ProductResponse

class MarketingShowcaseBase(BaseModel):
    name: str = Field(..., max_length=100)
    rule_type: ShowcaseRuleType
    reference_id: Optional[int] = None
    sort_by: ShowcaseSortBy = ShowcaseSortBy.MANUAL
    display_on_home: bool = False
    display_order: int = Field(1, ge=1, le=5)
    banner_url: Optional[str] = None

class MarketingShowcaseCreate(MarketingShowcaseBase):
    product_ids: Optional[List[int]] = None # For MANUAL rule
    pass

class MarketingShowcaseUpdate(BaseModel):
    name: Optional[str] = None
    rule_type: Optional[ShowcaseRuleType] = None
    reference_id: Optional[int] = None
    display_on_home: Optional[bool] = None
    display_order: Optional[int] = None
    banner_url: Optional[str] = None
    product_ids: Optional[List[int]] = None

class MarketingShowcaseInDBBase(MarketingShowcaseBase):
    id: int
    company_id: int

    class Config:
        from_attributes = True

class MarketingShowcase(MarketingShowcaseInDBBase):
    products: Optional[List[ProductResponse]] = []

class ShowcaseProductBase(BaseModel):
    showcase_id: int
    product_id: int
    position: int

class StorefrontShowcase(MarketingShowcase):
    pass

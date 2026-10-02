from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class DynamicShowcaseBase(BaseModel):
    title: str = Field(..., max_length=150)
    description: Optional[str] = None
    search_source: str = Field("CRONUZ", description="'CRONUZ' or 'HORUS_API'")
    active: bool = True
    display_order: int = 1
    banner_url: Optional[str] = None
    banner_mobile_url: Optional[str] = None
    logo_url: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

class DynamicShowcaseCreate(DynamicShowcaseBase):
    pass

class DynamicShowcaseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    search_source: Optional[str] = None
    active: Optional[bool] = None
    display_order: Optional[int] = None
    banner_url: Optional[str] = None
    banner_mobile_url: Optional[str] = None
    logo_url: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

class DynamicShowcaseItemProduct(BaseModel):
    id: int
    name: str
    sku: Optional[str] = None
    ean_gtin: Optional[str] = None
    base_price: float = 0.0
    promotional_price: Optional[float] = None
    brand: Optional[str] = None
    cover_url: Optional[str] = None
    stock_quantity: int = 0
    status: Optional[str] = None

    class Config:
        from_attributes = True

class DynamicShowcaseItemResponse(BaseModel):
    id: int
    showcase_id: int
    product_id: int
    position: int
    created_at: Optional[datetime] = None
    product: Optional[DynamicShowcaseItemProduct] = None

    class Config:
        from_attributes = True

class DynamicShowcaseResponse(DynamicShowcaseBase):
    id: int
    company_id: int
    items_count: int = 0
    is_currently_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class DynamicShowcaseDetailResponse(DynamicShowcaseResponse):
    items: List[DynamicShowcaseItemResponse] = []

class AddItemRequest(BaseModel):
    product_id: Optional[int] = None
    # Dados para auto-cadastro do Horus caso não exista no Cronuz
    horus_cod_item: Optional[int] = None
    isbn: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    publisher: Optional[str] = None
    category_name: Optional[str] = None
    cover_url: Optional[str] = None
    base_price: Optional[float] = 0.0
    promotional_price: Optional[float] = None
    stock_quantity: Optional[int] = 0

class ReorderItemRequest(BaseModel):
    product_ids: List[int]

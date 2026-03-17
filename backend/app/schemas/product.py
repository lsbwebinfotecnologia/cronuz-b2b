from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.product import ProductStatus
from app.schemas.catalog_support import CategoryResponse, BrandResponse

class ProductBase(BaseModel):
    sku: str
    name: str
    short_description: Optional[str] = None
    long_description: Optional[str] = None
    base_price: float = 0.0
    promotional_price: Optional[float] = None
    cost_price: Optional[float] = None
    weight_kg: Optional[float] = None
    width_cm: Optional[float] = None
    height_cm: Optional[float] = None
    length_cm: Optional[float] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    ean_gtin: Optional[str] = None
    category_id: Optional[int] = None
    brand_id: Optional[int] = None
    status: Optional[str] = ProductStatus.ACTIVE.value
    stock_quantity: int = 0
    allow_purchase: Optional[bool] = None
    stock_status_label: Optional[str] = None

class ProductCreate(ProductBase):
    pass

class ProductUpdate(BaseModel):
    sku: Optional[str] = None
    name: Optional[str] = None
    short_description: Optional[str] = None
    long_description: Optional[str] = None
    base_price: Optional[float] = None
    promotional_price: Optional[float] = None
    cost_price: Optional[float] = None
    weight_kg: Optional[float] = None
    width_cm: Optional[float] = None
    height_cm: Optional[float] = None
    length_cm: Optional[float] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    ean_gtin: Optional[str] = None
    category_id: Optional[int] = None
    brand_id: Optional[int] = None
    status: Optional[str] = None
    stock_quantity: Optional[int] = None

class ProductResponse(ProductBase):
    id: int
    company_id: int
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    category: Optional[CategoryResponse] = None
    brand_rel: Optional[BrandResponse] = None

    class Config:
        from_attributes = True

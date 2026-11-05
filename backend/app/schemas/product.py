from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.product import ProductStatus
from app.schemas.catalog_support import CategoryResponse, BrandResponse, ProductCharacteristicCreate, ProductCharacteristicResponse
from typing import List

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
    cover_url: Optional[str] = None
    horus_cod_item: Optional[int] = None
    launch_date: Optional[datetime] = None
    is_pre_sale: Optional[bool] = False
    is_out_of_print: Optional[bool] = False
    is_ebook: Optional[bool] = False
    additional_isbns: Optional[str] = None
    barcode: Optional[str] = None
    cod_dbm: Optional[str] = None
    publisher_code: Optional[str] = None
    pages: Optional[int] = None
    launch_month: Optional[int] = None
    launch_year: Optional[int] = None
    collection: Optional[str] = None
    subject: Optional[str] = None
    binding_finish: Optional[str] = None
    royalty_rule: Optional[str] = None
    edition_number: Optional[str] = None
    units_per_box: Optional[int] = None
    out_of_print_date: Optional[str] = None
    external_link: Optional[str] = None
    royalty_company: Optional[str] = None
    ebook_royalty_pct: Optional[float] = None
    contract_signed_date: Optional[str] = None
    contract_validity_years: Optional[int] = None
    contract_expires_date: Optional[str] = None
    dbm_tiragens: Optional[str] = None

class ProductCreate(ProductBase):
    characteristics: Optional[List[ProductCharacteristicCreate]] = []

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
    allow_purchase: Optional[bool] = None
    stock_status_label: Optional[str] = None
    cover_url: Optional[str] = None
    horus_cod_item: Optional[int] = None
    launch_date: Optional[datetime] = None
    is_pre_sale: Optional[bool] = None
    is_out_of_print: Optional[bool] = None
    is_ebook: Optional[bool] = None
    additional_isbns: Optional[str] = None
    barcode: Optional[str] = None
    cod_dbm: Optional[str] = None
    publisher_code: Optional[str] = None
    pages: Optional[int] = None
    launch_month: Optional[int] = None
    launch_year: Optional[int] = None
    collection: Optional[str] = None
    subject: Optional[str] = None
    binding_finish: Optional[str] = None
    royalty_rule: Optional[str] = None
    edition_number: Optional[str] = None
    units_per_box: Optional[int] = None
    out_of_print_date: Optional[str] = None
    external_link: Optional[str] = None
    royalty_company: Optional[str] = None
    ebook_royalty_pct: Optional[float] = None
    contract_signed_date: Optional[str] = None
    contract_validity_years: Optional[int] = None
    contract_expires_date: Optional[str] = None
    dbm_tiragens: Optional[str] = None
    characteristics: Optional[List[ProductCharacteristicCreate]] = []

class ProductResponse(ProductBase):
    id: int
    company_id: int
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    category: Optional[CategoryResponse] = None
    brand_rel: Optional[BrandResponse] = None
    characteristics: Optional[List[ProductCharacteristicResponse]] = []

    class Config:
        from_attributes = True


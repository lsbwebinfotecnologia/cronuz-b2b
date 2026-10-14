from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class ProductAddressBase(BaseModel):
    branch_id: int
    cod_local_estoque: Optional[str] = None
    isbn: str
    horus_cod_item: Optional[str] = None
    title: Optional[str] = None
    address: str
    notes: Optional[str] = None

class ProductAddressCreate(ProductAddressBase):
    pass

class ProductAddressUpdate(BaseModel):
    branch_id: Optional[int] = None
    cod_local_estoque: Optional[str] = None
    isbn: Optional[str] = None
    horus_cod_item: Optional[str] = None
    title: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None

class ProductAddressResponse(ProductAddressBase):
    id: int
    company_id: int
    created_by_user_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    branch_name: Optional[str] = None
    creator_name: Optional[str] = None

    class Config:
        from_attributes = True

class ProductAddressSyncItem(BaseModel):
    branch_id: int
    cod_local_estoque: Optional[str] = None
    isbn: str
    horus_cod_item: Optional[str] = None
    title: Optional[str] = None
    address: str
    notes: Optional[str] = None
    scanned_at: Optional[datetime] = None

class ProductAddressSyncBatchRequest(BaseModel):
    items: List[ProductAddressSyncItem]
    mode: Optional[str] = "append"  # "append" (default) or "replace"

class ProductAddressSyncBatchResponse(BaseModel):
    inserted_count: int
    updated_count: int
    total_received: int
    errors: List[str] = []

class ProductAddressUploadSummary(BaseModel):
    total_rows: int
    inserted: int
    updated: int
    skipped: int
    errors: List[str] = []

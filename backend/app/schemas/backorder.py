from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class QuickProductCreate(BaseModel):
    isbn: str = Field(..., max_length=50)
    title: str = Field(..., max_length=255)
    publisher: Optional[str] = Field(None, max_length=150)
    author: Optional[str] = Field(None, max_length=150)
    market_cover_price: Optional[float] = 0.0
    price_estimated: Optional[float] = 0.0
    synopsis: Optional[str] = None
    cover_url: Optional[str] = None

class BackorderCreate(BaseModel):
    isbn: str = Field(..., max_length=50)
    title: str = Field(..., max_length=255)
    publisher: Optional[str] = None
    author: Optional[str] = None
    quantity: int = Field(1, ge=1)
    cover_url: Optional[str] = None
    price_estimated: Optional[float] = 0.0
    has_erp_registration: bool = False
    horus_cod_item: Optional[int] = None
    origin: str = "BUSCA_PRECO"
    notes: Optional[str] = None

    # Dados do cliente
    customer_id: Optional[int] = None
    customer_document: Optional[str] = None # CPF/CNPJ
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None

class BackorderUpdateStatus(BaseModel):
    status: str # PENDING, GROUPED, ORDER_PLACED, RECEIVED, NOTIFIED, COMPLETED, CANCELLED
    notes: Optional[str] = None

class BackorderCustomerBrief(BaseModel):
    id: int
    name: str
    document: str
    phone: Optional[str] = None
    email: Optional[str] = None

    class Config:
        from_attributes = True

class BackorderResponse(BaseModel):
    id: int
    company_id: int
    customer_id: Optional[int] = None
    customer: Optional[BackorderCustomerBrief] = None
    isbn: str
    title: str
    publisher: Optional[str] = None
    author: Optional[str] = None
    quantity: int
    cover_url: Optional[str] = None
    price_estimated: Optional[float] = None
    status: str
    origin: str
    has_erp_registration: bool
    horus_cod_item: Optional[int] = None
    suggested_supplier_id: Optional[int] = None
    purchase_order_id: Optional[int] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

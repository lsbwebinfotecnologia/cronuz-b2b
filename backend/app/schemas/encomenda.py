from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from decimal import Decimal

class CustomerEncomendaItemCreate(BaseModel):
    isbn: str
    title: str
    publisher: Optional[str] = None
    author: Optional[str] = None
    cover_url: Optional[str] = None
    quantity: int = Field(1, ge=1)
    unit_price: Decimal = Field(Decimal("0.00"), ge=0)
    horus_cod_item: Optional[int] = None
    suggested_supplier_id: Optional[int] = None

class CustomerEncomendaItemResponse(BaseModel):
    id: int
    encomenda_id: int
    isbn: str
    title: str
    publisher: Optional[str] = None
    author: Optional[str] = None
    cover_url: Optional[str] = None
    quantity: int
    unit_price: Decimal
    total_price: Decimal
    horus_cod_item: Optional[int] = None
    suggested_supplier_id: Optional[int] = None
    status: str
    purchase_order_id: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class CustomerEncomendaCreate(BaseModel):
    customer_id: Optional[int] = None
    customer_name: str
    customer_document: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None

    delivery_type: str = "BALCAO"  # 'BALCAO' ou 'ENTREGA'
    pickup_branch_name: Optional[str] = None

    shipping_zip_code: Optional[str] = None
    shipping_street: Optional[str] = None
    shipping_number: Optional[str] = None
    shipping_complement: Optional[str] = None
    shipping_neighborhood: Optional[str] = None
    shipping_city: Optional[str] = None
    shipping_state: Optional[str] = None

    notes: Optional[str] = None
    items: List[CustomerEncomendaItemCreate]

class CustomerEncomendaUpdateStatus(BaseModel):
    status: str
    notes: Optional[str] = None

class CustomerEncomendaResponse(BaseModel):
    id: int
    company_id: int
    encomenda_number: str
    customer_id: Optional[int] = None
    customer_name: str
    customer_document: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None

    delivery_type: str
    pickup_branch_name: Optional[str] = None

    shipping_zip_code: Optional[str] = None
    shipping_street: Optional[str] = None
    shipping_number: Optional[str] = None
    shipping_complement: Optional[str] = None
    shipping_neighborhood: Optional[str] = None
    shipping_city: Optional[str] = None
    shipping_state: Optional[str] = None

    status: str
    total_items: int
    total_amount: Decimal
    notes: Optional[str] = None
    created_by: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    items: List[CustomerEncomendaItemResponse] = []

    class Config:
        from_attributes = True

class CustomerEncomendaMetrics(BaseModel):
    total_open: int
    total_ordered: int
    total_received: int
    total_delivered: int
    total_items: int
    total_amount: Decimal

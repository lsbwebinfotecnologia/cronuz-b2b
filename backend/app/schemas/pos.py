from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class POSSessionCreate(BaseModel):
    title: str
    catalog_source: Optional[str] = "GENERAL"  # CONSIGNMENT, HORUS_CATALOG, CRONUZ_CATALOG, SPREADSHEET, GENERAL
    source_reference: Optional[str] = None
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    customer_document: Optional[str] = None
    notes: Optional[str] = None


class POSSessionResponse(BaseModel):
    id: int
    code: str
    title: str
    status: str
    catalog_source: str
    source_reference: Optional[str] = None
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    customer_document: Optional[str] = None
    total_sales_count: int
    total_sales_amount: float
    products_count: Optional[int] = 0
    opened_at: datetime
    closed_at: Optional[datetime] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class POSSessionProductOut(BaseModel):
    id: Optional[int] = None
    session_id: Optional[int] = None
    barcode: str
    sku: Optional[str] = None
    title: str
    publisher: Optional[str] = None
    price: float
    stock: float
    horus_item_code: Optional[str] = None
    product_id: Optional[int] = None
    source: Optional[str] = "SPREADSHEET"

    class Config:
        from_attributes = True


class POSSessionProductsListResponse(BaseModel):
    session_id: int
    count: int
    catalog_source: Optional[str] = "GENERAL"
    items: List[POSSessionProductOut]


class POSSaleItemSchema(BaseModel):
    barcode: str
    sku: Optional[str] = None
    title: str
    publisher: Optional[str] = None
    quantity: float
    unit_price: float
    total_price: float
    horus_item_code: Optional[str] = None
    product_id: Optional[int] = None


class POSSaleCreate(BaseModel):
    client_sale_uuid: str
    sale_number: Optional[str] = None
    session_id: Optional[int] = None
    customer_name: Optional[str] = "Consumidor Final"
    customer_document: Optional[str] = None
    customer_id: Optional[int] = None
    payment_method: str = "DINHEIRO"
    payment_details: Optional[str] = None
    subtotal: float
    discount: float = 0.0
    total_amount: float
    items_count: int
    sold_at: datetime
    origin: str = "pdv_offline"
    notes: Optional[str] = None
    items: List[POSSaleItemSchema]


class POSSyncBatchRequest(BaseModel):
    sales: List[POSSaleCreate]
    session_id: Optional[int] = None


class POSSyncBatchResponse(BaseModel):
    total_received: int
    success_count: int
    already_synced_count: int
    failed_count: int
    synced_uuids: List[str]
    errors: List[dict]

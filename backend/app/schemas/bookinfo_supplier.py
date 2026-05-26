from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class SupplierBase(BaseModel):
    supplier_name: Optional[str] = None
    document_origin: Optional[str] = None
    document_destination: Optional[str] = None
    start_date: Optional[datetime] = None
    status_pedido_compra: Optional[str] = 'AE'
    integrador_compra: Optional[str] = 'BOOKINFO'
    last_sync_at: Optional[datetime] = None

class SupplierCreate(SupplierBase):
    pass

class SupplierUpdate(SupplierBase):
    pass

class SupplierResponse(SupplierBase):
    id: int
    company_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

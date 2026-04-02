from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class BookinfoQueueOrderResponse(BaseModel):
    id: int
    tracking_code: Optional[str] = None
    external_id: Optional[str] = None
    horus_pedido_venda: Optional[str] = None
    partner_reference: Optional[str] = None
    status: str
    total: float
    created_at: datetime
    customer_name: Optional[str] = None
    invoice_key: Optional[str] = None

class BookinfoQueueListResponse(BaseModel):
    items: List[BookinfoQueueOrderResponse]

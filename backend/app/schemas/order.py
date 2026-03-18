from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime

class OrderLogResponse(BaseModel):
    id: int
    old_status: Optional[str]
    new_status: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class OrderInteractionCreate(BaseModel):
    message: str

class OrderInteractionResponse(BaseModel):
    id: int
    user_type: str
    user_id: Optional[int]
    customer_id: Optional[int]
    message: str
    created_at: datetime
    read_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class OrderItemBase(BaseModel):
    product_id: Optional[int] = None
    ean_isbn: Optional[str] = None
    sku: Optional[str] = None
    name: Optional[str] = None
    brand: Optional[str] = None
    quantity: int = 1
    quantity_requested: int = 1
    quantity_fulfilled: int = 0
    unit_price: float = 0.0

class OrderItemCreate(OrderItemBase):
    pass

class OrderItemUpdate(BaseModel):
    quantity: Optional[int] = None

class OrderItemResponse(OrderItemBase):
    id: int
    order_id: int
    total_price: float

    class Config:
        from_attributes = True

class OrderBase(BaseModel):
    status: Optional[str] = "NEW"
    sync_status: Optional[str] = "PENDING"
    origin: Optional[str] = "store"
    type_order: Optional[str] = "V"
    horus_pedido_venda: Optional[str] = None
    subtotal: Optional[float] = 0.0
    discount: Optional[float] = 0.0
    total: Optional[float] = 0.0
    agent_id: Optional[int] = None

class OrderCreate(OrderBase):
    pass

class OrderResponse(OrderBase):
    id: int
    company_id: int
    customer_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    items: List[OrderItemResponse] = []
    logs: List[OrderLogResponse] = []
    interactions: List[OrderInteractionResponse] = []
    
    class Config:
        from_attributes = True

class CheckoutRequest(BaseModel):
    type_order: str = "V"

class PDVOrderItem(BaseModel):
    product_id: int
    quantity: int
    unit_price: float

class PDVOrderCreate(BaseModel):
    customer_id: int
    items: List[PDVOrderItem]
    total_amount: float
    payment_method: str
    discount_amount: float
    status: str
    source: str


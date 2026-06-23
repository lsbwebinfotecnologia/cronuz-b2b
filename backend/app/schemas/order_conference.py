from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class OrderConferenceVolumeItemBase(BaseModel):
    isbn: str
    name: str
    quantity: int

class OrderConferenceVolumeItemResponse(OrderConferenceVolumeItemBase):
    id: int
    volume_id: int

    class Config:
        from_attributes = True

class OrderConferenceVolumeBase(BaseModel):
    volume_number: int
    barcode: str

class OrderConferenceVolumeCreate(BaseModel):
    volume_number: int

class OrderConferenceVolumeResponse(OrderConferenceVolumeBase):
    id: int
    conference_id: int
    weight: Optional[float] = None
    status: str
    created_at: datetime
    items: List[OrderConferenceVolumeItemResponse] = []

    class Config:
        from_attributes = True

class OrderConferenceBase(BaseModel):
    cod_cli: str
    cod_pedido_origem: str
    status: str

class OrderConferenceResponse(OrderConferenceBase):
    id: int
    company_id: int
    branch_id: int
    cod_ped_venda: Optional[str] = None  # persistido na criação da sessão
    created_at: datetime
    updated_at: datetime
    volumes: List[OrderConferenceVolumeResponse] = []

    class Config:
        from_attributes = True

class OrderConferenceStartRequest(BaseModel):
    branch_id: int
    cod_cli: str
    cod_pedido_origem: str

class OrderConferenceItemSubmitRequest(BaseModel):
    isbn: str
    name: str
    quantity: int
    cod_item: str
    cod_ped_venda: str

from pydantic import BaseModel
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime
from app.models.service import ServiceOrderStatus, ServiceOrderNfseStatus

class ServiceBase(BaseModel):
    name: str
    default_description: Optional[str] = None
    base_value: float = 0.0
    category_id: Optional[int] = None
    
    codigo_lc116: Optional[str] = None
    cnae: Optional[str] = None
    aliquota_iss: Optional[float] = None
    
    reter_iss: bool = False
    reter_inss: bool = False
    reter_ir: bool = False
    reter_pis: bool = False
    reter_cofins: bool = False
    reter_csll: bool = False

class ServiceCreate(ServiceBase):
    pass

class ServiceUpdate(ServiceBase):
    name: Optional[str] = None
    base_value: Optional[float] = None

class ServiceResponse(ServiceBase):
    id: int
    company_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class ServiceOrderBase(BaseModel):
    customer_id: int
    service_id: int
    negotiated_value: float
    custom_description: Optional[str] = None
    execution_date: date
    status: ServiceOrderStatus = ServiceOrderStatus.PENDING
    status_nfse: ServiceOrderNfseStatus = ServiceOrderNfseStatus.NOT_ISSUED
    is_recurrent: bool = False
    recurrence_end_date: Optional[date] = None

class ServiceOrderCreate(ServiceOrderBase):
    pass

class ServiceOrderUpdate(BaseModel):
    negotiated_value: Optional[float] = None
    custom_description: Optional[str] = None
    execution_date: Optional[date] = None
    status: Optional[ServiceOrderStatus] = None
    status_nfse: Optional[ServiceOrderNfseStatus] = None
    is_recurrent: Optional[bool] = None
    recurrence_end_date: Optional[date] = None

class ServiceOrderResponse(ServiceOrderBase):
    id: int
    local_id: Optional[int] = None
    company_id: int
    created_at: datetime
    
    customer_name: Optional[str] = None
    service_name: Optional[str] = None
    nfse_number: Optional[str] = None
    pdf_url: Optional[str] = None
    
    class Config:
        from_attributes = True

class ServiceOrderBillRequest(BaseModel):
    installments_count: int
    first_due_date: date
    account_id: Optional[int] = None
    print_point_id: Optional[int] = None

class ServiceOrderBulkStatusRequest(BaseModel):
    order_ids: List[int]
    status: ServiceOrderStatus

class ServiceOrderBulkBillRequest(BaseModel):
    order_ids: List[int]
    installments_count: int
    first_due_date: date
    account_id: Optional[int] = None
    print_point_id: Optional[int] = None

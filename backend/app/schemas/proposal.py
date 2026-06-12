from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import date, datetime

# --- Proposal Item ---

class ProposalItemBase(BaseModel):
    item_type: str = Field(..., description="PRODUCT or SERVICE")
    product_id: Optional[int] = None
    service_id: Optional[int] = None
    quantity: float = 1.0
    unit_price: float = 0.0
    discount: float = 0.0
    total_price: float = 0.0
    custom_description: Optional[str] = None

class ProposalItemCreate(ProposalItemBase):
    pass

class ProposalItemProductDetail(BaseModel):
    id: int
    name: str
    sku: str

    class Config:
        from_attributes = True

class ProposalItemServiceDetail(BaseModel):
    id: int
    name: str
    description: Optional[str] = None

    class Config:
        from_attributes = True

class ProposalItemResponse(ProposalItemBase):
    id: int
    proposal_id: int
    product: Optional[ProposalItemProductDetail] = None
    service: Optional[ProposalItemServiceDetail] = None

    class Config:
        from_attributes = True


# --- Proposal ---

class ProposalBase(BaseModel):
    title: str
    valid_from: date
    valid_until: date
    relation_type: str = Field(..., description="CUSTOMER, LEAD, MANUAL")
    
    customer_id: Optional[int] = None
    lead_id: Optional[str] = None
    
    manual_name: Optional[str] = None
    manual_document: Optional[str] = None
    manual_email: Optional[str] = None
    manual_phone: Optional[str] = None

    discount: float = 0.0
    shipping_cost: float = 0.0

    payment_method: Optional[str] = None
    payment_condition: Optional[str] = None
    notes: Optional[str] = None

class ProposalCreate(ProposalBase):
    items: List[ProposalItemCreate]

class ProposalUpdate(ProposalBase):
    items: List[ProposalItemCreate]

class ProposalCompanyDetail(BaseModel):
    id: int
    name: str
    module_proposals: bool

    class Config:
        from_attributes = True

class ProposalResponse(ProposalBase):
    id: int
    local_id: int
    company_id: int
    status: str
    subtotal: float
    total: float
    company: Optional[ProposalCompanyDetail] = None
    
    converted_at: Optional[datetime] = None
    converted_by_user_id: Optional[int] = None
    
    created_at: datetime
    updated_at: datetime
    
    signature_name: Optional[str] = None
    signature_document: Optional[str] = None
    signature_email: Optional[str] = None
    signature_ip: Optional[str] = None
    signature_at: Optional[datetime] = None
    signature_user_agent: Optional[str] = None

    items: List[ProposalItemResponse]

    class Config:
        from_attributes = True

class ProposalMetricsSchema(BaseModel):
    total_count: int
    converted_count: int
    accepted_count: int
    sent_count: int
    draft_count: int
    total_value: float
    converted_value: float

class ProposalListResponse(BaseModel):
    items: List[ProposalResponse]
    total: int
    metrics: Optional[ProposalMetricsSchema] = None

    class Config:
        from_attributes = True

class ProposalSignRequest(BaseModel):
    name: str
    document: str
    email: str


# --- Conversion & Promotion Wizard ---

class ProposalConvertRequest(BaseModel):
    # Customer promotion info (required if relation_type is LEAD or MANUAL)
    customer_name: Optional[str] = None
    customer_document: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_type: Optional[str] = "PJ" # PF or PJ
    
    # Billing address
    address_street: Optional[str] = None
    address_number: Optional[str] = None
    address_complement: Optional[str] = None
    address_neighborhood: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_zip_code: Optional[str] = None
    address_ibge_code: Optional[str] = None

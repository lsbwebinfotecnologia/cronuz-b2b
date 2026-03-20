from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class CompanyBase(BaseModel):
    name: str
    document: str
    domain: str
    custom_domain: Optional[str] = None
    logo: Optional[str] = None
    
    zip_code: Optional[str] = None
    street: Optional[str] = None
    number: Optional[str] = None
    complement: Optional[str] = None
    neighborhood: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None

    module_horus_erp: bool = False
    module_subscriptions: bool = False
    module_pdv: bool = False
    active: bool = True

class CompanyCreate(CompanyBase):
    lead_id: Optional[str] = None

class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    horus_company: Optional[str] = None
    horus_branch: Optional[str] = None
    horus_default_b2b_guid: Optional[str] = None
    horus_api_mode: Optional[str] = "B2B"
    bookinfo_api_key: Optional[str] = None
    
    zip_code: Optional[str] = None
    street: Optional[str] = None
    number: Optional[str] = None
    complement: Optional[str] = None
    neighborhood: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    module_horus_erp: Optional[bool] = None
    module_subscriptions: Optional[bool] = None
    module_pdv: Optional[bool] = None
    active: Optional[bool] = None

class CompanyInDBBase(CompanyBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class Company(CompanyInDBBase):
    pass

from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class AddressBase(BaseModel):
    street: str
    number: str
    complement: Optional[str] = None
    neighborhood: str
    city: str
    state: str
    zip_code: str
    type: Optional[str] = "MAIN"

class AddressCreate(AddressBase):
    pass

class Address(AddressBase):
    id: int
    customer_id: int
    class Config:
        from_attributes = True

class ContactBase(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None

class ContactCreate(ContactBase):
    pass

class Contact(ContactBase):
    id: int
    customer_id: int
    class Config:
        from_attributes = True

class CustomerBase(BaseModel):
    name: str # Nome Fantasia
    corporate_name: Optional[str] = None # Razão Social
    document: str
    state_registration: Optional[str] = None # IE
    email: Optional[str] = None
    phone: Optional[str] = None
    customer_type: Optional[str] = "PJ" # PF, PJ
    credit_limit: Optional[float] = 0.0
    discount: Optional[float] = 0.0
    consignment_status: Optional[str] = "INACTIVE"
    open_debts: Optional[float] = 0.0
    id_guid: Optional[str] = None
    id_doc: Optional[str] = None
    default_payment_method: Optional[str] = "ERP_STANDARD"

class CustomerCreate(CustomerBase):
    addresses: Optional[list[AddressCreate]] = []
    contacts: Optional[list[ContactCreate]] = []

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    corporate_name: Optional[str] = None
    document: Optional[str] = None
    state_registration: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    customer_type: Optional[str] = None
    credit_limit: Optional[float] = None
    discount: Optional[float] = None
    consignment_status: Optional[str] = None
    open_debts: Optional[float] = None
    id_guid: Optional[str] = None
    id_doc: Optional[str] = None
    default_payment_method: Optional[str] = None

class CustomerInDBBase(CustomerBase):
    id: int
    company_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class Customer(CustomerInDBBase):
    addresses: list[Address] = []
    contacts: list[Contact] = []

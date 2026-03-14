from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class CompanyBase(BaseModel):
    name: str
    document: str
    email: Optional[EmailStr] = None
    domain: str
    logo: Optional[str] = None
    active: bool = True

class CompanyCreate(CompanyBase):
    pass

class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    document: Optional[str] = None
    email: Optional[EmailStr] = None
    domain: Optional[str] = None
    logo: Optional[str] = None
    active: Optional[bool] = None

class CompanyInDBBase(CompanyBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class Company(CompanyInDBBase):
    pass

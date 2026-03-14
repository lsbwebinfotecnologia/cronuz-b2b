from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class CompanyBase(BaseModel):
    nome_fantasia: str
    razao_social: str
    cnpj: str
    inscricao_estadual: Optional[str] = None
    email_contato: Optional[EmailStr] = None
    telefone: Optional[str] = None
    ativo: bool = True

class CompanyCreate(CompanyBase):
    pass

class CompanyUpdate(BaseModel):
    nome_fantasia: Optional[str] = None
    razao_social: Optional[str] = None
    inscricao_estadual: Optional[str] = None
    email_contato: Optional[EmailStr] = None
    telefone: Optional[str] = None
    ativo: Optional[bool] = None

class CompanyInDBBase(CompanyBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class Company(CompanyInDBBase):
    pass

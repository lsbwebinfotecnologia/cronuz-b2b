from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class SellerBranchBase(BaseModel):
    nome: str
    cnpj: Optional[str] = None
    cod_empresa: str
    cod_filial: str
    active: bool = True

class SellerBranchCreate(SellerBranchBase):
    pass

class SellerBranchUpdate(BaseModel):
    nome: Optional[str] = None
    cnpj: Optional[str] = None
    cod_empresa: Optional[str] = None
    cod_filial: Optional[str] = None
    active: Optional[bool] = None

class SellerBranchResponse(SellerBranchBase):
    id: int
    company_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

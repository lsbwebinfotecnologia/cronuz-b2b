from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

class AuthorBase(BaseModel):
    cod_empresa: Optional[int] = None
    cod_filial: Optional[int] = None
    cod_fornecedor: int
    id_guid: str
    id_doc: str
    nome: str
    nome_fantasia: Optional[str] = None
    cnpj: Optional[str] = None
    cpf: Optional[str] = None
    insc_estadual: Optional[str] = None
    num_telefone: Optional[str] = None
    end_email: Optional[str] = None
    emailb2b: EmailStr
    classificacao_autor: Optional[str] = "Autor Principal"
    b2b_mostrar_vendas: Optional[str] = "S"
    b2b_mostrar_da: Optional[str] = "N"

class AuthorCreate(AuthorBase):
    send_activation_email: Optional[bool] = False

class AuthorUpdate(BaseModel):
    emailb2b: Optional[EmailStr] = None
    classificacao_autor: Optional[str] = None
    status: Optional[str] = None
    b2b_mostrar_vendas: Optional[str] = None
    b2b_mostrar_da: Optional[str] = None
    nome: Optional[str] = None
    nome_fantasia: Optional[str] = None
    num_telefone: Optional[str] = None

class AuthorResponse(AuthorBase):
    id: int
    company_id: int
    status: str
    last_login_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class AuthorListResponse(BaseModel):
    items: List[AuthorResponse]
    total: int
    page: int
    limit: int

# Horus search schemas
class HorusAuthorSearchItem(BaseModel):
    COD_EMPRESA: Optional[int] = None
    COD_FILIAL: Optional[int] = None
    COD_FORNECEDOR: int
    NOM_FORNECEDOR: str
    NOM_FANTASIA: Optional[str] = None
    CNPJ: Optional[str] = None
    CPF: Optional[str] = None
    INSC_ESTADUAL: Optional[str] = None
    INS_MUNICIPAL: Optional[str] = None
    RG: Optional[str] = None
    NUM_TELEFONE: Optional[str] = None
    END_EMAIL: Optional[str] = None
    EMAILB2B: Optional[str] = None
    STA_FORNECEDOR: Optional[str] = None
    NOM_CONTATO: Optional[str] = None
    ID_GUID: str
    B2B_MOSTRAR_VENDAS: Optional[str] = "S"
    B2B_MOSTRAR_DA: Optional[str] = "N"
    DAT_ULT_ATL: Optional[str] = None

# Portal Auth Schemas
class VerifyTokenRequest(BaseModel):
    token: str

class VerifyTokenResponse(BaseModel):
    valid: bool
    author_id: Optional[int] = None
    author_name: Optional[str] = None
    emailb2b: Optional[str] = None
    company_name: Optional[str] = None
    detail: Optional[str] = None

class SetPasswordRequest(BaseModel):
    token: str
    password: str

class AuthorLoginRequest(BaseModel):
    email: str
    password: str
    seller_slug: str

class AuthorLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    author: dict

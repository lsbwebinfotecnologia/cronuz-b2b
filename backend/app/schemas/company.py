from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class CompanyBase(BaseModel):
    name: str
    document: str
    domain: str
    custom_domain: Optional[str] = None
    tenant_id: Optional[str] = "cronuz"
    logo: Optional[str] = None
    login_background_url: Optional[str] = None
    favicon_url: Optional[str] = None
    seo_title: Optional[str] = None
    seo_description: Optional[str] = None
    
    operation_start_date: Optional[datetime] = None
    trial_days: Optional[int] = 0
    is_contract_signed: Optional[bool] = False
    monthly_fee: Optional[str] = None
    
    zip_code: Optional[str] = None
    street: Optional[str] = None
    number: Optional[str] = None
    complement: Optional[str] = None
    neighborhood: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None

    nfse_enabled: bool = False
    nfse_environment: str = "HOMOLOGACAO"
    nfse_next_number: int = 1
    nfse_default_print_point_id: Optional[int] = None
    nfse_async_mode: bool = True
    razao_social: Optional[str] = None
    inscricao_municipal: Optional[str] = None
    codigo_municipio_ibge: Optional[str] = None
    regime_tributario: Optional[str] = None
    optante_simples_nacional: bool = False
    nfse_sit_simples_nacional: Optional[str] = "1"
    cert_path: Optional[str] = None
    cert_password: Optional[str] = None

    module_b2b_native: bool = True
    module_horus_erp: bool = False
    module_products: bool = True
    module_customers: bool = True
    module_marketing: bool = False
    module_subscriptions: bool = False
    module_pdv: bool = False
    module_agents: bool = False
    module_financial: bool = False
    module_services: bool = False
    module_commercial: bool = False
    active: bool = True

class CompanyCreate(CompanyBase):
    lead_id: Optional[str] = None

class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    document: Optional[str] = None
    domain: Optional[str] = None
    custom_domain: Optional[str] = None
    tenant_id: Optional[str] = None
    login_background_url: Optional[str] = None
    logo: Optional[str] = None
    favicon_url: Optional[str] = None
    seo_title: Optional[str] = None
    seo_description: Optional[str] = None
    
    operation_start_date: Optional[datetime] = None
    trial_days: Optional[int] = None
    is_contract_signed: Optional[bool] = None
    monthly_fee: Optional[str] = None
    
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
    
    nfse_enabled: Optional[bool] = None
    nfse_environment: Optional[str] = None
    nfse_next_number: Optional[int] = None
    nfse_default_print_point_id: Optional[int] = None
    nfse_async_mode: Optional[bool] = None
    razao_social: Optional[str] = None
    inscricao_municipal: Optional[str] = None
    codigo_municipio_ibge: Optional[str] = None
    regime_tributario: Optional[str] = None
    optante_simples_nacional: Optional[bool] = None
    nfse_sit_simples_nacional: Optional[str] = None
    cert_path: Optional[str] = None
    cert_password: Optional[str] = None
    module_b2b_native: Optional[bool] = None
    module_horus_erp: Optional[bool] = None
    module_products: Optional[bool] = None
    module_customers: Optional[bool] = None
    module_marketing: Optional[bool] = None
    module_subscriptions: Optional[bool] = None
    module_pdv: Optional[bool] = None
    module_agents: Optional[bool] = None
    module_financial: Optional[bool] = None
    module_services: Optional[bool] = None
    module_commercial: Optional[bool] = None
    active: Optional[bool] = None

class CompanyInDBBase(CompanyBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class Company(CompanyInDBBase):
    pass

from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class CompanySettingsBase(BaseModel):
    horus_enabled: Optional[bool] = False
    horus_url: Optional[str] = None
    horus_port: Optional[str] = None
    horus_username: Optional[str] = None
    horus_password: Optional[str] = None
    horus_company: Optional[str] = None
    horus_branch: Optional[str] = None
    horus_default_b2b_guid: Optional[str] = None
    horus_api_mode: Optional[str] = "B2B"
    horus_legacy_pagination: Optional[bool] = False
    bookinfo_api_key: Optional[str] = None
    metabooks_api_key: Optional[str] = None
    cover_image_base_url: Optional[str] = None
    allow_backorder: Optional[bool] = False
    max_backorder_qty: Optional[int] = 0
    pdv_type: Optional[str] = "NON_FISCAL"
    pdv_allow_out_of_stock: Optional[bool] = False
    efi_sandbox: Optional[bool] = True
    efi_client_id: Optional[str] = None
    efi_client_secret: Optional[str] = None
    efi_payee_code: Optional[str] = None
    efi_certificate_path: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from_email: Optional[str] = None

class CompanySettingsUpdate(CompanySettingsBase):
    pass

class CompanySettingsInDBBase(CompanySettingsBase):
    id: int
    company_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class CompanySettings(CompanySettingsInDBBase):
    pass

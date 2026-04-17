from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime

class CompanySettingsBase(BaseModel):
    business_model: Optional[str] = "B2B_CRONUZ"
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
    horus_stock_local: Optional[str] = None
    horus_hide_zero_balance: Optional[bool] = False
    bookinfo_api_key: Optional[str] = None
    bookinfo_sync_enabled: Optional[bool] = False
    bookinfo_notify_processing_early: Optional[bool] = False
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
    
    payment_gateway_active: Optional[str] = "EFI"
    cielo_client_id: Optional[str] = None
    cielo_client_secret: Optional[str] = None
    cielo_merchant_id: Optional[str] = None
    rede_pv: Optional[str] = None
    rede_token: Optional[str] = None
    vindi_api_key: Optional[str] = None
    
    freight_gateway_active: Optional[str] = None
    origin_zip_code: Optional[str] = None
    correios_user: Optional[str] = None
    correios_password: Optional[str] = None
    frenet_token: Optional[str] = None
    jadlog_token: Optional[str] = None
    tray_envios_token: Optional[str] = None

    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from_email: Optional[str] = None
    b2b_showcases_config: Optional[Dict[str, Any]] = None
    b2b_show_stock_quantity: Optional[bool] = True

class CompanySettingsUpdate(CompanySettingsBase):
    pass

class CompanySettingsInDBBase(CompanySettingsBase):
    id: int
    company_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class CompanySettings(CompanySettingsInDBBase):
    pass

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
    horus_use_stock_location_filter: Optional[bool] = False  # True = envia SD_COD_EMPRESA/FILIAL/LOCAL_ESTOQUE; False = filtro geral via ID_DOC+ID_GUID
    horus_use_cronuz_discount: Optional[bool] = False  # Aplica customer.discount sobre VLR_CAPA (ignora VLR_LIQ_CLI do Horus)
    bookinfo_api_key: Optional[str] = None
    bookinfo_sync_enabled: Optional[bool] = False
    bookinfo_purchase_auto: Optional[bool] = False
    bookinfo_purchase_interval_minutes: Optional[int] = 15
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
    
    inter_enabled: Optional[bool] = False
    inter_sandbox: Optional[bool] = True
    inter_api_version: Optional[str] = "V2"
    inter_client_id: Optional[str] = None
    inter_client_secret: Optional[str] = None
    inter_cert_path: Optional[str] = None
    inter_key_path: Optional[str] = None
    inter_cert_content: Optional[str] = None
    inter_key_content: Optional[str] = None
    inter_account_number: Optional[str] = None
    
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
    smtp_bcc_email: Optional[str] = None
    smtp_use_ssl: Optional[bool] = False
    b2b_showcases_config: Optional[Dict[str, Any]] = None
    b2b_show_stock_quantity: Optional[bool] = True

    # Horus SQL Direct
    horus_sql_enabled: Optional[bool] = False
    horus_sql_host: Optional[str] = None
    horus_sql_port: Optional[str] = None
    horus_sql_database: Optional[str] = None
    horus_sql_username: Optional[str] = None
    horus_sql_password: Optional[str] = None  # nunca retornado em plaintext pela API
    horus_sql_cod_empresa: Optional[str] = None
    horus_sql_cod_filial: Optional[str] = None
    horus_sql_feature_vindi_baixa: Optional[bool] = False

    # Horus Banking Parameters (Borderô)
    horus_banco_forma_pagto: Optional[str] = None
    horus_banco_codigo: Optional[str] = None
    horus_banco_agencia: Optional[str] = None
    horus_banco_conta: Optional[str] = None
    horus_banco_carteira: Optional[str] = None


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

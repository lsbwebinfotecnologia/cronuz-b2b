from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base

class CompanySettings(Base):
    __tablename__ = "cmp_settings"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), unique=True, nullable=False)
    
    # Horus ERP Integration
    horus_enabled = Column(Boolean, default=False, nullable=False)
    horus_url = Column(String(255), nullable=True)
    horus_port = Column(String(50), nullable=True)
    horus_username = Column(String(255), nullable=True)
    horus_password = Column(String(255), nullable=True)
    horus_company = Column(String(50), nullable=True)
    horus_branch = Column(String(50), nullable=True)
    horus_default_b2b_guid = Column(String(100), nullable=True) # Fallback GUID for PDV and public searches
    horus_api_mode = Column(String(20), default='B2B', nullable=False) # 'B2B' or 'STANDARD'
    horus_legacy_pagination = Column(Boolean, default=False, nullable=False) # True = omit OFFSET and LIMIT
    horus_stock_local = Column(String(50), nullable=True)
    horus_hide_zero_balance = Column(Boolean, default=False, nullable=False)
    
    bookinfo_api_key = Column(String(255), nullable=True)
    bookinfo_sync_enabled = Column(Boolean, default=False, nullable=False) # Ligar/Desligar integracao automatica
    bookinfo_notify_processing_early = Column(Boolean, default=False, nullable=False) # True = avisar antes de faturar
    metabooks_api_key = Column(String(255), nullable=True)
    cover_image_base_url = Column(String(500), nullable=True)
    
    # Advanced Stock Config
    allow_backorder = Column(Boolean, default=False, nullable=False)
    max_backorder_qty = Column(Integer, default=0, nullable=False)
    
    # Point of Sale (PDV) Config
    pdv_type = Column(String(50), default='NON_FISCAL', nullable=False) # 'FISCAL' or 'NON_FISCAL'
    pdv_allow_out_of_stock = Column(Boolean, default=False, nullable=False)
    
    # Efí (Gerencianet) Pagamentos & Assinaturas
    efi_sandbox = Column(Boolean, default=True, nullable=False)
    efi_client_id = Column(String(255), nullable=True)
    efi_client_secret = Column(String(255), nullable=True)
    efi_payee_code = Column(String(255), nullable=True) 
    efi_certificate_path = Column(String(500), nullable=True)

    # SMTP Config (Transational Emails)
    smtp_host = Column(String(255), nullable=True)
    smtp_port = Column(Integer, nullable=True)
    smtp_username = Column(String(255), nullable=True)
    smtp_password = Column(String(255), nullable=True)
    smtp_from_email = Column(String(255), nullable=True)

    # Audit trail
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # B2B Dynamics
    b2b_showcases_config = Column(JSON, nullable=True)

    company = relationship("Company")

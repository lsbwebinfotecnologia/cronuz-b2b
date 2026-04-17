from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base

class Company(Base):
    __tablename__ = "cmp_company"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(String(50), nullable=False, default="cronuz", server_default="cronuz")
    name = Column(String(255), nullable=False)
    document = Column(String(50), unique=True, index=True, nullable=False) # CNPJ or other
    
    # Relationships
    users = relationship("User", back_populates="company")
    print_points = relationship("PrintPoint", back_populates="company", foreign_keys="PrintPoint.company_id")

    # B2B Configs
    domain = Column(String(255), unique=True, index=True, nullable=False)
    custom_domain = Column(String(255), unique=True, index=True, nullable=True)
    logo = Column(String(500), nullable=True)
    login_background_url = Column(String(500), nullable=True)
    favicon_url = Column(String(500), nullable=True)
    seo_title = Column(String(255), nullable=True)
    seo_description = Column(String(500), nullable=True)
    
    # Gestão de Contrato & Faturamento (Master Only)
    operation_start_date = Column(DateTime, nullable=True)
    trial_days = Column(Integer, nullable=True, default=0)
    is_contract_signed = Column(Boolean, nullable=True, default=False)
    monthly_fee = Column(String(50), nullable=True) # Using String/Decimal representation to avoid float issues
    
    # Address
    zip_code = Column(String(20), nullable=True)
    street = Column(String(255), nullable=True)
    number = Column(String(50), nullable=True)
    complement = Column(String(255), nullable=True)
    neighborhood = Column(String(255), nullable=True)
    city = Column(String(255), nullable=True)
    state = Column(String(50), nullable=True)
    
    # Module Capabilities (Toggles managed by MASTER)
    module_b2b_native = Column(Boolean, default=True, nullable=False)
    module_horus_erp = Column(Boolean, default=False, nullable=False)
    module_products = Column(Boolean, default=True, nullable=False)
    module_orders = Column(Boolean, default=True, nullable=False)
    module_customers = Column(Boolean, default=True, nullable=False)
    module_marketing = Column(Boolean, default=False, nullable=False)
    module_subscriptions = Column(Boolean, default=False, nullable=False)
    module_pdv = Column(Boolean, default=False, nullable=False)
    module_agents = Column(Boolean, default=False, nullable=False)
    module_financial = Column(Boolean, default=False, nullable=False)
    module_services = Column(Boolean, default=False, nullable=False)
    module_commercial = Column(Boolean, default=False, nullable=False)
    module_crm = Column(Boolean, default=False, nullable=False)
    module_consignment = Column(Boolean, default=False, nullable=False)
    
    # Fiscal Configs (NFS-e Padrão Nacional)
    nfse_enabled = Column(Boolean, default=False, nullable=False)
    nfse_environment = Column(String(50), default="HOMOLOGACAO", nullable=False)
    nfse_next_number = Column(Integer, default=1, nullable=False)
    nfse_async_mode = Column(Boolean, default=True)
    nfse_default_print_point_id = Column(Integer, ForeignKey("cmp_print_point.id"), nullable=True)

    razao_social = Column(String(255), nullable=True)
    inscricao_municipal = Column(String(50), nullable=True)
    codigo_municipio_ibge = Column(String(20), nullable=True)
    regime_tributario = Column(String(50), nullable=True)
    optante_simples_nacional = Column(Boolean, default=False)
    nfse_sit_simples_nacional = Column(String(5), nullable=True, default="1") # 1=Não Optante, 2=MEI, 3=ME/EPP
    cert_path = Column(String(500), nullable=True)
    cert_password = Column(String(255), nullable=True)
    
    active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.db.session import Base

class Company(Base):
    __tablename__ = "cmp_company"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    document = Column(String(50), unique=True, index=True, nullable=False) # CNPJ or other
    
    # B2B Configs
    domain = Column(String(255), unique=True, index=True, nullable=False)
    custom_domain = Column(String(255), unique=True, index=True, nullable=True)
    logo = Column(String(500), nullable=True)
    
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
    module_customers = Column(Boolean, default=True, nullable=False)
    module_marketing = Column(Boolean, default=False, nullable=False)
    module_subscriptions = Column(Boolean, default=False, nullable=False)
    module_pdv = Column(Boolean, default=False, nullable=False)
    module_agents = Column(Boolean, default=False, nullable=False)
    
    active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

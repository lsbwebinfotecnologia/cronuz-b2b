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
    
    # Module Capabilities (Toggles managed by MASTER)
    module_horus_erp = Column(Boolean, default=False, nullable=False)
    module_subscriptions = Column(Boolean, default=False, nullable=False)
    module_pdv = Column(Boolean, default=False, nullable=False)
    
    active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

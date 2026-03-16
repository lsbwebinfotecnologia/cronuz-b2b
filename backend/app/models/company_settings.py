from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean
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
    
    bookinfo_api_key = Column(String(255), nullable=True)
    metabooks_api_key = Column(String(255), nullable=True)
    cover_image_base_url = Column(String(500), nullable=True)
    
    # Audit trail
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    company = relationship("Company")

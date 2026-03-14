from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base

class CompanySettings(Base):
    __tablename__ = "cmp_settings"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), unique=True, nullable=False)
    
    # Integration Keys
    horus_api_key = Column(String(255), nullable=True)
    horus_endpoint = Column(String(255), nullable=True)
    
    bookinfo_api_key = Column(String(255), nullable=True)
    metabooks_api_key = Column(String(255), nullable=True)
    
    # Audit trail
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    company = relationship("Company")

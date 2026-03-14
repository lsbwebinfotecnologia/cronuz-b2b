from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base

class Customer(Base):
    __tablename__ = "crm_customer"

    id = Column(Integer, primary_key=True, index=True)
    
    # Who "owns" this customer profile
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False)
    
    name = Column(String(255), nullable=False)
    document = Column(String(50), nullable=False, index=True) # CNPJ
    
    # B2B Financial Data
    credit_limit = Column(Float, default=0.0, nullable=False)
    open_debts = Column(Float, default=0.0, nullable=False)
    consignment_status = Column(String(50), default="INACTIVE", nullable=False) # e.g., ACTIVE, BLOCKED, INACTIVE
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    company = relationship("Company")

    # In a real system you'd also track which specific SELLER manages this account if needed:
    # seller_id = Column(Integer, ForeignKey("usr_user.id"), nullable=True)

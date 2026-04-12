from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base

class CommercialPolicy(Base):
    __tablename__ = "crm_commercial_policy"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False)
    
    name = Column(String(150), nullable=False)
    description = Column(String(500), nullable=True)
    
    # Regras Gerais Base
    discount_sale_percent = Column(Float, default=0.0, nullable=False)
    discount_consignment_percent = Column(Float, default=0.0, nullable=False)
    min_order_total = Column(Float, default=0.0, nullable=False)
    allow_consignment = Column(Boolean, default=False, nullable=False)
    
    # Regras de Financeiro Fixas
    max_installments = Column(Integer, default=1, nullable=False)
    min_installment_value = Column(Float, default=50.0, nullable=False)
    
    is_active = Column(Boolean, default=True, nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    company = relationship("Company")
    customers = relationship("Customer", back_populates="commercial_policy")

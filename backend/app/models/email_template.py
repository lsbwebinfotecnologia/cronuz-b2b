from sqlalchemy import Column, Integer, String, Boolean, Text, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.db.session import Base

class SysEmailTemplate(Base):
    __tablename__ = "sys_email_template"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    
    type = Column(String(50), nullable=False, index=True) # FINANCIAL_INVOICE, FINANCIAL_LATE, SERVICE_ORDER, STOREFRONT_ORDER, CUSTOMER_WELCOME
    name = Column(String(100), nullable=False)
    
    subject = Column(String(255), nullable=False)
    body_template = Column(Text, nullable=False)
    
    variables_schema = Column(JSONB, nullable=False, default=[]) # Array of strings like ["{month}", "{customer_name}"]
    is_default = Column(Boolean, default=True, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

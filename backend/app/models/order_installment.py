from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Date
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base

class OrderInstallment(Base):
    __tablename__ = "ord_installment"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("crm_customer.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("ord_order.id", ondelete="CASCADE"), nullable=False, index=True)
    
    number = Column(Integer, nullable=False) # e.g. 1 (1/3), 2 (2/3)
    due_date = Column(Date, nullable=False)
    amount = Column(Float, nullable=False)
    
    status = Column(String(50), nullable=False, default="OPEN") # OPEN, PAID, OVERDUE, CANCELLED
    
    payment_date = Column(DateTime(timezone=True), nullable=True)
    amount_paid = Column(Float, default=0.0, nullable=False)
    classification_type = Column(String(100), default="RECEIVABLE", nullable=True) # Could be "CONTAS_A_RECEBER_VENDA", etc

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    company = relationship("Company")
    customer = relationship("Customer")
    order = relationship("Order")

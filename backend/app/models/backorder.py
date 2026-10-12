from sqlalchemy import Column, Integer, String, Numeric, ForeignKey, DateTime, Text, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base

class Backorder(Base):
    __tablename__ = "ord_backorder"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("crm_customer.id", ondelete="SET NULL"), nullable=True, index=True)

    isbn = Column(String(30), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    publisher = Column(String(150), nullable=True)
    author = Column(String(150), nullable=True)
    quantity = Column(Integer, nullable=False, default=1)
    cover_url = Column(Text, nullable=True)
    price_estimated = Column(Numeric(10, 2), nullable=True, default=0.00)

    # PENDING, GROUPED, ORDER_PLACED, RECEIVED, NOTIFIED, COMPLETED, CANCELLED
    status = Column(String(30), nullable=False, default="PENDING", index=True)
    origin = Column(String(30), nullable=False, default="BUSCA_PRECO")

    has_erp_registration = Column(Boolean, default=False)
    horus_cod_item = Column(Integer, nullable=True)

    suggested_supplier_id = Column(Integer, ForeignKey("spl_supplier.id", ondelete="SET NULL"), nullable=True)
    purchase_order_id = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)

    created_by = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relacionamentos com foreign_keys explícitas
    company = relationship("Company", foreign_keys=[company_id])
    customer = relationship("Customer", foreign_keys=[customer_id])
    supplier = relationship("BookinfoSupplier", foreign_keys=[suggested_supplier_id])
    creator = relationship("User", foreign_keys=[created_by])

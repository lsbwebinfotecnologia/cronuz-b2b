from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.db.session import Base

class BookinfoSupplier(Base):
    __tablename__ = "spl_supplier"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False)
    document_origin = Column(String(20), nullable=True)
    document_destination = Column(String(20), nullable=True)
    start_date = Column(DateTime, nullable=True)
    supplier_name = Column(String(255), nullable=True)
    
    # Configuration for searching purchase orders in Horus
    status_pedido_compra = Column(String(20), default='AE', nullable=True)
    integrador_compra = Column(String(50), default='BOOKINFO', nullable=True)
    last_sync_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

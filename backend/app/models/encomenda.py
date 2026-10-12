from sqlalchemy import Column, Integer, String, Numeric, ForeignKey, DateTime, Text, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base

class CustomerEncomenda(Base):
    __tablename__ = "ord_customer_encomenda"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    encomenda_number = Column(String(40), nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("crm_customer.id", ondelete="SET NULL"), nullable=True, index=True)
    customer_name = Column(String(255), nullable=False)
    customer_document = Column(String(50), nullable=True, index=True)
    customer_phone = Column(String(50), nullable=True)
    customer_email = Column(String(255), nullable=True)

    # Logística / Modalidade de Entrega
    delivery_type = Column(String(30), nullable=False, default="BALCAO")  # 'BALCAO' ou 'ENTREGA'
    pickup_branch_name = Column(String(150), nullable=True)

    # Endereço de Entrega
    shipping_zip_code = Column(String(20), nullable=True)
    shipping_street = Column(String(255), nullable=True)
    shipping_number = Column(String(50), nullable=True)
    shipping_complement = Column(String(100), nullable=True)
    shipping_neighborhood = Column(String(100), nullable=True)
    shipping_city = Column(String(100), nullable=True)
    shipping_state = Column(String(2), nullable=True)

    # Status e Totais
    # OPEN, PURCHASE_ORDERED, RECEIVED_AT_STORE, NOTIFIED, DELIVERED, CANCELLED
    status = Column(String(30), nullable=False, default="OPEN", index=True)
    total_items = Column(Integer, nullable=False, default=1)
    total_amount = Column(Numeric(10, 2), nullable=False, default=0.00)
    notes = Column(Text, nullable=True)

    created_by = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relacionamentos com foreign_keys explícitas
    company = relationship("Company", foreign_keys=[company_id])
    customer = relationship("Customer", foreign_keys=[customer_id])
    creator = relationship("User", foreign_keys=[created_by])
    items = relationship("CustomerEncomendaItem", back_populates="encomenda", cascade="all, delete-orphan", foreign_keys="CustomerEncomendaItem.encomenda_id")


class CustomerEncomendaItem(Base):
    __tablename__ = "ord_customer_encomenda_item"

    id = Column(Integer, primary_key=True, index=True)
    encomenda_id = Column(Integer, ForeignKey("ord_customer_encomenda.id", ondelete="CASCADE"), nullable=False, index=True)
    isbn = Column(String(30), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    publisher = Column(String(150), nullable=True)
    author = Column(String(150), nullable=True)
    cover_url = Column(Text, nullable=True)
    quantity = Column(Integer, nullable=False, default=1)
    unit_price = Column(Numeric(10, 2), nullable=False, default=0.00)
    total_price = Column(Numeric(10, 2), nullable=False, default=0.00)
    horus_cod_item = Column(Integer, nullable=True)

    # Suprimento / Fornecedor
    suggested_supplier_id = Column(Integer, ForeignKey("spl_supplier.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(30), nullable=False, default="PENDING")  # PENDING, ORDERED, RECEIVED, CANCELLED
    purchase_order_id = Column(Integer, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relacionamentos com foreign_keys explícitas
    encomenda = relationship("CustomerEncomenda", back_populates="items", foreign_keys=[encomenda_id])
    supplier = relationship("BookinfoSupplier", foreign_keys=[suggested_supplier_id])

from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Boolean, Date, CheckConstraint, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime

from app.db.session import Base

# Imports for SQLAlchemy string relationship resolution
from app.models.company import Company
from app.models.customer import Customer
from app.models.product import Product

class Order(Base):
    __tablename__ = "ord_order"
    __table_args__ = (
        UniqueConstraint('company_id', 'horus_pedido_venda', name='uix_ord_company_horus'),
        UniqueConstraint('company_id', 'external_id', name='uix_ord_company_external'),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False, index=True)
    customer_id = Column(Integer, ForeignKey("crm_customer.id"), nullable=False, index=True)
    agent_id = Column(Integer, ForeignKey("usr_user.id"), nullable=True, index=True) # The seller/agent who made the sale
    
    status = Column(String(50), nullable=False, default="NEW") # NEW, PROCESSING, SENT_TO_HORUS, CANCELLED
    type_order = Column(String(50), nullable=False, default="V") # V=Venda, C=Consignado
    origin = Column(String(50), nullable=False, default="store") # store, bookinfo, metabook, ml, shopee, amazon
    horus_pedido_venda = Column(String(100), nullable=True) # external reference ID (idErp)
    external_id = Column(String(100), nullable=True) # Used for Bookinfo ID, Hub IDs, etc (idOrderPartner)
    partner_reference = Column(String(100), nullable=True) # Used for Bookinfo Reference (idReference)

    tracking_code = Column(String(100), nullable=True)
    invoice_number = Column(String(100), nullable=True)
    invoice_key = Column(String(100), nullable=True)
    invoice_xml = Column(String, nullable=True) # Could be Text but String without limit works just as well in PG
    bookinfo_nfe_sent = Column(Boolean, nullable=False, default=False)

    subtotal = Column(Float, nullable=False, default=0.0)
    discount = Column(Float, nullable=False, default=0.0)
    total = Column(Float, nullable=False, default=0.0)
    payment_condition = Column(String(50), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationship to Company and Customer
    company = relationship("Company")
    customer = relationship("Customer")
    
    # Relationship to Items
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    
    # Interactions and Logs
    logs = relationship("OrderLog", back_populates="order", cascade="all, delete-orphan", order_by="OrderLog.created_at.desc()")
    interactions = relationship("OrderInteraction", back_populates="order", cascade="all, delete-orphan", order_by="OrderInteraction.created_at.asc()")

class OrderItem(Base):
    __tablename__ = "ord_order_item"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("ord_order.id"), nullable=False)
    
    product_id = Column(Integer, ForeignKey("prd_product.id"), nullable=True) # nullable if horus-only
    
    ean_isbn = Column(String(100), nullable=True) # for searching the right ERP item
    sku = Column(String(100), nullable=True) # for searching the right ERP item
    name = Column(String(255), nullable=True) 
    brand = Column(String(255), nullable=True) # Editora / Marca
    
    quantity = Column(Integer, nullable=False, default=1) # Keep for backward compat for a bit, or use requested
    quantity_requested = Column(Integer, nullable=False, default=1)
    quantity_fulfilled = Column(Integer, nullable=False, default=0)
    unit_price = Column(Float, nullable=False, default=0.0)
    total_price = Column(Float, nullable=False, default=0.0)

    # Relationships
    order = relationship("Order", back_populates="items")
    product = relationship("Product")

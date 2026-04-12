from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base

class Customer(Base):
    __tablename__ = "crm_customer"

    id = Column(Integer, primary_key=True, index=True)
    
    # Who "owns" this customer profile
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False)
    
    name = Column(String(255), nullable=False) # Nome Fantasia
    corporate_name = Column(String(255), nullable=True) # Razão Social
    document = Column(String(50), nullable=False, index=True) # CNPJ
    state_registration = Column(String(50), nullable=True) # IE Inscrição Estadual
    email = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    password_hash = Column(String(255), nullable=True) # Used for Customer Portal login
    customer_type = Column(String(20), default="PJ", nullable=False) # PF or PJ
    
    # Horus API references
    id_guid = Column(String(255), nullable=True)
    id_doc = Column(String(255), nullable=True)
    
    # B2B Financial Data
    credit_limit = Column(Float, default=0.0, nullable=False)
    discount = Column(Float, default=0.0, nullable=False)
    open_debts = Column(Float, default=0.0, nullable=False)
    consignment_status = Column(String(50), default="INACTIVE", nullable=False) # e.g., ACTIVE, BLOCKED, INACTIVE
    default_payment_method = Column(String(50), default="ERP_STANDARD", nullable=True) # ERP_STANDARD, EFI_PIX_CREDIT, PIX_MANUAL
    payment_condition = Column(String(50), nullable=True) # e.g. "30/60/90"
    commercial_policy_id = Column(Integer, ForeignKey("crm_commercial_policy.id", ondelete="SET NULL"), nullable=True)
    crm_status = Column(String(50), default="ACTIVE", nullable=False) # LEAD, NEGOTIATION, ACTIVE, BLOCKED, CHURN_ALERT
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    company = relationship("Company")
    commercial_policy = relationship("CommercialPolicy", back_populates="customers")
    addresses = relationship("Address", back_populates="customer", cascade="all, delete-orphan")
    contacts = relationship("Contact", back_populates="customer", cascade="all, delete-orphan")
    interactions = relationship("Interaction", back_populates="customer", cascade="all, delete-orphan")

class Address(Base):
    __tablename__ = "crm_address"
    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("crm_customer.id"), nullable=False)
    street = Column(String(255), nullable=False)
    number = Column(String(50), nullable=False)
    complement = Column(String(100), nullable=True)
    neighborhood = Column(String(100), nullable=False)
    city = Column(String(100), nullable=False)
    state = Column(String(2), nullable=False)
    zip_code = Column(String(20), nullable=False)
    type = Column(String(50), default="MAIN") # MAIN, BILLING, SHIPPING
    
    customer = relationship("Customer", back_populates="addresses")

class Contact(Base):
    __tablename__ = "crm_contact"
    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("crm_customer.id"), nullable=False)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    role = Column(String(100), nullable=True) # e.g. Financeiro, Compras
    
    customer = relationship("Customer", back_populates="contacts")

class Interaction(Base):
    __tablename__ = "crm_interaction"
    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("crm_customer.id"), nullable=False)
    seller_id = Column(Integer, ForeignKey("usr_user.id"), nullable=False) # Which seller logged this
    
    type = Column(String(50), nullable=False) # CALL, EMAIL, MEETING, NOTE, TASK
    content = Column(Text, nullable=False)
    
    due_date = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(50), default="COMPLETED", nullable=False) # PENDING, COMPLETED, CANCELLED

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    customer = relationship("Customer", back_populates="interactions")
    seller = relationship("User")

class CustomerFavorite(Base):
    __tablename__ = "crm_favorite"
    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("crm_customer.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(Integer, ForeignKey("prd_product.id", ondelete="CASCADE"), nullable=True) # If local product
    sku = Column(String(100), nullable=True) # If external horus product
    name = Column(String(255), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    customer = relationship("Customer")

class CustomerNotify(Base):
    __tablename__ = "crm_notify"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False)
    customer_id = Column(Integer, ForeignKey("crm_customer.id", ondelete="SET NULL"), nullable=True)
    
    email = Column(String(255), nullable=False)
    product_id = Column(Integer, ForeignKey("prd_product.id", ondelete="CASCADE"), nullable=True)
    sku = Column(String(100), nullable=True)
    name = Column(String(255), nullable=True)
    
    notified_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    company = relationship("Company")
    customer = relationship("Customer")

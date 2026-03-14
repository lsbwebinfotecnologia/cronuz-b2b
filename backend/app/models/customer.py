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
    
    # B2B Financial Data
    credit_limit = Column(Float, default=0.0, nullable=False)
    open_debts = Column(Float, default=0.0, nullable=False)
    consignment_status = Column(String(50), default="INACTIVE", nullable=False) # e.g., ACTIVE, BLOCKED, INACTIVE
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    company = relationship("Company")
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
    
    type = Column(String(50), nullable=False) # CALL, EMAIL, MEETING, NOTE
    content = Column(Text, nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    customer = relationship("Customer", back_populates="interactions")
    seller = relationship("User")

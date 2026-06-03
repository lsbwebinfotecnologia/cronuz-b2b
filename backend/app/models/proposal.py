from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Date, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.session import Base

class Proposal(Base):
    __tablename__ = "crm_proposal"
    __table_args__ = (
        UniqueConstraint('company_id', 'local_id', name='uix_proposal_company_local'),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False, index=True)
    local_id = Column(Integer, index=True, nullable=False) # Sequential ID per company

    title = Column(String(255), nullable=False)
    status = Column(String(50), nullable=False, default="DRAFT") # DRAFT, SENT, ACCEPTED, REJECTED, EXPIRED, CONVERTED
    
    valid_from = Column(Date, nullable=False)
    valid_until = Column(Date, nullable=False)

    # Client relation
    relation_type = Column(String(20), nullable=False, default="CUSTOMER") # CUSTOMER, LEAD, MANUAL
    customer_id = Column(Integer, ForeignKey("crm_customer.id"), nullable=True, index=True)
    lead_id = Column(String(32), ForeignKey("leads.id"), nullable=True, index=True)
    
    # Manual data if relation_type == "MANUAL"
    manual_name = Column(String(255), nullable=True)
    manual_document = Column(String(50), nullable=True)
    manual_email = Column(String(255), nullable=True)
    manual_phone = Column(String(50), nullable=True)

    # Totals
    subtotal = Column(Float, nullable=False, default=0.0)
    discount = Column(Float, nullable=False, default=0.0)
    shipping_cost = Column(Float, nullable=False, default=0.0)
    total = Column(Float, nullable=False, default=0.0)

    # Payment Conditions
    payment_method = Column(String(50), nullable=True)
    payment_condition = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)

    # Tracking
    converted_at = Column(DateTime, nullable=True)
    converted_by_user_id = Column(Integer, ForeignKey("usr_user.id"), nullable=True)

    # Digital Signature
    signature_name = Column(String(255), nullable=True)
    signature_document = Column(String(50), nullable=True)
    signature_email = Column(String(255), nullable=True)
    signature_ip = Column(String(50), nullable=True)
    signature_at = Column(DateTime, nullable=True)
    signature_user_agent = Column(String(500), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    company = relationship("Company", foreign_keys=[company_id])
    customer = relationship("Customer", foreign_keys=[customer_id])
    lead = relationship("Lead", foreign_keys=[lead_id])
    converted_by = relationship("User", foreign_keys=[converted_by_user_id])
    
    items = relationship("ProposalItem", back_populates="proposal", cascade="all, delete-orphan")
    
    # Relationship to resulting Orders and Service Orders (explicit foreign keys in target tables)
    converted_orders = relationship("Order", back_populates="proposal", foreign_keys="[Order.proposal_id]")
    converted_service_orders = relationship("ServiceOrder", back_populates="proposal", foreign_keys="[ServiceOrder.proposal_id]")


class ProposalItem(Base):
    __tablename__ = "crm_proposal_item"

    id = Column(Integer, primary_key=True, index=True)
    proposal_id = Column(Integer, ForeignKey("crm_proposal.id"), nullable=False, index=True)
    
    item_type = Column(String(20), nullable=False) # PRODUCT, SERVICE
    product_id = Column(Integer, ForeignKey("prd_product.id"), nullable=True, index=True)
    service_id = Column(Integer, ForeignKey("svc_service.id"), nullable=True, index=True)

    quantity = Column(Float, nullable=False, default=1.0)
    unit_price = Column(Float, nullable=False, default=0.0)
    discount = Column(Float, nullable=False, default=0.0)
    total_price = Column(Float, nullable=False, default=0.0)
    custom_description = Column(Text, nullable=True)

    # Relationships
    proposal = relationship("Proposal", back_populates="items", foreign_keys=[proposal_id])
    product = relationship("Product", foreign_keys=[product_id])
    service = relationship("Service", foreign_keys=[service_id])

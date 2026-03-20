from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Enum, Numeric, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.db.session import Base

class SubscriptionDeliveryFrequency(str, enum.Enum):
    WEEKLY = "WEEKLY"
    BIWEEKLY = "BIWEEKLY"
    MONTHLY = "MONTHLY"
    BIMONTHLY = "BIMONTHLY"
    QUARTERLY = "QUARTERLY"
    SEMIANNUAL = "SEMIANNUAL"
    ANNUAL = "ANNUAL"

class SubscriptionStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"

class BillingStatus(str, enum.Enum):
    PENDING = "PENDING"
    PAID = "PAID"
    FAILED = "FAILED"
    REFUNDED = "REFUNDED"

class SubscriptionPlan(Base):
    __tablename__ = "sub_plan"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False)
    
    name = Column(String(255), nullable=False)
    description = Column(String(1000), nullable=True)
    
    price_per_issue = Column(Numeric(10, 2), nullable=False)
    issues_per_delivery = Column(Integer, default=1, nullable=False)
    delivery_frequency = Column(Enum(SubscriptionDeliveryFrequency), default=SubscriptionDeliveryFrequency.MONTHLY, nullable=False)
    
    max_subscribers_limit = Column(Integer, nullable=True) # null = unlimited
    current_subscribers_count = Column(Integer, default=0, nullable=False)
    
    # First delivery discount tiers
    presale_discount_percent = Column(Numeric(5, 2), default=0) # e.g. 25.00
    launch_discount_percent = Column(Numeric(5, 2), default=0)
    postlaunch_discount_percent = Column(Numeric(5, 2), default=0)
    
    presale_start_date = Column(DateTime(timezone=True), nullable=True)
    launch_date = Column(DateTime(timezone=True), nullable=True)
    postlaunch_date = Column(DateTime(timezone=True), nullable=True)
    
    # Hotsite config
    is_active = Column(Boolean, default=True, nullable=False)
    hotsite_slug = Column(String(255), unique=True, index=True, nullable=False)
    hotsite_config = Column(JSON, nullable=True)
    efi_plan_id = Column(Integer, nullable=True) # Origin EFI Plan ID
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    company = relationship("Company")


class CustomerSubscription(Base):
    __tablename__ = "sub_customer"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False)
    customer_id = Column(Integer, ForeignKey("crm_customer.id"), nullable=False)
    plan_id = Column(Integer, ForeignKey("sub_plan.id"), nullable=False)
    
    current_delivery_number = Column(Integer, default=1, nullable=False)
    status = Column(Enum(SubscriptionStatus), default=SubscriptionStatus.ACTIVE, nullable=False)
    efi_subscription_id = Column(Integer, nullable=True) # Origin EFI Subscription ID
    
    
    shipping_zip_code = Column(String(20), nullable=True)
    shipping_street = Column(String(255), nullable=True)
    shipping_number = Column(String(50), nullable=True)
    shipping_complement = Column(String(255), nullable=True)
    shipping_neighborhood = Column(String(100), nullable=True)
    shipping_city = Column(String(100), nullable=True)
    shipping_state = Column(String(50), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    customer = relationship("Customer")
    plan = relationship("SubscriptionPlan")
    billings = relationship("SubscriptionBilling", back_populates="subscription")


class SubscriptionBilling(Base):
    __tablename__ = "sub_billing"

    id = Column(Integer, primary_key=True, index=True)
    subscription_id = Column(Integer, ForeignKey("sub_customer.id"), nullable=False)
    
    delivery_number = Column(Integer, nullable=False) # e.g., Delivery 1 covers issues 1&2
    efi_charge_id = Column(String(255), nullable=True)
    efi_transaction_id = Column(String(255), nullable=True)
    
    amount = Column(Numeric(10, 2), nullable=False) # Dynamically calculated logic
    status = Column(Enum(BillingStatus), default=BillingStatus.PENDING, nullable=False)
    
    due_date = Column(DateTime(timezone=True), nullable=False)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    subscription = relationship("CustomerSubscription", back_populates="billings")

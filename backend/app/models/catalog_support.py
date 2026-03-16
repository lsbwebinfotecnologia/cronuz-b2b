from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Text, Boolean, Enum, UniqueConstraint, Date
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base
import enum

# Product Attributes

class Category(Base):
    __tablename__ = "prd_category"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False)
    name = Column(String(150), nullable=False)
    parent_id = Column(Integer, ForeignKey("prd_category.id"), nullable=True) # for subcategories
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    company = relationship("Company")
    subcategories = relationship("Category", backref="parent", remote_side=[id])
    
    __table_args__ = (
        UniqueConstraint('company_id', 'name', name='uq_company_category_name'),
    )

class Brand(Base):
    __tablename__ = "prd_brand"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False)
    name = Column(String(100), nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    company = relationship("Company")
    
    __table_args__ = (
        UniqueConstraint('company_id', 'name', name='uq_company_brand_name'),
    )

class Characteristic(Base):
    __tablename__ = "prd_characteristic"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False)
    name = Column(String(100), nullable=False) # e.g. "Color", "Size"
    options = Column(Text, nullable=True) # e.g. "S, M, L, XL"
    category_id = Column(Integer, ForeignKey("prd_category.id"), nullable=True)
    
    category = relationship("Category")
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    company = relationship("Company")
    
    __table_args__ = (
        UniqueConstraint('company_id', 'name', name='uq_company_characteristic_name'),
    )

class ProductCharacteristic(Base):
    __tablename__ = "prd_product_characteristic"
    
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("prd_product.id"), nullable=False)
    characteristic_id = Column(Integer, ForeignKey("prd_characteristic.id"), nullable=False)
    value = Column(String(150), nullable=False) # e.g. "Red", "XL"
    
    product = relationship("Product")
    characteristic = relationship("Characteristic")

# Auditing Logs

class StockMovement(Base):
    __tablename__ = "prd_stock_movement"
    
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("prd_product.id"), nullable=False, index=True)
    
    old_quantity = Column(Integer, nullable=False)
    new_quantity = Column(Integer, nullable=False)
    change_amount = Column(Integer, nullable=False)
    reason = Column(String(255), nullable=True) # e.g. "Manual Update", "Sale"
    
    created_by = Column(Integer, ForeignKey("usr_user.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    product = relationship("Product")

class PriceHistory(Base):
    __tablename__ = "prd_price_history"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("prd_product.id"), nullable=False, index=True)
    
    price_type = Column(String(50), nullable=False) # "BASE", "PROMOTIONAL", "COST"
    old_price = Column(Float, nullable=True)
    new_price = Column(Float, nullable=False)
    reason = Column(String(255), nullable=True)
    
    created_by = Column(Integer, ForeignKey("usr_user.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    product = relationship("Product")

# Promotion Engine

class DiscountType(str, enum.Enum):
    PERCENTAGE = "PERCENTAGE"
    FIXED_AMOUNT = "FIXED_AMOUNT"

class PromotionStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    SCHEDULED = "SCHEDULED"
    COMPLETED = "COMPLETED"
    INACTIVE = "INACTIVE"

class Promotion(Base):
    __tablename__ = "prd_promotion"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False)
    
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    
    start_date = Column(DateTime(timezone=True), nullable=False)
    end_date = Column(DateTime(timezone=True), nullable=False)
    
    discount_type = Column(String(50), nullable=False) # PERCENTAGE or FIXED_AMOUNT
    discount_value = Column(Float, nullable=False)
    
    status = Column(String(50), default=PromotionStatus.INACTIVE.value, nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    company = relationship("Company")

class TargetType(str, enum.Enum):
    CATEGORY = "CATEGORY"
    BRAND = "BRAND"
    PRODUCT = "PRODUCT"

class PromotionTarget(Base):
    __tablename__ = "prd_promotion_target"
    
    id = Column(Integer, primary_key=True, index=True)
    promotion_id = Column(Integer, ForeignKey("prd_promotion.id"), nullable=False, index=True)
    
    target_type = Column(String(50), nullable=False) # CATEGORY, BRAND, PRODUCT
    
    # Exactly one of these should be populated depending on target_type
    category_id = Column(Integer, ForeignKey("prd_category.id"), nullable=True)
    brand_id = Column(Integer, ForeignKey("prd_brand.id"), nullable=True)
    product_id = Column(Integer, ForeignKey("prd_product.id"), nullable=True)
    
    promotion = relationship("Promotion")
    category = relationship("Category")
    brand = relationship("Brand")
    product = relationship("Product")

from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Text, Boolean, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base
import enum

class ProductStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    DRAFT = "DRAFT"

class Product(Base):
    __tablename__ = "prd_product"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False)
    
    sku = Column(String(100), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    short_description = Column(Text, nullable=True)
    long_description = Column(Text, nullable=True)
    
    base_price = Column(Float, nullable=False, default=0.0)
    promotional_price = Column(Float, nullable=True)
    cost_price = Column(Float, nullable=True)
    
    weight_kg = Column(Float, nullable=True)
    width_cm = Column(Float, nullable=True)
    height_cm = Column(Float, nullable=True)
    length_cm = Column(Float, nullable=True)
    
    brand = Column(String(100), nullable=True) # Keeping for legacy/text input
    model = Column(String(100), nullable=True)
    ean_gtin = Column(String(50), nullable=True, index=True)
    
    category_id = Column(Integer, ForeignKey("prd_category.id"), nullable=True)
    brand_id = Column(Integer, ForeignKey("prd_brand.id"), nullable=True)
    
    status = Column(String(50), default=ProductStatus.ACTIVE.value, nullable=False)
    
    # Internal stock metrics (in the future we might expand to prd_stock)
    stock_quantity = Column(Integer, default=0, nullable=False)
    
    # Condition Flags
    is_pre_sale = Column(Boolean, default=False, nullable=False)
    is_out_of_print = Column(Boolean, default=False, nullable=False)
    allow_purchase = Column(Boolean, default=True, nullable=True)
    stock_status_label = Column(String(100), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    company = relationship("Company")
    category = relationship("Category")
    brand_rel = relationship("Brand")

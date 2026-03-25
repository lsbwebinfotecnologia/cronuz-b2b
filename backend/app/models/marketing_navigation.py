import enum
from sqlalchemy import Column, Integer, String, Boolean, Enum, ForeignKey, DateTime
from sqlalchemy.sql import func
from app.db.session import Base
from sqlalchemy.orm import relationship

class NavigationMenuType(str, enum.Enum):
    CATEGORY = "CATEGORY"
    BRAND = "BRAND"

class NavigationMenuItem(Base):
    __tablename__ = "mkt_navigation_menu"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False, index=True)
    
    item_type = Column(Enum(NavigationMenuType), nullable=False)
    label = Column(String(100), nullable=False)
    external_id = Column(String(100), nullable=False, index=True)
    position = Column(Integer, default=1)
    is_active = Column(Boolean, default=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    company = relationship("Company")

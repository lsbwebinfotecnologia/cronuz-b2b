import enum
from sqlalchemy import Column, Integer, String, Boolean, Enum, ForeignKey
from app.db.session import Base
from sqlalchemy.orm import relationship

class ShowcaseRuleType(str, enum.Enum):
    MANUAL = "MANUAL"
    CATEGORY = "CATEGORY"
    BRAND = "BRAND"
    RECENT = "RECENT"
    HIGH_STOCK = "HIGH_STOCK"

class ShowcaseSortBy(str, enum.Enum):
    MANUAL = "MANUAL"
    ALPHA_ASC = "ALPHA_ASC"
    ALPHA_DESC = "ALPHA_DESC"
    PRICE_ASC = "PRICE_ASC"
    PRICE_DESC = "PRICE_DESC"
    SALES_DESC = "SALES_DESC"

class MarketingShowcase(Base):
    __tablename__ = "mkt_showcase"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False)
    name = Column(String, index=True, nullable=False)
    rule_type = Column(Enum(ShowcaseRuleType), nullable=False)
    reference_id = Column(Integer, nullable=True) # Used for Category ID or Brand ID
    sort_by = Column(Enum(ShowcaseSortBy), default=ShowcaseSortBy.MANUAL)
    display_on_home = Column(Boolean, default=False)
    display_order = Column(Integer, default=1)
    banner_url = Column(String, nullable=True)
    
    company = relationship("Company")

# To handle MANUAL product selection, we need an association table/model
class ShowcaseProduct(Base):
    __tablename__ = "mkt_showcase_product"

    showcase_id = Column(Integer, ForeignKey("mkt_showcase.id"), primary_key=True)
    product_id = Column(Integer, ForeignKey("prd_product.id"), primary_key=True)
    position = Column(Integer, default=1)
    
    showcase = relationship("MarketingShowcase")
    product = relationship("Product")

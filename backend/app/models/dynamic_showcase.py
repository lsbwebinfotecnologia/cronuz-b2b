from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base

class DynamicShowcase(Base):
    __tablename__ = "mkt_dynamic_showcase"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False, index=True)
    title = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    search_source = Column(String(20), nullable=False, default="CRONUZ")  # 'CRONUZ' or 'HORUS_API'
    active = Column(Boolean, nullable=False, default=True)
    display_order = Column(Integer, nullable=False, default=1)
    banner_url = Column(String(500), nullable=True)
    banner_mobile_url = Column(String(500), nullable=True)
    logo_url = Column(String(500), nullable=True)
    start_date = Column(DateTime(timezone=True), nullable=True)
    end_date = Column(DateTime(timezone=True), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    company = relationship("Company", foreign_keys=[company_id])
    items = relationship("DynamicShowcaseItem", back_populates="showcase", cascade="all, delete-orphan", order_by="DynamicShowcaseItem.position")

    @property
    def is_currently_active(self) -> bool:
        if not self.active:
            return False
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        if self.start_date and now < self.start_date:
            return False
        if self.end_date and now > self.end_date:
            return False
        return True

class DynamicShowcaseItem(Base):
    __tablename__ = "mkt_dynamic_showcase_item"

    id = Column(Integer, primary_key=True, index=True)
    showcase_id = Column(Integer, ForeignKey("mkt_dynamic_showcase.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("prd_product.id"), nullable=False, index=True)
    position = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    showcase = relationship("DynamicShowcase", back_populates="items", foreign_keys=[showcase_id])
    product = relationship("Product", foreign_keys=[product_id])

    __table_args__ = (
        UniqueConstraint("showcase_id", "product_id", name="uq_dynamic_showcase_product"),
    )

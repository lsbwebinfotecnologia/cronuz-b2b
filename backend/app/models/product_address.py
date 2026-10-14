from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Index, text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.session import Base

class ProductAddress(Base):
    __tablename__ = "prd_product_address"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    branch_id = Column(Integer, ForeignKey("cmp_seller_branch.id", ondelete="CASCADE"), nullable=False, index=True)
    cod_local_estoque = Column(String(50), nullable=True)
    isbn = Column(String(32), nullable=False, index=True)
    horus_cod_item = Column(String(50), nullable=True, index=True)
    title = Column(String(255), nullable=True)
    address = Column(String(100), nullable=False)
    notes = Column(String(255), nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Explicit relationships with foreign_keys as per user rule 1
    company = relationship("Company", foreign_keys=[company_id])
    branch = relationship("SellerBranch", foreign_keys=[branch_id])
    creator = relationship("User", foreign_keys=[created_by_user_id])

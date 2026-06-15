from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.session import Base

class SellerBranch(Base):
    __tablename__ = "cmp_seller_branch"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False)
    nome = Column(String(255), nullable=False)
    cnpj = Column(String(20), nullable=True)
    cod_empresa = Column(String(50), nullable=False)
    cod_filial = Column(String(50), nullable=False)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Explicit relationships with foreign_keys as per Rule 1
    company = relationship("Company", back_populates="branches", foreign_keys=[company_id])

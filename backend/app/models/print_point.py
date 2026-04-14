from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.db.session import Base

class DocumentType(str, enum.Enum):
    NFSE = "NFSE"
    NFE = "NFE"
    NFCE = "NFCE"
    FATURA = "FATURA"
    RECIBO_MANUAL = "RECIBO_MANUAL"

class PrintPoint(Base):
    __tablename__ = "cmp_print_point"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False)
    name = Column(String(100), nullable=False) # Ex: Série A - Serviços
    document_type = Column(SQLEnum(DocumentType), nullable=False)
    
    is_service = Column(Boolean, default=False, nullable=False)
    is_electronic = Column(Boolean, default=True, nullable=False)
    current_number = Column(Integer, default=1, nullable=False)
    serie = Column(String(50), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    company = relationship("Company", back_populates="print_points", foreign_keys=[company_id])

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, func, Text
from sqlalchemy.orm import relationship
from app.db.session import Base

class LogisticsOrder(Base):
    __tablename__ = "logistics_orders"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False, index=True)
    provider = Column(String(30), nullable=False, default='MKT')
    cod_ped_venda = Column(Integer, nullable=False, index=True)
    cod_cli = Column(Integer, nullable=True)
    pedido_web_origem = Column(String(50), nullable=True)
    id_ord_sys_log = Column(String(50), nullable=True)
    status_horus = Column(String(10), nullable=True)
    situation = Column(String(20), nullable=False, default='PENDING_SEND')
    cep_validated = Column(Boolean, nullable=True)
    cep_checked_at = Column(DateTime(timezone=True), nullable=True)
    cep_error_detail = Column(Text, nullable=True)
    tracking_code = Column(String(100), nullable=True)
    tracking_fetched_at = Column(DateTime(timezone=True), nullable=True)
    key_nfe = Column(String(50), nullable=True)
    nfe_number = Column(String(20), nullable=True)
    
    sent_at = Column(DateTime(timezone=True), nullable=True)
    checked_at = Column(DateTime(timezone=True), nullable=True)
    invoiced_at = Column(DateTime(timezone=True), nullable=True)
    error_log = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    company = relationship("Company", foreign_keys=[company_id])

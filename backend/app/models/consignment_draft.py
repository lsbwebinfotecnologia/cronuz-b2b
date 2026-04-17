from sqlalchemy import Column, Integer, String, Text, DateTime, JSON
from sqlalchemy.sql import func
from app.db.session import Base

class ConsignmentDraft(Base):
    __tablename__ = "consignment_drafts"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, index=True, nullable=False)
    cnpj_cliente = Column(String(50), index=True, nullable=False)
    cod_ctr = Column(String(50), index=True, nullable=False)
    operation_type = Column(String(10), nullable=False)  # 'A' or 'D'
    items_json = Column(JSON, nullable=False, default=[]) # list of { COD_BARRA_ITEM: str, qtdConferida: int, SALDO_ITENS: int }
    status = Column(String(20), nullable=False, default="DRAFT") # 'DRAFT' or 'COMPLETED'
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

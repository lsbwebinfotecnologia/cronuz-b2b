from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.session import Base
from app.models.company import Company
from app.models.bookinfo_supplier import BookinfoSupplier

class BookinfoTransmission(Base):
    __tablename__ = "spl_purchase_transmission"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False, index=True)
    supplier_id = Column(Integer, ForeignKey("spl_supplier.id"), nullable=False, index=True)
    
    cod_pedido = Column(Integer, nullable=False, index=True)
    bookinfo_pedido_id = Column(String(100), nullable=True)
    status = Column(String(50), nullable=False, default="PENDING") # PENDING, SENT, SYNCED, ERROR
    
    horus_cod_empresa = Column(Integer, nullable=True)
    horus_cod_filial = Column(Integer, nullable=True)
    horus_cod_fornecedor = Column(Integer, nullable=True)
    horus_cod_grp_fornecedor = Column(Integer, nullable=True)
    
    sent_at = Column(DateTime, nullable=True)
    last_sync_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships - specify foreign_keys explicitly to adhere to user global rule 1
    company = relationship("Company", foreign_keys=[company_id])
    supplier = relationship("BookinfoSupplier", foreign_keys=[supplier_id])
    
    items = relationship("BookinfoTransmissionItem", back_populates="transmission", cascade="all, delete-orphan")

class BookinfoTransmissionItem(Base):
    __tablename__ = "spl_purchase_transmission_item"

    id = Column(Integer, primary_key=True, index=True)
    transmission_id = Column(Integer, ForeignKey("spl_purchase_transmission.id"), nullable=False, index=True)
    
    cod_item = Column(Integer, nullable=False)
    cod_barra = Column(String(100), nullable=True)
    nom_item = Column(String(255), nullable=True)
    qt_pedida = Column(Integer, nullable=False, default=0)
    
    situacao_envio = Column(String(100), nullable=True)
    situacao_retorno = Column(String(100), nullable=True)
    obs_item = Column(Text, nullable=True)
    
    synced_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    transmission = relationship("BookinfoTransmission", back_populates="items", foreign_keys=[transmission_id])

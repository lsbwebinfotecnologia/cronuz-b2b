from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Numeric, ForeignKey, Index, UniqueConstraint
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base


class DropshipDispatchManifest(Base):
    """
    Minuta de Despacho e Termo de Coleta dos pedidos Dropship.
    Registra a transferência formal de custódia da empresa para a transportadora.
    """
    __tablename__ = "dsp_dispatch_manifest"
    __table_args__ = (
        UniqueConstraint('company_id', 'manifest_number', name='uix_dsp_dispatch_manifest_number'),
        Index("idx_dsp_dispatch_manifest_company", "company_id"),
        Index("idx_dsp_dispatch_manifest_created", "created_at"),
    )

    id                 = Column(Integer, primary_key=True, index=True)
    company_id         = Column(Integer, ForeignKey("cmp_company.id"), nullable=False)
    manifest_number    = Column(String(50), nullable=False)

    # Identificação do Coletor / Transportadora
    carrier_name       = Column(String(100), nullable=True)  # ex: Correios, Jadlog, Própria
    driver_name        = Column(String(150), nullable=True)  # Nome do motorista/coletor
    driver_document    = Column(String(50),  nullable=True)  # RG ou CPF
    vehicle_plate      = Column(String(20),  nullable=True)  # Placa do veículo
    notes              = Column(Text,        nullable=True)  # Observações da coleta

    # Consolidados
    total_orders       = Column(Integer, nullable=False, default=0)
    total_volumes      = Column(Integer, nullable=False, default=0)
    total_value        = Column(Numeric(12, 2), nullable=False, default=0.0)

    created_at         = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_by_user_id = Column(Integer, ForeignKey("usr_user.id"), nullable=True)

    # Relationships
    company            = relationship("Company", foreign_keys=[company_id])
    created_by         = relationship("User",    foreign_keys=[created_by_user_id])
    orders             = relationship("DropshipOrder", back_populates="manifest", foreign_keys="DropshipOrder.manifest_id")

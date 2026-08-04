from sqlalchemy import Column, Integer, String, Numeric, Date, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base


class DropshipPriceTable(Base):
    """
    Tabela de preços/descontos por ISBN para o módulo Dropship.
    Usada no pedido de Venda (CFOP 6.118): se o ISBN do item estiver
    nesta tabela e a data de validade for futura, aplica o desconto ao vlr_capa
    e envia como VLR_LIQUIDO. Caso contrário, VLR_LIQUIDO não é enviado.
    """
    __tablename__ = "dsp_price_table"
    __table_args__ = (
        UniqueConstraint('company_id', 'isbn', name='uix_dsp_price_table_company_isbn'),
        Index('idx_dsp_price_table_company', 'company_id'),
    )

    id         = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False, index=True)

    isbn          = Column(String(30),  nullable=False, index=True)
    titulo        = Column(String(512), nullable=True)
    desconto      = Column(Numeric(5, 2), nullable=False, default=0.0)
    data_validade = Column(Date, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationship
    company = relationship("Company", foreign_keys=[company_id])

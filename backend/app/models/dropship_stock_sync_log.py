from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base


class DropshipStockSyncLog(Base):
    """
    Histórico de execuções do sync de estoque Dropship (Hórus → Hub-Erdos).
    Cada linha representa uma execução (manual ou automática).
    """
    __tablename__ = "dsp_stock_sync_log"
    __table_args__ = (
        Index("idx_dsp_stock_sync_log_company", "company_id"),
        Index("idx_dsp_stock_sync_log_executed_at", "executed_at"),
    )

    id             = Column(Integer, primary_key=True, index=True)
    company_id     = Column(Integer, ForeignKey("cmp_company.id"), nullable=False)

    # Contexto da execução
    triggered_by   = Column(String(50), nullable=False, default="manual")   # 'manual' | 'scheduler'
    status         = Column(String(20), nullable=False)                      # 'ok' | 'no_items' | 'error'
    data_ini       = Column(String(30), nullable=True)   # DATA_INI enviado ao Hórus
    data_fim       = Column(String(30), nullable=True)   # DATA_FIM enviado ao Hórus

    # Resultado
    skus_sent      = Column(Integer, nullable=False, default=0)
    items_payload  = Column(JSONB, nullable=True)  # [{sku, quantidade}, ...] enviado ao Erdos
    hub_response   = Column(JSONB, nullable=True)  # resposta da API Erdos
    error_msg      = Column(Text, nullable=True)   # detalhe do erro (se status='error')

    executed_at    = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    erdos_credential_id = Column(Integer, ForeignKey("dsp_erdos_credential.id"), nullable=True, index=True)

    company = relationship("Company", foreign_keys=[company_id])
    erdos_credential = relationship("DspErdosCredential", foreign_keys=[erdos_credential_id])

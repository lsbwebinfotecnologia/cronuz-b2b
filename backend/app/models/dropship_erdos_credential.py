from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base


class DspErdosCredential(Base):
    """
    Credencial Erdos por seller — suporta múltiplos tokens/CNPJs por company.

    Cada credencial representa um CNPJ da Erdos com:
      - api_token      : x-api-key para o Hub-Erdos
      - horus_customer : customer no Hórus vinculado a este CNPJ
      - params fiscais : COD_PARAM_FISCAL específico por CNPJ

    Fluxo:
      PEDIDOS  — buscar uma vez por credencial ativa (cada token traz seus pedidos)
      ESTOQUE  — enviar UMA vez com a credencial is_primary=True
      DESPACHO — usar o mesmo token que trouxe o pedido (Erdos recusa token errado)
    """
    __tablename__ = "dsp_erdos_credential"
    __table_args__ = (
        Index("idx_dsp_erdos_cred_company", "company_id"),
        Index("idx_dsp_erdos_cred_config",  "config_id"),
    )

    id         = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False)
    config_id  = Column(Integer, ForeignKey("dsp_config.id"),  nullable=False)

    # Identificação amigável — ex: "Livraria Erdos (PR)"
    label = Column(String(100), nullable=False)

    # Token de autenticação da Erdos (x-api-key)
    api_token = Column(String(512), nullable=False)

    # Customer Hórus que representa este CNPJ Erdos (OBRIGATÓRIO)
    horus_customer_id     = Column(Integer, ForeignKey("crm_customer.id"), nullable=False)
    horus_customer_cod_cli = Column(String(50), nullable=True)

    # Parâmetros fiscais POR credencial (variam por CNPJ/UF)
    horus_fiscal_param_remessa_intra = Column(String(50), nullable=True)
    horus_fiscal_param_remessa_inter = Column(String(50), nullable=True)
    horus_fiscal_param_venda         = Column(String(50), nullable=True)

    # Credencial primária para envio de estoque (apenas uma deve ser True)
    is_primary = Column(Boolean, nullable=False, default=False)
    is_active  = Column(Boolean, nullable=False, default=True)

    # Última sincronização de estoque executada especificamente para este token/customer
    stock_sync_last_run = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    company        = relationship("Company",        foreign_keys=[company_id])
    config         = relationship("DropshipConfig", back_populates="credentials", foreign_keys=[config_id])
    horus_customer = relationship("Customer",       foreign_keys=[horus_customer_id])
    price_table    = relationship("DropshipPriceTable", back_populates="erdos_credential",
                                  foreign_keys="DropshipPriceTable.erdos_credential_id")

from datetime import datetime
from sqlalchemy import (
    Column,
    Integer,
    BigInteger,
    String,
    Float,
    Boolean,
    ForeignKey,
    DateTime,
    Index,
    JSON,
)
from sqlalchemy.orm import relationship
from app.db.session import Base


class HorusReconciliationClosing(Base):
    """
    Histórico auditável de Fechamentos / Borderôs de Conciliação Financeira gerados no Horus ERP.
    Armazena o resumo financeiro, parâmetros bancários, arquivos de origem e o snapshot detalhado
    de cada lançamento baixado, unificado ou desmembrado (Crédito Maior) para futuras consultas.
    """

    __tablename__ = "horus_reconciliation_closings"
    __table_args__ = (
        Index("idx_horus_rec_closings_company_date", "company_id", "created_at"),
        Index("idx_horus_rec_closings_bordero", "company_id", "cod_bordero"),
        Index("idx_horus_rec_closings_profile", "company_id", "profile_code"),
    )

    id = Column(BigInteger, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False, index=True)
    created_by_user_id = Column(Integer, ForeignKey("usr_user.id"), nullable=True, index=True)
    created_by_name = Column(String(150), nullable=True)

    # Identificação da modalidade e arquivos utilizados
    profile_code = Column(String(60), nullable=False, index=True)
    profile_name = Column(String(150), nullable=True)
    channel_filename = Column(String(255), nullable=True)
    tray_filename = Column(String(255), nullable=True)

    # Identificação do Borderô no Horus ERP
    cod_empresa = Column(Integer, nullable=False, default=1)
    cod_filial = Column(Integer, nullable=False, default=1)
    cod_bordero = Column(Integer, nullable=False, index=True)
    sta_bordero = Column(String(10), nullable=False, default="PG")
    nom_arquivo_horus = Column(String(60), nullable=True)

    # Regras e códigos bancários aplicados no fechamento
    payment_date_mode = Column(String(40), nullable=False, default="CHANNEL_DATE")
    specific_payment_date = Column(String(30), nullable=True)
    unify_installments = Column(Boolean, nullable=False, default=True)
    split_excess_launch = Column(Boolean, nullable=False, default=True)

    forma_pagto = Column(String(30), nullable=True)
    forma_pagto_credito_maior = Column(String(30), nullable=True)
    banco = Column(String(30), nullable=True)
    agencia = Column(String(30), nullable=True)
    conta = Column(String(40), nullable=True)
    carteira = Column(String(30), nullable=True)

    # Totais auditados do fechamento
    total_titles = Column(Integer, nullable=False, default=0)
    unificadas_parcelas_removidas = Column(Integer, nullable=False, default=0)
    credito_maior_lancamentos_criados = Column(Integer, nullable=False, default=0)

    valor_bruto_total = Column(Float, nullable=False, default=0.0)
    valor_taxa_total = Column(Float, nullable=False, default=0.0)
    valor_liquido_bordero = Column(Float, nullable=False, default=0.0)
    valor_credito_maior_total = Column(Float, nullable=False, default=0.0)

    # Snapshot completo dos itens conciliados neste fechamento
    items_json = Column(JSON, nullable=True)
    notes = Column(String(500), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships explícitos com foreign_keys para evitar ambiguidades
    company = relationship("Company", foreign_keys=[company_id])
    created_by = relationship("User", foreign_keys=[created_by_user_id])

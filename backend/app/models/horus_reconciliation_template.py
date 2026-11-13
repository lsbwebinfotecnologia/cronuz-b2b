from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, JSON, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base


class HorusReconciliationTemplate(Base):
    """
    Modelo Dinâmico de Conciliação Financeira e Geração de Borderô no Horus ERP.
    Permite configurar por cliente (company_id) quantos formatos de importação forem necessários
    (1 ou 2 planilhas, chave por NF, Pedido Horus, Lançamento Direto ou Pedido Origem/Web),
    mapeamento de colunas ('De -> Para'), regras de extração e parâmetros bancários do Borderô.
    """
    __tablename__ = "horus_reconciliation_templates"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(
        Integer,
        ForeignKey("cmp_company.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    code = Column(String(80), nullable=False, index=True)  # Ex: SHOPEE_TRAY, POR_NOTA_FISCAL, POR_LANCAMENTO
    name = Column(String(160), nullable=False)
    short_name = Column(String(80), nullable=False)
    channel_label = Column(String(80), nullable=False, default="Planilha")
    hub_label = Column(String(80), nullable=True)
    badge = Column(String(80), nullable=True)
    description = Column(Text, nullable=True)

    # Modo de arquivos: 'SINGLE_FILE' (1 Planilha Direto) | 'DUAL_FILE' (2 Planilhas com Ponte ex: Tray)
    mode = Column(String(30), nullable=False, default="SINGLE_FILE")
    file_1_label = Column(String(200), nullable=True)
    file_2_label = Column(String(200), nullable=True)

    # Qual campo do Horus ERP será usado para localizar o título:
    # 'AUTO' | 'NRO_NOTA_FISCAL' | 'COD_PED_VENDA' | 'NRO_LANCTO_CRECEBER' | 'COD_PEDIDO_ORIGEM'
    horus_match_field = Column(String(50), nullable=False, default="AUTO")

    # Mapeamento de colunas e regras de extração (JSON):
    # {
    #   "engine_preset": "DYNAMIC" | "SHOPEE" | "VINDI" | "TIKTOK",
    #   "key_col": "...",
    #   "key_extract_rule": "AUTO" | "EXACT" | "DIGITS_ONLY" | "AFTER_HASH" | "REGEX",
    #   "key_regex": "",
    #   "valor_liquido_col": "...",
    #   "valor_bruto_col": "...",
    #   "taxa_col": "...",
    #   "data_pagamento_col": "...",
    #   "tipo_transacao_col": "...",
    #   "cliente_col": "...",
    #   "documento_col": "...",
    #   "deduct_debit_rows": true,
    #   "bridge_channel_key_col": "...",
    #   "bridge_channel_extract_rule": "AUTO",
    #   "bridge_horus_key_col": "...",
    #   "bridge_horus_extract_rule": "AUTO",
    #   "bridge_valor_pedido_col": "...",
    #   "bridge_nf_col": "..."
    # }
    column_mapping = Column(JSON, nullable=True)

    # Parâmetros Bancários do Borderô (Tabela BORDERO Horus) e Regras de Baixa
    forma_pagto = Column(String(50), nullable=True)
    forma_pagto_credito_maior = Column(String(50), nullable=True)
    banco = Column(String(30), nullable=True)
    agencia = Column(String(30), nullable=True)
    conta = Column(String(40), nullable=True)
    carteira = Column(String(30), nullable=True)

    # 'CHANNEL_DATE' (Data da Planilha) | 'SPECIFIC_DATE' (Data Específica) | 'BORDERO_OPEN' (Apenas Borderô em Aberto AP)
    payment_date_mode = Column(String(30), nullable=False, default="CHANNEL_DATE")
    unify_installments = Column(Boolean, nullable=False, default=True)
    split_excess_launch = Column(Boolean, nullable=False, default=True)

    is_active = Column(Boolean, nullable=False, default=True)
    is_system_preset = Column(Boolean, nullable=False, default=False)
    display_order = Column(Integer, nullable=False, default=10)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    company = relationship("Company", foreign_keys=[company_id])

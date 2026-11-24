from datetime import datetime
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from app.db.session import Base


class HorusPurchaseBranchConfig(Base):
    """
    Parametrização do módulo Compras (Horus Direct) por Filial do Seller (cmp_seller_branch).
    Inclui defaults operacionais do Horus (Departamento, Centro de Custo, Local, Modalidade)
    e template individualizado de e-mail por filial para disparo futuro ao fornecedor.
    """
    __tablename__ = "pur_horus_branch_config"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    branch_id = Column(Integer, nullable=False, index=True)  # ID em cmp_seller_branch (ou 0 para filial padrão)
    cod_empresa = Column(Integer, nullable=False, default=1)
    cod_filial = Column(Integer, nullable=False, default=1)
    cod_local_default = Column(Integer, nullable=True)
    cod_departamento_default = Column(Integer, nullable=True)
    cod_centro_custo_default = Column(Integer, nullable=True)
    compra_consig_default = Column(String(1), nullable=False, default="N")  # 'N'=Compra Firme, 'S'=Consignação

    # Parametrização de E-mail exclusiva desta Filial (para envio futuro ao fornecedor)
    email_enabled = Column(Boolean, nullable=False, default=False)
    sender_name = Column(String(150), nullable=True)
    sender_email = Column(String(255), nullable=True)
    reply_to_email = Column(String(255), nullable=True)
    cc_emails = Column(String(500), nullable=True)
    email_subject_template = Column(String(255), nullable=True)
    email_body_template = Column(Text, nullable=True)

    updated_by_user_id = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("company_id", "branch_id", name="uq_pur_horus_branch_cfg_company_branch"),
    )

    company = relationship("Company", foreign_keys=[company_id])
    updated_by = relationship("User", foreign_keys=[updated_by_user_id])


class HorusSupplierPublisherDiscount(Base):
    """
    Tabela oficial no Cronuz B2B para governança comercial de Compras por Filial:
    Relaciona CNPJ Fornecedor + Filial + Cód. Fornecedor (Horus) + Editora/Selo (Horus) + Desconto (%).

    Regra de negócio mandatória:
      - Não é permitido gerar pedido de compra para um fornecedor na filial sem configurar
        os selos/editoras e respectivos descontos.
      - Qualquer item do pedido cuja editora no Horus não esteja configurada para o fornecedor
        na filial gera alerta imediato para ajuste do cadastro (Cronuz+Horus) ou inclusão do desconto.
    """
    __tablename__ = "pur_horus_supplier_discount"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    branch_id = Column(Integer, nullable=False, index=True)  # ID em cmp_seller_branch (ou 0 para filial padrão)
    cod_empresa = Column(Integer, nullable=False)
    cod_filial = Column(Integer, nullable=False)
    cod_grp_fornecedor = Column(Integer, nullable=False, default=1)
    cod_fornecedor = Column(Integer, nullable=False, index=True)
    cnpj_fornecedor = Column(String(20), nullable=True, index=True)
    nome_fornecedor = Column(String(150), nullable=True)
    email_fornecedor = Column(String(255), nullable=True)

    cod_editora = Column(Integer, nullable=False, index=True)  # COD_EDITORA em EDITORA no Horus
    nome_editora = Column(String(150), nullable=False)
    desconto_percentual = Column(Numeric(6, 2), nullable=False, default=0.00)
    active = Column(Boolean, nullable=False, default=True)

    updated_by_user_id = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)
    updated_by_name = Column(String(150), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "branch_id",
            "cod_grp_fornecedor",
            "cod_fornecedor",
            "cod_editora",
            name="uq_pur_horus_sup_disc_branch_forn_ed",
        ),
        Index(
            "ix_pur_horus_sup_disc_lookup",
            "company_id",
            "branch_id",
            "cod_fornecedor",
            "cod_editora",
        ),
    )

    company = relationship("Company", foreign_keys=[company_id])
    updated_by = relationship("User", foreign_keys=[updated_by_user_id])


class HorusPublisherReconciliationLog(Base):
    """
    Auditoria de conciliação inteligente de Editora/Selo entre Cronuz B2B e Horus SQL Server
    (atualização de ITENS_ESTOQUE_GERAL.COD_EDITORA no Horus + prd_product no Cronuz, sem criar editoras novas).
    """
    __tablename__ = "pur_horus_publisher_reconcile_log"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    cod_item = Column(Integer, nullable=False, index=True)
    isbn = Column(String(30), nullable=True, index=True)
    nome_item = Column(String(255), nullable=True)
    old_cod_editora = Column(Integer, nullable=True)
    old_nome_editora = Column(String(150), nullable=True)
    new_cod_editora = Column(Integer, nullable=False)
    new_nome_editora = Column(String(150), nullable=False)
    origin_module = Column(String(50), nullable=False, default="COMPRAS")  # 'COMPRAS' ou 'ANALISE_ITENS'
    user_id = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)
    user_name = Column(String(150), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    company = relationship("Company", foreign_keys=[company_id])
    user = relationship("User", foreign_keys=[user_id])


class HorusPurchaseOrder(Base):
    """
    Cabeçalho do Pedido de Compra espelhado/integrado com PEDIDOS_COMPRA do Horus SQL Server.
    Status inicial ao gerar no Horus: horus_status='AP' (Aprovado) / status='APPROVED'.
    Ao exportar Excel com opção de transição: horus_status='AE' / status='AWAITING_DELIVERY' (Aguardando Entrega).
    """
    __tablename__ = "pur_horus_order"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    branch_id = Column(Integer, nullable=False, index=True)
    branch_name = Column(String(150), nullable=True)
    branch_cnpj = Column(String(20), nullable=True)

    cod_empresa = Column(Integer, nullable=False)
    cod_filial = Column(Integer, nullable=False)
    cod_local = Column(Integer, nullable=True)
    cod_departamento = Column(Integer, nullable=True)
    cod_centro_custo = Column(Integer, nullable=True)

    cod_grp_fornecedor = Column(Integer, nullable=False)
    cod_fornecedor = Column(Integer, nullable=False, index=True)
    cnpj_fornecedor = Column(String(20), nullable=True, index=True)
    nome_fornecedor = Column(String(150), nullable=False)
    email_fornecedor = Column(String(255), nullable=True)

    # Identificador gerado em PEDIDOS_COMPRA no Horus SQL
    horus_cod_pedido = Column(Integer, nullable=True, index=True)
    compra_consig = Column(String(1), nullable=False, default="N")  # 'N'=Compra Firme, 'S'=Consignação

    # Status no Cronuz: APPROVED, AWAITING_DELIVERY, XML_OK, XML_DIVERGENT, XML_ACCEPTED_DIV, XML_REJECTED, IN_CONFERENCE, COMPLETED, CANCELLED
    status = Column(String(40), nullable=False, default="APPROVED", index=True)
    # Status no Horus: AP, AE, AC, EE, CA
    horus_status = Column(String(5), nullable=False, default="AP", index=True)

    # Status e rastreio da Conferência/Auditoria de XML da NF-e do Fornecedor
    # Valores xml_status: NONE, PENDING_REVIEW, XML_OK, ACCEPTED_WITH_DIVERGENCE, REJECTED
    xml_status = Column(String(40), nullable=False, default="NONE", index=True)
    last_xml_audit_id = Column(Integer, nullable=True)
    last_nfe_number = Column(String(30), nullable=True)
    last_nfe_series = Column(String(10), nullable=True)
    last_nfe_key = Column(String(60), nullable=True, index=True)
    xml_checked_at = Column(DateTime, nullable=True)
    xml_checked_by_name = Column(String(150), nullable=True)

    total_skus = Column(Integer, nullable=False, default=0)
    total_quantity = Column(Integer, nullable=False, default=0)
    total_gross = Column(Numeric(14, 2), nullable=False, default=0.00)
    total_discount = Column(Numeric(14, 2), nullable=False, default=0.00)
    total_net = Column(Numeric(14, 2), nullable=False, default=0.00)
    avg_discount_pct = Column(Numeric(6, 2), nullable=False, default=0.00)

    observations = Column(Text, nullable=True)
    excel_exported_count = Column(Integer, nullable=False, default=0)
    last_excel_exported_at = Column(DateTime, nullable=True)
    supplier_sent_at = Column(DateTime, nullable=True)

    created_by_user_id = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)
    created_by_name = Column(String(150), nullable=True)
    updated_by_user_id = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)
    updated_by_name = Column(String(150), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("ix_pur_horus_order_emp_fil_ped", "company_id", "cod_empresa", "cod_filial", "horus_cod_pedido"),
    )

    company = relationship("Company", foreign_keys=[company_id])
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    updated_by = relationship("User", foreign_keys=[updated_by_user_id])
    items = relationship(
        "HorusPurchaseOrderItem",
        back_populates="order",
        cascade="all, delete-orphan",
        foreign_keys="HorusPurchaseOrderItem.order_id",
    )
    logs = relationship(
        "HorusPurchaseOrderLog",
        back_populates="order",
        cascade="all, delete-orphan",
        foreign_keys="HorusPurchaseOrderLog.order_id",
        order_by="HorusPurchaseOrderLog.created_at.desc()",
    )
    xml_audits = relationship(
        "HorusPurchaseXmlAudit",
        back_populates="order",
        cascade="all, delete-orphan",
        foreign_keys="HorusPurchaseXmlAudit.order_id",
        order_by="HorusPurchaseXmlAudit.created_at.desc()",
    )


class HorusPurchaseOrderItem(Base):
    """
    Itens do Pedido de Compra sincronizados com ITENS_PEDIDO_COMPRA do Horus SQL Server.
    """
    __tablename__ = "pur_horus_order_item"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("pur_horus_order.id", ondelete="CASCADE"), nullable=False, index=True)
    cod_item = Column(Integer, nullable=False, index=True)
    isbn = Column(String(30), nullable=True, index=True)
    nome_item = Column(String(255), nullable=False)
    cod_editora = Column(Integer, nullable=True)
    nome_editora = Column(String(150), nullable=True)

    quantity = Column(Integer, nullable=False, default=1)
    unit_cover_price = Column(Numeric(12, 2), nullable=False, default=0.00)
    discount_pct = Column(Numeric(6, 2), nullable=False, default=0.00)
    unit_net_price = Column(Numeric(12, 4), nullable=False, default=0.00)
    subtotal_gross = Column(Numeric(14, 2), nullable=False, default=0.00)
    subtotal_net = Column(Numeric(14, 2), nullable=False, default=0.00)

    stock_at_order = Column(Integer, nullable=True, default=0)
    consigned_at_order = Column(Integer, nullable=True, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    order = relationship("HorusPurchaseOrder", back_populates="items", foreign_keys=[order_id])


class HorusPurchaseOrderLog(Base):
    """
    Histórico completo de auditoria (usuário, data/hora, ação e transição de status AP -> AE / exportações).
    """
    __tablename__ = "pur_horus_order_log"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("pur_horus_order.id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(String(60), nullable=False)  # CREATED_AP, STATUS_CHANGED_AE, EXCEL_EXPORTED, STATUS_SYNCED, CANCELLED
    old_status = Column(String(40), nullable=True)
    new_status = Column(String(40), nullable=True)
    old_horus_status = Column(String(10), nullable=True)
    new_horus_status = Column(String(10), nullable=True)
    details = Column(Text, nullable=True)
    extra_meta = Column(JSONB, nullable=True)

    user_id = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)
    user_name = Column(String(150), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    order = relationship("HorusPurchaseOrder", back_populates="logs", foreign_keys=[order_id])
    user = relationship("User", foreign_keys=[user_id])


class HorusPurchaseXmlAudit(Base):
    """
    Auditoria e Conciliação preventiva do XML da NF-e do Fornecedor contra o Pedido de Compra (pur_horus_order).
    Identifica individualmente divergências de:
      - Preço de Capa (Capa Pedido vs Capa XML)
      - Desconto Comercial (%) (Desconto Pedido vs Desconto XML / Efetivo)
      - Quantidade Faturada (Qtd Pedido vs Qtd XML)
      - Itens Extras na Nota (não pedidos) e Itens Faltantes (não faturados)
    Suporta fluxo de decisão imediata (XML_OK quando 100% batendo) ou análise posterior pontuada:
      - XML_OK (Aceitar OK)
      - ACCEPTED_WITH_DIVERGENCE (Aceitar com Divergência — exige pontuação/justificativa)
      - REJECTED (Recusar XML — exige motivo da recusa)
    """
    __tablename__ = "pur_horus_xml_audit"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("pur_horus_order.id", ondelete="CASCADE"), nullable=False, index=True)
    branch_id = Column(Integer, nullable=False, index=True)
    branch_name = Column(String(150), nullable=True)
    horus_cod_pedido = Column(Integer, nullable=True, index=True)

    # Cabeçalho da NF-e extraído do XML
    chave_acesso = Column(String(60), nullable=True, index=True)
    numero_nf = Column(String(30), nullable=False, index=True)
    serie_nf = Column(String(10), nullable=True)
    data_emissao = Column(String(40), nullable=True)
    nat_op = Column(String(150), nullable=True)
    emit_cnpj = Column(String(20), nullable=True, index=True)
    emit_nome = Column(String(200), nullable=True)
    dest_cnpj = Column(String(20), nullable=True)
    dest_nome = Column(String(200), nullable=True)
    xml_xped = Column(String(60), nullable=True)
    xml_file_path = Column(String(500), nullable=True)
    xml_content = Column(Text, nullable=True)

    # Totais comparativos (Pedido vs XML)
    order_total_qty = Column(Integer, nullable=False, default=0)
    xml_total_qty = Column(Integer, nullable=False, default=0)
    order_total_gross = Column(Numeric(14, 2), nullable=False, default=0.00)
    xml_total_gross = Column(Numeric(14, 2), nullable=False, default=0.00)
    order_total_discount = Column(Numeric(14, 2), nullable=False, default=0.00)
    xml_total_discount = Column(Numeric(14, 2), nullable=False, default=0.00)
    order_total_net = Column(Numeric(14, 2), nullable=False, default=0.00)
    xml_total_products_net = Column(Numeric(14, 2), nullable=False, default=0.00)
    xml_total_nf = Column(Numeric(14, 2), nullable=False, default=0.00)
    xml_frete = Column(Numeric(14, 2), nullable=False, default=0.00)
    xml_ipi_st_outros = Column(Numeric(14, 2), nullable=False, default=0.00)

    # Diagnóstico automático por tipo de divergência
    diagnostic_status = Column(String(30), nullable=False, default="MATCH_100", index=True)  # MATCH_100 | HAS_DIVERGENCE
    matched_ok_count = Column(Integer, nullable=False, default=0)
    divergent_items_count = Column(Integer, nullable=False, default=0)
    diff_cover_count = Column(Integer, nullable=False, default=0)
    diff_discount_count = Column(Integer, nullable=False, default=0)
    diff_qty_count = Column(Integer, nullable=False, default=0)
    extra_in_xml_count = Column(Integer, nullable=False, default=0)
    missing_in_xml_count = Column(Integer, nullable=False, default=0)
    header_warnings = Column(JSONB, nullable=True)

    # Decisão Comercial (PENDING_REVIEW, XML_OK, ACCEPTED_WITH_DIVERGENCE, REJECTED)
    decision_status = Column(String(40), nullable=False, default="PENDING_REVIEW", index=True)
    decision_notes = Column(Text, nullable=True)

    uploaded_by_user_id = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)
    uploaded_by_name = Column(String(150), nullable=True)
    decided_by_user_id = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)
    decided_by_name = Column(String(150), nullable=True)
    decided_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("ix_pur_horus_xml_audit_comp_status", "company_id", "decision_status", "diagnostic_status"),
    )

    company = relationship("Company", foreign_keys=[company_id])
    order = relationship("HorusPurchaseOrder", back_populates="xml_audits", foreign_keys=[order_id])
    uploaded_by = relationship("User", foreign_keys=[uploaded_by_user_id])
    decided_by = relationship("User", foreign_keys=[decided_by_user_id])
    audit_items = relationship(
        "HorusPurchaseXmlAuditItem",
        back_populates="audit",
        cascade="all, delete-orphan",
        foreign_keys="HorusPurchaseXmlAuditItem.audit_id",
        order_by="HorusPurchaseXmlAuditItem.id.asc()",
    )


class HorusPurchaseXmlAuditItem(Base):
    """
    Linha individualizada de conciliação Pedido vs XML da NF-e, pontuando exatamente:
      - Preço de Capa (Pedido vs XML)
      - Desconto % (Pedido vs XML / Desconto Efetivo sobre Capa)
      - Quantidade (Pedido vs XML)
      - Item Extra no XML ou Item Faltante no XML
      - Observação/pontuação específica do item na análise posterior
    """
    __tablename__ = "pur_horus_xml_audit_item"

    id = Column(Integer, primary_key=True, index=True)
    audit_id = Column(Integer, ForeignKey("pur_horus_xml_audit.id", ondelete="CASCADE"), nullable=False, index=True)
    order_item_id = Column(Integer, ForeignKey("pur_horus_order_item.id", ondelete="SET NULL"), nullable=True)

    xml_n_item = Column(Integer, nullable=True)
    cod_item = Column(Integer, nullable=True, index=True)
    isbn = Column(String(30), nullable=True, index=True)
    xml_ean = Column(String(30), nullable=True)
    xml_cprod = Column(String(60), nullable=True)
    title = Column(String(255), nullable=False)
    nome_editora = Column(String(150), nullable=True)
    cfop = Column(String(10), nullable=True)

    # Valores no Pedido de Compra
    order_qty = Column(Integer, nullable=False, default=0)
    order_cover_price = Column(Numeric(12, 2), nullable=False, default=0.00)
    order_discount_pct = Column(Numeric(6, 2), nullable=False, default=0.00)
    order_unit_net = Column(Numeric(12, 4), nullable=False, default=0.00)
    order_subtotal_net = Column(Numeric(14, 2), nullable=False, default=0.00)

    # Valores apurados no XML da NF-e
    xml_qty = Column(Integer, nullable=False, default=0)
    xml_cover_price = Column(Numeric(12, 2), nullable=False, default=0.00)
    xml_discount_pct = Column(Numeric(6, 2), nullable=False, default=0.00)
    xml_effective_discount_pct = Column(Numeric(6, 2), nullable=False, default=0.00)
    xml_unit_net = Column(Numeric(12, 4), nullable=False, default=0.00)
    xml_subtotal_net = Column(Numeric(14, 2), nullable=False, default=0.00)

    # Flags individualizadas de divergência
    line_status = Column(String(30), nullable=False, default="OK", index=True)  # OK | DIVERGENT
    has_qty_diff = Column(Boolean, nullable=False, default=False)
    has_cover_diff = Column(Boolean, nullable=False, default=False)
    has_discount_diff = Column(Boolean, nullable=False, default=False)
    is_extra_in_xml = Column(Boolean, nullable=False, default=False)
    is_missing_in_xml = Column(Boolean, nullable=False, default=False)
    divergence_tags = Column(JSONB, nullable=True)
    divergence_summary = Column(String(500), nullable=True)
    item_note = Column(String(500), nullable=True)

    audit = relationship("HorusPurchaseXmlAudit", back_populates="audit_items", foreign_keys=[audit_id])
    order_item = relationship("HorusPurchaseOrderItem", foreign_keys=[order_item_id])


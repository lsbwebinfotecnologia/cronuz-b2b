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

    # Status no Cronuz: APPROVED, AWAITING_DELIVERY, IN_CONFERENCE, COMPLETED, CANCELLED
    status = Column(String(40), nullable=False, default="APPROVED", index=True)
    # Status no Horus: AP, AE, AC, EE, CA
    horus_status = Column(String(5), nullable=False, default="AP", index=True)

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

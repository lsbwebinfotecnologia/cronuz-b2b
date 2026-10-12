from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Numeric, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base
import enum


class CAFTableStatus(str, enum.Enum):
    AVAILABLE = "AVAILABLE"        # Livre
    OCCUPIED = "OCCUPIED"          # Ocupada / Comanda ativa
    BILL_REQUESTED = "BILL_REQUESTED"  # Conta solicitada / aguardando pagamento
    BLOCKED = "BLOCKED"            # Interditada / Manutenção


class CAFTabStatus(str, enum.Enum):
    OPEN = "OPEN"                  # Comanda aberta / lançando itens
    BILL_REQUESTED = "BILL_REQUESTED"  # Fechando / aguardando caixa
    PAID = "PAID"                  # Quitada no PDV
    CANCELLED = "CANCELLED"        # Cancelada


class CAFPrepStatus(str, enum.Enum):
    DRAFT = "DRAFT"                # Rascunho / na mesa (ainda não disparado para produção)
    PENDING = "PENDING"            # Aguardando início na copa/barista/cozinha
    PREPARING = "PREPARING"        # Em preparo
    READY = "READY"                # Pronto para entrega
    DELIVERED = "DELIVERED"        # Entregue na mesa/balcão
    CANCELLED = "CANCELLED"        # Cancelado


class CAFPrepSector(str, enum.Enum):
    BEVERAGE = "BEVERAGE"          # Barista / Copa / Bebidas / Chopp / Drinks
    KITCHEN = "KITCHEN"            # Cozinha / Lanches / Salgados / Pratos
    OTHER = "OTHER"                # Balcão / Sobremesas / Geral


class CAFTable(Base):
    __tablename__ = "caf_table"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)

    number = Column(String(50), nullable=False)  # Ex: "01", "Mesa 12", "Balcão A"
    table_token = Column(String(64), unique=True, index=True, nullable=True)  # Token criptográfico opaco para QR Code
    area = Column(String(100), default="Salão Principal", nullable=False)  # "Salão", "Varanda", "Balcão"
    capacity = Column(Integer, default=4, nullable=False)
    status = Column(String(50), default=CAFTableStatus.AVAILABLE.value, nullable=False, index=True)
    active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships com foreign_keys explícitas
    company = relationship("Company", foreign_keys=[company_id])
    tabs = relationship("CAFTab", back_populates="table", foreign_keys="CAFTab.table_id")

    __table_args__ = (
        Index("idx_caf_table_company_status", "company_id", "status"),
        Index("idx_caf_table_company_number", "company_id", "number"),
    )


class CAFModifierGroup(Base):
    __tablename__ = "caf_modifier_group"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)

    name = Column(String(100), nullable=False)  # Ex: "Tipo de Leite", "Adicionais", "Açúcar/Adoçante"
    min_selectable = Column(Integer, default=0, nullable=False)  # 0 = opcional, 1+ = obrigatório
    max_selectable = Column(Integer, default=1, nullable=False)  # 1 = único (radio), >1 = múltiplo (checkbox)
    active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships com foreign_keys explícitas
    company = relationship("Company", foreign_keys=[company_id])
    options = relationship(
        "CAFModifierOption",
        back_populates="group",
        cascade="all, delete-orphan",
        foreign_keys="CAFModifierOption.group_id"
    )

    __table_args__ = (
        Index("idx_caf_modifier_group_comp", "company_id", "active"),
    )


class CAFModifierOption(Base):
    __tablename__ = "caf_modifier_option"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("caf_modifier_group.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)

    name = Column(String(100), nullable=False)  # Ex: "Leite Integral", "Leite de Aveia (+R$ 3,00)", "Dose Dupla"
    additional_price = Column(Numeric(10, 2), default=0.00, nullable=False)
    active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships com foreign_keys explícitas
    group = relationship("CAFModifierGroup", back_populates="options", foreign_keys=[group_id])
    company = relationship("Company", foreign_keys=[company_id])

    __table_args__ = (
        Index("idx_caf_modifier_opt_comp_grp", "company_id", "group_id"),
    )


class CAFProductModifier(Base):
    __tablename__ = "caf_product_modifier"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("prd_product.id", ondelete="CASCADE"), nullable=False, index=True)
    group_id = Column(Integer, ForeignKey("caf_modifier_group.id", ondelete="CASCADE"), nullable=False, index=True)

    # Relationships com foreign_keys explícitas
    company = relationship("Company", foreign_keys=[company_id])
    product = relationship("Product", foreign_keys=[product_id])
    group = relationship("CAFModifierGroup", foreign_keys=[group_id])

    __table_args__ = (
        Index("idx_caf_prod_mod_prod", "company_id", "product_id"),
    )


class CAFTab(Base):
    __tablename__ = "caf_tab"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    table_id = Column(Integer, ForeignKey("caf_table.id", ondelete="SET NULL"), nullable=True, index=True)
    waiter_user_id = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)
    pos_session_id = Column(Integer, ForeignKey("pos_session.id", ondelete="SET NULL"), nullable=True, index=True)
    pos_sale_id = Column(Integer, ForeignKey("pos_sale.id", ondelete="SET NULL"), nullable=True, index=True)

    tab_number = Column(String(50), nullable=False, index=True)  # "101", "Mesa 03", "Cartão 45"
    customer_name = Column(String(255), nullable=True)  # Nome opcional para chamar no balcão
    customer_document = Column(String(50), nullable=True)  # CPF opcional para nota
    notes = Column(Text, nullable=True)

    status = Column(String(50), default=CAFTabStatus.OPEN.value, nullable=False, index=True)

    subtotal = Column(Numeric(12, 2), default=0.00, nullable=False)
    discount = Column(Numeric(12, 2), default=0.00, nullable=False)
    total_amount = Column(Numeric(12, 2), default=0.00, nullable=False)

    opened_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    closed_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships com foreign_keys explícitas
    company = relationship("Company", foreign_keys=[company_id])
    table = relationship("CAFTable", back_populates="tabs", foreign_keys=[table_id])
    waiter = relationship("User", foreign_keys=[waiter_user_id])
    pos_session = relationship("POSSession", foreign_keys=[pos_session_id])
    pos_sale = relationship("POSSale", foreign_keys=[pos_sale_id])
    items = relationship(
        "CAFOrderItem",
        back_populates="tab",
        cascade="all, delete-orphan",
        foreign_keys="CAFOrderItem.tab_id"
    )

    __table_args__ = (
        Index("idx_caf_tab_company_status", "company_id", "status"),
        Index("idx_caf_tab_company_number", "company_id", "tab_number"),
    )


class CAFOrderItem(Base):
    __tablename__ = "caf_order_item"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    tab_id = Column(Integer, ForeignKey("caf_tab.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("prd_product.id", ondelete="SET NULL"), nullable=True, index=True)
    created_by_user_id = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)

    barcode = Column(String(50), nullable=True, index=True)
    sku = Column(String(100), nullable=True)
    title = Column(String(255), nullable=False)
    source = Column(String(50), default="CRONUZ", nullable=False)  # "CRONUZ" ou "HORUS"
    horus_item_code = Column(String(50), nullable=True)

    quantity = Column(Numeric(10, 2), default=1.00, nullable=False)
    unit_price = Column(Numeric(12, 2), default=0.00, nullable=False)  # Preço base
    modifiers_price = Column(Numeric(12, 2), default=0.00, nullable=False)  # Soma dos modificadores por unidade
    total_price = Column(Numeric(12, 2), default=0.00, nullable=False)  # (unit_price + modifiers_price) * quantity

    # Modificadores e opcionais selecionados: ex: [{"group_id": 1, "group_name": "Leite", "option_id": 3, "option_name": "Leite de Aveia", "price": 3.00}]
    modifiers_json = Column(JSONB, nullable=True, default=list)
    notes = Column(Text, nullable=True)  # Observações livres: "Sem canela, bem quente"

    # Setor e Categoria
    category_name = Column(String(100), nullable=True)
    prep_sector = Column(String(50), default=CAFPrepSector.BEVERAGE.value, nullable=False, index=True)  # BEVERAGE, KITCHEN, OTHER

    # Controle de Barista / Cozinha (KDS)
    requires_preparation = Column(Boolean, default=True, nullable=False, index=True)
    prep_status = Column(String(50), default=CAFPrepStatus.PENDING.value, nullable=False, index=True)
    prep_started_at = Column(DateTime(timezone=True), nullable=True)
    prep_finished_at = Column(DateTime(timezone=True), nullable=True)
    delivered_at = Column(DateTime(timezone=True), nullable=True)

    # Comunicação Barista / Cozinha -> Garçom (Alertas de falta de insumo, etc.)
    kitchen_alert = Column(String(255), nullable=True)
    kitchen_alert_at = Column(DateTime(timezone=True), nullable=True)
    kitchen_alert_acknowledged = Column(Boolean, default=False, nullable=False)

    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    cancel_reason = Column(String(255), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships com foreign_keys explícitas
    company = relationship("Company", foreign_keys=[company_id])
    tab = relationship("CAFTab", back_populates="items", foreign_keys=[tab_id])
    product = relationship("Product", foreign_keys=[product_id])
    created_by_user = relationship("User", foreign_keys=[created_by_user_id])

    __table_args__ = (
        Index("idx_caf_order_item_tab", "tab_id"),
        Index("idx_caf_order_item_kds", "company_id", "requires_preparation", "prep_status"),
        Index("idx_caf_order_item_sector", "company_id", "prep_sector", "prep_status"),
    )

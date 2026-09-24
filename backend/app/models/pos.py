from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Numeric, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base
import enum


class POSSessionStatus(str, enum.Enum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"


class POSCatalogSource(str, enum.Enum):
    CONSIGNMENT = "CONSIGNMENT"
    HORUS_CATALOG = "HORUS_CATALOG"
    CRONUZ_CATALOG = "CRONUZ_CATALOG"
    SPREADSHEET = "SPREADSHEET"
    GENERAL = "GENERAL"


class POSPaymentMethod(str, enum.Enum):
    DINHEIRO = "DINHEIRO"
    PIX = "PIX"
    DEBITO = "DEBITO"
    CREDITO = "CREDITO"
    MISTO = "MISTO"


class POSSession(Base):
    __tablename__ = "pos_session"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)

    code = Column(String(50), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    status = Column(String(50), default=POSSessionStatus.OPEN.value, nullable=False, index=True)
    catalog_source = Column(String(50), default=POSCatalogSource.GENERAL.value, nullable=False)
    source_reference = Column(String(255), nullable=True)  # ex: "Contrato Consignação #12345" ou "planilha_evento.xlsx"

    customer_id = Column(Integer, ForeignKey("crm_customer.id", ondelete="SET NULL"), nullable=True)
    customer_name = Column(String(255), nullable=True)
    customer_document = Column(String(50), nullable=True)

    total_sales_count = Column(Integer, default=0, nullable=False)
    total_sales_amount = Column(Numeric(12, 2), default=0.00, nullable=False)
    products_count = Column(Integer, default=0, nullable=False)

    opened_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    closed_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relacionamentos com foreign_keys explícitas
    company = relationship("Company", foreign_keys=[company_id])
    user = relationship("User", foreign_keys=[user_id])
    customer = relationship("Customer", foreign_keys=[customer_id])
    sales = relationship(
        "POSSale",
        back_populates="session",
        cascade="all, delete-orphan",
        foreign_keys="POSSale.session_id"
    )
    products = relationship(
        "POSSessionProduct",
        back_populates="session",
        cascade="all, delete-orphan",
        foreign_keys="POSSessionProduct.session_id"
    )

    __table_args__ = (
        Index("idx_pos_session_company_status", "company_id", "status"),
    )


class POSSale(Base):
    __tablename__ = "pos_sale"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(Integer, ForeignKey("pos_session.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)

    client_sale_uuid = Column(String(64), unique=True, index=True, nullable=False)  # Chave de idempotência gerada no frontend
    sale_number = Column(String(50), nullable=False, index=True)

    # Identificação do consumidor / cliente
    customer_name = Column(String(255), default="Consumidor Final", nullable=False)
    customer_document = Column(String(50), nullable=True)
    customer_id = Column(Integer, ForeignKey("crm_customer.id", ondelete="SET NULL"), nullable=True)

    payment_method = Column(String(50), default=POSPaymentMethod.DINHEIRO.value, nullable=False)
    payment_details = Column(Text, nullable=True)  # JSON string com troco, parcelamento ou split

    subtotal = Column(Numeric(12, 2), default=0.00, nullable=False)
    discount = Column(Numeric(12, 2), default=0.00, nullable=False)
    total_amount = Column(Numeric(12, 2), default=0.00, nullable=False)
    items_count = Column(Integer, default=0, nullable=False)

    sold_at = Column(DateTime(timezone=True), nullable=False)  # Timestamp exato do momento da venda (offline ou online)
    synced_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    origin = Column(String(50), default="pdv_offline", nullable=False)  # pdv_offline, pdv_online, etc.
    status = Column(String(50), default="COMPLETED", nullable=False)  # COMPLETED, CANCELLED
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relacionamentos com foreign_keys explícitas
    session = relationship("POSSession", back_populates="sales", foreign_keys=[session_id])
    company = relationship("Company", foreign_keys=[company_id])
    user = relationship("User", foreign_keys=[user_id])
    customer = relationship("Customer", foreign_keys=[customer_id])
    items = relationship(
        "POSSaleItem",
        back_populates="sale",
        cascade="all, delete-orphan",
        foreign_keys="POSSaleItem.sale_id"
    )

    __table_args__ = (
        Index("idx_pos_sale_company_sold", "company_id", "sold_at"),
        Index("idx_pos_sale_session", "session_id"),
    )


class POSSaleItem(Base):
    __tablename__ = "pos_sale_item"

    id = Column(Integer, primary_key=True, index=True)
    sale_id = Column(Integer, ForeignKey("pos_sale.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("prd_product.id", ondelete="SET NULL"), nullable=True)

    barcode = Column(String(50), nullable=False, index=True)
    sku = Column(String(100), nullable=True)
    title = Column(String(255), nullable=False)
    publisher = Column(String(255), nullable=True)
    quantity = Column(Numeric(10, 2), default=1.00, nullable=False)
    unit_price = Column(Numeric(12, 2), default=0.00, nullable=False)
    total_price = Column(Numeric(12, 2), default=0.00, nullable=False)
    horus_item_code = Column(String(50), nullable=True)

    # Relacionamentos com foreign_keys explícitas
    sale = relationship("POSSale", back_populates="items", foreign_keys=[sale_id])
    product = relationship("Product", foreign_keys=[product_id])


class POSSessionProduct(Base):
    __tablename__ = "pos_session_product"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("pos_session.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("prd_product.id", ondelete="SET NULL"), nullable=True)

    barcode = Column(String(50), nullable=False, index=True)
    sku = Column(String(100), nullable=True)
    title = Column(String(255), nullable=False)
    publisher = Column(String(255), nullable=True)
    price = Column(Numeric(12, 2), nullable=False, default=0.00)
    stock = Column(Numeric(10, 2), nullable=False, default=100.00)
    horus_item_code = Column(String(50), nullable=True)
    source = Column(String(50), default="SPREADSHEET", nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relacionamentos com foreign_keys explícitas
    session = relationship("POSSession", back_populates="products", foreign_keys=[session_id])
    company = relationship("Company", foreign_keys=[company_id])
    product = relationship("Product", foreign_keys=[product_id])

    __table_args__ = (
        Index("idx_pos_session_product_session_barcode", "session_id", "barcode", unique=True),
        Index("idx_pos_session_product_company", "company_id"),
    )

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, JSON, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base


class MeliListing(Base):
    """
    Vínculo de anúncios publicados ou importados do Mercado Livre por Seller.
    Suporta itens do catálogo local (prd_product) e itens do Horus ERP (via sku / ean_gtin / horus_cod_item).
    """
    __tablename__ = "meli_listings"
    __table_args__ = (
        Index("idx_meli_listings_company_status", "company_id", "status"),
        Index("idx_meli_listings_company_meli_id", "company_id", "meli_item_id"),
        Index("idx_meli_listings_company_ean", "company_id", "ean_gtin"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("prd_product.id"), nullable=True, index=True)

    sku = Column(String(100), nullable=True, index=True)
    ean_gtin = Column(String(50), nullable=True, index=True)
    horus_cod_item = Column(Integer, nullable=True, index=True)

    title = Column(String(255), nullable=False)
    meli_item_id = Column(String(60), nullable=False, index=True)  # Ex: MLB1234567890
    meli_category_id = Column(String(50), nullable=False, default="MLB1196")
    meli_category_name = Column(String(255), nullable=True)

    listing_type_id = Column(String(50), nullable=False, default="gold_special")  # gold_special (Clássico) | gold_pro (Premium)
    condition = Column(String(30), nullable=False, default="new")  # new | used
    status = Column(String(50), nullable=False, default="active", index=True)  # active, paused, closed, under_review, error

    base_price = Column(Float, nullable=False, default=0.0)
    meli_price = Column(Float, nullable=False, default=0.0)

    current_stock = Column(Integer, nullable=False, default=0)
    last_synced_stock = Column(Integer, nullable=True)
    last_synced_price = Column(Float, nullable=True)

    logistic_type = Column(String(50), nullable=True)  # drop_off, xd_drop_off, cross_docking, fulfillment, me2
    permalink = Column(String(500), nullable=True)
    thumbnail = Column(String(500), nullable=True)

    attributes_json = Column(JSON, nullable=True)  # Ficha técnica (GTIN, AUTHOR, PUBLISHER, LANGUAGE, BOOK_COVER, etc.)
    sync_error = Column(Text, nullable=True)

    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    company = relationship("Company", foreign_keys=[company_id])
    product = relationship("Product", foreign_keys=[product_id])


class MeliOrder(Base):
    """
    Espelho de pedidos recebidos do Mercado Livre (via Webhook orders_v2 ou Polling),
    vinculado ao pedido interno do Cronuz (ord_order) e/ou ao pedido no Horus ERP.
    """
    __tablename__ = "meli_orders"
    __table_args__ = (
        Index("idx_meli_orders_company_order_id", "company_id", "meli_order_id"),
        Index("idx_meli_orders_company_status", "company_id", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False, index=True)

    meli_order_id = Column(String(80), nullable=False, index=True)
    meli_pack_id = Column(String(80), nullable=True, index=True)
    meli_shipment_id = Column(String(80), nullable=True, index=True)

    status = Column(String(50), nullable=False, default="paid", index=True)  # paid, confirmed, cancelled, invalid
    shipping_status = Column(String(50), nullable=True)  # ready_to_ship, pending, handling, shipped, delivered, cancelled
    shipping_substatus = Column(String(80), nullable=True)  # invoice_pending, ready_to_print, printed, etc.
    logistic_type = Column(String(50), nullable=True)  # drop_off, xd_drop_off, fulfillment, self_service

    buyer_id = Column(String(80), nullable=True)
    buyer_nickname = Column(String(150), nullable=True)
    buyer_name = Column(String(255), nullable=True)
    buyer_email = Column(String(255), nullable=True)
    buyer_doc_type = Column(String(20), nullable=True)  # CPF / CNPJ
    buyer_doc_number = Column(String(50), nullable=True, index=True)
    buyer_phone = Column(String(50), nullable=True)

    total_amount = Column(Float, nullable=False, default=0.0)
    paid_amount = Column(Float, nullable=False, default=0.0)
    shipping_cost = Column(Float, nullable=False, default=0.0)
    meli_fee = Column(Float, nullable=False, default=0.0)

    cronuz_order_id = Column(Integer, ForeignKey("ord_order.id"), nullable=True, index=True)
    horus_pedido_venda = Column(String(100), nullable=True, index=True)
    invoice_xml_sent = Column(Boolean, nullable=False, default=False)
    invoice_number = Column(String(50), nullable=True)
    invoice_key = Column(String(60), nullable=True)

    items_json = Column(JSON, nullable=True)
    shipping_address_json = Column(JSON, nullable=True)
    raw_payload = Column(JSON, nullable=True)
    sync_error = Column(Text, nullable=True)

    meli_created_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    company = relationship("Company", foreign_keys=[company_id])
    cronuz_order = relationship("Order", foreign_keys=[cronuz_order_id])


class MeliSyncLog(Base):
    """
    Histórico de execuções de sincronização de estoque (Delta Sync),
    importação de catálogo e processamento de pedidos do Mercado Livre.
    """
    __tablename__ = "meli_sync_logs"
    __table_args__ = (
        Index("idx_meli_sync_logs_company_created", "company_id", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False, index=True)

    sync_type = Column(String(50), nullable=False, index=True)  # STOCK_DELTA, CATALOG_IMPORT, ITEM_PUBLISH, ORDER_SYNC
    status = Column(String(30), nullable=False, default="SUCCESS")  # SUCCESS, PARTIAL, ERROR
    items_processed = Column(Integer, nullable=False, default=0)
    items_updated = Column(Integer, nullable=False, default=0)
    items_failed = Column(Integer, nullable=False, default=0)
    message = Column(Text, nullable=True)
    details_json = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    company = relationship("Company", foreign_keys=[company_id])

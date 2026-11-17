from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, JSON, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base


class MarketplaceSyncQueue(Base):
    """
    Fila Unificada de Processamento Assíncrono de Produtos, Preços e Estoques
    para todos os Marketplaces (mercadolivre, estantevirtual, shopee, etc.).
    Itens concluídos com sucesso são eliminados (drenados) desta tabela após
    atualizarem o estado vivo na tabela de anúncios correspondente.
    """
    __tablename__ = "mkt_sync_queue"
    __table_args__ = (
        Index("idx_mkt_queue_company_channel_status", "company_id", "channel", "status"),
        Index("idx_mkt_queue_company_channel_sku_op", "company_id", "channel", "sku", "operation"),
        Index("idx_mkt_queue_status_priority_next", "status", "priority", "next_run_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False, index=True)
    channel = Column(String(40), nullable=False, index=True)  # mercadolivre, estantevirtual, shopee
    operation = Column(String(40), nullable=False, index=True)  # PUBLISH_PRODUCT, UPDATE_PRODUCT, SYNC_STOCK, SYNC_PRICE, REMOVE_PRODUCT
    priority = Column(Integer, nullable=False, default=20, index=True)  # 10=Estoque Urgente, 20=Preço, 30=Catálogo

    listing_id = Column(Integer, nullable=True, index=True)
    product_id = Column(Integer, ForeignKey("prd_product.id"), nullable=True, index=True)
    sku = Column(String(100), nullable=False, index=True)
    isbn_ean = Column(String(50), nullable=True, index=True)
    title = Column(String(255), nullable=True)

    payload_json = Column(JSON, nullable=True)
    status = Column(String(30), nullable=False, default="PENDING", index=True)  # PENDING, PROCESSING, RETRY, FAILED
    attempts = Column(Integer, nullable=False, default=0)
    max_attempts = Column(Integer, nullable=False, default=3)
    next_run_at = Column(DateTime(timezone=True), nullable=True, index=True)
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    company = relationship("Company", foreign_keys=[company_id])
    product = relationship("Product", foreign_keys=[product_id])


class EvListing(Base):
    """
    Estado vivo dos livros publicados na Estante Virtual por Seller.
    Mantém as informações necessárias para atualizações rápidas em lote de preço (PUT /precos)
    e estoque (PUT /estoques), além de travar o atributo 'condition' (NOVO / USADO).
    """
    __tablename__ = "ev_listings"
    __table_args__ = (
        Index("idx_ev_listings_company_status", "company_id", "status"),
        Index("idx_ev_listings_company_sku", "company_id", "sku"),
        Index("idx_ev_listings_company_isbn", "company_id", "isbn"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("prd_product.id"), nullable=True, index=True)

    sku = Column(String(100), nullable=False, index=True)  # Campo 'codigo' único do vendedor na EV
    isbn = Column(String(50), nullable=False, index=True)  # ISBN obrigatório na EV
    horus_cod_item = Column(Integer, nullable=True, index=True)

    title = Column(String(150), nullable=False)  # Máx 130 caracteres na EV
    author = Column(String(255), nullable=False, default="Vários Autores")
    publisher = Column(String(150), nullable=False, default="Editora")  # Campo 'marca' na EV

    ev_category_id = Column(Integer, nullable=False, default=65)  # 1..74 (65 = Outros Assuntos)
    ev_category_name = Column(String(150), nullable=False, default="Outros Assuntos")

    condition = Column(String(20), nullable=False, default="NOVO")  # NOVO | USADO (imutável após criado na EV)
    status = Column(String(40), nullable=False, default="active", index=True)  # active, paused, queued, error
    is_published_on_ev = Column(Boolean, nullable=False, default=False)  # True após POST /produtos retornar sucesso

    base_price = Column(Float, nullable=False, default=0.0)  # valor_de
    ev_price = Column(Float, nullable=False, default=0.0)    # valor_por (mínimo R$ 6,00)

    current_stock = Column(Integer, nullable=False, default=0)
    last_synced_stock = Column(Integer, nullable=True)
    last_synced_price = Column(Float, nullable=True)

    handling_days = Column(Integer, nullable=False, default=2)  # prazo_postagem (1 a 20 dias)
    weight_grams = Column(Integer, nullable=False, default=300)  # peso em gramas
    release_year = Column(Integer, nullable=False, default=2024)  # ano
    language = Column(String(10), nullable=False, default="Pt")   # Pt, En, Es, etc.
    thumbnail = Column(String(500), nullable=True)

    attributes_json = Column(JSON, nullable=True)
    sync_error = Column(Text, nullable=True)

    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    company = relationship("Company", foreign_keys=[company_id])
    product = relationship("Product", foreign_keys=[product_id])


class EvOrder(Base):
    """
    Espelho de pedidos recebidos da Estante Virtual via Webhook (POST /pedido e PUT /pedido),
    vinculado ao pedido interno do Cronuz (ord_order) e ao Horus ERP.
    """
    __tablename__ = "ev_orders"
    __table_args__ = (
        Index("idx_ev_orders_company_order_id", "company_id", "ev_order_id"),
        Index("idx_ev_orders_company_status", "company_id", "status_codigo"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False, index=True)

    ev_order_id = Column(String(80), nullable=False, index=True)        # marketplace_id_pedido
    ev_store_order_id = Column(String(80), nullable=True, index=True)   # marketplace_id_pedido_loja
    payment_id = Column(String(100), nullable=True)                     # id_pagamento

    status_codigo = Column(String(40), nullable=False, default="PROCESSING", index=True)  # EXPIRED | PROCESSING | CANCELED | STANDBY | SENT
    shipping_method = Column(String(80), nullable=True)  # Impresso normal, PAC, Sedex, MLE (Magalu Entregas)
    tracking_code = Column(String(100), nullable=True)   # rastreio (Correios)
    tracking_url = Column(String(500), nullable=True)    # url_rastreio (Transportadora - mutuamente exclusivo com rastreio)
    cancel_reason = Column(String(80), nullable=True)    # sem_estoque | erro_processamento | cliente_devolveu

    buyer_id = Column(String(80), nullable=True)
    buyer_name = Column(String(255), nullable=True)
    buyer_email = Column(String(255), nullable=True)
    buyer_doc_type = Column(String(20), nullable=True)  # PF | PJ
    buyer_doc_number = Column(String(50), nullable=True, index=True)
    buyer_phone = Column(String(60), nullable=True)

    total_amount = Column(Float, nullable=False, default=0.0)
    shipping_cost = Column(Float, nullable=False, default=0.0)
    discount_amount = Column(Float, nullable=False, default=0.0)
    payment_method = Column(String(80), nullable=True)  # Cartão de crédito, Boleto, Pix
    installments = Column(Integer, nullable=False, default=1)

    cronuz_order_id = Column(Integer, ForeignKey("ord_order.id"), nullable=True, index=True)
    horus_pedido_venda = Column(String(100), nullable=True, index=True)

    items_json = Column(JSON, nullable=True)
    shipping_address_json = Column(JSON, nullable=True)
    invoice_data_json = Column(JSON, nullable=True)  # dados_nota_fiscal (cnpj_instituicao_financeira, codigo_autorizacao, bandeira, e2e_id_pix)
    raw_payload = Column(JSON, nullable=True)
    sync_error = Column(Text, nullable=True)

    estimated_delivery_date = Column(String(40), nullable=True)
    ev_created_at = Column(String(40), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    company = relationship("Company", foreign_keys=[company_id])
    cronuz_order = relationship("Order", foreign_keys=[cronuz_order_id])


class EvSyncLog(Base):
    """
    Histórico de execuções da fila de produtos, lote de estoque (PUT /estoques),
    lote de preços (PUT /precos) e webhooks de pedidos da Estante Virtual.
    """
    __tablename__ = "ev_sync_logs"
    __table_args__ = (
        Index("idx_ev_sync_logs_company_created", "company_id", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False, index=True)

    sync_type = Column(String(50), nullable=False, index=True)  # QUEUE_DRAIN, STOCK_BATCH, PRICE_BATCH, ITEM_PUBLISH, ORDER_WEBHOOK, ORDER_UPDATE
    status = Column(String(30), nullable=False, default="SUCCESS")  # SUCCESS, PARTIAL, ERROR
    items_processed = Column(Integer, nullable=False, default=0)
    items_updated = Column(Integer, nullable=False, default=0)
    items_failed = Column(Integer, nullable=False, default=0)
    message = Column(Text, nullable=True)
    details_json = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    company = relationship("Company", foreign_keys=[company_id])

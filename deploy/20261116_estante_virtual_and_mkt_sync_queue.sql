-- =============================================================================
-- MIGRAÇÃO POSTGRESQL: INTEGRAÇÃO ESTANTE VIRTUAL + FILA UNIFICADA (mkt_sync_queue)
-- Data: 16/11/2026
-- =============================================================================

BEGIN;

-- 0. Flag de habilitação do módulo Estante Virtual por Seller no Painel Master (cmp_company)
ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS module_estantevirtual BOOLEAN NOT NULL DEFAULT FALSE;

-- 1. Novas colunas de configuração da Estante Virtual em cmp_settings
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS ev_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS ev_environment VARCHAR(30) NOT NULL DEFAULT 'PRODUCAO';
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS ev_seller_id VARCHAR(100);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS ev_email VARCHAR(255);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS ev_password VARCHAR(255);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS ev_auth_token VARCHAR(1500);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS ev_token_expires_at TIMESTAMPTZ;
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS ev_webhook_secret VARCHAR(255);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS ev_preset_config JSON;

CREATE INDEX IF NOT EXISTS ix_cmp_settings_ev_seller_id ON cmp_settings (ev_seller_id);

-- 2. Tabela Unificada de Fila de Processamento de Marketplaces (mkt_sync_queue)
CREATE TABLE IF NOT EXISTS mkt_sync_queue (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id),
    channel VARCHAR(40) NOT NULL,
    operation VARCHAR(40) NOT NULL,
    priority INTEGER NOT NULL DEFAULT 20,
    listing_id INTEGER,
    product_id INTEGER REFERENCES prd_product(id),
    sku VARCHAR(100) NOT NULL,
    isbn_ean VARCHAR(50),
    title VARCHAR(255),
    payload_json JSON,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    next_run_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mkt_queue_company_channel_status ON mkt_sync_queue (company_id, channel, status);
CREATE INDEX IF NOT EXISTS idx_mkt_queue_company_channel_sku_op ON mkt_sync_queue (company_id, channel, sku, operation);
CREATE INDEX IF NOT EXISTS idx_mkt_queue_status_priority_next ON mkt_sync_queue (status, priority, next_run_at);

-- 3. Tabela de Estado Vivo de Anúncios na Estante Virtual (ev_listings)
CREATE TABLE IF NOT EXISTS ev_listings (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id),
    product_id INTEGER REFERENCES prd_product(id),
    sku VARCHAR(100) NOT NULL,
    isbn VARCHAR(50) NOT NULL,
    horus_cod_item INTEGER,
    title VARCHAR(150) NOT NULL,
    author VARCHAR(255) NOT NULL DEFAULT 'Vários Autores',
    publisher VARCHAR(150) NOT NULL DEFAULT 'Editora',
    ev_category_id INTEGER NOT NULL DEFAULT 65,
    ev_category_name VARCHAR(150) NOT NULL DEFAULT 'Outros Assuntos',
    condition VARCHAR(20) NOT NULL DEFAULT 'NOVO',
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    is_published_on_ev BOOLEAN NOT NULL DEFAULT FALSE,
    base_price DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    ev_price DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    current_stock INTEGER NOT NULL DEFAULT 0,
    last_synced_stock INTEGER,
    last_synced_price DOUBLE PRECISION,
    handling_days INTEGER NOT NULL DEFAULT 2,
    weight_grams INTEGER NOT NULL DEFAULT 300,
    release_year INTEGER NOT NULL DEFAULT 2024,
    language VARCHAR(10) NOT NULL DEFAULT 'Pt',
    thumbnail VARCHAR(500),
    attributes_json JSON,
    sync_error TEXT,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ev_listings_company_status ON ev_listings (company_id, status);
CREATE INDEX IF NOT EXISTS idx_ev_listings_company_sku ON ev_listings (company_id, sku);
CREATE INDEX IF NOT EXISTS idx_ev_listings_company_isbn ON ev_listings (company_id, isbn);

-- 4. Tabela de Espelho de Pedidos da Estante Virtual (ev_orders)
CREATE TABLE IF NOT EXISTS ev_orders (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id),
    ev_order_id VARCHAR(80) NOT NULL,
    ev_store_order_id VARCHAR(80),
    payment_id VARCHAR(100),
    status_codigo VARCHAR(40) NOT NULL DEFAULT 'PROCESSING',
    shipping_method VARCHAR(80),
    tracking_code VARCHAR(100),
    tracking_url VARCHAR(500),
    cancel_reason VARCHAR(80),
    buyer_id VARCHAR(80),
    buyer_name VARCHAR(255),
    buyer_email VARCHAR(255),
    buyer_doc_type VARCHAR(20),
    buyer_doc_number VARCHAR(50),
    buyer_phone VARCHAR(60),
    total_amount DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    shipping_cost DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    discount_amount DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    payment_method VARCHAR(80),
    installments INTEGER NOT NULL DEFAULT 1,
    cronuz_order_id INTEGER REFERENCES ord_order(id),
    horus_pedido_venda VARCHAR(100),
    items_json JSON,
    shipping_address_json JSON,
    invoice_data_json JSON,
    raw_payload JSON,
    sync_error TEXT,
    estimated_delivery_date VARCHAR(40),
    ev_created_at VARCHAR(40),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ev_orders_company_order_id ON ev_orders (company_id, ev_order_id);
CREATE INDEX IF NOT EXISTS idx_ev_orders_company_status ON ev_orders (company_id, status_codigo);

-- 5. Tabela de Histórico de Sincronizações da Estante Virtual (ev_sync_logs)
CREATE TABLE IF NOT EXISTS ev_sync_logs (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id),
    sync_type VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'SUCCESS',
    items_processed INTEGER NOT NULL DEFAULT 0,
    items_updated INTEGER NOT NULL DEFAULT 0,
    items_failed INTEGER NOT NULL DEFAULT 0,
    message TEXT,
    details_json JSON,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ev_sync_logs_company_created ON ev_sync_logs (company_id, created_at);

COMMIT;

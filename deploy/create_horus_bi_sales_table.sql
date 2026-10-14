-- ==============================================================================
-- Migração: Criação da tabela analítica horus_bi_sales e seus índices
-- Data: 2026-10-14
-- ==============================================================================

CREATE TABLE IF NOT EXISTS horus_bi_sales (
    id BIGSERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    horus_bi_id BIGINT NOT NULL,
    customer_horus_id BIGINT NOT NULL,
    customer_name VARCHAR(255),
    customer_id INTEGER REFERENCES crm_customer(id) ON DELETE SET NULL,
    ean VARCHAR(32) NOT NULL,
    item_code INTEGER,
    item_name VARCHAR(255),
    publisher VARCHAR(255),
    genre VARCHAR(255),
    genre_sub VARCHAR(255),
    sale_date TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    month INTEGER,
    year INTEGER,
    cfop VARCHAR(10),
    movement_type VARCHAR(30) NOT NULL DEFAULT 'SALE',
    qty_ordered INTEGER NOT NULL DEFAULT 0,
    qty_fulfilled INTEGER NOT NULL DEFAULT 0,
    qty_returned INTEGER NOT NULL DEFAULT 0,
    net_value DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    gross_value DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    discount_percent DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    freight_value DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    sales_channel VARCHAR(100),
    sales_order_horus BIGINT,
    invoice_number BIGINT,
    local_warehouse VARCHAR(100),
    synced_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uix_horus_bi_sales_company_bi_id UNIQUE (company_id, horus_bi_id)
);

-- Índices de alta performance para busca e agregação instantânea
CREATE INDEX IF NOT EXISTS idx_bi_sales_lookup ON horus_bi_sales (company_id, customer_horus_id, ean, sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_bi_sales_ean ON horus_bi_sales (company_id, ean, sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_bi_sales_movement ON horus_bi_sales (company_id, movement_type, sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_bi_sales_horus_bi_id ON horus_bi_sales (company_id, horus_bi_id DESC);

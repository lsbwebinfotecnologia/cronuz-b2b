-- =============================================================================
-- DEPLOY: Módulo PDV Mobile & Desktop (Sessões e Vendas Offline/Online)
-- Data: 2026-09-23
-- Descrição: Criação das tabelas pos_session, pos_sale e pos_sale_item
-- =============================================================================

-- 1. Tabela de Sessões / Caixas de PDV
CREATE TABLE IF NOT EXISTS pos_session (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    code VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'OPEN',
    catalog_source VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
    source_reference VARCHAR(255),
    customer_id INTEGER REFERENCES crm_customer(id) ON DELETE SET NULL,
    customer_name VARCHAR(255),
    customer_document VARCHAR(50),
    total_sales_count INTEGER NOT NULL DEFAULT 0,
    total_sales_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_pos_session_company_id ON pos_session(company_id);
CREATE INDEX IF NOT EXISTS idx_pos_session_status ON pos_session(status);
CREATE INDEX IF NOT EXISTS idx_pos_session_code ON pos_session(code);
CREATE INDEX IF NOT EXISTS idx_pos_session_company_status ON pos_session(company_id, status);

-- 2. Tabela de Vendas de PDV (Offline & Online)
CREATE TABLE IF NOT EXISTS pos_sale (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    session_id INTEGER REFERENCES pos_session(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    client_sale_uuid VARCHAR(64) NOT NULL UNIQUE,
    sale_number VARCHAR(50) NOT NULL,
    customer_name VARCHAR(255) NOT NULL DEFAULT 'Consumidor Final',
    customer_document VARCHAR(50),
    customer_id INTEGER REFERENCES crm_customer(id) ON DELETE SET NULL,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'DINHEIRO',
    payment_details TEXT,
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    items_count INTEGER NOT NULL DEFAULT 0,
    sold_at TIMESTAMP WITH TIME ZONE NOT NULL,
    synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    origin VARCHAR(50) NOT NULL DEFAULT 'pdv_offline',
    status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_pos_sale_company_id ON pos_sale(company_id);
CREATE INDEX IF NOT EXISTS idx_pos_sale_session_id ON pos_sale(session_id);
CREATE INDEX IF NOT EXISTS idx_pos_sale_uuid ON pos_sale(client_sale_uuid);
CREATE INDEX IF NOT EXISTS idx_pos_sale_number ON pos_sale(sale_number);
CREATE INDEX IF NOT EXISTS idx_pos_sale_company_sold ON pos_sale(company_id, sold_at);

-- 3. Tabela de Itens da Venda
CREATE TABLE IF NOT EXISTS pos_sale_item (
    id SERIAL PRIMARY KEY,
    sale_id INTEGER NOT NULL REFERENCES pos_sale(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES prd_product(id) ON DELETE SET NULL,
    barcode VARCHAR(50) NOT NULL,
    sku VARCHAR(100),
    title VARCHAR(255) NOT NULL,
    publisher VARCHAR(255),
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1.00,
    unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    horus_item_code VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_pos_sale_item_sale_id ON pos_sale_item(sale_id);
CREATE INDEX IF NOT EXISTS idx_pos_sale_item_barcode ON pos_sale_item(barcode);

-- 4. Flags de Módulo e Configuração (idempotente)
ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS module_pdv BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS pdv_allow_out_of_stock BOOLEAN DEFAULT FALSE NOT NULL;

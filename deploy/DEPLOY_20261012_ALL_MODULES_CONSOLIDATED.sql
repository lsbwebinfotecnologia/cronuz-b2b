-- =============================================================================
-- Migration Consolidada de Deploy para Produção
-- Data: 2026-10-12
-- Módulos: Cafeteria, Encomendas B2B, PDV Parcelamento/Split, Global Settings
-- Idempotência Total: Compatível exclusivamente com PostgreSQL
-- =============================================================================

-- 1. Módulos na Tabela cmp_company
ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS module_cafeteria BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS module_encomendas BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Configurações em cmp_settings (PDV Parcelamento e Token do Cardápio)
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS pdv_max_installments INTEGER DEFAULT 12 NOT NULL;
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS pdv_min_installment_amount NUMERIC(10, 2) DEFAULT 5.00 NOT NULL;
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS cafeteria_menu_token VARCHAR(64) UNIQUE;
CREATE INDEX IF NOT EXISTS idx_cmp_settings_cafeteria_menu_token ON cmp_settings(cafeteria_menu_token);

UPDATE cmp_settings
SET cafeteria_menu_token = 'crd_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16)
WHERE cafeteria_menu_token IS NULL;

-- 3. Tabela de Configurações Globais (sys_global_setting)
CREATE TABLE IF NOT EXISTS sys_global_setting (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT,
    description VARCHAR(255),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Tabela de Encomendas / Backorders Legado (ord_backorder)
CREATE TABLE IF NOT EXISTS ord_backorder (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    customer_id INTEGER REFERENCES crm_customer(id) ON DELETE SET NULL,
    isbn VARCHAR(30) NOT NULL,
    title VARCHAR(255) NOT NULL,
    publisher VARCHAR(150),
    author VARCHAR(150),
    quantity INTEGER NOT NULL DEFAULT 1,
    cover_url TEXT,
    price_estimated NUMERIC(10, 2) DEFAULT 0.00,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    origin VARCHAR(30) NOT NULL DEFAULT 'BUSCA_PRECO',
    has_erp_registration BOOLEAN DEFAULT FALSE,
    horus_cod_item INTEGER,
    suggested_supplier_id INTEGER REFERENCES spl_supplier(id) ON DELETE SET NULL,
    purchase_order_id INTEGER,
    notes TEXT,
    created_by INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ord_backorder_comp_status ON ord_backorder(company_id, status);
CREATE INDEX IF NOT EXISTS idx_ord_backorder_customer ON ord_backorder(customer_id);
CREATE INDEX IF NOT EXISTS idx_ord_backorder_isbn ON ord_backorder(isbn);

-- 5. Tabelas de Encomendas de Clientes Multi-item (ord_customer_encomenda)
CREATE TABLE IF NOT EXISTS ord_customer_encomenda (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    encomenda_number VARCHAR(40) NOT NULL,
    customer_id INTEGER REFERENCES crm_customer(id) ON DELETE SET NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_document VARCHAR(50),
    customer_phone VARCHAR(50),
    customer_email VARCHAR(255),
    delivery_type VARCHAR(30) NOT NULL DEFAULT 'BALCAO',
    pickup_branch_name VARCHAR(150),
    shipping_zip_code VARCHAR(20),
    shipping_street VARCHAR(255),
    shipping_number VARCHAR(50),
    shipping_complement VARCHAR(100),
    shipping_neighborhood VARCHAR(100),
    shipping_city VARCHAR(100),
    shipping_state VARCHAR(2),
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    total_items INTEGER NOT NULL DEFAULT 1,
    total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    created_by INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ord_customer_encomenda_comp ON ord_customer_encomenda(company_id, status);
CREATE INDEX IF NOT EXISTS idx_ord_customer_encomenda_doc ON ord_customer_encomenda(customer_document);
CREATE INDEX IF NOT EXISTS idx_ord_customer_encomenda_num ON ord_customer_encomenda(company_id, encomenda_number);

CREATE TABLE IF NOT EXISTS ord_customer_encomenda_item (
    id SERIAL PRIMARY KEY,
    encomenda_id INTEGER NOT NULL REFERENCES ord_customer_encomenda(id) ON DELETE CASCADE,
    isbn VARCHAR(30) NOT NULL,
    title VARCHAR(255) NOT NULL,
    publisher VARCHAR(150),
    author VARCHAR(150),
    cover_url TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    horus_cod_item INTEGER,
    suggested_supplier_id INTEGER REFERENCES spl_supplier(id) ON DELETE SET NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    purchase_order_id INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ord_customer_encomenda_item_enc ON ord_customer_encomenda_item(encomenda_id);
CREATE INDEX IF NOT EXISTS idx_ord_customer_encomenda_item_isbn ON ord_customer_encomenda_item(isbn);

-- 6. Tabelas do Módulo de Cafeteria
CREATE TABLE IF NOT EXISTS caf_table (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    number VARCHAR(50) NOT NULL,
    area VARCHAR(100) NOT NULL DEFAULT 'Salão Principal',
    capacity INTEGER NOT NULL DEFAULT 4,
    status VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    table_token VARCHAR(64) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_caf_table_company_status ON caf_table (company_id, status);
CREATE INDEX IF NOT EXISTS idx_caf_table_company_number ON caf_table (company_id, number);
CREATE INDEX IF NOT EXISTS idx_caf_table_table_token ON caf_table(table_token);

ALTER TABLE caf_table ADD COLUMN IF NOT EXISTS table_token VARCHAR(64) UNIQUE;
UPDATE caf_table
SET table_token = 'tab_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12)
WHERE table_token IS NULL;

CREATE TABLE IF NOT EXISTS caf_modifier_group (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    min_selectable INTEGER NOT NULL DEFAULT 0,
    max_selectable INTEGER NOT NULL DEFAULT 1,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_caf_modifier_group_comp ON caf_modifier_group (company_id, active);

CREATE TABLE IF NOT EXISTS caf_modifier_option (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES caf_modifier_group(id) ON DELETE CASCADE,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    additional_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_caf_modifier_opt_comp_grp ON caf_modifier_option (company_id, group_id);

CREATE TABLE IF NOT EXISTS caf_product_modifier (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES prd_product(id) ON DELETE CASCADE,
    group_id INTEGER NOT NULL REFERENCES caf_modifier_group(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_caf_prod_mod_prod ON caf_product_modifier (company_id, product_id);

CREATE TABLE IF NOT EXISTS caf_tab (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    table_id INTEGER REFERENCES caf_table(id) ON DELETE SET NULL,
    waiter_user_id INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    pos_session_id INTEGER REFERENCES pos_session(id) ON DELETE SET NULL,
    pos_sale_id INTEGER REFERENCES pos_sale(id) ON DELETE SET NULL,
    tab_number VARCHAR(50) NOT NULL,
    customer_name VARCHAR(255),
    customer_document VARCHAR(50),
    notes TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'OPEN',
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_caf_tab_company_status ON caf_tab (company_id, status);
CREATE INDEX IF NOT EXISTS idx_caf_tab_company_number ON caf_tab (company_id, tab_number);
CREATE INDEX IF NOT EXISTS idx_caf_tab_table ON caf_tab (table_id);

CREATE TABLE IF NOT EXISTS caf_order_item (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    tab_id INTEGER NOT NULL REFERENCES caf_tab(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES prd_product(id) ON DELETE SET NULL,
    created_by_user_id INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    barcode VARCHAR(50),
    sku VARCHAR(100),
    title VARCHAR(255) NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT 'CRONUZ',
    horus_item_code VARCHAR(50),
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1.00,
    unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    modifiers_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    modifiers_json JSONB DEFAULT '[]'::jsonb,
    notes TEXT,
    requires_preparation BOOLEAN NOT NULL DEFAULT TRUE,
    prep_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    prep_sector VARCHAR(50) DEFAULT 'BEVERAGE',
    category_name VARCHAR(100),
    kitchen_alert VARCHAR(255),
    kitchen_alert_at TIMESTAMPTZ,
    kitchen_alert_acknowledged BOOLEAN DEFAULT FALSE,
    prep_started_at TIMESTAMPTZ,
    prep_finished_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancel_reason VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_caf_order_item_tab ON caf_order_item (tab_id);
CREATE INDEX IF NOT EXISTS idx_caf_order_item_kds ON caf_order_item (company_id, requires_preparation, prep_status);
CREATE INDEX IF NOT EXISTS idx_caf_order_item_sector ON caf_order_item (company_id, prep_sector, prep_status);

ALTER TABLE caf_order_item ADD COLUMN IF NOT EXISTS prep_sector VARCHAR(50) DEFAULT 'BEVERAGE';
ALTER TABLE caf_order_item ADD COLUMN IF NOT EXISTS category_name VARCHAR(100);
ALTER TABLE caf_order_item ADD COLUMN IF NOT EXISTS kitchen_alert VARCHAR(255);
ALTER TABLE caf_order_item ADD COLUMN IF NOT EXISTS kitchen_alert_at TIMESTAMPTZ;
ALTER TABLE caf_order_item ADD COLUMN IF NOT EXISTS kitchen_alert_acknowledged BOOLEAN DEFAULT FALSE;

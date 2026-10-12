-- =============================================================================
-- Migration: Criação das tabelas do Módulo de Cafeteria (Cronuz B2B)
-- Data: 2026-10-11
-- Compatibilidade: PostgreSQL (exclusivo)
-- Idempotência: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
-- =============================================================================

-- 1. Mesas e Ambientes (caf_table)
CREATE TABLE IF NOT EXISTS caf_table (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    number VARCHAR(50) NOT NULL,
    area VARCHAR(100) NOT NULL DEFAULT 'Salão Principal',
    capacity INTEGER NOT NULL DEFAULT 4,
    status VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_caf_table_company_status ON caf_table (company_id, status);
CREATE INDEX IF NOT EXISTS idx_caf_table_company_number ON caf_table (company_id, number);

-- 2. Grupos de Modificadores (caf_modifier_group)
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

-- 3. Opções de Modificadores (caf_modifier_option)
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

-- 4. Associação de Produtos a Modificadores (caf_product_modifier)
CREATE TABLE IF NOT EXISTS caf_product_modifier (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES prd_product(id) ON DELETE CASCADE,
    group_id INTEGER NOT NULL REFERENCES caf_modifier_group(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_caf_prod_mod_prod ON caf_product_modifier (company_id, product_id);

-- 5. Comandas / Contas (caf_tab)
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

-- 6. Itens de Pedido da Comanda / KDS (caf_order_item)
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

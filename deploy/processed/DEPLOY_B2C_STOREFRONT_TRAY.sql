-- ============================================================================
-- MIGRATION: Módulo Storefront Aberto B2C, Cupons Corporativos, LGPD & Tray
-- Data: 2026-10-27
-- Banco: PostgreSQL (cronuz_b2b)
-- ============================================================================

BEGIN;

-- 1. Novas colunas em cmp_company
ALTER TABLE cmp_company
    ADD COLUMN IF NOT EXISTS b2c_custom_domain VARCHAR(255) UNIQUE,
    ADD COLUMN IF NOT EXISTS module_b2c_storefront BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS ix_cmp_company_b2c_custom_domain ON cmp_company (b2c_custom_domain);

-- 2. Novas colunas em cmp_settings (B2C & Tray E-commerce REST + MCP)
ALTER TABLE cmp_settings
    ADD COLUMN IF NOT EXISTS b2c_storefront_open BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS b2c_checkout_mode VARCHAR(30) NOT NULL DEFAULT 'NATIVE_GATEWAY',
    ADD COLUMN IF NOT EXISTS b2c_lgpd_terms_text TEXT,
    ADD COLUMN IF NOT EXISTS b2c_default_freight_value NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS b2c_free_shipping_min_value NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS tray_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS tray_store_url VARCHAR(255),
    ADD COLUMN IF NOT EXISTS tray_api_address VARCHAR(255),
    ADD COLUMN IF NOT EXISTS tray_store_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS tray_consumer_key VARCHAR(255),
    ADD COLUMN IF NOT EXISTS tray_consumer_secret VARCHAR(255),
    ADD COLUMN IF NOT EXISTS tray_auth_code VARCHAR(255),
    ADD COLUMN IF NOT EXISTS tray_access_token VARCHAR(500),
    ADD COLUMN IF NOT EXISTS tray_refresh_token VARCHAR(500),
    ADD COLUMN IF NOT EXISTS tray_token_expires_at TIMESTAMPTZ;

-- 3. Tabela de Lotes de Cupons Corporativos B2C (b2c_coupon_batches)
CREATE TABLE IF NOT EXISTS b2c_coupon_batches (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    partner_company_name VARCHAR(255),
    partner_document VARCHAR(50),
    batch_mode VARCHAR(40) NOT NULL DEFAULT 'INDIVIDUAL_CODES',
    shared_code VARCHAR(100),
    coupon_value NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    discount_type VARCHAR(30) NOT NULL DEFAULT 'FIXED_BRL',
    allows_freight_discount BOOLEAN NOT NULL DEFAULT FALSE,
    allow_residual_balance BOOLEAN NOT NULL DEFAULT TRUE,
    min_order_value NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    max_uses_total INTEGER NOT NULL DEFAULT 100,
    valid_from DATE,
    valid_until DATE,
    eligible_cpfs_json JSONB,
    notes TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_b2c_coupon_batches_company_id ON b2c_coupon_batches (company_id);
CREATE INDEX IF NOT EXISTS ix_b2c_coupon_batches_shared_code ON b2c_coupon_batches (shared_code);

-- 4. Tabela de Cupons / Vouchers B2C Individuais e Carteiras CPF (b2c_coupons)
CREATE TABLE IF NOT EXISTS b2c_coupons (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    batch_id INTEGER REFERENCES b2c_coupon_batches(id) ON DELETE SET NULL,
    code VARCHAR(100) NOT NULL,
    coupon_mode VARCHAR(40) NOT NULL DEFAULT 'INDIVIDUAL',
    discount_type VARCHAR(30) NOT NULL DEFAULT 'FIXED_BRL',
    initial_value NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    current_balance NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    used_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    allows_freight_discount BOOLEAN NOT NULL DEFAULT FALSE,
    allow_residual_balance BOOLEAN NOT NULL DEFAULT TRUE,
    min_order_value NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    assigned_name VARCHAR(255),
    assigned_cpf VARCHAR(30),
    assigned_email VARCHAR(255),
    parent_coupon_id INTEGER REFERENCES b2c_coupons(id) ON DELETE SET NULL,
    generated_child_code VARCHAR(100),
    tray_coupon_id VARCHAR(100),
    status VARCHAR(40) NOT NULL DEFAULT 'AVAILABLE',
    valid_from DATE,
    valid_until DATE,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_b2c_coupons_company_id ON b2c_coupons (company_id);
CREATE INDEX IF NOT EXISTS ix_b2c_coupons_batch_id ON b2c_coupons (batch_id);
CREATE INDEX IF NOT EXISTS ix_b2c_coupons_code ON b2c_coupons (code);
CREATE INDEX IF NOT EXISTS ix_b2c_coupons_assigned_cpf ON b2c_coupons (assigned_cpf);
CREATE INDEX IF NOT EXISTS ix_b2c_coupons_status ON b2c_coupons (status);

-- 5. Tabela de Histórico e Auditoria de Utilização de Cupons (b2c_coupon_redemptions)
CREATE TABLE IF NOT EXISTS b2c_coupon_redemptions (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    coupon_id INTEGER REFERENCES b2c_coupons(id) ON DELETE SET NULL,
    batch_id INTEGER REFERENCES b2c_coupon_batches(id) ON DELETE SET NULL,
    order_id INTEGER REFERENCES ord_order(id) ON DELETE SET NULL,
    customer_id INTEGER REFERENCES crm_customer(id) ON DELETE SET NULL,
    coupon_code VARCHAR(100) NOT NULL,
    customer_name VARCHAR(255),
    customer_cpf VARCHAR(30),
    customer_email VARCHAR(255),
    order_subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    order_freight NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    discount_applied NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    previous_balance NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    remaining_balance NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    residual_coupon_code VARCHAR(100),
    difference_paid NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    checkout_mode VARCHAR(40) NOT NULL DEFAULT 'FREE_VOUCHER',
    tray_cart_session_id VARCHAR(150),
    tray_cart_url VARCHAR(500),
    tray_coupon_code VARCHAR(100),
    status VARCHAR(40) NOT NULL DEFAULT 'COMPLETED',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_b2c_coupon_redemptions_company_id ON b2c_coupon_redemptions (company_id);
CREATE INDEX IF NOT EXISTS ix_b2c_coupon_redemptions_coupon_id ON b2c_coupon_redemptions (coupon_id);
CREATE INDEX IF NOT EXISTS ix_b2c_coupon_redemptions_batch_id ON b2c_coupon_redemptions (batch_id);
CREATE INDEX IF NOT EXISTS ix_b2c_coupon_redemptions_customer_cpf ON b2c_coupon_redemptions (customer_cpf);

-- 6. Tabela de Auditoria de Consentimento LGPD (b2c_lgpd_consents)
CREATE TABLE IF NOT EXISTS b2c_lgpd_consents (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    customer_id INTEGER REFERENCES crm_customer(id) ON DELETE SET NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_cpf VARCHAR(30) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    ip_address VARCHAR(100),
    user_agent VARCHAR(500),
    terms_version VARCHAR(50) NOT NULL DEFAULT 'v1.0',
    marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
    accepted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_b2c_lgpd_consents_company_id ON b2c_lgpd_consents (company_id);
CREATE INDEX IF NOT EXISTS ix_b2c_lgpd_consents_customer_cpf ON b2c_lgpd_consents (customer_cpf);

COMMIT;

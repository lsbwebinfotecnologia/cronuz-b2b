-- =============================================================================
-- DEPLOY: Módulo Conciliador Dinâmico & Construtor de Modelos Horus ERP
-- Mantém 100% intacta a rotina legado (/horus-direct/financeiro-vindi)
-- =============================================================================

-- 1. Nova coluna de habilitação da feature por Seller em cmp_settings
ALTER TABLE cmp_settings
ADD COLUMN IF NOT EXISTS horus_sql_feature_conciliador_padrao BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Tabela de Modelos/Templates Dinâmicos de Conciliação Financeira por Empresa
CREATE TABLE IF NOT EXISTS horus_reconciliation_templates (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    code VARCHAR(80) NOT NULL,
    name VARCHAR(160) NOT NULL,
    short_name VARCHAR(80) NOT NULL,
    channel_label VARCHAR(80) NOT NULL DEFAULT 'Planilha',
    hub_label VARCHAR(80),
    badge VARCHAR(80),
    description TEXT,
    mode VARCHAR(30) NOT NULL DEFAULT 'SINGLE_FILE',
    file_1_label VARCHAR(200),
    file_2_label VARCHAR(200),
    horus_match_field VARCHAR(50) NOT NULL DEFAULT 'AUTO',
    column_mapping JSONB,
    forma_pagto VARCHAR(50),
    forma_pagto_credito_maior VARCHAR(50),
    banco VARCHAR(30),
    agencia VARCHAR(30),
    conta VARCHAR(40),
    carteira VARCHAR(30),
    payment_date_mode VARCHAR(30) NOT NULL DEFAULT 'CHANNEL_DATE',
    unify_installments BOOLEAN NOT NULL DEFAULT TRUE,
    split_excess_launch BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_system_preset BOOLEAN NOT NULL DEFAULT FALSE,
    display_order INTEGER NOT NULL DEFAULT 10,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_horus_reconciliation_templates_company_id
    ON horus_reconciliation_templates (company_id);

CREATE INDEX IF NOT EXISTS ix_horus_reconciliation_templates_code
    ON horus_reconciliation_templates (code);

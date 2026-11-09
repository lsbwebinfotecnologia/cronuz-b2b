-- ============================================================================
-- MIGRATION: Histórico de Fechamentos / Borderôs de Conciliação Horus ERP
-- Tabela: horus_reconciliation_closings
-- Banco de Dados: PostgreSQL (cronuz_b2b)
-- ============================================================================

CREATE TABLE IF NOT EXISTS horus_reconciliation_closings (
    id BIGSERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    created_by_user_id INTEGER NULL REFERENCES usr_user(id) ON DELETE SET NULL,
    created_by_name VARCHAR(150) NULL,

    profile_code VARCHAR(60) NOT NULL,
    profile_name VARCHAR(150) NULL,
    channel_filename VARCHAR(255) NULL,
    tray_filename VARCHAR(255) NULL,

    cod_empresa INTEGER NOT NULL DEFAULT 1,
    cod_filial INTEGER NOT NULL DEFAULT 1,
    cod_bordero INTEGER NOT NULL,
    sta_bordero VARCHAR(10) NOT NULL DEFAULT 'PG',
    nom_arquivo_horus VARCHAR(60) NULL,

    payment_date_mode VARCHAR(40) NOT NULL DEFAULT 'CHANNEL_DATE',
    specific_payment_date VARCHAR(30) NULL,
    unify_installments BOOLEAN NOT NULL DEFAULT TRUE,
    split_excess_launch BOOLEAN NOT NULL DEFAULT TRUE,

    forma_pagto VARCHAR(30) NULL,
    forma_pagto_credito_maior VARCHAR(30) NULL,
    banco VARCHAR(30) NULL,
    agencia VARCHAR(30) NULL,
    conta VARCHAR(40) NULL,
    carteira VARCHAR(30) NULL,

    total_titles INTEGER NOT NULL DEFAULT 0,
    unificadas_parcelas_removidas INTEGER NOT NULL DEFAULT 0,
    credito_maior_lancamentos_criados INTEGER NOT NULL DEFAULT 0,

    valor_bruto_total DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    valor_taxa_total DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    valor_liquido_bordero DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    valor_credito_maior_total DOUBLE PRECISION NOT NULL DEFAULT 0.0,

    items_json JSONB NULL,
    notes VARCHAR(500) NULL,

    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')
);

CREATE INDEX IF NOT EXISTS idx_horus_rec_closings_company_date
    ON horus_reconciliation_closings (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_horus_rec_closings_bordero
    ON horus_reconciliation_closings (company_id, cod_bordero);

CREATE INDEX IF NOT EXISTS idx_horus_rec_closings_profile
    ON horus_reconciliation_closings (company_id, profile_code);

-- =============================================================================
-- DEPLOY: Boleto Banco Cora integrado ao Horus (Horus Direct)
-- Branch: feature/boleto-cora-horus
-- Banco: PostgreSQL (cronuz_b2b)
-- Idempotente: pode ser executado mais de uma vez com segurança.
-- Nenhum UPDATE/DELETE de dados — apenas DDL aditiva.
-- =============================================================================

BEGIN;

-- ── 1. cmp_settings: credenciais Cora (Integração Direta / mTLS) ─────────────
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS cora_enabled               BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS cora_sandbox               BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS cora_client_id             VARCHAR(255);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS cora_cert_content          TEXT;
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS cora_key_content           TEXT;          -- criptografado (Fernet)
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS cora_webhook_secret        VARCHAR(64);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS cora_webhook_endpoint_ids  VARCHAR(500);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS cora_fine_rate             NUMERIC(5,2);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS cora_interest_rate         NUMERIC(5,2);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS cora_notify_email          BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 2. cmp_settings: parâmetros Cora x Horus ────────────────────────────────
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS cora_horus_cod_formas        VARCHAR(100);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS cora_horus_write_back        BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS cora_horus_auto_baixa        BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS cora_horus_banco_forma_pagto VARCHAR(50);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS cora_horus_banco_codigo      VARCHAR(20);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS cora_horus_banco_agencia     VARCHAR(20);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS cora_horus_banco_conta       VARCHAR(30);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS cora_horus_banco_carteira    VARCHAR(20);

-- ── 3. cmp_settings: flag do Master (sub-funcionalidade do Horus Direct) ────
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_sql_feature_cora_boleto BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 4. Nova tabela: fin_cora_invoice ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fin_cora_invoice (
    id                   SERIAL PRIMARY KEY,
    company_id           INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    cod_empresa          VARCHAR(20) NOT NULL,
    cod_filial           VARCHAR(20) NOT NULL,
    nro_lancto_creceber  INTEGER NOT NULL,
    cod_parcela          INTEGER NOT NULL DEFAULT 1,
    cod_cli              INTEGER,
    cod_ped_venda        INTEGER,
    customer_name        VARCHAR(150),
    customer_document    VARCHAR(20),
    amount               NUMERIC(14,2) NOT NULL,
    due_date             DATE NOT NULL,
    cora_invoice_id      VARCHAR(64),
    idempotency_key      VARCHAR(64) NOT NULL,
    status               VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    our_number           VARCHAR(50),
    digitable_line       VARCHAR(60),
    barcode              VARCHAR(60),
    pix_emv              TEXT,
    pdf_url              TEXT,
    total_paid           NUMERIC(14,2),
    paid_at              TIMESTAMPTZ,
    last_error           TEXT,
    horus_written_back   BOOLEAN NOT NULL DEFAULT FALSE,
    cod_bordero_baixa    INTEGER,
    baixa_at             TIMESTAMPTZ,
    created_by_user_id   INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ DEFAULT now(),
    updated_at           TIMESTAMPTZ DEFAULT now(),
    last_synced_at       TIMESTAMPTZ,
    CONSTRAINT uq_fin_cora_invoice_cora_id UNIQUE (cora_invoice_id)
);

CREATE INDEX IF NOT EXISTS ix_fin_cora_invoice_id ON fin_cora_invoice (id);
CREATE INDEX IF NOT EXISTS ix_fin_cora_invoice_company_id ON fin_cora_invoice (company_id);
CREATE INDEX IF NOT EXISTS ix_fin_cora_invoice_company_status ON fin_cora_invoice (company_id, status);
-- Impede boleto duplicado para o mesmo título/parcela enquanto houver fatura ativa
CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_cora_invoice_active_title
    ON fin_cora_invoice (company_id, cod_filial, nro_lancto_creceber, cod_parcela)
    WHERE is_active = true;

COMMIT;

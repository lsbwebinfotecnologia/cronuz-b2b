-- =============================================================================
-- DEPLOY: Módulo Banco Cora (configuração Master) — PARTE 1 (aditiva)
-- Branch: feature/modulo-banco-cora
-- Banco: PostgreSQL (cronuz_b2b) — idempotente, sem UPDATE/DELETE de dados.
-- =============================================================================
BEGIN;

-- 1. Flag do módulo (habilitada pelo Master por seller)
ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS module_cora BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Configuração geral do Cora por empresa (1:1)
CREATE TABLE IF NOT EXISTS fin_cora_config (
    id                  SERIAL PRIMARY KEY,
    company_id          INTEGER NOT NULL UNIQUE REFERENCES cmp_company(id) ON DELETE CASCADE,
    active_environment  VARCHAR(20) NOT NULL DEFAULT 'STAGE',
    integration_mode    VARCHAR(20) NOT NULL DEFAULT 'DIRECT',
    payment_forms       VARCHAR(20) NOT NULL DEFAULT 'BANK_SLIP_PIX',
    fine_rate           NUMERIC(5,2),
    interest_rate       NUMERIC(5,2),
    discount_rate       NUMERIC(5,2),
    notify_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
    notify_rules        VARCHAR(500),
    updated_by_user_id  INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_fin_cora_config_id ON fin_cora_config (id);
CREATE INDEX IF NOT EXISTS ix_fin_cora_config_company_id ON fin_cora_config (company_id);

-- 3. Credenciais da Integração Direta por empresa + ambiente
CREATE TABLE IF NOT EXISTS fin_cora_account (
    id                  SERIAL PRIMARY KEY,
    company_id          INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    environment         VARCHAR(20) NOT NULL,
    client_id           VARCHAR(255),
    cert_format         VARCHAR(10),
    cert_content        TEXT,
    key_content         TEXT,            -- chave privada criptografada (Fernet)
    cert_subject        VARCHAR(255),
    cert_valid_from     TIMESTAMPTZ,
    cert_valid_until    TIMESTAMPTZ,
    last_test_at        TIMESTAMPTZ,
    last_test_ok        BOOLEAN,
    last_test_message   VARCHAR(500),
    updated_by_user_id  INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_fin_cora_account_company_env UNIQUE (company_id, environment)
);
CREATE INDEX IF NOT EXISTS ix_fin_cora_account_id ON fin_cora_account (id);
CREATE INDEX IF NOT EXISTS ix_fin_cora_account_company_id ON fin_cora_account (company_id);

COMMIT;

-- ============================================================
-- Migration: Multi-Token Erdos por Seller
-- Criado em: 2026-09-03
-- Aplicar em produção ANTES do deploy do código
-- ============================================================

-- 1. Criar tabela de credenciais Erdos (multi-token)
CREATE TABLE IF NOT EXISTS dsp_erdos_credential (
    id                              SERIAL PRIMARY KEY,
    company_id                      INTEGER NOT NULL REFERENCES cmp_company(id),
    config_id                       INTEGER NOT NULL REFERENCES dsp_config(id),

    label                           VARCHAR(100) NOT NULL,
    api_token                       VARCHAR(512) NOT NULL,

    horus_customer_id               INTEGER NOT NULL REFERENCES crm_customer(id),
    horus_customer_cod_cli          VARCHAR(50),

    horus_fiscal_param_remessa_intra VARCHAR(50),
    horus_fiscal_param_remessa_inter VARCHAR(50),
    horus_fiscal_param_venda         VARCHAR(50),

    is_primary                      BOOLEAN NOT NULL DEFAULT false,
    is_active                       BOOLEAN NOT NULL DEFAULT true,

    created_at                      TIMESTAMPTZ DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_dsp_erdos_cred_company ON dsp_erdos_credential(company_id);
CREATE INDEX IF NOT EXISTS idx_dsp_erdos_cred_config  ON dsp_erdos_credential(config_id);

-- 2. Adicionar erdos_credential_id em dsp_order
ALTER TABLE dsp_order
    ADD COLUMN IF NOT EXISTS erdos_credential_id INTEGER REFERENCES dsp_erdos_credential(id);
CREATE INDEX IF NOT EXISTS idx_dsp_order_erdos_cred ON dsp_order(erdos_credential_id);

-- 3. Adicionar erdos_credential_id em dsp_price_table
ALTER TABLE dsp_price_table
    ADD COLUMN IF NOT EXISTS erdos_credential_id INTEGER REFERENCES dsp_erdos_credential(id);

-- 4. Remover constraint antiga da price_table (se existir)
ALTER TABLE dsp_price_table
    DROP CONSTRAINT IF EXISTS uix_dsp_price_table_company_isbn;

-- 5. Criar nova constraint única por (company, credencial, isbn)
ALTER TABLE dsp_price_table
    ADD CONSTRAINT uix_dsp_price_table_cred_isbn
    UNIQUE (company_id, erdos_credential_id, isbn);

CREATE INDEX IF NOT EXISTS idx_dsp_price_table_cred ON dsp_price_table(erdos_credential_id);

-- ============================================================
-- VERIFICAÇÃO
-- ============================================================
SELECT 'dsp_erdos_credential' AS tabela,
       COUNT(*) AS colunas
FROM information_schema.columns
WHERE table_name = 'dsp_erdos_credential';

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'dsp_order'
  AND column_name = 'erdos_credential_id';

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'dsp_price_table'
  AND column_name = 'erdos_credential_id';

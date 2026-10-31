-- ============================================================================
-- MIGRATION: API Horus Complementar & Agente Bridge Desktop (.EXE)
-- Data: 2026-10-30
-- Banco de Dados: PostgreSQL (cronuz_b2b)
-- ============================================================================

BEGIN;

-- 1. Flag de módulo na tabela de empresas (cmp_company)
ALTER TABLE cmp_company
    ADD COLUMN IF NOT EXISTS module_horus_api_bridge BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Colunas de licenciamento, credenciais, rate limit e gateway na tabela cmp_settings
ALTER TABLE cmp_settings
    ADD COLUMN IF NOT EXISTS horus_bridge_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS horus_bridge_expires_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS horus_bridge_license_key VARCHAR(512) NULL,
    ADD COLUMN IF NOT EXISTS horus_bridge_api_username VARCHAR(100) NULL,
    ADD COLUMN IF NOT EXISTS horus_bridge_api_password VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS horus_bridge_api_token VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS horus_bridge_rate_limit_per_min INTEGER NOT NULL DEFAULT 120,
    ADD COLUMN IF NOT EXISTS horus_bridge_allow_financial_sql BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS horus_bridge_custom_gateway_url VARCHAR(255) NULL;

-- 3. Índices estratégicos para autenticação rápida da API pública (Zero N+1)
CREATE INDEX IF NOT EXISTS idx_cmp_settings_horus_bridge_token
    ON cmp_settings (horus_bridge_api_token)
    WHERE horus_bridge_api_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cmp_settings_horus_bridge_user
    ON cmp_settings (horus_bridge_api_username)
    WHERE horus_bridge_api_username IS NOT NULL;

COMMIT;

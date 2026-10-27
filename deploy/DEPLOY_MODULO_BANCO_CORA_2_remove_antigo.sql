-- =============================================================================
-- DEPLOY: Módulo Banco Cora — PARTE 2 (REMOÇÃO da estrutura antiga Cora x Horus)
-- ⚠️ DESTRUTIVO: executar em produção SOMENTE com autorização explícita.
-- Remove o que foi criado por deploy/processed/DEPLOY_CORA_BOLETO_HORUS.sql (deploy de 20/10),
-- que deixou de ser usado pelo código na branch feature/modulo-banco-cora.
--
-- Antes de executar em produção, conferir que não há dados:
--   SELECT COUNT(*) FROM fin_cora_invoice;
--   SELECT COUNT(*) FROM cmp_settings WHERE cora_enabled OR cora_client_id IS NOT NULL OR horus_sql_feature_cora_boleto;
-- =============================================================================
BEGIN;

DROP TABLE IF EXISTS fin_cora_invoice;

ALTER TABLE cmp_settings
    DROP COLUMN IF EXISTS cora_enabled,
    DROP COLUMN IF EXISTS cora_sandbox,
    DROP COLUMN IF EXISTS cora_client_id,
    DROP COLUMN IF EXISTS cora_cert_content,
    DROP COLUMN IF EXISTS cora_key_content,
    DROP COLUMN IF EXISTS cora_webhook_secret,
    DROP COLUMN IF EXISTS cora_webhook_endpoint_ids,
    DROP COLUMN IF EXISTS cora_fine_rate,
    DROP COLUMN IF EXISTS cora_interest_rate,
    DROP COLUMN IF EXISTS cora_notify_email,
    DROP COLUMN IF EXISTS cora_horus_cod_formas,
    DROP COLUMN IF EXISTS cora_horus_write_back,
    DROP COLUMN IF EXISTS cora_horus_auto_baixa,
    DROP COLUMN IF EXISTS cora_horus_banco_forma_pagto,
    DROP COLUMN IF EXISTS cora_horus_banco_codigo,
    DROP COLUMN IF EXISTS cora_horus_banco_agencia,
    DROP COLUMN IF EXISTS cora_horus_banco_conta,
    DROP COLUMN IF EXISTS cora_horus_banco_carteira,
    DROP COLUMN IF EXISTS horus_sql_feature_cora_boleto;

COMMIT;

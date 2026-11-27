-- =============================================================================
-- DEPLOY SQL: Compras Horus — Gerar Pendência (SIM/NÃO), Status AB/AP/AE/CA e Mesclagem
-- Data: 2026-11-27
-- Banco: PostgreSQL (cronuz_b2b)
-- Idempotente (seguro para múltiplas execuções, sem UPDATE/DELETE)
-- =============================================================================

ALTER TABLE pur_horus_branch_config
    ADD COLUMN IF NOT EXISTS gerar_pendencia_default VARCHAR(1) NOT NULL DEFAULT 'S';

ALTER TABLE pur_horus_order
    ADD COLUMN IF NOT EXISTS gerar_pendencia VARCHAR(1) NOT NULL DEFAULT 'S';

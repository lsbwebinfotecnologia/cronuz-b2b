-- =============================================================================
-- Migration: Adicionar coluna module_cafeteria na tabela cmp_company
-- Data: 2026-10-11
-- Projeto: Cronuz B2B
-- =============================================================================

ALTER TABLE cmp_company
ADD COLUMN IF NOT EXISTS module_cafeteria BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN cmp_company.module_cafeteria IS 'Habilita o módulo de Cafeteria (Mesas, Comandas, Balcão e KDS Barista) para o seller';

-- =============================================================================
-- Migration: Adicionar coluna products_count na tabela pos_session
-- Data: 2026-10-03
-- Contexto: Fix do erro 500 ao abrir sessão de PDV ("column products_count of relation pos_session does not exist")
-- =============================================================================

ALTER TABLE pos_session
ADD COLUMN IF NOT EXISTS products_count INTEGER NOT NULL DEFAULT 0;

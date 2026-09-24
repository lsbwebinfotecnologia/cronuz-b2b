-- ==============================================================================
-- Migration: Adiciona a coluna stock_local na tabela logistics_settings
-- Data: 2026-09-23
-- Descrição: Permite configurar o local de estoque (COD_LOCAL) do Horus para a conferência de cada WMS.
-- ==============================================================================

ALTER TABLE logistics_settings ADD COLUMN IF NOT EXISTS stock_local VARCHAR(50);

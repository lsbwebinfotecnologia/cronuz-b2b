-- ==============================================================================
-- Migration: Adiciona coluna feature_auto_send na tabela logistics_settings
-- Data: 2026-09-24
-- Descrição: Permite ativar/desativar o job de envio automático de pedidos LEX para o WMS.
-- ==============================================================================

ALTER TABLE logistics_settings ADD COLUMN IF NOT EXISTS feature_auto_send BOOLEAN DEFAULT TRUE;

-- Migração: Adiciona controle de envio de NFe automático e número de corte de pedido inicial à tabela logistics_settings
-- Data: 2026-09-25

ALTER TABLE logistics_settings 
ADD COLUMN IF NOT EXISTS feature_auto_invoice BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE logistics_settings 
ADD COLUMN IF NOT EXISTS min_order_number INTEGER NULL;

COMMENT ON COLUMN logistics_settings.feature_auto_invoice IS 'Controla a execução do job automático de envio de NFe ao WMS MKT a cada 15 min';
COMMENT ON COLUMN logistics_settings.min_order_number IS 'Número mínimo de pedido (corte) para as rotinas automáticas de envio, conferência e envio de NF';

-- ==============================================================================
-- Migration: Adicionar stock_sync_last_run em dsp_erdos_credential
-- ==============================================================================

ALTER TABLE dsp_erdos_credential 
ADD COLUMN IF NOT EXISTS stock_sync_last_run TIMESTAMPTZ;

-- Inicializa a credencial primaria com a data do ultimo sync da config, se houver
UPDATE dsp_erdos_credential c
SET stock_sync_last_run = cfg.stock_sync_last_run
FROM dsp_config cfg
WHERE c.config_id = cfg.id
  AND c.is_primary = TRUE
  AND c.stock_sync_last_run IS NULL
  AND cfg.stock_sync_last_run IS NOT NULL;

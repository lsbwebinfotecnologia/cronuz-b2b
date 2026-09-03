-- ==============================================================================
-- Migration: Adicionar erdos_credential_id na tabela dsp_stock_sync_log
-- ==============================================================================

ALTER TABLE dsp_stock_sync_log 
ADD COLUMN IF NOT EXISTS erdos_credential_id INTEGER REFERENCES dsp_erdos_credential(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dsp_stock_sync_log_cred ON dsp_stock_sync_log(erdos_credential_id);

-- Backfill dos logs existentes para a credencial primaria do seller
UPDATE dsp_stock_sync_log s
SET erdos_credential_id = c.id
FROM dsp_erdos_credential c
WHERE s.erdos_credential_id IS NULL
  AND s.company_id = c.company_id
  AND c.is_primary = TRUE;

-- Fallback para empresas que tenham credencial ativa nao marcada como primary
UPDATE dsp_stock_sync_log s
SET erdos_credential_id = c.id
FROM (
    SELECT DISTINCT ON (company_id) id, company_id
    FROM dsp_erdos_credential
    WHERE is_active = TRUE
    ORDER BY company_id, id ASC
) c
WHERE s.erdos_credential_id IS NULL
  AND s.company_id = c.company_id;

-- ==============================================================================
-- Migration: Adicionar campos de cancelamento e vincular pedidos orfaos
-- Tabela afetada: dsp_order
-- ==============================================================================

-- 1. Campos de cancelamento
ALTER TABLE dsp_order ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE dsp_order ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- 2. Backfill de credenciais para pedidos legados (erdos_credential_id IS NULL)
-- Vincula a credencial primaria do seller
UPDATE dsp_order o
SET erdos_credential_id = c.id
FROM dsp_erdos_credential c
WHERE o.erdos_credential_id IS NULL
  AND o.company_id = c.company_id
  AND c.is_primary = TRUE;

-- Fallback para empresas que tenham credencial ativa nao marcada como primary
UPDATE dsp_order o
SET erdos_credential_id = c.id
FROM (
    SELECT DISTINCT ON (company_id) id, company_id
    FROM dsp_erdos_credential
    WHERE is_active = TRUE
    ORDER BY company_id, id ASC
) c
WHERE o.erdos_credential_id IS NULL
  AND o.company_id = c.company_id;

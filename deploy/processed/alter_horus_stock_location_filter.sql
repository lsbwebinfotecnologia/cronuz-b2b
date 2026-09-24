-- Deploy: adiciona campo horus_use_stock_location_filter em cmp_settings
-- Data: 2026-08-19
--
-- CONTEXTO:
--   Controla se o Busca_AcervoB2B do Horus usa filtro geral (padrão)
--   ou filtro por local de estoque específico (SD_COD_EMPRESA/FILIAL/LOCAL_ESTOQUE).
--   Ver backend/app/integrators/horus_products.py › busca_acervo_b2b para detalhes.
--
-- False (padrão): busca geral via ID_DOC + ID_GUID
-- True          : filtro por local — requer horus_company, horus_branch e horus_stock_local preenchidos

ALTER TABLE cmp_settings
    ADD COLUMN IF NOT EXISTS horus_use_stock_location_filter BOOLEAN NOT NULL DEFAULT FALSE;

-- Verificação
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'cmp_settings'
  AND column_name = 'horus_use_stock_location_filter';

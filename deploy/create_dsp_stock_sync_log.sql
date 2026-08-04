-- Migration: Criação da tabela dsp_stock_sync_log
-- Data: 2026-08-04
-- Descrição: Tabela de log de sincronização de estoque Dropshipping (Erdos/Horus)
--
-- APLICAR EM PRODUÇÃO com:
--   psql postgresql://cronuz_admin:<PASSWORD>@<HOST>:5432/cronuz_b2b -f create_dsp_stock_sync_log.sql

CREATE TABLE IF NOT EXISTS dsp_stock_sync_log (
    id             SERIAL PRIMARY KEY,
    company_id     INTEGER NOT NULL REFERENCES cmp_company(id),
    triggered_by   VARCHAR(20) NOT NULL DEFAULT 'manual',
    status         VARCHAR(20) NOT NULL,
    data_ini       VARCHAR(30),
    data_fim       VARCHAR(30),
    skus_sent      INTEGER NOT NULL DEFAULT 0,
    items_payload  JSONB,
    hub_response   JSONB,
    error_msg      TEXT,
    executed_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dsp_stock_sync_log_company    ON dsp_stock_sync_log(company_id);
CREATE INDEX IF NOT EXISTS idx_dsp_stock_sync_log_executed_at ON dsp_stock_sync_log(executed_at);

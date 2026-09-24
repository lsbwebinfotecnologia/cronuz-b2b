-- Migration: cria tabela dsp_stock_sent_erdos
-- Criado em: 2026-08-07
-- Motivo: rastrear ISBNs enviados ao Hub-Erdos com saldo > 0
--         para detectar e zerar automaticamente os que perderem saldo.

CREATE TABLE IF NOT EXISTS dsp_stock_sent_erdos (
    id           SERIAL PRIMARY KEY,
    company_id   INTEGER NOT NULL REFERENCES cmp_company(id),
    isbn         VARCHAR(30) NOT NULL,
    last_qty     INTEGER NOT NULL DEFAULT 0,
    last_sent_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uix_dsp_stock_sent_erdos UNIQUE (company_id, isbn)
);

CREATE INDEX IF NOT EXISTS idx_dsp_stock_sent_erdos_company ON dsp_stock_sent_erdos(company_id);

COMMENT ON TABLE dsp_stock_sent_erdos IS
  'ISBNs enviados ao Hub-Erdos com saldo > 0. Usado para zeragem automática.';

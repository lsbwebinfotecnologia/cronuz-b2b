-- Migration: Criacao da tabela dsp_price_table
-- Data: 2026-08-04
-- Modulo: Dropshipping - Tabela de Precos por ISBN/Empresa

CREATE TABLE IF NOT EXISTS dsp_price_table (
    id              SERIAL PRIMARY KEY,
    company_id      INTEGER NOT NULL REFERENCES cmp_company(id),
    isbn            VARCHAR(30) NOT NULL,
    titulo          VARCHAR(512),
    desconto        NUMERIC(5,2) NOT NULL DEFAULT 0.0,
    data_validade   DATE NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ,
    CONSTRAINT uix_dsp_price_table_company_isbn UNIQUE (company_id, isbn)
);

CREATE INDEX IF NOT EXISTS idx_dsp_price_table_company ON dsp_price_table(company_id);

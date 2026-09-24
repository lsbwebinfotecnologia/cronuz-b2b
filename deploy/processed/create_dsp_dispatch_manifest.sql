-- ==============================================================================
-- Migration: Criar tabela dsp_dispatch_manifest e vincular em dsp_order
-- ==============================================================================

CREATE TABLE IF NOT EXISTS dsp_dispatch_manifest (
    id                  SERIAL PRIMARY KEY,
    company_id          INTEGER NOT NULL REFERENCES cmp_company(id),
    manifest_number     VARCHAR(50) NOT NULL,
    carrier_name        VARCHAR(100),
    driver_name         VARCHAR(150),
    driver_document     VARCHAR(50),
    vehicle_plate       VARCHAR(20),
    notes               TEXT,
    total_orders        INTEGER NOT NULL DEFAULT 0,
    total_volumes       INTEGER NOT NULL DEFAULT 0,
    total_value         NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    created_by_user_id  INTEGER REFERENCES usr_user(id),
    CONSTRAINT uix_dsp_dispatch_manifest_number UNIQUE (company_id, manifest_number)
);

CREATE INDEX IF NOT EXISTS idx_dsp_dispatch_manifest_company ON dsp_dispatch_manifest(company_id);
CREATE INDEX IF NOT EXISTS idx_dsp_dispatch_manifest_created ON dsp_dispatch_manifest(created_at);

-- Adicionar colunas de relacionamento na tabela dsp_order
ALTER TABLE dsp_order ADD COLUMN IF NOT EXISTS manifest_id INTEGER REFERENCES dsp_dispatch_manifest(id) ON DELETE SET NULL;
ALTER TABLE dsp_order ADD COLUMN IF NOT EXISTS manifest_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_dsp_order_manifest ON dsp_order(manifest_id);

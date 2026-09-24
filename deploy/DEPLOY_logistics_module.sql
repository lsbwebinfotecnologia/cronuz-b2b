-- ============================================================
-- DEPLOY: Modulo de Logistica Generica (WMS)
-- Data: 2026-09-23
-- Provider atual: MKT Logistica (extensivel)
-- ============================================================

CREATE TABLE IF NOT EXISTS logistics_settings (
    id                  SERIAL PRIMARY KEY,
    company_id          INT NOT NULL REFERENCES cmp_company(id),
    provider            VARCHAR(30) NOT NULL DEFAULT 'MKT',
    enabled             BOOLEAN NOT NULL DEFAULT FALSE,
    api_url             VARCHAR(500),
    login               VARCHAR(255),
    password            VARCHAR(500),
    warehouse_id        VARCHAR(50),
    client_id           VARCHAR(50),
    operator_id         VARCHAR(50),
    address_type        VARCHAR(10) DEFAULT '1',
    feature_auto_check  BOOLEAN NOT NULL DEFAULT FALSE,
    check_interval_min  INT NOT NULL DEFAULT 15,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ,
    UNIQUE(company_id, provider)
);

CREATE TABLE IF NOT EXISTS logistics_orders (
    id                  SERIAL PRIMARY KEY,
    company_id          INT NOT NULL REFERENCES cmp_company(id),
    provider            VARCHAR(30) NOT NULL DEFAULT 'MKT',
    cod_ped_venda       INT NOT NULL,
    cod_cli             INT,
    pedido_web_origem   VARCHAR(50),
    id_ord_sys_log      VARCHAR(50),
    status_horus        VARCHAR(10),
    situation           VARCHAR(20) NOT NULL DEFAULT 'PENDING_SEND',
    cep_validated       BOOLEAN,
    cep_checked_at      TIMESTAMPTZ,
    cep_error_detail    TEXT,
    tracking_code       VARCHAR(100),
    tracking_fetched_at TIMESTAMPTZ,
    key_nfe             VARCHAR(50),
    nfe_number          VARCHAR(20),
    sent_at             TIMESTAMPTZ,
    checked_at          TIMESTAMPTZ,
    invoiced_at         TIMESTAMPTZ,
    error_log           TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ,
    UNIQUE(company_id, provider, cod_ped_venda)
);

CREATE INDEX IF NOT EXISTS idx_logistics_orders_company_situation ON logistics_orders(company_id, situation);
CREATE INDEX IF NOT EXISTS idx_logistics_orders_cod_ped ON logistics_orders(cod_ped_venda);

ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_sql_feature_logistics BOOLEAN NOT NULL DEFAULT FALSE;

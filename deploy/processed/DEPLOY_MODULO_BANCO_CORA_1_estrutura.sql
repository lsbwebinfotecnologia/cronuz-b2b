-- =============================================================================
-- DEPLOY: Hub de Pagamentos + Banco Cora — PARTE 1 (estrutura, aditiva)
-- Branch: feature/modulo-banco-cora
-- Banco: PostgreSQL (cronuz_b2b) — idempotente, sem UPDATE/DELETE de dados.
-- =============================================================================
BEGIN;

-- ── 1. Banco Cora: configuração (1 por empresa) ─────────────────────────────
CREATE TABLE IF NOT EXISTS fin_cora_config (
    id                    SERIAL PRIMARY KEY,
    company_id            INTEGER NOT NULL UNIQUE REFERENCES cmp_company(id) ON DELETE CASCADE,
    active_environment    VARCHAR(20) NOT NULL DEFAULT 'STAGE',
    integration_mode      VARCHAR(20) NOT NULL DEFAULT 'DIRECT',
    payment_forms         VARCHAR(20) NOT NULL DEFAULT 'BANK_SLIP_PIX',
    fine_rate             NUMERIC(5,2),
    interest_rate         NUMERIC(5,2),
    discount_rate         NUMERIC(5,2),
    notify_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
    notify_rules          VARCHAR(500),
    webhook_secret        VARCHAR(64),
    webhook_endpoint_ids  VARCHAR(500),
    webhook_environment   VARCHAR(20),
    updated_by_user_id    INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ DEFAULT now(),
    updated_at            TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE fin_cora_config ADD COLUMN IF NOT EXISTS webhook_secret       VARCHAR(64);
ALTER TABLE fin_cora_config ADD COLUMN IF NOT EXISTS webhook_endpoint_ids VARCHAR(500);
ALTER TABLE fin_cora_config ADD COLUMN IF NOT EXISTS webhook_environment  VARCHAR(20);
CREATE INDEX IF NOT EXISTS ix_fin_cora_config_id ON fin_cora_config (id);
CREATE INDEX IF NOT EXISTS ix_fin_cora_config_company_id ON fin_cora_config (company_id);

-- ── 2. Banco Cora: credenciais por empresa + ambiente ───────────────────────
CREATE TABLE IF NOT EXISTS fin_cora_account (
    id                  SERIAL PRIMARY KEY,
    company_id          INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    environment         VARCHAR(20) NOT NULL,
    client_id           VARCHAR(255),
    cert_format         VARCHAR(10),
    cert_content        TEXT,
    key_content         TEXT,            -- chave privada criptografada (Fernet)
    cert_subject        VARCHAR(255),
    cert_valid_from     TIMESTAMPTZ,
    cert_valid_until    TIMESTAMPTZ,
    last_test_at        TIMESTAMPTZ,
    last_test_ok        BOOLEAN,
    last_test_message   VARCHAR(500),
    updated_by_user_id  INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_fin_cora_account_company_env UNIQUE (company_id, environment)
);
CREATE INDEX IF NOT EXISTS ix_fin_cora_account_id ON fin_cora_account (id);
CREATE INDEX IF NOT EXISTS ix_fin_cora_account_company_id ON fin_cora_account (company_id);

-- ── 3. Hub: habilitação de intermediadores (Master) ─────────────────────────
CREATE TABLE IF NOT EXISTS pay_provider_enablement (
    id                  SERIAL PRIMARY KEY,
    company_id          INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    provider            VARCHAR(20) NOT NULL,
    enabled             BOOLEAN NOT NULL DEFAULT FALSE,
    changed_by_user_id  INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_pay_provider_enablement UNIQUE (company_id, provider)
);
CREATE INDEX IF NOT EXISTS ix_pay_provider_enablement_id ON pay_provider_enablement (id);
CREATE INDEX IF NOT EXISTS ix_pay_provider_enablement_company_id ON pay_provider_enablement (company_id);

-- ── 4. Hub: roteamento canal × forma → 1 intermediador ──────────────────────
CREATE TABLE IF NOT EXISTS pay_channel_route (
    id                  SERIAL PRIMARY KEY,
    company_id          INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    channel             VARCHAR(30) NOT NULL,
    method              VARCHAR(20) NOT NULL,
    provider            VARCHAR(20) NOT NULL,
    changed_by_user_id  INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    updated_at          TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_pay_channel_route UNIQUE (company_id, channel, method)
);
CREATE INDEX IF NOT EXISTS ix_pay_channel_route_id ON pay_channel_route (id);
CREATE INDEX IF NOT EXISTS ix_pay_channel_route_company_id ON pay_channel_route (company_id);

-- ── 5. Hub: cobranças genéricas ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pay_charge (
    id                   SERIAL PRIMARY KEY,
    company_id           INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    provider             VARCHAR(20) NOT NULL,
    environment          VARCHAR(20) NOT NULL DEFAULT 'PRODUCTION',
    method               VARCHAR(20) NOT NULL DEFAULT 'BOLETO',
    channel              VARCHAR(30),
    origin_type          VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
    origin_ref           VARCHAR(120),
    customer_id          INTEGER REFERENCES crm_customer(id) ON DELETE SET NULL,
    issue_date           DATE,
    order_number         VARCHAR(60),
    pdv_coupon_number    VARCHAR(60),
    financial_launch_id  VARCHAR(60),
    installment_number   VARCHAR(20),
    invoice_number       VARCHAR(60),
    horus_cod_cli        VARCHAR(40),
    horus_id_guid        VARCHAR(100),
    origin_meta          JSON,
    provider_charge_id   VARCHAR(80),
    idempotency_key      VARCHAR(64) NOT NULL,
    code                 VARCHAR(80),
    status               VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    amount               NUMERIC(14,2) NOT NULL,
    due_date             DATE NOT NULL,
    description          VARCHAR(255),
    payer_name           VARCHAR(150),
    payer_document       VARCHAR(20),
    payer_email          VARCHAR(150),
    payer_snapshot       JSON,
    digitable_line       VARCHAR(60),
    barcode              VARCHAR(60),
    our_number           VARCHAR(50),
    pix_emv              TEXT,
    pdf_url              TEXT,
    registered           BOOLEAN,
    total_paid           NUMERIC(14,2),
    paid_at              TIMESTAMPTZ,
    cancelled_at         TIMESTAMPTZ,
    last_error           TEXT,
    replaces_charge_id   INTEGER REFERENCES pay_charge(id) ON DELETE SET NULL,
    created_by_user_id   INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ DEFAULT now(),
    updated_at           TIMESTAMPTZ DEFAULT now(),
    last_synced_at       TIMESTAMPTZ,
    CONSTRAINT uq_pay_charge_provider_id UNIQUE (provider, provider_charge_id)
);
ALTER TABLE pay_charge ADD COLUMN IF NOT EXISTS customer_id         INTEGER REFERENCES crm_customer(id) ON DELETE SET NULL;
ALTER TABLE pay_charge ADD COLUMN IF NOT EXISTS issue_date          DATE;
ALTER TABLE pay_charge ADD COLUMN IF NOT EXISTS order_number        VARCHAR(60);
ALTER TABLE pay_charge ADD COLUMN IF NOT EXISTS pdv_coupon_number   VARCHAR(60);
ALTER TABLE pay_charge ADD COLUMN IF NOT EXISTS financial_launch_id VARCHAR(60);
ALTER TABLE pay_charge ADD COLUMN IF NOT EXISTS installment_number  VARCHAR(20);
ALTER TABLE pay_charge ADD COLUMN IF NOT EXISTS invoice_number      VARCHAR(60);
ALTER TABLE pay_charge ADD COLUMN IF NOT EXISTS horus_cod_cli       VARCHAR(40);
ALTER TABLE pay_charge ADD COLUMN IF NOT EXISTS horus_id_guid       VARCHAR(100);
ALTER TABLE pay_charge ADD COLUMN IF NOT EXISTS origin_meta         JSON;
CREATE INDEX IF NOT EXISTS ix_pay_charge_id ON pay_charge (id);
CREATE INDEX IF NOT EXISTS ix_pay_charge_company_id ON pay_charge (company_id);
CREATE INDEX IF NOT EXISTS ix_pay_charge_company_status_due ON pay_charge (company_id, status, due_date);
CREATE INDEX IF NOT EXISTS ix_pay_charge_company_provider_created ON pay_charge (company_id, provider, created_at);
CREATE INDEX IF NOT EXISTS ix_pay_charge_company_paid_at ON pay_charge (company_id, paid_at);
CREATE INDEX IF NOT EXISTS ix_pay_charge_company_issue_date ON pay_charge (company_id, issue_date);
CREATE INDEX IF NOT EXISTS ix_pay_charge_company_customer ON pay_charge (company_id, customer_id);
CREATE INDEX IF NOT EXISTS ix_pay_charge_company_launch ON pay_charge (company_id, financial_launch_id);
CREATE INDEX IF NOT EXISTS ix_pay_charge_company_invoice ON pay_charge (company_id, invoice_number);
CREATE INDEX IF NOT EXISTS ix_pay_charge_company_order ON pay_charge (company_id, order_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_charge_active_origin
    ON pay_charge (company_id, origin_type, origin_ref)
    WHERE is_active = true AND origin_ref IS NOT NULL;

-- ── 6. Hub: eventos das cobranças ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pay_charge_event (
    id                 SERIAL PRIMARY KEY,
    company_id         INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    charge_id          INTEGER REFERENCES pay_charge(id) ON DELETE CASCADE,
    provider           VARCHAR(20) NOT NULL,
    source             VARCHAR(20) NOT NULL,
    event_type         VARCHAR(40) NOT NULL,
    external_event_id  VARCHAR(120),
    status_before      VARCHAR(20),
    status_after       VARCHAR(20),
    message            VARCHAR(500),
    user_id            INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_pay_charge_event_id ON pay_charge_event (id);
CREATE INDEX IF NOT EXISTS ix_pay_charge_event_company_id ON pay_charge_event (company_id);
CREATE INDEX IF NOT EXISTS ix_pay_charge_event_charge ON pay_charge_event (charge_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_charge_event_external
    ON pay_charge_event (provider, external_event_id) WHERE external_event_id IS NOT NULL;

COMMIT;

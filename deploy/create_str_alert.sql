-- Deploy: cria tabela str_alert — sistema de alertas B2B
-- Data: 2026-08-19
CREATE TABLE IF NOT EXISTS str_alert (
    id          SERIAL PRIMARY KEY,
    company_id  INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    title       VARCHAR(120) NOT NULL,
    message     TEXT NOT NULL,
    type        VARCHAR(20) NOT NULL DEFAULT 'info',
    starts_at   TIMESTAMP WITH TIME ZONE,
    ends_at     TIMESTAMP WITH TIME ZONE,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    dismissible BOOLEAN NOT NULL DEFAULT TRUE,
    created_by  INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_str_alert_company_active ON str_alert(company_id, active);

# Migração SQL — Rotina Automatizada de Pedidos de Compra Bookinfo

Execute os comandos abaixo **na ordem** no banco de dados PostgreSQL de produção:

```sql
-- 1. Adiciona coluna de controle de automação por seller em cmp_settings
ALTER TABLE cmp_settings
  ADD COLUMN IF NOT EXISTS bookinfo_purchase_auto BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Cria tabela de log do job automático
CREATE TABLE IF NOT EXISTS spl_purchase_job_log (
    id               SERIAL PRIMARY KEY,
    company_id       INTEGER NOT NULL REFERENCES cmp_company(id),
    supplier_id      INTEGER REFERENCES spl_supplier(id),
    supplier_name    VARCHAR(255),
    run_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    orders_found     INTEGER DEFAULT 0,
    orders_sent      INTEGER DEFAULT 0,
    orders_skipped   INTEGER DEFAULT 0,
    orders_error     INTEGER DEFAULT 0,
    syncs_done       INTEGER DEFAULT 0,
    syncs_error      INTEGER DEFAULT 0,
    status           VARCHAR(50) DEFAULT 'SUCCESS',
    details          TEXT
);

-- 3. Índices para performance nas queries de log
CREATE INDEX IF NOT EXISTS idx_purchase_job_log_company_id
    ON spl_purchase_job_log(company_id);

CREATE INDEX IF NOT EXISTS idx_purchase_job_log_run_at
    ON spl_purchase_job_log(run_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_job_log_supplier_id
    ON spl_purchase_job_log(supplier_id);
```

## Verificação pós-migração

```sql
-- Confirma colunas em cmp_settings
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'cmp_settings'
  AND column_name = 'bookinfo_purchase_auto';

-- Confirma criação da tabela
\d spl_purchase_job_log
```

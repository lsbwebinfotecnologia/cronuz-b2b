# Roteiro de Deploy — Orçamentos & Propostas DBM + Valor Mínimo de Faturamento em Empresas DBM

## 1. Alterações de Banco de Dados (PostgreSQL)

As seguintes alterações estruturais (DDL) foram adicionadas ao banco de dados PostgreSQL local e também estão configuradas no auto-DDL de inicialização (`backend/main.py`):

```sql
-- 1. Coluna de Valor Mínimo de Faturamento na tabela de empresas/clientes (crm_customer)
ALTER TABLE crm_customer
ADD COLUMN IF NOT EXISTS min_order_total DOUBLE PRECISION NOT NULL DEFAULT 0;

-- 2. Tabela dedicada para Orçamentos / Propostas do módulo DBM (dbm_proposal)
CREATE TABLE IF NOT EXISTS dbm_proposal (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    local_id INTEGER NOT NULL,
    customer_id INTEGER REFERENCES crm_customer(id) ON DELETE SET NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_corporate_name VARCHAR(255),
    customer_document VARCHAR(50),
    customer_horus_cod_cli INTEGER,
    status_id VARCHAR(50) NOT NULL DEFAULT 'st-2',
    status_name VARCHAR(120) NOT NULL DEFAULT 'Aguardando Análise Comercial',
    status_phase VARCHAR(50) NOT NULL DEFAULT 'EM_ANALISE',
    total_titles INTEGER NOT NULL DEFAULT 0,
    total_requested_qty INTEGER NOT NULL DEFAULT 0,
    total_approved_qty INTEGER NOT NULL DEFAULT 0,
    total_cover_value DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_net_value DOUBLE PRECISION NOT NULL DEFAULT 0,
    average_discount DOUBLE PRECISION NOT NULL DEFAULT 0,
    global_discount DOUBLE PRECISION NOT NULL DEFAULT 0,
    min_order_value DOUBLE PRECISION NOT NULL DEFAULT 0,
    horus_order_number VARCHAR(100),
    notes TEXT,
    items_json JSON,
    created_by_user_id INTEGER REFERENCES usr_user(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dbm_proposal_company_id ON dbm_proposal(company_id);
CREATE INDEX IF NOT EXISTS idx_dbm_proposal_customer_id ON dbm_proposal(customer_id);
CREATE INDEX IF NOT EXISTS idx_dbm_proposal_company_local ON dbm_proposal(company_id, local_id);
```

## 2. Passos para Deploy em Produção (Quando Autorizado)

```bash
# 1. Aplicar SQL no PostgreSQL de produção
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/DEPLOY_DBM_PROPOSALS_AND_MIN_ORDER.sql

# 2. Atualizar código, compilar Frontend e reiniciar serviços
cd /var/www/cronuz && git pull origin main
cd /var/www/cronuz/frontend && npm run build
pm2 restart cronuz-frontend
systemctl restart cronuz-backend
```

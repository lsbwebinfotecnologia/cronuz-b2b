# Deploy: Módulo Mesa de Pedidos B2B (`module_order_intake`)

Este documento descreve a alteração de banco de dados (PostgreSQL) necessária em produção para habilitar o controle do módulo **Mesa de Pedidos B2B** (`module_order_intake`) por Seller através do painel Master (`/companies/[id]/modules`).

## 1. Alteração no Banco de Dados (DDL PostgreSQL)

Conectar ao banco de dados de produção e adicionar a coluna `module_order_intake` na tabela `cmp_company`:

```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -c "ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS module_order_intake BOOLEAN NOT NULL DEFAULT FALSE;"
```

### SQL Equivalente:
```sql
ALTER TABLE cmp_company
ADD COLUMN IF NOT EXISTS module_order_intake BOOLEAN NOT NULL DEFAULT FALSE;
```

## 2. Comandos Padrão de Deploy da Aplicação

```bash
cd /var/www/cronuz && git pull origin main
cd /var/www/cronuz/frontend && npm run build
pm2 restart cronuz-frontend
systemctl restart cronuz-backend
```

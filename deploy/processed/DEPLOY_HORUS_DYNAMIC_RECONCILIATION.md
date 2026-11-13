# Deploy: Módulo Conciliador Dinâmico & Construtor de Modelos Horus ERP

## Objetivo
Adicionar o novo módulo isolado **Conciliador Dinâmico (Modelos & De/Para)** (`/horus-direct/conciliador-padrao`), liberado individualmente por empresa no Painel Master (`horus_sql_feature_conciliador_padrao`), sem alterar a rotina existente em `/horus-direct/financeiro-vindi`.

## Alterações de Banco de Dados (PostgreSQL)
Executar o arquivo `deploy/DEPLOY_HORUS_DYNAMIC_RECONCILIATION.sql`:

```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/DEPLOY_HORUS_DYNAMIC_RECONCILIATION.sql
```

## Passos de Deploy em Produção (`64.23.182.183`)
```bash
cd /var/www/cronuz && git pull origin main
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/DEPLOY_HORUS_DYNAMIC_RECONCILIATION.sql
cd /var/www/cronuz/frontend && npm run build
pm2 restart cronuz-frontend
systemctl restart cronuz-backend
```

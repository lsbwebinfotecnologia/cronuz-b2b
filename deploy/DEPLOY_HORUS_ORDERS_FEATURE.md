# Deploy — Funcionalidade Pedidos (Horus Direct)

Este documento descreve as alterações de banco de dados e passos de deploy para a nova funcionalidade **Pedidos (Horus Direct)**.

---

## 🗄️ 1. Migração de Banco de Dados (PostgreSQL - Produção)

Execute no servidor de produção (`64.23.182.183`) via `psql`:

```sql
-- Conectar ao banco cronuz_b2b
\c cronuz_b2b;

-- Adiciona a feature flag para controle do módulo Pedidos no Horus Direct
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_sql_feature_pedidos BOOLEAN DEFAULT FALSE NOT NULL;

-- Adiciona o parâmetro de Método de Venda padrão no Horus
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_vendas_metodo VARCHAR(50);
```

---

## 🚀 2. Deploy da Aplicação

```bash
# 1. Pull das alterações
cd /var/www/cronuz && git pull origin main

# 2. Build do Frontend
cd /var/www/cronuz/frontend && npm run build
pm2 restart cronuz-frontend

# 3. Restart do Backend
systemctl restart cronuz-backend

# 4. Validação de Saúde
curl -s -o /dev/null -w 'Backend: %{http_code}\n' http://localhost:8000/
curl -s -o /dev/null -w 'Frontend: %{http_code}\n' http://localhost:3000
```

# Roteiro de Deploy — Módulo de Cafeteria Omnichannel

Este documento detalha as etapas de banco de dados, backend e frontend para o deploy do Módulo de Cafeteria no servidor de produção (`64.23.182.183`).

---

## 🗄️ 1. Migração no Banco de Dados (PostgreSQL)

Executar os scripts SQL abaixo diretamente no servidor de produção:

```bash
ssh root@64.23.182.183
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/alter_cmp_company_add_module_cafeteria.sql
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/create_cafeteria_tables.sql
```

Ambos os scripts utilizam `IF NOT EXISTS`, garantindo zero perda de dados e idempotência completa.

---

## ⚙️ 2. Atualização do Backend e Frontend

```bash
cd /var/www/cronuz
git pull origin main

# Build do Frontend
cd /var/www/cronuz/frontend
npm run build
pm2 restart cronuz-frontend

# Restart do Backend
systemctl restart cronuz-backend
```

---

## 🧪 3. Validação pós-deploy

```bash
# Validar backend
curl -s -o /dev/null -w 'Backend: %{http_code}\n' http://localhost:8000/dashboard/metrics -H 'Authorization: Bearer test'

# Validar frontend
curl -s -o /dev/null -w 'Frontend: %{http_code}\n' http://localhost:3000
```

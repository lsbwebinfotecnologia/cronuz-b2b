# Roteiro de Deploy — Módulo de Inventário (Cronuz B2B)

## 📋 Resumo
Implantação do novo **Módulo de Inventário** (Mobile-First & Offline-First) para gestão de estoques, prateleiras, bips de operadores, auditoria de recontagem e exportação Excel.

---

## 🗄️ 1. Banco de Dados (PostgreSQL)

Executar o script SQL no banco `cronuz_b2b`:

```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/DEPLOY_MODULO_INVENTARIO.sql
```

Ou diretamente via psql interativo:
```sql
\i /var/www/cronuz/deploy/DEPLOY_MODULO_INVENTARIO.sql
```

---

## 📦 2. Dependências Python

Verificar se o pacote `openpyxl` está instalado no ambiente virtual do backend:
```bash
/var/www/cronuz/backend/venv/bin/pip install openpyxl
```

---

## 🚀 3. Aplicação do Código e Reinício dos Serviços

```bash
cd /var/www/cronuz
git pull origin main

# Build do Frontend
cd /var/www/cronuz/frontend
npm run build
pm2 restart cronuz-frontend

# Reinício do Backend
systemctl restart cronuz-backend

# Verificação de Saúde
curl -s -o /dev/null -w 'Backend: %{http_code}\n' http://localhost:8000/
curl -s -o /dev/null -w 'Frontend: %{http_code}\n' http://localhost:3000
```

---

## 🧹 4. Pós-Deploy
Após validação em produção, mover os arquivos de deploy para `deploy/processed/`:
```bash
mv deploy/DEPLOY_MODULO_INVENTARIO.sql deploy/processed/
mv deploy/DEPLOY_MODULO_INVENTARIO.md deploy/processed/
```

# DEPLOY: Módulo Horus SQL Direct

**Data de criação:** 2026-09-01  
**Status:** PENDENTE (aguardando autorização de deploy)

---

## Pré-requisitos no Servidor de Produção

### 1. Instalar pymssql no servidor
```bash
cd /var/www/cronuz/backend
source venv/bin/activate
pip install pymssql>=2.3.0
```

### 2. Gerar chave de criptografia Fernet (executar UMA VEZ)
```bash
cd /var/www/cronuz/backend
source venv/bin/activate
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```
⚠️ ATENÇÃO: Gere uma chave NOVA e DIFERENTE da chave local.
Copie o resultado para o passo seguinte.

### 3. Adicionar a chave ao .env de produção
```bash
echo "HORUS_SQL_ENCRYPTION_KEY=<CHAVE_GERADA_ACIMA>" >> /var/www/cronuz/backend/.env
```
Verifique que ficou salvo:
```bash
grep HORUS_SQL_ENCRYPTION_KEY /var/www/cronuz/backend/.env
```

---

## Migration do Banco de Dados PostgreSQL (Produção)

Execute os comandos abaixo no banco de produção (cronuz_b2b):

```sql
-- Novos campos na tabela cmp_settings
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_sql_enabled              BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_sql_host                 VARCHAR(255);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_sql_port                 VARCHAR(10);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_sql_database             VARCHAR(100);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_sql_username             VARCHAR(100);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_sql_password             VARCHAR(500);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_sql_cod_empresa          VARCHAR(20);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_sql_cod_filial           VARCHAR(20);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_sql_feature_vindi_baixa  BOOLEAN NOT NULL DEFAULT FALSE;

-- Parâmetros bancários para borderô no Horus
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_banco_forma_pagto        VARCHAR(50);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_banco_codigo             VARCHAR(20);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_banco_agencia            VARCHAR(20);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_banco_conta              VARCHAR(30);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_banco_carteira           VARCHAR(20);

-- Novo campo na tabela cmp_company
ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS module_horus_sql BOOLEAN NOT NULL DEFAULT FALSE;
```

### Como executar no servidor:
```bash
ssh root@64.23.182.183
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -c "
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_sql_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_sql_host VARCHAR(255);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_sql_port VARCHAR(10);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_sql_database VARCHAR(100);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_sql_username VARCHAR(100);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_sql_password VARCHAR(500);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_sql_cod_empresa VARCHAR(20);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_sql_cod_filial VARCHAR(20);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_sql_feature_vindi_baixa BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_banco_forma_pagto VARCHAR(50);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_banco_codigo VARCHAR(20);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_banco_agencia VARCHAR(20);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_banco_conta VARCHAR(30);
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_banco_carteira VARCHAR(20);
ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS module_horus_sql BOOLEAN NOT NULL DEFAULT FALSE;
"
```

---

## Deploy do Código

```bash
ssh root@64.23.182.183
cd /var/www/cronuz
git pull origin main
cd backend
source venv/bin/activate
pip install python-tds>=1.15.0   # OBRIGATÓRIO: driver pure Python para SQL Server
systemctl restart cronuz-backend
systemctl status cronuz-backend
```

> ℹ️ `pymssql` pode ser removido do servidor se desejar — o driver ativo agora é `python-tds` (pytds).

---

## Validação Pós-Deploy

```bash
# HTTP 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/

# Verificar logs
tail -20 /var/www/cronuz/backend/uvicorn.log

# Worker não-zumbi
ps aux | grep uvicorn | grep -v grep
```

---

## Novos Arquivos Criados

| Arquivo | Descrição |
|---------|-----------|
| `backend/app/core/horus_sql_crypto.py` | Criptografia Fernet para credenciais SQL |
| `backend/app/integrators/horus_sql_client.py` | Cliente pytds com pool de conexões por seller |
| `backend/app/api/horus_sql.py` | API endpoints (settings, test, test-live, status, features GET/PATCH) |
| `frontend/.../horus-sql/page.tsx` | Página de configuração no painel Master |

## Arquivos Modificados

| Arquivo | Modificação |
|---------|-------------|
| `backend/app/models/company.py` | `module_horus_sql` boolean |
| `backend/app/models/company_settings.py` | 9 novos campos `horus_sql_*` (inclui `horus_sql_feature_vindi_baixa`) |
| `backend/app/schemas/company.py` | `module_horus_sql` no CompanyBase |
| `backend/app/schemas/company_settings.py` | Pydantic schema atualizado |
| `backend/app/core/scheduler.py` | Job de cleanup do pool SQL |
| `backend/main.py` | Router horus_sql + `module_horus_sql` no ModuleUpdate |
| `backend/requirements.txt` | `python-tds>=1.15.0` (driver correto para Linux/Mac) |
| `frontend/.../modules/page.tsx` | Seção "Horus SQL Direct" com toggle mestre + sub-features |
| `frontend/.../layout.tsx` | Menu "Horus SQL" com ícone `DatabaseZap` |

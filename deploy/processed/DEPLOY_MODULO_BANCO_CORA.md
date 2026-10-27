# DEPLOY — Módulo Banco Cora (configuração no Master)

Branch: `feature/modulo-banco-cora`

> [!IMPORTANT]
> Execute somente com autorização explícita ("sobe pra producao").

## 1. Contexto

O deploy de 20/10 (`deploy/processed/DEPLOY_CORA_BOLETO_HORUS.*`) colocou em produção a versão acoplada Cora x Horus. Esta branch **remove** aquela versão e cria o módulo Cora independente de ERP.

O borderô da Vindi (`horus_financial.py`) volta ao código original, anterior ao serviço compartilhado.

## 2. Banco PostgreSQL (produção)

### 2.1 Estrutura nova (aditiva, segura)
```bash
cd /var/www/cronuz
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f deploy/DEPLOY_MODULO_BANCO_CORA_1_estrutura.sql
```
- `cmp_company.module_cora` (padrão `FALSE`)
- `fin_cora_config` (1 por empresa)
- `fin_cora_account` (1 por empresa + ambiente)

### 2.2 Remoção da estrutura antiga ⚠️ destrutiva (requer autorização)
Conferir antes que está vazia:
```sql
SELECT COUNT(*) FROM fin_cora_invoice;
SELECT COUNT(*) FROM cmp_settings WHERE cora_enabled OR cora_client_id IS NOT NULL OR horus_sql_feature_cora_boleto;
```
Se ambos retornarem 0:
```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f deploy/DEPLOY_MODULO_BANCO_CORA_2_remove_antigo.sql
```

**Ordem recomendada:** 2.1, depois deploy do código, depois 2.2. O código novo não lê as colunas antigas, então a remoção pode acontecer depois do restart.

## 3. Backend / Frontend
```bash
cd /var/www/cronuz && git pull origin main
systemctl restart cronuz-backend
cd frontend && npm run build && pm2 restart cronuz-frontend
curl -s -o /dev/null -w 'Backend: %{http_code}\n' http://localhost:8000/docs
```
Não há dependências novas (`cryptography` e `requests` já estão instalados). A chave privada usa a `HORUS_SQL_ENCRYPTION_KEY` existente.

## 4. Arquivos

| Tipo | Arquivos |
|---|---|
| Novo | `backend/app/models/cora.py`, `backend/app/api/cora.py`, `backend/app/integrators/cora/{__init__,client,certificates}.py`, `frontend/.../companies/[id]/cora/page.tsx` |
| Alterado | `models/company.py`, `schemas/company.py`, `api/companies.py`, `api/dashboard.py`, `main.py`, `companies/[id]/layout.tsx`, `companies/[id]/context.tsx` |
| Removido (versão Cora x Horus) | `api/horus_cora.py`, `services/cora_horus.py`, `services/horus_bordero.py`, `jobs/cora_sync_job.py`, `models/cora_invoice.py`, `horus-direct/boleto-cora/page.tsx` |
| Revertido ao original | `api/horus_financial.py` (Vindi), `integrators/horus_sql_client.py`, `models/company_settings.py`, `api/horus_sql.py`, `core/scheduler.py`, `Sidebar.tsx`, `companies/[id]/modules/page.tsx` |

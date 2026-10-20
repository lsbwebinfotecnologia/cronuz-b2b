# DEPLOY — Boleto Banco Cora integrado ao Horus (Horus Direct)

Branch: `feature/boleto-cora-horus`

> [!IMPORTANT]
> Execute somente com autorização explícita ("sobe pra producao"). Toda a DDL é **aditiva e idempotente**: nenhum UPDATE ou DELETE de dados.

## 1. Banco PostgreSQL (produção)

```bash
cd /var/www/cronuz
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f deploy/DEPLOY_CORA_BOLETO_HORUS.sql
```

O script:
- adiciona as colunas `cora_*` e `cora_horus_*` em `cmp_settings` (credenciais Cora, multa/juros, flags de gravação reversa/baixa automática, parâmetros de borderô da conta Cora);
- adiciona a flag do Master `horus_sql_feature_cora_boleto` (padrão `FALSE`, nenhum seller muda de comportamento);
- cria a tabela `fin_cora_invoice`, com índice único parcial `(company_id, cod_filial, nro_lancto_creceber, cod_parcela) WHERE is_active`. Esse índice impede boleto duplicado.

Conferência:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'cmp_settings' AND (column_name LIKE 'cora%' OR column_name = 'horus_sql_feature_cora_boleto');
SELECT to_regclass('public.fin_cora_invoice');
```

## 2. Backend

- Não há dependências novas (`requests`, `cryptography` e `python-tds` já estão no `requirements.txt`).
- A chave privada do Cora é criptografada com a `HORUS_SQL_ENCRYPTION_KEY` já existente no `.env`.
- Novo job no APScheduler: `job_cora_sync`, a cada 30 min. Ele só atua em sellers com a feature e o Cora ativos.

```bash
systemctl restart cronuz-backend
curl -s -o /dev/null -w 'Backend: %{http_code}\n' http://localhost:8000/docs
```

## 3. Frontend

```bash
cd /var/www/cronuz/frontend && npm run build && pm2 restart cronuz-frontend
```

## 4. Ativação por seller (pós-deploy)

1. **Master → Empresas → Módulos → Horus SQL Direct**: ativar **Boleto Banco Cora**.
2. **Seller → Horus Direct → Boleto Cora → Configurações**:
   - Client ID, certificado `.pem` e chave privada `.key` (Integração Direta);
   - primeiro em **Stage**, depois em Produção;
   - informar os **COD_FORMA elegíveis** (ex.: `1,14`);
   - preencher os parâmetros de borderô da **conta Cora cadastrada no Horus** (BBANCOS / BCONTAC_CARTEIRA / FORMA_PAGTO);
   - decidir as flags **Gravar boleto no Horus** e **Baixa automática** (ambas começam desligadas);
   - **Registrar webhook** com a URL pública HTTPS da API.

> [!WARNING]
> No Horus do seller 4 (admlivros) só existe o banco **ITAU (341)** em `BBANCOS`/`BCONTAC_CARTEIRA`. Antes de ligar a baixa automática, a conta do Cora (banco 403) precisa ser cadastrada no Horus pelo próprio seller.

## 5. Arquivos alterados/criados

| Tipo | Arquivo |
|---|---|
| Model | `backend/app/models/cora_invoice.py` (novo), `backend/app/models/company_settings.py` |
| Integrador | `backend/app/integrators/cora_client.py` (novo), `backend/app/integrators/horus_sql_client.py` (`execute_transaction`) |
| Serviços | `backend/app/services/cora_horus.py` (novo), `backend/app/services/horus_bordero.py` (novo, compartilhado com a Vindi) |
| API | `backend/app/api/horus_cora.py` (novo), `horus_financial.py` (borderô Vindi passa a usar o serviço compartilhado), `horus_sql.py`, `dashboard.py`, `main.py` |
| Job | `backend/app/jobs/cora_sync_job.py` (novo), `backend/app/core/scheduler.py` |
| Frontend | `frontend/src/app/(dashboard)/horus-direct/boleto-cora/page.tsx` (novo), `Sidebar.tsx`, `companies/[id]/modules/page.tsx` |
| Deploy | `deploy/DEPLOY_CORA_BOLETO_HORUS.sql`, este arquivo |

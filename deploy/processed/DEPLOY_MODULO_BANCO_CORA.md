# DEPLOY: Hub de Pagamentos + Banco Cora (fases 1 a 3)

Branch: `feature/modulo-banco-cora`

> [!IMPORTANT]
> Execute somente com autorização explícita ("sobe pra producao").

## 1. Contexto

- O deploy de 20/10 (`deploy/processed/DEPLOY_CORA_BOLETO_HORUS.*`) colocou em produção a versão acoplada Cora x Horus. Esta branch **remove** aquela versão.
- No lugar, cria o **Hub de Pagamentos** (habilitação + roteamento no Master), a **camada genérica de cobranças** (`pay_charge`) com o **Banco Cora** como primeiro provedor, a configuração do Cora pelo seller e o **Financeiro Cora**.
- O borderô da Vindi (`horus_financial.py`) volta ao código original.
- **Produção já recebeu a 1ª versão do módulo Cora** (`deploy/processed/DEPLOY_MODULO_BANCO_CORA_1_estrutura.sql`): `cmp_company.module_cora`, `fin_cora_config` e `fin_cora_account`. A parte 1 abaixo é idempotente e só acrescenta o que falta (colunas de webhook e tabelas `pay_*`). A parte 3 leva para o Hub quem já tinha `module_cora = TRUE`. A coluna `module_cora` fica sem uso (o Hub é a fonte única) e pode ser removida no futuro, com autorização.

## 2. Banco PostgreSQL (produção)

Ordem: **1, depois deploy do código, depois 3, depois 2**.

```bash
cd /var/www/cronuz
export PGPASSWORD=cronuz_password_123
# 2.1 Estrutura (aditiva, segura)
psql -U cronuz_admin -h localhost -d cronuz_b2b -f deploy/DEPLOY_MODULO_BANCO_CORA_1_estrutura.sql
# 2.2 Carga inicial de habilitação no Hub (somente INSERT em tabela nova)
psql -U cronuz_admin -h localhost -d cronuz_b2b -f deploy/DEPLOY_MODULO_BANCO_CORA_3_habilitacao_inicial.sql
```
- **Parte 1:** cria `fin_cora_config`, `fin_cora_account`, `pay_provider_enablement`, `pay_channel_route`, `pay_charge` e `pay_charge_event`.
- **Parte 3:** marca como habilitados no Hub os intermediadores que cada seller já usa (Inter, Efí, Vindi, Cielo, Rede), lendo `cmp_settings`. Não muda nenhum comportamento atual. O Cora **não** é habilitado aqui.

### 2.3 Remoção da estrutura antiga ⚠️ destrutiva (requer autorização)
```sql
SELECT COUNT(*) FROM fin_cora_invoice;
SELECT COUNT(*) FROM cmp_settings WHERE cora_enabled OR cora_client_id IS NOT NULL OR horus_sql_feature_cora_boleto;
```
Se ambos retornarem 0:
```bash
psql -U cronuz_admin -h localhost -d cronuz_b2b -f deploy/DEPLOY_MODULO_BANCO_CORA_2_remove_antigo.sql
```

## 3. Backend / Frontend
```bash
cd /var/www/cronuz && git pull origin main
systemctl restart cronuz-backend
cd frontend && npm run build && pm2 restart cronuz-frontend
curl -s -o /dev/null -w 'Backend: %{http_code}\n' http://localhost:8000/docs
```
- Não há dependências novas (o gráfico é SVG próprio).
- A chave privada do Cora usa a `HORUS_SQL_ENCRYPTION_KEY` existente.
- Novo job `job_payments_sync`, a cada 30 min: conciliação de reserva, com limite de 100 cobranças por seller.

## 4. Pós-deploy (por seller)
1. **Master → Empresa → Pagamentos & Bancos:** habilitar **Banco Cora**.
2. **Seller → Configurações → Pagamentos:** Client ID + certificado (Stage/Produção), ambiente ativo, multa, juros, desconto e notificações → **Testar conexão**.
3. **Webhook:** registrar com a URL pública HTTPS da API (`https://<api>/payments/webhooks/cora/...` é montada automaticamente).
4. **Master → Roteamento:** definir, por exemplo, Financeiro/Boleto → Banco Cora.

## 5. Arquivos

| Tipo | Arquivos |
|---|---|
| Novo (backend) | `models/payments.py`, `models/cora.py`, `payments/{__init__,base,catalog,registry,service,origins}.py`, `payments/providers/cora.py`, `api/payments_hub.py`, `api/payments.py`, `api/cora.py`, `integrators/cora/{__init__,client,certificates}.py`, `jobs/payments_sync_job.py` |
| Novo (frontend) | `companies/[id]/payments/page.tsx` (Hub), `components/payments/{CoraSettingsPanel,chargeUi,ChargesComparisonChart}.tsx`, `financial/cora/page.tsx`, `financial/cora/boletos/page.tsx`, `financial/cora/boletos/[id]/page.tsx` |
| Alterado | `api/dashboard.py` (`payment_providers_enabled`), `integrators/horus_clients.py` (`horus_legacy_pagination` em notas/débitos), `core/scheduler.py`, `main.py`, `companies/[id]/layout.tsx` (menu "Pagamentos & Bancos"), `settings/page.tsx` (painel Cora na aba Pagamentos + `?tab=`), `Sidebar.tsx` (Financeiro Cora) |
| Removido (versão Cora x Horus) | `api/horus_cora.py`, `services/cora_horus.py`, `services/horus_bordero.py`, `jobs/cora_sync_job.py`, `models/cora_invoice.py`, `horus-direct/boleto-cora/page.tsx` |
| Revertido ao original | `api/horus_financial.py` (Vindi), `integrators/horus_sql_client.py`, `models/company_settings.py`, `api/horus_sql.py`, `companies/[id]/modules/page.tsx` |

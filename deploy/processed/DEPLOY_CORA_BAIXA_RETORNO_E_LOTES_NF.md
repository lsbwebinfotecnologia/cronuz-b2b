# Roteiro de Deploy — Banco Cora: Emissão em Lote, Impressão Unificada e Baixa Automática de Retorno (Cronuz & Horus ERP)

## 1. Alterações de Banco de Dados (PostgreSQL)

Execute o bloco SQL abaixo no PostgreSQL de produção (`cronuz_b2b`):

```sql
-- Novas colunas na tabela fin_cora_config para:
-- 1) Filtro de formas de pagamento e modo automático (Play/Pause) na tela de Notas Fiscais Horus
-- 2) Baixa automática nativa no Cronuz B2B (cronuz_baixa_enabled, cronuz_account_id)
-- 3) Baixa automática e lançamento bancário no Horus ERP (BLANCTOS via TRG_IMP_LANCTO_CRECEBER),
--    100% isolada da configuração da Vindi.

ALTER TABLE fin_cora_config
    ADD COLUMN IF NOT EXISTS invoice_allowed_payment_forms VARCHAR(500),
    ADD COLUMN IF NOT EXISTS invoice_auto_emit_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS cronuz_baixa_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS cronuz_account_id INTEGER REFERENCES fin_account(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS horus_baixa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS horus_cod_banco VARCHAR(20),
    ADD COLUMN IF NOT EXISTS horus_cod_agencia VARCHAR(20),
    ADD COLUMN IF NOT EXISTS horus_cod_contac VARCHAR(20),
    ADD COLUMN IF NOT EXISTS horus_nro_carteira VARCHAR(20),
    ADD COLUMN IF NOT EXISTS horus_cod_forma VARCHAR(20),
    ADD COLUMN IF NOT EXISTS horus_tarifa_boleto NUMERIC(10, 2);
```

## 2. Arquivos Novos e Modificados
- `backend/app/models/cora.py`: Novas colunas em `CoraConfig` com `foreign_keys=[cronuz_account_id]` explícito.
- `backend/app/api/cora.py`:
  - Migração defensiva `_ensure_cora_settlement_columns`.
  - Inclusão de `integrations` (`cora_enabled`, `horus_enabled`, `horus_sql_enabled`, `can_use_horus_baixa`) e `cronuz_accounts` em `GET /companies/{id}/cora`.
  - Validação da trava dupla de dependência (`Cora` + `Horus SQL` + códigos obrigatórios `COD_BANCO`, `COD_AGENCIA`, `COD_CONTAC`) em `PUT /companies/{id}/cora/config`.
  - Novo endpoint auxiliar `GET /companies/{id}/cora/horus-bank-options` (leitura de `BCONTAC_GERAL`, `BBANCOS`, `BAGENCIAS`, `BCONTAC_CARTEIRA` e `FORMA_PAGTO`).
- `backend/app/payments/settlement.py`: Handler de baixa automática (`_settle_cronuz_native` e `_settle_horus_erp`) acionado quando `PayCharge` transita para `PAID`.
- `backend/app/payments/service.py`: Registro dos handlers de origem via `register_all_settlement_handlers`.
- `backend/app/payments/horus_invoices.py` e `backend/app/payments/api.py`: Impressão unificada de múltiplos boletos (`POST /companies/{id}/payments/charges/batch-pdf`), emissão em lote seguro (`POST /companies/{id}/payments/horus-invoices/emit-batch`) e modo Play/Pause (`PUT /companies/{id}/payments/horus-invoices/auto-emit`).
- `frontend/src/components/payments/CoraSettingsPanel.tsx`: Card de **Baixa Automática de Retorno e Conciliação Bancária** (Cronuz Nativo + Horus ERP com parametrização direta dos códigos obrigatórios).
- `frontend/src/app/(dashboard)/financial/cora/notas-fiscais/page.tsx`: Fila de Impressão, impressão unificada por NF/lote e modo automático Play/Pause.
- `frontend/src/app/(dashboard)/financial/cora/monitor/page.tsx` e `frontend/src/components/Sidebar.tsx`: Nova tela **Monitor de Retorno** no menu **Financeiro Cora** + endpoints `GET /companies/{id}/payments/monitor`, `POST /companies/{id}/payments/monitor/run-sync` e `POST /companies/{id}/payments/charges/{charge_id}/settle`.
- `backend/app/jobs/payments_sync_job.py`: Varredura automática a cada 30 min para todos os boletos em aberto (incluindo pagamentos antecipados) e reprocessamento automático de baixas pendentes.

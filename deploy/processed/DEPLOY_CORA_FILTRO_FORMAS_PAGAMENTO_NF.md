# Deploy: Filtro de Formas de Pagamento, Modo Automático (Play), Emissão em Lote e Impressão Unificada de Boletos (Cora / Horus ERP)

## 1. Alteração no Banco de Dados (PostgreSQL)

Executar no banco de produção (`cronuz_b2b`):

```sql
ALTER TABLE fin_cora_config
ADD COLUMN IF NOT EXISTS invoice_allowed_payment_forms VARCHAR(500);

ALTER TABLE fin_cora_config
ADD COLUMN IF NOT EXISTS invoice_auto_emit_enabled BOOLEAN NOT NULL DEFAULT FALSE;
```

> **Nota**: O backend também possui guard automático (`_ensure_cora_invoice_columns`) que garante a criação das colunas caso não existam.

## 2. Arquivos Alterados

- `backend/app/models/cora.py`: colunas `invoice_allowed_payment_forms` e `invoice_auto_emit_enabled` em `CoraConfig`.
- `backend/app/payments/horus_invoices.py`:
  - Correção da persistência de `update_invoice_allowed_payment_forms` (`CoraConfig` + `updated_by_user_id`).
  - Alta performance: cache de `Busca_MetodoVenda` + `Busca_FormaPagto` (30 min), cache de `Busca_NotaFiscal` + `Busca_debitos` (90s), uso de `ARQ_BASE64="N"` em `Busca_debitos` para não renderizar PDFs pesados no Horus, cache de parse de XML Base64 e consulta filtrada de `Customer` no PostgreSQL.
  - Emissão em lote (`emit_batch_boletos_for_horus_invoices`) reutilizando uma única sessão mTLS com o Banco Cora.
  - Unificação de múltiplos boletos em um único PDF contínuo (`build_merged_pdf_for_charges` via `pypdf`) para impressão de todas as parcelas/boletos de uma só vez.
- `backend/app/api/payments.py`:
  - `PUT /companies/{company_id}/payments/horus-invoices/payment-forms-filter`
  - `PUT /companies/{company_id}/payments/horus-invoices/auto-emit`
  - `POST /companies/{company_id}/payments/horus-invoices/emit-batch`
  - `POST /companies/{company_id}/payments/charges/batch-pdf`
- `frontend/src/components/payments/chargeUi.tsx`: helper `openMergedChargesPdf`.
- `frontend/src/app/(dashboard)/financial/cora/notas-fiscais/page.tsx`:
  - Botão `Modo Automático (Play / Pause)` com trava de segurança de forma de pagamento.
  - Botão `Emitir Pendentes` (revisão e emissão segura em lote).
  - `Fila de Impressão` unificada + botão `Imprimir (N)` direto na Nota Fiscal para abrir todas as parcelas em um único PDF.

## 3. Comandos de Deploy em Produção

```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -c "ALTER TABLE fin_cora_config ADD COLUMN IF NOT EXISTS invoice_allowed_payment_forms VARCHAR(500); ALTER TABLE fin_cora_config ADD COLUMN IF NOT EXISTS invoice_auto_emit_enabled BOOLEAN NOT NULL DEFAULT FALSE;"
cd /var/www/cronuz && git pull origin main
cd /var/www/cronuz/frontend && npm run build
pm2 restart cronuz-frontend
systemctl restart cronuz-backend
```

# Deploy — Central de Pagamentos por Canal/Forma, Vindi Commerce (Transparente & Link CPF Express) e Boletos por Notas Fiscais Horus

## 1. Resumo das Alterações
1. **Matriz Unificada de Pagamentos por Canal × Forma (`pay_channel_route` + `payment_channel_modes`)**:
   - Na tela `Configurações > Pagamentos` do Seller (`/settings`) e no Hub do Master, os 7 canais operacionais (`B2C_STOREFRONT`, `SCHOOLS`, `SUBSCRIPTIONS`, `B2B_STOREFRONT`, `INVOICES`, `FINANCIAL`, `PDV`) permitem escolher entre:
     - **Por Forma de Pagamento (Checkout Transparente)**: 1 único provedor para cada forma (`CARD` -> ex: Vindi, `PIX` -> ex: Efí, `BOLETO` -> ex: Cora).
     - **Link de Pagamento no Final da Venda**: desacoplado da forma de pagamento, enviando o pedido ao final da venda para o Link Hospedado (ex: Vindi Commerce).
2. **Integração Completa Vindi Commerce (`backend/app/integrators/vindi_checkout.py`)**:
   - Suporte a Checkout Transparente (`POST /api/v3/transactions/payment` para PIX e Cartão com Fingerprint) e Link de Pagamento Hospedado (`POST /v1/tmp_transactions/create` + `https://checkout.yapay.com.br/transacao/{token_transaction}`).
   - **Checkout Express por CPF (`vindi_express_cpf_only`)**: quando o canal usa Link de Pagamento Vindi, solicita apenas o CPF na Loja B2C para não repetir cadastro na página da Vindi.
   - **Retorno Automático (PIX & Cartão) e Histórico (`payment_history`)**: Webhook `POST /b2c/webhooks/vindi`, Polling e botão de sincronização ativa (`POST /b2c/orders/sync-vindi` via `GET /api/v3/transactions/get_by_token`).
3. **Tela de Emissão de Boletos por Notas Fiscais do Horus ERP (`/financial/cora/notas-fiscais`) — 100% via API**:
   - Consulta `Busca_NotaFiscal` (`XML_BASE64="S"`) filtrando por período (padrão: últimos 3 dias) e/ou `COD_PED_VENDA`, respeitando `horus_legacy_pagination`.
   - Extrai automaticamente todas as parcelas (`<cobr><dup>`: `nDup`, `dVenc`, `vDup`) e o endereço de cobrança do cliente (`<dest>` / `<enderDest>`) diretamente do XML da NF-e.
   - Cruza com `Busca_debitos` (API REST Horus) para anexar `NRO_LANCTO_CRECEBER` e verificar se o Horus já gerou boleto bancário (ex.: Bradesco).
   - Cruza com `pay_charge` (`origin_type = 'HORUS_INVOICE'`) para bloquear qualquer emissão duplicada por Nota Fiscal + Parcela.

## 2. Banco de Dados (PostgreSQL — Idempotente)
Caso as colunas de vínculo de origem ainda não tenham sido aplicadas em `pay_charge` e `cmp_settings` no servidor de produção, executar:

```sql
BEGIN;

ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS vindi_api_key VARCHAR(255);

ALTER TABLE pay_charge ADD COLUMN IF NOT EXISTS customer_id         INTEGER REFERENCES crm_customer(id) ON DELETE SET NULL;
ALTER TABLE pay_charge ADD COLUMN IF NOT EXISTS issue_date          DATE;
ALTER TABLE pay_charge ADD COLUMN IF NOT EXISTS order_number        VARCHAR(60);
ALTER TABLE pay_charge ADD COLUMN IF NOT EXISTS pdv_coupon_number   VARCHAR(60);
ALTER TABLE pay_charge ADD COLUMN IF NOT EXISTS financial_launch_id VARCHAR(60);
ALTER TABLE pay_charge ADD COLUMN IF NOT EXISTS installment_number  VARCHAR(20);
ALTER TABLE pay_charge ADD COLUMN IF NOT EXISTS invoice_number      VARCHAR(60);
ALTER TABLE pay_charge ADD COLUMN IF NOT EXISTS horus_cod_cli       VARCHAR(40);
ALTER TABLE pay_charge ADD COLUMN IF NOT EXISTS horus_id_guid       VARCHAR(100);
ALTER TABLE pay_charge ADD COLUMN IF NOT EXISTS origin_meta         JSON;

CREATE INDEX IF NOT EXISTS ix_pay_charge_company_issue_date ON pay_charge (company_id, issue_date);
CREATE INDEX IF NOT EXISTS ix_pay_charge_company_customer   ON pay_charge (company_id, customer_id);
CREATE INDEX IF NOT EXISTS ix_pay_charge_company_launch     ON pay_charge (company_id, financial_launch_id);
CREATE INDEX IF NOT EXISTS ix_pay_charge_company_invoice    ON pay_charge (company_id, invoice_number);
CREATE INDEX IF NOT EXISTS ix_pay_charge_company_order      ON pay_charge (company_id, order_number);

COMMIT;
```

# Roteiro de Deploy — Captura Automática e Persistência de Tarifa Bancária Cora (`pay_charge`)

## 1. Alterações de Banco de Dados (PostgreSQL)
Executar no banco `cronuz_b2b`:

```sql
ALTER TABLE pay_charge
    ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS net_amount NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS fee_description VARCHAR(120);
```

## 2. Arquivos Alterados
- `backend/app/models/payments.py`: Novas colunas `fee_amount`, `net_amount` e `fee_description` em `PayCharge` (`pay_charge`).
- `backend/app/integrators/cora/client.py`: Método `get_bank_statement(start, end, page, per_page)` consultando `GET /bank-statement/statement`.
- `backend/app/payments/settlement.py`:
  - `_resolve_cora_tariff_from_statement`: Captura a tarifa exata debitada (`DEBIT` / `FEE`) no extrato oficial do Cora no mesmo segundo da liquidação (`CREDIT` / `PAYMENT`) e persiste em `pay_charge` (`fee_amount`, `net_amount`, `fee_description`).
  - `_settle_horus_cpagar_tarifa` e `_settle_horus_erp`: Lança/baixa (ou atualiza caso divergente) a tarifa real no Contas a Pagar do Horus (`LANCTOS_CPAGAR_GERAL` -> `BLANCTOS`) e atualiza `VLR_TARIF_BOL` em `LANCTOS_CRECEBERA` / `LANCTOS_CRECEBER`.
- `backend/app/payments/service.py`: Serialização de `fee_amount`, `net_amount`, `fee_description` e totalizadores `paid_fee_amount` / `paid_net_amount`.
- `backend/app/api/cora.py`: Correção dos nomes reais das colunas SQL Server do Horus (`DESC_BANCO`, `DESC_AGENCIA`, `NRO_CONTAC`, `DESC_CONTAC`) em `get_cora_horus_bank_options` e remoção da obrigatoriedade de `horus_tarifa_boleto > 0`.
- `backend/app/api/payments.py`: Exibição do status de taxa automática no Monitor de Retorno.
- `frontend/src/components/payments/CoraSettingsPanel.tsx`: Substituição do campo manual de tarifa por indicador automático via extrato Cora (`FEE`).
- `frontend/src/components/payments/chargeUi.tsx`, `frontend/src/app/(dashboard)/financial/cora/boletos/[id]/page.tsx` e `frontend/src/app/(dashboard)/financial/cora/monitor/page.tsx`: Exibição da taxa cobrada pelo banco e do valor líquido em cada cobrança paga.

## 3. Comandos de Deploy em Produção (`64.23.182.183`)
```bash
cd /var/www/cronuz && git pull origin main
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/20261113_cora_pay_charge_fee_columns.sql
systemctl restart cronuz-backend
cd /var/www/cronuz/frontend && npm run build
pm2 restart cronuz-frontend
```

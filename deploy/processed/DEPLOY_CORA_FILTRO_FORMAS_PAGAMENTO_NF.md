# Deploy: Filtro Discreto de Formas de Pagamento nas Notas Fiscais (Cora / Horus ERP)

## 1. Alteração no Banco de Dados (PostgreSQL)

Executar no banco de produção (`cronuz_b2b`):

```sql
ALTER TABLE fin_cora_config
ADD COLUMN IF NOT EXISTS invoice_allowed_payment_forms VARCHAR(500);
```

## 2. Arquivos Alterados

- `backend/app/models/cora.py`: nova coluna `invoice_allowed_payment_forms` em `CoraConfig`.
- `backend/app/api/cora.py`: serialização e persistência de `invoice_allowed_payment_forms`.
- `backend/app/payments/horus_invoices.py`:
  - Consulta de `Busca_FormaPagto` na API Horus ERP respeitando `OFFSET`/`LIMIT`.
  - Extração de `<pag><detPag><tPag>` do XML da NF-e quando a nota não possui título em aberto em `Busca_debitos` (ex.: `Sem Pagamento` para doações/remessas).
  - Filtragem de parcelas/notas pelas formas de pagamento configuradas pelo seller (`invoice_allowed_payment_forms`).
- `backend/app/api/payments.py`: endpoint `PUT /companies/{company_id}/payments/horus-invoices/payment-forms-filter`.
- `frontend/src/app/(dashboard)/financial/cora/notas-fiscais/page.tsx`: botão discreto (`SlidersHorizontal`) na barra de filtros para selecionar quais formas de pagamento do Horus devem ser exibidas na tela.

## 3. Comandos de Deploy em Produção

```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -c "ALTER TABLE fin_cora_config ADD COLUMN IF NOT EXISTS invoice_allowed_payment_forms VARCHAR(500);"
cd /var/www/cronuz && git pull origin main
cd /var/www/cronuz/frontend && npm run build
pm2 restart cronuz-frontend
systemctl restart cronuz-backend
```

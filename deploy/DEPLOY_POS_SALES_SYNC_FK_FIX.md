# Roteiro de Deploy — Correção FK customer_id=0 na Sincronização de Vendas PDV (Erro 500)

## Causa Raiz
Quando uma venda foi realizada no PDV com cliente avulso/offline, o cliente no app foi registrado com `id: 0`.
Ao tentar sincronizar o lote no backend, a query executava:
`INSERT INTO pos_sale (..., customer_id=0, ...)`
O PostgreSQL rejeitava com `psycopg2.errors.ForeignKeyViolation: Key (customer_id)=(0) is not present in table "crm_customer"`, gerando HTTP 500.

## Correção Aplicada
1. No backend (`backend/app/api/pos.py`):
   - Valida se `customer_id` é maior que zero e se o registro realmente existe em `crm_customer` para a empresa.
   - Caso contrário, define `customer_id = None` (compatível com cliente avulso / balcão).
   - Adicionado `db.rollback()` no bloco `except` para evitar contaminação do pool em caso de erro.
2. No app móvel (`mobile/`):
   - Sanitizado o envio de `customer_id` para enviar `null` sempre que o id for 0 ou inválido.

## Comandos de Deploy
```bash
# 1. No servidor de produção (64.23.182.183):
cd /var/www/cronuz
git pull origin main
systemctl restart cronuz-backend

# 2. Validação:
curl -s -o /dev/null -w 'Backend Status: %{http_code}\n' http://localhost:8000/docs
```

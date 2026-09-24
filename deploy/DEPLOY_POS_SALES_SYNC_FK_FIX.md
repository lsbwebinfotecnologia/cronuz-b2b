# Roteiro de Deploy — Auto-cadastro de Cliente & Correção FK na Sincronização de Vendas PDV (App e Web)

## Funcionalidade Implementada
Quando uma venda é realizada no PDV (App ou Web) com cliente avulso/offline ou `customer_id` zero/nulo:
1. O backend captura o `customer_name` e `customer_document` informados na venda.
2. Verifica se o cliente já existe na empresa por CPF/CNPJ ou Nome exato.
3. Se não existir, cadastra automaticamente um novo cliente em `crm_customer` com status ativo (`ACTIVE`), tipo PF/PJ e documento informado (ou gerado `PDV-UUID`).
4. Vincula a venda (`pos_sale.customer_id`) ao cliente recém-cadastrado/existente.
5. Permite controle e rastreamento completo em relatórios gerenciais e dashboards por cliente.

## Comandos de Deploy
```bash
# 1. No servidor de produção (64.23.182.183):
cd /var/www/cronuz
git pull origin main
systemctl restart cronuz-backend

# 2. Validação:
curl -s -o /dev/null -w 'Backend Status: %{http_code}\n' http://localhost:8000/docs
```

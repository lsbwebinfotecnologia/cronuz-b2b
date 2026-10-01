# Deploy: Correção do COD_CLI da Credencial Dropship no Hórus (LAP / LFT)

## 📌 Contexto
Ao enviar o pedido de venda para o Hórus, as chamadas para `AltStatus_Pedido` (LAP) e `Pular_expedicao` (LFT) usavam fixamente o `config.horus_customer_cod_cli` (que pertencia à Ivanilza - `78426`), mesmo para pedidos de outras credenciais (ex: Erdos Bookstore - Natan). Com isso, o Hórus não localizava o pedido ou dizia que ele não possuía itens para aquele cliente.

## 🛠️ Alterações
1. **`backend/app/api/dropship.py`**:
   - `send_order_to_horus`: Agora prioriza o `horus_customer_cod_cli` da credencial do pedido. Se vazio, consulta a API do Hórus via CPF/CNPJ de `customer_erdos` e grava em `cred.horus_customer_cod_cli`.
   - `create_credential` e `update_credential`: Atualizados para resolver automaticamente o `horus_customer_cod_cli` na API do Hórus caso não informado.
2. **Banco de Dados (Produção)**:
   - Script `deploy/update_bookstore_cod_cli.sql` atualiza a credencial ID 2 (Erdos - bookstore) com `horus_customer_cod_cli = '78787'`.

## 🚀 Execução em Produção
```bash
# 1. Atualizar banco de dados
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/update_bookstore_cod_cli.sql

# 2. Reiniciar backend
systemctl restart cronuz-backend

# 3. Validar
curl -s -o /dev/null -w 'Backend: %{http_code}\n' http://localhost:8000/dashboard/metrics -H 'Authorization: Bearer test'
```

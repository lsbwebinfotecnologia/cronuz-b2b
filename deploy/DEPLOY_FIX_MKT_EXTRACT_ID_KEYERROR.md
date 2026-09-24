# Deploy: Correção de Extração de ID MKT (KeyError: 0) e Conciliação do Pedido #19620

## 1. Descrição do Problema
Ao enviar um pedido para o WMS MKT em produção, a tela exibia a mensagem:
`"Erro ao enviar pedido para logística: 0"` com status HTTP 500.

### Causa Raiz:
No arquivo `backend/app/api/logistics.py`, na função `_extract_legado_id`:
Dentro do bloco `if isinstance(res, dict):`, havia uma instrução `val = res[0].get(...)`. Como `res` era um dicionário retornado pela API MKT e a chave inteira `0` não existia nele, o Python lançou uma exceção `KeyError: 0`. No bloco de tratamento de exceções, `str(e)` de um `KeyError(0)` converte-se literalmente na string `"0"`.

### O que de fato ocorreu na MKT:
A API da MKT **recebeu o pedido com sucesso** e gerou a remessa no armazém sob o código:
- **Pedido:** `#19620` (Filial 2, Cliente 19024)
- **Remessa MKT:** `#750549`
- **Movimento MKT:** `#1345793`

O erro ocorreu no momento seguinte, quando o backend tentou extrair o ID da resposta para salvar na tabela `logistics_orders`.

---

## 2. Correções Realizadas no Código
1. **`backend/app/api/logistics.py`**:
   - Corrigido `_extract_legado_id` para não tentar acessar índice numérico em dicionários.
   - Adicionada verificação de lista (`elif isinstance(res, list)`).
   - Melhorado o tratamento de erro em `send_to_logistics` adicionando `exc_info=True` no logger e mensagem amigável caso ocorra `KeyError`.
2. **`backend/app/integrators/logistics/mkt_provider.py`**:
   - Verificação de erros no corpo JSON mesmo quando o status code for HTTP 200.
3. **`backend/app/jobs/logistics_send_job.py`**:
   - Reutilização da função `_extract_legado_id` unificada de `app.api.logistics`.
4. **`tests/test_wms_sync.py`**:
   - Adicionados testes automatizados cobrindo dicionários arbitrários sem a chave de ID (garantindo ausência de `KeyError: 0`).

---

## 3. Comandos para Deploy em Produção (Quando Autorizado)

```bash
# 1. Atualizar repositório no servidor de produção
cd /var/www/cronuz && git pull origin main

# 2. Reiniciar o backend
systemctl restart cronuz-backend

# 3. Conciliar o pedido #19620 no banco de produção
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -c "
UPDATE logistics_orders 
SET situation = 'IN_LOGISTICS', 
    id_ord_sys_log = '750549', 
    error_log = NULL, 
    sent_at = NOW(),
    updated_at = NOW()
WHERE cod_ped_venda = 19620 AND company_id = 22;
"
```
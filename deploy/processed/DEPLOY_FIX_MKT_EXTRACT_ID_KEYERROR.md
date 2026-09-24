# Deploy: Correção e Melhoria no Fluxo de Envio para WMS MKT e Horus

## 1. Descrição das Melhorias Implementadas
1. **Alteração do Status do Horus para `IMP` após Envio**:
   - Assim que um pedido é enviado com sucesso ao WMS MKT, o sistema agora chama `AltStatus_Pedido(STA_PEDIDO="IMP")` no Horus ERP.
   - Isso faz com que o pedido saia imediatamente da fila de `LEX` no Horus, evitando que seja reprocessado ou consultado novamente como pendente de envio.
2. **Proteção Contra Reenvio / Detecção Automática de Pedidos Já Integrados**:
   - Tanto no job automático quanto no envio manual, antes de tentar criar um novo movimento ou consultar dados pesados, o sistema executa uma checagem pontual por referência (`get_order_by_ref`).
   - Se o pedido já tiver uma remessa criada no WMS MKT (como ocorreu com o pedido #19620), o sistema:
     - Vincula imediatamente a remessa (ex: `#750549`);
     - Atualiza a situação para `IN_LOGISTICS`;
     - Altera o status do pedido no Horus para `IMP`;
     - Evita qualquer duplicidade de envio ou erro.
3. **Correção do Bug `KeyError: 0`**:
   - Eliminado o acesso indevido por índice numérico em dicionários dentro de `_extract_legado_id`.

---

## 2. Comandos para Deploy em Produção (Quando Autorizado)

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
    status_horus = 'IMP',
    error_log = NULL, 
    sent_at = NOW(),
    updated_at = NOW()
WHERE cod_ped_venda = 19620 AND company_id = 22;
"
```
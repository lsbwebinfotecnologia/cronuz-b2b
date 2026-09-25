# Roteiro de Deploy: Otimização da Rotina de Conferência (WMS MKT) e Faturamento

Este documento detalha as alterações implementadas para tornar a rotina de conferência de pedidos do WMS MKT e integração com o Hórus ERP rápida, segura, anti-rate limit e 100% aderente aos endpoints oficiais de API do ERP.

---

## 📋 Resumo das Mudanças

1. **Consulta Leve no WMS MKT (Anti-Rate Limit)**:
   - Janela de data limitada a **no máximo 3 dias** (`now - 3 dias`), correspondente ao início da migração.
   - Requisição única no WMS (`max_pages=1`) com `situacao="aguardando_nfe"`, eliminando sobrecarga e evitando o erro HTTP 429 (*Too Many Requests*).
   - Implementado delay preventivo e retry com backoff caso o WMS retorne 429.

2. **Extração Precisa da Quantidade Real Bipada**:
   - Correção na leitura da estrutura de itens do WMS MKT:
     - Extrai `abs(float(item["MovimentoItensPedido"][0]["quantidade_bom"]))`, garantindo a conferência da quantidade exata de cada item (ex: 6, 96, 40 unidades), eliminando o fallback indevido para 1.

3. **Conferência Completa e Mudança para LFT via API do Hórus**:
   - Em vez de manipulação manual de banco ou pular etapas, a rotina executa o ciclo oficial da API do ERP:
     1. `ConfereItem_Pedido`: Confere cada item com a quantidade exata bipada e o local de estoque apropriado (15 para filial 2, 9 para filial 1).
     2. `InsVolume_Pedido`: Registra o peso e volumes apurados no WMS.
     3. `AltStatus_Pedido(STA_PEDIDO="LFT")`: Altera o status do pedido para Liberado para Faturamento (**`LFT`**).

4. **Tratamento Simultâneo de Pedidos `FAT` (Faturados)**:
   - Na mesma leitura de pedidos do WMS, se o pedido no Hórus já estiver com `STATUS_PEDIDO_VENDA == 'FAT'`, a rotina já recupera a nota fiscal (`Busca_NotaFiscal` com `XML_BASE64='S'`), decodifica o XML e envia a NFe para o WMS (`/remessa_pedido/faturar.json`), atualizando o status local para `INVOICED`.

---

## 🗄️ Alterações de Banco de Dados (PostgreSQL)

- **Nenhuma alteração de DDL** necessária neste deploy. A tabela `logistics_orders` já suporta os status `CHECKED`, `INVOICED`, `status_horus` e `id_ord_sys_log`.

---

## 🚀 Passos para Deploy em Produção

```bash
# 1. Conectar no servidor de produção
ssh root@64.23.182.183

# 2. Atualizar repositório
cd /var/www/cronuz
git pull origin main

# 3. Reiniciar backend
systemctl restart cronuz-backend

# 4. Validar backend (HTTP 200)
curl -s -o /dev/null -w "Backend: %{http_code}\n" http://localhost:8000/docs
```

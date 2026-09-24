# 📦 Deploy: Sincronização & Conciliação com WMS (MKT) e Normalização de CEP

## 📭 Resumo das Alterações
1. *normalizacao de CEP*: Como o Hórus ignora zeros à esquerda, o Cronuz aplica zfill(8) e máscara 00000-000 na validação e envio.
2. *Extração do ID (_extract_legado_id)*: Leitura robusta do legado_pedido_id da MKT.
3. *Endpoint POST /companies/{company_id}/logistics/sync-from-wms*: Sincroniza remessas do WMS com o Cronuz evitando duplicidade em produção.
4. *Frontend Mobile First*: Botão "Sincronizar WMS" e modal de conciliação com filtro por período.

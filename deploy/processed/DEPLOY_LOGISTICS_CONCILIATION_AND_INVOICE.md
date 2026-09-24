# Roteiro de Deploy — Conciliação de Fila de Envio, Novos Contadores e Envio de NFe

## 📋 Resumo das Alterações
1. **Fila de Envio Contínua (`logistics_send_job.py`)**:
   - Correção do gargalo que travava o envio nos 20 primeiros pedidos antigos.
   - Implementada conciliação prévia em memória com o banco local (`cmp_logistics_orders`), filtrando pedidos já enviados (`IN_LOGISTICS`, `CHECKED`, `INVOICED` ou com `id_ord_sys_log`).
   - Suporte completo a paginação no Horus ERP:
     - Se `horus_legacy_pagination = True`: varre a lista completa de LEX e filtra em memória pegando os 20 pendentes reais.
     - Se `horus_legacy_pagination = False`: itera páginas de 50 em 50 com `OFFSET` e `LIMIT` no Horus até obter os 20 próximos pedidos pendentes reais.
2. **Envio de Nota Fiscal / Faturamento (`logistics_invoice_job.py`)**:
   - Criada a rotina de envio de NFe para a logística MKT:
     - Detecta pedidos locais conferidos (`CHECKED` / `IN_LOGISTICS`) que viraram `FAT` no Horus ERP.
     - Consulta `Busca_NotaFiscal` no Horus com `XML_BASE64="S"`.
     - Extrai chave de acesso, número, série, data e faz o parse do XML para coletar a transportadora.
     - Envia `PUT /remessa_pedido/faturar.json` para o WMS MKT.
     - Registra `key_nfe`, `nfe_number`, `invoiced_at` e atualiza `situation = 'INVOICED'`.
   - Adicionado endpoint `POST /companies/{company_id}/logistics/process-invoice` para disparo manual imediato.
   - Encadeada execução automática no ciclo de conferência (`logistics_check_job.py`).
3. **Otimização na Conferência (`process-check`)**:
   - Adicionado skip antecipado de pedidos já conferidos ou faturados localmente (`CHECKED`/`INVOICED`), poupando requisições ao Horus.
4. **Novos Contadores e Filtros no Dashboard (`logistica-logs`)**:
   - Adicionados os contadores solicitados:
     - **Com Nº Logística**: pedidos que possuem `id_ord_sys_log` preenchido (`stats.with_wms_id`).
     - **Em LFT (Conferidos)**: pedidos conferidos e liberados para faturamento no ERP (`stats.lft`).
   - Abas rápidas para filtrar por "Com Nº Logística" e "Em LFT".
   - Botão de ação rápida "Enviar NFe (FAT)" no painel de logs.
   - Layout Mobile First preservando a experiência desktop.

---

## 💾 Banco de Dados
- Não houve alterações de DDL (todas as colunas necessárias já existem na tabela `logistics_orders`).

---

## 🚀 Passos para Deploy em Produção (quando autorizado):
```bash
# 1. Conectar via SSH no servidor
ssh root@64.23.182.183

# 2. Atualizar código
cd /var/www/cronuz && git pull origin main

# 3. Build do Frontend
cd /var/www/cronuz/frontend && npm run build
pm2 restart cronuz-frontend

# 4. Reiniciar Backend
systemctl restart cronuz-backend

# 5. Validação com curl
curl -s -o /dev/null -w 'Backend: %{http_code}\n' http://localhost:8000/docs
curl -s -o /dev/null -w 'Frontend: %{http_code}\n' http://localhost:3000
```

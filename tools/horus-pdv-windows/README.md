# 🛒 Horus PDV — Frente de Caixa Omnichannel (Online & Offline) para Windows

Aplicativo Desktop Windows (`.exe` standalone com a logo oficial do Horus) integrado à arquitetura de **Ponto de Venda (PDV)** do **Cronuz B2B / Horus ERP**.

Projetado para operar **100% Online e Offline** (lojas físicas, feiras literárias, eventos externos ou contingência de internet), mantendo o vínculo permanente com o **Usuário (Operador/Seller)** e a **Sessão de Caixa (`session_id`)** para sincronização centralizada e futura migração das vendas ao **Horus ERP via API**.

---

## 🚀 Principais Funcionalidades

1. **Operação Híbrida (Online & Offline Transparente)**:
   - **Catálogo Local (`pos_catalog_cache.json`)**: Consulta instantânea (`< 1ms`) por leitor de código de barras (ISBN/EAN), código Horus (`COD_ITEM`) ou título.
   - **Busca em Tempo Real no Horus ERP**: Quando online, caso um item bipado não esteja no cache local, o aplicativo consulta automaticamente o endpoint `/companies/{company_id}/pos/realtime-search` no Horus ERP e já armazena o produto no cache local para as próximas vendas.
2. **Fila Resiliente Offline & Sincronização com Usuário/Sessão (`POST /pos/sync-sales`)**:
   - Toda venda finalizada (`F12`) recebe um identificador único universal (`client_sale_uuid`) que garante **idempotência total** (nunca duplica vendas mesmo que a conexão oscile durante o envio).
   - Se estiver **Online**, a venda é sincronizada imediatamente em segundo plano com a sessão ativa.
   - Se estiver **Offline**, a venda fica gravada em `pos_sales_local.json` vinculada ao `session_id` e `user_email` configurados.
   - Assim que a internet retorna (sincronização automática a cada 45 segundos ou pelo botão **"☁️ Sincronizar Vendas Offline Agora (F5)"**), todas as vendas pendentes sobem em lote para a Sessão e Usuário configurados na API, permitindo que você trabalhe posteriormente na **migração dessas vendas para o Horus ERP via API**.
3. **Geração de Relatórios (Local & Servidor)**:
   - **📊 Exportar CSV/Excel Analítico (Itens p/ Horus)**: Gera planilha `.csv` (UTF-8 com BOM, abre direto no Excel) com cada item vendido, contendo `UUID_VENDA`, `NUMERO_VENDA`, `SESSAO_ID`, `OPERADOR_EMAIL`, `STATUS_SINCRONIZACAO`, `COD_ITEM_HORUS_SKU`, `ISBN_CODIGO_BARRAS`, `QUANTIDADE`, `PRECO_UNITARIO_BRL`, `DESCONTO_VENDA_BRL` e `TOTAL_LIQUIDO_VENDA_BRL`.
   - **🖨️ Relatório de Fechamento de Caixa (HTML Imprimível)**: Resumo executivo da sessão por forma de pagamento, KPIs de vendas sincronizadas vs. pendentes e auditoria completa.
   - **📥 Relatórios Oficiais do Servidor (`.xlsx` e `.pdf`)**: Download direto dos relatórios analíticos processados pela API (`/companies/{company_id}/pos/reports/sales`).
4. **Cupom Não-Fiscal Térmico (80mm)**:
   - Emissão automática ou sob demanda (duplo clique na venda) em formato térmico de 80mm pronto para impressão.
5. **Sincronização Incremental de Catálogo por Sequência Horus (`COD_ITEM_INI` a `COD_ITEM_FIM`)**:
   - Na aba **📦 3. Sessão & Catálogo Offline (Range Horus)**, o operador pode baixar/atualizar o acervo diretamente do Horus ERP informando o código inicial (`COD_ITEM_INI`), código final (`COD_ITEM_FIM`) e o passo por lote (ex: de `500` em `500` códigos).
   - Respeita automaticamente a configuração **`OFFSET/LIMIT` (`horus_legacy_pagination`)** cadastrada no Painel Master para aquele Seller.
   - Salva o histórico de faixas sincronizadas em `pos_catalog_sync_state.json` (incluindo o último código sincronizado e data/hora de cada lote), permitindo continuar da próxima sequência (`⏭️ Próxima Sequência (+Novos)`) ou recarregar apenas as faixas antigas com mais de 24h (`♻️ Recarregar Faixas Antigas`).
6. **Licenciamento Seguro e Controle de Validade pelo Painel Master (`HPDV1`)**:
   - O uso do `HorusPDV.exe` e da rotina de sincronização por range Horus é protegido por uma **Chave de Licença Criptográfica (`HPDV1.<payload>.<hmac_sha256>`)** com data de validade controlada pelo Master (`/companies/[id]/modules`).
   - Ao abrir o PDV (ou clicar em **"🔄 Buscar / Atualizar Chave Liberada no Painel Master"** na aba 4), o sistema busca automaticamente a chave liberada pelo Master e valida a assinatura e data de vencimento tanto online quanto offline (com trava anti-recuo de relógio do Windows).

---

## 🛠️ Como Gerar o `HorusPDV.exe` no Windows (Apenas 1 Vez)

1. Copie a pasta `horus-pdv-windows` (ou extraia o arquivo `Horus_PDV_Windows.zip`) em uma máquina Windows com Python 3.10+ instalado.
2. Dê dois cliques em **`GERAR_EXECUTAVEL_PDV_WINDOWS.bat`**.
3. O script limpará caches antigos e gerará o arquivo **`HorusPDV.exe`** com o ícone oficial do Horus embutido.
4. Depois de gerado, você pode distribuir apenas o **`HorusPDV.exe`** para qualquer computador Windows de caixa (não precisa instalar Python nos terminais de venda).

---

## ⌨️ Atalhos Rápidos de Teclado no Caixa

| Tecla | Ação |
|---|---|
| **`F2`** | Focar no campo de leitura de Código de Barras / ISBN |
| **`Enter`** | Bipar / Pesquisar produto e adicionar ao carrinho |
| **`F4`** | Limpar carrinho atual |
| **`F5`** | Sincronizar vendas offline pendentes com a Sessão no servidor |
| **`F12`** | Finalizar Venda |

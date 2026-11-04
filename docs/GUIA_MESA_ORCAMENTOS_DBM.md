# 📘 Guia de Regras e Operação — Mesa de Orçamentos & Propostas DBM (`/proposals/desk`)

Este documento resume de forma direta e autoexplicativa todas as regras de negócio, classificações de abas, filtros de estoque e atalhos operacionais da **Mesa de Orçamentos DBM**.

---

## 1. Sequência Oficial das Abas (Fluxo de Trabalho)
As abas da mesa seguem a ordem exata de construção do orçamento comercial:
1. **Pedidos**: Itens solicitados diretamente pelo cliente (via importação de Excel `.xlsx`/`.xls`/`.csv`, PDF, texto/e-mail ou digitação rápida por teclado).
2. **Reposição**: Coleta sob demanda (botão **Buscar**) dos itens com **Saldo Consignado ativo no cliente (via API Hórus)** somados ao **histórico de itens vendidos ao cliente nos últimos `X` dias**.
3. **Novidades**: Títulos cuja data de lançamento está dentro da janela de **9 meses atrás (`-9m`) até 6 meses à frente (`+6m`)**.
4. **Fundo de Catálogo**: Títulos de giro consolidado fora da janela de novidades.
5. **Último Acerto / Venda**: Consulta sob demanda dos itens da última Nota Fiscal de **Acerto** (`CFOP 5113, 5114, 6113, 6114`) ou da **Última Venda Firme** (`NF_ITENS` / `NF_MESTRE`).
6. **Pedido Consolidado**: Visão unificada final contendo todos os itens da aba **Pedidos** somados a todos os itens marcados com **✓ Adicionado** nas abas de sugestão.

---

## 2. Regra de Exclusividade Entre Abas (Sem Duplicidade)
Para evitar retrabalho ou análise duplicada do mesmo livro em abas diferentes:
* **Nenhum ISBN se repete entre as abas de classificação** (`Pedidos`, `Reposição`, `Novidades`, `Fundo de Catálogo` e `Último Acerto / Venda`).
* Se um item já está no **Pedido** (lido de planilha/PDF ou digitado), ele **não aparece** em `Reposição`, `Novidades`, `Fundo` ou `Último Acerto`.
* Se um item pertence a **Novidades**, ele **não se repete** em `Reposição`, `Fundo de Catálogo` ou `Último Acerto`.
* Se um item é carregado em **Reposição**, ele é automaticamente filtrado de `Fundo de Catálogo` e `Último Acerto`.
* A única aba que unifica todas as origens é o **Pedido Consolidado**.

---

## 3. Regra de Saldo de Estoque Disponível
* Nas abas **Reposição**, **Novidades**, **Fundo de Catálogo** e **Último Acerto / Venda**, **nunca são exibidos itens com saldo de estoque zerado (`Estoque <= 0`)**.
* Apenas a aba **Pedidos** (e o **Consolidado** para itens oriundos do Pedido) exibe itens com estoque zerado (`✗ Falta`), permitindo identificar rupturas no pedido original enviado pelo cliente.

---

## 4. Aba Reposição — Botão `Buscar` + Parâmetro Discreto de Dias (`Base Vendas: Xd`)
* Ao clicar no botão **`Buscar`** dentro da aba **Reposição**, o backend executa uma consulta híbrida:
  1. **Saldo Consignado via API Hórus** (`Busca_Contrato_Cliente_Analitico`): coleta todos os títulos que possuem saldo consignado em poder do cliente (`SALDO_ITENS > 0`).
  2. **Histórico de Vendas do Cliente nos Últimos `X` Dias**: cruza as notas de venda/acerto faturadas para o cliente nos últimos `X` dias.
* O parâmetro **`Base Vendas: Xd`** (padrão `90 dias`) fica disponível de forma discreta ao lado do botão `Buscar` e permanece salvo para o usuário logado.

---

## 5. Seleção em Lote, Botão Único `Adicionar` (Qtd = `0`) e Marcação `✓ Adicionado`
* Nas abas `Reposição`, `Novidades`, `Fundo de Catálogo` e `Último Acerto / Venda`:
  * É possível marcar itens **individualmente** (checkbox na primeira coluna) ou clicar em **`Selecionar Todos`**.
  * Ao clicar no botão único **`Adicionar`**, todos os itens selecionados:
    1. Recebem a marcação visual **`✓ Adicionado`** na própria aba de origem.
    2. São enviados imediatamente para a aba **`Pedido Consolidado`**.
    3. Entram com o campo **`Quantidade = 0` (`Qtd: 0`)**, evitando quantidades automáticas indesejadas (como `12`) e permitindo que o operador digite apenas as quantidades desejadas.

---

## 6. Tecla `Delete` para Limpeza de Pesquisa
* Nas abas **Reposição**, **Novidades**, **Fundo de Catálogo** e **Último Acerto / Venda**, ao selecionar uma linha (ou marcar vários itens) e pressionar a tecla **`Delete`** no teclado, o sistema **elimina aquele(s) item(ns) daquela pesquisa**.

---

## 7. Experiência Excel na Grade (Largura de Colunas, Ordenação e Ocultação)
* **Coluna `Assunto` Dedicada**: O campo `Assunto` possui coluna própria ao lado de `Título`, permitindo leitura rápida, redimensionamento e ordenação de `A → Z`.
* **Largura de Colunas Redimensionável e Salva por Usuário**: Arraste a divisória direita de qualquer cabeçalho da grade (`↔`) para aumentar ou diminuir a largura da coluna. As medidas ficam salvas automaticamente no navegador vinculadas ao usuário logado.
* **Ordenação em Todas as Colunas**: Clique no cabeçalho de qualquer coluna para ordenar (`A → Z` / `Z → A` em colunas de texto; `Maior → Menor` / `Menor → Maior` em colunas numéricas).
* **Ocultar / Exibir Colunas (`ISBN`, `Capa`, `Desconto`)**: Na barra superior da grade, utilize os botões rápidos **`Colunas: [ISBN] [Capa] [Desconto]`** para ligar ou desligar essas colunas em todas as abas.

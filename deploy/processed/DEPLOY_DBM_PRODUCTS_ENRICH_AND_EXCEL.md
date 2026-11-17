# Deploy: Enriquecimento Automático de Ficha DBM (Horus + Capas) e Importação de Planilha (Itens + Tiragens)

## 1. Alterações de Estrutura no Banco de Dados (PostgreSQL)

Execute os comandos abaixo no banco de dados `cronuz_b2b` (ou deixe o Auto-DDL do `main.py` aplicar automaticamente no restart do serviço):

```sql
ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS consignment_stock INTEGER DEFAULT 0;
ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS sales_90 INTEGER DEFAULT 0;
ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS sales_365 INTEGER DEFAULT 0;
```

## 2. Resumo das Funcionalidades Incluídas
1. **Capa do Produto na Ficha DBM (`/dbm/products`)**:
   - Carrega `cover_image_base_url` e `cover_image_secondary_base_url` das configurações do seller e aplica a mesma cascata de fallback do Storefront B2C (`cover_url` -> `cover_image_base_url/<isbn>.jpg` -> `cover_image_secondary_base_url/<isbn>.jpg` -> `/uploads/covers/<company_id>/<isbn>.jpg`).
2. **Saldo Consignado, Disponível e Estoque Total abaixo da Capa**:
   - Exibe **Disponível**, **Consignado** e **Estoque Total (`Disponível + Consignado`)** no card **Indicadores Horus** abaixo da capa.
3. **Auto-enriquecimento e Auto-salvamento ao Abrir a Ficha (`POST /dbm/products/{product_id}/enrich-from-horus`)**:
   - Ao abrir qualquer livro na ficha de cadastro do DBM, busca automaticamente no Horus (SQL + API `Busca_Acervo`) os campos faltantes (peso, largura, altura, páginas, unidades/caixa, sinopse, autor, editora, assunto, capa) e atualiza o saldo disponível, saldo consignado (`VW_ITENS_CONSIGNACAO`) e giro (`90d`/`12m`), persistindo imediatamente em `prd_product`.
4. **Cálculo Automático do Vencimento do Contrato Autoral**:
   - Ao preencher a **Data de Assinatura** (`dd/mm/aaaa` com máscara automática ou `yyyy-mm-dd`) e a quantidade de **Anos**, calcula e preenche automaticamente o campo **Vencimento** (`dd/mm/aaaa`).
5. **Importação de Planilha Excel de 2 Abas (`POST /dbm/products/import-excel-lancamentos`)**:
   - Lê a planilha Excel com 2 abas (`Planilha1` com os itens + `TIRAGENS` com as tiragens), cruza os itens por `ISBN` / `CodProdHorus`, atualiza os dados do produto (incluindo `LinkGGbrasil` -> `external_link`, `Data_Contrato`, `Anos_Validade`, `perc_royalties_ebook`, dimensões, peso em gramas, lançamento) e vincula todas as tiragens da aba `TIRAGENS` (`Cod_Prod == cod_prod`) na grade de tiragens do livro.

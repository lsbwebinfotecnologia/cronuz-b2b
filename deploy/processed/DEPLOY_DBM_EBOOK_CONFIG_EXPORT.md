# Roteiro de Deploy — DBM: Flag `is_ebook`, Totais de Propostas, Exportação Excel e Configurações de Pesquisa

## 1. Alterações de Banco de Dados (PostgreSQL)

Nova coluna booleana `is_ebook` adicionada na tabela `prd_product` para identificar obras digitais/e-books no cadastro de produtos DBM (`/dbm/products`) e permitir ocultá-las nas pesquisas do módulo DBM (`/proposals/desk` e `/dbm/products`).

### Comando DDL (PostgreSQL):
```sql
ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS is_ebook BOOLEAN NOT NULL DEFAULT FALSE;
```

> **Nota**: O comando acima também foi adicionado no bloco de `Auto-DDL` na inicialização do `backend/main.py`, garantindo aplicação automática ao reiniciar o serviço `cronuz-backend`.

---

## 2. Resumo das Alterações de Código

1. **Backend (`backend/app/models/product.py`, `backend/app/schemas/product.py`, `backend/main.py`)**:
   - Adicionado atributo `is_ebook` na model `Product` e schemas `ProductBase`/`ProductUpdate`/`ProductResponse`.
2. **Backend (`backend/app/api/dbm.py`)**:
   - Cálculo automático de totais (`total_titles`, `total_requested_qty`, `total_approved_qty`, `total_cover_value`, `total_net_value`, `average_discount`) a partir de `items_json` ao salvar e listar propostas em `/dbm/proposals`.
   - Suporte aos filtros `hide_ebooks` e `hide_out_of_print` nas rotas de catálogo e pesquisa da Mesa de Orçamentos DBM (`/dbm/proposals-desk/catalog-tabs`, `/dbm/proposals-desk/replenishment-items`, `/dbm/proposals-desk/last-operation-items` e `/dbm/proposals-desk/product-lookup`).
3. **Frontend (`/dbm/products`, `/proposals/desk`, `/dbm/proposals`)**:
   - `/dbm/products`: Removida a coluna `2º ISBN / E-book` da grade principal de produtos; adicionado checkbox `É E-book / Livro Digital` (`is_ebook`) junto à marcação `Obra Esgotada / Fora de Linha` (`is_out_of_print`) na ficha de cadastro e filtro rápido na grade.
   - `/proposals/desk`: Opção nas configurações para ocultar o campo `DESC%` da barra de Digitação Rápida; configuração geral para não mostrar E-books (e esgotados) nas pesquisas; botão de exportação para Excel (`.xlsx`) exclusivo do Pedido Consolidado com as colunas `ISBN`, `Título`, `Quantidade`, `Assunto` e `Origem`.
   - `/dbm/proposals`: Exibição dos totais reais de cada orçamento na listagem e botão rápido para exportar o Pedido Consolidado em Excel.

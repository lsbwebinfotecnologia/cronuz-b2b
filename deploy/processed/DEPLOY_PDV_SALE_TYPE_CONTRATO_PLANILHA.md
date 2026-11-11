# Deploy: PDV — Tipo de Venda (Cupom / NF-e), Validação de CPF/CNPJ, Sincronização de Contrato Consignação, Planilha Modelo com Editora e Isolamento de Sessão por Seller

## 1. Alteração no Banco de Dados (PostgreSQL)

Execute o comando DDL abaixo no banco `cronuz_b2b` antes de reiniciar o backend:

```sql
ALTER TABLE pos_sale
ADD COLUMN IF NOT EXISTS sale_type VARCHAR(20) NOT NULL DEFAULT 'CUPOM';
```

### Comando completo para Produção:
```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -c "ALTER TABLE pos_sale ADD COLUMN IF NOT EXISTS sale_type VARCHAR(20) NOT NULL DEFAULT 'CUPOM';"
```

---

## 2. Resumo das Alterações de Código

1. **Validação e Busca dos Itens de Contrato (`CONSIGNMENT`) na Frente de Caixa**:
   - Correção na sanitização de CNPJ (`cnpj_destino` e `cnpj_cliente`) em `HorusClients.get_consignment_details`.
   - Suporte a busca do cliente por ID, CPF/CNPJ ou Código Horus (`COD_CLI`), com resolução automática do `ID_GUID` no Horus caso não esteja salvo localmente.
   - Validação de falhas retornadas pelo Horus (`Falha` / `FALHA == 'S'`) com mensagem transparente ao operador, cálculo de saldo real (`SALDO_ITENS` ou `QTD_ATENDIDA - QTD_FATURADA - QTD_DEV_FAT`) e pré-visualização/validação do contrato no modal de Carga de Catálogo do PDV.
2. **Planilha Modelo com Nome da Editora (`Editora`)**:
   - Novo endpoint `GET /companies/{company_id}/pos/spreadsheet-template` e botão **"Baixar Planilha Modelo (.xlsx)"** no modal de carga do PDV com as colunas: `ISBN` | `Título` | `Editora` | `Preço` | `Estoque`.
   - Leitura dinâmica da coluna `Editora` (`EDITORA`, `MARCA`, `PUBLISHER`, `SELO`) no upload de planilhas `.xlsx` e `.csv`.
3. **Novo Campo `Tipo de Venda do PDV` (`CUPOM` ou `NFE`) + Validação de `CPF / CNPJ`**:
   - Inclusão de seletor **Cupom | NF-e** e campo de **CPF / CNPJ** no momento da venda (tanto na barra superior quanto no modal de Finalizar Venda / Checkout).
   - Validação matemática de CPF (11 dígitos) e CNPJ (14 dígitos), **permitindo explicitamente `99999999999` e `00000000000`** (além de `99999999999999` / `00000000000000`) e bloqueando documentos inválidos.
4. **Isolamento Estrito de Sessão por Seller (`company_id`) e Limpeza Automática de Itens Offline**:
   - Garantia de que o operador só visualize e selecione sessões pertencentes ao `company_id` ativo.
   - Caso haja no navegador (IndexedDB / localStorage) uma sessão ativa ou itens de catálogo offline pertencentes a outro seller/empresa, o PDV remove automaticamente a sessão indevida e limpa os itens guardados em cache offline (`pdv_catalog`).

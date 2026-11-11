# Deploy: B2C - Venda de Itens com Saldo Zero (Validação de Situação Horus `FC` / `FE`) e Persistência de `horus_situacao_item`

## 1. Alteração de Banco de Dados (PostgreSQL)

Execute o comando DDL abaixo no banco PostgreSQL de produção (`cronuz_b2b`) para adicionar a coluna `horus_situacao_item` na tabela `prd_product` (caso ainda não tenha sido criada automaticamente pela rotina de sincronização):

```sql
ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS horus_situacao_item VARCHAR(20);
CREATE INDEX IF NOT EXISTS ix_prd_product_horus_situacao_item ON prd_product (horus_situacao_item);
```

### Comando direto no servidor de produção:
```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -c "ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS horus_situacao_item VARCHAR(20); CREATE INDEX IF NOT EXISTS ix_prd_product_horus_situacao_item ON prd_product (horus_situacao_item);"
```

## 2. O que esta atualização contempla
1. **Persistência da Situação do Item do Horus (`horus_situacao_item`)**:
   - Na sincronização de produtos entre Horus ERP (`Busca_Acervo` / `Busca_AcervoB2B`) e Cronuz (`prd_product`), o campo `SITUACAO_ITEM` (ex.: `NO`, `NL`, `LA`, `IP`, `ES`, `FC`, `FE`) passa a ser salvo de forma estruturada e segura em `prd_product.horus_situacao_item`.
2. **Configuração B2C: Permitir Venda de Itens com Saldo Zero (Exceto `FC` ou `FE`)**:
   - Nova opção configurável por seller no Painel B2C (`Configurações` e `Produtos -> Sincronizar do Horus`): **`allow_zero_balance_sale`**.
   - Quando ativa:
     - Produtos com `stock_quantity == 0` cuja situação no Horus **não seja `FC` (Fora de Catálogo) nem `FE` (Falta na Editora / Fora de Estoque)** ficam com `allow_purchase = True` (`Disponível sob encomenda`), exibindo o botão **Comprar** na vitrine B2C e permitindo a finalização do pedido no Checkout B2C.
     - Produtos cuja situação no Horus seja **`FC` ou `FE`** (e sem saldo disponível) permanecem bloqueados para compra (`allow_purchase = False`), exibindo **Avise-me**.

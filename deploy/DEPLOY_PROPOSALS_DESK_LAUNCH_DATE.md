# Roteiro de Deploy — Mesa de Orçamentos DBM (`launch_date` em `prd_product`)

## 1. Alterações de Banco de Dados (PostgreSQL)

Adicionada a coluna `launch_date` na tabela `prd_product` para armazenar a data de lançamento sincronizada do Horus ERP (`ITENS_ESTOQUE_GERAL` / `Busca_AcervoB2B`) e permitir o filtro da janela de **Novidades (-9 meses até +6 meses)** na Mesa Comercial / Orçamentos DBM.

### Script SQL para Produção:
```sql
ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS launch_date TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS ix_prd_product_launch_date ON prd_product (launch_date);
```

### Comando de Execução no Servidor de Produção (`64.23.182.183`):
```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -c "ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS launch_date TIMESTAMP WITH TIME ZONE; CREATE INDEX IF NOT EXISTS ix_prd_product_launch_date ON prd_product (launch_date);"
```

## 2. Arquivos Modificados
- `backend/app/models/product.py`: Inclusão da coluna `launch_date` no modelo `Product`.
- `backend/app/api/horus_sql.py`: Sincronização de `data_lancamento` e `qtd_caixa` a partir do Horus SQL Server (`ITENS_ESTOQUE_GERAL`).
- `backend/app/api/dbm.py`: Novos endpoints híbridos da Mesa Comercial / Orçamentos DBM (`/dbm/proposals-desk/customer-context/{customer_id}`, `/dbm/proposals-desk/catalog-tabs`, `/dbm/proposals-desk/last-operation-items`, `/dbm/proposals-desk/product-lookup`).
- `frontend/src/app/(dashboard)/proposals/desk/page.tsx`: Integração híbrida ao selecionar cliente, barra dinâmica de digitação manual por teclado, regra de Novidades (-9m a +6m) com selo de expiração e seletor sob demanda de Último Acerto vs Última Venda.

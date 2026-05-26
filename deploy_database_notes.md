# Notas de Deploy - Fornecedores Bookinfo (CNPJ Sem Máscara e Filtros do Horus)

## Alterações de Banco de Dados / DDL no PostgreSQL
Adicionamos novas colunas à tabela `spl_supplier` para suportar a busca de pedidos no Horus para cada fornecedor. Execute as seguintes instruções SQL no banco de dados de produção:

```sql
-- Adiciona as novas colunas à tabela spl_supplier se não existirem
ALTER TABLE spl_supplier 
ADD COLUMN IF NOT EXISTS status_pedido_compra VARCHAR(20) DEFAULT 'AE';

ALTER TABLE spl_supplier 
ADD COLUMN IF NOT EXISTS integrador_compra VARCHAR(50) DEFAULT 'HORUS';

ALTER TABLE spl_supplier 
ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE;
```

## Ajuste Recomendado de Dados Legados (Opcional)
Se houver CNPJs cadastrados com formatação ou máscara (como `.`, `/`, `-`), execute o script a seguir para limpá-los:

```sql
UPDATE spl_supplier
SET 
  document_origin = REGEXP_REPLACE(document_origin, '\D', '', 'g'),
  document_destination = REGEXP_REPLACE(document_destination, '\D', '', 'g')
WHERE 
  document_origin IS NOT NULL OR document_destination IS NOT NULL;
```

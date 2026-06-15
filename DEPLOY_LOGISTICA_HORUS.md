# Deploy Notes - Módulo Logística Horus

Este documento descreve as alterações de banco de dados necessárias no ambiente de Produção para suportar o módulo de Logística Horus.

## Instruções de Execução

Você pode executar a migração automaticamente rodando o script de migração no container do backend:
```bash
python migrate_logistica_horus.py
```

## DDL das Alterações (Manual)

Se preferir rodar as queries diretamente no console do PostgreSQL:

### 1. Adicionar coluna na tabela `cmp_company`
```sql
ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS module_logistica_horus BOOLEAN DEFAULT FALSE NOT NULL;
```

### 2. Criar a tabela `cmp_seller_branch` (Filiais do Seller)
```sql
CREATE TABLE IF NOT EXISTS cmp_seller_branch (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES cmp_company(id) ON DELETE CASCADE NOT NULL,
    nome VARCHAR(255) NOT NULL,
    cnpj VARCHAR(20),
    cod_empresa VARCHAR(50) NOT NULL,
    cod_filial VARCHAR(50) NOT NULL,
    active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT timezone('UTC'::text, now()),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT timezone('UTC'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_seller_branch_company ON cmp_seller_branch(company_id);
```

### 3. Criar a tabela `cmp_order_conference` (Sessão de Conferência)
```sql
CREATE TABLE IF NOT EXISTS cmp_order_conference (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES cmp_company(id) ON DELETE CASCADE NOT NULL,
    branch_id INTEGER REFERENCES cmp_seller_branch(id) ON DELETE CASCADE NOT NULL,
    cod_cli VARCHAR(50) NOT NULL,
    cod_pedido_origem VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'IN_PROGRESS' NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT timezone('UTC'::text, now()),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT timezone('UTC'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_order_conference_company_pedido ON cmp_order_conference(company_id, cod_pedido_origem);
```

### 4. Criar a tabela `cmp_order_conference_volume` (Volumes de Conferência / Caixas)
```sql
CREATE TABLE IF NOT EXISTS cmp_order_conference_volume (
    id SERIAL PRIMARY KEY,
    conference_id INTEGER REFERENCES cmp_order_conference(id) ON DELETE CASCADE NOT NULL,
    volume_number INTEGER NOT NULL,
    barcode VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT timezone('UTC'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_order_conf_vol_conf ON cmp_order_conference_volume(conference_id);
```

### 5. Adicionar a coluna `weight` na tabela `cmp_order_conference_volume`
```sql
ALTER TABLE cmp_order_conference_volume ADD COLUMN IF NOT EXISTS weight DOUBLE PRECISION;
```

### 6. Criar a tabela `cmp_order_conference_volume_item` (Itens por Caixa)
```sql
CREATE TABLE IF NOT EXISTS cmp_order_conference_volume_item (
    id SERIAL PRIMARY KEY,
    volume_id INTEGER REFERENCES cmp_order_conference_volume(id) ON DELETE CASCADE NOT NULL,
    isbn VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_conf_vol_item_volume ON cmp_order_conference_volume_item(volume_id);
```

# Deploy Database Notes - Integração Envio Pedidos Horus → Bookinfo

Este documento descreve as tabelas criadas no banco de dados local (PostgreSQL) que devem ser executadas no ambiente de produção durante o deploy.

## Instruções SQL para o PostgreSQL de Produção

Execute os comandos SQL abaixo para criar as novas tabelas de controle de transmissão de compras:

```sql
-- 1. Tabela de controle de transmissão de pedidos de compra
CREATE TABLE IF NOT EXISTS spl_purchase_transmission (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id),
    supplier_id INTEGER NOT NULL REFERENCES spl_supplier(id),
    cod_pedido INTEGER NOT NULL,
    bookinfo_pedido_id VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    horus_cod_empresa INTEGER,
    horus_cod_filial INTEGER,
    horus_cod_fornecedor INTEGER,
    horus_cod_grp_fornecedor INTEGER,
    sent_at TIMESTAMP WITHOUT TIME ZONE,
    last_sync_at TIMESTAMP WITHOUT TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_spl_purchase_transmission_company ON spl_purchase_transmission(company_id);
CREATE INDEX IF NOT EXISTS idx_spl_purchase_transmission_supplier ON spl_purchase_transmission(supplier_id);
CREATE INDEX IF NOT EXISTS idx_spl_purchase_transmission_cod_pedido ON spl_purchase_transmission(cod_pedido);

-- 2. Tabela de controle dos itens do pedido transmitido
CREATE TABLE IF NOT EXISTS spl_purchase_transmission_item (
    id SERIAL PRIMARY KEY,
    transmission_id INTEGER NOT NULL REFERENCES spl_purchase_transmission(id) ON DELETE CASCADE,
    cod_item INTEGER NOT NULL,
    cod_barra VARCHAR(100),
    nom_item VARCHAR(255),
    qt_pedida INTEGER NOT NULL DEFAULT 0,
    situacao_envio VARCHAR(100),
    situacao_retorno VARCHAR(100),
    obs_item TEXT,
    synced_at TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_spl_purchase_transmission_item_transmission ON spl_purchase_transmission_item(transmission_id);
```

## Dependências de Deploy
- Subir a migração local executando `migrate_purchase_transmissions.py` (ou rodando os SQLs acima em produção).

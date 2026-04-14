# Deploy do Módulo NFS-e Padrão Nacional (Fila Emissão)

Este documento descreve as alterações que precisam ser executadas no banco de dados de Produção (PostgreSQL) para o deploy do módulo de emissão de Notas Fiscais de Serviços (NFS-e).

## 1. Alteração na Tabela `cmp_company`
Rodar os seguintes comandos DDL no banco de dados para incluir as colunas essenciais de faturamento:

```sql
ALTER TABLE cmp_company ADD COLUMN nfse_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE cmp_company ADD COLUMN nfse_environment VARCHAR(50) DEFAULT 'HOMOLOGACAO';
ALTER TABLE cmp_company ADD COLUMN razao_social VARCHAR(255);
ALTER TABLE cmp_company ADD COLUMN inscricao_municipal VARCHAR(50);
ALTER TABLE cmp_company ADD COLUMN codigo_municipio_ibge VARCHAR(20);
ALTER TABLE cmp_company ADD COLUMN regime_tributario VARCHAR(50);
ALTER TABLE cmp_company ADD COLUMN optante_simples_nacional BOOLEAN DEFAULT FALSE;
ALTER TABLE cmp_company ADD COLUMN cert_path VARCHAR(500);
ALTER TABLE cmp_company ADD COLUMN cert_password VARCHAR(255);
```

## 2. Criação da Tabela `svc_nfse_queue` (Fila de Processamento)
Criar a tabela encarregada de segurar o agendamento de emissões em lote.

```sql
CREATE TYPE nfsequeuestatus AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'REJECTED');

CREATE TABLE svc_nfse_queue (
    id SERIAL NOT NULL, 
    company_id INTEGER NOT NULL, 
    transaction_id INTEGER, 
    status nfsequeuestatus NOT NULL, 
    retry_count INTEGER NOT NULL, 
    nfse_response_json JSON, 
    xml_protocol_id VARCHAR(255), 
    pdf_url_link VARCHAR(500), 
    error_message TEXT, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(), 
    updated_at TIMESTAMP WITH TIME ZONE, 
    PRIMARY KEY (id), 
    FOREIGN KEY(company_id) REFERENCES cmp_company (id), 
    FOREIGN KEY(transaction_id) REFERENCES fin_transaction (id)
);

CREATE INDEX ix_svc_nfse_queue_id ON svc_nfse_queue (id);
```

## Importante:
Caso prefira um script seguro automatizado no servidor, rode o `python migrate_nfse.py` dentro do container/backend e ele fará o processo de update automaticamente (Add Column de forma tolerante a falhas) e o `create_all()`.

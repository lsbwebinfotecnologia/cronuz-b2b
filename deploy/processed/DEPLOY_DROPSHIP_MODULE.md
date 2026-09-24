# DEPLOY — Módulo Dropship (Integração Hub-Erdos)

**Data:** 2026-07-14  
**Ambiente:** Produção (servidor Digital Ocean)  
**Versão da API Hórus mínima:** v.01.127

---

## ⚠️ Pré-requisitos

1. Ter a API Hórus atualizada para v.01.127 ou superior (enviada em anexo pela equipe Hórus)
2. Ter os parâmetros fiscais criados no Hórus ERP antes de usar o módulo:
   - CFOP 6.923 — Remessa c/ baixa de estoque (Tipo DIVERSOS, movimentação = Sim)
   - CFOP 6.118 — Venda s/ baixa de estoque (Tipo VENDA, movimentação = Não)

---

## 1. Deploy do Código

```bash
# No servidor de produção
cd /var/www/cronuz

# Pull do repositório
git pull origin main

# Reiniciar serviço (as tabelas são criadas automaticamente no startup)
sudo systemctl restart cronuz-backend
```

---

## 2. Criação das Tabelas (automática via SQLAlchemy)

As tabelas abaixo são criadas automaticamente ao subir o backend (via `Base.metadata.create_all`).  
Se por algum motivo precisar criar manualmente, execute os SQLs abaixo:

### Tabela `dsp_config`

```sql
CREATE TABLE IF NOT EXISTS dsp_config (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id),
    provider VARCHAR(50) NOT NULL DEFAULT 'ERDOS',
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    api_token VARCHAR(512),
    api_base_url VARCHAR(512),
    horus_customer_id INTEGER REFERENCES crm_customer(id),
    horus_fiscal_param_remessa VARCHAR(50),
    horus_fiscal_param_venda VARCHAR(50),
    stock_sync_interval_min INTEGER NOT NULL DEFAULT 30,
    stock_sync_last_run TIMESTAMPTZ,
    stock_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ,
    CONSTRAINT uix_dsp_config_company_provider UNIQUE (company_id, provider)
);

CREATE INDEX IF NOT EXISTS ix_dsp_config_company_id ON dsp_config(company_id);
CREATE INDEX IF NOT EXISTS ix_dsp_config_horus_customer_id ON dsp_config(horus_customer_id);
```

### Tabela `dsp_order`

```sql
CREATE TABLE IF NOT EXISTS dsp_order (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id),
    config_id INTEGER NOT NULL REFERENCES dsp_config(id),
    external_order_id VARCHAR(255) NOT NULL,
    external_reference VARCHAR(100),
    channel VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    released_at TIMESTAMPTZ,
    customer_data JSONB,
    items_data JSONB,
    logistics_data JSONB,
    fiscal_data JSONB,
    horus_pedido_remessa VARCHAR(100),
    horus_pedido_venda VARCHAR(100),
    tracking_code VARCHAR(100),
    nfe_remessa_key VARCHAR(100),
    label_path VARCHAR(512),
    danfe_path VARCHAR(512),
    xml_path VARCHAR(512),
    synced_at TIMESTAMPTZ,
    sent_to_horus_at TIMESTAMPTZ,
    dispatched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ,
    CONSTRAINT uix_dsp_order_company_external UNIQUE (company_id, external_order_id)
);

CREATE INDEX IF NOT EXISTS ix_dsp_order_company_id ON dsp_order(company_id);
CREATE INDEX IF NOT EXISTS ix_dsp_order_config_id ON dsp_order(config_id);
CREATE INDEX IF NOT EXISTS ix_dsp_order_external_order_id ON dsp_order(external_order_id);
```

---

## 3. Estrutura de Pastas (criada automaticamente pelo backend)

```
/var/www/cronuz/uploads/{company_id}/dropship/{external_order_id}/
    ├── nfe.xml        # XML NF-e de Venda (6.120) baixado do Hub-Erdos
    ├── danfe.pdf      # DANFE PDF
    └── etiqueta.pdf   # Etiqueta de postagem
```

> **Importante:** A pasta `uploads/` está no `.gitignore`. Os documentos baixados ficam em disco e **nunca devem ser removidos** por limpezas do Git.

---

## 4. Verificação Pós-Deploy

```bash
# Testar se API subiu corretamente
curl -s http://localhost:8000/ | python3 -m json.tool

# Verificar que endpoints Dropship estão acessíveis (retorna 401 = ok, API está de pé)
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/dropship/config/1

# Verificar logs do worker
sudo journalctl -u cronuz-backend -n 50 --no-pager
```

---

## 5. Configuração no B2B (pós-deploy)

1. Acesse **Master → Parceiros → [Seller Vida Nova] → Dropship**
2. Insira o **token** fornecido pela Erdos
3. Vincule o **customer parceiro** (Erdos) — deve ter `id_guid` e `id_doc` cadastrados
4. Informe os **COD_PARAM_FISCAL** de Remessa e Venda gerados no Hórus
5. Clique em **Testar Conexão** → deve retornar `{"ok": true}`
6. Salve a configuração

---

## Status: PENDENTE (aguardando execução em produção)

# Deploy: Minuta de Despacho & Termo de Coleta (Dropship)

## 📋 Resumo das Alterações
Implementação do fluxo operacional de **Minuta de Despacho / Romaneio de Coleta** para os pedidos Dropshipping:
1. **Banco de Dados (PostgreSQL):**
   - Criação da tabela `dsp_dispatch_manifest` com campos para identificação da transportadora, motorista/coletor (nome, RG/CPF, placa do veículo), notas e totalizadores (pedidos, volumes e valor total declarado).
   - Adição das colunas `manifest_id` e `manifest_at` na tabela `dsp_order`.
2. **Backend (FastAPI):**
   - Modelo SQLAlchemy `DropshipDispatchManifest` em `app/models/dropship_manifest.py`.
   - Schemas Pydantic para criação e consulta de minutas.
   - Endpoint `POST /dropship/orders/{company_id}/manifests`:
     - Validação restrita: apenas pedidos com status `DISPATCHED` podem ser incluídos na minuta.
     - Geração de código sequencial por empresa/ano (ex: `MIN-2026-0001`).
     - Cálculo consolidado de volumes e valor declarado das mercadorias.
     - Vínculo com os pedidos e registro de evento na auditoria do pedido.
   - Endpoint `GET /dropship/orders/{company_id}/manifests/{manifest_id}` para reimpressão e consulta.
   - Endpoint `GET /dropship/orders/{company_id}/manifests` para listagem do histórico de minutas.
3. **Frontend (Next.js & Tailwind CSS):**
   - Checkbox por linha na tabela de pedidos (habilitado apenas para status `DISPATCHED`).
   - Checkbox global no cabeçalho com seleção em lote dos despachados visíveis.
   - Filtros adicionais: filtro por status de minuta (`Todas`, `Sem Minuta`, `Com Minuta`) e filtro de período (`Data Inicial` e `Data Final`).
   - Barra flutuante de ações inferior com contagem de pedidos, total de volumes e botão de destaque para geração de minuta.
   - Modal de identificação do coletor (Transportadora, Motorista, RG/CPF, Placa, Observações).
   - Modal de impressão A4 (Print-Ready com estilos `@media print`, cabeçalho corporativo, dados da coleta, tabela detalhada dos pacotes, totalizadores, termo legal de custódia e canhotos duplos de assinatura).
   - Badge na tabela de pedidos indicando o número da minuta com clique para reimpressão rápida.

---

## 🗄️ 1. Script SQL a Executar em Produção
Conecte-se ao PostgreSQL de produção:
```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b
```

Execute o arquivo `deploy/create_dsp_dispatch_manifest.sql` ou cole o SQL:
```sql
CREATE TABLE IF NOT EXISTS dsp_dispatch_manifest (
    id                  SERIAL PRIMARY KEY,
    company_id          INTEGER NOT NULL REFERENCES cmp_company(id),
    manifest_number     VARCHAR(50) NOT NULL,
    carrier_name        VARCHAR(100),
    driver_name         VARCHAR(150),
    driver_document     VARCHAR(50),
    vehicle_plate       VARCHAR(20),
    notes               TEXT,
    total_orders        INTEGER NOT NULL DEFAULT 0,
    total_volumes       INTEGER NOT NULL DEFAULT 0,
    total_value         NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    created_by_user_id  INTEGER REFERENCES usr_user(id),
    CONSTRAINT uix_dsp_dispatch_manifest_number UNIQUE (company_id, manifest_number)
);

CREATE INDEX IF NOT EXISTS idx_dsp_dispatch_manifest_company ON dsp_dispatch_manifest(company_id);
CREATE INDEX IF NOT EXISTS idx_dsp_dispatch_manifest_created ON dsp_dispatch_manifest(created_at);

ALTER TABLE dsp_order ADD COLUMN IF NOT EXISTS manifest_id INTEGER REFERENCES dsp_dispatch_manifest(id) ON DELETE SET NULL;
ALTER TABLE dsp_order ADD COLUMN IF NOT EXISTS manifest_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_dsp_order_manifest ON dsp_order(manifest_id);
```

---

## 🚀 2. Deploy da Aplicação (Produção)
```bash
# 1. Atualizar repositório
cd /var/www/cronuz && git pull origin main

# 2. Executar migration SQL
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f deploy/create_dsp_dispatch_manifest.sql

# 3. Build do Frontend
cd /var/www/cronuz/frontend && npm run build
pm2 restart cronuz-frontend

# 4. Reiniciar Backend
systemctl restart cronuz-backend

# 5. Validação
curl -s -o /dev/null -w 'Backend: %{http_code}
' http://localhost:8000/dashboard/metrics -H 'Authorization: Bearer test'
curl -s -o /dev/null -w 'Frontend: %{http_code}
' http://localhost:3000
```

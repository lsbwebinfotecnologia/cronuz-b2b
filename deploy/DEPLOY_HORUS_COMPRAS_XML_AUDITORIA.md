# Roteiro de Deploy — Compras (Access Moderno + Auditoria de XML NF-e vs Pedido)

## 1. Alterações de Banco de Dados (PostgreSQL `cronuz_b2b`)
Executar o arquivo SQL `deploy/DEPLOY_HORUS_COMPRAS_XML_AUDITORIA.sql`:
- **Alterações na tabela `pur_horus_order`**:
  - `xml_status` (`NONE`, `PENDING_REVIEW`, `XML_OK`, `ACCEPTED_WITH_DIVERGENCE`, `REJECTED`)
  - `last_xml_audit_id`, `last_nfe_number`, `last_nfe_series`, `last_nfe_key`, `xml_checked_at`, `xml_checked_by_name`
- **Nova tabela `pur_horus_xml_audit`**:
  - Cabeçalho da NF-e (`chave_acesso`, `numero_nf`, `serie_nf`, `emit_cnpj`, `dest_cnpj`), armazenamento isolado do XML (`uploads/<company_id>/purchase_xmls/`), totais comparativos (Pedido vs XML), contadores individualizados de divergência (`diff_cover_count`, `diff_discount_count`, `diff_qty_count`, `extra_in_xml_count`, `missing_in_xml_count`) e decisão posterior auditada (`decision_status`, `decision_notes`, `decided_by_name`, `decided_at`).
- **Nova tabela `pur_horus_xml_audit_item`**:
  - Comparativo item a item entre Pedido e XML (Preço de Capa, Desconto %, Desconto Efetivo %, Preço Líquido, Quantidade), flags individuais de divergência e observação/pontuação por item (`item_note`).

## 2. Comandos de Deploy em Produção (Somente quando autorizado)
```bash
ssh root@64.23.182.183

# 1. Atualizar código
cd /var/www/cronuz && git pull origin main

# 2. Aplicar migração SQL no PostgreSQL
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/DEPLOY_HORUS_COMPRAS_XML_AUDITORIA.sql

# 3. Reiniciar Backend e Rebuildar Frontend
systemctl restart cronuz-backend
cd /var/www/cronuz/frontend && npm run build
pm2 restart cronuz-frontend

# 4. Validar saúde HTTP 200
curl -s -o /dev/null -w 'Backend: %{http_code}\n' http://localhost:8000/docs
curl -s -o /dev/null -w 'Frontend: %{http_code}\n' http://localhost:3000

# 5. Mover scripts aplicados para deploy/processed/
```

# Roteiro de Deploy — Módulo Compras & Reposição Multi-Filial (Horus Direct)

Este documento detalha todas as alterações de banco de dados PostgreSQL (`cronuz_b2b`), backend e frontend para publicação futura em produção (`64.23.182.183`).

---

## 🗄️ 1. Alterações no Banco de Dados PostgreSQL (`cronuz_b2b`)

Execute o script idempotente [`DEPLOY_HORUS_COMPRAS_MODULE.sql`](./DEPLOY_HORUS_COMPRAS_MODULE.sql):

```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/DEPLOY_HORUS_COMPRAS_MODULE.sql
```

### Resumo das Estruturas Criadas:
1. **`cmp_settings.horus_sql_feature_compras`** (`BOOLEAN NOT NULL DEFAULT FALSE`):
   - Habilita o submenu **Compras (Horus)** (`/horus-direct/compras`) para o seller selecionado no Painel Master (`/companies/[id]/modules`).
2. **`pur_horus_branch_config`**:
   - Parametrização operacional por filial (`cod_local_default`, `cod_departamento_default`, `cod_centro_custo_default`, `compra_consig_default`) e template individualizado de e-mail (`sender_name`, `reply_to_email`, `cc_emails`, `email_subject_template`, `email_body_template`) por filial.
3. **`pur_horus_supplier_discount`**:
   - Governança obrigatória relacionando `company_id`, `branch_id` (Filial), `cnpj_fornecedor`, `cod_grp_fornecedor`, `cod_fornecedor`, `cod_editora`, `nome_editora` e `desconto_percentual` (`%`).
4. **`pur_horus_publisher_reconcile_log`**:
   - Trilha de auditoria das conciliações de Editora/Selo executadas simultaneamente em `ITENS_ESTOQUE_GERAL.COD_EDITORA` no Horus SQL e `prd_product` no Cronuz.
5. **`pur_horus_order` + `pur_horus_order_item` + `pur_horus_order_log`**:
   - Espelhamento completo dos pedidos gerados em `PEDIDOS_COMPRA` + `ITENS_PEDIDO_COMPRA` no Horus (`AP` Aprovado → `AE` Aguardando Entrega), contagem de exportações Excel e auditoria de usuários/datas.

---

## 🚀 2. Passos de Publicação em Produção (Quando Autorizado)

```bash
# 1. Merge da branch na main (local)
git checkout main
git pull origin main
git merge feature/horus-direct-compras
git push origin main

# 2. No servidor de produção (64.23.182.183)
cd /var/www/cronuz && git pull origin main

# 3. Migração PostgreSQL
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/DEPLOY_HORUS_COMPRAS_MODULE.sql

# 4. Restart Backend & Build Frontend
systemctl restart cronuz-backend
cd /var/www/cronuz/frontend && npm run build
pm2 restart cronuz-frontend

# 5. Validação de Saúde (HTTP 200 + Sem Workers Zumbis)
ps aux | grep uvicorn | grep -v grep
curl -s -o /dev/null -w 'Backend: %{http_code}\n' http://localhost:8000/docs
curl -s -o /dev/null -w 'Frontend: %{http_code}\n' http://localhost:3000

# 6. Mover arquivos de deploy processados
mv /var/www/cronuz/deploy/DEPLOY_HORUS_COMPRAS_MODULE.* /var/www/cronuz/deploy/processed/
```

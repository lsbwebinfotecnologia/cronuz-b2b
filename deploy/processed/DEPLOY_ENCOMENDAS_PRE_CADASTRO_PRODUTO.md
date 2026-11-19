# Roteiro de Deploy — Módulo de Encomendas: Busca Inteligente, Pré-Cadastro Cronuz e Identificador ERP Hórus

## Objetivo
Habilitar vínculo estrutural (`product_id`) e flag explícita de cadastro no ERP Hórus (`has_erp_registration`) nos itens de encomenda e na fila de suprimentos, permitindo encomendar obras mesmo quando não cadastradas no Hórus/Cronuz (com pré-cadastro automático em `prd_product` e rastreabilidade para futura solicitação de compra).

---

## 1. Alterações no Banco de Dados PostgreSQL (Produção)

Arquivo SQL correspondente: `deploy/alter_encomendas_add_product_link.sql`

### Comandos DDL Exatos (Aditivos e Idempotentes)
```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/alter_encomendas_add_product_link.sql
```

Conteúdo executado:
```sql
ALTER TABLE ord_customer_encomenda_item
    ADD COLUMN IF NOT EXISTS product_id INTEGER REFERENCES prd_product(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS has_erp_registration BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_ord_customer_encomenda_item_prod
    ON ord_customer_encomenda_item(product_id);

ALTER TABLE ord_backorder
    ADD COLUMN IF NOT EXISTS product_id INTEGER REFERENCES prd_product(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ord_backorder_prod
    ON ord_backorder(product_id);
```

---

## 2. Deploy de Aplicação (Backend + Frontend)

```bash
cd /var/www/cronuz && git pull origin main
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/alter_encomendas_add_product_link.sql

systemctl restart cronuz-backend
cd /var/www/cronuz/frontend && npm run build
pm2 restart cronuz-frontend

# Validação de integridade
curl -s -o /dev/null -w 'Backend: %{http_code}\n' http://localhost:8000/
curl -s -o /dev/null -w 'Frontend: %{http_code}\n' http://localhost:3000
```

> Após concluir o deploy em produção com sucesso, mover `deploy/alter_encomendas_add_product_link.sql` e `deploy/DEPLOY_ENCOMENDAS_PRE_CADASTRO_PRODUTO.md` para `deploy/processed/`.

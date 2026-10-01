# Roteiro de Deploy: Agrupador de O.S., Agrupador Financeiro e Relatórios por Cliente

**Data de Elaboração:** 30/09/2026  
**Módulos Afetados:** Serviços (`/services/orders`) e Financeiro (`/financial`)  
**Status Atual:** Desenvolvido e validado no ambiente Local.

---

## 1. Alterações no Banco de Dados (PostgreSQL)

Execute o script `deploy/create_grouping_columns.sql` no banco de dados de produção `cronuz_b2b`:

```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/create_grouping_columns.sql
```

Ou execute diretamente via DDL:
```sql
ALTER TABLE svc_service_order 
ADD COLUMN IF NOT EXISTS grouped_in_id INTEGER REFERENCES svc_service_order(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_svc_so_grouped_in ON svc_service_order(grouped_in_id);

ALTER TABLE fin_installment 
ADD COLUMN IF NOT EXISTS grouped_in_id INTEGER REFERENCES fin_installment(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fin_inst_grouped_in ON fin_installment(grouped_in_id);
```

---

## 2. Dependências Python
O projeto já possui `openpyxl` e `fpdf2` instalados no ambiente virtual do backend (`/var/www/cronuz/backend/venv`).

---

## 3. Comandos de Deploy (Quando autorizado o deploy em produção)
```bash
cd /var/www/cronuz && git pull origin main
cd /var/www/cronuz/frontend && npm run build
pm2 restart cronuz-frontend
systemctl restart cronuz-backend
```

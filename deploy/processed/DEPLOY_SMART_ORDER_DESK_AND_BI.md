# Roteiro de Deploy: Mesa de Análise Comercial, Regras de CFOP & Hórus BI

Este documento detalha as alterações no banco de dados PostgreSQL e passos operacionais necessários para o deploy em produção.

---

## 🗄️ 1. Alterações no Banco de Dados (PostgreSQL)

Execute os scripts de migração no PostgreSQL:

```bash
# 1. Colunas de CFOPs e flag de BI sync
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/create_cmp_settings_cfops.sql

# 2. Tabela analítica de vendas do BI e índices
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/create_horus_bi_sales_table.sql
```

Ou execute manualmente no `psql`:

```sql
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS sales_cfops VARCHAR(500) DEFAULT '5101,5102,6101,6102,5114,6114,5115,6115,5403,6403,5405,6405';
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS consign_cfops VARCHAR(500) DEFAULT '5917,6917';
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS dev_sales_cfops VARCHAR(500) DEFAULT '1201,1202,2201,2202,1411,2411';
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS dev_consign_cfops VARCHAR(500) DEFAULT '1918,2918';
ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_bi_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE;
```

---

## ⚙️ 2. Passos de Deploy

Quando for autorizada a publicação em produção:

1. Atualizar repositório:
   ```bash
   cd /var/www/cronuz && git pull origin main
   ```
2. Executar script de banco (conforme item 1 acima).
3. Recompilar frontend e reiniciar processos:
   ```bash
   cd /var/www/cronuz/frontend && npm run build
   pm2 restart cronuz-frontend
   systemctl restart cronuz-backend
   ```
4. Validação:
   ```bash
   curl -s -o /dev/null -w 'Backend: %{http_code}\n' http://localhost:8000/
   curl -s -o /dev/null -w 'Frontend: %{http_code}\n' http://localhost:3000/
   ```

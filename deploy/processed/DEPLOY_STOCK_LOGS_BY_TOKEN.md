# Roteiro de Deploy — Multi-Token Estoque: Logs e Forçar Envio por Token

## 1. Alterações no Banco de Dados (PostgreSQL)

Execute o script `deploy/add_credential_to_dsp_stock_sync_log.sql` no banco de dados da produção:

```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/add_credential_to_dsp_stock_sync_log.sql
```

### Comandos SQL executados pelo script:

```sql
ALTER TABLE dsp_stock_sync_log 
ADD COLUMN IF NOT EXISTS erdos_credential_id INTEGER REFERENCES dsp_erdos_credential(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dsp_stock_sync_log_cred ON dsp_stock_sync_log(erdos_credential_id);

-- Backfill dos logs existentes para a credencial primaria do seller
UPDATE dsp_stock_sync_log s
SET erdos_credential_id = c.id
FROM dsp_erdos_credential c
WHERE s.erdos_credential_id IS NULL
  AND s.company_id = c.company_id
  AND c.is_primary = TRUE;

-- Fallback para empresas que tenham credencial ativa nao marcada como primary
UPDATE dsp_stock_sync_log s
SET erdos_credential_id = c.id
FROM (
    SELECT DISTINCT ON (company_id) id, company_id
    FROM dsp_erdos_credential
    WHERE is_active = TRUE
    ORDER BY company_id, id ASC
) c
WHERE s.erdos_credential_id IS NULL
  AND s.company_id = c.company_id;
```

---

## 2. Comandos Padrão de Deploy (Backend e Frontend)

```bash
cd /var/www/cronuz && git pull origin main
cd /var/www/cronuz/frontend && npm run build
pm2 restart cronuz-frontend
systemctl restart cronuz-backend
```

## 3. Validação pós-deploy

```bash
curl -s -o /dev/null -w 'Backend: %{http_code}
' http://localhost:8000/docs
curl -s -o /dev/null -w 'Frontend: %{http_code}
' http://localhost:3000
```

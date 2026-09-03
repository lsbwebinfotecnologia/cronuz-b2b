# Roteiro de Deploy — Carga Inicial de Estoque (4 Anos), Suporte à Bookstore e Retenção de Logs

## 1. Alterações no Banco de Dados (PostgreSQL)

Execute o script `deploy/add_stock_sync_last_run_to_erdos_credential.sql` no banco de dados de produção:

```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/add_stock_sync_last_run_to_erdos_credential.sql
```

### Conteúdo SQL executado:

```sql
-- Adiciona controle individual de sincronização de estoque por credencial/token
ALTER TABLE dsp_erdos_credential 
ADD COLUMN IF NOT EXISTS stock_sync_last_run TIMESTAMPTZ;

-- Inicializa a credencial primaria com a data do ultimo sync da config, se houver
UPDATE dsp_erdos_credential c
SET stock_sync_last_run = cfg.stock_sync_last_run
FROM dsp_config cfg
WHERE c.config_id = cfg.id
  AND c.is_primary = TRUE
  AND c.stock_sync_last_run IS NULL
  AND cfg.stock_sync_last_run IS NOT NULL;
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

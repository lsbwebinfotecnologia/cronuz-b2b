# 🚀 Roteiro de Deploy — Licenciamento Horus PDV Desktop (.EXE) e Sincronização por Range Horus (`COD_ITEM_INI` a `COD_ITEM_FIM`)

## 1. Alterações de Banco de Dados (PostgreSQL)

Foram adicionadas 4 novas colunas na tabela `cmp_settings` para controle pelo **Painel Master** da licença de uso do **Horus PDV Desktop (`HorusPDV.exe`)**, data de validade, chave criptográfica assinada (`HMAC-SHA256`) e permissão da rotina de sincronização de catálogo por sequência de códigos do Horus (`COD_ITEM_INI` a `COD_ITEM_FIM`).

### Comando SQL para Executar em Produção:
```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/DEPLOY_HORUS_PDV_DESKTOP_LICENSE_AND_RANGE_SYNC.sql
```

Ou diretamente via `psql`:
```sql
ALTER TABLE cmp_settings
  ADD COLUMN IF NOT EXISTS pdv_desktop_license_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pdv_desktop_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS pdv_desktop_license_key VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS pdv_horus_range_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE;
```

---

## 2. Novos Endpoints no Backend (`backend/app/api/pos.py`)

1. **`GET /companies/{company_id}/pos/desktop-license`**:
   - Retorna o status da licença do Horus PDV Desktop (`enabled`, `expires_at`, `license_key`, `range_sync_enabled`, `is_valid`, `days_remaining`).
2. **`PUT /companies/{company_id}/pos/desktop-license`** *(Exclusivo Master)*:
   - Permite ao Master ativar/desativar o Horus PDV Desktop do Seller, definir a data de validade (`expires_at`), habilitar/desabilitar a rotina de sincronização de catálogo por range Horus (`range_sync_enabled`) e gerar/renovar a chave criptográfica assinada (`pdv_desktop_license_key`).
3. **`POST /companies/{company_id}/pos/horus-catalog-range`**:
   - Sincroniza um intervalo de códigos de produtos no Horus ERP usando `COD_ITEM_INI` e `COD_ITEM_FIM` (respeitando estritamente o flag `horus_legacy_pagination` de quem usa ou omite `OFFSET/LIMIT` no cadastro do Seller) e já traz o saldo disponível do `Estoque` para aquele range.
   - Valida obrigatoriamente se a licença do PDV Desktop está ativa/dentro da validade e se `pdv_horus_range_sync_enabled` está liberado pelo Master.

---

## 3. Passos de Deploy no Servidor DigitalOcean (`64.23.182.183`)

```bash
cd /var/www/cronuz && git pull origin main
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/DEPLOY_HORUS_PDV_DESKTOP_LICENSE_AND_RANGE_SYNC.sql
systemctl restart cronuz-backend
cd /var/www/cronuz/frontend && npm run build
pm2 restart cronuz-frontend
mv /var/www/cronuz/deploy/DEPLOY_HORUS_PDV_DESKTOP_LICENSE_AND_RANGE_SYNC.* /var/www/cronuz/deploy/processed/
```

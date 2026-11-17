# Roteiro de Deploy — Integração Nativa Estante Virtual + Fila Unificada (`mkt_sync_queue`)

## 1. Alterações de Banco de Dados (PostgreSQL)
As tabelas e colunas abaixo também são criadas automaticamente pelo Auto-DDL em `backend/main.py` na inicialização, mas para aplicação explícita via `psql` em produção:

```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/20261116_estante_virtual_and_mkt_sync_queue.sql
```

### O que é criado/alterado:
1. **`cmp_settings`**:
   - `ev_enabled`, `ev_environment`, `ev_seller_id`, `ev_email`, `ev_password`, `ev_auth_token`, `ev_token_expires_at`, `ev_webhook_secret`, `ev_preset_config`.
2. **`mkt_sync_queue`**:
   - Fila assíncrona unificada de processamento de produtos, preços e estoques para todos os marketplaces (`mercadolivre`, `estantevirtual`, `shopee`), com drenagem/eliminação automática dos itens concluídos com sucesso.
3. **`ev_listings`**, **`ev_orders`** e **`ev_sync_logs`**:
   - Estado vivo de anúncios publicados na Estante Virtual, espelho de pedidos via webhook (`POST /pedido` e `PUT /pedido`) e logs de sincronização.

## 2. Passos de Deploy em Produção (Somente após autorização)
```bash
cd /var/www/cronuz && git pull origin main
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/20261116_estante_virtual_and_mkt_sync_queue.sql
cd /var/www/cronuz/frontend && npm run build
pm2 restart cronuz-frontend
systemctl restart cronuz-backend
```

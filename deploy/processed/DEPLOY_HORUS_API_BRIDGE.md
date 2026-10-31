# Roteiro de Deploy — API Horus Complementar & Agente Bridge Desktop (`HorusAPIBridge.exe`)

## 1. Alterações no Banco de Dados (PostgreSQL)

Execute o script [`deploy/DEPLOY_HORUS_API_BRIDGE.sql`](file:///Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/deploy/DEPLOY_HORUS_API_BRIDGE.sql):

```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/DEPLOY_HORUS_API_BRIDGE.sql
```

### Resumo das Colunas Adicionadas:
- **`cmp_company.module_horus_api_bridge`** (`BOOLEAN DEFAULT FALSE`): Habilita o módulo no Painel Master.
- **`cmp_settings.horus_bridge_enabled`** (`BOOLEAN DEFAULT FALSE`): Ativa a operação da API Horus Paralela no Seller.
- **`cmp_settings.horus_bridge_expires_at`** (`TIMESTAMPTZ NULL`): Data de validade da licença do `.exe`.
- **`cmp_settings.horus_bridge_license_key`** (`VARCHAR(512)`): Chave criptográfica assinada com HMAC-SHA256 (`HBRI1.<payload>.<sig>`).
- **`cmp_settings.horus_bridge_api_username`** / **`horus_bridge_api_password`** / **`horus_bridge_api_token`**: Credenciais exclusivas do Seller para consumo da API Pública (`Basic Auth` e `Bearer Token` / `X-API-Key`).
- **`cmp_settings.horus_bridge_rate_limit_per_min`** (`INTEGER DEFAULT 120`): Limite de requisições por minuto.
- **`cmp_settings.horus_bridge_allow_financial_sql`** (`BOOLEAN DEFAULT TRUE`): Libera os endpoints complementares financeiros/SQL via `.exe`.
- **`cmp_settings.horus_bridge_custom_gateway_url`** (`VARCHAR(255)`): URL customizada caso o Seller utilize um Droplet Dedicado de API.

---

## 2. Opção A — Deploy no Servidor Principal (`64.23.182.183`)

```bash
cd /var/www/cronuz && git pull origin main
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/DEPLOY_HORUS_API_BRIDGE.sql
cd /var/www/cronuz/frontend && npm run build
pm2 restart cronuz-frontend
systemctl restart cronuz-backend
```

---

## 3. Opção B — Deploy em Droplet Dedicado SOMENTE para APIs (`SERVER_ROLE=horus_api_only`)

Se desejar isolar 100% da carga das requisições da API Horus Complementar em um segundo Droplet na DigitalOcean:

1. No novo Droplet (Ubuntu 22.04/24.04 na mesma VPC do servidor principal), clone o repositório em `/var/www/cronuz`.
2. Configure o arquivo `/var/www/cronuz/backend/.env` com:
   ```env
   SERVER_ROLE=horus_api_only
   DATABASE_URL=postgresql://cronuz_admin:cronuz_password_123@<IP_PRIVADO_DROPLET_PRINCIPAL>:5432/cronuz_b2b
   SECRET_KEY=<MESMA_SECRET_KEY_DO_SERVIDOR_PRINCIPAL>
   HORUS_SQL_ENCRYPTION_KEY=<MESMA_FERNET_KEY>
   ```
3. Suba apenas o serviço `cronuz-backend` (não é necessário subir PM2 / Next.js nem APScheduler no Droplet de API).
4. Configure o Nginx no Droplet dedicado para fazer proxy reverso da porta `80`/`443` para `http://127.0.0.1:8000` com `proxy_read_timeout 120s;` (para suportar o Long-Polling/WebSocket do túnel do `.exe`).
5. No Painel Master da empresa, preencha o campo **URL do Gateway Cloud** com o endereço do novo Droplet.

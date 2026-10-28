# Roteiro de Deploy — Módulo Storefront Aberto (B2C), Cupons Corporativos, LGPD & Integração Tray

## 1. Resumo das Alterações no Banco de Dados (PostgreSQL)

Este deploy adiciona a estrutura completa para o **Módulo Storefront Aberto (B2C)**, permitindo:
- Domínio exclusivo B2C (`b2c_custom_domain`) ou ativação de vitrine aberta no domínio principal (`b2c_storefront_open`).
- Habilitação do módulo pelo painel Master (`module_b2c_storefront`).
- Credenciais OAuth2 + MCP Storefront da **Tray E-commerce** em `cmp_settings` (`tray_enabled`, `tray_store_url`, `tray_api_address`, `tray_store_id`, `tray_consumer_key`, `tray_consumer_secret`, `tray_auth_code`, `tray_access_token`, `tray_refresh_token`, `tray_token_expires_at`).
- Tabelas de **Lotes Corporativos de Cupons (`b2c_coupon_batches`)**, **Cupons/Saldos Individuais e Carteira CPF (`b2c_coupons`)**, **Auditoria de Utilizações e Saldo Residual (`b2c_coupon_redemptions`)** e **Termos de Consentimento LGPD (`b2c_lgpd_consents`)**.

---

## 2. Passo a Passo para Execução em Produção

Quando autorizado o deploy para produção (`64.23.182.183`):

### Passo 1: Atualizar Código via Git
```bash
ssh root@64.23.182.183
cd /var/www/cronuz
git pull origin main
```

### Passo 2: Executar Migration SQL no PostgreSQL
```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/DEPLOY_B2C_STOREFRONT_TRAY.sql
```

### Passo 3: Build do Frontend e Restart dos Serviços
```bash
cd /var/www/cronuz/frontend && npm run build
pm2 restart cronuz-frontend
systemctl restart cronuz-backend
```

### Passo 4: Validação Final e Movimentação do Arquivo de Deploy
```bash
curl -s -o /dev/null -w 'Backend: %{http_code}\n' http://localhost:8000/dashboard/metrics -H 'Authorization: Bearer test'
curl -s -o /dev/null -w 'Frontend: %{http_code}\n' http://localhost:3000
mv /var/www/cronuz/deploy/DEPLOY_B2C_STOREFRONT_TRAY.* /var/www/cronuz/deploy/processed/
```

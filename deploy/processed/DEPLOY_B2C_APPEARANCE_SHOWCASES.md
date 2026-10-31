# Deploy: Storefront B2C — Banners, Vitrines, Destaques, Cores e URL Amigável

## 1. Alterações de Banco de Dados (PostgreSQL)

Execute o script SQL abaixo no banco de produção (`cronuz_b2b`):

```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/DEPLOY_B2C_APPEARANCE_SHOWCASES.sql
```

### Detalhamento DDL:
- **`cmp_settings.b2c_showcases_config` (`JSON`, nullable)**:
  Armazena de forma estruturada para cada Seller:
  - Identidade visual B2C (`primary_color`, `secondary_color`, `logo_url`, `store_slug`, `hero_title`, `hero_subtitle`, `hero_badge_text`, `show_voucher_simulator`).
  - Banners Hero e Rotativos da Home B2C (`banners`).
  - Vitrines e Destaques da Home B2C (`showcases` com livros do Horus ERP / Catálogo local).
  - Categorias e Filtros rápidos da Loja B2C (`categories`).

## 2. Passos de Deploy (Produção)
```bash
cd /var/www/cronuz && git pull origin main
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/DEPLOY_B2C_APPEARANCE_SHOWCASES.sql
cd /var/www/cronuz/frontend && npm run build
pm2 restart cronuz-frontend
systemctl restart cronuz-backend
```

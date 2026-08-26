# 🌐 Roteiro de Deploy — Módulo de Hospedagem de Sites Institucionais

Este documento contém o passo a passo completo para ativar a hospedagem de sites estáticos em produção na **DigitalOcean** (`64.23.182.183`).

---

## 1. Banco de Dados (PostgreSQL)

Execute o script de migração no banco de dados de produção (`cronuz_b2b`):

```bash
ssh root@64.23.182.183 "sudo -u postgres psql -d cronuz_b2b -f /var/www/cronuz/deploy/create_sit_hosted_sites.sql"
```

---

## 2. Estrutura de Diretórios no Servidor

Crie a pasta base para os sites e garanta as permissões adequadas:

```bash
ssh root@64.23.182.183 "mkdir -p /var/www/cronuz/sites && chown -R www-data:www-data /var/www/cronuz/sites"
```

---

## 3. Configuração de DNS (Wildcard)

No painel de gerenciamento de DNS do domínio `cronuzb2b.com.br` (ex: Registro.br, Cloudflare, DigitalOcean DNS):

- **Tipo**: `A`
- **Nome / Host**: `*.site`  (ou `*.site.cronuzb2b.com.br`)
- **Valor / Destino**: `64.23.182.183`
- **TTL**: `300` (ou automático)

---

## 4. Configuração do Nginx para Servir Sites Estáticos

O Nginx intercepta requisições para `*.site.cronuzb2b.com.br` e serve os arquivos estáticos da pasta correspondente em **altíssima performance**, sem onerar o Node.js ou Python.

Crie o arquivo de configuração do Nginx:
```bash
cat << 'EOF' > /etc/nginx/sites-available/cronuz-sites
server {
    listen 80;
    listen 443 ssl;
    server_name ~^(?<site_slug>[a-zA-Z0-9_-]+)\.site\.cronuzb2b\.com\.br$;

    # Certificados SSL (após gerar via Certbot)
    ssl_certificate /etc/letsencrypt/live/site.cronuzb2b.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/site.cronuzb2b.com.br/privkey.pem;

    root /var/www/cronuz/sites/;
    index index.html index.htm;

    # Otimização de entrega de arquivos estáticos
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;

    # Compressão Gzip
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/rss+xml application/atom+xml image/svg+xml;

    location / {
        try_files $uri $uri/ /index.html =404;
    }

    # Cache de assets estáticos
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff|woff2|ttf|svg|eot)$ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    access_log /var/log/nginx/sites_access.log;
    error_log /var/log/nginx/sites_error.log;
}
EOF
```

Ative o site no Nginx e teste a sintaxe:
```bash
ln -sf /etc/nginx/sites-available/cronuz-sites /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

---

## 5. Certificado SSL Let's Encrypt (Wildcard)

Gere o certificado para o subdomínio e wildcard:
```bash
certbot certonly --nginx -d site.cronuzb2b.com.br -d *.site.cronuzb2b.com.br --agree-tos -m contato@lsbwebinfo.com.br --non-interactive
```
*(Caso utilize validação DNS, pode ser utilizado `certbot certonly --manual --preferred-challenges dns -d *.site.cronuzb2b.com.br`)*

---

## 6. Atualização do Código e Reinício dos Serviços

```bash
cd /var/www/cronuz
git pull origin main
systemctl restart cronuz-backend
pm2 restart cronuz-frontend
```

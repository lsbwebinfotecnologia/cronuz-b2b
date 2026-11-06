import os
import re
import subprocess
import logging
from typing import List, Optional, Dict, Any

logger = logging.getLogger(__name__)

SECRETS_PATH = "/root/.secrets/certbot/digitalocean.ini"
CERT_NAME = "cronuz-authors"
NGINX_CONF_PATH = "/etc/nginx/sites-available/cronuz-author-portal"

def sanitize_slug(raw_slug: str) -> str:
    """Sanitiza o slug permitindo apenas caracteres alfanumericos minusculos e hifens."""
    slug = re.sub(r'[^a-z0-9_-]', '', raw_slug.strip().lower())
    return slug

def is_production_ssl_available() -> bool:
    """Verifica se estamos no ambiente com acesso as credenciais do Certbot DigitalOcean."""
    return os.path.exists(SECRETS_PATH)

def get_current_cert_domains() -> List[str]:
    """Le os dominios atualmente presentes no certificado cronuz-authors."""
    if not is_production_ssl_available():
        return []
    try:
        res = subprocess.run(
            ["certbot", "certificates", "--cert-name", CERT_NAME],
            capture_output=True, text=True, timeout=15
        )
        domains = []
        for line in res.stdout.splitlines():
            if "Domains:" in line:
                raw_domains = line.split("Domains:")[1].strip().split()
                domains.extend([d.strip() for d in raw_domains if d.strip()])
        return domains
    except Exception as e:
        logger.warning(f"[SSL_AUTHORS] Erro ao consultar dominios do certificado: {e}")
        return []

def _update_nginx_server_names(domains: List[str]):
    """Atualiza a diretiva server_name no virtualhost cronuz-author-portal do Nginx."""
    if not os.path.exists(NGINX_CONF_PATH):
        return

    try:
        with open(NGINX_CONF_PATH, "r") as f:
            content = f.read()

        wildcards = [d for d in domains if d.startswith("*.") or d.startswith("autores.") or d.startswith("b2c.")]
        base_names = [
            "*.seller.cronuzb2b.com.br",
            "autores.seller.cronuzb2b.com.br",
            "b2c.seller.cronuzb2b.com.br",
            "b2c.seller.horusb2b.com.br",
        ]
        server_names_str = " ".join(sorted(list(set(wildcards + base_names))))

        pattern = r"server_name ~[^;]+;"
        replacement = f"server_name ~^(autores|b2c)\\..+\\.(cronuzb2b|horusb2b)\\.com\\.br$ {server_names_str};"
        new_content = re.sub(pattern, replacement, content)

        if new_content != content:
            with open(NGINX_CONF_PATH, "w") as f:
                f.write(new_content)
            subprocess.run(["nginx", "-t"], check=False)
            subprocess.run(["systemctl", "reload", "nginx"], check=False)
    except Exception as e:
        logger.warning(f"[SSL_AUTHORS] Falha ao atualizar Nginx: {e}")

def ensure_author_portal_ssl(seller_slug: str) -> bool:
    """
    Garante que o subdominio *.seller_slug.cronuzb2b.com.br esteja coberto
    pelo certificado SSL cronuz-authors e configurado no Nginx de forma dinamica.
    """
    slug = sanitize_slug(seller_slug)
    if not slug or not is_production_ssl_available():
        return False

    target_wildcards = [f"*.{slug}.cronuzb2b.com.br", f"*.{slug}.horusb2b.com.br"]
    current_domains = get_current_cert_domains()

    if all(tw in current_domains for tw in target_wildcards):
        logger.info(f"[SSL_AUTHORS] Dominios {target_wildcards} ja cobertos no certificado {CERT_NAME}.")
        _update_nginx_server_names(current_domains)
        return True

    # Adiciona os novos dominios a lista existente
    all_domains = sorted(list(set(current_domains + target_wildcards)))
    domain_args = []
    for d in all_domains:
        domain_args.extend(["-d", d])

    cmd = [
        "certbot", "certonly",
        "--dns-digitalocean",
        "--dns-digitalocean-credentials", SECRETS_PATH,
        "--cert-name", CERT_NAME,
        "--expand",
        *domain_args,
        "--agree-tos",
        "--non-interactive"
    ]

    logger.info(f"[SSL_AUTHORS] Expandindo certificado {CERT_NAME} com {target_wildcards}...")
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        if res.returncode != 0:
            logger.error(f"[SSL_AUTHORS] Erro ao expandir certificado: {res.stderr or res.stdout}")
            return False

        logger.info(f"[SSL_AUTHORS] Certificado {CERT_NAME} expandido com sucesso para {target_wildcards}.")
        _update_nginx_server_names(all_domains)
        subprocess.run(["systemctl", "reload", "nginx"], check=False)
        return True
    except Exception as e:
        logger.error(f"[SSL_AUTHORS] Falha ao executar certbot: {e}")
        return False

def sync_all_active_author_portals(db=None) -> Dict[str, Any]:
    """
    Rotina automatica que verifica todas as empresas com Portal do Autor ativo
    e garante que seus certificados SSL estejam emitidos e recarregados no Nginx.
    """
    if not is_production_ssl_available():
        logger.info("[SSL_AUTHORS] Ambiente sem credenciais de producao para SSL. Pulando sync.")
        return {"status": "skipped", "reason": "not_production"}

    close_db = False
    if db is None:
        from app.db.session import SessionLocal
        db = SessionLocal()
        close_db = True

    try:
        from app.models.company import Company
        from app.models.company_settings import CompanySettings
        from sqlalchemy import or_
        active_companies = db.query(Company).filter(
            Company.active == True,
            or_(
                Company.modulo_autores_ativo == True,
                Company.module_b2c_storefront == True,
            ),
        ).all()

        target_wildcards = ["*.seller.cronuzb2b.com.br", "*.seller.horusb2b.com.br"]
        for c in active_companies:
            raw = re.sub(
                r"^www\.",
                "",
                re.sub(r"^https?://", "", (c.domain or c.custom_domain or f"seller{c.id}").strip().lower()),
            )
            slug = sanitize_slug(raw.split("@")[0].split(".")[0])
            if slug and slug not in ("www", "app", "api"):
                target_wildcards.append(f"*.{slug}.cronuzb2b.com.br")
                target_wildcards.append(f"*.{slug}.horusb2b.com.br")
            # Também inclui o store_slug do B2C (ex: movimento-literario)
            s_cfg = db.query(CompanySettings).filter(CompanySettings.company_id == c.id).first()
            if s_cfg and isinstance(s_cfg.b2c_showcases_config, dict):
                b2c_slug = sanitize_slug(
                    str((s_cfg.b2c_showcases_config.get("branding") or {}).get("store_slug") or "")
                )
                if b2c_slug and b2c_slug not in ("www", "app", "api"):
                    target_wildcards.append(f"*.{b2c_slug}.cronuzb2b.com.br")
                    target_wildcards.append(f"*.{b2c_slug}.horusb2b.com.br")
            name_slug = sanitize_slug(c.name or "")
            if name_slug and name_slug not in ("www", "app", "api"):
                target_wildcards.append(f"*.{name_slug}.cronuzb2b.com.br")
                target_wildcards.append(f"*.{name_slug}.horusb2b.com.br")

        target_wildcards = sorted(list(set(target_wildcards)))
        current_domains = get_current_cert_domains()

        missing = [w for w in target_wildcards if w not in current_domains]
        if not missing:
            logger.info(f"[SSL_AUTHORS] Todos os {len(target_wildcards)} portais de autores ja possuem SSL ativo.")
            _update_nginx_server_names(current_domains)
            return {"status": "ok", "message": "all_covered", "domains": current_domains}

        logger.info(f"[SSL_AUTHORS] {len(missing)} novos dominios detectados para inclusao no SSL: {missing}")
        all_domains = sorted(list(set(current_domains + target_wildcards)))

        domain_args = []
        for d in all_domains:
            domain_args.extend(["-d", d])

        cmd = [
            "certbot", "certonly",
            "--dns-digitalocean",
            "--dns-digitalocean-credentials", SECRETS_PATH,
            "--cert-name", CERT_NAME,
            "--expand",
            *domain_args,
            "--agree-tos",
            "--non-interactive"
        ]

        res = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        if res.returncode != 0:
            logger.error(f"[SSL_AUTHORS] Erro ao sincronizar certificados: {res.stderr or res.stdout}")
            return {"status": "error", "detail": res.stderr or res.stdout}

        _update_nginx_server_names(all_domains)
        subprocess.run(["systemctl", "reload", "nginx"], check=False)
        logger.info(f"[SSL_AUTHORS] Sincronizacao de SSL concluida com sucesso para {len(all_domains)} dominios.")
        return {"status": "ok", "message": "certs_updated", "domains": all_domains}
    except Exception as e:
        logger.error(f"[SSL_AUTHORS] Erro inesperado durante sync: {e}")
        return {"status": "error", "detail": str(e)}
    finally:
        if close_db:
            db.close()


def ensure_custom_b2c_domain_ssl(raw_domain: Optional[str]) -> bool:
    """
    Configura automaticamente o VirtualHost no Nginx e emite o certificado SSL Let's Encrypt
    para domínios próprios de clientes (ex: parceria.movimentoliterario.com.br) quando apontados
    via CNAME (b2c-{seller}.horusb2b.com.br) ou A (64.23.182.183).
    """
    if not raw_domain or not is_production_ssl_available():
        return False

    clean_host = re.sub(r"^https?://", "", str(raw_domain).strip().lower()).split("/")[0].split(":")[0]
    if not re.match(r"^[a-z0-9.-]+\.[a-z]{2,}$", clean_host):
        return False

    # Subdomínios de 1 nível horusb2b/cronuzb2b (ex: b2c-seller.horusb2b.com.br) já possuem wildcard SSL nativo
    if clean_host.endswith(".horusb2b.com.br") or clean_host.endswith(".cronuzb2b.com.br"):
        prefix = clean_host.replace(".horusb2b.com.br", "").replace(".cronuzb2b.com.br", "")
        if "." not in prefix:
            return True

    safe_name = re.sub(r"[^a-z0-9.-]", "_", clean_host)
    avail_path = f"/etc/nginx/sites-available/b2c-custom-{safe_name}"
    enabled_path = f"/etc/nginx/sites-enabled/b2c-custom-{safe_name}"

    try:
        if not os.path.exists(avail_path):
            vhost_http = f"""server {{
    listen 80;
    server_name {clean_host};

    location /api/ {{
        proxy_pass http://127.0.0.1:8000/;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }}

    location /uploads {{
        alias /var/www/cronuz/frontend/public/uploads;
    }}

    location / {{
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }}
}}
"""
            with open(avail_path, "w") as f:
                f.write(vhost_http)
            if not os.path.exists(enabled_path):
                os.symlink(avail_path, enabled_path)
            subprocess.run(["nginx", "-t"], check=False)
            subprocess.run(["systemctl", "reload", "nginx"], check=False)

        cmd = [
            "certbot",
            "--nginx",
            "-d",
            clean_host,
            "--non-interactive",
            "--agree-tos",
            "--register-unsafely-without-email",
            "--redirect",
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if res.returncode == 0:
            logger.info(f"[SSL_B2C_CUSTOM] SSL ativado com sucesso para domínio próprio {clean_host}")
            subprocess.run(["systemctl", "reload", "nginx"], check=False)
            return True
        else:
            logger.warning(f"[SSL_B2C_CUSTOM] Certbot aguardando propagação DNS para {clean_host}: {res.stderr or res.stdout}")
            return False
    except Exception as e:
        logger.warning(f"[SSL_B2C_CUSTOM] Falha ao configurar SSL para {clean_host}: {e}")
        return False


import os
import re
import subprocess
import logging
from typing import List, Optional

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

        wildcards = [d for d in domains if d.startswith("*.") or d.startswith("autores.")]
        base_names = ["*.seller.cronuzb2b.com.br", "autores.seller.cronuzb2b.com.br"]
        server_names_str = " ".join(sorted(list(set(wildcards + base_names))))

        pattern = r"server_name ~[^;]+;"
        replacement = f"server_name ~^autores\\..+\\.cronuzb2b\\.com\\.br$ {server_names_str};"
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
    pelo certificado SSL cronuz-authors e configurado no Nginx.
    """
    slug = sanitize_slug(seller_slug)
    if not slug or not is_production_ssl_available():
        return False

    target_wildcard = f"*.{slug}.cronuzb2b.com.br"
    current_domains = get_current_cert_domains()

    if target_wildcard in current_domains:
        logger.info(f"[SSL_AUTHORS] Dominio {target_wildcard} ja coberto no certificado {CERT_NAME}.")
        _update_nginx_server_names(current_domains)
        return True

    # Adiciona o novo dominio a lista existente
    all_domains = list(set(current_domains + [target_wildcard]))
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

    logger.info(f"[SSL_AUTHORS] Expandindo certificado {CERT_NAME} com {target_wildcard}...")
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if res.returncode != 0:
            logger.error(f"[SSL_AUTHORS] Erro ao expandir certificado: {res.stderr or res.stdout}")
            return False

        logger.info(f"[SSL_AUTHORS] Certificado {CERT_NAME} expandido com sucesso para {target_wildcard}.")
        _update_nginx_server_names(all_domains)
        subprocess.run(["systemctl", "reload", "nginx"], check=False)
        return True
    except Exception as e:
        logger.error(f"[SSL_AUTHORS] Falha ao executar certbot: {e}")
        return False

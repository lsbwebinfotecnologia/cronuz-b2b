"""
app/core/utils.py
-----------------
Utilitarios compartilhados entre modulos do backend Cronuz B2B.

Centraliza funcoes que antes eram duplicadas em multiplos arquivos
(ex: parse_host_port e assert_company_ownership).
"""
import re
import logging
from typing import Any
from fastapi import HTTPException

logger = logging.getLogger(__name__)


def parse_horus_price(val: Any) -> float:
    """
    Parseia strings de preço do Horus que podem vir em múltiplos formatos:
    '29,19', '1.200,50', '29.19', ou float/int nativos.

    ATENÇÃO: Não remover esta função — é usada em:
      - storefront.py (VLR_CAPA, VLR_LIQ_CLI, VLR_LIQUIDO)
      - horus.py (LIMITE, TOTAL_DEBITOS)
      - orders.py (VLR_LIQUIDO)
    """
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)

    s = str(val).strip()
    if not s:
        return 0.0

    s = s.replace("R$", "").strip()

    # Formato BR com ponto e vírgula: 1.200,50 → 1200.50
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    # Apenas vírgula: 29,50 → 29.50
    elif "," in s:
        s = s.replace(",", ".")

    try:
        return float(s)
    except ValueError:
        return 0.0


def parse_host_port(raw_host: str, raw_port: str = "1433"):
    """
    Parseia host e porta suportando os formatos usados pelo Horus SQL Server:
      '191.9.118.243, 63215'  -> ('191.9.118.243', 63215)
      '191.9.118.243,63215'   -> ('191.9.118.243', 63215)
      '191.9.118.243:63215'   -> ('191.9.118.243', 63215)
      '191.9.118.243'         -> ('191.9.118.243', int(raw_port))

    Retorna: tuple[str, int] — (host, porta)
    """
    h = (raw_host or "").strip()
    p = (raw_port or "1433").strip()

    # Formato "IP,PORTA" ou "IP, PORTA"
    m = re.match(r'^([^,:\s]+)\s*[,:\s]\s*(\d+)$', h)
    if m:
        return m.group(1).strip(), int(m.group(2))

    # Formato "IP:PORTA" (exclui IPv6 com [])
    if ':' in h and not h.startswith('['):
        parts = h.rsplit(':', 1)
        if parts[1].isdigit():
            return parts[0].strip(), int(parts[1])

    return h, int(p) if p.isdigit() else 1433


def assert_company_ownership(current_user: Any, company_id: int) -> None:
    """
    [SEC] Valida se o usuario tem permissao para acessar os dados da empresa.
    - Usuarios MASTER possuem acesso global irrestrito a qualquer empresa.
    - Usuarios SELLER / AGENT apenas acessam sua propria empresa (current_user.company_id == company_id).
    - Suporta tanto instancias SQLAlchemy (app.models.user.User) quanto dicionarios de payload JWT.
    """
    if current_user is None:
        raise HTTPException(status_code=401, detail="Nao autenticado.")

    if isinstance(current_user, dict):
        user_type = current_user.get("type", "")
        user_company = current_user.get("company_id")
    else:
        user_type = getattr(current_user, "type", None)
        user_company = getattr(current_user, "company_id", None)

    # Se for Enum (ex: UserRole.MASTER) ou string
    if hasattr(user_type, "value"):
        user_type_str = str(user_type.value).upper()
    else:
        user_type_str = str(user_type or "").upper()

    if user_type_str == "MASTER":
        return

    # Comparacao segura de IDs
    try:
        user_cid = int(user_company) if user_company is not None else None
        target_cid = int(company_id)
    except (ValueError, TypeError):
        user_cid = user_company
        target_cid = company_id

    if user_cid != target_cid:
        raise HTTPException(
            status_code=403,
            detail="Acesso restrito: voce nao tem permissao para acessar dados desta empresa."
        )

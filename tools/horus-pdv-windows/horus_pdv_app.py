#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
══════════════════════════════════════════════════════════════════════════════
HORUS PDV — FRENTE DE CAIXA OMNICHANNEL (ONLINE & OFFLINE) — WINDOWS DESKTOP
══════════════════════════════════════════════════════════════════════════════
Aplicativo Desktop Windows (.exe standalone) integrado à arquitetura de Ponto
de Venda (PDV) do Cronuz B2B / Horus ERP.

Principais Recursos:
- Funciona 100% Online e Offline (em feiras, eventos, lojas físicas ou quedas de rede)
- Licenciamento Seguro com Chave Criptográfica (HMAC-SHA256) e Data de Validade
  liberada pelo Painel Master (funciona online e offline com trava anti-adulteração)
- Sincronização Inteligente de Catálogo Horus por Sequência (COD_ITEM_INI a COD_ITEM_FIM)
  respeitando OFFSET/LIMIT (horus_legacy_pagination) e guardando estado local de faixas
  para saber exatamente onde parou e quais faixas precisam ser recarregadas
- Login persistente do Seller (/product-search/terminal-auth) sem derrubar sessão web
- Vínculo persistente com Usuário e Sessão de Caixa (session_id)
- Busca instantânea em Cache Offline (< 1ms) + Busca em Tempo Real no Horus ERP
- Máscara brasileira automática (R$ e %) para descontos, troco e pagamentos
- Fila local resiliente com UUID idempotente (client_sale_uuid)
- Sincronização automática e manual de vendas offline para a Sessão/Usuário na API
- Geração de Relatórios Analíticos (CSV/Excel para Horus, Fechamento HTML, Excel e PDF oficiais)
"""

import base64
import csv
import hashlib
import hmac
import json
import logging
import os
import queue
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import webbrowser
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import tkinter as tk
    from tkinter import ttk, messagebox, filedialog
    HAS_TK = True
except ImportError:
    tk = None  # type: ignore
    ttk = None  # type: ignore
    messagebox = None  # type: ignore
    filedialog = None  # type: ignore
    HAS_TK = False

# ──────────────────────────────────────────────────────────────────────────────
# Diretórios e Arquivos de Persistência Local (Zero Dependências Externas)
# ──────────────────────────────────────────────────────────────────────────────
APP_VERSION = "1.5.0"
APP_TITLE = f"Horus PDV — Frente de Caixa Omnichannel (Online & Offline) v{APP_VERSION}"

if getattr(sys, "frozen", False):
    BASE_DIR = Path(sys.executable).parent
else:
    BASE_DIR = Path(__file__).parent

CONFIG_FILE = BASE_DIR / "config_pdv.json"
CATALOG_CACHE_FILE = BASE_DIR / "pos_catalog_cache.json"
CATALOG_SYNC_STATE_FILE = BASE_DIR / "pos_catalog_sync_state.json"
LOCAL_SALES_FILE = BASE_DIR / "pos_sales_local.json"
REPORTS_DIR = BASE_DIR / "relatorios"
RECEIPTS_DIR = BASE_DIR / "cupons"
LOG_DIR = BASE_DIR / "logs"

for _d in (REPORTS_DIR, RECEIPTS_DIR, LOG_DIR):
    _d.mkdir(parents=True, exist_ok=True)

LOG_FILE = LOG_DIR / "horus_pdv.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
    ],
)
logger = logging.getLogger("horus.pdv")

# Segredo criptográfico compartilhado com o Backend para verificação offline da licença
PDV_DESKTOP_LICENSE_SECRET = b"CRONUZ-HORUS-PDV-LICENSE-V1-2026-KEY-9F8A7B6C5D4E"

# Logo Oficial Horus B2B embutida em Base64 (PNG 48x48 e ICO multi-resolução para remover a pena do Tkinter no Windows)
HORUS_ICON_B64 = (
    "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"
)

HORUS_ICO_B64 = (
    "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"
)

NO_PRINTER_OPTION = "🚫 NÃO IMPRIMIR (Desativado)"

DEFAULT_CONFIG: Dict[str, Any] = {
    "api_base_url": "https://cronuzb2b.com.br/api",
    "email": "",
    "user_id": None,
    "user_name": "",
    "company_id": "",
    "company_name": "",
    "company_document": "",
    "access_token": "",
    "active_session_id": None,
    "active_session_title": "",
    "active_branch_id": None,
    "active_branch_name": "",
    "validate_stock": False,
    "allow_out_of_stock": True,
    "max_installments": 12,
    "auto_sync_enabled": True,
    "auto_sync_new_horus_items": True,
    "auto_print_receipt": False,
    "printer_name": NO_PRINTER_OPTION,
    "license_key": "",
    "last_seen_date": "",
}


# ──────────────────────────────────────────────────────────────────────────────
# Validação Criptográfica Offline/Online da Chave de Licença (Master)
# ──────────────────────────────────────────────────────────────────────────────
def verify_pdv_desktop_license_key(
    license_key: str,
    expected_company_id: Optional[str] = None,
    last_seen_date: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Valida criptograficamente o token `HPDV1.<payload_b64>.<sig>` gerado pelo Master.
    Garante que o cliente só possa utilizar o PDV (e a sincronização por Range Horus)
    se estiver dentro da validade liberada pelo Master, mesmo quando estiver offline.
    """
    raw = (license_key or "").strip()
    if not raw:
        return {
            "is_valid": False,
            "range_sync_enabled": False,
            "expires_at": None,
            "expires_at_br": None,
            "days_remaining": 0,
            "status_label": "CHAVE DE LICENÇA NÃO ATIVADA (Solicite a liberação no Master)",
        }

    parts = raw.split(".")
    if len(parts) != 3 or parts[0] != "HPDV1":
        return {
            "is_valid": False,
            "range_sync_enabled": False,
            "expires_at": None,
            "expires_at_br": None,
            "days_remaining": 0,
            "status_label": "FORMATO DE CHAVE INVÁLIDO",
        }

    b64_payload, provided_sig = parts[1], parts[2].upper()
    expected_sig = (
        hmac.new(PDV_DESKTOP_LICENSE_SECRET, b64_payload.encode("ascii"), hashlib.sha256)
        .hexdigest()[:24]
        .upper()
    )
    if not hmac.compare_digest(provided_sig, expected_sig):
        return {
            "is_valid": False,
            "range_sync_enabled": False,
            "expires_at": None,
            "expires_at_br": None,
            "days_remaining": 0,
            "status_label": "ASSINATURA DA CHAVE INVÁLIDA OU ADULTERADA",
        }

    try:
        pad = "=" * ((4 - len(b64_payload) % 4) % 4)
        payload = json.loads(base64.urlsafe_b64decode((b64_payload + pad).encode("ascii")).decode("utf-8"))
    except Exception:
        return {
            "is_valid": False,
            "range_sync_enabled": False,
            "expires_at": None,
            "expires_at_br": None,
            "days_remaining": 0,
            "status_label": "PAYLOAD DA CHAVE CORROMPIDO",
        }

    if expected_company_id and str(expected_company_id).strip().isdigit():
        if int(payload.get("cid", 0)) != int(str(expected_company_id).strip()):
            return {
                "is_valid": False,
                "range_sync_enabled": False,
                "expires_at": None,
                "expires_at_br": None,
                "days_remaining": 0,
                "status_label": f"CHAVE PERTENCE A OUTRA EMPRESA (ID {payload.get('cid')})",
            }

    if not payload.get("en"):
        return {
            "is_valid": False,
            "range_sync_enabled": False,
            "expires_at": payload.get("exp"),
            "expires_at_br": None,
            "days_remaining": 0,
            "status_label": "LICENÇA DESATIVADA PELO MASTER",
        }

    exp_str = str(payload.get("exp") or "")[:10]
    try:
        exp_date = datetime.strptime(exp_str, "%Y-%m-%d").date()
        exp_br = exp_date.strftime("%d/%m/%Y")
    except Exception:
        return {
            "is_valid": False,
            "range_sync_enabled": False,
            "expires_at": None,
            "expires_at_br": None,
            "days_remaining": 0,
            "status_label": "DATA DE VALIDADE INVÁLIDA NA CHAVE",
        }

    today = datetime.now().date()
    # Proteção contra atraso proposital do relógio do Windows
    if last_seen_date:
        try:
            last_dt = datetime.strptime(str(last_seen_date)[:10], "%Y-%m-%d").date()
            if today < last_dt:
                return {
                    "is_valid": False,
                    "range_sync_enabled": False,
                    "expires_at": exp_str,
                    "expires_at_br": exp_br,
                    "days_remaining": 0,
                    "status_label": "ERRO DE RELÓGIO DO SISTEMA (Data retroativa detectada)",
                }
        except Exception:
            pass

    days_rem = (exp_date - today).days
    if days_rem < 0:
        return {
            "is_valid": False,
            "range_sync_enabled": False,
            "expires_at": exp_str,
            "expires_at_br": exp_br,
            "days_remaining": days_rem,
            "status_label": f"LICENÇA EXPIRADA EM {exp_br} (Renove com o suporte/Master)",
        }

    range_enabled = bool(payload.get("rng"))
    return {
        "is_valid": True,
        "range_sync_enabled": range_enabled,
        "expires_at": exp_str,
        "expires_at_br": exp_br,
        "days_remaining": days_rem,
        "status_label": f"LICENÇA ATIVA ATÉ {exp_br} ({days_rem} dia(s) restante(s))",
    }


# ──────────────────────────────────────────────────────────────────────────────
# Funções Utilitárias de Persistência e Formatação Monetária (Padrão BRL)
# ──────────────────────────────────────────────────────────────────────────────
def load_config() -> Dict[str, Any]:
    cfg = dict(DEFAULT_CONFIG)
    if CONFIG_FILE.exists():
        try:
            raw = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                cfg.update(raw)
        except Exception as exc:
            logger.warning("Falha ao ler config_pdv.json: %s", exc)
    today_iso = datetime.now().strftime("%Y-%m-%d")
    if not cfg.get("last_seen_date") or today_iso > str(cfg.get("last_seen_date")):
        cfg["last_seen_date"] = today_iso
    return cfg


def save_config(cfg: Dict[str, Any]) -> None:
    try:
        today_iso = datetime.now().strftime("%Y-%m-%d")
        if not cfg.get("last_seen_date") or today_iso > str(cfg.get("last_seen_date")):
            cfg["last_seen_date"] = today_iso
        tmp = CONFIG_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")
        tmp.replace(CONFIG_FILE)
    except Exception as exc:
        logger.error("Erro ao salvar config_pdv.json: %s", exc)


def format_brl(value: float, with_prefix: bool = True) -> str:
    try:
        val = float(value or 0.0)
    except (ValueError, TypeError):
        val = 0.0
    sign = "-" if val < 0 else ""
    val = abs(val)
    formatted = f"{val:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    if with_prefix:
        return f"{sign}R$ {formatted}"
    return f"{sign}{formatted}"


def parse_atm_digits_to_float(raw_text: str, max_val: Optional[float] = None) -> float:
    digits = "".join(ch for ch in str(raw_text or "") if ch.isdigit())
    if not digits:
        return 0.0
    value = int(digits) / 100.0
    if max_val is not None and value > max_val:
        value = max_val
    return round(value, 2)


def format_atm_currency(raw_text: str, mode: str = "BRL") -> Tuple[str, float]:
    max_v = 100.0 if mode == "PCT" else None
    val = parse_atm_digits_to_float(raw_text, max_val=max_v)
    if mode == "PCT":
        txt = f"{format_brl(val, with_prefix=False)}%"
    else:
        txt = format_brl(val, with_prefix=True)
    return txt, val


DEFAULT_CONSUMER_DOC = "99999999999"
DEFAULT_CONSUMER_NAME = "Consumidor Final"


def validate_cpf_or_cnpj(raw_doc: str) -> Tuple[bool, str, str, str]:
    """
    Valida CPF (11 dígitos), CNPJ (14 dígitos) ou o código padrão de Consumidor Final (99999999999).
    Retorna: (is_valid, digits_only, doc_type, formatted_or_error_msg)
    """
    digits = "".join(ch for ch in str(raw_doc or "") if ch.isdigit())
    if not digits:
        return False, "", "EMPTY", "Informe o CPF (11 dígitos), CNPJ (14 dígitos) ou 99999999999."

    if digits == DEFAULT_CONSUMER_DOC:
        return True, DEFAULT_CONSUMER_DOC, "CONSUMIDOR_PADRAO", "Consumidor Padrão (99999999999)"

    if len(digits) == 11:
        if len(set(digits)) == 1:
            return False, digits, "CPF", "CPF inválido (dígitos repetidos)."
        s1 = sum(int(digits[i]) * (10 - i) for i in range(9))
        d1 = (s1 * 10) % 11
        if d1 == 10:
            d1 = 0
        s2 = sum(int(digits[i]) * (11 - i) for i in range(10))
        d2 = (s2 * 10) % 11
        if d2 == 10:
            d2 = 0
        if int(digits[9]) == d1 and int(digits[10]) == d2:
            fmt = f"{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}"
            return True, digits, "CPF", f"CPF Válido ({fmt})"
        return False, digits, "CPF", "CPF inválido (dígito verificador incorreto)."

    if len(digits) == 14:
        if len(set(digits)) == 1:
            return False, digits, "CNPJ", "CNPJ inválido (dígitos repetidos)."
        w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        r1 = sum(int(digits[i]) * w1[i] for i in range(12)) % 11
        d1 = 0 if r1 < 2 else (11 - r1)
        w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        r2 = sum(int(digits[i]) * w2[i] for i in range(13)) % 11
        d2 = 0 if r2 < 2 else (11 - r2)
        if int(digits[12]) == d1 and int(digits[13]) == d2:
            fmt = f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/{digits[8:12]}-{digits[12:]}"
            return True, digits, "CNPJ", f"CNPJ Válido ({fmt})"
        return False, digits, "CNPJ", "CNPJ inválido (dígito verificador incorreto)."

    return (
        False,
        digits,
        "INVALIDO",
        f"Documento com {len(digits)} dígito(s). Informe CPF (11), CNPJ (14) ou 99999999999.",
    )


def format_cpf_cnpj(raw_doc: str) -> str:
    digits = "".join(ch for ch in str(raw_doc or "") if ch.isdigit())
    if digits == DEFAULT_CONSUMER_DOC:
        return DEFAULT_CONSUMER_DOC
    if len(digits) == 11:
        return f"{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}"
    if len(digits) == 14:
        return f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/{digits[8:12]}-{digits[12:]}"
    return str(raw_doc or "").strip() or DEFAULT_CONSUMER_DOC



def apply_cart_discount(
    cart: List[Dict[str, Any]],
    discount_value: float,
    discount_mode: str = "BRL",
    scope: str = "SALE",
    selected_idx: Optional[int] = None,
) -> float:
    """
    Aplica desconto (`BRL` ou `PCT`) no carrinho:
    - `scope == "SALE"`: rateia proporcionalmente entre todos os itens do carrinho,
      ajustando centavos residuais para que a soma bata 100% com o desconto total.
    - `scope == "ITEM"`: aplica exclusivamente no item `selected_idx` do carrinho.
    Retorna o desconto total (em R$) resultante no carrinho.
    """
    if not cart:
        return 0.0

    val = max(0.0, float(discount_value or 0.0))

    if scope == "ITEM":
        if selected_idx is None or not (0 <= selected_idx < len(cart)):
            selected_idx = len(cart) - 1
        target = cart[selected_idx]
        gross = round(float(target.get("unit_price") or 0.0) * int(target.get("quantity") or 1), 2)
        if discount_mode == "PCT":
            disc_item = round(gross * (min(val, 100.0) / 100.0), 2)
        else:
            disc_item = round(min(val, gross), 2)
        target["discount"] = disc_item
        target["discount_source"] = "ITEM"
        target["discount_mode_applied"] = discount_mode
        target["discount_val_applied"] = val
        return round(sum(float(it.get("discount") or 0.0) for it in cart), 2)

    # scope == "SALE" (Ratear proporcionalmente na venda inteira)
    gross_list = [round(float(it.get("unit_price") or 0.0) * int(it.get("quantity") or 1), 2) for it in cart]
    total_gross = round(sum(gross_list), 2)
    if total_gross <= 0 or val <= 0:
        for it in cart:
            it["discount"] = 0.0
            it["discount_source"] = "NONE"
        return 0.0

    if discount_mode == "PCT":
        total_disc = round(total_gross * (min(val, 100.0) / 100.0), 2)
    else:
        total_disc = round(min(val, total_gross), 2)

    shares: List[float] = []
    for g in gross_list:
        share = round(total_disc * (g / total_gross), 2)
        share = min(share, g)
        shares.append(share)

    diff = round(total_disc - round(sum(shares), 2), 2)
    if diff != 0.0 and shares:
        for i in range(len(shares) - 1, -1, -1):
            candidate = round(shares[i] + diff, 2)
            if 0.0 <= candidate <= gross_list[i]:
                shares[i] = candidate
                break

    for it, sh in zip(cart, shares):
        it["discount"] = sh
        it["discount_source"] = "PRORATED"
        it["discount_mode_applied"] = discount_mode
        it["discount_val_applied"] = val

    return round(sum(shares), 2)


# ──────────────────────────────────────────────────────────────────────────────
# Gerenciador de Catálogo Offline, Controle de Faixas Horus e Fila de Vendas
# ──────────────────────────────────────────────────────────────────────────────
class LocalPOSStorage:
    """
    Gerencia:
    1. Cache local de produtos (`pos_catalog_cache.json`)
    2. Estado incremental da sincronização por sequência de códigos do Horus (`pos_catalog_sync_state.json`)
       para saber quais faixas (`COD_ITEM_INI` a `COD_ITEM_FIM`) já foram baixadas, qual o último código
       sincronizado e quais faixas precisam ser recarregadas para manter saldo/preço atualizados.
    3. Fila local de vendas (`pos_sales_local.json`) com UUID idempotente.
    """

    def __init__(
        self,
        catalog_path: Path = CATALOG_CACHE_FILE,
        sales_path: Path = LOCAL_SALES_FILE,
        sync_state_path: Path = CATALOG_SYNC_STATE_FILE,
    ):
        self.catalog_path = catalog_path
        self.sales_path = sales_path
        self.sync_state_path = sync_state_path
        self._lock = threading.Lock()
        self.products: List[Dict[str, Any]] = []
        self.index_by_code: Dict[str, Dict[str, Any]] = {}
        self.sales: List[Dict[str, Any]] = []
        self.sync_state: Dict[str, Any] = {
            "last_cod_item_synced": 0,
            "min_cod_item_cached": None,
            "max_cod_item_cached": None,
            "last_full_sync_at": None,
            "ranges_history": [],  # [{"cod_ini": 1, "cod_fim": 500, "items_count": 312, "synced_at": "..."}]
        }
        self.load_all()

    def load_all(self) -> None:
        with self._lock:
            if self.sync_state_path.exists():
                try:
                    st = json.loads(self.sync_state_path.read_text(encoding="utf-8"))
                    if isinstance(st, dict):
                        self.sync_state.update(st)
                except Exception as exc:
                    logger.warning("Erro ao ler pos_catalog_sync_state.json: %s", exc)

            if self.catalog_path.exists():
                try:
                    data = json.loads(self.catalog_path.read_text(encoding="utf-8"))
                    if isinstance(data, list):
                        self.products = data
                    elif isinstance(data, dict) and isinstance(data.get("items"), list):
                        self.products = data["items"]
                except Exception as exc:
                    logger.warning("Erro ao ler cache de catálogo: %s", exc)
            self._rebuild_catalog_index()

            if self.sales_path.exists():
                try:
                    s_data = json.loads(self.sales_path.read_text(encoding="utf-8"))
                    if isinstance(s_data, list):
                        dedup_sales: List[Dict[str, Any]] = []
                        seen_uuids = set()
                        for s in s_data:
                            u = s.get("client_sale_uuid")
                            if u and u in seen_uuids:
                                continue
                            if u:
                                seen_uuids.add(u)
                            dedup_sales.append(s)
                        self.sales = dedup_sales
                except Exception as exc:
                    logger.warning("Erro ao ler vendas locais: %s", exc)

    def _rebuild_catalog_index(self) -> None:
        self.index_by_code.clear()
        min_c: Optional[int] = None
        max_c: Optional[int] = None
        for prod in self.products:
            for key in ("isbn", "barcode", "sku", "id"):
                val = str(prod.get(key) or "").strip()
                if val:
                    self.index_by_code[val.upper()] = prod
                    digits = "".join(c for c in val if c.isdigit())
                    if digits:
                        self.index_by_code[digits] = prod

            raw_ci = prod.get("cod_item") if prod.get("cod_item") is not None else prod.get("COD_ITEM")
            if raw_ci is None:
                raw_ci = prod.get("sku")
            c_int: Optional[int] = None
            if isinstance(raw_ci, int):
                c_int = raw_ci
            elif str(raw_ci or "").strip().isdigit():
                c_int = int(str(raw_ci).strip())

            # Código sequencial do Horus (COD_ITEM) é menor que 1 bilhão (evita confundir com EAN-13)
            if isinstance(c_int, int) and 0 < c_int < 1_000_000_000:
                prod["cod_item"] = c_int
                if min_c is None or c_int < min_c:
                    min_c = c_int
                if max_c is None or c_int > max_c:
                    max_c = c_int

        self.sync_state["min_cod_item_cached"] = min_c
        self.sync_state["max_cod_item_cached"] = max_c

    def get_last_integrated_horus_code(self) -> int:
        """
        Identifica na prática qual foi o último código de item (COD_ITEM) do Horus
        efetivamente integrado/cadastrado no catálogo local.
        Prioriza o maior `COD_ITEM` real presente nos produtos sincronizados (`max_cod_item_cached`),
        para que faixas vazias consultadas anteriormente não façam o PDV pular itens novos.
        """
        max_cached = self.sync_state.get("max_cod_item_cached")
        if isinstance(max_cached, int) and max_cached > 0:
            return int(max_cached)
        if str(max_cached or "").strip().isdigit() and int(str(max_cached).strip()) > 0:
            return int(str(max_cached).strip())
        return int(self.sync_state.get("last_cod_item_synced") or 0)

    def save_sync_state(self) -> None:
        try:
            tmp = self.sync_state_path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self.sync_state, ensure_ascii=False, indent=2), encoding="utf-8")
            tmp.replace(self.sync_state_path)
        except Exception as exc:
            logger.error("Erro ao gravar pos_catalog_sync_state.json: %s", exc)

    def record_range_synced(
        self,
        cod_ini: int,
        cod_fim: int,
        items_count: int,
        max_cod_found: Optional[int] = None,
    ) -> None:
        with self._lock:
            now_iso = datetime.now().isoformat()
            if max_cod_found is not None and max_cod_found > 0:
                if int(max_cod_found) > int(self.sync_state.get("last_cod_item_synced") or 0):
                    self.sync_state["last_cod_item_synced"] = int(max_cod_found)
            elif int(items_count) > 0:
                if int(cod_fim) > int(self.sync_state.get("last_cod_item_synced") or 0):
                    self.sync_state["last_cod_item_synced"] = int(cod_fim)
            self.sync_state["last_full_sync_at"] = now_iso

            ranges: List[Dict[str, Any]] = list(self.sync_state.get("ranges_history") or [])
            updated = False
            for r in ranges:
                if int(r.get("cod_ini", 0)) == int(cod_ini) and int(r.get("cod_fim", 0)) == int(cod_fim):
                    r["items_count"] = int(items_count)
                    r["synced_at"] = now_iso
                    updated = True
                    break
            if not updated:
                ranges.append({
                    "cod_ini": int(cod_ini),
                    "cod_fim": int(cod_fim),
                    "items_count": int(items_count),
                    "synced_at": now_iso,
                })
            ranges.sort(key=lambda x: int(x.get("cod_ini", 0)))
            self.sync_state["ranges_history"] = ranges
            self.save_sync_state()

    def get_stale_ranges(self, max_age_hours: float = 24.0) -> List[Dict[str, Any]]:
        """
        Retorna as faixas de códigos (`cod_ini`..`cod_fim`) que foram sincronizadas
        há mais de `max_age_hours` horas (ou todas as faixas caso solicitado recarregar),
        permitindo saber exatamente quais intervalos precisam ser recarregados do Horus.
        """
        with self._lock:
            ranges: List[Dict[str, Any]] = list(self.sync_state.get("ranges_history") or [])
            if not ranges:
                return []
            cutoff = datetime.now() - timedelta(hours=max_age_hours)
            stale = []
            for r in ranges:
                s_at = r.get("synced_at")
                if not s_at:
                    stale.append(r)
                    continue
                try:
                    dt = datetime.fromisoformat(str(s_at)[:19])
                    if dt < cutoff:
                        stale.append(r)
                except Exception:
                    stale.append(r)
            return stale

    def save_catalog(self, items: List[Dict[str, Any]], merge: bool = True) -> int:
        """
        Salva e mescla itens no catálogo local com deduplicação dupla (por SKU/COD_ITEM
        e por ISBN/Código de Barras) para nunca duplicar produtos sincronizados.
        """
        with self._lock:
            base_list: List[Dict[str, Any]] = list(self.products) if merge else []
            dedup_list: List[Dict[str, Any]] = []
            by_sku: Dict[str, int] = {}
            by_isbn: Dict[str, int] = {}

            def _upsert_prod(raw_or_norm: Dict[str, Any], is_already_norm: bool = False) -> None:
                norm = raw_or_norm if is_already_norm else self.normalize_product(raw_or_norm)
                sku_key = str(norm.get("sku") or "").strip().upper()
                isbn_key = str(norm.get("isbn") or norm.get("barcode") or "").strip().upper()
                if not sku_key and not isbn_key:
                    return

                target_idx: Optional[int] = None
                if sku_key and sku_key in by_sku:
                    target_idx = by_sku[sku_key]
                elif isbn_key and isbn_key not in ("SEM_BARRAS", "") and isbn_key in by_isbn:
                    target_idx = by_isbn[isbn_key]

                if target_idx is not None:
                    dedup_list[target_idx] = norm
                else:
                    target_idx = len(dedup_list)
                    dedup_list.append(norm)

                if sku_key:
                    by_sku[sku_key] = target_idx
                if isbn_key and isbn_key not in ("SEM_BARRAS", ""):
                    by_isbn[isbn_key] = target_idx

            for existing in base_list:
                _upsert_prod(existing, is_already_norm=True)

            for item in items:
                _upsert_prod(item, is_already_norm=False)

            self.products = dedup_list
            self._rebuild_catalog_index()
            try:
                tmp = self.catalog_path.with_suffix(".tmp")
                tmp.write_text(json.dumps(self.products, ensure_ascii=False, indent=2), encoding="utf-8")
                tmp.replace(self.catalog_path)
            except Exception as exc:
                logger.error("Erro ao gravar catálogo offline: %s", exc)
            self.save_sync_state()
            return len(self.products)

    @staticmethod
    def normalize_product(raw: Dict[str, Any]) -> Dict[str, Any]:
        isbn = str(
            raw.get("isbn")
            or raw.get("barcode")
            or raw.get("COD_BARRA_ITEM")
            or raw.get("COD_ISBN_ITEM")
            or raw.get("ean")
            or ""
        ).strip()
        sku = str(
            raw.get("sku")
            or raw.get("COD_ITEM")
            or raw.get("horus_item_code")
            or raw.get("horus_code")
            or raw.get("id")
            or isbn
        ).strip()
        raw_cod = raw.get("cod_item") if raw.get("cod_item") is not None else raw.get("COD_ITEM")
        cod_item_int: Optional[int] = None
        if isinstance(raw_cod, int):
            cod_item_int = raw_cod
        elif str(raw_cod or "").strip().isdigit():
            cod_item_int = int(str(raw_cod).strip())
        elif sku.isdigit() and int(sku) < 1_000_000_000:
            cod_item_int = int(sku)
        name = str(
            raw.get("name")
            or raw.get("title")
            or raw.get("NOM_ITEM")
            or "PRODUTO SEM DESCRIÇÃO"
        ).strip()
        brand = str(
            raw.get("brand")
            or raw.get("publisher")
            or raw.get("NOM_EDITORA")
            or raw.get("author")
            or raw.get("NOM_AUTOR")
            or ""
        ).strip()
        try:
            price = float(
                raw.get("price")
                or raw.get("promotional_price")
                or raw.get("base_price")
                or raw.get("VLR_CAPA")
                or raw.get("VLR_PRECO")
                or 0.0
            )
        except (ValueError, TypeError):
            price = 0.0
        try:
            stock = int(
                float(
                    raw.get("stock_quantity")
                    or raw.get("stock")
                    or raw.get("SALDO_DISPONIVEL")
                    or raw.get("QTD_SALDO")
                    or 0
                )
            )
        except (ValueError, TypeError):
            stock = 0

        return {
            "id": str(raw.get("id") or sku or isbn),
            "cod_item": cod_item_int,
            "sku": sku,
            "isbn": isbn or sku,
            "barcode": isbn or sku,
            "name": name,
            "brand": brand,
            "price": round(price, 2),
            "stock_quantity": stock,
            "synced_at": raw.get("synced_at") or datetime.now().isoformat(),
        }

    def search_local(self, query: str, limit: int = 40) -> List[Dict[str, Any]]:
        q = (query or "").strip()
        if not q:
            return self.products[:limit]

        q_upper = q.upper()
        q_digits = "".join(c for c in q if c.isdigit())

        if q_upper in self.index_by_code:
            return [self.index_by_code[q_upper]]
        if q_digits and len(q_digits) >= 4 and q_digits in self.index_by_code:
            return [self.index_by_code[q_digits]]

        results: List[Dict[str, Any]] = []
        terms = [t for t in q_upper.split() if t]
        for prod in self.products:
            haystack = f"{prod.get('name', '')} {prod.get('isbn', '')} {prod.get('sku', '')} {prod.get('brand', '')}".upper()
            if all(t in haystack for t in terms):
                results.append(prod)
                if len(results) >= limit:
                    break
        return results

    def record_sale(
        self,
        cfg: Dict[str, Any],
        items: List[Dict[str, Any]],
        payment_method: str,
        installments: int,
        discount_amount: float,
        cash_received: Optional[float],
        change_amount: Optional[float],
        payment_splits: Optional[List[Dict[str, Any]]],
        customer_name: str,
        customer_document: str,
        notes: str = "",
    ) -> Dict[str, Any]:
        with self._lock:
            now_iso = datetime.now().isoformat()
            sale_uuid = str(uuid.uuid4())
            seq = len(self.sales) + 1
            session_id = cfg.get("active_session_id")
            sale_number = f"PDV-{session_id or 'OFF'}-{seq:04d}"

            raw_doc = (customer_document or "").strip()
            if not raw_doc:
                raw_doc = DEFAULT_CONSUMER_DOC
            is_valid_doc, clean_doc_digits, _, doc_msg = validate_cpf_or_cnpj(raw_doc)
            if not is_valid_doc:
                raise ValueError(f"CPF/CNPJ inválido: {doc_msg}")

            clean_cust_name = (customer_name or "").strip() or DEFAULT_CONSUMER_NAME

            items_copy = [dict(it) for it in items]
            subtotal = round(sum(float(i["unit_price"]) * int(i["quantity"]) for i in items_copy), 2)
            existing_item_disc = round(sum(float(i.get("discount") or 0.0) for i in items_copy), 2)
            requested_disc = round(min(float(discount_amount or 0.0), subtotal), 2)

            if requested_disc > 0 and existing_item_disc == 0.0:
                apply_cart_discount(items_copy, requested_disc, discount_mode="BRL", scope="SALE")
                discount = round(sum(float(i.get("discount") or 0.0) for i in items_copy), 2)
            elif existing_item_disc > 0:
                discount = round(min(existing_item_disc, subtotal), 2)
            else:
                discount = 0.0

            total = round(max(0.0, subtotal - discount), 2)

            sale_record: Dict[str, Any] = {
                "client_sale_uuid": sale_uuid,
                "sale_number": sale_number,
                "session_id": int(session_id) if session_id else None,
                "session_title": str(cfg.get("active_session_title") or ""),
                "company_id": int(cfg["company_id"]) if str(cfg.get("company_id") or "").isdigit() else None,
                "company_name": str(cfg.get("company_name") or ""),
                "user_id": cfg.get("user_id"),
                "user_email": str(cfg.get("email") or ""),
                "user_name": str(cfg.get("user_name") or cfg.get("email") or "Operador PDV"),
                "customer_name": clean_cust_name,
                "customer_document": clean_doc_digits,
                "payment_method": payment_method,
                "installments": int(installments or 1),
                "payment_splits": payment_splits,
                "subtotal": subtotal,
                "discount_amount": discount,
                "total_amount": total,
                "cash_received": round(float(cash_received), 2) if cash_received is not None else None,
                "change_amount": round(float(change_amount), 2) if change_amount is not None else None,
                "notes": notes or None,
                "created_at": now_iso,
                "synced": False,
                "synced_at": None,
                "server_sale_id": None,
                "items": [
                    {
                        "product_id": str(it.get("id") or it.get("sku") or ""),
                        "sku": str(it.get("sku") or ""),
                        "isbn": str(it.get("isbn") or it.get("barcode") or ""),
                        "name": str(it.get("name") or ""),
                        "quantity": int(it["quantity"]),
                        "unit_price": round(float(it["unit_price"]), 2),
                        "discount": round(float(it.get("discount") or 0.0), 2),
                        "total_price": round(
                            max(0.0, float(it["unit_price"]) * int(it["quantity"]) - float(it.get("discount") or 0.0)),
                            2,
                        ),
                    }
                    for it in items_copy
                ],
            }

            self.sales.append(sale_record)
            self._save_sales_unlocked()
            return sale_record

    def _save_sales_unlocked(self) -> None:
        try:
            tmp = self.sales_path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self.sales, ensure_ascii=False, indent=2), encoding="utf-8")
            tmp.replace(self.sales_path)
        except Exception as exc:
            logger.error("Erro ao salvar pos_sales_local.json: %s", exc)

    def get_pending_sales(self, session_id: Optional[int] = None) -> List[Dict[str, Any]]:
        with self._lock:
            pending = [s for s in self.sales if not s.get("synced")]
            if session_id is not None:
                pending = [
                    s for s in pending
                    if s.get("session_id") in (None, session_id)
                ]
            return pending

    def mark_sales_synced(self, uuids: List[str], target_session_id: int) -> int:
        with self._lock:
            now_iso = datetime.now().isoformat()
            uuid_set = set(uuids)
            count = 0
            for s in self.sales:
                if s.get("client_sale_uuid") in uuid_set:
                    s["synced"] = True
                    s["synced_at"] = now_iso
                    s["session_id"] = target_session_id
                    count += 1
            if count > 0:
                self._save_sales_unlocked()
            return count

    def merge_server_sales(self, server_sales: List[Dict[str, Any]], session_id: int) -> None:
        with self._lock:
            by_uuid = {s.get("client_sale_uuid"): s for s in self.sales if s.get("client_sale_uuid")}
            changed = False
            for srv in server_sales:
                c_uuid = srv.get("client_sale_uuid")
                if not c_uuid:
                    continue
                if c_uuid in by_uuid:
                    loc = by_uuid[c_uuid]
                    if not loc.get("synced"):
                        loc["synced"] = True
                        loc["synced_at"] = srv.get("synced_at") or datetime.now().isoformat()
                        loc["server_sale_id"] = srv.get("id")
                        changed = True
                else:
                    self.sales.append({
                        "client_sale_uuid": c_uuid,
                        "sale_number": f"SRV-{srv.get('id', '')}",
                        "session_id": session_id,
                        "company_id": srv.get("company_id"),
                        "user_id": srv.get("user_id"),
                        "customer_name": srv.get("customer_name"),
                        "customer_document": srv.get("customer_document"),
                        "payment_method": srv.get("payment_method", "DINHEIRO"),
                        "installments": srv.get("installments", 1),
                        "payment_splits": srv.get("payment_splits"),
                        "subtotal": float(srv.get("subtotal") or srv.get("total_amount") or 0.0),
                        "discount_amount": float(srv.get("discount_amount") or 0.0),
                        "total_amount": float(srv.get("total_amount") or 0.0),
                        "cash_received": srv.get("cash_received"),
                        "change_amount": srv.get("change_amount"),
                        "created_at": srv.get("created_at") or datetime.now().isoformat(),
                        "synced": True,
                        "synced_at": srv.get("synced_at") or srv.get("created_at"),
                        "server_sale_id": srv.get("id"),
                        "items": srv.get("items") or [],
                    })
                    changed = True
            if changed:
                self._save_sales_unlocked()

    def export_csv_for_horus(self, target_path: Path, session_id: Optional[int] = None) -> int:
        with self._lock:
            rows_written = 0
            sales_to_export = self.sales
            if session_id is not None:
                sales_to_export = [
                    s for s in self.sales
                    if s.get("session_id") in (None, session_id)
                ]

            headers = [
                "UUID_VENDA",
                "NUMERO_VENDA",
                "SESSAO_ID",
                "OPERADOR_EMAIL",
                "DATA_HORA_VENDA",
                "STATUS_SINCRONIZACAO",
                "DATA_SINCRONIZACAO",
                "CLIENTE_NOME",
                "CLIENTE_CPF_CNPJ",
                "FORMA_PAGAMENTO",
                "PARCELAS",
                "COD_ITEM_HORUS_SKU",
                "ISBN_CODIGO_BARRAS",
                "DESCRICAO_PRODUTO",
                "QUANTIDADE",
                "PRECO_UNITARIO_BRL",
                "SUBTOTAL_ITEM_BRL",
                "DESCONTO_VENDA_BRL",
                "TOTAL_LIQUIDO_VENDA_BRL",
            ]

            with open(target_path, mode="w", encoding="utf-8-sig", newline="") as f:
                writer = csv.writer(f, delimiter=";")
                writer.writerow(headers)
                for sale in sales_to_export:
                    items = sale.get("items") or [{}]
                    sync_label = "SINCRONIZADO_API" if sale.get("synced") else "PENDENTE_OFFLINE"
                    for item in items:
                        writer.writerow([
                            sale.get("client_sale_uuid", ""),
                            sale.get("sale_number", ""),
                            sale.get("session_id") or "",
                            sale.get("user_email") or sale.get("user_name") or "",
                            sale.get("created_at", ""),
                            sync_label,
                            sale.get("synced_at") or "",
                            sale.get("customer_name") or "Consumidor Final",
                            sale.get("customer_document") or "",
                            sale.get("payment_method", ""),
                            sale.get("installments", 1),
                            item.get("sku") or item.get("product_id") or "",
                            item.get("isbn") or "",
                            item.get("name") or "",
                            item.get("quantity", 1),
                            f"{float(item.get('unit_price') or 0.0):.2f}".replace(".", ","),
                            f"{float(item.get('total_price') or 0.0):.2f}".replace(".", ","),
                            f"{float(sale.get('discount_amount') or 0.0):.2f}".replace(".", ","),
                            f"{float(sale.get('total_amount') or 0.0):.2f}".replace(".", ","),
                        ])
                        rows_written += 1
            return rows_written


# ──────────────────────────────────────────────────────────────────────────────
# Cliente HTTP para Comunicação com a API Cronuz B2B / Horus PDV
# ──────────────────────────────────────────────────────────────────────────────
class CronuzPOSApiClient:
    """Cliente REST sem dependências externas para comunicação com o Backend."""

    def __init__(self, cfg: Dict[str, Any]):
        self.cfg = cfg

    @property
    def base_url(self) -> str:
        return str(self.cfg.get("api_base_url") or "https://cronuzb2b.com.br/api").rstrip("/")

    @property
    def company_id(self) -> str:
        return str(self.cfg.get("company_id") or "").strip()

    def _headers(self, json_body: bool = True) -> Dict[str, str]:
        h = {
            "Accept": "application/json",
            "User-Agent": f"HorusPDV-Windows/{APP_VERSION}",
        }
        if json_body:
            h["Content-Type"] = "application/json; charset=utf-8"
        token = str(self.cfg.get("access_token") or "").strip()
        if token:
            h["Authorization"] = f"Bearer {token}"
        return h

    def _request(
        self,
        method: str,
        path: str,
        payload: Optional[Dict[str, Any]] = None,
        timeout: float = 12.0,
    ) -> Tuple[int, Any]:
        url = f"{self.base_url}/{path.lstrip('/')}"
        data = None
        if payload is not None:
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")

        req = urllib.request.Request(url, data=data, headers=self._headers(), method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                return resp.status, json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", errors="replace")
            try:
                err_json = json.loads(raw)
            except Exception:
                err_json = {"detail": raw or str(e)}
            return e.code, err_json
        except Exception as exc:
            return 0, {"detail": f"Sem conexão com o servidor ({exc})"}

    def authenticate_seller(self, email: str, password: str, company_id: Optional[str] = None) -> Tuple[bool, str, Dict[str, Any]]:
        payload: Dict[str, Any] = {
            "email": email.strip(),
            "password": password,
            "terminal_name": f"HorusPDV-{os.environ.get('COMPUTERNAME', 'Windows')}",
        }
        if company_id and str(company_id).strip().isdigit():
            payload["company_id"] = int(str(company_id).strip())

        status, body = self._request("POST", "/product-search/terminal-auth", payload=payload, timeout=15.0)
        if status == 200 and isinstance(body, dict) and body.get("access_token"):
            self.cfg["access_token"] = body["access_token"]
            self.cfg["company_id"] = str(body.get("company_id") or "")
            self.cfg["company_name"] = str(body.get("company_name") or "")
            self.cfg["company_document"] = str(body.get("company_document") or "")
            self.cfg["user_name"] = str(body.get("user_name") or email)
            self.cfg["email"] = email.strip()
            save_config(self.cfg)
            return True, "Autenticado com sucesso!", body

        detail = body.get("detail") if isinstance(body, dict) else str(body)
        return False, f"Falha na autenticação (HTTP {status}): {detail}", body if isinstance(body, dict) else {}

    def get_pos_config(self) -> Tuple[bool, Dict[str, Any]]:
        if not self.company_id:
            return False, {"detail": "Company ID não configurado."}
        status, body = self._request("GET", f"/companies/{self.company_id}/pos/config", timeout=8.0)
        if status == 200 and isinstance(body, dict):
            return True, body
        return False, body if isinstance(body, dict) else {"detail": str(body)}

    def fetch_desktop_license(self, timeout: float = 8.0) -> Tuple[bool, str, Dict[str, Any]]:
        """
        Busca a chave de licença e data de validade liberadas pelo Master para este Seller.
        Sempre atualiza (ou revoga) a chave local quando o servidor responde HTTP 200,
        garantindo que qualquer alteração de validade no Master tenha efeito imediato mesmo com a tela aberta.
        """
        if not self.company_id:
            return False, "Faça login do Seller primeiro.", {}
        st, body = self._request("GET", f"/companies/{self.company_id}/pos/desktop-license", timeout=timeout)
        if st == 200 and isinstance(body, dict):
            lic_key = body.get("license_key") or ""
            is_val = bool(body.get("is_valid"))
            self.cfg["license_key"] = lic_key
            save_config(self.cfg)
            if is_val and lic_key:
                return True, f"Chave sincronizada com sucesso! {body.get('status_label', '')}", body
            return False, f"Licença bloqueada ou expirada no Master: {body.get('status_label', '')}", body
        detail = body.get("detail") if isinstance(body, dict) else str(body)
        return False, f"Falha ao consultar licença no servidor (HTTP {st}): {detail}", {}

    def sync_horus_catalog_range(
        self,
        cod_item_ini: int,
        cod_item_fim: int,
        session_id: Optional[int] = None,
        branch_id: Optional[int] = None,
        limit: int = 500,
    ) -> Tuple[bool, str, Dict[str, Any]]:
        """
        Consulta um lote de produtos no Horus ERP usando COD_ITEM_INI e COD_ITEM_FIM,
        respeitando OFFSET/LIMIT (horus_legacy_pagination) e trazendo o saldo da filial.
        """
        if not self.company_id:
            return False, "Seller não configurado.", {}
        payload = {
            "cod_item_ini": int(cod_item_ini),
            "cod_item_fim": int(cod_item_fim),
            "session_id": int(session_id) if session_id else None,
            "branch_id": int(branch_id) if branch_id else None,
            "offset": 0,
            "limit": int(limit),
            "merge_into_session": True,
        }
        st, body = self._request(
            "POST",
            f"/companies/{self.company_id}/pos/horus-catalog-range",
            payload=payload,
            timeout=35.0,
        )
        if st == 200 and isinstance(body, dict) and body.get("status") == "ok":
            items = body.get("items") or []
            return True, f"Faixa {cod_item_ini}..{cod_item_fim}: {len(items)} produto(s) retornado(s) do Horus.", body
        detail = body.get("detail") if isinstance(body, dict) else str(body)
        return False, f"Erro na faixa {cod_item_ini}..{cod_item_fim} (HTTP {st}): {detail}", {}

    def list_sessions(self, status_filter: Optional[str] = None) -> Tuple[bool, List[Dict[str, Any]]]:
        if not self.company_id:
            return False, []
        q = f"?status={status_filter}" if status_filter else ""
        st, body = self._request("GET", f"/companies/{self.company_id}/pos/sessions{q}", timeout=10.0)
        if st == 200 and isinstance(body, list):
            return True, body
        return False, []

    def create_session(
        self,
        title: str,
        catalog_source: str = "GENERAL",
        initial_cash_amount: float = 0.0,
        branch_id: Optional[int] = None,
        validate_stock: bool = False,
    ) -> Tuple[bool, str, Dict[str, Any]]:
        if not self.company_id:
            return False, "Configure o login do Seller primeiro.", {}
        payload = {
            "title": title.strip(),
            "catalog_source": catalog_source,
            "initial_cash_amount": round(float(initial_cash_amount or 0.0), 2),
            "branch_id": branch_id,
            "validate_stock": bool(validate_stock),
        }
        st, body = self._request("POST", f"/companies/{self.company_id}/pos/sessions", payload=payload, timeout=15.0)
        if st in (200, 201) and isinstance(body, dict) and body.get("id"):
            return True, f"Sessão #{body['id']} aberta com sucesso!", body
        detail = body.get("detail") if isinstance(body, dict) else str(body)
        return False, f"Erro ao abrir sessão (HTTP {st}): {detail}", {}

    def update_session_settings(self, session_id: int, validate_stock: bool) -> Tuple[bool, str, Dict[str, Any]]:
        if not self.company_id or not session_id:
            return False, "Sessão não selecionada.", {}
        payload = {"validate_stock": bool(validate_stock)}
        st, body = self._request(
            "PUT",
            f"/companies/{self.company_id}/pos/sessions/{session_id}/settings",
            payload=payload,
            timeout=10.0,
        )
        if st == 200 and isinstance(body, dict):
            return True, "Configuração de estoque da sessão atualizada!", body
        detail = body.get("detail") if isinstance(body, dict) else str(body)
        return False, f"Erro ao atualizar sessão (HTTP {st}): {detail}", {}

    def get_close_summary(self, session_id: int) -> Tuple[bool, Dict[str, Any]]:
        st, body = self._request("GET", f"/companies/{self.company_id}/pos/sessions/{session_id}/close-summary", timeout=10.0)
        return (st == 200 and isinstance(body, dict)), (body if isinstance(body, dict) else {})

    def close_session(self, session_id: int, closing_cash_amount: float, notes: str = "") -> Tuple[bool, str]:
        payload = {
            "closed_cash_amount": round(float(closing_cash_amount or 0.0), 2),
            "closing_notes": notes,
        }
        st, body = self._request("PUT", f"/companies/{self.company_id}/pos/sessions/{session_id}/close", payload=payload, timeout=12.0)
        if st == 200:
            return True, "Sessão encerrada com sucesso no servidor!"
        detail = body.get("detail") if isinstance(body, dict) else str(body)
        return False, f"Falha ao fechar sessão (HTTP {st}): {detail}"

    def download_session_catalog(self, session_id: int, source: str = "GENERAL") -> Tuple[bool, str, List[Dict[str, Any]]]:
        if not self.company_id:
            return False, "Company ID ausente.", []

        st, body = self._request(
            "GET",
            f"/companies/{self.company_id}/pos/sessions/{session_id}/products?page=1&limit=5000",
            timeout=25.0,
        )
        if st == 200 and isinstance(body, dict) and body.get("items"):
            items = body["items"]
            return True, f"{len(items)} produtos baixados da sessão #{session_id}.", items

        st2, body2 = self._request(
            "GET",
            f"/companies/{self.company_id}/pos/catalog-load?source={source}&session_id={session_id}&limit=5000",
            timeout=35.0,
        )
        if st2 == 200 and isinstance(body2, dict) and isinstance(body2.get("items"), list):
            items = body2["items"]
            return True, f"{len(items)} produtos carregados da fonte {source}.", items

        detail = body2.get("detail") if isinstance(body2, dict) else str(body2)
        return False, f"Não foi possível baixar o catálogo (HTTP {st2}): {detail}", []

    def realtime_search_horus(self, term: str, session_id: Optional[int] = None, branch_id: Optional[int] = None) -> List[Dict[str, Any]]:
        if not self.company_id or not term.strip():
            return []
        params = {"term": term.strip()}
        if session_id:
            params["session_id"] = str(session_id)
        if branch_id:
            params["branch_id"] = str(branch_id)
        qs = urllib.parse.urlencode(params)
        st, body = self._request("GET", f"/companies/{self.company_id}/pos/realtime-search?{qs}", timeout=10.0)
        if st == 200 and isinstance(body, dict) and isinstance(body.get("items"), list):
            return body["items"]
        return []

    def sync_pending_sales(self, session_id: int, pending_sales: List[Dict[str, Any]]) -> Tuple[bool, str, Dict[str, Any]]:
        if not self.company_id:
            return False, "Seller não configurado.", {}
        if not session_id:
            return False, "Nenhuma Sessão de Caixa ativa selecionada para receber as vendas.", {}
        if not pending_sales:
            return True, "Nenhuma venda pendente para sincronizar.", {"synced": 0, "skipped_duplicates": 0}

        sales_payload = []
        seen_batch_uuids = set()
        for s in pending_sales:
            c_uuid = str(s.get("client_sale_uuid") or "").strip()
            if not c_uuid or c_uuid in seen_batch_uuids:
                continue
            seen_batch_uuids.add(c_uuid)

            raw_items = s.get("items") or []
            items_count = max(1, int(sum(int(it.get("quantity") or 1) for it in raw_items)))
            sold_at_iso = s.get("sold_at") or s.get("created_at") or datetime.now().isoformat()
            disc_val = float(s.get("discount") if s.get("discount") is not None else (s.get("discount_amount") or 0.0))

            extra_details: Dict[str, Any] = {"installments": int(s.get("installments") or 1)}
            if s.get("payment_splits"):
                extra_details["payments"] = s.get("payment_splits")
            if s.get("cash_received") is not None:
                extra_details["cash_received"] = s.get("cash_received")
            if s.get("change_amount") is not None:
                extra_details["change_amount"] = s.get("change_amount")

            sales_payload.append({
                "client_sale_uuid": c_uuid,
                "sale_number": s.get("sale_number"),
                "session_id": int(session_id),
                "customer_name": s.get("customer_name") or "Consumidor Final",
                "customer_document": s.get("customer_document"),
                "payment_method": s.get("payment_method", "DINHEIRO"),
                "payment_details": json.dumps(extra_details, ensure_ascii=False),
                "installments": int(s.get("installments") or 1),
                "payment_splits": s.get("payment_splits"),
                "subtotal": float(s.get("subtotal") or s.get("total_amount") or 0.0),
                "discount": disc_val,
                "discount_amount": disc_val,
                "total_amount": float(s.get("total_amount") or 0.0),
                "items_count": items_count,
                "sold_at": sold_at_iso,
                "created_at": sold_at_iso,
                "cash_received": s.get("cash_received"),
                "change_amount": s.get("change_amount"),
                "notes": s.get("notes"),
                "origin": "pdv_offline",
                "items": [
                    {
                        "product_id": None,
                        "sku": str(it.get("sku") or it.get("product_id") or ""),
                        "horus_item_code": str(it.get("sku") or it.get("product_id") or ""),
                        "barcode": str(it.get("isbn") or it.get("barcode") or it.get("sku") or "SEM_BARRAS"),
                        "isbn": str(it.get("isbn") or it.get("barcode") or it.get("sku") or ""),
                        "title": str(it.get("name") or it.get("title") or "Item PDV"),
                        "name": str(it.get("name") or it.get("title") or "Item PDV"),
                        "quantity": int(it.get("quantity") or 1),
                        "unit_price": float(it.get("unit_price") or 0.0),
                        "discount": float(it.get("discount") or 0.0),
                        "total_price": float(it.get("total_price") or 0.0),
                    }
                    for it in raw_items
                ],
            })

        batch = {
            "session_id": int(session_id),
            "sales": sales_payload,
        }
        st, body = self._request("POST", f"/companies/{self.company_id}/pos/sync-sales", payload=batch, timeout=25.0)
        if st == 200 and isinstance(body, dict) and (body.get("status") == "ok" or "success_count" in body):
            synced_n = int(body.get("synced") if body.get("synced") is not None else (body.get("success_count") or 0))
            dup_n = int(body.get("skipped_duplicates") if body.get("skipped_duplicates") is not None else (body.get("already_synced_count") or 0))
            return True, f"Sincronização concluída! ({synced_n} novas vendas gravadas na sessão #{session_id}, {dup_n} já sincronizadas).", body

        detail = body.get("detail") if isinstance(body, dict) else str(body)
        return False, f"Falha ao sincronizar vendas (HTTP {st}): {detail}", {}

    def fetch_server_sales(self, session_id: int) -> Tuple[bool, Dict[str, Any]]:
        if not self.company_id or not session_id:
            return False, {}
        st, body = self._request("GET", f"/companies/{self.company_id}/pos/sales?session_id={session_id}", timeout=12.0)
        if st == 200:
            if isinstance(body, list):
                return True, {"items": body}
            if isinstance(body, dict):
                return True, body
        return False, {}

    def download_official_report(self, session_id: int, fmt: str, target_file: Path) -> Tuple[bool, str]:
        if not self.company_id:
            return False, "Seller não configurado."
        url = f"{self.base_url}/companies/{self.company_id}/pos/reports/sales?session_id={session_id}&format={fmt}"
        req = urllib.request.Request(url, headers=self._headers(json_body=False), method="GET")
        try:
            with urllib.request.urlopen(req, timeout=25.0) as resp:
                content = resp.read()
                target_file.write_bytes(content)
                return True, f"Relatório salvo em: {target_file}"
        except Exception as exc:
            return False, f"Erro ao baixar relatório do servidor: {exc}"


# ──────────────────────────────────────────────────────────────────────────────
# Descoberta de Impressoras da Máquina, Bobina Dinâmica 80mm e Impressão Direta
# ──────────────────────────────────────────────────────────────────────────────
def list_installed_printers() -> Tuple[List[str], Optional[str]]:
    """
    Busca todas as impressoras instaladas na máquina (Windows via winreg/PowerShell
    sem abrir janela preta, ou macOS/Linux via lpstat) e retorna:
    `(lista_com_opcao_nao_imprimir_no_topo, impressora_padrao_do_sistema)`.
    """
    found: List[str] = []
    default_printer: Optional[str] = None

    if os.name == "nt":
        try:
            import winreg  # type: ignore

            try:
                with winreg.OpenKey(
                    winreg.HKEY_CURRENT_USER,
                    r"Software\Microsoft\Windows NT\CurrentVersion\Windows",
                ) as key_def:
                    dev_val, _ = winreg.QueryValueEx(key_def, "Device")
                    if dev_val and isinstance(dev_val, str):
                        default_printer = dev_val.split(",")[0].strip()
            except Exception:
                pass

            for root_hkey, subkey in (
                (winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows NT\CurrentVersion\Devices"),
                (winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\Print\Printers"),
            ):
                try:
                    with winreg.OpenKey(root_hkey, subkey) as k:
                        num_vals = winreg.QueryInfoKey(k)[1]
                        for i in range(num_vals):
                            v_name = winreg.EnumValue(k, i)[0].strip()
                            if v_name and v_name not in found:
                                found.append(v_name)
                        num_sub = winreg.QueryInfoKey(k)[0]
                        for i in range(num_sub):
                            s_name = winreg.EnumKey(k, i).strip()
                            if s_name and s_name not in found:
                                found.append(s_name)
                except Exception:
                    pass
        except Exception:
            pass

        if not found:
            try:
                flags = 0x08000000  # CREATE_NO_WINDOW
                res = subprocess.run(
                    [
                        "powershell",
                        "-NoProfile",
                        "-NonInteractive",
                        "-WindowStyle",
                        "Hidden",
                        "-Command",
                        "Get-Printer | Select-Object -ExpandProperty Name",
                    ],
                    capture_output=True,
                    text=True,
                    timeout=5.0,
                    creationflags=flags,
                )
                for line in (res.stdout or "").splitlines():
                    p = line.strip()
                    if p and p not in found:
                        found.append(p)
            except Exception:
                pass
    else:
        try:
            res_def = subprocess.run(["lpstat", "-d"], capture_output=True, text=True, timeout=3.0)
            out_def = (res_def.stdout or "").strip()
            if ":" in out_def:
                cand = out_def.split(":", 1)[1].strip()
                if cand and "no system default" not in cand.lower():
                    default_printer = cand
        except Exception:
            pass

        try:
            res_p = subprocess.run(["lpstat", "-a"], capture_output=True, text=True, timeout=3.0)
            for line in (res_p.stdout or "").splitlines():
                parts = line.strip().split()
                if parts:
                    p = parts[0].strip()
                    if p and p not in found:
                        found.append(p)
        except Exception:
            pass

    ordered: List[str] = [NO_PRINTER_OPTION]
    if default_printer and default_printer in found:
        ordered.append(default_printer)
    for p in sorted(found):
        if p not in ordered:
            ordered.append(p)
    return ordered, default_printer


def format_thermal_receipt_text(
    sale_or_draft: Dict[str, Any],
    cfg: Dict[str, Any],
    is_preview: bool = False,
) -> str:
    """
    Formata o Cupom Não-Fiscal (bobina 80mm / 42 colunas) tanto para a visualização
    dinâmica em tempo real na esquerda do PDV quanto para o envio direto à impressora.
    """
    W = 42
    sep_double = "=" * W
    sep_dash = "-" * W

    def center(txt: str) -> str:
        return txt[:W].center(W)

    def lr(left_txt: str, right_txt: str) -> str:
        space = W - len(left_txt) - len(right_txt)
        if space >= 1:
            return f"{left_txt}{' ' * space}{right_txt}"
        max_l = max(1, W - len(right_txt) - 1)
        return f"{left_txt[:max_l]} {right_txt}"

    company = (cfg.get("company_name") or "HORUS PDV B2B").upper()
    cnpj = cfg.get("company_document") or "---"
    sess_id = sale_or_draft.get("session_id") or cfg.get("active_session_id") or "OFFLINE"
    sess_title = sale_or_draft.get("session_title") or cfg.get("active_session_title") or "PDV"
    op_name = sale_or_draft.get("user_name") or cfg.get("user_name") or cfg.get("email") or "Operador"
    dt_str = (sale_or_draft.get("created_at") or datetime.now().isoformat())[:19].replace("T", " ")
    sale_num = sale_or_draft.get("sale_number") or ("EM ABERTO (CAIXA)" if is_preview else "PDV")

    cust_name = (sale_or_draft.get("customer_name") or DEFAULT_CONSUMER_NAME).strip()
    cust_doc = format_cpf_cnpj((sale_or_draft.get("customer_document") or DEFAULT_CONSUMER_DOC).strip())

    lines: List[str] = [
        sep_double,
        center(company),
        center(f"CNPJ: {cnpj}"),
        center(f"Sessao #{sess_id} - {sess_title[:24]}"),
        sep_dash,
        center("CUPOM NAO-FISCAL (80mm)"),
        lr(f"Venda: {sale_num}", dt_str[11:] if len(dt_str) >= 16 else dt_str),
        f"Data : {dt_str[:10]}  |  Op: {str(op_name)[:16]}",
        sep_dash,
        f"CLIENTE : {cust_name[:32]}",
        f"CPF/CNPJ: {cust_doc}",
        sep_dash,
        "ITEM COD/ISBN      DESCRICAO",
        lr("     QTD x UNIT", "DESC       TOTAL"),
        sep_dash,
    ]

    items = sale_or_draft.get("items") or []
    if not items:
        lines.append(center("(Aguardando leitura de itens...)"))
        lines.append(center("Bipe o codigo de barras ou F2"))
    else:
        for idx, it in enumerate(items, start=1):
            code = str(it.get("isbn") or it.get("sku") or "")[:13]
            name = str(it.get("name") or "")[:22]
            qty = int(it.get("quantity") or 1)
            unit_p = float(it.get("unit_price") or 0.0)
            disc_i = float(it.get("discount") or 0.0)
            gross_i = round(unit_p * qty, 2)
            net_i = round(max(0.0, gross_i - disc_i), 2)

            lines.append(f"{idx:02d}   {code:<13} {name}")
            left_part = f"     {qty}x {format_brl(unit_p, False)}"
            disc_part = f"-{format_brl(disc_i, False)}" if disc_i > 0 else ""
            right_part = f"{disc_part:>9} {format_brl(net_i, False):>10}".strip()
            lines.append(lr(left_part, right_part))

    subtotal = float(sale_or_draft.get("subtotal") or 0.0)
    disc_tot = float(sale_or_draft.get("discount_amount") or 0.0)
    total = float(sale_or_draft.get("total_amount") or 0.0)
    pay_method = str(sale_or_draft.get("payment_method") or "DINHEIRO")
    installments = int(sale_or_draft.get("installments") or 1)
    cash_rec = sale_or_draft.get("cash_received")
    change_amt = sale_or_draft.get("change_amount")

    lines.append(sep_dash)
    lines.append(lr("SUBTOTAL:", format_brl(subtotal)))
    if disc_tot > 0:
        lines.append(lr("DESCONTO APLICADO:", f"- {format_brl(disc_tot)}"))
    lines.append(sep_double)
    lines.append(lr("TOTAL A PAGAR:", format_brl(total)))
    lines.append(sep_double)

    inst_label = f"{installments}x"
    if installments > 1 and total > 0:
        inst_label = f"{installments}x de {format_brl(round(total / installments, 2))}"
    lines.append(lr("PAGAMENTO:", f"{pay_method} ({inst_label})"))

    if cash_rec is not None and float(cash_rec or 0.0) > 0:
        lines.append(lr("VALOR RECEBIDO:", format_brl(float(cash_rec))))
    if change_amt is not None and float(change_amt or 0.0) > 0:
        lines.append(lr("TROCO:", format_brl(float(change_amt))))

    lines.append(sep_dash)
    if is_preview:
        lines.append(center("*** CUPOM EM CONSTRUCAO (F12 FINALIZAR) ***"))
    else:
        c_uuid = str(sale_or_draft.get("client_sale_uuid") or "")[:18]
        st_lbl = "SINCRONIZADO ONLINE" if sale_or_draft.get("synced") else "GRAVADO NO CAIXA PDV"
        lines.append(center(st_lbl))
        if c_uuid:
            lines.append(center(f"Protocolo: {c_uuid}"))
        lines.append(center("Obrigado pela preferencia!"))
    lines.append(sep_double)
    return "\n".join(lines) + "\n\n\n"


def send_receipt_to_printer(
    receipt_text: str,
    printer_name: str,
    sale_number: str = "CUPOM",
) -> Tuple[bool, str]:
    """
    Envia o cupom diretamente da tela do PDV para a impressora selecionada na máquina,
    sem abrir navegador web ou janelas externas.
    Se estiver configurado como `NÃO IMPRIMIR (Desativado)`, não imprime nada.
    """
    clean_printer = (printer_name or "").strip()
    if not clean_printer or clean_printer == NO_PRINTER_OPTION or clean_printer.startswith("🚫"):
        return False, "Impressão desativada (configurada para não imprimir)."

    safe_num = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in str(sale_number))
    txt_path = RECEIPTS_DIR / f"cupom_{safe_num}_{int(time.time())}.txt"
    try:
        txt_path.write_text(receipt_text, encoding="utf-8")
    except Exception as exc:
        return False, f"Erro ao gravar arquivo temporário de impressão: {exc}"

    if os.name == "nt":
        flags = 0x08000000  # CREATE_NO_WINDOW
        escaped_path = str(txt_path).replace("'", "''")
        escaped_printer = clean_printer.replace("'", "''")
        ps_cmd = (
            f"Get-Content -LiteralPath '{escaped_path}' -Encoding UTF8 | "
            f"Out-Printer -Name '{escaped_printer}'"
        )
        try:
            res = subprocess.run(
                [
                    "powershell",
                    "-NoProfile",
                    "-NonInteractive",
                    "-WindowStyle",
                    "Hidden",
                    "-Command",
                    ps_cmd,
                ],
                capture_output=True,
                text=True,
                timeout=12.0,
                creationflags=flags,
            )
            if res.returncode == 0:
                return True, f"Cupom enviado direto para a impressora '{clean_printer}'!"
        except Exception as exc:
            logger.warning("Aviso no Out-Printer PowerShell: %s", exc)

        # Fallback silencioso nativo do Windows (notepad /pt <arquivo> <impressora>)
        try:
            res2 = subprocess.run(
                ["notepad.exe", "/pt", str(txt_path), clean_printer],
                capture_output=True,
                text=True,
                timeout=12.0,
                creationflags=flags,
            )
            if res2.returncode == 0:
                return True, f"Cupom enviado para a impressora '{clean_printer}'!"
            err_msg = (res2.stderr or res2.stdout or "").strip()
            return False, f"Falha ao imprimir em '{clean_printer}': {err_msg}"
        except Exception as exc:
            return False, f"Não foi possível enviar para a impressora '{clean_printer}': {exc}"
    else:
        try:
            res = subprocess.run(
                ["lp", "-d", clean_printer, str(txt_path)],
                capture_output=True,
                text=True,
                timeout=10.0,
            )
            if res.returncode == 0:
                return True, f"Cupom enviado direto para a impressora '{clean_printer}'!"
            err_msg = (res.stderr or res.stdout or "").strip()
            return False, f"Falha ao imprimir em '{clean_printer}': {err_msg}"
        except Exception as exc:
            return False, f"Erro ao enviar para impressora '{clean_printer}': {exc}"


# ──────────────────────────────────────────────────────────────────────────────
# Gerador de Cupom Não-Fiscal (80mm) e Relatório HTML de Fechamento de Caixa
# ──────────────────────────────────────────────────────────────────────────────
def generate_receipt_html(sale: Dict[str, Any], cfg: Dict[str, Any]) -> Path:
    items_rows = ""
    for idx, it in enumerate(sale.get("items") or [], start=1):
        items_rows += f"""
        <tr>
            <td>{idx:02d}</td>
            <td>{it.get('isbn') or it.get('sku') or ''}<br><strong>{it.get('name', '')[:38]}</strong></td>
            <td style="text-align:right;">{it.get('quantity', 1)}x</td>
            <td style="text-align:right;">{format_brl(it.get('unit_price', 0), False)}</td>
            <td style="text-align:right;"><strong>{format_brl(it.get('total_price', 0), False)}</strong></td>
        </tr>
        """

    sync_badge = "SINCRONIZADO ONLINE" if sale.get("synced") else "GRAVADO OFFLINE (AGUARDANDO SYNC)"
    html = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Cupom PDV - {sale.get('sale_number')}</title>
<style>
  body {{ font-family: 'Courier New', monospace; width: 300px; margin: 10px auto; color: #000; font-size: 12px; }}
  h2, h3, p {{ margin: 3px 0; text-align: center; }}
  .divider {{ border-top: 1px dashed #000; margin: 6px 0; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 11px; }}
  td {{ padding: 3px 0; vertical-align: top; }}
  .tot-row {{ display: flex; justify-content: space-between; font-size: 13px; margin: 3px 0; }}
  .tot-big {{ font-size: 16px; font-weight: bold; }}
  @media print {{ .no-print {{ display: none; }} }}
</style>
</head>
<body>
  <div class="no-print" style="text-align:center; margin-bottom:10px;">
    <button onclick="window.print()" style="padding:8px 16px; font-weight:bold; cursor:pointer;">🖨️ Imprimir Cupom (80mm)</button>
  </div>
  <h2>{cfg.get('company_name') or 'HORUS PDV B2B'}</h2>
  <p>CNPJ: {cfg.get('company_document') or '---'}</p>
  <p>Sessão: #{sale.get('session_id') or 'OFFLINE'} - {sale.get('session_title') or 'PDV'}</p>
  <div class="divider"></div>
  <h3>COMPROVANTE DE VENDA (NÃO-FISCAL)</h3>
  <p>Nº: <strong>{sale.get('sale_number')}</strong> | {sale.get('created_at', '')[:19].replace('T', ' ')}</p>
  <p>Cliente: {sale.get('customer_name') or 'Consumidor Final'} {('(' + sale['customer_document'] + ')') if sale.get('customer_document') else ''}</p>
  <div class="divider"></div>
  <table>
    <thead>
      <tr style="border-bottom:1px solid #000;">
        <th style="text-align:left;">#</th>
        <th style="text-align:left;">Item</th>
        <th style="text-align:right;">Qtd</th>
        <th style="text-align:right;">Unit</th>
        <th style="text-align:right;">Total</th>
      </tr>
    </thead>
    <tbody>
      {items_rows}
    </tbody>
  </table>
  <div class="divider"></div>
  <div class="tot-row"><span>Subtotal:</span><span>{format_brl(sale.get('subtotal', 0))}</span></div>
  <div class="tot-row"><span>Desconto:</span><span>- {format_brl(sale.get('discount_amount', 0))}</span></div>
  <div class="tot-row tot-big"><span>TOTAL A PAGAR:</span><span>{format_brl(sale.get('total_amount', 0))}</span></div>
  <div class="divider"></div>
  <div class="tot-row"><span>Forma Pagto:</span><span>{sale.get('payment_method')} ({sale.get('installments', 1)}x)</span></div>
  {f'<div class="tot-row"><span>Valor Recebido:</span><span>{format_brl(sale.get("cash_received"))}</span></div>' if sale.get('cash_received') else ''}
  {f'<div class="tot-row"><span>Troco:</span><span>{format_brl(sale.get("change_amount"))}</span></div>' if sale.get('change_amount') else ''}
  <div class="divider"></div>
  <p style="font-size:10px;">UUID: {sale.get('client_sale_uuid')}</p>
  <p style="font-size:10px;">Operador: {sale.get('user_name') or sale.get('user_email')}</p>
  <p style="font-size:10px;">Status: {sync_badge}</p>
</body>
</html>"""

    out_file = RECEIPTS_DIR / f"cupom_{sale.get('sale_number')}_{sale.get('client_sale_uuid', '')[:8]}.html"
    out_file.write_text(html, encoding="utf-8")
    return out_file


def generate_session_report_html(sales: List[Dict[str, Any]], cfg: Dict[str, Any]) -> Path:
    total_val = sum(float(s.get("total_amount") or 0.0) for s in sales)
    synced_count = sum(1 for s in sales if s.get("synced"))
    pending_count = len(sales) - synced_count

    by_method: Dict[str, float] = {}
    for s in sales:
        m = str(s.get("payment_method") or "OUTROS")
        by_method[m] = by_method.get(m, 0.0) + float(s.get("total_amount") or 0.0)

    method_rows = "".join(
        f"<tr><td><strong>{k}</strong></td><td style='text-align:right;'>{format_brl(v)}</td></tr>"
        for k, v in sorted(by_method.items())
    )

    sale_rows = ""
    for s in sales:
        st_color = "#16a34a" if s.get("synced") else "#d97706"
        st_text = "SINCRONIZADO NA SESSÃO" if s.get("synced") else "PENDENTE OFFLINE"
        items_desc = ", ".join(
            f"{it.get('quantity', 1)}x [{it.get('sku') or it.get('isbn')}] {it.get('name', '')[:25]}"
            for it in (s.get("items") or [])
        )
        sale_rows += f"""
        <tr>
          <td>{s.get('sale_number')}</td>
          <td>{s.get('created_at', '')[:19].replace('T', ' ')}</td>
          <td>{s.get('customer_name') or 'Consumidor Final'}</td>
          <td>{s.get('payment_method')} ({s.get('installments', 1)}x)</td>
          <td>{items_desc}</td>
          <td style="text-align:right; font-weight:bold;">{format_brl(s.get('total_amount', 0))}</td>
          <td style="color:{st_color}; font-weight:bold;">{st_text}</td>
        </tr>"""

    html = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Relatório de Sessão PDV #{cfg.get('active_session_id') or 'OFFLINE'}</title>
<style>
  body {{ font-family: 'Segoe UI', Arial, sans-serif; margin: 24px; color: #1e293b; }}
  h1 {{ margin-bottom: 4px; color: #0f172a; }}
  .kpi-grid {{ display: flex; gap: 16px; margin: 16px 0; }}
  .kpi {{ border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 18px; background: #f8fafc; flex: 1; }}
  .kpi .lbl {{ font-size: 12px; color: #64748b; text-transform: uppercase; }}
  .kpi .val {{ font-size: 22px; font-weight: bold; margin-top: 4px; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 12px; }}
  th, td {{ border: 1px solid #cbd5e1; padding: 8px; text-align: left; }}
  th {{ background: #f1f5f9; }}
  @media print {{ .no-print {{ display: none; }} }}
</style>
</head>
<body>
  <div class="no-print" style="margin-bottom:16px;">
    <button onclick="window.print()" style="padding:10px 20px; font-weight:bold; cursor:pointer; background:#2563eb; color:#fff; border:none; border-radius:6px;">
      🖨️ Imprimir / Salvar em PDF
    </button>
  </div>
  <h1>Relatório de Vendas e Sincronização — Horus PDV</h1>
  <p><strong>Empresa (Seller):</strong> {cfg.get('company_name') or '---'} (ID: {cfg.get('company_id') or '---'}) |
     <strong>Operador:</strong> {cfg.get('user_name') or cfg.get('email') or '---'} |
     <strong>Sessão de Caixa:</strong> #{cfg.get('active_session_id') or 'OFFLINE'} ({cfg.get('active_session_title') or 'Local'})</p>
  <div class="kpi-grid">
    <div class="kpi"><div class="lbl">Total de Vendas</div><div class="val">{len(sales)}</div></div>
    <div class="kpi"><div class="lbl">Sincronizadas na API (Prontas p/ Horus)</div><div class="val" style="color:#16a34a;">{synced_count}</div></div>
    <div class="kpi"><div class="lbl">Pendentes Offline</div><div class="val" style="color:#d97706;">{pending_count}</div></div>
    <div class="kpi"><div class="lbl">Faturamento Total</div><div class="val" style="color:#2563eb;">{format_brl(total_val)}</div></div>
  </div>
  <h3>Resumo por Forma de Pagamento</h3>
  <table style="max-width: 420px;">
    <thead><tr><th>Forma de Pagamento</th><th style="text-align:right;">Total</th></tr></thead>
    <tbody>{method_rows or '<tr><td colspan="2">Sem vendas</td></tr>'}</tbody>
  </table>
  <h3>Detalhamento das Vendas da Sessão</h3>
  <table>
    <thead>
      <tr>
        <th>Nº Venda</th>
        <th>Data/Hora</th>
        <th>Cliente</th>
        <th>Pagamento</th>
        <th>Itens (SKU / ISBN / Título)</th>
        <th style="text-align:right;">Valor Total</th>
        <th>Status API / Horus</th>
      </tr>
    </thead>
    <tbody>{sale_rows or '<tr><td colspan="7">Nenhuma venda registrada nesta sessão.</td></tr>'}</tbody>
  </table>
</body>
</html>"""

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = REPORTS_DIR / f"relatorio_sessao_{cfg.get('active_session_id') or 'off'}_{ts}.html"
    out_path.write_text(html, encoding="utf-8")
    return out_path


# ──────────────────────────────────────────────────────────────────────────────
# Interface Gráfica Desktop (Tkinter) — Horus PDV Omnichannel v1.1
# ──────────────────────────────────────────────────────────────────────────────
class HorusPDVWindow:
    """Janela Principal do Aplicativo Desktop Horus PDV (Online & Offline)."""

    def __init__(self, root: "tk.Tk"):
        self.root = root
        self.root.title(APP_TITLE)
        self.root.geometry("1320x820")
        self.root.minsize(1100, 700)
        self.root.configure(bg="#0f172a")

        self.cfg = load_config()
        self.storage = LocalPOSStorage()
        self.api = CronuzPOSApiClient(self.cfg)
        self.ui_queue: "queue.Queue[Tuple[str, Any]]" = queue.Queue()
        self._sync_lock = threading.Lock()

        self.is_online: bool = False
        self.cart: List[Dict[str, Any]] = []
        self.discount_mode: str = "BRL"
        self.discount_scope: str = "SALE"
        self.discount_raw_digits: str = ""
        self.discount_value: float = 0.0
        self.active_prorated_discount: Optional[Tuple[str, float]] = None
        self.cash_received_digits: str = ""
        self.cash_received_value: float = 0.0
        self.open_sessions_cache: List[Dict[str, Any]] = []
        self.range_sync_running: bool = False
        self.range_sync_stop_requested: bool = False
        self.var_validate_stock = tk.BooleanVar(value=bool(self.cfg.get("validate_stock", False)))
        self.var_auto_sync_new_items = tk.BooleanVar(
            value=bool(self.cfg.get("auto_sync_new_horus_items", True))
        )

        self.installed_printers, self.default_system_printer = list_installed_printers()
        saved_printer = str(self.cfg.get("printer_name") or NO_PRINTER_OPTION).strip()
        if not saved_printer:
            saved_printer = NO_PRINTER_OPTION
        if saved_printer not in self.installed_printers:
            self.installed_printers.append(saved_printer)
        self.var_printer_name = tk.StringVar(value=saved_printer)
        self.last_completed_sale: Optional[Dict[str, Any]] = None
        self.checkout_modal: Optional["tk.Toplevel"] = None

        self.license_status: Dict[str, Any] = verify_pdv_desktop_license_key(
            self.cfg.get("license_key", ""),
            expected_company_id=self.cfg.get("company_id"),
            last_seen_date=self.cfg.get("last_seen_date"),
        )

        self._apply_window_icon()
        self._setup_styles()
        self._build_header()
        self._build_notebook()
        self._bind_shortcuts()

        self.refresh_license_ui()
        self.refresh_printer_status_ui()
        self.refresh_cart_ui()
        self.refresh_sales_and_sync_ui()
        self.refresh_catalog_stats_ui()
        self._run_initial_checks()

        self.root.after(200, self._poll_ui_queue)
        self.root.after(15000, self._license_heartbeat_tick)
        self.root.after(45000, self._auto_sync_tick)

    def _apply_window_icon(self) -> None:
        """
        Substitui a pena padrão do Tkinter pelo ícone oficial do Horus B2B
        na barra de título da janela, nos diálogos (messagebox) e na barra de tarefas do Windows.
        """
        self._icon_img = None
        try:
            ico_file = BASE_DIR / "horus_icon.ico"
            if not ico_file.exists():
                ico_file.write_bytes(base64.b64decode(HORUS_ICO_B64))
            if os.name == "nt":
                try:
                    self.root.iconbitmap(default=str(ico_file))
                except Exception:
                    pass
                try:
                    self.root.iconbitmap(str(ico_file))
                except Exception:
                    pass
        except Exception as exc:
            logger.debug("Não foi possível aplicar iconbitmap .ico: %s", exc)

        try:
            self._icon_img = tk.PhotoImage(data=HORUS_ICON_B64)
            self.root.iconphoto(True, self._icon_img)
        except Exception as exc:
            logger.debug("Não foi possível carregar PhotoImage do ícone: %s", exc)
            self._icon_img = None

    def _setup_styles(self) -> None:
        style = ttk.Style()
        try:
            style.theme_use("clam")
        except Exception:
            pass
        style.configure("TNotebook", background="#0f172a", borderwidth=0)
        style.configure(
            "TNotebook.Tab",
            background="#1e293b",
            foreground="#cbd5e1",
            padding=(14, 8),
            font=("Segoe UI", 10, "bold"),
        )
        style.map(
            "TNotebook.Tab",
            background=[("selected", "#2563eb")],
            foreground=[("selected", "#ffffff")],
        )
        style.configure(
            "Treeview",
            background="#ffffff",
            foreground="#0f172a",
            rowheight=28,
            fieldbackground="#ffffff",
            font=("Segoe UI", 9),
        )
        style.configure(
            "Treeview.Heading",
            background="#e2e8f0",
            foreground="#0f172a",
            font=("Segoe UI", 9, "bold"),
        )

    def _build_header(self) -> None:
        hdr = tk.Frame(self.root, bg="#0f172a", padx=14, pady=8)
        hdr.pack(fill="x")

        left = tk.Frame(hdr, bg="#0f172a")
        left.pack(side="left")

        if self._icon_img is not None:
            lbl_logo = tk.Label(left, image=self._icon_img, bg="#0f172a")
            lbl_logo.pack(side="left", padx=(0, 10))

        title_box = tk.Frame(left, bg="#0f172a")
        title_box.pack(side="left")
        tk.Label(
            title_box,
            text="HORUS PDV — FRENTE DE CAIXA OMNICHANNEL",
            font=("Segoe UI", 13, "bold"),
            fg="#f8fafc",
            bg="#0f172a",
        ).pack(anchor="w")

        self.lbl_seller_info = tk.Label(
            title_box,
            text=self._format_header_subtitle(),
            font=("Segoe UI", 9),
            fg="#94a3b8",
            bg="#0f172a",
        )
        self.lbl_seller_info.pack(anchor="w")

        right = tk.Frame(hdr, bg="#0f172a")
        right.pack(side="right")

        self.lbl_license_badge = tk.Label(
            right,
            text="🔑 VERIFICANDO LICENÇA...",
            font=("Segoe UI", 9, "bold"),
            fg="#ffffff",
            bg="#475569",
            padx=10,
            pady=5,
        )
        self.lbl_license_badge.pack(side="left", padx=4)

        self.lbl_session_badge = tk.Label(
            right,
            text=self._format_session_badge_text(),
            font=("Segoe UI", 9, "bold"),
            fg="#ffffff",
            bg="#1d4ed8",
            padx=10,
            pady=5,
        )
        self.lbl_session_badge.pack(side="left", padx=4)

        self.lbl_sync_badge = tk.Label(
            right,
            text="🔄 Verificando fila...",
            font=("Segoe UI", 9, "bold"),
            fg="#ffffff",
            bg="#059669",
            padx=10,
            pady=5,
        )
        self.lbl_sync_badge.pack(side="left", padx=4)

        self.lbl_net_badge = tk.Label(
            right,
            text="⚡ MODO HÍBRIDO",
            font=("Segoe UI", 9, "bold"),
            fg="#ffffff",
            bg="#475569",
            padx=10,
            pady=5,
        )
        self.lbl_net_badge.pack(side="left", padx=4)

    def _format_header_subtitle(self) -> str:
        comp = self.cfg.get("company_name") or "Seller não autenticado"
        cid = self.cfg.get("company_id") or "---"
        usr = self.cfg.get("user_name") or self.cfg.get("email") or "---"
        return f"Empresa: {comp} (ID: {cid})  |  Operador: {usr}  |  Catálogo Local: {len(self.storage.products)} itens"

    def _format_session_badge_text(self) -> str:
        sid = self.cfg.get("active_session_id")
        stitle = self.cfg.get("active_session_title") or "Caixa Local"
        stk_lbl = "🛡️C/Est" if self.cfg.get("validate_stock") else "⚡Livre"
        if sid:
            return f"📦 SESSÃO #{sid}: {stitle[:18]} ({stk_lbl})"
        return "⚠️ SEM SESSÃO VINCULADA"

    def _build_notebook(self) -> None:
        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(fill="both", expand=True, padx=10, pady=(0, 10))

        self.tab_pos = tk.Frame(self.notebook, bg="#f1f5f9")
        self.tab_sync = tk.Frame(self.notebook, bg="#f1f5f9")
        self.tab_session = tk.Frame(self.notebook, bg="#f1f5f9")
        self.tab_config = tk.Frame(self.notebook, bg="#f1f5f9")

        self.notebook.add(self.tab_pos, text="  🛒 1. Frente de Caixa (PDV)  ")
        self.notebook.add(self.tab_sync, text="  🔄 2. Sincronização & Relatórios (Horus)  ")
        self.notebook.add(self.tab_session, text="  📦 3. Sessão & Catálogo Offline (Range Horus)  ")
        self.notebook.add(self.tab_config, text="  ⚙️ 4. Credenciais Seller & Chave de Licença (Master)  ")

        self._build_tab_pos()
        self._build_tab_sync()
        self._build_tab_session()
        self._build_tab_config()

    def _bind_shortcuts(self) -> None:
        # Atalhos Gerais de Operação do Caixa
        self.root.bind("<F2>", lambda e: self.entry_search.focus_set())
        self.root.bind("<F3>", lambda e: self.focus_discount_entry())
        self.root.bind("<F4>", lambda e: self.clear_cart())
        self.root.bind("<F5>", lambda e: self.trigger_manual_sync())
        self.root.bind("<F6>", lambda e: self.focus_customer_doc_entry())
        self.root.bind("<F12>", lambda e: self.finalize_sale())

        # Atalhos de Teclado para Formas de Pagamento (F7..F10 e Alt+1..4)
        self.root.bind("<F7>", lambda e: self.select_payment_shortcut("DINHEIRO"))
        self.root.bind("<F8>", lambda e: self.select_payment_shortcut("PIX"))
        self.root.bind("<F9>", lambda e: self.select_payment_shortcut("DEBITO"))
        self.root.bind("<F10>", lambda e: self.select_payment_shortcut("CREDITO"))
        self.root.bind("<Alt-Key-1>", lambda e: self.select_payment_shortcut("DINHEIRO"))
        self.root.bind("<Alt-Key-2>", lambda e: self.select_payment_shortcut("PIX"))
        self.root.bind("<Alt-Key-3>", lambda e: self.select_payment_shortcut("DEBITO"))
        self.root.bind("<Alt-Key-4>", lambda e: self.select_payment_shortcut("CREDITO"))

        # Atalhos de Teclado para Parcelas (F11, Alt+Setas, Ctrl+1..9/0/-/=)
        self.root.bind("<F11>", lambda e: self.cycle_installments_shortcut(1))
        self.root.bind("<Alt-Up>", lambda e: self.cycle_installments_shortcut(1))
        self.root.bind("<Alt-Right>", lambda e: self.cycle_installments_shortcut(1))
        self.root.bind("<Alt-Down>", lambda e: self.cycle_installments_shortcut(-1))
        self.root.bind("<Alt-Left>", lambda e: self.cycle_installments_shortcut(-1))
        for n in range(1, 10):
            self.root.bind(f"<Control-Key-{n}>", lambda e, num=n: self.set_installments_shortcut(num))
        self.root.bind("<Control-Key-0>", lambda e: self.set_installments_shortcut(10))
        self.root.bind("<Control-minus>", lambda e: self.set_installments_shortcut(11))
        self.root.bind("<Control-equal>", lambda e: self.set_installments_shortcut(12))

        # Atalhos para Aplicação de Desconto (Ratear na Venda vs Item Selecionado)
        self.root.bind("<Alt-r>", lambda e: self.apply_discount_by_scope("SALE"))
        self.root.bind("<Alt-R>", lambda e: self.apply_discount_by_scope("SALE"))
        self.root.bind("<Alt-i>", lambda e: self.apply_discount_by_scope("ITEM"))
        self.root.bind("<Alt-I>", lambda e: self.apply_discount_by_scope("ITEM"))

    # ──────────────────────────────────────────────────────────────────────────
    # ABA 1: FRENTE DE CAIXA (PDV ONLINE & OFFLINE)
    # ──────────────────────────────────────────────────────────────────────────
    def _build_tab_pos(self) -> None:
        pane = tk.Frame(self.tab_pos, bg="#f1f5f9", padx=10, pady=8)
        pane.pack(fill="both", expand=True)

        # ══════════════════════════════════════════════════════════════════════
        # COLUNA ESQUERDA: CUPOM EM TEMPO REAL (BOBINA 80mm) + IMPRESSORA DIRETA
        # ══════════════════════════════════════════════════════════════════════
        receipt_col = tk.Frame(pane, bg="#ffffff", width=310, bd=1, relief="solid", padx=8, pady=8)
        receipt_col.pack(side="left", fill="y", padx=(0, 8))
        receipt_col.pack_propagate(False)

        tk.Label(
            receipt_col,
            text="🧾 CUPOM EM TEMPO REAL (80mm)",
            font=("Segoe UI", 10, "bold"),
            fg="#0f172a",
            bg="#ffffff",
        ).pack(anchor="w")

        tk.Label(
            receipt_col,
            text="Visualização dinâmica — envia direto p/ impressora no F12",
            font=("Segoe UI", 8),
            fg="#64748b",
            bg="#ffffff",
        ).pack(anchor="w", pady=(0, 4))

        bobina_frame = tk.Frame(receipt_col, bg="#fefce8", bd=1, relief="solid")
        bobina_frame.pack(fill="both", expand=True, pady=(0, 6))

        self.txt_live_receipt = tk.Text(
            bobina_frame,
            bg="#fefce8",
            fg="#0f172a",
            font=("Consolas", 8) if os.name == "nt" else ("Courier New", 9),
            wrap="none",
            relief="flat",
            padx=6,
            pady=6,
            state="disabled",
            width=42,
        )
        self.txt_live_receipt.pack(side="left", fill="both", expand=True)

        sb_rec = ttk.Scrollbar(bobina_frame, orient="vertical", command=self.txt_live_receipt.yview)
        self.txt_live_receipt.configure(yscrollcommand=sb_rec.set)
        sb_rec.pack(side="right", fill="y")

        # Configuração rápida de Impressora Direta logo abaixo da bobina
        prt_box = tk.LabelFrame(
            receipt_col,
            text=" 🖨️ Impressora Direta (Na Máquina) ",
            font=("Segoe UI", 8, "bold"),
            bg="#f8fafc",
            fg="#1e293b",
            padx=6,
            pady=4,
        )
        prt_box.pack(fill="x")

        self.combo_printer_pos = ttk.Combobox(
            prt_box,
            textvariable=self.var_printer_name,
            values=self.installed_printers,
            state="readonly",
            font=("Segoe UI", 8),
        )
        self.combo_printer_pos.pack(fill="x", pady=(0, 4))
        self.combo_printer_pos.bind("<<ComboboxSelected>>", lambda e: self.on_printer_selection_changed())

        prt_btns = tk.Frame(prt_box, bg="#f8fafc")
        prt_btns.pack(fill="x")

        tk.Button(
            prt_btns,
            text="🔄 Buscar Impressoras",
            command=self.refresh_printers_list_clicked,
            bg="#e2e8f0",
            fg="#0f172a",
            font=("Segoe UI", 8, "bold"),
            padx=6,
            pady=2,
            relief="flat",
            cursor="hand2",
        ).pack(side="left", fill="x", expand=True, padx=(0, 2))

        tk.Button(
            prt_btns,
            text="🖨️ Imprimir Cupom",
            command=self.print_current_or_last_receipt_clicked,
            bg="#0f172a",
            fg="#ffffff",
            font=("Segoe UI", 8, "bold"),
            padx=6,
            pady=2,
            relief="flat",
            cursor="hand2",
        ).pack(side="left", fill="x", expand=True, padx=(2, 0))

        # ══════════════════════════════════════════════════════════════════════
        # COLUNA CENTRAL: BUSCA INSTANTÂNEA + PRODUTOS + CARRINHO DA VENDA
        # ══════════════════════════════════════════════════════════════════════
        left_col = tk.Frame(pane, bg="#f1f5f9")
        left_col.pack(side="left", fill="both", expand=True, padx=(0, 8))

        search_card = tk.Frame(left_col, bg="#ffffff", bd=1, relief="solid", padx=10, pady=8)
        search_card.pack(fill="x", pady=(0, 6))

        tk.Label(
            search_card,
            text="🔍 LEITOR DE CÓDIGO DE BARRAS / ISBN / TÍTULO (F2) — Busca Instantânea Offline (<1ms) + Horus Online:",
            font=("Segoe UI", 9, "bold"),
            fg="#334155",
            bg="#ffffff",
        ).pack(anchor="w")

        s_row = tk.Frame(search_card, bg="#ffffff")
        s_row.pack(fill="x", pady=(4, 0))

        self.var_search = tk.StringVar()
        self.entry_search = tk.Entry(
            s_row,
            textvariable=self.var_search,
            font=("Segoe UI", 12),
            bg="#f8fafc",
            fg="#0f172a",
            relief="solid",
            bd=1,
        )
        self.entry_search.pack(side="left", fill="x", expand=True, ipady=5, padx=(0, 6))
        self.entry_search.bind("<Return>", lambda e: self.on_search_enter())

        tk.Button(
            s_row,
            text="Buscar / Bip (Enter)",
            command=self.on_search_enter,
            bg="#2563eb",
            fg="#ffffff",
            font=("Segoe UI", 9, "bold"),
            padx=12,
            pady=5,
            relief="flat",
            cursor="hand2",
        ).pack(side="left", padx=(0, 4))

        tk.Button(
            s_row,
            text="🌐 Horus (Online)",
            command=lambda: self.on_search_enter(force_online=True),
            bg="#0f172a",
            fg="#ffffff",
            font=("Segoe UI", 9, "bold"),
            padx=10,
            pady=5,
            relief="flat",
            cursor="hand2",
        ).pack(side="left")

        self.lbl_search_feedback = tk.Label(
            search_card,
            text="Dica: Bipe o ISBN/Código de Barras para adicionar direto ao carrinho, ou digite parte do título.",
            font=("Segoe UI", 8),
            fg="#64748b",
            bg="#ffffff",
        )
        self.lbl_search_feedback.pack(anchor="w", pady=(3, 0))

        res_card = tk.LabelFrame(
            left_col,
            text=" 📚 Produtos Encontrados (Duplo clique ou botão para adicionar ao carrinho) ",
            font=("Segoe UI", 9, "bold"),
            bg="#ffffff",
            fg="#1e293b",
            padx=6,
            pady=4,
        )
        res_card.pack(fill="x", pady=(0, 6))

        cols_res = ("isbn", "sku", "name", "brand", "stock", "price")
        self.tree_results = ttk.Treeview(res_card, columns=cols_res, show="headings", height=5)
        self.tree_results.heading("isbn", text="ISBN / Barras")
        self.tree_results.heading("sku", text="Cód. Horus")
        self.tree_results.heading("name", text="Título / Descrição")
        self.tree_results.heading("brand", text="Editora / Marca")
        self.tree_results.heading("stock", text="Saldo")
        self.tree_results.heading("price", text="Preço Unit.")

        self.tree_results.column("isbn", width=110, anchor="w")
        self.tree_results.column("sku", width=70, anchor="w")
        self.tree_results.column("name", width=230, anchor="w")
        self.tree_results.column("brand", width=105, anchor="w")
        self.tree_results.column("stock", width=50, anchor="center")
        self.tree_results.column("price", width=85, anchor="e")
        self.tree_results.pack(side="left", fill="x", expand=True)
        self.tree_results.bind("<Double-1>", lambda e: self.add_selected_result_to_cart())

        sb_res = ttk.Scrollbar(res_card, orient="vertical", command=self.tree_results.yview)
        self.tree_results.configure(yscrollcommand=sb_res.set)
        sb_res.pack(side="right", fill="y")

        cart_card = tk.LabelFrame(
            left_col,
            text=" 🛒 Itens no Carrinho da Venda Atual (Clique em ➖ ou ➕ ao lado da Qtd, ou selecione o item p/ desconto) ",
            font=("Segoe UI", 9, "bold"),
            bg="#ffffff",
            fg="#0f172a",
            padx=6,
            pady=6,
        )
        cart_card.pack(fill="both", expand=True)

        cols_cart = ("seq", "isbn", "name", "stock", "minus", "qty", "plus", "unit_price", "discount", "subtotal", "remove")
        self.tree_cart = ttk.Treeview(cart_card, columns=cols_cart, show="headings", height=9)
        self.tree_cart.heading("seq", text="#")
        self.tree_cart.heading("isbn", text="ISBN / SKU")
        self.tree_cart.heading("name", text="Produto")
        self.tree_cart.heading("stock", text="Saldo")
        self.tree_cart.heading("minus", text="[-]")
        self.tree_cart.heading("qty", text="Qtd")
        self.tree_cart.heading("plus", text="[+]")
        self.tree_cart.heading("unit_price", text="Unitário")
        self.tree_cart.heading("discount", text="Desconto")
        self.tree_cart.heading("subtotal", text="Total Líq.")
        self.tree_cart.heading("remove", text="Excluir")

        self.tree_cart.column("seq", width=26, anchor="center")
        self.tree_cart.column("isbn", width=92, anchor="w")
        self.tree_cart.column("name", width=180, anchor="w")
        self.tree_cart.column("stock", width=42, anchor="center")
        self.tree_cart.column("minus", width=32, anchor="center")
        self.tree_cart.column("qty", width=38, anchor="center")
        self.tree_cart.column("plus", width=32, anchor="center")
        self.tree_cart.column("unit_price", width=72, anchor="e")
        self.tree_cart.column("discount", width=72, anchor="e")
        self.tree_cart.column("subtotal", width=80, anchor="e")
        self.tree_cart.column("remove", width=44, anchor="center")
        self.tree_cart.pack(fill="both", expand=True)

        # Clique inline direto nas colunas ➖, ➕ e 🗑️ do carrinho sem perder seleção!
        self.tree_cart.bind("<ButtonRelease-1>", self._on_cart_tree_click)
        self.tree_cart.bind("<plus>", lambda e: self.change_cart_qty(1))
        self.tree_cart.bind("<equal>", lambda e: self.change_cart_qty(1))
        self.tree_cart.bind("<KP_Add>", lambda e: self.change_cart_qty(1))
        self.tree_cart.bind("<minus>", lambda e: self.change_cart_qty(-1))
        self.tree_cart.bind("<KP_Subtract>", lambda e: self.change_cart_qty(-1))
        self.tree_cart.bind("<Delete>", lambda e: self.remove_cart_item())
        self.tree_cart.bind("<BackSpace>", lambda e: self.remove_cart_item())

        cart_btns = tk.Frame(cart_card, bg="#ffffff", pady=4)
        cart_btns.pack(fill="x")

        tk.Button(
            cart_btns,
            text="➕ Adicionar",
            command=self.add_selected_result_to_cart,
            bg="#2563eb",
            fg="#ffffff",
            font=("Segoe UI", 8, "bold"),
            padx=8,
            pady=4,
            relief="flat",
        ).pack(side="left", padx=(0, 4))

        tk.Button(
            cart_btns,
            text="➕ 1 Qtd (+)",
            command=lambda: self.change_cart_qty(1),
            bg="#dcfce7",
            fg="#166534",
            font=("Segoe UI", 8, "bold"),
            padx=8,
            pady=4,
            relief="flat",
        ).pack(side="left", padx=2)

        tk.Button(
            cart_btns,
            text="➖ 1 Qtd (-)",
            command=lambda: self.change_cart_qty(-1),
            bg="#fef3c7",
            fg="#92400e",
            font=("Segoe UI", 8, "bold"),
            padx=8,
            pady=4,
            relief="flat",
        ).pack(side="left", padx=2)

        tk.Button(
            cart_btns,
            text="🗑️ Remover (Del)",
            command=self.remove_cart_item,
            bg="#fee2e2",
            fg="#b91c1c",
            font=("Segoe UI", 8, "bold"),
            padx=8,
            pady=4,
            relief="flat",
        ).pack(side="left", padx=4)

        tk.Checkbutton(
            cart_btns,
            text="🛡️ Validar Estoque",
            variable=self.var_validate_stock,
            command=self.on_toggle_validate_stock_checkbox,
            bg="#ffffff",
            fg="#0f172a",
            font=("Segoe UI", 8, "bold"),
        ).pack(side="left", padx=4)

        tk.Button(
            cart_btns,
            text="🧹 Limpar (F4)",
            command=self.clear_cart,
            bg="#f1f5f9",
            fg="#475569",
            font=("Segoe UI", 8),
            padx=8,
            pady=4,
            relief="flat",
        ).pack(side="right")

        # ══════════════════════════════════════════════════════════════════════
        # COLUNA DIREITA: CLIENTE OBRIGATÓRIO, DESCONTO, TOTAIS & BOTÃO F12
        # ══════════════════════════════════════════════════════════════════════
        right_col = tk.Frame(pane, bg="#ffffff", width=365, bd=1, relief="solid", padx=10, pady=8)
        right_col.pack(side="right", fill="y")
        right_col.pack_propagate(False)

        tk.Label(
            right_col,
            text="CLIENTE, DESCONTO & FECHAMENTO",
            font=("Segoe UI", 10, "bold"),
            fg="#0f172a",
            bg="#ffffff",
        ).pack(anchor="w", pady=(0, 4))

        # ── 1. CLIENTE OBRIGATÓRIO (CPF / CNPJ ou 99999999999) ───────────────
        cust_frame = tk.LabelFrame(
            right_col,
            text=" 👤 Cliente Obrigatório (F6 — CPF / CNPJ ou 99999999999) ",
            font=("Segoe UI", 9, "bold"),
            bg="#ffffff",
            fg="#334155",
            padx=8,
            pady=4,
        )
        cust_frame.pack(fill="x", pady=(0, 6))

        cust_btn_row = tk.Frame(cust_frame, bg="#ffffff")
        cust_btn_row.grid(row=0, column=0, columnspan=2, sticky="ew", pady=(0, 3))

        tk.Button(
            cust_btn_row,
            text="⚡ Consumidor (99999999999)",
            command=self.set_default_consumer_customer,
            bg="#dcfce7",
            fg="#166534",
            font=("Segoe UI", 8, "bold"),
            padx=6,
            pady=2,
            relief="flat",
            cursor="hand2",
        ).pack(side="left", padx=(0, 4))

        tk.Button(
            cust_btn_row,
            text="✏️ Informar CPF/CNPJ (F6)",
            command=self.clear_for_custom_customer,
            bg="#e0e7ff",
            fg="#1d4ed8",
            font=("Segoe UI", 8, "bold"),
            padx=6,
            pady=2,
            relief="flat",
            cursor="hand2",
        ).pack(side="left")

        tk.Label(cust_frame, text="CPF/CNPJ *:", bg="#ffffff", font=("Segoe UI", 9, "bold")).grid(
            row=1, column=0, sticky="w"
        )
        self.var_customer_doc = tk.StringVar(value=DEFAULT_CONSUMER_DOC)
        self.entry_customer_doc = tk.Entry(
            cust_frame,
            textvariable=self.var_customer_doc,
            font=("Segoe UI", 9, "bold"),
            width=24,
            bg="#f8fafc",
        )
        self.entry_customer_doc.grid(row=1, column=1, sticky="ew", padx=(6, 0), pady=2)
        self.entry_customer_doc.bind("<KeyRelease>", self._on_customer_doc_key)
        self.entry_customer_doc.bind("<FocusOut>", self._on_customer_doc_focus_out)

        tk.Label(cust_frame, text="Nome *:", bg="#ffffff", font=("Segoe UI", 9)).grid(row=2, column=0, sticky="w")
        self.var_customer_name = tk.StringVar(value=DEFAULT_CONSUMER_NAME)
        self.entry_customer_name = tk.Entry(
            cust_frame,
            textvariable=self.var_customer_name,
            font=("Segoe UI", 9),
            width=24,
            bg="#f8fafc",
        )
        self.entry_customer_name.grid(row=2, column=1, sticky="ew", padx=(6, 0), pady=2)
        self.entry_customer_name.bind("<KeyRelease>", lambda e: self.update_live_receipt_preview())

        self.lbl_customer_doc_status = tk.Label(
            cust_frame,
            text="✅ Consumidor Padrão (99999999999)",
            font=("Segoe UI", 8, "bold"),
            fg="#16a34a",
            bg="#ffffff",
        )
        self.lbl_customer_doc_status.grid(row=3, column=0, columnspan=2, sticky="w", pady=(1, 0))
        cust_frame.columnconfigure(1, weight=1)

        # ── 2. DESCONTO (RATEAR NA VENDA OU APLICAR NO ITEM SELECIONADO) ─────
        disc_frame = tk.LabelFrame(
            right_col,
            text=" 🏷️ Desconto (F3 — R$ / % | Ratear Venda ou Item) ",
            font=("Segoe UI", 9, "bold"),
            bg="#ffffff",
            fg="#334155",
            padx=8,
            pady=4,
        )
        disc_frame.pack(fill="x", pady=(0, 6))

        d_row = tk.Frame(disc_frame, bg="#ffffff")
        d_row.pack(fill="x")

        self.btn_disc_brl = tk.Button(
            d_row,
            text="R$",
            command=lambda: self.set_discount_mode("BRL"),
            bg="#2563eb",
            fg="#ffffff",
            font=("Segoe UI", 9, "bold"),
            width=3,
            relief="flat",
        )
        self.btn_disc_brl.pack(side="left", padx=(0, 2))

        self.btn_disc_pct = tk.Button(
            d_row,
            text="%",
            command=lambda: self.set_discount_mode("PCT"),
            bg="#e2e8f0",
            fg="#0f172a",
            font=("Segoe UI", 9, "bold"),
            width=3,
            relief="flat",
        )
        self.btn_disc_pct.pack(side="left", padx=(0, 4))

        self.var_discount_display = tk.StringVar(value="R$ 0,00")
        self.entry_discount = tk.Entry(
            d_row,
            textvariable=self.var_discount_display,
            font=("Segoe UI", 10, "bold"),
            justify="right",
            bg="#f8fafc",
        )
        self.entry_discount.pack(side="left", fill="x", expand=True, ipady=2, padx=(0, 4))
        self.entry_discount.bind("<KeyRelease>", self._on_discount_key)
        self.entry_discount.bind("<Return>", lambda e: self.apply_discount_by_scope(self.var_discount_scope.get()))

        tk.Button(
            d_row,
            text="✖",
            command=self.clear_discounts_clicked,
            bg="#fee2e2",
            fg="#b91c1c",
            font=("Segoe UI", 8, "bold"),
            padx=6,
            relief="flat",
            cursor="hand2",
        ).pack(side="right")

        self.var_discount_scope = tk.StringVar(value="SALE")
        d_apply_row = tk.Frame(disc_frame, bg="#ffffff")
        d_apply_row.pack(fill="x", pady=(4, 2))

        tk.Button(
            d_apply_row,
            text="📊 Ratear na Venda (Alt+R)",
            command=lambda: self.apply_discount_by_scope("SALE"),
            bg="#0f172a",
            fg="#ffffff",
            font=("Segoe UI", 8, "bold"),
            padx=6,
            pady=3,
            relief="flat",
            cursor="hand2",
        ).pack(side="left", fill="x", expand=True, padx=(0, 3))

        tk.Button(
            d_apply_row,
            text="🎯 No Item Selecionado (Alt+I)",
            command=lambda: self.apply_discount_by_scope("ITEM"),
            bg="#2563eb",
            fg="#ffffff",
            font=("Segoe UI", 8, "bold"),
            padx=6,
            pady=3,
            relief="flat",
            cursor="hand2",
        ).pack(side="left", fill="x", expand=True)

        self.lbl_discount_scope_info = tk.Label(
            disc_frame,
            text="Escolha 'Ratear na Venda' ou selecione 1 item e clique 'No Item'.",
            font=("Segoe UI", 8),
            fg="#64748b",
            bg="#ffffff",
        )
        self.lbl_discount_scope_info.pack(anchor="w")

        # ── 3. VARIÁVEIS DE PAGAMENTO (ESCOLHIDAS NA MODAL DO F12 OU ATALHOS) ─
        self.var_payment_method = tk.StringVar(value="DINHEIRO")
        self.var_installments = tk.StringVar(value="1")
        self.var_cash_received = tk.StringVar(value="R$ 0,00")

        pay_summary_card = tk.LabelFrame(
            right_col,
            text=" 💳 Pagamento & Parcelas (Caixa de Fechamento F12) ",
            font=("Segoe UI", 9, "bold"),
            bg="#f8fafc",
            fg="#334155",
            padx=8,
            pady=6,
        )
        pay_summary_card.pack(fill="x", pady=(0, 6))

        self.lbl_installment_preview = tk.Label(
            pay_summary_card,
            text="Pré-selecionado: DINHEIRO (1x de R$ 0,00)",
            font=("Segoe UI", 9, "bold"),
            fg="#1d4ed8",
            bg="#f8fafc",
        )
        self.lbl_installment_preview.pack(anchor="w")

        tk.Label(
            pay_summary_card,
            text="Ao clicar em FINALIZAR VENDA (F12), abrirá o caixa para escolher a forma de pagamento, parcelas e troco.",
            font=("Segoe UI", 8),
            fg="#475569",
            bg="#f8fafc",
            wraplength=330,
            justify="left",
        ).pack(anchor="w", pady=(2, 0))

        # ── 4. TOTAIS DA VENDA E BOTÃO FINALIZAR (F12) ──────────────────────
        tot_box = tk.Frame(right_col, bg="#0f172a", padx=12, pady=10)
        tot_box.pack(fill="x", pady=(2, 6))

        self.lbl_subtotal = tk.Label(
            tot_box, text="Subtotal: R$ 0,00", font=("Segoe UI", 10), fg="#cbd5e1", bg="#0f172a"
        )
        self.lbl_subtotal.pack(anchor="e")

        self.lbl_discount_applied = tk.Label(
            tot_box, text="Desconto Aplicado: - R$ 0,00", font=("Segoe UI", 10), fg="#fca5a5", bg="#0f172a"
        )
        self.lbl_discount_applied.pack(anchor="e")

        self.lbl_total_big = tk.Label(
            tot_box,
            text="R$ 0,00",
            font=("Segoe UI", 22, "bold"),
            fg="#4ade80",
            bg="#0f172a",
        )
        self.lbl_total_big.pack(anchor="e", pady=(4, 2))

        self.lbl_change = tk.Label(
            tot_box,
            text="Troco: R$ 0,00",
            font=("Segoe UI", 10, "bold"),
            fg="#38bdf8",
            bg="#0f172a",
        )
        self.lbl_change.pack(anchor="e")

        self.lbl_pos_printer_status = tk.Label(
            right_col,
            text="🚫 Impressora: NÃO IMPRIMIR (Desativado)",
            font=("Segoe UI", 8, "bold"),
            fg="#64748b",
            bg="#ffffff",
        )
        self.lbl_pos_printer_status.pack(anchor="w", pady=(0, 6))

        self.btn_finalize = tk.Button(
            right_col,
            text="✅ FINALIZAR VENDA / PAGAMENTO (F12)",
            command=self.finalize_sale,
            bg="#16a34a",
            fg="#ffffff",
            font=("Segoe UI", 11, "bold"),
            pady=12,
            relief="flat",
            cursor="hand2",
        )
        self.btn_finalize.pack(fill="x")

    # ──────────────────────────────────────────────────────────────────────────
    # ABA 2: SINCRONIZAÇÃO DE VENDAS & RELATÓRIOS (PARA MIGRAÇÃO HORUS)
    # ──────────────────────────────────────────────────────────────────────────
    def _build_tab_sync(self) -> None:
        pane = tk.Frame(self.tab_sync, bg="#f1f5f9", padx=14, pady=12)
        pane.pack(fill="both", expand=True)

        kpi_row = tk.Frame(pane, bg="#f1f5f9")
        kpi_row.pack(fill="x", pady=(0, 10))

        self.lbl_kpi_total_sales = self._create_kpi_card(kpi_row, "TOTAL DE VENDAS (SESSÃO)", "0", "#0f172a")
        self.lbl_kpi_synced = self._create_kpi_card(
            kpi_row, "SINCRONIZADAS NA API (PRONTAS P/ HORUS)", "0", "#16a34a"
        )
        self.lbl_kpi_pending = self._create_kpi_card(
            kpi_row, "PENDENTES OFFLINE (AGUARDANDO REDE)", "0", "#d97706"
        )
        self.lbl_kpi_revenue = self._create_kpi_card(kpi_row, "FATURAMENTO TOTAL", "R$ 0,00", "#2563eb")

        act_card = tk.LabelFrame(
            pane,
            text=" 🚀 Sincronização de Vendas com o Servidor & Exportação de Relatórios (Preparação Horus ERP) ",
            font=("Segoe UI", 10, "bold"),
            bg="#ffffff",
            fg="#0f172a",
            padx=12,
            pady=10,
        )
        act_card.pack(fill="x", pady=(0, 10))

        btn_row1 = tk.Frame(act_card, bg="#ffffff")
        btn_row1.pack(fill="x", pady=(0, 6))

        tk.Button(
            btn_row1,
            text="☁️ Sincronizar Vendas Offline Agora (F5)",
            command=self.trigger_manual_sync,
            bg="#16a34a",
            fg="#ffffff",
            font=("Segoe UI", 10, "bold"),
            padx=14,
            pady=7,
            relief="flat",
            cursor="hand2",
        ).pack(side="left", padx=(0, 8))

        tk.Button(
            btn_row1,
            text="🔄 Buscar Vendas da Sessão no Servidor",
            command=self.fetch_sales_from_server_async,
            bg="#2563eb",
            fg="#ffffff",
            font=("Segoe UI", 10, "bold"),
            padx=12,
            pady=7,
            relief="flat",
            cursor="hand2",
        ).pack(side="left", padx=(0, 8))

        tk.Button(
            btn_row1,
            text="📊 Exportar CSV/Excel Analítico (Itens p/ Horus)",
            command=self.export_local_csv_report,
            bg="#0f172a",
            fg="#ffffff",
            font=("Segoe UI", 10, "bold"),
            padx=12,
            pady=7,
            relief="flat",
            cursor="hand2",
        ).pack(side="left", padx=(0, 8))

        tk.Button(
            btn_row1,
            text="🖨️ Relatório de Fechamento (HTML Imprimível)",
            command=self.open_html_closing_report,
            bg="#475569",
            fg="#ffffff",
            font=("Segoe UI", 10, "bold"),
            padx=12,
            pady=7,
            relief="flat",
            cursor="hand2",
        ).pack(side="left")

        btn_row2 = tk.Frame(act_card, bg="#ffffff")
        btn_row2.pack(fill="x", pady=(4, 0))

        tk.Label(
            btn_row2,
            text="Relatórios Oficiais do Servidor (Online):",
            font=("Segoe UI", 9, "bold"),
            bg="#ffffff",
            fg="#475569",
        ).pack(side="left", padx=(0, 8))

        tk.Button(
            btn_row2,
            text="📥 Baixar Excel Oficial (.xlsx)",
            command=lambda: self.download_server_report("excel"),
            bg="#e2e8f0",
            fg="#0f172a",
            font=("Segoe UI", 9, "bold"),
            padx=10,
            pady=4,
            relief="flat",
        ).pack(side="left", padx=(0, 6))

        tk.Button(
            btn_row2,
            text="📄 Baixar PDF Oficial (.pdf)",
            command=lambda: self.download_server_report("pdf"),
            bg="#e2e8f0",
            fg="#0f172a",
            font=("Segoe UI", 9, "bold"),
            padx=10,
            pady=4,
            relief="flat",
        ).pack(side="left", padx=(0, 6))

        self.lbl_sync_status_msg = tk.Label(
            btn_row2,
            text="Todas as vendas sincronizadas ficam salvas na Sessão e Usuário configurados para migração ao Horus ERP.",
            font=("Segoe UI", 9),
            fg="#059669",
            bg="#ffffff",
        )
        self.lbl_sync_status_msg.pack(side="right")

        tbl_card = tk.LabelFrame(
            pane,
            text=" 📋 Histórico de Vendas da Sessão (Duplo clique para reimprimir o Cupom Não-Fiscal) ",
            font=("Segoe UI", 10, "bold"),
            bg="#ffffff",
            fg="#0f172a",
            padx=8,
            pady=8,
        )
        tbl_card.pack(fill="both", expand=True)

        cols_sales = ("sale_number", "created_at", "session_id", "customer", "payment", "items_count", "total", "sync_status")
        self.tree_sales = ttk.Treeview(tbl_card, columns=cols_sales, show="headings", height=12)
        self.tree_sales.heading("sale_number", text="Nº Venda")
        self.tree_sales.heading("created_at", text="Data / Hora")
        self.tree_sales.heading("session_id", text="Sessão")
        self.tree_sales.heading("customer", text="Cliente")
        self.tree_sales.heading("payment", text="Pagamento")
        self.tree_sales.heading("items_count", text="Itens")
        self.tree_sales.heading("total", text="Valor Total")
        self.tree_sales.heading("sync_status", text="Status Sincronização (API / Horus)")

        self.tree_sales.column("sale_number", width=120, anchor="w")
        self.tree_sales.column("created_at", width=145, anchor="center")
        self.tree_sales.column("session_id", width=75, anchor="center")
        self.tree_sales.column("customer", width=190, anchor="w")
        self.tree_sales.column("payment", width=110, anchor="center")
        self.tree_sales.column("items_count", width=65, anchor="center")
        self.tree_sales.column("total", width=110, anchor="e")
        self.tree_sales.column("sync_status", width=220, anchor="center")
        self.tree_sales.pack(side="left", fill="both", expand=True)
        self.tree_sales.bind("<Double-1>", lambda e: self.reprint_selected_sale_receipt())

        sb_sales = ttk.Scrollbar(tbl_card, orient="vertical", command=self.tree_sales.yview)
        self.tree_sales.configure(yscrollcommand=sb_sales.set)
        sb_sales.pack(side="right", fill="y")

    def _create_kpi_card(self, parent: tk.Widget, title: str, initial_val: str, color: str) -> tk.Label:
        card = tk.Frame(parent, bg="#ffffff", bd=1, relief="solid", padx=14, pady=10)
        card.pack(side="left", fill="x", expand=True, padx=4)
        tk.Label(card, text=title, font=("Segoe UI", 8, "bold"), fg="#64748b", bg="#ffffff").pack(anchor="w")
        lbl = tk.Label(card, text=initial_val, font=("Segoe UI", 16, "bold"), fg=color, bg="#ffffff")
        lbl.pack(anchor="w", pady=(4, 0))
        return lbl

    # ──────────────────────────────────────────────────────────────────────────
    # ABA 3: SESSÃO DE CAIXA & SINCRONIZAÇÃO DE CATÁLOGO POR RANGE HORUS
    # ──────────────────────────────────────────────────────────────────────────
    def _build_tab_session(self) -> None:
        pane = tk.Frame(self.tab_session, bg="#f1f5f9", padx=12, pady=10)
        pane.pack(fill="both", expand=True)

        # Coluna Esquerda: Seleção e Abertura de Sessão
        left_box = tk.LabelFrame(
            pane,
            text=" 📦 1. Seleção ou Abertura de Sessão de Caixa (Vínculo de Vendas) ",
            font=("Segoe UI", 10, "bold"),
            bg="#ffffff",
            fg="#0f172a",
            padx=10,
            pady=8,
        )
        left_box.pack(side="left", fill="both", expand=True, padx=(0, 8))

        tk.Label(
            left_box,
            text="Sessões Abertas no Servidor (Selecione uma sessão para vincular suas vendas online/offline):",
            font=("Segoe UI", 9, "bold"),
            bg="#ffffff",
            fg="#334155",
        ).pack(anchor="w")

        cols_sess = ("id", "title", "source", "stock_rule", "sales_count", "total_amount", "opened_at")
        self.tree_sessions = ttk.Treeview(left_box, columns=cols_sess, show="headings", height=6)
        self.tree_sessions.heading("id", text="ID")
        self.tree_sessions.heading("title", text="Título da Sessão / Evento")
        self.tree_sessions.heading("source", text="Fonte Acervo")
        self.tree_sessions.heading("stock_rule", text="Estoque")
        self.tree_sessions.heading("sales_count", text="Vendas")
        self.tree_sessions.heading("total_amount", text="Total (R$)")
        self.tree_sessions.heading("opened_at", text="Abertura")

        self.tree_sessions.column("id", width=45, anchor="center")
        self.tree_sessions.column("title", width=145, anchor="w")
        self.tree_sessions.column("source", width=85, anchor="center")
        self.tree_sessions.column("stock_rule", width=85, anchor="center")
        self.tree_sessions.column("sales_count", width=50, anchor="center")
        self.tree_sessions.column("total_amount", width=85, anchor="e")
        self.tree_sessions.column("opened_at", width=110, anchor="center")
        self.tree_sessions.pack(fill="x", pady=6)

        sess_btns = tk.Frame(left_box, bg="#ffffff")
        sess_btns.pack(fill="x", pady=(0, 4))

        tk.Button(
            sess_btns,
            text="🔄 Listar Sessões",
            command=self.refresh_open_sessions_async,
            bg="#e2e8f0",
            fg="#0f172a",
            font=("Segoe UI", 9, "bold"),
            padx=8,
            pady=5,
            relief="flat",
        ).pack(side="left", padx=(0, 5))

        tk.Button(
            sess_btns,
            text="✅ Usar Sessão Selecionada",
            command=self.select_highlighted_session,
            bg="#2563eb",
            fg="#ffffff",
            font=("Segoe UI", 9, "bold"),
            padx=10,
            pady=5,
            relief="flat",
        ).pack(side="left", padx=(0, 5))

        tk.Button(
            sess_btns,
            text="🔒 Encerrar Sessão Ativa",
            command=self.close_active_session_clicked,
            bg="#fee2e2",
            fg="#b91c1c",
            font=("Segoe UI", 9, "bold"),
            padx=8,
            pady=5,
            relief="flat",
        ).pack(side="left")

        active_stock_bar = tk.Frame(left_box, bg="#f8fafc", bd=1, relief="solid", padx=8, pady=4)
        active_stock_bar.pack(fill="x", pady=(2, 6))
        tk.Checkbutton(
            active_stock_bar,
            text="🛡️ Validar Saldo de Estoque na Sessão Ativa (Bloquear venda se saldo insuficiente)",
            variable=self.var_validate_stock,
            command=self.on_toggle_validate_stock_checkbox,
            bg="#f8fafc",
            fg="#0f172a",
            font=("Segoe UI", 9, "bold"),
        ).pack(anchor="w")

        new_sess = tk.LabelFrame(
            left_box,
            text=" ➕ Abrir Nova Sessão de Caixa no Servidor ",
            font=("Segoe UI", 9, "bold"),
            bg="#f8fafc",
            fg="#0f172a",
            padx=10,
            pady=8,
        )
        new_sess.pack(fill="x", pady=(4, 0))

        tk.Label(new_sess, text="Nome do Caixa / Feira / Evento:", bg="#f8fafc", font=("Segoe UI", 9)).grid(
            row=0, column=0, sticky="w", pady=3
        )
        self.var_new_session_title = tk.StringVar(value=f"Caixa PDV - {datetime.now().strftime('%d/%m/%Y')}")
        tk.Entry(new_sess, textvariable=self.var_new_session_title, font=("Segoe UI", 10), width=28).grid(
            row=0, column=1, sticky="ew", padx=6, pady=3
        )

        tk.Label(new_sess, text="Fonte do Catálogo:", bg="#f8fafc", font=("Segoe UI", 9)).grid(
            row=1, column=0, sticky="w", pady=3
        )
        self.var_new_session_source = tk.StringVar(value="GENERAL")
        ttk.Combobox(
            new_sess,
            textvariable=self.var_new_session_source,
            values=["GENERAL", "CONSIGNMENT", "CRONUZ_CATALOG"],
            state="readonly",
            width=18,
        ).grid(row=1, column=1, sticky="w", padx=6, pady=3)

        tk.Label(new_sess, text="Fundo de Troco Inicial (R$):", bg="#f8fafc", font=("Segoe UI", 9)).grid(
            row=2, column=0, sticky="w", pady=3
        )
        self.var_initial_cash = tk.StringVar(value="R$ 0,00")
        self.initial_cash_digits = ""
        entry_init_cash = tk.Entry(new_sess, textvariable=self.var_initial_cash, font=("Segoe UI", 10, "bold"), width=16)
        entry_init_cash.grid(row=2, column=1, sticky="w", padx=6, pady=3)
        entry_init_cash.bind("<KeyRelease>", self._on_initial_cash_key)

        self.var_new_session_validate_stock = tk.BooleanVar(value=bool(self.cfg.get("validate_stock", False)))
        tk.Checkbutton(
            new_sess,
            text="🛡️ Validar Saldo de Estoque nesta Nova Sessão",
            variable=self.var_new_session_validate_stock,
            bg="#f8fafc",
            fg="#0f172a",
            font=("Segoe UI", 9, "bold"),
        ).grid(row=3, column=0, columnspan=2, sticky="w", pady=2)

        tk.Button(
            new_sess,
            text="🚀 Criar e Ativar Nova Sessão",
            command=self.create_new_session_async,
            bg="#16a34a",
            fg="#ffffff",
            font=("Segoe UI", 10, "bold"),
            padx=12,
            pady=6,
            relief="flat",
        ).grid(row=4, column=0, columnspan=2, sticky="ew", pady=(6, 2))
        new_sess.columnconfigure(1, weight=1)

        # ── Coluna Direita: Catálogo Local + Sincronização por Sequência Horus (COD_ITEM_INI / FIM) ──
        right_box = tk.LabelFrame(
            pane,
            text=" 💾 2. Catálogo Local Offline (< 1ms) & Sincronização por Sequência Horus (COD_ITEM_INI / FIM) ",
            font=("Segoe UI", 10, "bold"),
            bg="#ffffff",
            fg="#0f172a",
            padx=12,
            pady=10,
        )
        right_box.pack(side="right", fill="both", expand=True)

        self.lbl_catalog_status = tk.Label(
            right_box,
            text="Produtos em Cache Offline: 0 itens",
            font=("Segoe UI", 11, "bold"),
            fg="#2563eb",
            bg="#ffffff",
        )
        self.lbl_catalog_status.pack(anchor="w")

        self.lbl_catalog_watermark = tk.Label(
            right_box,
            text="Último COD_ITEM sincronizado: 0 | Faixa local: ---",
            font=("Segoe UI", 9, "bold"),
            fg="#475569",
            bg="#ffffff",
        )
        self.lbl_catalog_watermark.pack(anchor="w", pady=(2, 6))

        # Painel de Sincronização por Range Horus (COD_ITEM_INI -> COD_ITEM_FIM)
        range_card = tk.LabelFrame(
            right_box,
            text=" 🔄 Sincronização Sequencial Direta da API Horus (COD_ITEM_INI até COD_ITEM_FIM) ",
            font=("Segoe UI", 9, "bold"),
            bg="#f8fafc",
            fg="#1e293b",
            padx=10,
            pady=8,
        )
        range_card.pack(fill="x", pady=(0, 8))

        r_inputs = tk.Frame(range_card, bg="#f8fafc")
        r_inputs.pack(fill="x")

        tk.Label(r_inputs, text="COD_ITEM_INI (Inicial):", bg="#f8fafc", font=("Segoe UI", 9, "bold")).grid(
            row=0, column=0, sticky="w", padx=(0, 4)
        )
        last_synced = self.storage.get_last_integrated_horus_code()
        self.var_cod_ini = tk.StringVar(value=str(last_synced + 1 if last_synced > 0 else 1))
        tk.Entry(r_inputs, textvariable=self.var_cod_ini, font=("Segoe UI", 10, "bold"), width=10, justify="center").grid(
            row=0, column=1, padx=(0, 12)
        )

        tk.Label(r_inputs, text="COD_ITEM_FIM (Final):", bg="#f8fafc", font=("Segoe UI", 9, "bold")).grid(
            row=0, column=2, sticky="w", padx=(0, 4)
        )
        self.var_cod_fim = tk.StringVar(value=str((last_synced + 5000) if last_synced > 0 else 5000))
        tk.Entry(r_inputs, textvariable=self.var_cod_fim, font=("Segoe UI", 10, "bold"), width=10, justify="center").grid(
            row=0, column=3, padx=(0, 12)
        )

        tk.Label(r_inputs, text="Passo por lote:", bg="#f8fafc", font=("Segoe UI", 9)).grid(
            row=0, column=4, sticky="w", padx=(0, 4)
        )
        self.var_cod_step = tk.StringVar(value="500")
        ttk.Combobox(
            r_inputs,
            textvariable=self.var_cod_step,
            values=["250", "500", "1000", "2000"],
            width=7,
            state="readonly",
        ).grid(row=0, column=5)

        r_btns = tk.Frame(range_card, bg="#f8fafc")
        r_btns.pack(fill="x", pady=(8, 4))

        self.btn_start_range_sync = tk.Button(
            r_btns,
            text="🚀 Sincronizar Faixa (INI ➔ FIM)",
            command=self.start_horus_range_sync_clicked,
            bg="#16a34a",
            fg="#ffffff",
            font=("Segoe UI", 9, "bold"),
            padx=10,
            pady=6,
            relief="flat",
            cursor="hand2",
        )
        self.btn_start_range_sync.pack(side="left", padx=(0, 6))

        self.btn_sync_new_horus = tk.Button(
            r_btns,
            text="⚡ Buscar Novos do Horus (A partir do últ. COD_ITEM)",
            command=lambda: self.sync_new_horus_items_from_last_code(interactive=True),
            bg="#2563eb",
            fg="#ffffff",
            font=("Segoe UI", 9, "bold"),
            padx=10,
            pady=6,
            relief="flat",
            cursor="hand2",
        )
        self.btn_sync_new_horus.pack(side="left", padx=(0, 6))

        self.btn_stop_range_sync = tk.Button(
            r_btns,
            text="⏹️ Pausar",
            command=self.stop_horus_range_sync_clicked,
            bg="#fee2e2",
            fg="#b91c1c",
            font=("Segoe UI", 9, "bold"),
            padx=10,
            pady=6,
            relief="flat",
            state="disabled",
        )
        self.btn_stop_range_sync.pack(side="left", padx=(0, 6))

        tk.Button(
            r_btns,
            text="⏭️ Preencher Próx. Sequência",
            command=self.fill_next_sequence_clicked,
            bg="#e2e8f0",
            fg="#0f172a",
            font=("Segoe UI", 8, "bold"),
            padx=8,
            pady=6,
            relief="flat",
        ).pack(side="left", padx=(0, 6))

        tk.Button(
            r_btns,
            text="♻️ Recarregar Antigas",
            command=self.reload_existing_ranges_clicked,
            bg="#dbeafe",
            fg="#1d4ed8",
            font=("Segoe UI", 8, "bold"),
            padx=8,
            pady=6,
            relief="flat",
        ).pack(side="left")

        chk_auto_delta = tk.Checkbutton(
            range_card,
            text="⚡ Ao abrir o PDV online, identificar o último COD_ITEM integrado e sincronizar automaticamente os últimos itens cadastrados no Horus",
            variable=self.var_auto_sync_new_items,
            command=self.on_toggle_auto_sync_new_items,
            bg="#f8fafc",
            fg="#0f172a",
            activebackground="#f8fafc",
            font=("Segoe UI", 8, "bold"),
        )
        chk_auto_delta.pack(anchor="w", pady=(2, 2))

        self.progress_range = ttk.Progressbar(range_card, orient="horizontal", mode="determinate")
        self.progress_range.pack(fill="x", pady=(4, 2))

        self.lbl_range_progress = tk.Label(
            range_card,
            text="Pronto para sincronizar por sequência de códigos do Horus (respeita OFFSET/LIMIT do Seller).",
            font=("Segoe UI", 8, "bold"),
            fg="#059669",
            bg="#f8fafc",
        )
        self.lbl_range_progress.pack(anchor="w")

        # Histórico de Faixas Sincronizadas (para saber o que já foi baixado e o que precisa recarregar)
        tk.Label(
            right_box,
            text="📋 Faixas de Códigos (COD_ITEM) Salvas no Computador (Duplo clique na faixa para recarregar):",
            font=("Segoe UI", 8, "bold"),
            fg="#334155",
            bg="#ffffff",
        ).pack(anchor="w", pady=(2, 2))

        cols_rng = ("range", "items_count", "synced_at", "freshness")
        self.tree_ranges = ttk.Treeview(right_box, columns=cols_rng, show="headings", height=5)
        self.tree_ranges.heading("range", text="Sequência (COD_ITEM_INI .. FIM)")
        self.tree_ranges.heading("items_count", text="Itens Ativos")
        self.tree_ranges.heading("synced_at", text="Última Atualização")
        self.tree_ranges.heading("freshness", text="Status da Base Local")

        self.tree_ranges.column("range", width=175, anchor="center")
        self.tree_ranges.column("items_count", width=90, anchor="center")
        self.tree_ranges.column("synced_at", width=140, anchor="center")
        self.tree_ranges.column("freshness", width=180, anchor="center")
        self.tree_ranges.pack(fill="x", pady=(0, 8))
        self.tree_ranges.bind("<Double-1>", lambda e: self.reload_selected_range_from_tree())

        # Botões adicionais: Catálogo da Sessão e Planilha CSV Local
        extra_cat_btns = tk.Frame(right_box, bg="#ffffff")
        extra_cat_btns.pack(fill="x")

        tk.Button(
            extra_cat_btns,
            text="☁️ Baixar Catálogo Vinculado à Sessão Ativa",
            command=self.download_catalog_async,
            bg="#2563eb",
            fg="#ffffff",
            font=("Segoe UI", 9, "bold"),
            padx=12,
            pady=6,
            relief="flat",
            cursor="hand2",
        ).pack(side="left", fill="x", expand=True, padx=(0, 4))

        tk.Button(
            extra_cat_btns,
            text="📂 Importar Catálogo de Planilha CSV Local",
            command=self.import_catalog_from_csv_dialog,
            bg="#0f172a",
            fg="#ffffff",
            font=("Segoe UI", 9, "bold"),
            padx=12,
            pady=6,
            relief="flat",
            cursor="hand2",
        ).pack(side="left", fill="x", expand=True, padx=(4, 0))

    # ──────────────────────────────────────────────────────────────────────────
    # ABA 4: CREDENCIAIS DO SELLER & CHAVE DE LICENÇA (PAINEL MASTER)
    # ──────────────────────────────────────────────────────────────────────────
    def _build_tab_config(self) -> None:
        pane = tk.Frame(self.tab_config, bg="#f1f5f9", padx=16, pady=12)
        pane.pack(fill="both", expand=True)

        # Card 1: Credenciais do Seller
        card = tk.LabelFrame(
            pane,
            text=" 🔐 1. Credenciais do Seller (Autenticação Persistente na API Cronuz B2B / Horus) ",
            font=("Segoe UI", 10, "bold"),
            bg="#ffffff",
            fg="#0f172a",
            padx=16,
            pady=12,
        )
        card.pack(fill="x", pady=(0, 12))

        tk.Label(card, text="URL da API Cronuz B2B:", bg="#ffffff", font=("Segoe UI", 9, "bold")).grid(
            row=0, column=0, sticky="w", pady=4
        )
        self.var_api_url = tk.StringVar(value=str(self.cfg.get("api_base_url") or "https://cronuzb2b.com.br/api"))
        tk.Entry(card, textvariable=self.var_api_url, font=("Segoe UI", 10), width=48).grid(
            row=0, column=1, sticky="w", padx=10, pady=4
        )

        tk.Label(card, text="E-mail do Usuário (Seller/Operador):", bg="#ffffff", font=("Segoe UI", 9, "bold")).grid(
            row=1, column=0, sticky="w", pady=4
        )
        self.var_email = tk.StringVar(value=str(self.cfg.get("email") or ""))
        tk.Entry(card, textvariable=self.var_email, font=("Segoe UI", 10), width=48).grid(
            row=1, column=1, sticky="w", padx=10, pady=4
        )

        tk.Label(card, text="Senha:", bg="#ffffff", font=("Segoe UI", 9, "bold")).grid(
            row=2, column=0, sticky="w", pady=4
        )
        self.var_password = tk.StringVar()
        tk.Entry(card, textvariable=self.var_password, show="*", font=("Segoe UI", 10), width=48).grid(
            row=2, column=1, sticky="w", padx=10, pady=4
        )

        tk.Label(card, text="Company ID (Opcional p/ Master):", bg="#ffffff", font=("Segoe UI", 9)).grid(
            row=3, column=0, sticky="w", pady=4
        )
        self.var_company_id = tk.StringVar(value=str(self.cfg.get("company_id") or ""))
        tk.Entry(card, textvariable=self.var_company_id, font=("Segoe UI", 10), width=18).grid(
            row=3, column=1, sticky="w", padx=10, pady=4
        )

        tk.Button(
            card,
            text="🔑 Autenticar Seller e Vincular Terminal PDV",
            command=self.authenticate_seller_clicked,
            bg="#16a34a",
            fg="#ffffff",
            font=("Segoe UI", 10, "bold"),
            padx=16,
            pady=7,
            relief="flat",
            cursor="hand2",
        ).grid(row=4, column=0, columnspan=2, sticky="w", pady=(8, 4))

        self.lbl_auth_status = tk.Label(
            card,
            text=(
                f"Token salvo: {'SIM ✅' if self.cfg.get('access_token') else 'NÃO ❌'}  |  "
                f"Seller: {self.cfg.get('company_name') or '---'} (ID: {self.cfg.get('company_id') or '---'})"
            ),
            font=("Segoe UI", 9, "bold"),
            fg="#059669" if self.cfg.get("access_token") else "#dc2626",
            bg="#ffffff",
        )
        self.lbl_auth_status.grid(row=5, column=0, columnspan=2, sticky="w", pady=4)

        # Card 2: Licenciamento e Chave de Ativação Liberada pelo Master
        lic_card = tk.LabelFrame(
            pane,
            text=" 🛡️ 2. Chave de Licença & Data de Validade do PDV (Liberada pelo Painel Master) ",
            font=("Segoe UI", 10, "bold"),
            bg="#ffffff",
            fg="#0f172a",
            padx=16,
            pady=12,
        )
        lic_card.pack(fill="x")

        self.lbl_license_detail = tk.Label(
            lic_card,
            text="Status da Licença: Verificando...",
            font=("Segoe UI", 11, "bold"),
            fg="#0f172a",
            bg="#ffffff",
        )
        self.lbl_license_detail.pack(anchor="w")

        self.lbl_license_features = tk.Label(
            lic_card,
            text="Rotina de Sincronização por Sequência Horus (COD_ITEM_INI/FIM): ---",
            font=("Segoe UI", 9, "bold"),
            fg="#475569",
            bg="#ffffff",
        )
        self.lbl_license_features.pack(anchor="w", pady=(2, 8))

        k_row = tk.Frame(lic_card, bg="#ffffff")
        k_row.pack(fill="x", pady=4)

        tk.Label(k_row, text="Chave de Licença (Token Master):", bg="#ffffff", font=("Segoe UI", 9, "bold")).pack(
            side="left", padx=(0, 8)
        )
        self.var_license_key = tk.StringVar(value=str(self.cfg.get("license_key") or ""))
        tk.Entry(k_row, textvariable=self.var_license_key, font=("Consolas", 10), width=64, bg="#f8fafc").pack(
            side="left", fill="x", expand=True, ipady=4, padx=(0, 8)
        )

        tk.Button(
            k_row,
            text="✅ Validar e Salvar Chave",
            command=self.validate_manual_license_key_clicked,
            bg="#0f172a",
            fg="#ffffff",
            font=("Segoe UI", 9, "bold"),
            padx=12,
            pady=5,
            relief="flat",
        ).pack(side="left")

        btn_lic_row = tk.Frame(lic_card, bg="#ffffff")
        btn_lic_row.pack(fill="x", pady=(8, 2))

        tk.Button(
            btn_lic_row,
            text="🔄 Buscar / Atualizar Chave Liberada no Painel Master (Online)",
            command=self.fetch_license_from_master_clicked,
            bg="#2563eb",
            fg="#ffffff",
            font=("Segoe UI", 10, "bold"),
            padx=16,
            pady=7,
            relief="flat",
            cursor="hand2",
        ).pack(side="left")

        tk.Label(
            btn_lic_row,
            text="Ao abrir o PDV com internet, a chave liberada pelo Master é sincronizada automaticamente.",
            font=("Segoe UI", 9),
            fg="#64748b",
            bg="#ffffff",
        ).pack(side="left", padx=12)

        # Card 3: Configuração da Impressora de Cupom (Envio Direto para Impressoras Instaladas na Máquina)
        prt_cfg_card = tk.LabelFrame(
            pane,
            text=" 🖨️ 3. Configuração da Impressora de Cupom (Envio Direto da Tela p/ Impressora da Máquina) ",
            font=("Segoe UI", 10, "bold"),
            bg="#ffffff",
            fg="#0f172a",
            padx=16,
            pady=12,
        )
        prt_cfg_card.pack(fill="x", pady=(12, 0))

        tk.Label(
            prt_cfg_card,
            text=(
                "Selecione uma impressora instalada no computador para enviar o cupom direto ao finalizar a venda (sem abrir navegador),\n"
                "ou selecione '🚫 NÃO IMPRIMIR (Desativado)' caso não deseje imprimir nada:"
            ),
            font=("Segoe UI", 9),
            fg="#334155",
            bg="#ffffff",
            justify="left",
        ).pack(anchor="w", pady=(0, 6))

        p_row = tk.Frame(prt_cfg_card, bg="#ffffff")
        p_row.pack(fill="x", pady=4)

        tk.Label(p_row, text="Impressora Selecionada:", bg="#ffffff", font=("Segoe UI", 9, "bold")).pack(
            side="left", padx=(0, 8)
        )
        self.combo_printer_cfg = ttk.Combobox(
            p_row,
            textvariable=self.var_printer_name,
            values=self.installed_printers,
            state="readonly",
            font=("Segoe UI", 10),
            width=45,
        )
        self.combo_printer_cfg.pack(side="left", padx=(0, 8))
        self.combo_printer_cfg.bind("<<ComboboxSelected>>", lambda e: self.on_printer_selection_changed())

        tk.Button(
            p_row,
            text="🔄 Buscar Impressoras da Máquina",
            command=self.refresh_printers_list_clicked,
            bg="#2563eb",
            fg="#ffffff",
            font=("Segoe UI", 9, "bold"),
            padx=12,
            pady=5,
            relief="flat",
            cursor="hand2",
        ).pack(side="left", padx=(0, 6))

        tk.Button(
            p_row,
            text="🚫 Não Imprimir",
            command=self.disable_printer_clicked,
            bg="#fee2e2",
            fg="#b91c1c",
            font=("Segoe UI", 9, "bold"),
            padx=10,
            pady=5,
            relief="flat",
            cursor="hand2",
        ).pack(side="left", padx=(0, 6))

        tk.Button(
            p_row,
            text="🖨️ Testar Impressão Direta",
            command=self.print_test_receipt_clicked,
            bg="#0f172a",
            fg="#ffffff",
            font=("Segoe UI", 9, "bold"),
            padx=12,
            pady=5,
            relief="flat",
            cursor="hand2",
        ).pack(side="left")

        self.lbl_cfg_printer_status = tk.Label(
            prt_cfg_card,
            text="Status da Impressora: ---",
            font=("Segoe UI", 9, "bold"),
            fg="#059669",
            bg="#ffffff",
        )
        self.lbl_cfg_printer_status.pack(anchor="w", pady=(6, 0))

    # ──────────────────────────────────────────────────────────────────────────
    # Gestão de Impressora Direta e Cupom Dinâmico em Tempo Real
    # ──────────────────────────────────────────────────────────────────────────
    def is_printer_enabled(self) -> bool:
        p = (self.var_printer_name.get() or "").strip()
        return bool(p and p != NO_PRINTER_OPTION and not p.startswith("🚫"))

    def refresh_printer_status_ui(self) -> None:
        chosen = (self.var_printer_name.get() or NO_PRINTER_OPTION).strip()
        if self.is_printer_enabled():
            short_p = chosen[:34] + ("..." if len(chosen) > 34 else "")
            if hasattr(self, "lbl_pos_printer_status"):
                self.lbl_pos_printer_status.configure(
                    text=f"🖨️ Impressão Direta Ativa: {short_p}",
                    fg="#059669",
                )
            if hasattr(self, "lbl_cfg_printer_status"):
                self.lbl_cfg_printer_status.configure(
                    text=f"✅ Impressão Automática ATIVA na impressora: '{chosen}' (envia direto ao finalizar venda, sem abrir navegador).",
                    fg="#059669",
                )
        else:
            if hasattr(self, "lbl_pos_printer_status"):
                self.lbl_pos_printer_status.configure(
                    text="🚫 Impressora: NÃO IMPRIMIR (Não imprimirá nada ao finalizar)",
                    fg="#64748b",
                )
            if hasattr(self, "lbl_cfg_printer_status"):
                self.lbl_cfg_printer_status.configure(
                    text="🚫 Configurado para NÃO IMPRIMIR: nenhuma impressão será disparada ao finalizar a venda.",
                    fg="#64748b",
                )

    def on_printer_selection_changed(self) -> None:
        chosen = (self.var_printer_name.get() or NO_PRINTER_OPTION).strip()
        self.cfg["printer_name"] = chosen
        self.cfg["auto_print_receipt"] = self.is_printer_enabled()
        save_config(self.cfg)
        self.refresh_printer_status_ui()

    def disable_printer_clicked(self) -> None:
        self.var_printer_name.set(NO_PRINTER_OPTION)
        self.on_printer_selection_changed()

    def refresh_printers_list_clicked(self) -> None:
        printers, def_p = list_installed_printers()
        self.installed_printers = printers
        self.default_system_printer = def_p
        cur = (self.var_printer_name.get() or NO_PRINTER_OPTION).strip()
        if cur not in self.installed_printers:
            self.installed_printers.append(cur)
        if hasattr(self, "combo_printer_pos"):
            self.combo_printer_pos.configure(values=self.installed_printers)
        if hasattr(self, "combo_printer_cfg"):
            self.combo_printer_cfg.configure(values=self.installed_printers)
        count_real = max(0, len(printers) - 1)
        def_txt = f" (Padrão do Sistema: {def_p})" if def_p else ""
        messagebox.showinfo(
            "Impressoras Encontradas na Máquina",
            f"Foram localizadas {count_real} impressora(s) instalada(s) neste computador{def_txt}.\n\n"
            "Selecione a impressora desejada na caixa ou escolha '🚫 NÃO IMPRIMIR (Desativado)'.",
        )

    def build_current_draft_sale_dict(self) -> Dict[str, Any]:
        subtotal, disc, total, change = self.compute_totals()
        pay_m = self.var_payment_method.get() or "DINHEIRO"
        inst = int(self.var_installments.get() or 1)
        cash_r = self.cash_received_value if (pay_m == "DINHEIRO" and self.cash_received_value > 0) else None
        return {
            "sale_number": "EM ABERTO",
            "session_id": self.cfg.get("active_session_id"),
            "session_title": self.cfg.get("active_session_title") or "PDV",
            "user_name": self.cfg.get("user_name") or self.cfg.get("email") or "Operador",
            "customer_name": (self.var_customer_name.get() if hasattr(self, "var_customer_name") else "") or DEFAULT_CONSUMER_NAME,
            "customer_document": (self.var_customer_doc.get() if hasattr(self, "var_customer_doc") else "") or DEFAULT_CONSUMER_DOC,
            "payment_method": pay_m,
            "installments": inst,
            "subtotal": subtotal,
            "discount_amount": disc,
            "total_amount": total,
            "cash_received": cash_r,
            "change_amount": change if cash_r else None,
            "items": list(self.cart),
            "created_at": datetime.now().isoformat(),
        }

    def update_live_receipt_preview(self, finalized_sale: Optional[Dict[str, Any]] = None) -> None:
        if not hasattr(self, "txt_live_receipt"):
            return
        if finalized_sale is not None:
            txt = format_thermal_receipt_text(finalized_sale, self.cfg, is_preview=False)
        elif self.cart:
            draft = self.build_current_draft_sale_dict()
            txt = format_thermal_receipt_text(draft, self.cfg, is_preview=True)
        elif self.last_completed_sale is not None:
            txt = format_thermal_receipt_text(self.last_completed_sale, self.cfg, is_preview=False)
        else:
            draft = self.build_current_draft_sale_dict()
            txt = format_thermal_receipt_text(draft, self.cfg, is_preview=True)

        self.txt_live_receipt.configure(state="normal")
        self.txt_live_receipt.delete("1.0", tk.END)
        self.txt_live_receipt.insert("1.0", txt)
        self.txt_live_receipt.see(tk.END if self.cart else "1.0")
        self.txt_live_receipt.configure(state="disabled")

    def print_current_or_last_receipt_clicked(self) -> None:
        if not self.is_printer_enabled():
            messagebox.showwarning(
                "Impressora Desativada",
                "A opção atual está configurada como '🚫 NÃO IMPRIMIR (Desativado)'.\n\n"
                "Selecione uma impressora instalada na caixa logo acima para enviar o cupom diretamente para a impressora.",
            )
            return
        target_sale = self.build_current_draft_sale_dict() if self.cart else (self.last_completed_sale or (self.storage.sales[-1] if self.storage.sales else None))
        if not target_sale:
            messagebox.showinfo("Sem Cupom", "Adicione itens ao carrinho ou realize uma venda para imprimir o cupom.")
            return
        is_prev = bool(self.cart)
        receipt_txt = format_thermal_receipt_text(target_sale, self.cfg, is_preview=is_prev)
        ok, msg = send_receipt_to_printer(
            receipt_txt,
            self.var_printer_name.get(),
            sale_number=str(target_sale.get("sale_number") or "PDV"),
        )
        if ok:
            self.lbl_search_feedback.configure(text=f"🖨️ {msg}", fg="#16a34a")
        else:
            messagebox.showerror("Erro na Impressora", msg)

    def print_test_receipt_clicked(self) -> None:
        if not self.is_printer_enabled():
            messagebox.showwarning(
                "Selecione uma Impressora",
                "Escolha primeiro uma impressora instalada na máquina (diferente de '🚫 NÃO IMPRIMIR') para enviar o teste.",
            )
            return
        test_sale = {
            "sale_number": "TESTE-IMPRESSORA",
            "session_id": self.cfg.get("active_session_id") or 1,
            "session_title": self.cfg.get("active_session_title") or "Teste de Impressora",
            "user_name": self.cfg.get("user_name") or "Operador",
            "customer_name": DEFAULT_CONSUMER_NAME,
            "customer_document": DEFAULT_CONSUMER_DOC,
            "payment_method": "PIX",
            "installments": 1,
            "subtotal": 49.90,
            "discount_amount": 0.0,
            "total_amount": 49.90,
            "items": [
                {
                    "isbn": "9788535914849",
                    "sku": "1001",
                    "name": "ITEM DE TESTE BOBINA 80MM",
                    "quantity": 1,
                    "unit_price": 49.90,
                    "discount": 0.0,
                }
            ],
            "client_sale_uuid": "TESTE-DIRETO-SEM-NAVEGADOR",
            "synced": True,
            "created_at": datetime.now().isoformat(),
        }
        receipt_txt = format_thermal_receipt_text(test_sale, self.cfg, is_preview=False)
        ok, msg = send_receipt_to_printer(receipt_txt, self.var_printer_name.get(), sale_number="TESTE")
        if ok:
            messagebox.showinfo("Teste de Impressão Enviado", msg)
        else:
            messagebox.showerror("Falha no Teste de Impressão", msg)

    # ──────────────────────────────────────────────────────────────────────────
    # Atualização Visual de Licença e Travas de Segurança
    # ──────────────────────────────────────────────────────────────────────────
    def refresh_license_ui(self) -> None:
        self.license_status = verify_pdv_desktop_license_key(
            self.cfg.get("license_key", ""),
            expected_company_id=self.cfg.get("company_id"),
            last_seen_date=self.cfg.get("last_seen_date"),
        )
        is_val = bool(self.license_status.get("is_valid"))
        rng_en = bool(self.license_status.get("range_sync_enabled"))
        st_lbl = str(self.license_status.get("status_label") or "")

        if is_val:
            exp_br = self.license_status.get("expires_at_br") or ""
            days = self.license_status.get("days_remaining", 0)
            self.lbl_license_badge.configure(
                text=f"🔑 ATIVO ATÉ {exp_br} ({days}d)",
                bg="#059669" if days > 5 else "#d97706",
            )
            self.lbl_license_detail.configure(text=f"✅ {st_lbl}", fg="#16a34a")
        else:
            self.lbl_license_badge.configure(text="🔒 LICENÇA EXPIRADA / BLOQUEADA", bg="#dc2626")
            self.lbl_license_detail.configure(text=f"🔒 {st_lbl}", fg="#dc2626")

        self.lbl_license_features.configure(
            text=(
                f"Sincronização de Catálogo por Sequência Horus (COD_ITEM_INI/FIM): "
                f"{'LIBERADA PELO MASTER ✅' if (is_val and rng_en) else 'BLOQUEADA PELO MASTER 🔒'}"
            ),
            fg="#059669" if (is_val and rng_en) else "#d97706",
        )

    def validate_manual_license_key_clicked(self) -> None:
        key = self.var_license_key.get().strip()
        res = verify_pdv_desktop_license_key(
            key,
            expected_company_id=self.cfg.get("company_id"),
            last_seen_date=self.cfg.get("last_seen_date"),
        )
        # Sempre persiste a chave informada (mesmo se expirada) para não manter chave antiga em cache
        self.cfg["license_key"] = key
        save_config(self.cfg)
        self.refresh_license_ui()
        if res.get("is_valid"):
            messagebox.showinfo("Chave Ativada com Sucesso", res.get("status_label", "Licença válida!"))
        else:
            messagebox.showerror("Chave Inválida ou Expirada", res.get("status_label", "Chave inválida."))

    def fetch_license_from_master_clicked(self) -> None:
        if not self.cfg.get("access_token"):
            messagebox.showwarning("Login Necessário", "Autentique o Seller primeiro no quadro acima.")
            return
        threading.Thread(target=self._fetch_license_worker, args=(True,), daemon=True).start()

    def _fetch_license_worker(self, interactive: bool = False) -> None:
        ok, msg, body = self.api.fetch_desktop_license()
        self.ui_queue.put(("LICENSE_FETCHED", (ok, msg, body, interactive)))

    # ──────────────────────────────────────────────────────────────────────────
    # Sincronização Sequencial de Catálogo Horus (COD_ITEM_INI -> COD_ITEM_FIM)
    # ──────────────────────────────────────────────────────────────────────────
    def on_toggle_auto_sync_new_items(self) -> None:
        enabled = bool(self.var_auto_sync_new_items.get())
        self.cfg["auto_sync_new_horus_items"] = enabled
        save_config(self.cfg)
        last_code = self.storage.get_last_integrated_horus_code()
        if enabled:
            self.lbl_range_progress.configure(
                text=f"⚡ Sincronização automática ao abrir ATIVADA (último COD_ITEM integrado: {last_code}).",
                fg="#059669",
            )
        else:
            self.lbl_range_progress.configure(
                text="ℹ️ Sincronização automática ao abrir DESATIVADA pelo operador.",
                fg="#64748b",
            )

    def fill_next_sequence_clicked(self) -> None:
        last_c = self.storage.get_last_integrated_horus_code()
        next_ini = last_c + 1
        next_fim = last_c + 5000
        self.var_cod_ini.set(str(next_ini))
        self.var_cod_fim.set(str(next_fim))
        self.lbl_range_progress.configure(
            text=f"Sequência preenchida a partir do último COD_ITEM integrado no Horus ({last_c}): {next_ini} até {next_fim}.",
            fg="#2563eb",
        )

    def sync_new_horus_items_from_last_code(self, interactive: bool = False) -> None:
        """
        Identifica automaticamente qual foi o último item integrado do Horus (COD_ITEM)
        na prática e consulta o Horus online a partir de `ultimo_codigo + 1` para
        coletar e salvar no cache local todos os novos produtos recém-cadastrados.
        """
        if self.range_sync_running:
            if interactive:
                messagebox.showinfo("Sincronização em Andamento", "Já existe uma sincronização do catálogo Horus em execução.")
            return

        if not self.cfg.get("access_token") or not self.cfg.get("company_id"):
            if interactive:
                messagebox.showwarning("Credenciais Seller", "Autentique o Seller na aba 4 antes de buscar novos itens no Horus.")
            return

        try:
            self.api.fetch_desktop_license(timeout=3.5)
            self.var_license_key.set(str(self.cfg.get("license_key") or ""))
        except Exception:
            pass
        self.refresh_license_ui()

        if not self.license_status.get("is_valid") or not self.license_status.get("range_sync_enabled"):
            if interactive:
                messagebox.showwarning(
                    "Licença / Sincronização Horus",
                    "Verifique se a chave de licença do PDV está válida e com a Sincronização por Sequência habilitada no Master.",
                )
            return

        try:
            step = max(100, min(2000, int(self.var_cod_step.get().strip() or "500")))
        except ValueError:
            step = 500

        last_code = self.storage.get_last_integrated_horus_code()
        self.range_sync_running = True
        self.range_sync_stop_requested = False
        self.btn_start_range_sync.configure(state="disabled")
        if hasattr(self, "btn_sync_new_horus"):
            self.btn_sync_new_horus.configure(state="disabled")
        self.btn_stop_range_sync.configure(state="normal")

        threading.Thread(
            target=self._delta_horus_sync_worker,
            args=(last_code, step, interactive),
            daemon=True,
        ).start()

    def _delta_horus_sync_worker(self, initial_last_code: int, step: int, interactive: bool) -> None:
        sid = self.cfg.get("active_session_id")
        bid = self.cfg.get("active_branch_id")
        cur_ini = max(1, initial_last_code + 1)
        max_batches = 12 if interactive else 6
        consecutive_empty = 0
        total_new_items = 0
        highest_code_seen = initial_last_code

        for batch_idx in range(1, max_batches + 1):
            if self.range_sync_stop_requested:
                break
            cur_fim = cur_ini + step - 1
            self.ui_queue.put((
                "RANGE_SYNC_PROGRESS",
                (
                    batch_idx - 1,
                    max_batches,
                    f"⚡ Auto-Sync Horus: verificando novos itens cadastrados após COD_ITEM {highest_code_seen} (faixa {cur_ini}..{cur_fim})...",
                ),
            ))

            ok, msg, body = self.api.sync_horus_catalog_range(
                cod_item_ini=cur_ini,
                cod_item_fim=cur_fim,
                session_id=int(sid) if sid else None,
                branch_id=int(bid) if bid else None,
                limit=max(500, step),
            )
            if not ok:
                self.ui_queue.put(("DELTA_SYNC_FINISHED", (False, msg, interactive, total_new_items, highest_code_seen)))
                return

            batch_items = body.get("items") or []
            if batch_items:
                consecutive_empty = 0
                self.storage.save_catalog(batch_items, merge=True)
                total_new_items += len(batch_items)
                new_max = self.storage.get_last_integrated_horus_code()
                if new_max > highest_code_seen:
                    highest_code_seen = new_max
                rec_fim = max(cur_ini, highest_code_seen)
                self.storage.record_range_synced(cur_ini, rec_fim, len(batch_items), max_cod_found=highest_code_seen)
                self.ui_queue.put((
                    "RANGE_SYNC_PROGRESS",
                    (
                        batch_idx,
                        max_batches,
                        f"✅ +{len(batch_items)} novo(s) item(ns) integrado(s) do Horus! Último COD_ITEM: {highest_code_seen}.",
                    ),
                ))
            else:
                consecutive_empty += 1
                # Se já tínhamos base sincronizada e encontramos 2 lotes seguidos vazios (ou 1 lote vazio sem nenhum item novo),
                # significa que já alcançamos o topo dos itens cadastrados no Horus na prática.
                if initial_last_code > 0 and (consecutive_empty >= 2 or (batch_idx == 1 and total_new_items == 0)):
                    break

            cur_ini = cur_fim + 1

        if total_new_items > 0:
            summary_msg = (
                f"⚡ Sincronização incremental Horus concluída: {total_new_items} novo(s) produto(s) "
                f"integrado(s) ao cache offline! (Último COD_ITEM integrado: {highest_code_seen})."
            )
        else:
            summary_msg = (
                f"✅ Catálogo local já está 100% atualizado com os últimos cadastros do Horus "
                f"(Último COD_ITEM integrado: {highest_code_seen})."
            )
        self.ui_queue.put(("DELTA_SYNC_FINISHED", (True, summary_msg, interactive, total_new_items, highest_code_seen)))

    def start_horus_range_sync_clicked(self) -> None:
        if self.cfg.get("access_token") and self.cfg.get("company_id"):
            try:
                self.api.fetch_desktop_license(timeout=3.5)
                self.var_license_key.set(str(self.cfg.get("license_key") or ""))
            except Exception:
                pass
        self.refresh_license_ui()
        if not self.license_status.get("is_valid"):
            messagebox.showerror(
                "Licença Necessária",
                f"Não é possível sincronizar o catálogo:\n{self.license_status.get('status_label')}\n\n"
                "Acesse a aba '4. Credenciais Seller & Chave de Licença' e clique em 'Buscar Chave Liberada no Painel Master'.",
            )
            self.notebook.select(self.tab_config)
            return
        if not self.license_status.get("range_sync_enabled"):
            messagebox.showwarning(
                "Rotina Não Habilitada",
                "A rotina de Sincronização por Sequência Horus (COD_ITEM_INI / COD_ITEM_FIM) não está liberada na sua chave atual.\n\n"
                "Solicite ao Master para ativar a opção 'Liberar Sync Catálogo por Range' e clique em 'Buscar Chave Liberada no Painel Master'.",
            )
            return

        try:
            cod_ini = max(1, int(self.var_cod_ini.get().strip()))
            cod_fim = max(cod_ini, int(self.var_cod_fim.get().strip()))
            step = max(50, min(5000, int(self.var_cod_step.get().strip())))
        except ValueError:
            messagebox.showwarning("Valores Inválidos", "Informe números inteiros válidos para COD_ITEM_INI e COD_ITEM_FIM.")
            return

        ranges_to_run: List[Tuple[int, int]] = []
        cur = cod_ini
        while cur <= cod_fim:
            end_c = min(cod_fim, cur + step - 1)
            ranges_to_run.append((cur, end_c))
            cur = end_c + 1

        self._launch_ranges_sync_thread(ranges_to_run)

    def reload_existing_ranges_clicked(self) -> None:
        self.refresh_license_ui()
        if not self.license_status.get("is_valid") or not self.license_status.get("range_sync_enabled"):
            messagebox.showwarning(
                "Licença / Permissão",
                "Verifique se sua chave de licença está ativa e com a sincronização por sequência habilitada pelo Master.",
            )
            return

        history = list(self.storage.sync_state.get("ranges_history") or [])
        if not history:
            messagebox.showinfo(
                "Sem Faixas Anteriores",
                "Ainda não há faixas salvas no histórico local. Use o botão 'Sincronizar Faixa Horus' primeiro.",
            )
            return

        stale = self.storage.get_stale_ranges(max_age_hours=24.0)
        target_list = stale if stale else history
        label_kind = f"{len(stale)} faixa(s) com mais de 24h" if stale else f"todas as {len(history)} faixa(s) salvas"
        if not messagebox.askyesno(
            "Recarregar Catálogo Local",
            f"Deseja recarregar {label_kind} diretamente do Horus ERP para atualizar preços e saldos locais?",
        ):
            return

        ranges_to_run = [(int(r["cod_ini"]), int(r["cod_fim"])) for r in target_list]
        self._launch_ranges_sync_thread(ranges_to_run)

    def reload_selected_range_from_tree(self) -> None:
        sel = self.tree_ranges.selection()
        if not sel:
            return
        iid = sel[0]
        try:
            parts = iid.split("_")
            c_ini, c_fim = int(parts[0]), int(parts[1])
            self.var_cod_ini.set(str(c_ini))
            self.var_cod_fim.set(str(c_fim))
            self.start_horus_range_sync_clicked()
        except Exception:
            pass

    def _launch_ranges_sync_thread(self, ranges_list: List[Tuple[int, int]]) -> None:
        if self.range_sync_running:
            return
        self.range_sync_running = True
        self.range_sync_stop_requested = False
        self.btn_start_range_sync.configure(state="disabled")
        if hasattr(self, "btn_sync_new_horus"):
            self.btn_sync_new_horus.configure(state="disabled")
        self.btn_stop_range_sync.configure(state="normal")
        self.progress_range["value"] = 0
        self.progress_range["maximum"] = max(1, len(ranges_list))
        threading.Thread(target=self._range_sync_worker, args=(ranges_list,), daemon=True).start()

    def stop_horus_range_sync_clicked(self) -> None:
        if self.range_sync_running:
            self.range_sync_stop_requested = True
            self.lbl_range_progress.configure(
                text="⏸️ Pausando após concluir o lote atual (tudo o que já baixou está salvo)...",
                fg="#d97706",
            )

    def _range_sync_worker(self, ranges_list: List[Tuple[int, int]]) -> None:
        sid = self.cfg.get("active_session_id")
        bid = self.cfg.get("active_branch_id")
        total_batches = len(ranges_list)
        total_loaded = 0

        for idx, (c_ini, c_fim) in enumerate(ranges_list, start=1):
            if self.range_sync_stop_requested:
                self.ui_queue.put((
                    "RANGE_SYNC_FINISHED",
                    (True, f"⏸️ Sincronização pausada pelo operador no código {c_ini - 1}. ({total_loaded} itens atualizados)."),
                ))
                return

            self.ui_queue.put((
                "RANGE_SYNC_PROGRESS",
                (idx - 1, total_batches, f"⏳ Consultando Horus: COD_ITEM_INI={c_ini} até COD_ITEM_FIM={c_fim} (Lote {idx}/{total_batches})..."),
            ))

            ok, msg, body = self.api.sync_horus_catalog_range(
                cod_item_ini=c_ini,
                cod_item_fim=c_fim,
                session_id=int(sid) if sid else None,
                branch_id=int(bid) if bid else None,
                limit=max(500, (c_fim - c_ini + 1)),
            )
            if not ok:
                self.ui_queue.put(("RANGE_SYNC_FINISHED", (False, msg)))
                return

            batch_items = body.get("items") or []
            if batch_items:
                self.storage.save_catalog(batch_items, merge=True)
                total_loaded += len(batch_items)
            self.storage.record_range_synced(
                c_ini,
                c_fim,
                len(batch_items),
                max_cod_found=self.storage.get_last_integrated_horus_code() if batch_items else None,
            )

            self.ui_queue.put((
                "RANGE_SYNC_PROGRESS",
                (idx, total_batches, f"✅ Lote {c_ini}..{c_fim} concluído ({len(batch_items)} itens). Total acumulado nesta execução: {total_loaded}."),
            ))

        self.ui_queue.put((
            "RANGE_SYNC_FINISHED",
            (True, f"🎉 Sincronização Horus concluída! {total_loaded} produto(s) processado(s) e salvos no cache offline."),
        ))

    # ──────────────────────────────────────────────────────────────────────────
    # Cliente Obrigatório (CPF / CNPJ Válido ou Consumidor Padrão 99999999999)
    # ──────────────────────────────────────────────────────────────────────────
    def set_default_consumer_customer(self) -> None:
        self.var_customer_doc.set(DEFAULT_CONSUMER_DOC)
        self.var_customer_name.set(DEFAULT_CONSUMER_NAME)
        self._update_customer_doc_status_ui()

    def clear_for_custom_customer(self) -> None:
        if self.var_customer_doc.get().strip() == DEFAULT_CONSUMER_DOC:
            self.var_customer_doc.set("")
        if self.var_customer_name.get().strip() == DEFAULT_CONSUMER_NAME:
            self.var_customer_name.set("")
        self._update_customer_doc_status_ui()
        self.entry_customer_doc.focus_set()

    def focus_customer_doc_entry(self) -> None:
        self.notebook.select(self.tab_pos)
        self.entry_customer_doc.focus_set()
        self.entry_customer_doc.select_range(0, tk.END)

    def _on_customer_doc_key(self, event: Any = None) -> None:
        self._update_customer_doc_status_ui()

    def _on_customer_doc_focus_out(self, event: Any = None) -> None:
        raw = self.var_customer_doc.get().strip()
        if not raw:
            self.var_customer_doc.set(DEFAULT_CONSUMER_DOC)
            if not self.var_customer_name.get().strip():
                self.var_customer_name.set(DEFAULT_CONSUMER_NAME)
        self._update_customer_doc_status_ui()

    def _update_customer_doc_status_ui(self) -> None:
        raw = self.var_customer_doc.get().strip()
        if not raw:
            self.lbl_customer_doc_status.configure(
                text="⚠️ Vazio: ao finalizar preencherá 99999999999 (Consumidor Final)",
                fg="#d97706",
            )
            self.update_live_receipt_preview()
            return
        ok, _, _, msg = validate_cpf_or_cnpj(raw)
        if ok:
            self.lbl_customer_doc_status.configure(text=f"✅ {msg}", fg="#16a34a")
        else:
            self.lbl_customer_doc_status.configure(text=f"❌ {msg}", fg="#dc2626")
        self.update_live_receipt_preview()

    # ──────────────────────────────────────────────────────────────────────────
    # Lógica de Máscaras Monetárias (R$ e %), Desconto (Venda vs Item) e Pagamento
    # ──────────────────────────────────────────────────────────────────────────
    def focus_discount_entry(self) -> None:
        self.notebook.select(self.tab_pos)
        self.entry_discount.focus_set()
        self.entry_discount.icursor(tk.END)

    def set_discount_mode(self, mode: str) -> None:
        self.discount_mode = mode
        if mode == "BRL":
            self.btn_disc_brl.configure(bg="#2563eb", fg="#ffffff")
            self.btn_disc_pct.configure(bg="#e2e8f0", fg="#0f172a")
        else:
            self.btn_disc_pct.configure(bg="#2563eb", fg="#ffffff")
            self.btn_disc_brl.configure(bg="#e2e8f0", fg="#0f172a")
        txt, val = format_atm_currency(self.discount_raw_digits, mode=self.discount_mode)
        self.discount_value = val
        self.var_discount_display.set(txt)

    def _on_discount_key(self, event: Any) -> None:
        if getattr(event, "keysym", "") == "Return":
            return
        raw = self.var_discount_display.get()
        self.discount_raw_digits = "".join(c for c in raw if c.isdigit())
        txt, val = format_atm_currency(self.discount_raw_digits, mode=self.discount_mode)
        self.discount_value = val
        self.var_discount_display.set(txt)
        self.entry_discount.icursor(tk.END)

    def apply_discount_by_scope(self, scope: str) -> None:
        """
        Aplica o valor/percentual de desconto digitado:
        - `scope == "SALE"`: rateia proporcionalmente entre todos os itens da venda.
        - `scope == "ITEM"`: aplica exclusivamente no único item selecionado na tabela do carrinho.
        """
        self.discount_scope = scope
        self.var_discount_scope.set(scope)

        if not self.cart:
            messagebox.showinfo("Carrinho Vazio", "Adicione itens ao carrinho antes de aplicar um desconto.")
            return

        if scope == "ITEM":
            sel = self.tree_cart.selection()
            if sel and str(sel[0]).isdigit():
                sel_idx = int(sel[0])
            elif len(self.cart) == 1:
                sel_idx = 0
            else:
                messagebox.showwarning(
                    "Selecione um Item",
                    "Clique em um item na tabela do carrinho para aplicar o desconto individual nele,\n"
                    "ou clique em '📊 Ratear na Venda' para distribuir o desconto em toda a venda.",
                )
                return

            self.active_prorated_discount = None
            apply_cart_discount(
                self.cart,
                discount_value=self.discount_value,
                discount_mode=self.discount_mode,
                scope="ITEM",
                selected_idx=sel_idx,
            )
            item_disc = float(self.cart[sel_idx].get("discount") or 0.0)
            item_name = str(self.cart[sel_idx].get("name") or "")[:24]
            self.lbl_discount_scope_info.configure(
                text=f"🎯 Desconto no Item #{sel_idx + 1} ({item_name}): - {format_brl(item_disc)}",
                fg="#2563eb",
            )
            self.refresh_cart_ui(selected_idx=sel_idx)
            return

        # scope == "SALE" (Ratear na Venda Toda)
        self.active_prorated_discount = (self.discount_mode, self.discount_value)
        total_disc = apply_cart_discount(
            self.cart,
            discount_value=self.discount_value,
            discount_mode=self.discount_mode,
            scope="SALE",
        )
        self.lbl_discount_scope_info.configure(
            text=f"📊 Desconto rateado em {len(self.cart)} item(ns) da venda: - {format_brl(total_disc)}",
            fg="#16a34a" if total_disc > 0 else "#64748b",
        )
        self.refresh_cart_ui()

    def clear_discounts_clicked(self) -> None:
        self.discount_raw_digits = ""
        self.discount_value = 0.0
        self.active_prorated_discount = None
        self.var_discount_display.set("R$ 0,00" if self.discount_mode == "BRL" else "0,00%")
        for it in self.cart:
            it["discount"] = 0.0
            it["discount_source"] = "NONE"
        self.lbl_discount_scope_info.configure(
            text="Descontos zerados. Escolha 'Ratear na Venda' ou 'No Item'.",
            fg="#64748b",
        )
        self.refresh_cart_ui()

    def _recompute_active_discounts(self) -> None:
        """
        Mantém os descontos consistentes quando quantidades ou itens mudam no carrinho.
        """
        if not self.cart:
            return
        if self.active_prorated_discount is not None:
            mode, val = self.active_prorated_discount
            apply_cart_discount(self.cart, discount_value=val, discount_mode=mode, scope="SALE")
            return
        for it in self.cart:
            gross = round(float(it.get("unit_price") or 0.0) * int(it.get("quantity") or 1), 2)
            if it.get("discount_source") == "ITEM":
                m_app = it.get("discount_mode_applied", "BRL")
                v_app = float(it.get("discount_val_applied") or 0.0)
                if m_app == "PCT":
                    it["discount"] = round(gross * (min(v_app, 100.0) / 100.0), 2)
                else:
                    it["discount"] = round(min(v_app, gross), 2)
            else:
                it["discount"] = round(min(float(it.get("discount") or 0.0), gross), 2)

    def select_payment_shortcut(self, method: str) -> None:
        self.var_payment_method.set(method)
        if method != "CREDITO":
            self.var_installments.set("1")
        self.refresh_cart_ui()
        self._refresh_checkout_modal_ui()
        if method == "DINHEIRO" and hasattr(self, "entry_cash_received") and self.entry_cash_received is not None:
            try:
                if self.entry_cash_received.winfo_exists():
                    self.entry_cash_received.focus_set()
                    self.entry_cash_received.icursor(tk.END)
            except Exception:
                pass
        self.lbl_search_feedback.configure(
            text=f"💳 Forma de pagamento selecionada: {method} ({self.var_installments.get()}x).",
            fg="#2563eb",
        )

    def set_installments_shortcut(self, count: int) -> None:
        n = max(1, min(12, int(count)))
        if n > 1 and self.var_payment_method.get() != "CREDITO":
            self.var_payment_method.set("CREDITO")
        self.var_installments.set(str(n))
        self.refresh_cart_ui()
        self._refresh_checkout_modal_ui()
        self.lbl_search_feedback.configure(
            text=f"💳 Parcelamento definido: {self.var_payment_method.get()} em {n}x.",
            fg="#2563eb",
        )

    def cycle_installments_shortcut(self, delta: int = 1) -> None:
        if self.var_payment_method.get() != "CREDITO":
            self.var_payment_method.set("CREDITO")
            cur = 1
        else:
            cur = int(self.var_installments.get() or 1)
        nxt = cur + delta
        if nxt > 12:
            nxt = 1
        elif nxt < 1:
            nxt = 12
        self.var_installments.set(str(nxt))
        self.refresh_cart_ui()
        self._refresh_checkout_modal_ui()
        self.lbl_search_feedback.configure(
            text=f"💳 Parcelamento alterado: CRÉDITO em {nxt}x.",
            fg="#2563eb",
        )

    def _on_installments_combo_change(self) -> None:
        n = int(self.var_installments.get() or 1)
        if n > 1 and self.var_payment_method.get() != "CREDITO":
            self.var_payment_method.set("CREDITO")
        self.refresh_cart_ui()
        self._refresh_checkout_modal_ui()

    def _on_cash_received_key(self, event: Any) -> None:
        if getattr(event, "keysym", "") in ("Return", "F12"):
            return
        raw = self.var_cash_received.get()
        self.cash_received_digits = "".join(c for c in raw if c.isdigit())
        txt, val = format_atm_currency(self.cash_received_digits, mode="BRL")
        self.cash_received_value = val
        self.var_cash_received.set(txt)
        if hasattr(self, "entry_cash_received") and self.entry_cash_received is not None:
            try:
                if self.entry_cash_received.winfo_exists():
                    self.entry_cash_received.icursor(tk.END)
            except Exception:
                pass
        self.refresh_cart_ui()
        self._refresh_checkout_modal_ui()

    def _on_initial_cash_key(self, event: Any) -> None:
        raw = self.var_initial_cash.get()
        self.initial_cash_digits = "".join(c for c in raw if c.isdigit())
        txt, _ = format_atm_currency(self.initial_cash_digits, mode="BRL")
        self.var_initial_cash.set(txt)

    def _on_payment_method_change(self) -> None:
        m = self.var_payment_method.get()
        if m != "CREDITO":
            self.var_installments.set("1")
        self.refresh_cart_ui()
        self._refresh_checkout_modal_ui()

    def compute_totals(self) -> Tuple[float, float, float, float]:
        subtotal = round(sum(float(i["unit_price"]) * int(i["quantity"]) for i in self.cart), 2)
        disc = round(min(sum(float(i.get("discount") or 0.0) for i in self.cart), subtotal), 2)
        total = round(max(0.0, subtotal - disc), 2)
        change = 0.0
        if self.var_payment_method.get() == "DINHEIRO" and self.cash_received_value > total:
            change = round(self.cash_received_value - total, 2)
        return subtotal, disc, total, change

    def on_search_enter(self, force_online: bool = False) -> None:
        term = self.var_search.get().strip()
        if not term:
            self._populate_search_results(self.storage.products[:40])
            return

        if not force_online:
            local_matches = self.storage.search_local(term)
            if len(local_matches) == 1 and (
                term.upper() in (local_matches[0].get("isbn", "").upper(), local_matches[0].get("sku", "").upper())
                or (term.isdigit() and len(term) >= 8)
            ):
                self.add_product_to_cart(local_matches[0])
                self.var_search.set("")
                self.lbl_search_feedback.configure(
                    text=f"✅ Adicionado via Cache Local (<1ms): {local_matches[0].get('name')}",
                    fg="#16a34a",
                )
                return
            elif local_matches:
                self._populate_search_results(local_matches)
                self.lbl_search_feedback.configure(
                    text=f"📚 {len(local_matches)} produto(s) encontrado(s) no Catálogo Local.",
                    fg="#2563eb",
                )
                return

        self.lbl_search_feedback.configure(
            text=f"🌐 Consultando '{term}' em tempo real no Horus ERP...", fg="#d97706"
        )
        threading.Thread(target=self._search_horus_worker, args=(term,), daemon=True).start()

    def _search_horus_worker(self, term: str) -> None:
        sid = self.cfg.get("active_session_id")
        bid = self.cfg.get("active_branch_id")
        items = self.api.realtime_search_horus(term, session_id=sid, branch_id=bid)
        if items:
            self.storage.save_catalog(items, merge=True)
            norm_items = [self.storage.normalize_product(x) for x in items]
            self.ui_queue.put(("SEARCH_RESULTS", (term, norm_items)))
        else:
            self.ui_queue.put(("SEARCH_EMPTY", term))

    def _populate_search_results(self, items: List[Dict[str, Any]]) -> None:
        for row in self.tree_results.get_children():
            self.tree_results.delete(row)
        self._last_search_items = items
        for idx, p in enumerate(items):
            self.tree_results.insert(
                "",
                "end",
                iid=str(idx),
                values=(
                    p.get("isbn") or p.get("barcode") or "",
                    p.get("sku") or "",
                    p.get("name") or "",
                    p.get("brand") or "",
                    p.get("stock_quantity", 0),
                    format_brl(p.get("price", 0)),
                ),
            )

    def add_selected_result_to_cart(self) -> None:
        sel = self.tree_results.selection()
        if not sel:
            return
        idx = int(sel[0])
        items = getattr(self, "_last_search_items", [])
        if 0 <= idx < len(items):
            self.add_product_to_cart(items[idx])

    def add_product_to_cart(self, prod: Dict[str, Any]) -> None:
        uid = str(prod.get("isbn") or prod.get("sku") or prod.get("id") or "")
        stock_qty = int(prod.get("stock_quantity") if prod.get("stock_quantity") is not None else 0)
        validate_stk = bool(self.cfg.get("validate_stock", False))

        existing_idx: Optional[int] = None
        for idx, item in enumerate(self.cart):
            if str(item.get("isbn") or item.get("sku") or item.get("id")) == uid:
                existing_idx = idx
                break

        desired_qty = (int(self.cart[existing_idx]["quantity"]) + 1) if existing_idx is not None else 1
        if validate_stk and desired_qty > stock_qty:
            prod_name = prod.get("name") or "Produto"
            self.lbl_search_feedback.configure(
                text=f"🚫 Estoque insuficiente para '{prod_name}': Saldo disponível = {stock_qty} un. ( pedido: {desired_qty} un. )",
                fg="#dc2626",
            )
            messagebox.showwarning(
                "Estoque Insuficiente (Validação Ativa)",
                f"Não é possível adicionar mais unidades de:\n\n"
                f"• {prod_name}\n"
                f"• Saldo disponível: {stock_qty} un.\n"
                f"• Quantidade solicitada: {desired_qty} un.\n\n"
                "Dica: Você pode desmarcar '🛡️ Validar Estoque' caso queira permitir venda livre sem saldo.",
            )
            return

        if existing_idx is not None:
            self.cart[existing_idx]["quantity"] = desired_qty
            self.cart[existing_idx]["stock_quantity"] = stock_qty
            self._recompute_active_discounts()
            self.refresh_cart_ui(selected_idx=existing_idx)
            return

        self.cart.append({
            "id": prod.get("id") or uid,
            "sku": prod.get("sku") or uid,
            "isbn": prod.get("isbn") or prod.get("barcode") or uid,
            "name": prod.get("name") or "Produto PDV",
            "unit_price": float(prod.get("price") or 0.0),
            "stock_quantity": stock_qty,
            "quantity": 1,
            "discount": 0.0,
            "discount_source": "NONE",
        })
        self._recompute_active_discounts()
        self.refresh_cart_ui(selected_idx=len(self.cart) - 1)

    def _on_cart_tree_click(self, event: Any) -> None:
        """
        Permite clicar diretamente nos botões inline `➖`, `➕` e `🗑️` dentro da linha
        da tabela do carrinho sem perder o foco/seleção do item.
        """
        region = self.tree_cart.identify("region", event.x, event.y)
        if region != "cell":
            return
        row_id = self.tree_cart.identify_row(event.y)
        col_id = self.tree_cart.identify_column(event.x)
        if not row_id or not str(row_id).isdigit():
            return
        idx = int(row_id)
        # Colunas: #1=seq, #2=isbn, #3=name, #4=stock, #5=minus, #6=qty, #7=plus, #8=unit_price, #9=discount, #10=subtotal, #11=remove
        if col_id == "#5":
            self.change_cart_qty(-1, target_idx=idx)
        elif col_id == "#7":
            self.change_cart_qty(1, target_idx=idx)
        elif col_id == "#11":
            self.remove_cart_item(target_idx=idx)

    def change_cart_qty(self, delta: int, target_idx: Optional[int] = None) -> None:
        if not self.cart:
            return
        if target_idx is not None:
            idx = target_idx
        else:
            sel = self.tree_cart.selection()
            if sel and str(sel[0]).isdigit():
                idx = int(sel[0])
            else:
                idx = len(self.cart) - 1

        if 0 <= idx < len(self.cart):
            item = self.cart[idx]
            new_q = int(item["quantity"]) + delta
            if delta > 0 and bool(self.cfg.get("validate_stock", False)):
                stock_q = int(item.get("stock_quantity") if item.get("stock_quantity") is not None else 0)
                if new_q > stock_q:
                    messagebox.showwarning(
                        "Estoque Insuficiente (Validação Ativa)",
                        f"O item '{item.get('name')}' possui saldo disponível de {stock_q} un.\n"
                        f"Não é possível alterar para {new_q} un. enquanto '🛡️ Validar Estoque' estiver ativo.",
                    )
                    self.refresh_cart_ui(selected_idx=idx)
                    return

            if new_q <= 0:
                self.cart.pop(idx)
                self._recompute_active_discounts()
                next_sel = min(idx, len(self.cart) - 1) if self.cart else None
                self.refresh_cart_ui(selected_idx=next_sel)
            else:
                item["quantity"] = new_q
                self._recompute_active_discounts()
                self.refresh_cart_ui(selected_idx=idx)

    def remove_cart_item(self, target_idx: Optional[int] = None) -> None:
        if not self.cart:
            return
        if target_idx is not None:
            idx = target_idx
        else:
            sel = self.tree_cart.selection()
            if not sel or not str(sel[0]).isdigit():
                return
            idx = int(sel[0])

        if 0 <= idx < len(self.cart):
            self.cart.pop(idx)
            self._recompute_active_discounts()
            next_sel = min(idx, len(self.cart) - 1) if self.cart else None
            self.refresh_cart_ui(selected_idx=next_sel)

    def on_toggle_validate_stock_checkbox(self) -> None:
        val = bool(self.var_validate_stock.get())
        self.cfg["validate_stock"] = val
        save_config(self.cfg)
        self.lbl_session_badge.configure(text=self._format_session_badge_text())
        sid = self.cfg.get("active_session_id")
        if sid and self.cfg.get("access_token"):
            threading.Thread(
                target=self._update_session_stock_setting_worker,
                args=(int(sid), val),
                daemon=True,
            ).start()
        status_txt = "ATIVADA (bloqueia venda sem saldo)" if val else "DESATIVADA (venda livre)"
        self.lbl_search_feedback.configure(
            text=f"🛡️ Validação de estoque da sessão {status_txt}.",
            fg="#059669" if val else "#2563eb",
        )

    def _update_session_stock_setting_worker(self, session_id: int, validate_stock: bool) -> None:
        ok, _, _ = self.api.update_session_settings(session_id, validate_stock=validate_stock)
        if ok:
            self.refresh_open_sessions_async()

    def clear_cart(self) -> None:
        self.cart.clear()
        self.discount_raw_digits = ""
        self.discount_value = 0.0
        self.active_prorated_discount = None
        self.var_discount_display.set("R$ 0,00" if self.discount_mode == "BRL" else "0,00%")
        if hasattr(self, "lbl_discount_scope_info"):
            self.lbl_discount_scope_info.configure(
                text="Escolha 'Ratear na Venda' ou selecione 1 item e clique 'No Item'.",
                fg="#64748b",
            )
        self.cash_received_digits = ""
        self.cash_received_value = 0.0
        self.var_cash_received.set("R$ 0,00")
        self.var_customer_name.set(DEFAULT_CONSUMER_NAME)
        self.var_customer_doc.set(DEFAULT_CONSUMER_DOC)
        self._update_customer_doc_status_ui()
        self.refresh_cart_ui()
        self.entry_search.focus_set()

    def refresh_cart_ui(self, selected_idx: Optional[int] = None) -> None:
        if selected_idx is None:
            prev_sel = self.tree_cart.selection()
            if prev_sel and str(prev_sel[0]).isdigit():
                selected_idx = int(prev_sel[0])

        for row in self.tree_cart.get_children():
            self.tree_cart.delete(row)

        for idx, it in enumerate(self.cart):
            gross = round(float(it["unit_price"]) * int(it["quantity"]), 2)
            item_disc = round(float(it.get("discount") or 0.0), 2)
            net_sub = round(max(0.0, gross - item_disc), 2)
            stk = it.get("stock_quantity", 0)
            disc_str = f"- {format_brl(item_disc)}" if item_disc > 0 else "R$ 0,00"
            self.tree_cart.insert(
                "",
                "end",
                iid=str(idx),
                values=(
                    idx + 1,
                    it.get("isbn") or it.get("sku"),
                    it.get("name"),
                    stk,
                    "➖",
                    it.get("quantity"),
                    "➕",
                    format_brl(it.get("unit_price", 0)),
                    disc_str,
                    format_brl(net_sub),
                    "🗑️",
                ),
            )

        if self.cart:
            if selected_idx is None or selected_idx >= len(self.cart):
                selected_idx = len(self.cart) - 1
            sel_iid = str(max(0, selected_idx))
            if self.tree_cart.exists(sel_iid):
                self.tree_cart.selection_set(sel_iid)
                self.tree_cart.focus(sel_iid)
                self.tree_cart.see(sel_iid)

        subtotal, disc, total, change = self.compute_totals()
        self.lbl_subtotal.configure(text=f"Subtotal: {format_brl(subtotal)}")
        self.lbl_discount_applied.configure(text=f"Desconto Aplicado: - {format_brl(disc)}")
        self.lbl_total_big.configure(text=format_brl(total))
        self.lbl_change.configure(text=f"Troco: {format_brl(change)}")

        if hasattr(self, "lbl_installment_preview"):
            inst_n = max(1, int(self.var_installments.get() or 1))
            per_inst = round(total / inst_n, 2) if inst_n > 0 else total
            pay_m = self.var_payment_method.get()
            self.lbl_installment_preview.configure(
                text=f"Pré-selecionado: {pay_m} ({inst_n}x de {format_brl(per_inst)})"
            )

        # Atualiza dinamicamente o Cupom em Tempo Real na coluna esquerda
        self.update_live_receipt_preview()

    def finalize_sale(self) -> None:
        """
        Acionado ao pressionar F12 ou clicar em '✅ FINALIZAR VENDA / PAGAMENTO (F12)'.
        - Se a Caixa de Pagamento (modal) já estiver aberta, confirma e executa a venda imediatamente.
        - Caso contrário, valida licença, carrinho, cliente obrigatório (CPF/CNPJ) e estoque,
          e abre a Caixa de Pagamento para escolher a forma de pagamento e finalizar.
        """
        if self.checkout_modal is not None:
            try:
                if self.checkout_modal.winfo_exists():
                    self._confirm_and_execute_sale()
                    return
            except Exception:
                self.checkout_modal = None

        # Sincroniza em tempo real com o servidor (se online) para detectar revogação/expiração imediata no Master
        if self.cfg.get("access_token") and self.cfg.get("company_id"):
            try:
                self.api.fetch_desktop_license(timeout=3.5)
                self.var_license_key.set(str(self.cfg.get("license_key") or ""))
            except Exception:
                pass

        # Trava de segurança de validade da Licença Master
        self.refresh_license_ui()
        if not self.license_status.get("is_valid"):
            messagebox.showerror(
                "Licença do PDV Expirada ou Bloqueada pelo Master",
                f"O Ponto de Venda está bloqueado:\n\n{self.license_status.get('status_label')}\n\n"
                "Solicite a renovação da data de validade no Painel Master e clique em 'Buscar / Atualizar Chave Liberada no Painel Master'.",
            )
            self.notebook.select(self.tab_config)
            return

        if not self.cart:
            messagebox.showwarning("Carrinho Vazio", "Adicione pelo menos 1 produto ao carrinho antes de finalizar a venda.")
            return

        # 1. Validação Obrigatória de Cliente (CPF, CNPJ ou Consumidor Padrão 99999999999)
        raw_doc = self.var_customer_doc.get().strip()
        if not raw_doc:
            raw_doc = DEFAULT_CONSUMER_DOC
            self.var_customer_doc.set(DEFAULT_CONSUMER_DOC)
        is_valid_doc, clean_doc_digits, _, doc_msg = validate_cpf_or_cnpj(raw_doc)
        self._update_customer_doc_status_ui()
        if not is_valid_doc:
            messagebox.showerror(
                "CPF ou CNPJ Inválido (Cliente Obrigatório)",
                f"Não é possível finalizar a venda:\n\n"
                f"• {doc_msg}\n\n"
                f"Informe um CPF válido (11 dígitos), um CNPJ válido (14 dígitos) "
                f"ou clique em '⚡ Consumidor (99999999999)'.",
            )
            self.entry_customer_doc.focus_set()
            return

        cust_name = self.var_customer_name.get().strip()
        if not cust_name:
            cust_name = DEFAULT_CONSUMER_NAME
            self.var_customer_name.set(cust_name)

        # 2. Caso o operador tenha digitado um valor no campo de desconto e ainda não tenha clicado em Aplicar:
        existing_disc_sum = round(sum(float(i.get("discount") or 0.0) for i in self.cart), 2)
        if self.discount_value > 0 and existing_disc_sum == 0.0:
            self.apply_discount_by_scope(self.var_discount_scope.get() or "SALE")

        # 3. Validação de Estoque da Sessão (se ativa)
        if bool(self.cfg.get("validate_stock", False)):
            for it in self.cart:
                stk_q = int(it.get("stock_quantity") if it.get("stock_quantity") is not None else 0)
                if int(it["quantity"]) > stk_q:
                    messagebox.showwarning(
                        "Estoque Insuficiente na Venda",
                        f"O produto '{it.get('name')}' possui saldo disponível de {stk_q} un., "
                        f"mas está com {it['quantity']} un. no carrinho.\n\n"
                        "Ajuste a quantidade ou desative a opção '🛡️ Validar Estoque'.",
                    )
                    return

        # 4. Abre a Caixa de Pagamento e Fechamento da Venda (F12)
        self._pending_checkout_customer = (cust_name, clean_doc_digits)
        self.open_checkout_payment_modal(cust_name, clean_doc_digits)

    def _refresh_checkout_modal_ui(self) -> None:
        """
        Atualiza em tempo real os botões de pagamento, parcelas, valor recebido e troco
        dentro da Caixa de Pagamento (quando aberta), bem como o Cupom à esquerda.
        """
        if self.checkout_modal is None:
            return
        try:
            if not self.checkout_modal.winfo_exists():
                self.checkout_modal = None
                return
        except Exception:
            self.checkout_modal = None
            return

        subtotal, disc, total, change = self.compute_totals()
        cur_method = self.var_payment_method.get()
        inst_n = max(1, int(self.var_installments.get() or 1))
        per_inst = round(total / inst_n, 2) if inst_n > 0 else total

        if hasattr(self, "_modal_pay_buttons"):
            for m_code, btn in self._modal_pay_buttons.items():
                if m_code == cur_method:
                    btn.configure(bg="#2563eb", fg="#ffffff", relief="sunken")
                else:
                    btn.configure(bg="#f1f5f9", fg="#0f172a", relief="raised")

        if hasattr(self, "_modal_lbl_installment_summary"):
            self._modal_lbl_installment_summary.configure(
                text=f"{cur_method}: {inst_n}x de {format_brl(per_inst)}"
            )

        if hasattr(self, "_modal_lbl_change"):
            self._modal_lbl_change.configure(
                text=f"Troco: {format_brl(change)}",
                fg="#16a34a" if change > 0 else "#475569",
            )

        self.update_live_receipt_preview()

    def open_checkout_payment_modal(self, cust_name: str, clean_doc_digits: str) -> None:
        """
        Abre a Caixa de Pagamento modal (F12) para escolher a forma de pagamento,
        parcelas e troco, e confirmar a venda (enviando direto para a impressora se ativa).
        """
        if self.checkout_modal is not None:
            try:
                self.checkout_modal.destroy()
            except Exception:
                pass
            self.checkout_modal = None

        modal = tk.Toplevel(self.root)
        self.checkout_modal = modal
        modal.title("💳 Caixa de Pagamento e Fechamento da Venda (F12)")
        modal.configure(bg="#0f172a")
        modal.resizable(False, False)
        modal.transient(self.root)
        modal.grab_set()

        w, h = 620, 560
        sw = modal.winfo_screenwidth()
        sh = modal.winfo_screenheight()
        x = max(20, int((sw - w) / 2))
        y = max(20, int((sh - h) / 2))
        modal.geometry(f"{w}x{h}+{x}+{y}")

        subtotal, disc, total, _ = self.compute_totals()

        # Cabeçalho escuro do modal
        header = tk.Frame(modal, bg="#0f172a", padx=18, pady=12)
        header.pack(fill="x")
        tk.Label(
            header,
            text="💳 ESCOLHA A FORMA DE PAGAMENTO PARA FINALIZAR",
            font=("Segoe UI", 13, "bold"),
            bg="#0f172a",
            fg="#ffffff",
        ).pack(anchor="w")
        tk.Label(
            header,
            text=f"👤 Cliente: {cust_name} ({format_cpf_cnpj(clean_doc_digits)})   |   Itens: {sum(int(i.get('quantity') or 1) for i in self.cart)}",
            font=("Segoe UI", 9, "bold"),
            bg="#0f172a",
            fg="#38bdf8",
        ).pack(anchor="w", pady=(2, 0))

        # Corpo claro
        body = tk.Frame(modal, bg="#ffffff", padx=18, pady=14)
        body.pack(fill="both", expand=True, padx=12, pady=(0, 12))

        # Resumo de valores no topo
        tot_box = tk.Frame(body, bg="#f0fdf4", padx=14, pady=10, highlightthickness=1, highlightbackground="#bbf7d0")
        tot_box.pack(fill="x", pady=(0, 12))
        top_tot_row = tk.Frame(tot_box, bg="#f0fdf4")
        top_tot_row.pack(fill="x")
        tk.Label(
            top_tot_row,
            text=f"Subtotal: {format_brl(subtotal)}   |   Desconto: - {format_brl(disc)}",
            font=("Segoe UI", 9, "bold"),
            bg="#f0fdf4",
            fg="#166534",
        ).pack(side="left")
        tk.Label(
            top_tot_row,
            text="TOTAL A PAGAR",
            font=("Segoe UI", 9, "bold"),
            bg="#f0fdf4",
            fg="#15803d",
        ).pack(side="right")

        bot_tot_row = tk.Frame(tot_box, bg="#f0fdf4")
        bot_tot_row.pack(fill="x", pady=(2, 0))
        self._modal_lbl_installment_summary = tk.Label(
            bot_tot_row,
            text="",
            font=("Segoe UI", 10, "bold"),
            bg="#f0fdf4",
            fg="#2563eb",
        )
        self._modal_lbl_installment_summary.pack(side="left")
        tk.Label(
            bot_tot_row,
            text=format_brl(total),
            font=("Segoe UI", 22, "bold"),
            bg="#f0fdf4",
            fg="#15803d",
        ).pack(side="right")

        # 1. Seleção de Forma de Pagamento (Botões grandes com atalhos)
        tk.Label(
            body,
            text="1. Forma de Pagamento (Atalhos: F7 / F8 / F9 / F10 ou Alt+1..4):",
            font=("Segoe UI", 9, "bold"),
            bg="#ffffff",
            fg="#334155",
        ).pack(anchor="w", pady=(0, 6))

        pay_grid = tk.Frame(body, bg="#ffffff")
        pay_grid.pack(fill="x", pady=(0, 12))
        pay_grid.columnconfigure(0, weight=1)
        pay_grid.columnconfigure(1, weight=1)

        methods = [
            ("💵 1. Dinheiro (F7)", "DINHEIRO", 0, 0),
            ("⚡ 2. PIX (F8)", "PIX", 0, 1),
            ("💳 3. Cartão Débito (F9)", "DEBITO", 1, 0),
            ("💳 4. Cartão Crédito (F10)", "CREDITO", 1, 1),
        ]
        self._modal_pay_buttons: Dict[str, tk.Button] = {}
        for label, val, r_idx, c_idx in methods:
            btn = tk.Button(
                pay_grid,
                text=label,
                command=lambda m=val: self.select_payment_shortcut(m),
                font=("Segoe UI", 10, "bold"),
                padx=10,
                pady=8,
                cursor="hand2",
                bd=1,
            )
            btn.grid(row=r_idx, column=c_idx, sticky="ew", padx=4, pady=4)
            self._modal_pay_buttons[val] = btn

        # 2. Parcelamento (1x a 12x)
        inst_box = tk.Frame(body, bg="#f8fafc", padx=10, pady=8, highlightthickness=1, highlightbackground="#e2e8f0")
        inst_box.pack(fill="x", pady=(0, 10))

        inst_row1 = tk.Frame(inst_box, bg="#f8fafc")
        inst_row1.pack(fill="x")
        tk.Label(
            inst_row1,
            text="2. Parcelas (F11 alterna | Ctrl+1..9):",
            font=("Segoe UI", 9, "bold"),
            bg="#f8fafc",
            fg="#334155",
        ).pack(side="left")

        tk.Button(
            inst_row1,
            text="➖",
            command=lambda: self.cycle_installments_shortcut(-1),
            bg="#e2e8f0",
            fg="#0f172a",
            font=("Segoe UI", 8, "bold"),
            relief="flat",
            padx=6,
            cursor="hand2",
        ).pack(side="left", padx=(8, 2))

        self.combo_installments = ttk.Combobox(
            inst_row1,
            textvariable=self.var_installments,
            values=[str(i) for i in range(1, 13)],
            width=4,
            state="readonly",
            font=("Segoe UI", 9, "bold"),
        )
        self.combo_installments.pack(side="left", padx=2)
        self.combo_installments.bind("<<ComboboxSelected>>", lambda e: self._on_installments_combo_change())

        tk.Button(
            inst_row1,
            text="➕",
            command=lambda: self.cycle_installments_shortcut(1),
            bg="#e2e8f0",
            fg="#0f172a",
            font=("Segoe UI", 8, "bold"),
            relief="flat",
            padx=6,
            cursor="hand2",
        ).pack(side="left", padx=(2, 8))

        for q_n in (1, 2, 3, 4, 6, 10, 12):
            tk.Button(
                inst_row1,
                text=f"{q_n}x",
                command=lambda n=q_n: self.set_installments_shortcut(n),
                bg="#dbeafe" if q_n == 1 else "#e2e8f0",
                fg="#1e40af" if q_n == 1 else "#334155",
                font=("Segoe UI", 8, "bold"),
                relief="flat",
                padx=5,
                pady=1,
                cursor="hand2",
            ).pack(side="left", padx=1)

        # 3. Valor Recebido em Dinheiro & Cálculo de Troco
        cash_box = tk.Frame(body, bg="#f8fafc", padx=10, pady=8, highlightthickness=1, highlightbackground="#e2e8f0")
        cash_box.pack(fill="x", pady=(0, 10))
        tk.Label(
            cash_box,
            text="3. Valor Recebido em Dinheiro (para cálculo de Troco):",
            font=("Segoe UI", 9, "bold"),
            bg="#f8fafc",
            fg="#334155",
        ).pack(side="left")

        self.entry_cash_received = tk.Entry(
            cash_box,
            textvariable=self.var_cash_received,
            font=("Segoe UI", 11, "bold"),
            width=13,
            bd=1,
            relief="solid",
            justify="right",
            bg="#ffffff",
            fg="#0f172a",
        )
        self.entry_cash_received.pack(side="left", padx=10, ipady=3)
        self.entry_cash_received.bind("<KeyRelease>", self._on_cash_received_key)

        self._modal_lbl_change = tk.Label(
            cash_box,
            text="Troco: R$ 0,00",
            font=("Segoe UI", 11, "bold"),
            bg="#f8fafc",
            fg="#475569",
        )
        self._modal_lbl_change.pack(side="right")

        # 4. Status da Impressora no fechamento
        prt_name = (self.var_printer_name.get() or "").strip() or NO_PRINTER_OPTION
        prt_txt = (
            f"🖨️ Ao confirmar, o cupom será enviado direto para: {prt_name}"
            if self.is_printer_enabled()
            else "🚫 Impressão desativada ('NÃO IMPRIMIR') — finalizará sem imprimir nada."
        )
        tk.Label(
            body,
            text=prt_txt,
            font=("Segoe UI", 8, "bold"),
            bg="#ffffff",
            fg="#15803d" if self.is_printer_enabled() else "#64748b",
        ).pack(anchor="w", pady=(0, 10))

        # 5. Botões de Ação (Cancelar ESC / Confirmar e Finalizar ENTER ou F12)
        btn_row = tk.Frame(body, bg="#ffffff")
        btn_row.pack(fill="x", side="bottom")

        tk.Button(
            btn_row,
            text="✖ Voltar ao Carrinho (ESC)",
            command=self._close_checkout_modal,
            bg="#e2e8f0",
            fg="#334155",
            font=("Segoe UI", 10, "bold"),
            relief="flat",
            padx=14,
            pady=10,
            cursor="hand2",
        ).pack(side="left")

        btn_confirm = tk.Button(
            btn_row,
            text="✅ CONFIRMAR PAGAMENTO E CONCLUIR VENDA (ENTER / F12)",
            command=self._confirm_and_execute_sale,
            bg="#16a34a",
            fg="#ffffff",
            activebackground="#15803d",
            activeforeground="#ffffff",
            font=("Segoe UI", 11, "bold"),
            relief="flat",
            padx=18,
            pady=10,
            cursor="hand2",
        )
        btn_confirm.pack(side="right", fill="x", expand=True, padx=(10, 0))

        # Atalhos dentro do modal
        modal.bind("<Escape>", lambda e: self._close_checkout_modal())
        modal.bind("<Return>", lambda e: self._confirm_and_execute_sale())
        modal.bind("<F12>", lambda e: self._confirm_and_execute_sale())
        modal.bind("<F7>", lambda e: self.select_payment_shortcut("DINHEIRO"))
        modal.bind("<F8>", lambda e: self.select_payment_shortcut("PIX"))
        modal.bind("<F9>", lambda e: self.select_payment_shortcut("DEBITO"))
        modal.bind("<F10>", lambda e: self.select_payment_shortcut("CREDITO"))
        modal.bind("<F11>", lambda e: self.cycle_installments_shortcut(1))
        modal.bind("<Alt-Key-1>", lambda e: self.select_payment_shortcut("DINHEIRO"))
        modal.bind("<Alt-Key-2>", lambda e: self.select_payment_shortcut("PIX"))
        modal.bind("<Alt-Key-3>", lambda e: self.select_payment_shortcut("DEBITO"))
        modal.bind("<Alt-Key-4>", lambda e: self.select_payment_shortcut("CREDITO"))

        self._refresh_checkout_modal_ui()
        if self.var_payment_method.get() == "DINHEIRO":
            self.entry_cash_received.focus_set()
            self.entry_cash_received.icursor(tk.END)
        else:
            btn_confirm.focus_set()

    def _close_checkout_modal(self) -> None:
        if self.checkout_modal is not None:
            try:
                self.checkout_modal.grab_release()
                self.checkout_modal.destroy()
            except Exception:
                pass
            self.checkout_modal = None
        self.entry_search.focus_set()

    def _confirm_and_execute_sale(self) -> None:
        """
        Executa a gravação definitiva da venda após confirmação na Caixa de Pagamento (F12 / Enter),
        atualiza o cupom na tela esquerda e envia automaticamente direto para a impressora configurada
        (ou não imprime nada se estiver configurado como 'NÃO IMPRIMIR').
        """
        if not self.cart:
            self._close_checkout_modal()
            return

        cust_name, clean_doc_digits = getattr(
            self, "_pending_checkout_customer", (DEFAULT_CONSUMER_NAME, DEFAULT_CONSUMER_DOC)
        )
        self._close_checkout_modal()

        subtotal, disc, total, change = self.compute_totals()
        pay_method = self.var_payment_method.get()
        installments = int(self.var_installments.get() or 1)
        cash_rec = self.cash_received_value if (pay_method == "DINHEIRO" and self.cash_received_value > 0) else None

        sale = self.storage.record_sale(
            cfg=self.cfg,
            items=self.cart,
            payment_method=pay_method,
            installments=installments,
            discount_amount=disc,
            cash_received=cash_rec,
            change_amount=change if cash_rec else None,
            payment_splits=None,
            customer_name=cust_name,
            customer_document=clean_doc_digits,
        )
        self.last_completed_sale = sale

        # Salva arquivo HTML de backup na pasta receipts/ sem abrir navegador
        try:
            generate_receipt_html(sale, self.cfg)
        except Exception:
            pass

        # Envio direto e silencioso para a impressora instalada (se ativa)
        printer_target = (self.var_printer_name.get() or "").strip() or NO_PRINTER_OPTION
        if self.is_printer_enabled():
            receipt_txt = format_thermal_receipt_text(sale, self.cfg, is_preview=False)
            threading.Thread(
                target=self._silent_print_worker,
                args=(receipt_txt, printer_target, str(sale.get("sale_number") or "PDV")),
                daemon=True,
            ).start()

        # Limpa o carrinho para a próxima venda e exibe o cupom finalizado na bobina à esquerda
        self.clear_cart()
        self.update_live_receipt_preview(finalized_sale=sale)
        self.refresh_sales_and_sync_ui()

        prt_info = f" | 🖨️ Enviado para '{printer_target}'" if self.is_printer_enabled() else " | 🚫 Sem impressão"
        if self.cfg.get("access_token") and self.cfg.get("active_session_id"):
            threading.Thread(target=self._sync_worker, args=(False,), daemon=True).start()
            self.lbl_search_feedback.configure(
                text=f"✅ Venda {sale['sale_number']} ({format_brl(total)}) concluída{prt_info}! Sincronizando com Sessão #{self.cfg.get('active_session_id')}...",
                fg="#16a34a",
            )
        else:
            self.lbl_search_feedback.configure(
                text=f"💾 Venda {sale['sale_number']} ({format_brl(total)}) salva OFFLINE{prt_info}!",
                fg="#d97706",
            )

    def _silent_print_worker(self, receipt_text: str, printer_name: str, sale_number: str) -> None:
        ok, msg = send_receipt_to_printer(receipt_text, printer_name, sale_number=sale_number)
        if not ok:
            self.ui_queue.put(("PRINT_ERROR", msg))

    # ──────────────────────────────────────────────────────────────────────────
    # Sincronização Automática/Manual e Geração de Relatórios
    # ──────────────────────────────────────────────────────────────────────────
    def refresh_sales_and_sync_ui(self) -> None:
        all_sales = list(reversed(self.storage.sales))
        pending = [s for s in all_sales if not s.get("synced")]
        synced = [s for s in all_sales if s.get("synced")]
        total_rev = sum(float(s.get("total_amount") or 0.0) for s in all_sales)

        self.lbl_kpi_total_sales.configure(text=str(len(all_sales)))
        self.lbl_kpi_synced.configure(text=str(len(synced)))
        self.lbl_kpi_pending.configure(text=str(len(pending)))
        self.lbl_kpi_revenue.configure(text=format_brl(total_rev))

        if pending:
            self.lbl_sync_badge.configure(
                text=f"🟠 {len(pending)} PENDENTE(S)",
                bg="#d97706",
            )
        else:
            self.lbl_sync_badge.configure(
                text=f"✅ 100% SINCRONIZADO ({len(synced)})",
                bg="#059669",
            )

        for row in self.tree_sales.get_children():
            self.tree_sales.delete(row)

        for s in all_sales:
            st_label = "✅ SINCRONIZADO NA SESSÃO" if s.get("synced") else "⏳ PENDENTE OFFLINE"
            n_items = sum(int(i.get("quantity") or 1) for i in (s.get("items") or []))
            self.tree_sales.insert(
                "",
                "end",
                iid=s.get("client_sale_uuid"),
                values=(
                    s.get("sale_number"),
                    (s.get("created_at") or "")[:19].replace("T", " "),
                    f"#{s.get('session_id')}" if s.get("session_id") else "OFFLINE",
                    s.get("customer_name") or "Consumidor Final",
                    f"{s.get('payment_method')} ({s.get('installments', 1)}x)",
                    n_items,
                    format_brl(s.get("total_amount", 0)),
                    st_label,
                ),
            )

    def trigger_manual_sync(self) -> None:
        if not self.cfg.get("access_token"):
            messagebox.showwarning(
                "Credenciais Necessárias",
                "Configure o login do Seller na aba '4. Credenciais Seller' antes de sincronizar com o servidor.",
            )
            self.notebook.select(self.tab_config)
            return
        if not self.cfg.get("active_session_id"):
            messagebox.showwarning(
                "Sessão de Caixa Necessária",
                "Selecione ou abra uma Sessão de Caixa na aba '3. Sessão & Catálogo' para vincular e sincronizar as vendas offline.",
            )
            self.notebook.select(self.tab_session)
            return

        self.lbl_sync_status_msg.configure(text="⏳ Sincronizando vendas pendentes com o servidor...", fg="#d97706")
        threading.Thread(target=self._sync_worker, args=(True,), daemon=True).start()

    def _sync_worker(self, interactive: bool = False) -> None:
        if not self._sync_lock.acquire(blocking=False):
            return
        try:
            session_id = self.cfg.get("active_session_id")
            if not session_id or not self.cfg.get("access_token"):
                return
            pending = self.storage.get_pending_sales(session_id=int(session_id))
            if not pending:
                if interactive:
                    self.ui_queue.put(("SYNC_DONE", (True, "Todas as vendas locais já estão sincronizadas com a sessão ativa!")))
                return

            ok, msg, _ = self.api.sync_pending_sales(int(session_id), pending)
            if ok:
                uuids = [s["client_sale_uuid"] for s in pending]
                self.storage.mark_sales_synced(uuids, int(session_id))
            self.ui_queue.put(("SYNC_DONE", (ok, msg if interactive else "")))
        finally:
            self._sync_lock.release()

    def fetch_sales_from_server_async(self) -> None:
        sid = self.cfg.get("active_session_id")
        if not sid:
            messagebox.showinfo("Sessão", "Selecione uma Sessão de Caixa ativa na aba 3 primeiro.")
            return
        threading.Thread(target=self._fetch_server_sales_worker, args=(int(sid),), daemon=True).start()

    def _fetch_server_sales_worker(self, session_id: int) -> None:
        ok, data = self.api.fetch_server_sales(session_id)
        if ok and isinstance(data.get("items"), list):
            self.storage.merge_server_sales(data["items"], session_id)
            self.ui_queue.put(("SERVER_SALES_MERGED", len(data["items"])))
        else:
            self.ui_queue.put(("SERVER_SALES_ERROR", "Não foi possível consultar vendas do servidor (verifique a conexão)."))

    def export_local_csv_report(self) -> None:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        sid = self.cfg.get("active_session_id") or "OFFLINE"
        default_name = f"Relatorio_Vendas_Horus_PDV_Sessao_{sid}_{ts}.csv"
        target = filedialog.asksaveasfilename(
            title="Salvar Relatório Analítico CSV/Excel (Padrão Migração Horus)",
            initialdir=str(REPORTS_DIR),
            initialfile=default_name,
            defaultextension=".csv",
            filetypes=[("Planilha CSV (Excel / Horus)", "*.csv"), ("Todos os arquivos", "*.*")],
        )
        if not target:
            return
        rows = self.storage.export_csv_for_horus(Path(target))
        messagebox.showinfo(
            "Relatório Exportado com Sucesso",
            f"Foram exportadas {rows} linhas de itens/vendas para:\n\n{target}\n\n"
            "O arquivo possui codificação UTF-8 com BOM (abre diretamente no Microsoft Excel) "
            "e contém os códigos SKU/Horus, ISBN, Sessão e UUID prontos para migração ao Horus ERP.",
        )

    def open_html_closing_report(self) -> None:
        path = generate_session_report_html(self.storage.sales, self.cfg)
        webbrowser.open(path.as_uri())

    def download_server_report(self, fmt: str) -> None:
        sid = self.cfg.get("active_session_id")
        if not sid:
            messagebox.showwarning("Sessão", "Selecione uma Sessão de Caixa ativa para baixar o relatório oficial do servidor.")
            return
        ext = "xlsx" if fmt == "excel" else "pdf"
        ts = datetime.now().strftime("%Y%m%d_%H%M")
        target = filedialog.asksaveasfilename(
            title=f"Salvar Relatório Oficial ({ext.upper()})",
            initialdir=str(REPORTS_DIR),
            initialfile=f"Relatorio_Oficial_PDV_Sessao_{sid}_{ts}.{ext}",
            defaultextension=f".{ext}",
        )
        if not target:
            return
        threading.Thread(
            target=self._download_report_worker,
            args=(int(sid), fmt, Path(target)),
            daemon=True,
        ).start()

    def _download_report_worker(self, session_id: int, fmt: str, target_path: Path) -> None:
        ok, msg = self.api.download_official_report(session_id, fmt, target_path)
        self.ui_queue.put(("REPORT_DOWNLOADED", (ok, msg, target_path)))

    def reprint_selected_sale_receipt(self) -> None:
        sel = self.tree_sales.selection()
        if not sel:
            return
        c_uuid = sel[0]
        for s in self.storage.sales:
            if s.get("client_sale_uuid") == c_uuid:
                self.last_completed_sale = s
                self.update_live_receipt_preview(finalized_sale=s)
                if self.is_printer_enabled():
                    receipt_txt = format_thermal_receipt_text(s, self.cfg, is_preview=False)
                    ok, msg = send_receipt_to_printer(
                        receipt_txt,
                        self.var_printer_name.get(),
                        sale_number=str(s.get("sale_number") or "REIMPRESSAO"),
                    )
                    if ok:
                        messagebox.showinfo("Cupom Reimpresso", msg)
                    else:
                        messagebox.showerror("Erro ao Reimprimir Cupom", msg)
                else:
                    p = generate_receipt_html(s, self.cfg)
                    if messagebox.askyesno(
                        "Impressora Desativada ('NÃO IMPRIMIR')",
                        f"O cupom da venda {s.get('sale_number')} foi carregado no visor esquerdo do PDV.\n\n"
                        "Como a impressora está configurada como '🚫 NÃO IMPRIMIR', nada foi enviado para impressão.\n"
                        "Deseja visualizar o arquivo de cupom salvo no computador?",
                    ):
                        webbrowser.open(p.as_uri())
                break

    # ──────────────────────────────────────────────────────────────────────────
    # Gestão de Sessão de Caixa e Catálogo Offline (Aba 3 e Aba 4)
    # ──────────────────────────────────────────────────────────────────────────
    def refresh_open_sessions_async(self) -> None:
        threading.Thread(target=self._list_sessions_worker, daemon=True).start()

    def _list_sessions_worker(self) -> None:
        ok, sessions = self.api.list_sessions(status_filter="OPEN")
        self.ui_queue.put(("SESSIONS_LIST", (ok, sessions)))

    def select_highlighted_session(self) -> None:
        sel = self.tree_sessions.selection()
        if not sel:
            messagebox.showinfo("Seleção", "Clique em uma sessão na lista acima para selecioná-la.")
            return
        sid = int(sel[0])
        for s in self.open_sessions_cache:
            if int(s.get("id", 0)) == sid:
                self.cfg["active_session_id"] = sid
                self.cfg["active_session_title"] = s.get("title") or f"Sessão #{sid}"
                self.cfg["active_branch_id"] = s.get("branch_id")
                val_stk = bool(s.get("validate_stock", False))
                self.cfg["validate_stock"] = val_stk
                self.var_validate_stock.set(val_stk)
                save_config(self.cfg)
                self.lbl_session_badge.configure(text=self._format_session_badge_text())
                messagebox.showinfo(
                    "Sessão Vinculada",
                    f"O PDV agora está vinculado à Sessão #{sid} ({self.cfg['active_session_title']}).\n"
                    f"Validação de Estoque: {'ATIVADA 🛡️' if val_stk else 'VENDA LIVRE ⚡'}\n\n"
                    "Todas as vendas feitas offline ou online serão sincronizadas para esta sessão!",
                )
                self.trigger_manual_sync()
                return

    def create_new_session_async(self) -> None:
        title = self.var_new_session_title.get().strip()
        if not title:
            messagebox.showwarning("Título", "Informe um nome para a Sessão de Caixa.")
            return
        source = self.var_new_session_source.get()
        init_cash = parse_atm_digits_to_float(self.initial_cash_digits)
        val_stk = bool(self.var_new_session_validate_stock.get())
        threading.Thread(
            target=self._create_session_worker,
            args=(title, source, init_cash, val_stk),
            daemon=True,
        ).start()

    def _create_session_worker(self, title: str, source: str, init_cash: float, validate_stock: bool = False) -> None:
        ok, msg, body = self.api.create_session(
            title=title,
            catalog_source=source,
            initial_cash_amount=init_cash,
            validate_stock=validate_stock,
        )
        self.ui_queue.put(("SESSION_CREATED", (ok, msg, body)))

    def close_active_session_clicked(self) -> None:
        sid = self.cfg.get("active_session_id")
        if not sid:
            messagebox.showinfo("Sessão", "Nenhuma Sessão de Caixa ativa está selecionada no momento.")
            return
        pending = self.storage.get_pending_sales(session_id=int(sid))
        if pending:
            if not messagebox.askyesno(
                "Vendas Pendentes Offline",
                f"Existem {len(pending)} venda(s) offline pendente(s). Deseja sincronizá-las agora antes de encerrar a Sessão #{sid}?",
            ):
                return
            self._sync_worker(interactive=False)

        if not messagebox.askyesno(
            "Encerrar Sessão de Caixa",
            f"Confirma o encerramento da Sessão #{sid} ({self.cfg.get('active_session_title')}) no servidor?",
        ):
            return
        threading.Thread(target=self._close_session_worker, args=(int(sid),), daemon=True).start()

    def _close_session_worker(self, session_id: int) -> None:
        ok_sum, summary = self.api.get_close_summary(session_id)
        expected_cash = float(summary.get("expected_cash_amount") or 0.0) if ok_sum else 0.0
        ok, msg = self.api.close_session(session_id, closing_cash_amount=expected_cash, notes="Encerrado pelo Horus PDV Desktop")
        if ok:
            self.cfg["active_session_id"] = None
            self.cfg["active_session_title"] = ""
            save_config(self.cfg)
        self.ui_queue.put(("SESSION_CLOSED", (ok, msg)))

    def download_catalog_async(self) -> None:
        sid = self.cfg.get("active_session_id")
        if not sid:
            messagebox.showwarning("Sessão", "Selecione ou abra uma Sessão de Caixa primeiro.")
            return
        self.lbl_catalog_status.configure(text="⏳ Baixando catálogo da sessão para uso offline...", fg="#d97706")
        threading.Thread(target=self._download_catalog_worker, args=(int(sid),), daemon=True).start()

    def _download_catalog_worker(self, session_id: int) -> None:
        ok, msg, items = self.api.download_session_catalog(session_id)
        if ok and items:
            total = self.storage.save_catalog(items, merge=True)
            self.ui_queue.put(("CATALOG_UPDATED", (True, f"{msg} Total em cache offline: {total} produtos.")))
        else:
            self.ui_queue.put(("CATALOG_UPDATED", (False, msg)))

    def import_catalog_from_csv_dialog(self) -> None:
        path = filedialog.askopenfilename(
            title="Importar Catálogo CSV Local",
            filetypes=[("Planilha CSV", "*.csv"), ("Todos os arquivos", "*.*")],
        )
        if not path:
            return
        try:
            items = []
            with open(path, mode="r", encoding="utf-8-sig", errors="replace") as f:
                sample = f.read(2048)
                f.seek(0)
                delim = ";" if ";" in sample else ","
                reader = csv.DictReader(f, delimiter=delim)
                for row in reader:
                    items.append({
                        "isbn": row.get("ISBN") or row.get("isbn") or row.get("CODIGO_BARRAS") or row.get("EAN") or "",
                        "sku": row.get("SKU") or row.get("COD_ITEM") or row.get("sku") or "",
                        "name": row.get("TITULO") or row.get("NOME") or row.get("NOM_ITEM") or row.get("name") or "",
                        "brand": row.get("EDITORA") or row.get("MARCA") or row.get("brand") or "",
                        "price": str(row.get("PRECO") or row.get("VLR_CAPA") or row.get("price") or "0").replace(",", "."),
                        "stock_quantity": row.get("SALDO") or row.get("ESTOQUE") or row.get("stock") or 10,
                    })
            total = self.storage.save_catalog(items, merge=True)
            self.refresh_catalog_stats_ui()
            messagebox.showinfo("Catálogo Importado", f"{len(items)} itens processados! Cache offline agora possui {total} produtos.")
        except Exception as exc:
            messagebox.showerror("Erro ao Importar CSV", str(exc))

    def refresh_catalog_stats_ui(self) -> None:
        self.lbl_catalog_status.configure(
            text=f"Produtos em Cache Offline: {len(self.storage.products)} itens",
            fg="#2563eb",
        )
        st = self.storage.sync_state
        last_c = self.storage.get_last_integrated_horus_code()
        min_c = st.get("min_cod_item_cached")
        max_c = st.get("max_cod_item_cached")
        stale = self.storage.get_stale_ranges(max_age_hours=24.0)
        self.lbl_catalog_watermark.configure(
            text=(
                f"Último COD_ITEM Integrado do Horus: {last_c}  |  "
                f"Faixa no Cache: {min_c or '---'} até {max_c or '---'}  |  "
                f"Faixas precisando recarregar (>24h): {len(stale)}"
            )
        )

        for r in self.tree_ranges.get_children():
            self.tree_ranges.delete(r)
        stale_set = {(int(x["cod_ini"]), int(x["cod_fim"])) for x in stale}
        for rng in (st.get("ranges_history") or []):
            c_i, c_f = int(rng.get("cod_ini", 0)), int(rng.get("cod_fim", 0))
            is_st = (c_i, c_f) in stale_set
            fresh_txt = "⚠️ RECARREGAR (>24h)" if is_st else "✅ ATUALIZADO"
            self.tree_ranges.insert(
                "",
                "end",
                iid=f"{c_i}_{c_f}",
                values=(
                    f"{c_i} até {c_f}",
                    rng.get("items_count", 0),
                    str(rng.get("synced_at") or "")[:16].replace("T", " "),
                    fresh_txt,
                ),
            )

        self.lbl_seller_info.configure(text=self._format_header_subtitle())
        self._populate_search_results(self.storage.products[:40])

    def authenticate_seller_clicked(self) -> None:
        self.cfg["api_base_url"] = self.var_api_url.get().strip().rstrip("/")
        email = self.var_email.get().strip()
        pwd = self.var_password.get()
        cid = self.var_company_id.get().strip()
        if not email or not pwd:
            messagebox.showwarning("Campos Obrigatórios", "Preencha o E-mail e a Senha do Seller.")
            return
        self.lbl_auth_status.configure(text="⏳ Autenticando Seller na API Cronuz B2B...", fg="#d97706")
        threading.Thread(target=self._auth_worker, args=(email, pwd, cid), daemon=True).start()

    def _auth_worker(self, email: str, pwd: str, cid: str) -> None:
        ok, msg, body = self.api.authenticate_seller(email, pwd, cid)
        self.ui_queue.put(("AUTH_RESULT", (ok, msg, body)))
        if ok:
            self._fetch_license_worker(interactive=False)

    def _run_initial_checks(self) -> None:
        threading.Thread(target=self._initial_check_worker, daemon=True).start()

    def _initial_check_worker(self) -> None:
        if not self.cfg.get("access_token"):
            self.ui_queue.put(("NET_STATUS", False))
            return
        ok, cfg_body = self.api.get_pos_config()
        self.ui_queue.put(("NET_STATUS", ok))
        if ok:
            # Atualiza automaticamente a chave de licença liberada pelo Master ao abrir o PDV
            self._fetch_license_worker(interactive=False)
            ok_s, sessions = self.api.list_sessions(status_filter="OPEN")
            if ok_s:
                self.ui_queue.put(("SESSIONS_LIST", (True, sessions)))
            if self.cfg.get("active_session_id"):
                self._sync_worker(interactive=False)
            # Se o sistema estiver online e com a opção ativa, identifica o último COD_ITEM
            # integrado e sincroniza automaticamente os últimos itens cadastrados no Horus
            if bool(self.cfg.get("auto_sync_new_horus_items", True)):
                self.ui_queue.put(("TRIGGER_STARTUP_DELTA_SYNC", None))

    def _license_heartbeat_tick(self) -> None:
        """
        Revalida silenciosamente a chave de licença no servidor a cada 15 segundos
        enquanto o PDV estiver aberto, garantindo bloqueio imediato se a validade
        for alterada/expirada no Painel Master.
        """
        if self.cfg.get("access_token") and self.cfg.get("company_id"):
            threading.Thread(target=self._fetch_license_worker, args=(False,), daemon=True).start()
        self.root.after(15000, self._license_heartbeat_tick)

    def _auto_sync_tick(self) -> None:
        if self.cfg.get("auto_sync_enabled", True) and self.cfg.get("access_token") and self.cfg.get("active_session_id"):
            threading.Thread(target=self._sync_worker, args=(False,), daemon=True).start()
        self.root.after(45000, self._auto_sync_tick)

    def _poll_ui_queue(self) -> None:
        try:
            while True:
                ev, payload = self.ui_queue.get_nowait()
                if ev == "NET_STATUS":
                    self.is_online = bool(payload)
                    if self.is_online:
                        self.lbl_net_badge.configure(text="🟢 ONLINE", bg="#16a34a")
                    else:
                        self.lbl_net_badge.configure(text="🟠 OFFLINE", bg="#d97706")

                elif ev == "LICENSE_FETCHED":
                    ok, msg, body, interactive = payload
                    self.var_license_key.set(str(self.cfg.get("license_key") or ""))
                    self.refresh_license_ui()
                    if interactive:
                        if ok:
                            messagebox.showinfo("Chave de Licença Sincronizada", msg)
                        else:
                            messagebox.showwarning("Licença Master", msg)

                elif ev == "TRIGGER_STARTUP_DELTA_SYNC":
                    if (
                        self.is_online
                        and bool(self.cfg.get("auto_sync_new_horus_items", True))
                        and self.license_status.get("is_valid")
                        and self.license_status.get("range_sync_enabled")
                    ):
                        last_c = self.storage.get_last_integrated_horus_code()
                        self.lbl_search_feedback.configure(
                            text=f"⚡ Auto-Sync Horus Online: buscando novos itens cadastrados após COD_ITEM {last_c}...",
                            fg="#2563eb",
                        )
                        self.sync_new_horus_items_from_last_code(interactive=False)

                elif ev == "RANGE_SYNC_PROGRESS":
                    done_n, total_n, status_txt = payload
                    self.progress_range["maximum"] = max(1, total_n)
                    self.progress_range["value"] = done_n
                    self.lbl_range_progress.configure(text=status_txt, fg="#2563eb")
                    self.refresh_catalog_stats_ui()

                elif ev == "RANGE_SYNC_FINISHED":
                    ok, msg = payload
                    self.range_sync_running = False
                    self.btn_start_range_sync.configure(state="normal")
                    if hasattr(self, "btn_sync_new_horus"):
                        self.btn_sync_new_horus.configure(state="normal")
                    self.btn_stop_range_sync.configure(state="disabled")
                    self.lbl_range_progress.configure(text=msg, fg="#16a34a" if ok else "#dc2626")
                    last_c = self.storage.get_last_integrated_horus_code()
                    if last_c > 0:
                        self.var_cod_ini.set(str(last_c + 1))
                        self.var_cod_fim.set(str(last_c + 5000))
                    self.refresh_catalog_stats_ui()
                    if ok:
                        messagebox.showinfo("Sincronização Sequencial Horus", msg)
                    else:
                        messagebox.showerror("Erro na Sincronização Horus", msg)

                elif ev == "DELTA_SYNC_FINISHED":
                    ok, msg, interactive, total_new, highest_code = payload
                    self.range_sync_running = False
                    self.btn_start_range_sync.configure(state="normal")
                    if hasattr(self, "btn_sync_new_horus"):
                        self.btn_sync_new_horus.configure(state="normal")
                    self.btn_stop_range_sync.configure(state="disabled")
                    self.progress_range["value"] = self.progress_range["maximum"] if ok else 0
                    self.lbl_range_progress.configure(text=msg, fg="#16a34a" if ok else "#dc2626")
                    if highest_code > 0:
                        self.var_cod_ini.set(str(highest_code + 1))
                        self.var_cod_fim.set(str(highest_code + 5000))
                    self.refresh_catalog_stats_ui()
                    if ok and total_new > 0:
                        self.lbl_search_feedback.configure(
                            text=f"⚡ {total_new} novo(s) item(ns) do Horus integrado(s) automaticamente! (Últ. COD_ITEM: {highest_code})",
                            fg="#16a34a",
                        )
                    elif ok:
                        self.lbl_search_feedback.configure(
                            text=f"✅ Catálogo Horus atualizado (Último COD_ITEM integrado: {highest_code} | {len(self.storage.products)} itens offline).",
                            fg="#059669",
                        )
                    if interactive:
                        if ok:
                            messagebox.showinfo("Novos Itens do Horus", msg)
                        else:
                            messagebox.showerror("Erro ao Buscar Novos Itens", msg)

                elif ev == "SEARCH_RESULTS":
                    term, items = payload
                    self.is_online = True
                    self.lbl_net_badge.configure(text="🟢 ONLINE", bg="#16a34a")
                    self.refresh_catalog_stats_ui()
                    self._populate_search_results(items)
                    if len(items) == 1 and term.isdigit() and len(term) >= 8:
                        self.add_product_to_cart(items[0])
                        self.var_search.set("")
                        self.lbl_search_feedback.configure(
                            text=f"✅ Bip Horus Online adicionado ao carrinho: {items[0].get('name')}",
                            fg="#16a34a",
                        )
                    else:
                        self.lbl_search_feedback.configure(
                            text=f"🌐 {len(items)} produto(s) retornado(s) do Horus ERP e salvos no Cache Offline.",
                            fg="#16a34a",
                        )

                elif ev == "SEARCH_EMPTY":
                    term = payload
                    self.lbl_search_feedback.configure(
                        text=f"⚠️ Nenhum produto encontrado para '{term}' (Local e Horus).",
                        fg="#dc2626",
                    )

                elif ev == "SYNC_DONE":
                    ok, msg = payload
                    self.refresh_sales_and_sync_ui()
                    if msg:
                        self.lbl_sync_status_msg.configure(
                            text=msg, fg="#16a34a" if ok else "#dc2626"
                        )
                        if ok:
                            messagebox.showinfo("Sincronização com Sessão PDV", msg)
                        else:
                            messagebox.showwarning("Aviso de Sincronização", msg)

                elif ev == "SERVER_SALES_MERGED":
                    count = payload
                    self.refresh_sales_and_sync_ui()
                    self.lbl_sync_status_msg.configure(
                        text=f"✅ Histórico atualizado com {count} venda(s) da sessão no servidor.",
                        fg="#16a34a",
                    )

                elif ev == "SERVER_SALES_ERROR":
                    messagebox.showwarning("Servidor", str(payload))

                elif ev == "PRINT_ERROR":
                    messagebox.showwarning("Aviso de Impressora do Cupom", str(payload))

                elif ev == "REPORT_DOWNLOADED":
                    ok, msg, path = payload
                    if ok:
                        messagebox.showinfo("Relatório Oficial Salvo", msg)
                        try:
                            webbrowser.open(path.parent.as_uri())
                        except Exception:
                            pass
                    else:
                        messagebox.showerror("Erro ao Baixar Relatório", msg)

                elif ev == "SESSIONS_LIST":
                    ok, sessions = payload
                    if ok:
                        self.open_sessions_cache = sessions
                        for r in self.tree_sessions.get_children():
                            self.tree_sessions.delete(r)
                        active_sid = self.cfg.get("active_session_id")
                        for s in sessions:
                            stk_txt = "🛡️ Valida" if s.get("validate_stock") else "⚡ Livre"
                            self.tree_sessions.insert(
                                "",
                                "end",
                                iid=str(s["id"]),
                                values=(
                                    s["id"],
                                    s.get("title") or "",
                                    s.get("catalog_source") or "GENERAL",
                                    stk_txt,
                                    s.get("total_sales_count", 0),
                                    format_brl(s.get("total_sales_amount", 0)),
                                    str(s.get("opened_at") or "")[:16].replace("T", " "),
                                ),
                            )
                            if active_sid and int(s["id"]) == int(active_sid):
                                val_stk = bool(s.get("validate_stock", False))
                                self.cfg["validate_stock"] = val_stk
                                self.var_validate_stock.set(val_stk)
                                self.lbl_session_badge.configure(text=self._format_session_badge_text())

                        if not self.cfg.get("active_session_id") and sessions:
                            first = sessions[0]
                            self.cfg["active_session_id"] = first["id"]
                            self.cfg["active_session_title"] = first.get("title") or f"Sessão #{first['id']}"
                            val_stk = bool(first.get("validate_stock", False))
                            self.cfg["validate_stock"] = val_stk
                            self.var_validate_stock.set(val_stk)
                            save_config(self.cfg)
                            self.lbl_session_badge.configure(text=self._format_session_badge_text())

                elif ev == "SESSION_CREATED":
                    ok, msg, body = payload
                    if ok:
                        self.cfg["active_session_id"] = body["id"]
                        self.cfg["active_session_title"] = body.get("title") or f"Sessão #{body['id']}"
                        val_stk = bool(body.get("validate_stock", False))
                        self.cfg["validate_stock"] = val_stk
                        self.var_validate_stock.set(val_stk)
                        save_config(self.cfg)
                        self.lbl_session_badge.configure(text=self._format_session_badge_text())
                        self.refresh_open_sessions_async()
                        messagebox.showinfo("Sessão Aberta", msg)
                    else:
                        messagebox.showerror("Erro ao Abrir Sessão", msg)

                elif ev == "SESSION_CLOSED":
                    ok, msg = payload
                    self.lbl_session_badge.configure(text=self._format_session_badge_text())
                    self.refresh_open_sessions_async()
                    if ok:
                        messagebox.showinfo("Sessão Encerrada", msg)
                    else:
                        messagebox.showerror("Erro ao Fechar Sessão", msg)

                elif ev == "CATALOG_UPDATED":
                    ok, msg = payload
                    self.refresh_catalog_stats_ui()
                    if ok:
                        messagebox.showinfo("Catálogo Offline Atualizado", msg)
                    else:
                        messagebox.showwarning("Catálogo Offline", msg)

                elif ev == "AUTH_RESULT":
                    ok, msg, body = payload
                    self.lbl_seller_info.configure(text=self._format_header_subtitle())
                    if ok:
                        self.is_online = True
                        self.lbl_net_badge.configure(text="🟢 ONLINE", bg="#16a34a")
                        self.lbl_auth_status.configure(
                            text=f"Autenticado ✅ | Seller: {self.cfg.get('company_name')} (ID: {self.cfg.get('company_id')})",
                            fg="#16a34a",
                        )
                        self.refresh_open_sessions_async()
                        messagebox.showinfo("Login Seller Concluído", msg)
                    else:
                        self.lbl_auth_status.configure(text=msg, fg="#dc2626")
                        messagebox.showerror("Falha no Login", msg)
        except queue.Empty:
            pass
        self.root.after(200, self._poll_ui_queue)


def main() -> None:
    if not HAS_TK:
        print("Erro: Tkinter não está disponível neste interpretador Python.", file=sys.stderr)
        sys.exit(1)
    if os.name == "nt":
        try:
            import ctypes
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("Cronuz.HorusPDV.Desktop.1.1")
        except Exception:
            pass
    root = tk.Tk()
    HorusPDVWindow(root)
    root.mainloop()


if __name__ == "__main__":
    main()

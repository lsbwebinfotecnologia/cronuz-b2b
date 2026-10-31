#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
══════════════════════════════════════════════════════════════════════════════
API HORUS B2B COMPLEMENTAR — AGENTE BRIDGE DESKTOP & SERVIÇO WINDOWS (.EXE)
══════════════════════════════════════════════════════════════════════════════
Aplicativo Desktop e Serviço Windows (HorusAPIBridge.exe) com a Logo Oficial
Roxinha do Horus B2B.

Propósito:
- Permite que Sellers/Clientes cujo ambiente de rede não permite abrir portas
  de entrada no Firewall (porta 8060 da API Horus ou porta 1433 do SQL Server)
  disponibilizem uma API Horus B2B pública e padronizada na nuvem Cronuz B2B
  (ou em Droplet dedicado), mantendo 100% do contrato JSON oficial do Horus
  (TServerB2B) + Endpoints Complementares Financeiros e Operacionais via SQL.

Modos de Execução:
1. Interface Gráfica (Padrão):
   python horus_api_bridge_app.py   ou   HorusAPIBridge.exe
2. Serviço Silencioso em Background (Windows Service / Task Scheduler ONSTART):
   python horus_api_bridge_app.py --service   ou   HorusAPIBridge.exe --service
"""

import base64
import gzip
import hashlib
import hmac
import json
import logging
import os
import platform
import socket
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from datetime import datetime, date
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import tkinter as tk
    from tkinter import ttk, messagebox
    HAS_TK = True
except ImportError:
    tk = None  # type: ignore
    ttk = None  # type: ignore
    messagebox = None  # type: ignore
    HAS_TK = False

APP_VERSION = "1.0.0"
APP_TITLE = f"API HORUS B2B COMPLEMENTAR v.{APP_VERSION} — Agente Bridge & Servidor de Conteúdo (Cronuz B2B)"

if getattr(sys, "frozen", False):
    BASE_DIR = Path(sys.executable).parent
else:
    BASE_DIR = Path(__file__).parent

CONFIG_FILE = BASE_DIR / "config_horus_bridge.json"
LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = LOG_DIR / "horus_api_bridge.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
    ],
)
logger = logging.getLogger("horus.bridge")

# Segredo criptográfico compartilhado com o Backend para validação HMAC-SHA256 da licença
HORUS_BRIDGE_LICENSE_SECRET = b"CRONUZ-HORUS-API-BRIDGE-LICENSE-V1-2026-KEY-4D9E8A7F"

# Logo Oficial Roxinha Horus B2B embutida em Base64 (PNG 48x48 + ICO multi-resolução)
HORUS_ICON_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAC8AAAAwCAYAAACBpyPiAAABJGlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGAycHRxcmUSYGDIzSspCnJ3"
    "UoiIjFJgP8/AxsDMAAaJycUFjgEBPiB2Xn5eKgMG+HaNgRFEX9YFmYUpjxdwJRcUlQDpP0BslJJanMzAwGgAZGeXlxQAxRnnANki"
    "Sdlg9gYQuygkyBnIPgJk86VD2FdA7CQI+wmIXQT0BJD9BaQ+Hcxm4gCbA2HLgNglqRUgexmc8wsqizLTM0oUDC0tLRUcU/KTUhWC"
    "K4tLUnOLFTzzkvOLCvKLEktSU4BqIe4DA0GIQlCIaQA1WmiS6G+CABQPENbnQHD4MoqdQYghQHJpURmUychkTJiPMGOOBAOD/1IG"
    "BpY/CDGTXgaGBToMDPxTEWJqhgwMAvoMDPvmAADAxk/9GlU2EAAACPlJREFUeJzNmvtTFFcWx78908zg+wWaICbxkaiIoiY+IkaN"
    "r+yWtftnpmp/2Kr9aXcVAeOTTYiJ72dUiAgqoKAwPGdSnz597RYGlW5qd28VMN237+3veX3POXfwSqVSSeHgk+fZ5+Fh6UW/NDGh"
    "/9nIZKTFS6QlS6bjY/jug5vo75duXpe6n0iFEalUTP5y9otUk2x9LietqJI2b5Fqa6fMo3kH/N4dqa1NmhiXfF/KZpO+1YSenJCy"
    "vmkwqRDFolmf9fXbpF27I0V7xWKpxIcHv0k/tEq5CimTtUWJcHvS5KQJX1VllhwdteukAnihqxQK0rYGadce28tn4tUrqe2iVFEh"
    "eZm5Af7tEemjj6Xe51LLaWlkJLkApXDNvHnS9Wu275pPpAw38XE2x03SaMcBP3zUXsCoqpaOfidVVpr54wGXZOCCCADODCZ9/Ltp"
    "Pa3GER7gqz6y++zNWL5cOnJMyufTCVDCVXypr1d6/lzKvHxhvoRESYEXJ209ruKA370j/e170xIDxjhyPL0AXqgocGfGxuwiyWZu"
    "IwIc4B/XmHaedEm3b0rLlkn370qPHppVCWAskMuld6HxsRjPJwEOIDR+8LBUs9quub90mXTir+ZG3COeHOcTA0eOSc1N0vh48jgr"
    "4vNpgPP30GFp9erIdbg3f36UI7jHdcDLoYtVrzQBiLOkVmf4SYEzAuC1YeSHYF+/kgYHpOFCFMRQ3OLF0qLF9lypZAIQ3FgAF0pi"
    "AT8p8IPfGnB3nyT3232pv08K4oisaMk2AJbLS0uXSus3SOs22JqVq0wA8kASAfykwEkSjL4+6ac26elTuMwA84uywPk5FqDQg9W6"
    "u6U7ty1LAh52chZwlvpQAfzZAGfTOPDOTun8DxFz+BUGhgRFJYhPM/dqUOrpMeBjoybwyX9L+xrNEqyBrVqbZyeAPxvgBw5Jn3xq"
    "9zs6pLOtkXZr10jbtkvV1eX32VQnvXghXbsiPXwgZT3pwjmbQwBo1rnQhwrgzwb4p5/Z/d87pXNnjEnQ7PYdUsOOaB0BOzBgc2RE"
    "V5PD++xTVS21/2gAEYC4IA6wGCTwoRbw3wecnzhwSgmqT+bh6a92WanKeP5MunZVevbUSgPWAgD3gV22NkirVkl1W0yoSxfsbyCA"
    "J61db/nCuZDLIzMJUJbnnStQk39zUPpsrV2TKePAd34VAaccOPkvqbPDApMsunBhlKgQ+uQ/pVs37fkvNkp795l1oM/z56RHD2zO"
    "CcAoviMPTAMfZ4jGA9LadZHkaHSkYC/8cpfV1owb16WLofayGQN2/E/S/AVREkIYBKH0vnbF1m3cJO35OhQgI507O12AoESfQYBp"
    "4NESL9x/QFq33u45NoHe6urN/FtDjd+8If3YJuUrzRrrP5cavzHKpJaP1/DsQWHW/pMJzNi0Wdqz17o3J0DHI5sjjxwKBQDTe8Hz"
    "osb9BtwVWf/4u5mdl3/dKO380uZwgQB43oQmESFU0KbF9nOB7QDkcpYbrl+1eZgoboGzZ0wA5ig9iLlyVe+bWwBjMbU32sPfuSaY"
    "Xr+2DbseR4Ce9kgXzxsQZzHKAFyFvSiBCUyyLTFAdl20KOZGeantkinFCYBlsQCD91LQMUdeqak1y8bd5w14HsInaQlJIpiKLLm5"
    "zqQG3JkWqavLNli+wuZgFVd0Uaa6ZpkfwPz5hPku3ZSrazzP1uHzZFkHCGFZA0jm8jmbI8n1906nzreMAUg01XraEkrGMzbZsTMC"
    "dabZXAmNwxafbzTN4tuUAPfvRWB4Hu4m6Hu6re6BNkcK5pb79pvLBSXDrVCAeunEX4zJEJZC7/Qps/7U04xMuTYLECygW2GQOZ0A"
    "RCIW4FwHYRsbTUusQaArl6V7d+05lyvIqP+5ZPO4wtoNRgiAwf1QyIXz0o2wN6VcYG0A/KQlPISeyvfTkpQToDAsNZ2Sjn1n/uoy"
    "6C+XpQrfkojrntAgL7t9y9a2XTDeX7DA9unti2JowxdGCNmsUa/LpqwfHopwDL02BQ4MRoQwY8CWFWDIJHcWQICG7dL4hG3W2mLu"
    "4FiIHxqPyaLU3WUCEOSUxwQzlBjXeEtYCuPjwYHSXttraMgU9/KlWWumgwGvs6NUYpNyZnExgAaxwJKlofZ/lq78Gp2qUWmSVBi4"
    "BS7FYRMVJPsuW24WQjDGkydW1DngW+ql3XtDjYcKI+bKaTye3d8JPv4wqR7GcIeel9tNgOCgyrO4IOFwPdMALIH56y92DTvVbZV2"
    "77Fr4qYJ4P0zu0oc/HtLYgQCENHefEo6etyqRBYzrmKBChOGwIRFVq6UFi6ydbyIwMO/mcci2WwZ4Gi8yYC/y1Vm3Yw4AcgBBBEW"
    "oCdFABLPz+2mVV7cDh36Un6egcTf4XSXYIKM61lGhRYZBDWdFFQ6k8YTgy8nADEAcHgeLudwic4KDh8bl0bHorWAJn4q81LNGql+"
    "q9X2AfCCAe+bJfBg3/f5/NThghjXQQBiwQ18FhbhOI7AdUfclAJVK4y/F8SeHymYq1DAfSjwWfn81BEUYDnrlmAFBAAQ92ETsik/"
    "71qfyZgrNc8S+NSR6NDJCTDw0lwIegs6nrBlnArEdWSuwhwF+Cnp2bPkwBmJj/t4YUXe+NjFAJoH4OPHUsdDC+rBQWvO6cZcQdbc"
    "ZOzDsXdS4IyEZ8M2SqEFYBkEgDUAWFNjf2ntSP2A55pYaQF4jzUvaYCn0vwbAUpmemjO0SilgOvEyKwB8FGppdnObyrnAPgbzaf8"
    "siIAggB9oQCwCIOSwbEDwCkb5go4I+Ma4zRfOb4lQK/5NPzNcP3BXAPPVUg+fA0Pj3KGnioCoj6Wr1wQgJMwjkuoPOcKeCn25bKP"
    "f5I8OOFFc2kt4IKYGOAQCqumocP4cH02X15wiJVxvSPnLa77STtcPwDoNN+/Th0ufurqbN+M+6qlYad9Xe8eSjtcEz4XwL2wNqL8"
    "wBWD0w33JTIf6JDgZErc4Lg6PF//fxiTNC0TVnZwoOVwBf97EH+Qto0mA58td0r13x6eZ5maf5yg0X9rbqZ/WaE6pGunOuSsMHUy"
    "SACamKFqhVDKdWh/AFevj6sWqPbuAAAAAElFTkSuQmCC"
)


DEFAULT_CONFIG: Dict[str, Any] = {
    "gateway_url": "http://localhost:8000",
    "seller_email": "",
    "company_id": 0,
    "company_name": "",
    "company_document": "",
    "license_key": "",
    "expires_at_br": "",
    "status_label": "Não autenticado",
    "api_username": "",
    "api_password": "",
    "api_token": "",
    "public_horus_base_url": "",
    # API Local Horus (TServerB2B)
    "local_horus_host": "http://localhost",
    "local_horus_port": "8060",
    "local_horus_user": "grupole",
    "local_horus_pass": "",
    "batch_limit": 100000,
    # SQL Server Local (Opcional / Complemento Financeiro)
    "sql_enabled": True,
    "sql_server": "localhost",
    "sql_port": "1433",
    "sql_database": "HORUS_SIGA",
    "sql_user": "site",
    "sql_pass": "",
    "sql_cod_empresa": "1",
    "sql_cod_filial": "1",
    # Funcionalidades
    "enable_tserverb2b_proxy": True,
    "enable_financial_sql": True,
    "enable_gzip": True,
    "auto_start_tunnel": True,
}


def load_config() -> Dict[str, Any]:
    cfg = dict(DEFAULT_CONFIG)
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
            if isinstance(saved, dict):
                cfg.update(saved)
        except Exception as e:
            logger.warning("Erro ao ler config_horus_bridge.json: %s", e)
    return cfg


def save_config(cfg: Dict[str, Any]) -> None:
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error("Erro ao salvar config_horus_bridge.json: %s", e)


def verify_license_key_local(license_key: str) -> Tuple[bool, str, Dict[str, Any]]:
    if not license_key or not license_key.startswith("HBRI1."):
        return False, "Sem chave de licença configurada.", {}
    parts = license_key.strip().split(".")
    if len(parts) != 3:
        return False, "Formato de chave inválido.", {}
    _, b64_payload, sig = parts
    expected = hmac.new(HORUS_BRIDGE_LICENSE_SECRET, b64_payload.encode("ascii"), hashlib.sha256).hexdigest()[:24].upper()
    if not hmac.compare_digest(sig.upper(), expected):
        return False, "Assinatura criptográfica inválida.", {}
    try:
        pad = "=" * ((4 - len(b64_payload) % 4) % 4)
        payload = json.loads(base64.urlsafe_b64decode(b64_payload + pad).decode("utf-8"))
    except Exception:
        return False, "Payload da licença inválido.", {}
    if not payload.get("en"):
        return False, "Licença bloqueada pelo Master.", payload
    exp_str = str(payload.get("exp") or "")[:10]
    if exp_str:
        try:
            exp_dt = datetime.strptime(exp_str, "%Y-%m-%d").date()
            if exp_dt < date.today():
                return False, f"Licença expirada em {exp_dt.strftime('%d/%m/%Y')}", payload
            return True, f"Licença número {payload.get('cid')} válida até {exp_dt.strftime('%d/%m/%Y')}", payload
        except Exception:
            pass
    return False, "Validade da licença não identificada.", payload


# ──────────────────────────────────────────────────────────────────────────────
# Executor Local: 1) API Horus TServerB2B (Porta 8060) & 2) SQL Server (Porta 1433)
# ──────────────────────────────────────────────────────────────────────────────

class LocalHorusBridgeExecutor:
    def __init__(self, config_getter):
        self._get_cfg = config_getter

    def build_local_horus_base_url(self) -> str:
        cfg = self._get_cfg()
        host = (cfg.get("local_horus_host") or "http://localhost").strip().rstrip("/")
        if not host.startswith("http://") and not host.startswith("https://"):
            host = f"http://{host}"
        port = str(cfg.get("local_horus_port") or "8060").strip()
        parsed = urllib.parse.urlparse(host)
        netloc = parsed.hostname or "localhost"
        if port:
            netloc = f"{netloc}:{port}"
        return f"{parsed.scheme or 'http'}://{netloc}/Horus/api/TServerB2B/"

    def test_local_horus_http(self) -> Tuple[bool, str]:
        status, data = self.execute_horus_http("GET", "Teste1", {})
        if 200 <= status < 300:
            if isinstance(data, list) and data and data[0].get("ATIVA") == "S":
                return True, "Webservice iniciado! (ATIVA=S)"
            return True, f"Conectado (HTTP {status})"
        msg = "Sem resposta"
        if isinstance(data, list) and data and isinstance(data[0], dict):
            msg = data[0].get("Mensagem") or str(data[0])
        return False, f"Falha HTTP {status}: {msg}"

    def execute_horus_http(
        self,
        method: str,
        endpoint: str,
        params: Dict[str, Any],
        body: Any = None,
    ) -> Tuple[int, Any]:
        cfg = self._get_cfg()
        base_url = self.build_local_horus_base_url()
        ep_clean = endpoint.strip().lstrip("/")
        url = base_url + ep_clean
        if params:
            qs = urllib.parse.urlencode(params, doseq=True)
            url = f"{url}?{qs}"

        user = (cfg.get("local_horus_user") or "").strip()
        pwd = (cfg.get("local_horus_pass") or "").strip()
        b64_auth = base64.b64encode(f"{user}:{pwd}".encode("utf-8")).decode("ascii")

        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": f"Basic {b64_auth}",
            "User-Agent": f"CronuzHorusAPIBridge/{APP_VERSION}",
        }

        payload_bytes = None
        if body is not None and method.upper() in ("POST", "PUT", "DELETE"):
            payload_bytes = json.dumps(body).encode("utf-8")

        req = urllib.request.Request(url, data=payload_bytes, headers=headers, method=method.upper())
        try:
            with urllib.request.urlopen(req, timeout=50) as resp:
                raw_text = resp.read().decode("utf-8", errors="replace").strip()
                if raw_text.startswith("\ufeff"):
                    raw_text = raw_text[1:]
                try:
                    return resp.status, json.loads(raw_text)
                except Exception:
                    return resp.status, [{"Falha": False, "RetornoBruto": raw_text[:1000]}]
        except urllib.error.HTTPError as e:
            err_body = ""
            try:
                err_body = e.read().decode("utf-8", errors="replace").strip()
                return e.code, json.loads(err_body)
            except Exception:
                return e.code, [{"Falha": True, "Mensagem": f"HTTP {e.code} na API Horus Local: {err_body[:300]}"}]
        except Exception as e:
            return 502, [{"Falha": True, "Mensagem": f"Erro de conexão com a API Horus Local ({url}): {e}"}]

    def _connect_sql_local(self):
        import pytds
        cfg = self._get_cfg()
        raw_srv = (cfg.get("sql_server") or "localhost").strip()
        raw_port = int(str(cfg.get("sql_port") or "1433").strip() or 1433)
        if "," in raw_srv:
            parts = raw_srv.split(",", 1)
            raw_srv = parts[0].strip()
            try:
                raw_port = int(parts[1].strip())
            except ValueError:
                pass
        elif ":" in raw_srv:
            parts = raw_srv.split(":", 1)
            raw_srv = parts[0].strip()
            try:
                raw_port = int(parts[1].strip())
            except ValueError:
                pass

        return pytds.connect(
            server=raw_srv,
            port=raw_port,
            database=(cfg.get("sql_database") or "HORUS_SIGA").strip(),
            user=(cfg.get("sql_user") or "site").strip(),
            password=cfg.get("sql_pass") or "",
            login_timeout=8,
            timeout=25,
            autocommit=True,
            as_dict=True,
        )

    def test_local_sql(self) -> Tuple[bool, str, str]:
        cfg = self._get_cfg()
        if not cfg.get("sql_enabled", True):
            return False, "Desabilitado", ""
        try:
            conn = self._connect_sql_local()
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT @@VERSION AS ver, DB_NAME() AS dbname")
                    row = cur.fetchone() or {}
                    dbname = str(row.get("dbname") or cfg.get("sql_database") or "")
                    return True, f"conectado! ({dbname})", dbname
            finally:
                conn.close()
        except ImportError:
            return False, "Biblioteca pytds não instalada (pip install python-tds)", ""
        except Exception as e:
            return False, f"Erro SQL: {e}", ""

    @staticmethod
    def _serialize_sql_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        clean = []
        for r in rows:
            item = {}
            for k, v in r.items():
                if isinstance(v, (datetime, date)):
                    item[k] = v.isoformat()
                elif isinstance(v, Decimal):
                    item[k] = float(v)
                elif isinstance(v, bytes):
                    item[k] = v.decode("utf-8", errors="ignore")
                else:
                    item[k] = v
            clean.append(item)
        return clean

    def execute_sql_complement(self, endpoint: str, params: Dict[str, Any]) -> Tuple[int, Any]:
        cfg = self._get_cfg()
        ep_lower = endpoint.strip().lower()

        if ep_lower == "status_conexaolocal":
            http_ok, http_msg = self.test_local_horus_http()
            sql_ok, sql_msg, dbname = self.test_local_sql()
            return 200, [{
                "Falha": False,
                "HORUS_HTTP_OK": http_ok,
                "HORUS_HTTP_STATUS": http_msg,
                "HORUS_SQL_OK": sql_ok,
                "HORUS_SQL_STATUS": sql_msg,
                "BANCO_SQL": dbname,
                "HOSTNAME": socket.gethostname(),
                "AGENT_VERSION": APP_VERSION,
            }]

        if not cfg.get("sql_enabled", True) or not cfg.get("enable_financial_sql", True):
            return 403, [{
                "Falha": True,
                "Mensagem": "Consultas SQL Complementares estão desabilitadas neste Agente Local.",
            }]

        try:
            conn = self._connect_sql_local()
        except Exception as e:
            return 502, [{"Falha": True, "Mensagem": f"Falha ao conectar no SQL Server local: {e}"}]

        try:
            cod_empresa = int(params.get("COD_EMPRESA") or cfg.get("sql_cod_empresa") or 1)
            cod_filial = int(params.get("COD_FILIAL") or cfg.get("sql_cod_filial") or 1)
            offset = max(0, int(params.get("OFFSET") or params.get("offset") or 0))
            limit = max(1, min(1000, int(params.get("LIMIT") or params.get("limit") or 100)))

            with conn.cursor() as cur:
                if ep_lower == "busca_titulosfinanceiros":
                    where_clauses = ["LR.COD_EMPRESA = %s", "LR.COD_FILIAL = %s"]
                    sql_params: List[Any] = [cod_empresa, cod_filial]

                    if params.get("COD_CLI"):
                        where_clauses.append("LR.COD_CLI = %s")
                        sql_params.append(int(params["COD_CLI"]))

                    sta = (params.get("STA_LANCTO") or "AB").strip().upper()
                    if sta and sta != "TODOS":
                        where_clauses.append("LR.STA_LANCTO_CRECEBER = %s")
                        sql_params.append(sta)

                    if params.get("NUM_DOCUMENTO"):
                        where_clauses.append("LR.NUM_DOCUMENTO LIKE %s")
                        sql_params.append(f"%{str(params['NUM_DOCUMENTO']).strip()}%")

                    if params.get("DATA_VENC_INI"):
                        where_clauses.append("LR.DAT_VENCIMENTO >= %s")
                        sql_params.append(str(params["DATA_VENC_INI"])[:10])

                    if params.get("DATA_VENC_FIM"):
                        where_clauses.append("LR.DAT_VENCIMENTO <= %s")
                        sql_params.append(str(params["DATA_VENC_FIM"])[:10])

                    where_sql = " AND ".join(where_clauses)
                    query = f"""
                        SELECT
                            LR.COD_EMPRESA,
                            LR.COD_FILIAL,
                            LR.SEQ_LANCTO_CRECEBER,
                            LR.COD_CLI,
                            C.NOM_CLI,
                            C.CPF_CGC,
                            LR.NUM_DOCUMENTO,
                            LR.STA_LANCTO_CRECEBER,
                            LR.DAT_LANCTO AS DAT_EMISSAO,
                            LR.DAT_VENCIMENTO,
                            LR.VLR_LANCTO_CRECEBER AS VLR_ORIGINAL,
                            LR.VLR_SALDO_CRECEBER AS VLR_ABERTO,
                            LR.COD_FORMA
                        FROM LANCTOS_CRECEBER LR WITH (NOLOCK)
                        LEFT JOIN CLIENTES C WITH (NOLOCK) ON C.COD_CLI = LR.COD_CLI
                        WHERE {where_sql}
                        ORDER BY LR.DAT_VENCIMENTO DESC, LR.SEQ_LANCTO_CRECEBER DESC
                        OFFSET %s ROWS FETCH NEXT %s ROWS ONLY
                    """
                    sql_params.extend([offset, limit])
                    cur.execute(query, tuple(sql_params))
                    rows = cur.fetchall() or []
                    return 200, self._serialize_sql_rows(rows)

                elif ep_lower == "busca_resumofinanceirocliente":
                    cod_cli = params.get("COD_CLI")
                    cpf_cgc = "".join(c for c in str(params.get("CPF_CGC") or "") if c.isdigit())
                    if not cod_cli and not cpf_cgc:
                        return 400, [{"Falha": True, "Mensagem": "Informe COD_CLI ou CPF_CGC para consultar o resumo financeiro."}]

                    if cod_cli:
                        filter_sql = "LR.COD_CLI = %s"
                        f_param = int(cod_cli)
                    else:
                        filter_sql = "C.CPF_CGC = %s"
                        f_param = cpf_cgc

                    query = f"""
                        SELECT
                            LR.COD_CLI,
                            COUNT(1) AS QTD_TITULOS_ABERTOS,
                            ISNULL(SUM(LR.VLR_SALDO_CRECEBER), 0) AS VLR_TOTAL_ABERTO,
                            SUM(CASE WHEN LR.DAT_VENCIMENTO < CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) AS QTD_TITULOS_VENCIDOS,
                            ISNULL(SUM(CASE WHEN LR.DAT_VENCIMENTO < CAST(GETDATE() AS DATE) THEN LR.VLR_SALDO_CRECEBER ELSE 0 END), 0) AS VLR_TOTAL_VENCIDOS,
                            SUM(CASE WHEN LR.DAT_VENCIMENTO >= CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) AS QTD_TITULOS_A_VENCER,
                            ISNULL(SUM(CASE WHEN LR.DAT_VENCIMENTO >= CAST(GETDATE() AS DATE) THEN LR.VLR_SALDO_CRECEBER ELSE 0 END), 0) AS VLR_TOTAL_A_VENCER
                        FROM LANCTOS_CRECEBER LR WITH (NOLOCK)
                        LEFT JOIN CLIENTES C WITH (NOLOCK) ON C.COD_CLI = LR.COD_CLI
                        WHERE LR.COD_EMPRESA = %s
                          AND LR.COD_FILIAL = %s
                          AND LR.STA_LANCTO_CRECEBER = 'AB'
                          AND {filter_sql}
                        GROUP BY LR.COD_CLI
                    """
                    cur.execute(query, (cod_empresa, cod_filial, f_param))
                    rows = self._serialize_sql_rows(cur.fetchall() or [])
                    if not rows:
                        return 200, [{
                            "COD_CLI": cod_cli,
                            "QTD_TITULOS_ABERTOS": 0,
                            "VLR_TOTAL_ABERTO": 0.0,
                            "QTD_TITULOS_VENCIDOS": 0,
                            "VLR_TOTAL_VENCIDOS": 0.0,
                            "QTD_TITULOS_A_VENCER": 0,
                            "VLR_TOTAL_A_VENCER": 0.0,
                            "POSSUI_RESTRICAO_VENCIDOS": False,
                        }]
                    rows[0]["POSSUI_RESTRICAO_VENCIDOS"] = float(rows[0].get("VLR_TOTAL_VENCIDOS") or 0) > 0
                    return 200, rows

                elif ep_lower == "busca_pedidosdbm":
                    where_clauses = ["PV.COD_EMPRESA = %s", "PV.COD_FILIAL = %s"]
                    sql_params = [cod_empresa, cod_filial]
                    if params.get("COD_CLI"):
                        where_clauses.append("PV.COD_CLI = %s")
                        sql_params.append(int(params["COD_CLI"]))
                    if params.get("COD_PED_VENDA"):
                        where_clauses.append("PV.COD_PED_VENDA = %s")
                        sql_params.append(int(params["COD_PED_VENDA"]))
                    if params.get("COD_PEDIDO_ORIGEM"):
                        where_clauses.append("PV.COD_PEDIDO_ORIGEM = %s")
                        sql_params.append(str(params["COD_PEDIDO_ORIGEM"]).strip())

                    where_sql = " AND ".join(where_clauses)
                    query = f"""
                        SELECT
                            PV.COD_EMPRESA,
                            PV.COD_FILIAL,
                            PV.COD_PED_VENDA,
                            PV.COD_PEDIDO_ORIGEM,
                            PV.COD_CLI,
                            PV.STA_PEDIDO_VENDA,
                            PV.DAT_PEDIDO,
                            PV.VLR_LIQ_PEDIDO
                        FROM PEDIDOS_VENDA PV WITH (NOLOCK)
                        WHERE {where_sql}
                        ORDER BY PV.COD_PED_VENDA DESC
                        OFFSET %s ROWS FETCH NEXT %s ROWS ONLY
                    """
                    sql_params.extend([offset, limit])
                    cur.execute(query, tuple(sql_params))
                    return 200, self._serialize_sql_rows(cur.fetchall() or [])

                elif ep_lower == "busca_notasfiscaissql":
                    where_clauses = ["NF.COD_EMPRESA = %s", "NF.COD_FILIAL = %s"]
                    sql_params = [cod_empresa, cod_filial]
                    if params.get("COD_CLI"):
                        where_clauses.append("NF.COD_CLI = %s")
                        sql_params.append(int(params["COD_CLI"]))
                    if params.get("NUM_NOTA"):
                        where_clauses.append("NF.NUM_NOTA_FISCAL = %s")
                        sql_params.append(int(params["NUM_NOTA"]))

                    where_sql = " AND ".join(where_clauses)
                    query = f"""
                        SELECT
                            NF.COD_EMPRESA,
                            NF.COD_FILIAL,
                            NF.NUM_NOTA_FISCAL,
                            NF.SERIE_FISCAL,
                            NF.COD_CLI,
                            NF.DAT_EMISSAO,
                            NF.VLR_TOTAL_NOTA
                        FROM NF_MESTRE NF WITH (NOLOCK)
                        WHERE {where_sql}
                        ORDER BY NF.NUM_NOTA_FISCAL DESC
                        OFFSET %s ROWS FETCH NEXT %s ROWS ONLY
                    """
                    sql_params.extend([offset, limit])
                    cur.execute(query, tuple(sql_params))
                    return 200, self._serialize_sql_rows(cur.fetchall() or [])

                return 404, [{"Falha": True, "Mensagem": f"Endpoint SQL complementar [{endpoint}] não reconhecido."}]
        except Exception as e:
            return 500, [{"Falha": True, "Mensagem": f"Erro ao executar consulta SQL complementar [{endpoint}]: {e}"}]
        finally:
            try:
                conn.close()
            except Exception:
                pass


# ──────────────────────────────────────────────────────────────────────────────
# Worker do Túnel Reverso Outbound (Conexão Persistente com a Nuvem)
# ──────────────────────────────────────────────────────────────────────────────

class ReverseTunnelWorker:
    def __init__(self, config_getter, executor: LocalHorusBridgeExecutor, log_callback=None, status_callback=None):
        self._get_cfg = config_getter
        self.executor = executor
        self._log_cb = log_callback
        self._status_cb = status_callback
        self.running = False
        self._thread: Optional[threading.Thread] = None
        self.local_horus_ok = False
        self.local_sql_ok = False
        self.local_sql_dbname = ""
        self.total_served = 0
        self.service_mode = False

    def _emit_log(self, msg: str):
        logger.info(msg)
        if self._log_cb:
            try:
                self._log_cb(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")
            except Exception:
                pass

    def _emit_status(self, state_label: str, connected: bool):
        if self._status_cb:
            try:
                self._status_cb(state_label, connected)
            except Exception:
                pass

    def start(self, service_mode: bool = False):
        if self.running:
            return
        self.service_mode = service_mode
        self.running = True
        self._thread = threading.Thread(target=self._loop, daemon=True, name="HorusBridgeTunnel")
        self._thread.start()

    def stop(self):
        self.running = False
        self._emit_status("Túnel Parado", False)
        self._emit_log("Serviço de túnel reverso interrompido pelo operador.")

    def refresh_local_probes(self):
        self.local_horus_ok, _ = self.executor.test_local_horus_http()
        self.local_sql_ok, _, self.local_sql_dbname = self.executor.test_local_sql()

    def _loop(self):
        self._emit_log("Iniciando Túnel Reverso Outbound com o Gateway Cronuz B2B...")
        last_probe = 0.0

        while self.running:
            cfg = self._get_cfg()
            gw = (cfg.get("gateway_url") or "http://localhost:8000").strip().rstrip("/")
            cid = int(cfg.get("company_id") or 0)
            lic = (cfg.get("license_key") or "").strip()

            ok_lic, msg_lic, _ = verify_license_key_local(lic)
            if not cid or not ok_lic:
                self._emit_status(f"Aguardando Licença ({msg_lic})", False)
                time.sleep(4)
                continue

            now = time.time()
            if (now - last_probe) > 45.0:
                self.refresh_local_probes()
                last_probe = now

            poll_payload = {
                "company_id": cid,
                "license_key": lic,
                "agent_version": APP_VERSION,
                "hostname": socket.gethostname(),
                "os_info": f"{platform.system()} {platform.release()}",
                "local_horus_url": self.executor.build_local_horus_base_url(),
                "local_horus_ok": self.local_horus_ok,
                "local_sql_ok": self.local_sql_ok,
                "local_sql_database": self.local_sql_dbname,
                "service_mode": self.service_mode,
                "wait_seconds": 20,
            }

            req = urllib.request.Request(
                f"{gw}/horus-api-bridge/agent/poll",
                data=json.dumps(poll_payload).encode("utf-8"),
                headers={"Content-Type": "application/json", "Accept": "application/json"},
                method="POST",
            )
            try:
                self._emit_status("Webservice & Túnel Iniciado!", True)
                with urllib.request.urlopen(req, timeout=30) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    commands = data.get("commands") or []
                    for cmd in commands:
                        if not self.running:
                            break
                        threading.Thread(
                            target=self._process_single_command,
                            args=(gw, cid, lic, cmd),
                            daemon=True,
                        ).start()
            except urllib.error.HTTPError as e:
                err_txt = ""
                try:
                    err_txt = e.read().decode("utf-8", errors="ignore")
                except Exception:
                    pass
                self._emit_status(f"Bloqueado/Erro HTTP {e.code}", False)
                self._emit_log(f"Gateway recusou conexão (HTTP {e.code}): {err_txt[:200]}")
                time.sleep(5)
            except Exception as e:
                self._emit_status("Reconectando ao Gateway...", False)
                self._emit_log(f"Oscilação de rede com o Gateway ({gw}): {e}. Reconectando em 3s...")
                time.sleep(3)

    def _process_single_command(self, gw: str, cid: int, lic: str, cmd: Dict[str, Any]):
        req_id = cmd.get("req_id", "")
        target_type = cmd.get("target_type", "HORUS_HTTP")
        method = cmd.get("method", "GET")
        endpoint = cmd.get("endpoint", "")
        params = cmd.get("params") or {}
        body = cmd.get("body")

        t0 = time.time()
        cfg = self._get_cfg()

        if target_type == "HORUS_SQL_COMPLEMENT":
            status_code, resp_data = self.executor.execute_sql_complement(endpoint, params)
        else:
            if not cfg.get("enable_tserverb2b_proxy", True):
                status_code = 403
                resp_data = [{"Falha": True, "Mensagem": "Proxy TServerB2B desabilitado localmente no Agente."}]
            else:
                status_code, resp_data = self.executor.execute_horus_http(method, endpoint, params, body)

        elapsed_ms = round((time.time() - t0) * 1000, 1)
        self.total_served += 1
        self._emit_log(f"[{target_type}] {method} {endpoint} → HTTP {status_code} ({elapsed_ms}ms)")

        # Compressão GZIP para payloads maiores que 2 KB
        raw_json_bytes = json.dumps(resp_data, ensure_ascii=False).encode("utf-8")
        use_gzip = bool(cfg.get("enable_gzip", True) and len(raw_json_bytes) > 2048)
        if use_gzip:
            compressed = gzip.compress(raw_json_bytes, compresslevel=6)
            out_data: Any = base64.b64encode(compressed).decode("ascii")
        else:
            out_data = resp_data

        reply_payload = {
            "req_id": req_id,
            "company_id": cid,
            "license_key": lic,
            "status_code": status_code,
            "is_gzip_base64": use_gzip,
            "data": out_data,
            "elapsed_ms": elapsed_ms,
        }

        try:
            req = urllib.request.Request(
                f"{gw}/horus-api-bridge/agent/respond",
                data=json.dumps(reply_payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=20) as _:
                pass
        except Exception as e:
            self._emit_log(f"Falha ao devolver resposta req_id={req_id}: {e}")


# ──────────────────────────────────────────────────────────────────────────────
# Interface Gráfica Desktop (Estilo API HORUS S.I.G.A com Logo Roxa Horus B2B)
# ──────────────────────────────────────────────────────────────────────────────

def apply_horus_icon_to_window(win) -> Optional[Any]:
    if sys.platform.startswith("win"):
        try:
            import ctypes
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("cronuz.horus.api.bridge.1.0")
        except Exception:
            pass
    ico_path = BASE_DIR / "horus_icon.ico"
    if ico_path.exists():
        try:
            win.iconbitmap(default=str(ico_path))
        except Exception:
            pass
    try:
        photo = tk.PhotoImage(data=HORUS_ICON_B64)
        win.iconphoto(True, photo)
        return photo
    except Exception:
        return None


class HorusApiBridgeDesktopApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title(APP_TITLE)
        self.root.geometry("940x660")
        self.root.minsize(880, 620)
        self._icon_ref = apply_horus_icon_to_window(self.root)

        self.cfg = load_config()
        self.executor = LocalHorusBridgeExecutor(lambda: self.cfg)
        self.worker = ReverseTunnelWorker(
            lambda: self.cfg,
            self.executor,
            log_callback=self._append_log_threadsafe,
            status_callback=self._update_tunnel_status_threadsafe,
        )

        self._build_ui()
        self._populate_from_config()
        self._refresh_license_banner()

        if self.cfg.get("auto_start_tunnel", True) and self.cfg.get("license_key"):
            self.root.after(800, self.start_tunnel)

    def _build_ui(self):
        # Top Header Roxinho Horus B2B
        header = tk.Frame(self.root, bg="#3b0764", height=54)
        header.pack(fill="x")
        header.pack_propagate(False)

        title_lbl = tk.Label(
            header,
            text="🟣 API HORUS S.I.G.A & B2B COMPLEMENTAR — SERVIDOR DE CONTEÚDO & TÚNEL REVERSO",
            bg="#3b0764",
            fg="#ffffff",
            font=("Segoe UI", 11, "bold"),
        )
        title_lbl.pack(side="left", padx=16)

        self.lbl_header_badge = tk.Label(
            header,
            text="VERIFICANDO...",
            bg="#581c87",
            fg="#e9d5ff",
            font=("Segoe UI", 9, "bold"),
            padx=10,
            pady=4,
        )
        self.lbl_header_badge.pack(side="right", padx=16)

        # Notebook (4 Abas igual ao API HORUS S.I.G.A)
        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(fill="both", expand=True, padx=8, pady=8)

        self.tab_services = tk.Frame(self.notebook, bg="#f8fafc")
        self.tab_features = tk.Frame(self.notebook, bg="#f8fafc")
        self.tab_docs = tk.Frame(self.notebook, bg="#f8fafc")
        self.tab_logs = tk.Frame(self.notebook, bg="#f8fafc")

        self.notebook.add(self.tab_services, text="  Serviços  ")
        self.notebook.add(self.tab_features, text="  Funcionalidades  ")
        self.notebook.add(self.tab_docs, text="  Credenciais & Doc. API  ")
        self.notebook.add(self.tab_logs, text="  Log  ")

        self._build_tab_services()
        self._build_tab_features()
        self._build_tab_docs()
        self._build_tab_logs()

    def _build_tab_services(self):
        top_grid = tk.Frame(self.tab_services, bg="#f8fafc")
        top_grid.pack(fill="both", expand=True, padx=10, pady=8)
        top_grid.columnconfigure(0, weight=1)
        top_grid.columnconfigure(1, weight=1)

        # ── COLUNA ESQUERDA ──
        left_col = tk.Frame(top_grid, bg="#f8fafc")
        left_col.grid(row=0, column=0, sticky="nsew", padx=(0, 6))

        # 1. Serviço Webservice & Túnel Reverso
        frm_ws = tk.LabelFrame(
            left_col,
            text=" Serviço Webservice & Túnel Reverso (Sem Porta de Firewall) ",
            bg="#ffffff",
            fg="#1e293b",
            font=("Segoe UI", 9, "bold"),
            padx=10,
            pady=8,
        )
        frm_ws.pack(fill="x", pady=(0, 8))

        row1 = tk.Frame(frm_ws, bg="#ffffff")
        row1.pack(fill="x", pady=2)
        tk.Label(row1, text="Porta HTTP Local Horus:", bg="#ffffff", font=("Segoe UI", 9)).pack(side="left")
        self.ent_horus_port = tk.Entry(row1, width=8, font=("Segoe UI", 10, "bold"), justify="center")
        self.ent_horus_port.pack(side="left", padx=6)

        self.btn_start = tk.Button(
            row1, text="Iniciar", bg="#16a34a", fg="#ffffff", font=("Segoe UI", 9, "bold"), width=8, command=self.start_tunnel
        )
        self.btn_start.pack(side="left", padx=3)

        self.btn_restart = tk.Button(
            row1, text="Stop/Restart", bg="#475569", fg="#ffffff", font=("Segoe UI", 9, "bold"), width=11, command=self.restart_tunnel
        )
        self.btn_restart.pack(side="left", padx=3)

        tk.Button(
            row1, text="Doc. API", bg="#7e22ce", fg="#ffffff", font=("Segoe UI", 9, "bold"), width=9, command=self.open_api_docs
        ).pack(side="left", padx=3)

        row2 = tk.Frame(frm_ws, bg="#ffffff")
        row2.pack(fill="x", pady=(8, 2))
        tk.Button(row2, text="T1", width=5, font=("Segoe UI", 9, "bold"), command=self.test_t1_horus).pack(side="left", padx=(0, 4))
        tk.Button(row2, text="T2", width=5, font=("Segoe UI", 9, "bold"), command=self.test_t2_sql).pack(side="left", padx=(0, 12))

        self.lbl_ws_status = tk.Label(
            row2,
            text="Webservice iniciado!",
            bg="#ffffff",
            fg="#0f172a",
            font=("Segoe UI", 13, "bold"),
        )
        self.lbl_ws_status.pack(side="left")

        # 2. Conexão de Dados (TCP/IP) — SQL Server Local
        frm_sql = tk.LabelFrame(
            left_col,
            text=" Conexão de Dados Local (TCP/IP — Endpoints Financeiros SQL) ",
            bg="#ffffff",
            fg="#1e293b",
            font=("Segoe UI", 9, "bold"),
            padx=10,
            pady=8,
        )
        frm_sql.pack(fill="x", pady=(0, 8))

        def _sql_row(parent, label_txt):
            r = tk.Frame(parent, bg="#ffffff")
            r.pack(fill="x", pady=2)
            tk.Label(r, text=label_txt, width=16, anchor="w", bg="#ffffff", font=("Segoe UI", 9)).pack(side="left")
            e = tk.Entry(r, font=("Segoe UI", 9, "bold"))
            e.pack(side="left", fill="x", expand=True)
            return e

        self.ent_sql_server = _sql_row(frm_sql, "Server / Instância:")
        self.ent_sql_db = _sql_row(frm_sql, "Banco de dados:")

        r_port = tk.Frame(frm_sql, bg="#ffffff")
        r_port.pack(fill="x", pady=2)
        tk.Label(r_port, text="Porta TCP:", width=16, anchor="w", bg="#ffffff", font=("Segoe UI", 9)).pack(side="left")
        self.ent_sql_port = tk.Entry(r_port, width=8, font=("Segoe UI", 9, "bold"))
        self.ent_sql_port.pack(side="left")
        tk.Label(r_port, text="  Empresa/Filial:", bg="#ffffff", font=("Segoe UI", 9)).pack(side="left")
        self.ent_sql_emp = tk.Entry(r_port, width=4, font=("Segoe UI", 9, "bold"))
        self.ent_sql_emp.pack(side="left", padx=2)
        self.ent_sql_fil = tk.Entry(r_port, width=4, font=("Segoe UI", 9, "bold"))
        self.ent_sql_fil.pack(side="left", padx=2)

        self.ent_sql_user = _sql_row(frm_sql, "Usuário SQL:")
        self.ent_sql_pass = _sql_row(frm_sql, "Senha SQL:")
        self.ent_sql_pass.config(show="*")

        r_test_sql = tk.Frame(frm_sql, bg="#ffffff")
        r_test_sql.pack(fill="x", pady=(6, 2))
        tk.Button(
            r_test_sql, text="Testar conexão", font=("Segoe UI", 9, "bold"), command=self.test_t2_sql
        ).pack(side="left")
        self.lbl_sql_status = tk.Label(
            r_test_sql, text="conectado!", bg="#ffffff", fg="#15803d", font=("Segoe UI", 12, "bold")
        )
        self.lbl_sql_status.pack(side="left", padx=14)

        # 3. Usuário e Senha — Acesso Interno API Horus (Local 8060)
        frm_local_auth = tk.LabelFrame(
            left_col,
            text=" Usuário e Senha — Acesso Interno API Horus (localhost) ",
            bg="#ffffff",
            fg="#1e293b",
            font=("Segoe UI", 9, "bold"),
            padx=10,
            pady=8,
        )
        frm_local_auth.pack(fill="x")

        self.ent_horus_host = _sql_row(frm_local_auth, "Host API Local:")
        self.ent_horus_user = _sql_row(frm_local_auth, "Usuário API Local:")
        self.ent_horus_pass = _sql_row(frm_local_auth, "Senha API Local:")
        self.ent_horus_pass.config(show="*")

        # ── COLUNA DIREITA ──
        right_col = tk.Frame(top_grid, bg="#f8fafc")
        right_col.grid(row=0, column=1, sticky="nsew", padx=(6, 0))

        # 4. Usuário e Senha WEB — Autorização de Uso API (Painel Master Cronuz B2B)
        frm_web = tk.LabelFrame(
            right_col,
            text=" Usuário e Senha WEB — Autorização de Uso API (Cronuz B2B Master) ",
            bg="#ffffff",
            fg="#1e293b",
            font=("Segoe UI", 9, "bold"),
            padx=10,
            pady=8,
        )
        frm_web.pack(fill="x", pady=(0, 8))

        self.ent_gw_url = _sql_row(frm_web, "URL Gateway Cloud:")
        self.ent_web_email = _sql_row(frm_web, "E-mail Seller/Master:")
        self.ent_web_pass = _sql_row(frm_web, "Senha WEB:")
        self.ent_web_pass.config(show="*")
        self.ent_api_token = _sql_row(frm_web, "Ou Token Direto:")

        r_perm = tk.Frame(frm_web, bg="#ffffff")
        r_perm.pack(fill="x", pady=(8, 4))
        tk.Button(
            r_perm,
            text="Buscar permissão",
            bg="#7e22ce",
            fg="#ffffff",
            font=("Segoe UI", 9, "bold"),
            padx=8,
            command=self.authenticate_with_cloud,
        ).pack(side="left")

        self.lbl_auth_word = tk.Label(
            r_perm,
            text="Autorizado",
            bg="#ffffff",
            fg="#0f172a",
            font=("Segoe UI", 13, "bold"),
        )
        self.lbl_auth_word.pack(side="left", padx=16)

        # Tabela de Licença igual ao print do Horus
        cols = ("cod", "empresa", "doc")
        self.tree_lic = ttk.Treeview(frm_web, columns=cols, show="headings", height=3)
        self.tree_lic.heading("cod", text="Cod. Licença")
        self.tree_lic.heading("empresa", text="Empresa / Seller")
        self.tree_lic.heading("doc", text="CNPJ / Documento")
        self.tree_lic.column("cod", width=85, anchor="center")
        self.tree_lic.column("empresa", width=180, anchor="w")
        self.tree_lic.column("doc", width=130, anchor="center")
        self.tree_lic.pack(fill="x", pady=6)

        self.lbl_lic_green = tk.Label(
            frm_web,
            text="Licença pendente de autenticação no Gateway",
            bg="#ffffff",
            fg="#15803d",
            font=("Segoe UI", 9, "bold"),
        )
        self.lbl_lic_green.pack(anchor="w", pady=4)

        tk.Button(
            frm_web,
            text="Salvar Configuração & Licença",
            bg="#0f172a",
            fg="#ffffff",
            font=("Segoe UI", 9, "bold"),
            command=self.save_from_ui,
        ).pack(anchor="w", pady=2)

        # 5. Total de registros em lote
        frm_batch = tk.LabelFrame(
            right_col,
            text=" Total de registros em lote ",
            bg="#ffffff",
            fg="#1e293b",
            font=("Segoe UI", 9, "bold"),
            padx=10,
            pady=8,
        )
        frm_batch.pack(fill="x")
        r_b = tk.Frame(frm_batch, bg="#ffffff")
        r_b.pack(fill="x")
        self.ent_batch = tk.Entry(r_b, width=14, font=("Segoe UI", 10, "bold"), justify="right")
        self.ent_batch.pack(side="left", padx=(0, 8))
        tk.Button(r_b, text="Salvar", command=self.save_from_ui).pack(side="left")

        # ── RODAPÉ: URL BASE - Acesso Externo ──
        frm_bottom = tk.LabelFrame(
            self.tab_services,
            text=" URL BASE - Acesso externo (Pronta para entregar ao Integrador / E-commerce): ",
            bg="#ffffff",
            fg="#1e293b",
            font=("Segoe UI", 9, "bold"),
            padx=10,
            pady=6,
        )
        frm_bottom.pack(fill="x", padx=10, pady=(0, 8))
        self.ent_public_url = tk.Entry(frm_bottom, font=("Segoe UI", 10, "bold"), fg="#581c87")
        self.ent_public_url.pack(side="left", fill="x", expand=True, padx=(0, 8))
        tk.Button(
            frm_bottom,
            text="Copiar URL",
            bg="#7e22ce",
            fg="#ffffff",
            font=("Segoe UI", 9, "bold"),
            command=lambda: self._copy_value(self.ent_public_url.get(), "URL Base"),
        ).pack(side="right")

    def _build_tab_features(self):
        box = tk.LabelFrame(
            self.tab_features,
            text=" Módulos e Camadas de Segurança do Agente (.EXE) ",
            bg="#ffffff",
            fg="#1e293b",
            font=("Segoe UI", 10, "bold"),
            padx=16,
            pady=14,
        )
        box.pack(fill="both", expand=True, padx=14, pady=14)

        self.var_proxy_tserver = tk.BooleanVar(value=True)
        self.var_fin_sql = tk.BooleanVar(value=True)
        self.var_gzip = tk.BooleanVar(value=True)
        self.var_autostart = tk.BooleanVar(value=True)

        tk.Checkbutton(
            box,
            text="Habilitar Proxy de Endpoints Oficiais Horus (TServerB2B: Produtos, Estoque, Clientes, Pedidos, NF, BI)",
            variable=self.var_proxy_tserver,
            bg="#ffffff",
            font=("Segoe UI", 10, "bold"),
        ).pack(anchor="w", pady=6)

        tk.Checkbutton(
            box,
            text="Habilitar Endpoints Complementares Financeiros e Operacionais via SQL Local (LANCTOS_CRECEBER / PEDIDOS_VENDA)",
            variable=self.var_fin_sql,
            bg="#ffffff",
            font=("Segoe UI", 10, "bold"),
        ).pack(anchor="w", pady=6)

        tk.Checkbutton(
            box,
            text="Habilitar Compressão GZIP de Alta Performance no Túnel Reverso (Reduz tráfego de rede em até 85%)",
            variable=self.var_gzip,
            bg="#ffffff",
            font=("Segoe UI", 10, "bold"),
        ).pack(anchor="w", pady=6)

        tk.Checkbutton(
            box,
            text="Iniciar Túnel Automaticamente ao abrir o aplicativo ou Serviço do Windows",
            variable=self.var_autostart,
            bg="#ffffff",
            font=("Segoe UI", 10, "bold"),
        ).pack(anchor="w", pady=6)

        tk.Button(
            box,
            text="💾 Salvar Preferências de Funcionalidades",
            bg="#7e22ce",
            fg="#ffffff",
            font=("Segoe UI", 10, "bold"),
            padx=14,
            pady=6,
            command=self.save_from_ui,
        ).pack(anchor="w", pady=16)

    def _build_tab_docs(self):
        box = tk.LabelFrame(
            self.tab_docs,
            text=" Credenciais da API Pública do Seller & Documentação Interativa ",
            bg="#ffffff",
            fg="#1e293b",
            font=("Segoe UI", 10, "bold"),
            padx=16,
            pady=14,
        )
        box.pack(fill="both", expand=True, padx=14, pady=14)

        def _cred_row(label_text):
            r = tk.Frame(box, bg="#ffffff")
            r.pack(fill="x", pady=6)
            tk.Label(r, text=label_text, width=28, anchor="w", bg="#ffffff", font=("Segoe UI", 9, "bold")).pack(side="left")
            e = tk.Entry(r, font=("Consolas", 10))
            e.pack(side="left", fill="x", expand=True, padx=6)
            tk.Button(r, text="Copiar", command=lambda: self._copy_value(e.get(), label_text)).pack(side="right")
            return e

        self.ent_doc_url = _cred_row("URL Base Padrão (TServerB2B):")
        self.ent_doc_user = _cred_row("Usuário API (Basic Auth):")
        self.ent_doc_pass = _cred_row("Senha API (Basic Auth):")
        self.ent_doc_token = _cred_row("Token API (Bearer / X-API-Key):")
        self.ent_doc_lic = _cred_row("Chave de Licença HMAC (.EXE):")

        tk.Button(
            box,
            text="📖 Abrir Documentação Completa da API no Navegador",
            bg="#7e22ce",
            fg="#ffffff",
            font=("Segoe UI", 10, "bold"),
            padx=14,
            pady=8,
            command=self.open_api_docs,
        ).pack(anchor="w", pady=16)

    def _build_tab_logs(self):
        top_bar = tk.Frame(self.tab_logs, bg="#f8fafc")
        top_bar.pack(fill="x", padx=10, pady=6)
        tk.Label(
            top_bar,
            text="Monitoramento em Tempo Real de Requisições (API 8060 & SQL 1433):",
            bg="#f8fafc",
            font=("Segoe UI", 9, "bold"),
        ).pack(side="left")
        tk.Button(top_bar, text="Limpar Log", command=lambda: self.txt_logs.delete("1.0", "end")).pack(side="right")

        self.txt_logs = tk.Text(
            self.tab_logs,
            bg="#0f172a",
            fg="#e2e8f0",
            font=("Consolas", 9),
            wrap="word",
        )
        self.txt_logs.pack(fill="both", expand=True, padx=10, pady=(0, 10))

    def _copy_value(self, val: str, label: str):
        if not val:
            return
        self.root.clipboard_clear()
        self.root.clipboard_append(val)
        messagebox.showinfo("Copiado", f"{label} copiado para a área de transferência!")

    def _populate_from_config(self):
        c = self.cfg
        self._set_entry(self.ent_horus_port, str(c.get("local_horus_port") or "8060"))
        self._set_entry(self.ent_horus_host, str(c.get("local_horus_host") or "http://localhost"))
        self._set_entry(self.ent_horus_user, str(c.get("local_horus_user") or "grupole"))
        self._set_entry(self.ent_horus_pass, str(c.get("local_horus_pass") or ""))

        self._set_entry(self.ent_sql_server, str(c.get("sql_server") or "OPEN-SERVER"))
        self._set_entry(self.ent_sql_db, str(c.get("sql_database") or "HORUS_SIGA"))
        self._set_entry(self.ent_sql_port, str(c.get("sql_port") or "1433"))
        self._set_entry(self.ent_sql_emp, str(c.get("sql_cod_empresa") or "1"))
        self._set_entry(self.ent_sql_fil, str(c.get("sql_cod_filial") or "1"))
        self._set_entry(self.ent_sql_user, str(c.get("sql_user") or "site"))
        self._set_entry(self.ent_sql_pass, str(c.get("sql_pass") or ""))

        self._set_entry(self.ent_gw_url, str(c.get("gateway_url") or "http://localhost:8000"))
        self._set_entry(self.ent_web_email, str(c.get("seller_email") or ""))
        self._set_entry(self.ent_api_token, str(c.get("api_token") or ""))
        self._set_entry(self.ent_batch, str(c.get("batch_limit") or 100000))

        pub_url = c.get("public_horus_base_url") or f"{c.get('gateway_url', 'http://localhost:8000')}/Horus/api/TServerB2B/"
        self._set_entry(self.ent_public_url, pub_url)
        self._set_entry(self.ent_doc_url, pub_url)
        self._set_entry(self.ent_doc_user, str(c.get("api_username") or ""))
        self._set_entry(self.ent_doc_pass, str(c.get("api_password") or ""))
        self._set_entry(self.ent_doc_token, str(c.get("api_token") or ""))
        self._set_entry(self.ent_doc_lic, str(c.get("license_key") or ""))

        self.var_proxy_tserver.set(bool(c.get("enable_tserverb2b_proxy", True)))
        self.var_fin_sql.set(bool(c.get("enable_financial_sql", True)))
        self.var_gzip.set(bool(c.get("enable_gzip", True)))
        self.var_autostart.set(bool(c.get("auto_start_tunnel", True)))

    @staticmethod
    def _set_entry(entry: tk.Entry, text: str):
        entry.delete(0, "end")
        entry.insert(0, text)

    def _collect_ui_into_config(self):
        self.cfg["local_horus_port"] = self.ent_horus_port.get().strip() or "8060"
        self.cfg["local_horus_host"] = self.ent_horus_host.get().strip() or "http://localhost"
        self.cfg["local_horus_user"] = self.ent_horus_user.get().strip()
        self.cfg["local_horus_pass"] = self.ent_horus_pass.get().strip()

        self.cfg["sql_server"] = self.ent_sql_server.get().strip() or "localhost"
        self.cfg["sql_database"] = self.ent_sql_db.get().strip() or "HORUS_SIGA"
        self.cfg["sql_port"] = self.ent_sql_port.get().strip() or "1433"
        self.cfg["sql_cod_empresa"] = self.ent_sql_emp.get().strip() or "1"
        self.cfg["sql_cod_filial"] = self.ent_sql_fil.get().strip() or "1"
        self.cfg["sql_user"] = self.ent_sql_user.get().strip()
        self.cfg["sql_pass"] = self.ent_sql_pass.get().strip()

        self.cfg["gateway_url"] = self.ent_gw_url.get().strip().rstrip("/") or "http://localhost:8000"
        self.cfg["seller_email"] = self.ent_web_email.get().strip()
        if self.ent_api_token.get().strip():
            self.cfg["api_token"] = self.ent_api_token.get().strip()

        try:
            self.cfg["batch_limit"] = int(self.ent_batch.get().strip() or 100000)
        except ValueError:
            self.cfg["batch_limit"] = 100000

        self.cfg["enable_tserverb2b_proxy"] = bool(self.var_proxy_tserver.get())
        self.cfg["enable_financial_sql"] = bool(self.var_fin_sql.get())
        self.cfg["enable_gzip"] = bool(self.var_gzip.get())
        self.cfg["auto_start_tunnel"] = bool(self.var_autostart.get())

    def save_from_ui(self):
        self._collect_ui_into_config()
        save_config(self.cfg)
        self._refresh_license_banner()
        self._append_log_threadsafe("Configurações salvas em config_horus_bridge.json.")

    def _refresh_license_banner(self):
        for item in self.tree_lic.get_children():
            self.tree_lic.delete(item)

        ok, msg, payload = verify_license_key_local(self.cfg.get("license_key") or "")
        cid = self.cfg.get("company_id") or payload.get("cid") or "-"
        cname = self.cfg.get("company_name") or "Empresa Vinculada"
        cdoc = self.cfg.get("company_document") or payload.get("doc") or "-"

        if ok:
            self.tree_lic.insert("", "end", values=(cid, cname, cdoc))
            self.lbl_auth_word.config(text="Autorizado", fg="#15803d")
            self.lbl_lic_green.config(text=msg, fg="#15803d")
            self.lbl_header_badge.config(text=f"LICENÇA ATIVA (#{cid})", bg="#15803d", fg="#ffffff")
        else:
            self.lbl_auth_word.config(text="Bloqueado / Pendente", fg="#dc2626")
            self.lbl_lic_green.config(text=msg, fg="#dc2626")
            self.lbl_header_badge.config(text="SEM LICENÇA ATIVA", bg="#991b1b", fg="#fecaca")

    def authenticate_with_cloud(self):
        self._collect_ui_into_config()
        gw = self.cfg["gateway_url"]
        req_body = {
            "email": self.cfg.get("seller_email"),
            "password": self.ent_web_pass.get().strip(),
            "api_token": self.cfg.get("api_token"),
            "hostname": socket.gethostname(),
            "agent_version": APP_VERSION,
            "service_mode": False,
        }
        req = urllib.request.Request(
            f"{gw}/horus-api-bridge/agent/auth",
            data=json.dumps(req_body).encode("utf-8"),
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                remote_cfg = data.get("config") or {}
                self.cfg["company_id"] = remote_cfg.get("company_id")
                self.cfg["company_name"] = remote_cfg.get("company_name")
                self.cfg["company_document"] = remote_cfg.get("company_document")
                self.cfg["license_key"] = remote_cfg.get("license_key")
                self.cfg["expires_at_br"] = remote_cfg.get("expires_at_br")
                self.cfg["status_label"] = remote_cfg.get("status_label")
                self.cfg["api_username"] = remote_cfg.get("api_username")
                self.cfg["api_password"] = remote_cfg.get("api_password")
                self.cfg["api_token"] = remote_cfg.get("api_token")
                self.cfg["public_horus_base_url"] = remote_cfg.get("public_horus_base_url")
                save_config(self.cfg)
                self._populate_from_config()
                self._refresh_license_banner()
                self.start_tunnel()
                messagebox.showinfo("Autorizado", f"Agente autenticado com sucesso!\n{remote_cfg.get('status_label')}")
        except urllib.error.HTTPError as e:
            detail = "Falha de autenticação."
            try:
                err_json = json.loads(e.read().decode("utf-8"))
                detail = err_json.get("detail") or detail
            except Exception:
                pass
            messagebox.showerror("Não Autorizado", f"HTTP {e.code}: {detail}")
        except Exception as e:
            messagebox.showerror("Erro de Rede", f"Não foi possível conectar ao Gateway ({gw}):\n{e}")

    def test_t1_horus(self):
        self._collect_ui_into_config()
        ok, msg = self.executor.test_local_horus_http()
        self.worker.local_horus_ok = ok
        if ok:
            self.lbl_ws_status.config(text="Webservice iniciado!", fg="#15803d")
            self._append_log_threadsafe(f"[Teste T1 API Local] SUCESSO: {msg}")
        else:
            self.lbl_ws_status.config(text="Falha API Local", fg="#dc2626")
            self._append_log_threadsafe(f"[Teste T1 API Local] ERRO: {msg}")

    def test_t2_sql(self):
        self._collect_ui_into_config()
        ok, msg, dbname = self.executor.test_local_sql()
        self.worker.local_sql_ok = ok
        self.worker.local_sql_dbname = dbname
        if ok:
            self.lbl_sql_status.config(text="conectado!", fg="#15803d")
            self._append_log_threadsafe(f"[Teste T2 SQL Local] SUCESSO: {msg}")
        else:
            self.lbl_sql_status.config(text="falha SQL!", fg="#dc2626")
            self._append_log_threadsafe(f"[Teste T2 SQL Local] ERRO: {msg}")

    def start_tunnel(self):
        self._collect_ui_into_config()
        save_config(self.cfg)
        self.worker.start(service_mode=False)

    def restart_tunnel(self):
        self.worker.stop()
        self.root.after(600, self.start_tunnel)

    def open_api_docs(self):
        gw = (self.cfg.get("gateway_url") or "http://localhost:8000").strip().rstrip("/")
        # Se estiver no ambiente padrão Cronuz, abre a rota /horus-api-docs do Frontend ou JSON docs do Gateway
        doc_url = gw.replace(":8000", ":3000") + "/horus-api-docs"
        webbrowser.open(doc_url)

    def _append_log_threadsafe(self, line: str):
        def _do():
            self.txt_logs.insert("end", line + "\n")
            self.txt_logs.see("end")
        try:
            self.root.after(0, _do)
        except Exception:
            pass

    def _update_tunnel_status_threadsafe(self, label: str, connected: bool):
        def _do():
            self.lbl_ws_status.config(text=label, fg="#15803d" if connected else "#dc2626")
        try:
            self.root.after(0, _do)
        except Exception:
            pass


def run_headless_service():
    """
    Executa o HorusAPIBridge em modo Serviço Silencioso (--service) para o Windows Server.
    """
    logger.info("════════════════════════════════════════════════════════════════════")
    logger.info(" INICIANDO HORUS API BRIDGE EM MODO SERVIÇO WINDOWS (--service)")
    logger.info("════════════════════════════════════════════════════════════════════")
    cfg = load_config()
    executor = LocalHorusBridgeExecutor(lambda: load_config())
    worker = ReverseTunnelWorker(lambda: load_config(), executor)
    worker.start(service_mode=True)
    try:
        while True:
            time.sleep(10)
    except KeyboardInterrupt:
        worker.stop()


def main():
    if "--service" in sys.argv or "-s" in sys.argv:
        run_headless_service()
        return

    if not HAS_TK:
        logger.warning("Tkinter indisponível neste ambiente. Iniciando automaticamente em modo --service.")
        run_headless_service()
        return

    root = tk.Tk()
    app = HorusApiBridgeDesktopApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
══════════════════════════════════════════════════════════════════════════════
CRONUZ BUSCA PREÇO — SERVIDOR GERTEC G2 / G2S / G2E / TC506 (WINDOWS APP)
══════════════════════════════════════════════════════════════════════════════
Aplicativo Desktop Windows para comunicação via Socket TCP/IP (porta 6500)
com terminais de consulta Gertec Busca Preço G2 na rede local, consultando
automaticamente a API do Cronuz B2B / Horus ERP com base nas credenciais do Seller.

Funcionalidades:
- Servidor Socket TCP/IP assíncrono (suporta múltiplos leitores Gertec G2 na mesma loja)
- Handshake oficial Gertec (#ok -> #bpg2s/#bpg2e -> #alwayslive -> #live?)
- Formatação automática de 4 linhas x 20 colunas (80 bytes) + Preço em R$
- Autenticação dedicada na API Cronuz (/product-search/terminal-auth) sem derrubar sessão web
- Checklist Visual de Diagnóstico: alerta exatamente o que falta configurar no Horus/Seller
- Simulador de Leitor integrado para testar ISBNs sem precisar ir até o equipamento físico
- Cache inteligente de curta duração (configurável) para resposta instantânea (< 50ms)
"""

import asyncio
import json
import logging
import os
import queue
import re
import socket
import sys
import textwrap
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from datetime import datetime
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

# ──────────────────────────────────────────────────────────────────────────────
# Configurações e Caminhos
# ──────────────────────────────────────────────────────────────────────────────
APP_VERSION = "1.3.0"
APP_TITLE = f"Horus / Cronuz Busca Preço — Servidor Gertec Universal v{APP_VERSION}"

if getattr(sys, "frozen", False):
    BASE_DIR = Path(sys.executable).parent
else:
    BASE_DIR = Path(__file__).parent

CONFIG_FILE = BASE_DIR / "config_gertec.json"
LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)
LOG_FILE = LOG_DIR / "cronuz_gertec.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
    ],
)
logger = logging.getLogger("cronuz.gertec")

DEFAULT_CONFIG: Dict[str, Any] = {
    "api_base_url": "https://cronuzb2b.com.br/api",
    "email": "",
    "company_id": "",
    "company_name": "",
    "company_document": "",
    "access_token": "",
    "tcp_port": 6500,
    "sc504_port": 16510,
    "last_terminal_ip": "192.168.15.34",
    "welcome_line1": "LIVRARIA / PAPELARIA",
    "welcome_line2": "CONSULTE O PRECO AQUI",
    "display_time_sec": 5,
    "cache_ttl_sec": 120,
    "auto_start_server": True,
    "show_stock_in_price_line": False,
    "display_format_mode": "auto_tc502_compact",
}

# Logo Oficial Horus B2B embutida em Base64 (para funcionar dentro do .exe único sem depender de arquivos externos)
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


def load_config() -> Dict[str, Any]:
    cfg = dict(DEFAULT_CONFIG)
    if CONFIG_FILE.exists():
        try:
            raw = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                cfg.update(raw)
        except Exception as exc:
            logger.warning("Erro ao carregar config_gertec.json: %s", exc)
    return cfg


def save_config(cfg: Dict[str, Any]) -> None:
    try:
        CONFIG_FILE.write_text(
            json.dumps(cfg, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
    except Exception as exc:
        logger.error("Erro ao salvar config_gertec.json: %s", exc)


def get_local_ips() -> List[str]:
    """Retorna todos os IPs IPv4 ativos da máquina Windows na rede local (LAN/Wi-Fi)."""
    ips: List[str] = []
    for target in [("8.8.8.8", 80), ("192.168.15.1", 80), ("192.168.1.1", 80), ("192.168.0.1", 80), ("10.0.0.1", 80)]:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.settimeout(0.2)
            s.connect(target)
            cand = s.getsockname()[0]
            s.close()
            if cand and not cand.startswith("127.") and cand not in ips:
                ips.append(cand)
        except Exception:
            pass

    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127.") and not ip.startswith("169.254.") and ip not in ips:
                ips.append(ip)
    except Exception:
        pass

    return ips or ["127.0.0.1"]


def match_best_server_ip_for_terminal(terminal_ip: str, local_ips: Optional[List[str]] = None) -> str:
    """Dado o IP do Gertec (ex: 192.168.15.34), descobre qual IP do PC está na mesma sub-rede (ex: 192.168.15.94)."""
    ips = local_ips or get_local_ips()
    term_parts = (terminal_ip or "").strip().split(".")
    if len(term_parts) == 4:
        prefix_24 = ".".join(term_parts[:3]) + "."
        for ip in ips:
            if ip.startswith(prefix_24):
                return ip
        prefix_16 = ".".join(term_parts[:2]) + "."
        for ip in ips:
            if ip.startswith(prefix_16):
                return ip
    return ips[0] if ips else "127.0.0.1"


def ensure_windows_firewall_rules(ports: List[int] = [6500, 16510], elevate_with_uac: bool = False) -> Tuple[bool, str]:
    """
    Libera as portas TCP 6500 (SC501: G2/G2S/G2E/TC502/TC505/TC406) e 16510 (SC504: TC504/TC506/TC508/G-BOT)
    no Firewall do Windows para todos os perfis de rede (Público, Privado e Domínio).
    """
    if sys.platform != "win32":
        return True, "Sistema não-Windows (liberação automática de netsh ignorada)."

    cmds = []
    for p in ports:
        rule_name = f"Horus Cronuz Gertec TCP {p}"
        cmds.append(f'netsh advfirewall firewall delete rule name="{rule_name}" >nul 2>&1')
        cmds.append(
            f'netsh advfirewall firewall add rule name="{rule_name}" '
            f'dir=in action=allow protocol=TCP localport={p} profile=any enable=yes'
        )
    if getattr(sys, "frozen", False):
        exe_path = os.path.abspath(sys.executable)
        exe_rule = "Horus Cronuz Gertec App"
        cmds.append(f'netsh advfirewall firewall delete rule name="{exe_rule}" >nul 2>&1')
        cmds.append(
            f'netsh advfirewall firewall add rule name="{exe_rule}" '
            f'dir=in action=allow program="{exe_path}" profile=any enable=yes'
        )

    joined_cmd = " & ".join(cmds)
    try:
        res = subprocess.run(
            ["cmd.exe", "/c", joined_cmd],
            capture_output=True,
            text=True,
            timeout=8,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if res.returncode == 0:
            return True, "Portas TCP 6500 e 16510 liberadas no Firewall do Windows (Perfis Público/Privado/Domínio)."
    except Exception as exc:
        logger.debug("Tentativa silenciosa de liberar firewall falhou: %s", exc)

    if elevate_with_uac:
        try:
            import ctypes
            ret = ctypes.windll.shell32.ShellExecuteW(
                None, "runas", "cmd.exe", f'/c "{joined_cmd}"', None, 0
            )
            if int(ret) > 32:
                return True, "Regra de Firewall aplicada com permissão de Administrador ( Portas 6500 e 16510 liberadas )."
            return False, f"Elevação UAC cancelada ou negada pelo Windows (código {ret})."
        except Exception as exc:
            return False, f"Não foi possível solicitar permissão de Administrador: {exc}"

    return False, "Execute como Administrador ou clique em 'Liberar Firewall Windows' caso a rede esteja marcada como Pública."


def inspect_gertec_web_panel(
    terminal_ip: str,
    username: str = "admin",
    password: str = "admin",
    timeout: float = 4.0,
) -> Dict[str, Any]:
    """
    Acessa o painel web HTTP do terminal Gertec (ex: http://192.168.15.34/principal, /rede, /wifi)
    para diagnosticar modelo, firmware e qual IP de servidor / porta estão gravados no aparelho.
    """
    ip = (terminal_ip or "").strip()
    result: Dict[str, Any] = {
        "reachable": False,
        "auth_ok": False,
        "terminal_ip": ip,
        "recommended_server_ip": match_best_server_ip_for_terminal(ip),
        "model_name": "",
        "firmware": "",
        "bootloader": "",
        "eth_server_ip": "",
        "eth_server_port": "",
        "wifi_server_ip": "",
        "wifi_server_port": "",
        "raw_pages": {},
        "error": "",
    }
    if not ip:
        result["error"] = "IP do terminal vazio."
        return result

    try:
        sess = requests.Session()
        sess.auth = (username, password)
        headers = {"User-Agent": f"HorusCronuzGertec/{APP_VERSION}"}

        for page in ["principal", "rede", "wifi", "config", ""]:
            url = f"http://{ip}/{page}".rstrip("/")
            try:
                resp = sess.get(url, headers=headers, timeout=timeout)
                result["reachable"] = True
                if resp.status_code == 401:
                    result["error"] = "Autenticação HTTP recusada (usuário/senha do painel web do Gertec diferente de admin/admin)."
                    return result
                if resp.status_code == 200 and resp.text:
                    result["auth_ok"] = True
                    result["raw_pages"][page or "root"] = resp.text
            except requests.RequestException:
                continue

        if not result["reachable"]:
            result["error"] = f"Não foi possível alcançar http://{ip}/ na rede local."
            return result

        principal_html = result["raw_pages"].get("principal") or result["raw_pages"].get("root") or ""
        if principal_html:
            m_fw = re.search(r"Firmware\s*:\s*</[^>]+>\s*<[^>]+>\s*([^<]+)", principal_html, re.IGNORECASE)
            if not m_fw:
                m_fw = re.search(r"Firmware\s*:\s*([0-9A-Za-z\.\-\s]+)", principal_html, re.IGNORECASE)
            if m_fw:
                result["firmware"] = m_fw.group(1).strip()

            m_bl = re.search(r"Bootloader\s*:\s*</[^>]+>\s*<[^>]+>\s*([^<]+)", principal_html, re.IGNORECASE)
            if not m_bl:
                m_bl = re.search(r"Bootloader\s*:\s*([0-9A-Za-z\.\-\s]+)", principal_html, re.IGNORECASE)
            if m_bl:
                result["bootloader"] = m_bl.group(1).strip()

            if "Busca Pre" in principal_html:
                m_mod = re.search(r"(Busca\s+Pre[^\<\"\r\n]{1,25})", principal_html, re.IGNORECASE)
                if m_mod:
                    result["model_name"] = m_mod.group(1).strip()

        def _extract_server_fields(html_str: str) -> Tuple[str, str]:
            srv_ip = ""
            srv_port = ""
            if not html_str:
                return srv_ip, srv_port
            for pat in [
                r'name=["\']?(?:ip_?serv\w*|serv\w*ip\w*|server_?ip|ipserver|ipsrv|host)["\']?[^>]*value=["\']([^"\']+)["\']',
                r'value=["\']([^"\']+)["\'][^>]*name=["\']?(?:ip_?serv\w*|serv\w*ip\w*|server_?ip|ipserver|ipsrv|host)["\']?',
                r'Servidor[^<]{0,60}<[^>]*value=["\'](\d{1,3}(?:\.\d{1,3}){3})["\']',
            ]:
                m = re.search(pat, html_str, re.IGNORECASE | re.DOTALL)
                if m:
                    srv_ip = m.group(1).strip()
                    break
            for pat in [
                r'name=["\']?(?:port\w*|srv_?port|porta\w*)["\']?[^>]*value=["\'](\d+)["\']',
                r'value=["\'](\d+)["\'][^>]*name=["\']?(?:port\w*|srv_?port|porta\w*)["\']?',
                r'Porta[^<]{0,60}<[^>]*value=["\'](\d{2,5})["\']',
            ]:
                m = re.search(pat, html_str, re.IGNORECASE | re.DOTALL)
                if m:
                    srv_port = m.group(1).strip()
                    break
            return srv_ip, srv_port

        result["eth_server_ip"], result["eth_server_port"] = _extract_server_fields(result["raw_pages"].get("rede", ""))
        result["wifi_server_ip"], result["wifi_server_port"] = _extract_server_fields(result["raw_pages"].get("wifi", ""))
        return result
    except Exception as exc:
        result["error"] = str(exc)
        return result


def auto_configure_gertec_web_panel(
    terminal_ip: str,
    server_ip: str,
    server_port: int = 6500,
    username: str = "admin",
    password: str = "admin",
) -> Tuple[bool, str]:
    """
    Envia automaticamente o IP do Servidor e Porta 6500 para os formulários /rede e /wifi do Gertec
    e aciona o comando de 'Salvar e Sair' (reinicialização de serviço do leitor) para conectar na hora.
    """
    info = inspect_gertec_web_panel(terminal_ip, username=username, password=password)
    if not info.get("reachable"):
        return False, info.get("error") or f"Terminal {terminal_ip} inacessível via HTTP."

    sess = requests.Session()
    sess.auth = (username, password)
    headers = {"User-Agent": f"HorusCronuzGertec/{APP_VERSION}"}
    updated_sections: List[str] = []

    for page in ["rede", "wifi"]:
        html_str = info.get("raw_pages", {}).get(page, "")
        if not html_str:
            continue
        inputs = re.findall(r"<input[^>]+>", html_str, re.IGNORECASE)
        form_data: Dict[str, str] = {}
        changed = False
        for inp in inputs:
            m_name = re.search(r'name=["\']([^"\']+)["\']', inp, re.IGNORECASE)
            if not m_name:
                continue
            name = m_name.group(1)
            m_type = re.search(r'type=["\']([^"\']+)["\']', inp, re.IGNORECASE)
            inp_type = (m_type.group(1).lower() if m_type else "text")
            if inp_type in ("button", "reset", "image", "file"):
                continue
            if inp_type in ("checkbox", "radio") and not re.search(r"\bchecked\b", inp, re.IGNORECASE):
                continue
            m_val = re.search(r'value=["\']([^"\']*)["\']', inp, re.IGNORECASE)
            val = m_val.group(1) if m_val else ""

            low_name = name.lower()
            if any(k in low_name for k in ("serv", "srv", "host")) and "port" not in low_name:
                val = server_ip
                changed = True
            elif "port" in low_name or "porta" in low_name:
                val = str(server_port)
                changed = True
            form_data[name] = val

        if changed and form_data:
            m_act = re.search(r'<form[^>]*action=["\']([^"\']+)["\']', html_str, re.IGNORECASE)
            action_path = m_act.group(1).lstrip("/") if m_act else page
            try:
                sess.post(f"http://{terminal_ip}/{action_path}", data=form_data, headers=headers, timeout=5.0)
                updated_sections.append(page.upper())
            except Exception as exc:
                logger.warning("Falha ao enviar POST para /%s no Gertec %s: %s", page, terminal_ip, exc)

    # Aciona os possíveis endpoints de "Salvar e Sair" / Reboot do firmware G2 E / G2 S / TC502
    for save_endpoint in ["salvar", "save", "reboot", "reiniciar", "sair", "principal?salvar=1"]:
        try:
            sess.get(f"http://{terminal_ip}/{save_endpoint}", headers=headers, timeout=2.5)
        except Exception:
            pass

    if updated_sections:
        return (
            True,
            f"Configuração enviada para {', '.join(updated_sections)} do Gertec ({terminal_ip}) -> "
            f"Servidor {server_ip}:{server_port}. Caso o leitor não reinicie sozinho em 10s, clique em 'Salvar e Sair' no navegador.",
        )
    return (
        False,
        f"Painel web do Gertec ({terminal_ip}) acessado, mas os campos do formulário possuem nomes customizados. "
        f"No navegador do Gertec (aba Rede / Wifi), preencha IP do Servidor = {server_ip} e Porta = {server_port} e clique em 'Salvar e Sair'.",
    )


# ──────────────────────────────────────────────────────────────────────────────
# Protocolo Oficial Gertec Busca Preço (SC501: TC502 / TC505 / TC406 / BPG2 + SC504)
# ──────────────────────────────────────────────────────────────────────────────
PRODUCT_NAME_LINE_WIDTH = 20
PRODUCT_NAME_LINE_COUNT = 4
PRODUCT_NAME_MAX_LENGTH = PRODUCT_NAME_LINE_WIDTH * PRODUCT_NAME_LINE_COUNT  # 80 bytes
PRICE_MAX_LENGTH = 20

DISPLAY_FORMAT_OPTIONS: List[Tuple[str, str]] = [
    ("auto_tc502_compact", "Automático Universal (Detecta #tc502 vs #bpg2e/#bpg2s vs SC504)"),
    ("tc502_sc501_duplo", "Padrão TC Server SC501 (#NOME LIMPO|99,00 0,00 — Sem R$)"),
    ("g2_4lines_80", "Padrão Busca Preço G2 E / G2 S (#80 bytes 20x4|R$ 99,00)"),
    ("tc502_sc501_unico", "TC502 / G2 Preço Único Sem R$ (#NOME LIMPO|99,00)"),
    ("tc502_compact_rs_colado", "TC502 / G2 Com R$ Colado s/ Espaço (#NOME LIMPO|R$99,00)"),
    ("tc502_2lines_40", "TC502 2 Linhas 20x2 Blocadas (#40 bytes|99,00 0,00)"),
    ("sc501_ms_jar", "Formato Alternativo SC501 (#Ms:NOME|L:PRECO V:99,00)"),
]


def strip_accents(text: str) -> str:
    """Remove acentos e caracteres especiais que o display LCD/Gráfico ASCII do Gertec não exibe."""
    if not text:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(text))
    ascii_str = nfkd.encode("ASCII", "ignore").decode("ASCII")
    # Remove pipe '|' e '#' pois são delimitadores do protocolo entre Nome e Preço
    return ascii_str.replace("|", " ").replace("#", " ").upper()


def resolve_effective_display_mode(config_mode: str, terminal_model: str = "") -> str:
    """Determina o modo de formatação ideal com base na configuração e no modelo reportado pelo leitor."""
    mode = (config_mode or "auto_tc502_compact").strip().lower()
    valid_explicit = {
        "tc502_sc501_duplo",
        "tc502_sc501_unico",
        "tc502_compact_rs_colado",
        "tc502_2lines_40",
        "g2_4lines_80",
        "sc501_ms_jar",
    }
    if mode in valid_explicit:
        return mode

    model_low = (terminal_model or "").strip().lower()
    if "bpg2s" in model_low:
        return "g2_4lines_80"
    # Para #tc502|4.0, #bpg2e (4.5.0 S), #tc406, #tc505 ou padrão: usa o formato oficial TC Server (SC501 Simples: #NOME|99,00 0,00)
    return "tc502_sc501_duplo"


def format_gertec_product_name(
    nome: str,
    autor_ou_editora: str = "",
    display_mode: str = "tc502_sc501_duplo",
) -> str:
    """
    Formata o nome do produto respeitando rigorosamente o protocolo do terminal Gertec:
    - tc502_sc501_duplo / tc502_sc501_unico / tc502_compact_rs_colado / sc501_ms_jar:
      Envia a descrição limpa (até 80 caracteres, sem injetar dezenas de espaços em branco),
      permitindo que o próprio firmware do leitor quebre as linhas sem desconfigurar o texto.
    - tc502_2lines_40: 2 linhas blocadas de 20 colunas (40 bytes).
    - g2_4lines_80: 4 linhas blocadas de 20 colunas (80 bytes) para BPG2S.
    """
    clean_name = " ".join(strip_accents(nome or "PRODUTO").split())
    if not clean_name:
        clean_name = "PRODUTO"

    if display_mode in (
        "tc502_sc501_duplo",
        "tc502_sc501_unico",
        "tc502_compact_rs_colado",
        "sc501_ms_jar",
    ):
        return clean_name[:PRODUCT_NAME_MAX_LENGTH]

    if display_mode == "tc502_2lines_40":
        lines = textwrap.wrap(
            clean_name,
            width=PRODUCT_NAME_LINE_WIDTH,
            max_lines=2,
            placeholder="",
        )
        if not lines:
            lines = ["PRODUTO"]
        padded = [ln.ljust(PRODUCT_NAME_LINE_WIDTH)[:PRODUCT_NAME_LINE_WIDTH] for ln in lines]
        return "".join(padded).ljust(40)[:40]

    # Modo g2_4lines_80 (80 bytes = 4 linhas x 20 colunas)
    lines = textwrap.wrap(
        clean_name,
        width=PRODUCT_NAME_LINE_WIDTH,
        max_lines=PRODUCT_NAME_LINE_COUNT,
        placeholder="...",
    )
    if not lines:
        lines = ["PRODUTO"]

    if len(lines) < PRODUCT_NAME_LINE_COUNT and autor_ou_editora:
        clean_extra = " ".join(strip_accents(autor_ou_editora).split())[:PRODUCT_NAME_LINE_WIDTH]
        if clean_extra:
            while len(lines) < PRODUCT_NAME_LINE_COUNT - 1:
                lines.append("")
            lines.append(clean_extra)

    padded_lines = [line.ljust(PRODUCT_NAME_LINE_WIDTH)[:PRODUCT_NAME_LINE_WIDTH] for line in lines]
    return "".join(padded_lines).ljust(PRODUCT_NAME_MAX_LENGTH)[:PRODUCT_NAME_MAX_LENGTH]


def build_gertec_mesg(line1: str, line2: str, tempo: int = 5) -> bytes:
    """
    Comando #mesg para configurar as frases de espera no visor do Gertec G2 / G2S / TC502.
    Formato: #mesg + chr(len1+48) + l1 + chr(len2+48) + l2 + chr(tempo+48) + chr(48)
    """
    l1 = strip_accents(line1)[:20]
    l2 = strip_accents(line2)[:20]
    t = max(1, min(int(tempo or 5), 15))
    cmd = f"#mesg{chr(len(l1) + 48)}{l1}{chr(len(l2) + 48)}{l2}{chr(t + 48)}{chr(48)}"
    return cmd.encode("ascii", errors="replace")


def build_gertec_price_response(
    nome: str,
    preco: Optional[float],
    extra_info: str = "",
    saldo: Optional[int] = None,
    show_stock: bool = False,
    display_mode: str = "tc502_sc501_duplo",
) -> bytes:
    """
    Monta o pacote de resposta de preço do protocolo Gertec:
    - Padrão Oficial TC Server SC501 (Manual 2.1.1.21 / #tc502|4.0):
        #DESCRICAO|99,00 0,00  (SEM 'R$ ', pois o leitor já possui o cifrão fixo na tela e usa o espaço
        para separar Preço 1 e Preço 2; enviar 'R$ 99,00' fazia o leitor ler 'R$' como Preço 1 e ocultar o valor!)
    - Modo Preço Único Sem R$:
        #DESCRICAO|99,00
    - Modo R$ Colado:
        #DESCRICAO|R$99,00
    - Modo BPG2S 80 colunas:
        #<80 chars>|R$ 99,00
    """
    formatted_name = format_gertec_product_name(nome, extra_info, display_mode=display_mode)
    val_num = f"{preco:.2f}".replace(".", ",") if (preco is not None and preco > 0) else "0,00"

    if display_mode == "sc501_ms_jar":
        payload = f"#Ms:{formatted_name}|L:PRECO V:{val_num}"
        return payload.encode("ascii", errors="replace")

    if display_mode in ("tc502_sc501_duplo", "tc502_2lines_40"):
        price_str = f"{val_num} 0,00"
    elif display_mode == "tc502_sc501_unico":
        price_str = val_num
    elif display_mode == "tc502_compact_rs_colado":
        price_str = f"R${val_num}"
    else:
        # g2_4lines_80
        if preco is not None and preco > 0:
            price_str = f"R$ {val_num}"
            if show_stock and saldo is not None:
                candidate = f"{price_str} ({saldo} UN)"
                if len(candidate) <= PRICE_MAX_LENGTH:
                    price_str = candidate
        else:
            price_str = "CONSULTE O BALCAO"

    payload = f"#{formatted_name}|{price_str[:PRICE_MAX_LENGTH]}"
    return payload.encode("ascii", errors="replace")


# ──────────────────────────────────────────────────────────────────────────────
# Cliente HTTP para a API Cronuz B2B (Zero dependências externas — urllib nativo)
# ──────────────────────────────────────────────────────────────────────────────
class CronuzApiClient:
    def __init__(self, base_url: str, token: str = ""):
        self.base_url = base_url.strip().rstrip("/")
        self.token = token.strip()

    def _request(
        self,
        method: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        json_body: Optional[Dict[str, Any]] = None,
        timeout: float = 12.0,
    ) -> Tuple[int, Any]:
        url = f"{self.base_url}{path}"
        if params:
            query_string = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
            url = f"{url}?{query_string}"

        headers = {
            "Accept": "application/json",
            "User-Agent": f"CronuzGertecDesktop/{APP_VERSION}",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        data = None
        if json_body is not None:
            headers["Content-Type"] = "application/json; charset=utf-8"
            data = json.dumps(json_body).encode("utf-8")

        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                try:
                    return resp.status, json.loads(raw)
                except json.JSONDecodeError:
                    return resp.status, {"detail": raw}
        except urllib.error.HTTPError as e:
            raw = ""
            try:
                raw = e.read().decode("utf-8", errors="replace")
                parsed = json.loads(raw)
            except Exception:
                parsed = {"detail": raw or str(e)}
            return e.code, parsed
        except urllib.error.URLError as e:
            return 0, {"detail": f"Sem conexão com a API ({self.base_url}): {e.reason}"}
        except Exception as e:
            return 0, {"detail": f"Erro inesperado na requisição: {str(e)}"}

    def authenticate_terminal(
        self, email: str, password: str, company_id: Optional[int] = None
    ) -> Tuple[bool, Dict[str, Any]]:
        body: Dict[str, Any] = {"email": email, "password": password}
        if company_id:
            body["company_id"] = int(company_id)

        status_code, data = self._request("POST", "/product-search/terminal-auth", json_body=body, timeout=15.0)
        if status_code == 200 and isinstance(data, dict) and data.get("access_token"):
            self.token = data["access_token"]
            return True, data

        err_msg = data.get("detail") if isinstance(data, dict) else str(data)
        return False, {"error": err_msg or f"Falha de autenticação (HTTP {status_code})"}

    def check_terminal_status(self, test_horus: bool = True) -> Tuple[bool, Dict[str, Any]]:
        status_code, data = self._request(
            "GET",
            "/product-search/terminal-status",
            params={"test_horus": "true" if test_horus else "false"},
            timeout=20.0,
        )
        if status_code == 200 and isinstance(data, dict):
            return True, data
        if status_code == 401:
            return False, {
                "unauthorized": True,
                "error": "Sessão não autenticada ou expirada. Faça login na aba de Configuração.",
            }
        err_msg = data.get("detail") if isinstance(data, dict) else str(data)
        return False, {"error": err_msg or f"Erro ao validar configurações (HTTP {status_code})"}

    def _lookup_single_term(self, term: str) -> Tuple[int, Any]:
        return self._request(
            "GET",
            "/product-search/product",
            params={
                "term": term,
                "search_option": "BARRAS_ISBN",
                "source": "physical_scanner",
                "offset": 0,
                "limit": 5,
            },
            timeout=12.0,
        )

    def lookup_barcode(self, barcode: str) -> Dict[str, Any]:
        """
        Consulta o código de barras na API Cronuz (/product-search/product),
        normalizando automaticamente códigos de livros (ISBN-13 978/979, ISBN-10,
        suplementos de 2/5 dígitos e prefixos AIM) e consultando o Horus ERP do Seller.
        """
        primary_code, candidates, conv_note = normalize_book_and_ean_barcode(barcode)
        if not candidates:
            candidates = [barcode.strip()]

        last_status = 0
        last_data: Any = {}
        for cand in candidates:
            status_code, data = self._lookup_single_term(cand)
            last_status, last_data = status_code, data
            if status_code == 200 and isinstance(data, dict):
                items = data.get("items") or []
                if len(items) > 0:
                    first = items[0]
                    nome = first.get("NOM_ITEM") or "PRODUTO SEM NOME"
                    raw_price = first.get("VLR_CAPA") or first.get("PRECO_VENDA") or 0
                    preco = None
                    try:
                        if isinstance(raw_price, str):
                            preco = float(
                                raw_price.replace(".", "").replace(",", ".")
                                if "," in raw_price and "." in raw_price
                                else raw_price.replace(",", ".")
                            )
                        else:
                            preco = float(raw_price)
                    except Exception:
                        preco = None

                    saldo = first.get("SALDO_DISPONIVEL")
                    if saldo is None:
                        saldo = first.get("QTD_SALDO_DISP")
                    try:
                        saldo = int(float(saldo)) if saldo is not None else None
                    except Exception:
                        saldo = None

                    editora = first.get("NOM_EDITORA") or first.get("DES_AUTOR") or ""
                    isbn = first.get("COD_BARRA_ITEM") or first.get("BARRAS_ISBN") or cand
                    return {
                        "found": True,
                        "barcode": str(isbn),
                        "nome": str(nome),
                        "preco": preco,
                        "saldo": saldo,
                        "extra": str(editora),
                        "cod_item": first.get("COD_ITEM"),
                        "conversion_note": conv_note,
                        "error": None,
                    }

        if last_status == 200:
            return {"found": False, "barcode": primary_code, "conversion_note": conv_note, "error": None}

        if last_status == 400 and isinstance(last_data, dict):
            detail = str(last_data.get("detail") or "")
            if "nenhum" in detail.lower() or "não encontrado" in detail.lower() or "nao encontrado" in detail.lower():
                return {"found": False, "barcode": primary_code, "conversion_note": conv_note, "error": None}
            return {"found": False, "barcode": primary_code, "conversion_note": conv_note, "error": detail}

        err_msg = last_data.get("detail") if isinstance(last_data, dict) else str(last_data)
        return {
            "found": False,
            "barcode": primary_code,
            "conversion_note": conv_note,
            "error": err_msg or f"Erro HTTP {last_status}",
        }


def convert_isbn10_to_isbn13(isbn10: str) -> str:
    """
    Converte um código ISBN-10 (9 dígitos + dígito verificador numérico ou 'X')
    enviado por leitores com 'Convert Bookland EAN to ISBN-10' ativo para o
    padrão ISBN-13 / Bookland EAN (iniciado em 978 + dígito verificador EAN-13).
    """
    clean = re.sub(r"[^0-9Xx]", "", isbn10 or "").upper()
    if len(clean) != 10 or not clean[:9].isdigit():
        return isbn10
    base12 = "978" + clean[:9]
    total = sum(int(ch) * (1 if idx % 2 == 0 else 3) for idx, ch in enumerate(base12))
    check = (10 - (total % 10)) % 10
    return f"{base12}{check}"


def normalize_book_and_ean_barcode(raw_barcode: str) -> Tuple[str, List[str], Optional[str]]:
    """
    Normaliza qualquer código recebido do leitor físico Gertec G2 / G2E:
    - Remove '#', quebras de linha, nulos, espaços, traços e prefixos AIM (ex: ]E0, ]E3, ]C1).
    - Se o leitor enviou ISBN-13 com suplemento/add-on de 2 ou 5 dígitos (15 ou 18 dígitos iniciados por 978/979),
      extrai automaticamente o ISBN-13 principal de 13 dígitos.
    - Se o leitor converteu o livro para ISBN-10 (10 caracteres, ex: 8535914846 ou 853591484X),
      converte automaticamente para ISBN-13 (978...).
    Retorna: (codigo_principal, lista_de_candidatos_para_busca, nota_de_conversao)
    """
    s = (raw_barcode or "").strip("\x00\r\n\t ")
    while s.startswith("#"):
        s = s[1:].strip()
    # Remove prefixos AIM de simbologia (ex: ]E0, ]E3, ]C0)
    s = re.sub(r"^\][A-Za-z][0-9]", "", s).strip()
    # Remove hifens ou espaços internos (ex: 978-85-359-1484-9 ou suplemento separado por espaço)
    compact = re.sub(r"[\s\-]+", "", s)

    candidates: List[str] = []
    note: Optional[str] = None

    # Caso 1: Livro lido com código suplementar (Add-on de 2 ou 5 dígitos -> 15 ou 18 dígitos começando com 978/979)
    digits_only = "".join(ch for ch in compact if ch.isdigit())
    if len(digits_only) in (15, 18) and digits_only.startswith(("978", "979")):
        isbn13 = digits_only[:13]
        addon = digits_only[13:]
        candidates.append(isbn13)
        candidates.append(digits_only)
        note = f"ISBN+{len(addon)}d Add-on ➔ {isbn13}"
        return isbn13, candidates, note

    # Caso 2: Leitor configurado para converter Bookland EAN (978) em ISBN-10 (10 caracteres: 9 dígitos + 0-9/X)
    alnum_upper = re.sub(r"[^0-9Xx]", "", compact).upper()
    if len(alnum_upper) == 10 and alnum_upper[:9].isdigit():
        isbn13 = convert_isbn10_to_isbn13(alnum_upper)
        candidates.append(isbn13)
        candidates.append(alnum_upper)
        note = f"ISBN-10 ({alnum_upper}) ➔ {isbn13}"
        return isbn13, candidates, note

    # Caso 3: EAN-13 / ISBN-13 padrão ou código com caracteres extras ao redor
    if len(digits_only) == 13:
        candidates.append(digits_only)
        if compact != digits_only:
            candidates.append(compact)
        return digits_only, candidates, None

    # Caso 4: UPC-A (12 dígitos) -> testa 12 dígitos e também 13 dígitos com zero à esquerda
    if len(digits_only) == 12:
        candidates.append(digits_only)
        candidates.append("0" + digits_only)
        return digits_only, candidates, None

    primary = digits_only if digits_only else compact
    if primary:
        candidates.append(primary)
    if compact and compact not in candidates:
        candidates.append(compact)
    return primary, candidates, None


def svg_ean13(digits13: str, width: int = 285, height: int = 110) -> str:
    """Gera um código de barras EAN-13 / ISBN-13 vetorial (SVG) de alta precisão."""
    L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"]
    G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"]
    R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"]
    PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"]

    d = "".join(ch for ch in str(digits13) if ch.isdigit())[:12].ljust(12, "0")
    chk = (10 - (sum(int(ch) * (1 if i % 2 == 0 else 3) for i, ch in enumerate(d)) % 10)) % 10
    full = d + str(chk)

    first = int(full[0])
    left_6 = full[1:7]
    right_6 = full[7:13]
    p_str = PARITY[first]

    bits = "00000000000" + "101"
    for i, ch in enumerate(left_6):
        bits += (L[int(ch)] if p_str[i] == "L" else G[int(ch)])
    bits += "01010"
    for ch in right_6:
        bits += R[int(ch)]
    bits += "101" + "00000000000"

    mod_w = width / len(bits)
    bars = []
    for idx, b in enumerate(bits):
        if b == "1":
            x = idx * mod_w
            bars.append(f'<rect x="{x:.2f}" y="8" width="{mod_w + 0.15:.2f}" height="{height - 32}" fill="#000000"/>')

    formatted_txt = f"{full[0]}  {full[1:7]}  {full[7:13]}"
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" '
        f'style="background:#ffffff;padding:6px;border-radius:6px;">'
        f'<rect width="100%" height="100%" fill="#ffffff"/>'
        f'{"".join(bars)}'
        f'<text x="{width / 2:.1f}" y="{height - 6}" text-anchor="middle" font-family="Consolas, monospace" '
        f'font-size="15" font-weight="bold" fill="#000000">{formatted_txt}</text>'
        f"</svg>"
    )


def svg_ean13_with_addon5(digits13: str, addon5: str = "52499", width: int = 360, height: int = 110) -> str:
    """
    Gera um código de barras Bookland EAN-13 (978...) + Suplemento Add-on de 5 dígitos (EAN-5) oficial GS1.
    Permite testar instantaneamente se o leitor físico está exigindo Add-on de 5 dígitos para livros (Item 2).
    """
    L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"]
    G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"]
    R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"]
    PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"]
    ADDON5_PARITY = ["GGLLL", "GLGLL", "GLLGL", "GLLLG", "LGGLL", "LLGGL", "LLLGG", "LGLGL", "LGLLG", "LLGLG"]

    d = "".join(ch for ch in str(digits13) if ch.isdigit())[:12].ljust(12, "0")
    chk = (10 - (sum(int(ch) * (1 if i % 2 == 0 else 3) for i, ch in enumerate(d)) % 10)) % 10
    full = d + str(chk)

    first = int(full[0])
    left_6 = full[1:7]
    right_6 = full[7:13]
    p_str = PARITY[first]

    bits_main = "00000000000" + "101"
    for i, ch in enumerate(left_6):
        bits_main += (L[int(ch)] if p_str[i] == "L" else G[int(ch)])
    bits_main += "01010"
    for ch in right_6:
        bits_main += R[int(ch)]
    bits_main += "101"

    a5 = "".join(ch for ch in str(addon5) if ch.isdigit())[:5].ljust(5, "0")
    v = (3 * (int(a5[0]) + int(a5[2]) + int(a5[4])) + 9 * (int(a5[1]) + int(a5[3]))) % 10
    a5_p = ADDON5_PARITY[v]
    bits_addon = "1011"
    for i, ch in enumerate(a5):
        if i > 0:
            bits_addon += "01"
        bits_addon += (L[int(ch)] if a5_p[i] == "L" else G[int(ch)])

    total_bits = bits_main + "000000000" + bits_addon + "00000000000"
    mod_w = width / len(total_bits)
    bars = []
    main_end_idx = len(bits_main)
    for idx, b in enumerate(total_bits):
        if b == "1":
            x = idx * mod_w
            y = 8 if idx < main_end_idx else 20
            h = (height - 32) if idx < main_end_idx else (height - 44)
            bars.append(f'<rect x="{x:.2f}" y="{y}" width="{mod_w + 0.15:.2f}" height="{h}" fill="#000000"/>')

    formatted_txt = f"{full[0]} {full[1:7]} {full[7:13]}   +{a5}"
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" '
        f'style="background:#ffffff;padding:6px;border-radius:6px;">'
        f'<rect width="100%" height="100%" fill="#ffffff"/>'
        f'{"".join(bars)}'
        f'<text x="{width / 2:.1f}" y="{height - 6}" text-anchor="middle" font-family="Consolas, monospace" '
        f'font-size="14" font-weight="bold" fill="#000000">{formatted_txt}</text>'
        f"</svg>"
    )


def svg_code39(text: str, width: int = 280, height: int = 92) -> str:
    """Gera um código de barras Code-39 vetorial (SVG) para programação de leitores Zebex / CCD."""
    C39 = {
        "0": "101001101101", "1": "110100101011", "2": "101100101011", "3": "110110010101",
        "4": "101001101011", "5": "110100110101", "6": "101100110101", "7": "101001011011",
        "8": "110100101101", "9": "101100101101", "A": "110101001011", "B": "101101001011",
        "C": "110110100101", "D": "101011001011", "E": "110101100101", "F": "101101100101",
        "G": "101010011011", "H": "110101001101", "I": "101101001101", "J": "101011001101",
        "K": "110101010011", "L": "101101010011", "M": "110110101001", "N": "101011010011",
        "O": "110101101001", "P": "101101101001", "Q": "101010110011", "R": "110101011001",
        "S": "101101011001", "T": "101011011001", "U": "110010101011", "V": "100110101011",
        "W": "110011010101", "X": "100101101011", "Y": "110010110101", "Z": "100110110101",
        "-": "100101011011", ".": "110010101101", " ": "100110101101", "$": "100100100101",
        "/": "100100101001", "+": "100101001001", "%": "101001001001", "*": "100101101101",
    }
    full = f"*{text.upper()}*"
    bits = "0000000000" + "0".join(C39.get(ch, C39[" "]) for ch in full) + "0000000000"
    mod_w = width / len(bits)
    bars = []
    for idx, b in enumerate(bits):
        if b == "1":
            x = idx * mod_w
            bars.append(f'<rect x="{x:.2f}" y="8" width="{mod_w + 0.15:.2f}" height="{height - 30}" fill="#000000"/>')
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" '
        f'style="background:#ffffff;padding:6px;border-radius:6px;">'
        f'<rect width="100%" height="100%" fill="#ffffff"/>'
        f'{"".join(bars)}'
        f'<text x="{width / 2:.1f}" y="{height - 5}" text-anchor="middle" font-family="Consolas, monospace" '
        f'font-size="13" font-weight="bold" fill="#000000">*{text.upper()}*</text>'
        f"</svg>"
    )


def svg_code128b(text: str, width: int = 320, height: int = 96) -> str:
    """Gera um código de barras Code-128B vetorial (SVG) padrão ISO/IEC 15417 para configuração de leitores."""
    PATTERNS = [
        "11011001100", "11001101100", "11001100110", "10010011000", "10010001100", "10001001100",
        "10011001000", "10011000100", "10001100100", "11001001000", "11001000100", "11000100100",
        "10110011100", "10011011100", "10011001110", "10111001100", "10011101100", "10011100110",
        "11001110010", "11001011100", "11001001110", "11011100100", "11001110100", "11101101110",
        "11101001100", "11100101100", "11100100110", "11101100100", "11100110100", "11100110010",
        "11011011000", "11011000110", "11000110110", "10100011000", "10001011000", "10001000110",
        "10110001000", "10001101000", "10001100010", "11010001000", "11000101000", "11000100010",
        "10110111000", "10110001110", "10001101110", "10111011000", "10111000110", "10001110110",
        "11101110110", "11010001110", "11000101110", "11011101000", "11011100010", "11011101110",
        "11101011000", "11101000110", "11100010110", "11101101000", "11101100010", "11100011010",
        "11101111010", "11001000010", "11110001010", "10100110000", "10100001100", "10010110000",
        "10010000110", "10000101100", "10000100110", "10110010000", "10110000100", "10011010000",
        "10011000010", "10000110100", "10000110010", "11000010010", "11001010000", "11110111010",
        "11000010100", "10001111010", "10100111100", "10010111100", "10010011110", "10111100100",
        "10011110100", "10011110010", "11110100100", "11110010100", "11110010010", "11011011110",
        "11011110110", "11110110110", "10101111000", "10100011110", "10001011110", "10111101000",
        "10111100010", "11110101000", "11110100010", "10111011110", "10111101110", "11101011110",
        "11110101110", "11010000100", "11010010000", "11010011100", "1100011101011",
    ]
    codes = [104]  # Start Code B
    checksum = 104
    for idx, ch in enumerate(text, start=1):
        val = max(0, min(94, ord(ch) - 32))
        codes.append(val)
        checksum += val * idx
    codes.append(checksum % 103)
    codes.append(106)  # Stop

    bits = "00000000000" + "".join(PATTERNS[c] for c in codes) + "00000000000"
    mod_w = width / len(bits)
    bars = []
    for idx, b in enumerate(bits):
        if b == "1":
            x = idx * mod_w
            bars.append(f'<rect x="{x:.2f}" y="8" width="{mod_w + 0.15:.2f}" height="{height - 30}" fill="#000000"/>')

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" '
        f'style="background:#ffffff;padding:6px;border-radius:6px;">'
        f'<rect width="100%" height="100%" fill="#ffffff"/>'
        f'{"".join(bars)}'
        f'<text x="{width / 2:.1f}" y="{height - 5}" text-anchor="middle" font-family="Consolas, monospace" '
        f'font-size="13" font-weight="bold" fill="#000000">{text}</text>'
        f"</svg>"
    )


def generate_isbn_unlock_and_test_sheet_html(terminal_ip: str = "192.168.15.10") -> Path:
    """
    Gera uma Folha Técnica de Diagnóstico & Destravamento de Leitura de Livros (ISBN 978/979)
    com códigos de barras vetoriais de alta precisão (pode ser impressa em papel fosco ou lida na tela).
    """
    sheet_path = BASE_DIR / "FOLHA_DESTRAVAR_LIVROS_ISBN_GERTEC_G2.html"
    ean_retail_svg = svg_ean13("7891000100103")
    isbn_book_svg = svg_ean13("9788535914849")
    isbn_book_addon5_svg = svg_ean13_with_addon5("9788535914849", "52499")

    # 1. Família Newland OEM (NLS)
    nl_enter = svg_code128b("NLS0006010")
    nl_isbn_as_ean13 = svg_code128b("NLS0405000")
    nl_isbn_on = svg_code128b("NLS0405010")
    nl_addon_off = svg_code128b("NLS0402000")
    nl_exit = svg_code128b("NLS0006000")

    # 2. Família Zebex OEM (Z-5130 / Z-3000 CCD)
    zb_start = svg_code39("+$+")
    zb_isbn_off = svg_code39("RD11")
    zb_addon_off = svg_code39("RD04")
    zb_end = svg_code39("+$-")

    # 3. Família Honeywell / Metrologic OEM
    hw_978_addon_off = svg_code128b("978REQ0.")
    hw_isbn_as_ean13 = svg_code128b("ISRENA0.")

    html = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>Horus / Cronuz Busca Preço — Diagnóstico e Destravamento de Livros (ISBN 978/979) no Gertec G2</title>
<style>
  body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #f8fafc; color: #0f172a; margin: 20px; }}
  .container {{ max-width: 1020px; margin: 0 auto; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; padding: 24px 32px; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }}
  h1 {{ margin-top: 0; color: #1e293b; font-size: 21px; }}
  h2 {{ color: #1e40af; font-size: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-top: 24px; }}
  .btn-print {{ background: #2563eb; color: #fff; border: none; padding: 10px 18px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 14px; text-decoration: none; display: inline-block; margin-right: 10px; }}
  .btn-web {{ background: #059669; color: #fff; border: none; padding: 10px 18px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 14px; text-decoration: none; display: inline-block; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-top: 12px; }}
  .card {{ border: 2px dashed #94a3b8; border-radius: 10px; padding: 14px; text-align: center; background: #ffffff; page-break-inside: avoid; }}
  .card h3 {{ margin: 0 0 8px 0; font-size: 13px; color: #0f172a; }}
  .card p {{ margin: 6px 0 0 0; font-size: 11.5px; color: #475569; }}
  .alert {{ background: #fffbeb; border-left: 5px solid #f59e0b; padding: 12px 16px; border-radius: 6px; font-size: 13px; line-height: 1.5; margin: 14px 0; }}
  .success {{ background: #f0fdf4; border-left: 5px solid #16a34a; padding: 12px 16px; border-radius: 6px; font-size: 13px; line-height: 1.5; margin: 14px 0; }}
  @media print {{ .no-print {{ display: none !important; }} body {{ background: #fff; margin: 0; }} .container {{ border: none; box-shadow: none; padding: 0; }} }}
</style>
</head>
<body>
<div class="container">
  <div class="no-print" style="margin-bottom:18px;">
    <button class="btn-print" onclick="window.print()">🖨️ IMPRIMIR ESTA FOLHA EM PAPEL SULFITE (RECOMENDADO PARA LEITOR 1D LED VERMELHO)</button>
    <a class="btn-web" href="http://{terminal_ip}" target="_blank">🌐 ABRIR PAINEL WEB DO GERTEC ({terminal_ip} — Login: admin / admin)</a>
  </div>

  <h1>📚 Horus / Cronuz Busca Preço — Diagnóstico dos 4 Cenários & Destravamento de Livros (ISBN 978 / 979)</h1>
  <p style="font-size:13px;color:#475569;">
    Use o <b>Passo 1</b> abaixo para descobrir exatamente qual dos 4 cenários está ocorrendo no seu <b>Gertec Busca Preço G2E ({terminal_ip})</b> quando você passa um livro:
  </p>

  <h2>PASSO 1 — Os 3 Códigos de Diagnóstico Definitivo (Imprima em Papel Comum e Passe no Gertec)</h2>
  <div class="alert">
    <b>⚠️ DICA IMPORTANTE:</b> Leitores 1D de luz vermelha (CCD) não conseguem ler a tela do monitor por causa do vidro. <b>Imprima esta página em papel sulfite</b> e passe os 3 códigos abaixo no Gertec:
  </div>

  <div class="grid">
    <div class="card">
      <h3>TESTE 1A — Varejo Normal (Prefixo 789)</h3>
      {ean_retail_svg}
      <p>Simula o produto de limpeza (<code>7891000100103</code>).</p>
    </div>
    <div class="card">
      <h3>TESTE 1B — Livro Nacional SEM Suplemento (978)</h3>
      {isbn_book_svg}
      <p>Livro de 13 dígitos puro (<code>9788535914849</code>).</p>
    </div>
    <div class="card">
      <h3>TESTE 1C — Livro COM Suplemento de 5 Dígitos (978 + 52499)</h3>
      {isbn_book_addon5_svg}
      <p>Livro <code>9788535914849</code> + Add-on <code>52499</code> ao lado.</p>
    </div>
  </div>

  <div class="success">
    <b>🎯 Qual foi o resultado no seu leitor ao passar 1A, 1B e 1C no papel impresso?</b><br/><br/>
    <b>• Caso 1 — Apitou no 1A (789), NÃO apitou no 1B (978 sozinho), mas APITOU no 1C (978 + 52499):</b><br/>
    👉 Confirmado <b>Item 2 da sua pesquisa</b>: O leitor óptico está programado com a regra <i>"Require Add-on / Exigir suplemento de 5 dígitos para livros 978"</i>. Como os livros brasileiros não têm o código menor de 5 dígitos ao lado, ele ignora o 1B e lê o 1C! Passe os códigos do <b>Passo 2</b> abaixo para desativar o suplemento obrigatório.<br/><br/>
    <b>• Caso 2 — Apitou no 1A (789), mas NÃO apitou nem no 1B nem no 1C:</b><br/>
    👉 Confirmado <b>Item 1 da sua pesquisa</b>: O filtro interno <i>Bookland EAN / ISBN (978/979)</i> está desativado ou bloqueado no leitor óptico. Passe os códigos do <b>Passo 2</b> abaixo para fazer o leitor tratar todo código <code>978</code> como <code>EAN-13</code> comum!<br/><br/>
    <b>• Caso 3 — Apitou normalmente no 1B (<code>9788535914849</code>) na folha impressa, mas não apita no livro físico:</b><br/>
    👉 Confirmado <b>Item 3 da sua pesquisa</b>: O leitor <b>NÃO tem bloqueio de 978</b>! O problema é puramente o <b>reflexo do LED vermelho na capa laminada/plastificada do livro</b> (ou baixo contraste do fundo da etiqueta do livro). Afaste o livro para <b>10 a 15 cm</b> e incline a capa em <b>30° a 45°</b>.<br/><br/>
    <b>• Caso 4 — O leitor APITA no livro, mas o visor dá "Produto Não Encontrado":</b><br/>
    👉 Confirmado <b>Item 4 da sua pesquisa</b>: O leitor leu fisicamente e enviou ao servidor! E o nosso servidor <b>Horus / Cronuz v1.1.0</b> já converte automaticamente <code>ISBN-10</code> para <code>978...</code> e remove suplementos de 2/5 dígitos. Basta olhar na tabela <i>"Histórico de Consultas em Tempo Real"</i> do aplicativo qual número chegou!
  </div>

  <h2>PASSO 2A — Destravar Leitor Interno (Módulo OEM Newland / NLS — Passar na ordem 1 a 4)</h2>
  <div class="grid">
    <div class="card">
      <h3>1. Entrar em Configuração</h3>
      {nl_enter}
      <p>Enter Setup (NLS0006010)</p>
    </div>
    <div class="card">
      <h3>2A. Ler 978 como EAN-13 Comum</h3>
      {nl_isbn_as_ean13}
      <p>Trata 978 igual a 789 (NLS0405000)</p>
    </div>
    <div class="card">
      <h3>2B. Ou Ativar ISBN-13 Nativo</h3>
      {nl_isbn_on}
      <p>Enable ISBN (NLS0405010)</p>
    </div>
    <div class="card">
      <h3>3. Desativar Suplemento Obrigatório</h3>
      {nl_addon_off}
      <p>No Add-on Required (NLS0402000)</p>
    </div>
    <div class="card">
      <h3>4. Salvar e Sair</h3>
      {nl_exit}
      <p>Exit Setup (NLS0006000)</p>
    </div>
  </div>

  <h2>PASSO 2B — Destravar Leitor Interno (Módulo OEM Zebex CCD — Passar na ordem 1 a 4)</h2>
  <div class="grid">
    <div class="card">
      <h3>1. Iniciar Programação Zebex</h3>
      {zb_start}
      <p>Start of Configuration (+$+)</p>
    </div>
    <div class="card">
      <h3>2. Ler 978 como EAN-13 Puro</h3>
      {zb_isbn_off}
      <p>Disable ISBN Conversion (RD11)</p>
    </div>
    <div class="card">
      <h3>3. Desativar Suplemento (Add-on Off)</h3>
      {zb_addon_off}
      <p>Disable Addendum (RD04)</p>
    </div>
    <div class="card">
      <h3>4. Salvar Programação Zebex</h3>
      {zb_end}
      <p>End of Configuration (+$-)</p>
    </div>
  </div>

  <h2>PASSO 2C — Destravar Leitor Interno (Módulo OEM Honeywell / Metrologic)</h2>
  <div class="grid">
    <div class="card">
      <h3>1. Desativar Exigência de Add-on 978</h3>
      {hw_978_addon_off}
      <p>978 Add-on Not Required (978REQ0.)</p>
    </div>
    <div class="card">
      <h3>2. Ler 978 como EAN-13 Puro</h3>
      {hw_isbn_as_ean13}
      <p>Treat 978 as Standard EAN-13 (ISRENA0.)</p>
    </div>
  </div>
</div>
</body>
</html>
"""
    sheet_path.write_text(html, encoding="utf-8")
    return sheet_path


def generate_thermal_80mm_isbn_sheet_html(terminal_ip: str = "192.168.15.10") -> Path:
    """
    Gera um arquivo formatado especificamente para Impressora Térmica de Cupom (Bobina 80mm / 58mm)
    com largura útil de 68mm (245px), margens de silêncio seguras (Quiet Zone) e linhas de dobra/corte
    entre cada código de barras para leitura perfeita no leitor 1D CCD do Gertec Busca Preço G2.
    """
    thermal_path = BASE_DIR / "CUPOM_TERMICO_80MM_TESTE_LIVROS_GERTEC.html"

    # Largura 240px (~63mm) garante Quiet Zone branca perfeita nas bordas da bobina de 80mm (72mm área útil)
    t_ean_retail = svg_ean13("7891000100103", width=240, height=100)
    t_isbn_book = svg_ean13("9788535914849", width=240, height=100)
    t_isbn_addon5 = svg_ean13_with_addon5("9788535914849", "52499", width=256, height=100)

    # Newland OEM (Code-128B dimensionado para bobina 80mm)
    t_nl_enter = svg_code128b("NLS0006010", width=245, height=88)
    t_nl_ean13 = svg_code128b("NLS0405000", width=245, height=88)
    t_nl_isbn = svg_code128b("NLS0405010", width=245, height=88)
    t_nl_addon_off = svg_code128b("NLS0402000", width=245, height=88)
    t_nl_exit = svg_code128b("NLS0006000", width=245, height=88)

    # Zebex OEM (Code-39 dimensionado para bobina 80mm)
    t_zb_start = svg_code39("+$+", width=235, height=85)
    t_zb_isbn_off = svg_code39("RD11", width=235, height=85)
    t_zb_addon_off = svg_code39("RD04", width=235, height=85)
    t_zb_end = svg_code39("+$-", width=235, height=85)

    # Honeywell / Metrologic OEM
    t_hw_addon_off = svg_code128b("978REQ0.", width=245, height=88)
    t_hw_isbn_ean = svg_code128b("ISRENA0.", width=245, height=88)

    html = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>Cupom Térmico 80mm — Teste e Destravamento Livros (ISBN 978) Gertec G2</title>
<style>
  @page {{
    size: 80mm auto;
    margin: 0mm;
  }}
  * {{
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }}
  body {{
    font-family: 'Consolas', 'Courier New', monospace;
    background: #e2e8f0;
    color: #000000;
    margin: 0;
    padding: 16px 0;
  }}
  .toolbar {{
    max-width: 420px;
    margin: 0 auto 14px auto;
    background: #1e293b;
    color: #ffffff;
    padding: 14px;
    border-radius: 10px;
    text-align: center;
    font-family: 'Segoe UI', Arial, sans-serif;
  }}
  .btn-print {{
    background: #10b981;
    color: #0f172a;
    border: none;
    padding: 12px 20px;
    border-radius: 8px;
    font-weight: 900;
    font-size: 14px;
    cursor: pointer;
    width: 100%;
  }}
  .roll {{
    width: 72mm;
    max-width: 72mm;
    margin: 0 auto;
    background: #ffffff;
    padding: 3mm 2mm;
    box-shadow: 0 4px 14px rgba(0,0,0,0.15);
  }}
  .hdr {{
    text-align: center;
    border-bottom: 2px solid #000;
    padding-bottom: 6px;
    margin-bottom: 8px;
  }}
  .hdr h1 {{
    font-size: 13px;
    margin: 0;
    font-weight: 900;
  }}
  .hdr p {{
    font-size: 10px;
    margin: 3px 0 0 0;
  }}
  .sec-title {{
    background: #000000;
    color: #ffffff;
    font-size: 11px;
    font-weight: 900;
    text-align: center;
    padding: 4px 2px;
    margin: 10px 0 6px 0;
  }}
  .item {{
    text-align: center;
    padding: 8px 0 12px 0;
    page-break-inside: avoid;
  }}
  .item-title {{
    font-size: 11px;
    font-weight: 900;
    margin-bottom: 4px;
  }}
  .item-sub {{
    font-size: 9.5px;
    margin-top: 2px;
  }}
  .cut {{
    border-top: 1px dashed #000000;
    text-align: center;
    font-size: 9px;
    margin: 10px 0;
    padding-top: 3px;
  }}
  @media print {{
    body {{
      background: #ffffff;
      padding: 0;
      margin: 0;
    }}
    .no-print {{
      display: none !important;
    }}
    .roll {{
      width: 72mm;
      max-width: 72mm;
      margin: 0;
      padding: 1mm 1mm;
      box-shadow: none;
    }}
  }}
</style>
</head>
<body>

<div class="toolbar no-print">
  <div style="font-size:13px;margin-bottom:8px;">
    🧾 <b>Formato Bobina Térmica 80mm</b> (Pronto para Impressora de Cupom)<br/>
    <span style="font-size:11px;color:#cbd5e1;">Dica: Ao passar na frente do Gertec G2, dobre a fita no pontilhado para apresentar 1 código por vez.</span>
  </div>
  <button class="btn-print" onclick="window.print()">🖨️ IMPRIMIR AGORA NA IMPRESSORA TÉRMICA</button>
</div>

<div class="roll">
  <div class="hdr">
    <h1>HORUS / CRONUZ BUSCA PRECO</h1>
    <p>TESTE E DESTRAVAMENTO LIVROS (978)<br/>GERTEC G2 ({terminal_ip})</p>
  </div>

  <div class="sec-title">PASSO 1: TESTE DOS 3 CENARIOS</div>

  <div class="item">
    <div class="item-title">1A. PRODUTO VAREJO (789)</div>
    {t_ean_retail}
    <div class="item-sub">Deve bipar normal (7891000100103)</div>
  </div>

  <div class="cut">✂ - - - DOBRE AQUI PARA LER - - -</div>

  <div class="item">
    <div class="item-title">1B. LIVRO SEM SUPLEMENTO (978)</div>
    {t_isbn_book}
    <div class="item-sub">Livro 13 digitos (9788535914849)<br/>Se bipar aqui, falha no livro = reflexo capa!</div>
  </div>

  <div class="cut">✂ - - - DOBRE AQUI PARA LER - - -</div>

  <div class="item">
    <div class="item-title">1C. LIVRO COM SUPLEMENTO (+52499)</div>
    {t_isbn_addon5}
    <div class="item-sub">Se NAO bipou no 1B e BIPOU no 1C:<br/>Leitor exige Add-on de 5 digitos!</div>
  </div>

  <div class="sec-title">PASSO 2A: DESTRAVAR (NEWLAND)</div>

  <div class="item">
    <div class="item-title">1/5 - ENTRAR EM CONFIGURACAO</div>
    {t_nl_enter}
  </div>
  <div class="cut">✂ - - - DOBRE AQUI - - -</div>

  <div class="item">
    <div class="item-title">2/5 - LER 978 COMO EAN-13 COMUM</div>
    {t_nl_ean13}
  </div>
  <div class="cut">✂ - - - DOBRE AQUI - - -</div>

  <div class="item">
    <div class="item-title">3/5 - HABILITAR ISBN-13</div>
    {t_nl_isbn}
  </div>
  <div class="cut">✂ - - - DOBRE AQUI - - -</div>

  <div class="item">
    <div class="item-title">4/5 - DESATIVAR SUPLEMENTO ADD-ON</div>
    {t_nl_addon_off}
  </div>
  <div class="cut">✂ - - - DOBRE AQUI - - -</div>

  <div class="item">
    <div class="item-title">5/5 - SALVAR E SAIR</div>
    {t_nl_exit}
  </div>

  <div class="sec-title">PASSO 2B: DESTRAVAR (ZEBEX CCD)</div>

  <div class="item">
    <div class="item-title">1/4 - INICIAR PROGRAMACAO (+$+)</div>
    {t_zb_start}
  </div>
  <div class="cut">✂ - - - DOBRE AQUI - - -</div>

  <div class="item">
    <div class="item-title">2/4 - LER 978 COMO EAN-13 (RD11)</div>
    {t_zb_isbn_off}
  </div>
  <div class="cut">✂ - - - DOBRE AQUI - - -</div>

  <div class="item">
    <div class="item-title">3/4 - DESATIVAR ADD-ON (RD04)</div>
    {t_zb_addon_off}
  </div>
  <div class="cut">✂ - - - DOBRE AQUI - - -</div>

  <div class="item">
    <div class="item-title">4/4 - SALVAR ZEBEX (+$-)</div>
    {t_zb_end}
  </div>

  <div class="sec-title">PASSO 2C: HONEYWELL / METROLOGIC</div>

  <div class="item">
    <div class="item-title">1/2 - DESATIVAR ADD-ON 978</div>
    {t_hw_addon_off}
  </div>
  <div class="cut">✂ - - - DOBRE AQUI - - -</div>

  <div class="item">
    <div class="item-title">2/2 - LER 978 COMO EAN-13 PURO</div>
    {t_hw_isbn_ean}
  </div>

  <div class="cut">================================</div>
</div>
</body>
</html>
"""
    thermal_path.write_text(html, encoding="utf-8")
    return thermal_path


# ──────────────────────────────────────────────────────────────────────────────
# Servidor Socket TCP/IP Assíncrono Universal para TODAS as versões da Gertec
#  - Porta 6500 (Protocolo SC501 ASCII): Busca Preço G2 / G2S / G2E (4.0, 4.5.0 S), TC502, TC505, TC507, TC406, TC300
#  - Porta 16510 (Protocolo SC504 Binário STX=0x02): TC504, TC506 Mídia, TC508, GB-600/601, G-BOT / G-BOT2
# ──────────────────────────────────────────────────────────────────────────────
class GertecTcpServerThread(threading.Thread):
    def __init__(self, config_getter, event_queue: queue.Queue):
        super().__init__(daemon=True, name="GertecTcpServerThread")
        self.config_getter = config_getter
        self.event_queue = event_queue
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.server: Optional[asyncio.AbstractServer] = None
        self.server_sc504: Optional[asyncio.AbstractServer] = None
        self.running = False
        self.connected_terminals: Dict[str, Dict[str, Any]] = {}
        self.cache: Dict[str, Dict[str, Any]] = {}  # barcode -> {data, ts}

    def emit(self, event_type: str, payload: Dict[str, Any]) -> None:
        self.event_queue.put({"type": event_type, "payload": payload, "ts": datetime.now().strftime("%H:%M:%S")})

    def run(self) -> None:
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        try:
            self.loop.run_until_complete(self._serve())
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            self.emit("server_error", {"error": str(exc)})
        finally:
            self.running = False
            self.emit("server_stopped", {})

    async def _serve(self) -> None:
        cfg = self.config_getter()
        port = int(cfg.get("tcp_port") or 6500)
        sc504_port = int(cfg.get("sc504_port") or 16510)
        try:
            self.server = await asyncio.start_server(self._handle_terminal, "0.0.0.0", port)
        except OSError as exc:
            self.emit(
                "server_error",
                {
                    "error": f"Não foi possível abrir a porta TCP {port}: {exc}.\n"
                    f"Verifique se outro aplicativo (como o TC Server antigo da Gertec) já está usando a porta {port}."
                },
            )
            return

        if sc504_port and sc504_port != port:
            try:
                self.server_sc504 = await asyncio.start_server(self._handle_sc504_terminal, "0.0.0.0", sc504_port)
                logger.info("Servidor TCP Gertec SC504 (TC504/TC506/TC508/G-BOT) ouvindo em 0.0.0.0:%d", sc504_port)
            except OSError as exc:
                logger.warning("Porta secundária SC504 (%d) ocupada: %s", sc504_port, exc)

        self.running = True
        self.emit("server_started", {"port": port, "sc504_port": sc504_port, "ips": get_local_ips()})
        logger.info("Servidor TCP Gertec Universal ouvindo em 0.0.0.0:%d (SC501) e :%d (SC504)", port, sc504_port)

        if self.server_sc504:
            async with self.server, self.server_sc504:
                await asyncio.gather(self.server.serve_forever(), self.server_sc504.serve_forever())
        else:
            async with self.server:
                await self.server.serve_forever()

    def stop(self) -> None:
        if self.loop and self.running:
            self.loop.call_soon_threadsafe(self._shutdown_loop)

    def _shutdown_loop(self) -> None:
        if self.server:
            self.server.close()
        if self.server_sc504:
            self.server_sc504.close()
        for task in asyncio.all_tasks(self.loop):
            task.cancel()

    def resolve_barcode_sync(
        self,
        barcode: str,
        terminal_label: str = "SIMULADOR",
        terminal_model: str = "",
    ) -> Tuple[bytes, Dict[str, Any]]:
        """Consulta um código de barras (usando cache ou chamando a API Cronuz) e formata a resposta Gertec."""
        cfg = self.config_getter()
        ttl = int(cfg.get("cache_ttl_sec") or 120)
        show_stock = bool(cfg.get("show_stock_in_price_line", False))
        cfg_display_mode = str(cfg.get("display_format_mode") or "auto_tc502_compact")
        effective_mode = resolve_effective_display_mode(cfg_display_mode, terminal_model)
        now = time.time()

        primary_bc, _, conv_note = normalize_book_and_ean_barcode(barcode)
        clean_bc = primary_bc or barcode.strip()
        cached = self.cache.get(clean_bc)
        if cached and (now - cached["ts"]) < ttl:
            res = dict(cached["data"])
            res["from_cache"] = True
        else:
            api = CronuzApiClient(cfg.get("api_base_url", ""), cfg.get("access_token", ""))
            t0 = time.time()
            res = api.lookup_barcode(barcode)
            res["latency_ms"] = int((time.time() - t0) * 1000)
            res["from_cache"] = False
            if res.get("found") and not res.get("error"):
                self.cache[clean_bc] = {"data": res, "ts": now}

        if res.get("error"):
            resp_bytes = build_gertec_price_response(
                "ERRO DE COMUNICACAO",
                None,
                "VERIFIQUE O SERVIDOR",
                display_mode=effective_mode,
            )
        elif res.get("found"):
            resp_bytes = build_gertec_price_response(
                nome=res.get("nome", "PRODUTO"),
                preco=res.get("preco"),
                extra_info=res.get("extra", ""),
                saldo=res.get("saldo"),
                show_stock=show_stock,
                display_mode=effective_mode,
            )
        else:
            resp_bytes = b"#nfound"

        display_bc = conv_note if conv_note else clean_bc
        log_entry = {
            "time": datetime.now().strftime("%H:%M:%S"),
            "terminal": terminal_label,
            "barcode": display_bc,
            "found": bool(res.get("found")),
            "nome": res.get("nome") or ("ERRO: " + res["error"] if res.get("error") else "NÃO ENCONTRADO (#nfound)"),
            "preco": res.get("preco"),
            "saldo": res.get("saldo"),
            "from_cache": res.get("from_cache", False),
            "latency_ms": res.get("latency_ms", 0),
            "error": res.get("error"),
            "raw_gertec": resp_bytes.decode("ascii", errors="replace"),
            "display_mode": effective_mode,
        }
        self.emit("query_logged", log_entry)
        return resp_bytes, log_entry

    async def _handle_terminal(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        addr = writer.get_extra_info("peername")
        ip = addr[0] if addr else "0.0.0.0"
        port = addr[1] if addr else 0
        addr_str = f"{ip}:{port}"
        term_key = ip

        prev_entry = self.connected_terminals.get(term_key, {})
        self.connected_terminals[term_key] = {
            "ip": ip,
            "addr": addr_str,
            "model": "Conectando...",
            "connected_at": prev_entry.get("connected_at") or datetime.now().strftime("%H:%M:%S"),
            "last_seen": datetime.now().strftime("%H:%M:%S"),
            "queries": int(prev_entry.get("queries") or 0),
        }
        self.emit("terminals_updated", {"terminals": list(self.connected_terminals.values())})
        logger.info("Terminal Gertec conectado na porta SC501: %s", addr_str)

        model_response = prev_entry.get("raw_model") or "Gertec G2"
        try:
            # 1. Handshake inicial universal obrigatório (#ok)
            writer.write(b"#ok")
            await writer.drain()

            try:
                data = await asyncio.wait_for(reader.read(255), timeout=5.0)
                if data:
                    # Se o leitor enviou pacote binário SC504 (STX = 0x02) na porta 6500, delega ao handler SC504
                    if data[0] == 0x02:
                        logger.info("Detectado protocolo binário SC504 em %s na porta 6500 -> delegando handler SC504", addr_str)
                        await self._handle_sc504_terminal(reader, writer, initial_data=data)
                        return
                    decoded = data.decode("iso-8859-1", errors="replace").strip("\x00\r\n ")
                    if decoded:
                        first_part = [p.strip() for p in decoded.split("#") if p.strip()]
                        model_response = f"#{first_part[0]}" if first_part else decoded
            except asyncio.TimeoutError:
                pass

            self.connected_terminals[term_key]["raw_model"] = model_response
            self.connected_terminals[term_key]["model"] = f"{model_response} (Online)"
            self.emit("terminals_updated", {"terminals": list(self.connected_terminals.values())})
            logger.info("Handshake terminal %s -> %s", addr_str, model_response)

            # 2. Envia #alwayslive para TODAS as versões (obrigatório no Busca Preço G2 E 4.5.0 S, G2 S e aceito pelo TC502/TC505/TC406)
            writer.write(b"#alwayslive")
            await writer.drain()
            await asyncio.sleep(0.25)

            model_low = model_response.lower()
            if "bpg2s" in model_low:
                # 3. No BPG2S (LCD alfanumérico 20x4), envia #mesg de boas-vindas
                cfg = self.config_getter()
                w1 = cfg.get("welcome_line1", "LIVRARIA")
                w2 = cfg.get("welcome_line2", "CONSULTE AQUI!")
                t_sec = int(cfg.get("display_time_sec") or 5)
                writer.write(build_gertec_mesg(w1, w2, t_sec))
                await writer.drain()

            # 4. Loop universal de escuta de códigos de barras e Keep-Alive (#live? a cada 20s se ocioso)
            while True:
                try:
                    data = await asyncio.wait_for(reader.read(1024), timeout=20.0)
                except asyncio.TimeoutError:
                    writer.write(b"#live?")
                    await writer.drain()
                    continue

                if not data:
                    break

                self.connected_terminals[term_key]["last_seen"] = datetime.now().strftime("%H:%M:%S")
                self.connected_terminals[term_key]["model"] = f"{model_response} (Online)"
                raw_msg = data.decode("iso-8859-1", errors="replace").strip("\x00\r\n ")
                if not raw_msg:
                    continue

                # Caso o terminal envie múltiplos pacotes separados por NUL (\x00) ou colados com '#'
                parts = []
                for chunk_nul in raw_msg.split("\x00"):
                    for sub in chunk_nul.split("#"):
                        cleaned = sub.strip("\x00\r\n ")
                        if cleaned:
                            parts.append(cleaned)

                for part in parts:
                    token = f"#{part}"
                    t_low = token.lower()

                    if t_low.startswith("#checklive") and not t_low.startswith("#checklive_ok"):
                        writer.write(b"#checklive_ok")
                        await writer.drain()
                        continue

                    if t_low == "#alwayslive":
                        writer.write(b"#alwayslive_ok")
                        await writer.drain()
                        continue

                    if t_low in (
                        "#live",
                        "#ok",
                        "#mesg_ok",
                        "#gif_ok",
                        "#sound_ok",
                        "#queryprocessfailure",
                        "#alwayslive_ok",
                        "#checklive_ok",
                        "#sleep_ok",
                        "#wake_ok",
                    ) or t_low.startswith(
                        (
                            "#live|",
                            "#gif_ok",
                            "#img_ok",
                            "#img_error",
                            "#mesg_error",
                            "#mesg_ok",
                            "#sound_ok",
                            "#sound_error",
                            "#queryprocessfailure",
                            "#alwayslive",
                            "#checklive",
                            "#macaddr",
                            "#fullmacaddr",
                            "#config",
                            "#extconfig",
                            "#paramconfig",
                            "#wlanconfig",
                            "#audioconfig",
                            "#updconfig",
                            "#reconf",
                            "#rextconf",
                            "#status",
                            "#tc300",
                            "#tc406",
                            "#tc502",
                            "#tc505",
                            "#tc506",
                            "#tc507",
                            "#bpg2",
                        )
                    ):
                        if t_low.startswith("#queryprocessfailure"):
                            logger.warning("Terminal %s reportou #queryprocessfailure (ignorando como código de barras)", ip)
                        else:
                            logger.debug("Mensagem de controle do terminal %s ignorada: %s", ip, token)
                        self.emit("terminals_updated", {"terminals": list(self.connected_terminals.values())})
                        continue

                    barcode = part.strip()
                    if not barcode or not any(ch.isdigit() for ch in barcode):
                        logger.debug("Pacote sem dígitos ignorado de %s: %r", ip, barcode)
                        continue

                    logger.info("Bipe recebido de %s (%s): raw=%r -> barcode=%r", ip, model_response, raw_msg, barcode)
                    self.connected_terminals[term_key]["queries"] += 1
                    self.emit("terminals_updated", {"terminals": list(self.connected_terminals.values())})

                    resp_bytes, _ = await asyncio.get_running_loop().run_in_executor(
                        None,
                        self.resolve_barcode_sync,
                        barcode,
                        ip,
                        model_response,
                    )
                    writer.write(resp_bytes)
                    await writer.drain()

        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.warning("Conexão encerrada com terminal %s: %s", addr_str, exc)
        finally:
            cur = self.connected_terminals.get(term_key)
            if cur and cur.get("addr") == addr_str:
                cur["model"] = f"{model_response} (Reconectando...)"
                cur["last_seen"] = datetime.now().strftime("%H:%M:%S")
            self.emit("terminals_updated", {"terminals": list(self.connected_terminals.values())})
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass

    @staticmethod
    def _build_sc504_packet(cmd_id: int, payload: bytes = b"") -> bytes:
        """Monta pacote binário SC504 (STX=0x02 | LEN_LE_16 | CMD_ID | PAYLOAD | ETX=0x03)."""
        body = bytes([cmd_id]) + payload
        length_le = len(body).to_bytes(2, "little")
        return b"\x02" + length_le + body + b"\x03"

    async def _handle_sc504_terminal(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
        initial_data: bytes = b"",
    ) -> None:
        """
        Suporte completo ao Protocolo Binário Gertec SC504 (Porta 16510):
        Compatível com TC504, TC506 Mídia, TC508, GB-600/601, G-BOT e G-BOT2.
        """
        addr = writer.get_extra_info("peername")
        ip = addr[0] if addr else "0.0.0.0"
        port = addr[1] if addr else 0
        addr_str = f"{ip}:{port}"
        term_key = ip

        prev_entry = self.connected_terminals.get(term_key, {})
        model_response = prev_entry.get("raw_model") or "Gertec SC504"
        self.connected_terminals[term_key] = {
            "ip": ip,
            "addr": addr_str,
            "raw_model": model_response,
            "model": f"{model_response} (Online SC504)",
            "connected_at": prev_entry.get("connected_at") or datetime.now().strftime("%H:%M:%S"),
            "last_seen": datetime.now().strftime("%H:%M:%S"),
            "queries": int(prev_entry.get("queries") or 0),
        }
        self.emit("terminals_updated", {"terminals": list(self.connected_terminals.values())})
        logger.info("Terminal Gertec SC504 conectado: %s", addr_str)

        try:
            # Solicita identificação SC504 (ID_W_GET_IDENTIFY = 19)
            writer.write(self._build_sc504_packet(19))
            await writer.drain()

            buf = bytearray(initial_data)
            while True:
                if not buf:
                    try:
                        chunk = await asyncio.wait_for(reader.read(1024), timeout=15.0)
                    except asyncio.TimeoutError:
                        # Envia Keep-Alive SC504 (ID_V_LIVE = 17)
                        writer.write(self._build_sc504_packet(17))
                        await writer.drain()
                        continue
                    if not chunk:
                        break
                    buf.extend(chunk)

                self.connected_terminals[term_key]["last_seen"] = datetime.now().strftime("%H:%M:%S")

                # Procura STX (0x02)
                stx_idx = buf.find(0x02)
                if stx_idx == -1:
                    buf.clear()
                    continue
                if stx_idx > 0:
                    del buf[:stx_idx]

                if len(buf) < 5:
                    chunk = await asyncio.wait_for(reader.read(1024), timeout=5.0)
                    if not chunk:
                        break
                    buf.extend(chunk)
                    if len(buf) < 5:
                        continue

                pkt_len = int.from_bytes(buf[1:3], "little")
                total_frame_len = 1 + 2 + pkt_len + 1
                if len(buf) < total_frame_len:
                    chunk = await asyncio.wait_for(reader.read(1024), timeout=5.0)
                    if not chunk:
                        break
                    buf.extend(chunk)
                    if len(buf) < total_frame_len:
                        continue

                frame = bytes(buf[:total_frame_len])
                del buf[:total_frame_len]

                cmd_id = frame[3]
                payload = frame[4:-1]

                if cmd_id == 19:  # ID_B_RET_IDENTIFY
                    txt = payload.decode("iso-8859-1", errors="ignore").strip("\x00\r\n ")
                    model_response = f"SC504 {txt[:18]}".strip() if txt else "Gertec SC504"
                    self.connected_terminals[term_key]["raw_model"] = model_response
                    self.connected_terminals[term_key]["model"] = f"{model_response} (Online)"
                    self.emit("terminals_updated", {"terminals": list(self.connected_terminals.values())})
                    # Envia ID_CONTINUE (21)
                    writer.write(self._build_sc504_packet(21))
                    await writer.drain()

                elif cmd_id in (17, 21):  # ID_V_LIVE (17) ou ID_CONTINUE (21)
                    writer.write(self._build_sc504_packet(17))
                    await writer.drain()

                elif cmd_id == 89:  # ID_B_READ_SCANNER (Leitura de código de barras no SC504)
                    # Formato payload SC504: type(2 bytes) + len(1 byte) + barcode + 0x00
                    bc_raw = payload[3:] if len(payload) > 3 else payload
                    barcode = bc_raw.decode("ascii", errors="ignore").strip("\x00\r\n ")
                    if not barcode or not any(ch.isdigit() for ch in barcode):
                        continue

                    logger.info("Bipe SC504 recebido de %s: barcode=%r", ip, barcode)
                    self.connected_terminals[term_key]["queries"] += 1
                    self.emit("terminals_updated", {"terminals": list(self.connected_terminals.values())})

                    _, log_entry = await asyncio.get_running_loop().run_in_executor(
                        None,
                        self.resolve_barcode_sync,
                        barcode,
                        ip,
                        model_response,
                    )

                    # Limpa tela SC504 (ID_V_DISP_CLEAR = 33)
                    packets = bytearray(self._build_sc504_packet(33))
                    if log_entry.get("found") and not log_entry.get("error"):
                        nome_clean = strip_accents(log_entry.get("nome") or "PRODUTO")[:40]
                        preco_val = float(log_entry.get("preco") or 0.0)
                        preco_str = f"R$ {preco_val:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
                        line1 = nome_clean[:20].encode("ascii", errors="ignore") + b"\x00"
                        line2 = nome_clean[20:40].encode("ascii", errors="ignore") + b"\x00"
                        line3 = preco_str[:20].encode("ascii", errors="ignore") + b"\x00"
                        # ID_V_SHOW_TEXT = 35: row(1B), col(1B), font_w(1B), font_h(1B), len(1B), text+NUL
                        packets.extend(self._build_sc504_packet(35, bytes([1, 1, 1, 1, len(line1)]) + line1))
                        if len(nome_clean) > 20:
                            packets.extend(self._build_sc504_packet(35, bytes([2, 1, 1, 1, len(line2)]) + line2))
                        packets.extend(self._build_sc504_packet(35, bytes([4, 1, 2, 2, len(line3)]) + line3))
                    else:
                        msg_nf = b"PRODUTO NAO CADASTR.\x00"
                        packets.extend(self._build_sc504_packet(35, bytes([2, 1, 1, 1, len(msg_nf)]) + msg_nf))

                    writer.write(bytes(packets))
                    await writer.drain()

        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.warning("Conexão SC504 encerrada com %s: %s", addr_str, exc)
        finally:
            cur = self.connected_terminals.get(term_key)
            if cur and cur.get("addr") == addr_str:
                cur["model"] = f"{model_response} (Reconectando...)"
                cur["last_seen"] = datetime.now().strftime("%H:%M:%S")
            self.emit("terminals_updated", {"terminals": list(self.connected_terminals.values())})
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass


# ──────────────────────────────────────────────────────────────────────────────
# Interface Gráfica Intuitiva (Tkinter Moderno)
# ──────────────────────────────────────────────────────────────────────────────
_BaseTk = tk.Tk if HAS_TK else object


class CronuzGertecApp(_BaseTk):
    def __init__(self):
        super().__init__()
        self.title(APP_TITLE)
        self.geometry("1080x740")
        self.minsize(960, 660)
        self.configure(bg="#0f172a")

        self.config_data = load_config()
        self.event_queue: queue.Queue = queue.Queue()
        self.server_thread: Optional[GertecTcpServerThread] = None
        self.diagnostic_ready = False

        self._logo_img = None
        try:
            self._logo_img = tk.PhotoImage(data=HORUS_ICON_B64)
            self.iconphoto(True, self._logo_img)
        except Exception:
            pass

        self._setup_styles()
        self._build_ui()

        # Inicia polling da fila de eventos da thread TCP
        self.after(150, self._process_events)

        # Valida diagnóstico inicial se já tiver token salvo
        if self.config_data.get("access_token"):
            self.after(300, self.run_diagnostics_async)
            if self.config_data.get("auto_start_server", True):
                self.after(600, self.start_tcp_server)
        else:
            self._render_unconfigured_banner()
            self.notebook.select(self.tab_config)

    def get_config(self) -> Dict[str, Any]:
        return self.config_data

    def _setup_styles(self) -> None:
        style = ttk.Style(self)
        try:
            style.theme_use("clam")
        except Exception:
            pass

        style.configure("TNotebook", background="#0f172a", borderwidth=0)
        style.configure(
            "TNotebook.Tab",
            background="#1e293b",
            foreground="#cbd5e1",
            padding=(16, 10),
            font=("Segoe UI", 10, "bold"),
        )
        style.map(
            "TNotebook.Tab",
            background=[("selected", "#4f46e5")],
            foreground=[("selected", "#ffffff")],
        )

        style.configure(
            "Treeview",
            background="#1e293b",
            foreground="#f8fafc",
            fieldbackground="#1e293b",
            rowheight=28,
            font=("Segoe UI", 9),
        )
        style.configure(
            "Treeview.Heading",
            background="#334155",
            foreground="#f8fafc",
            font=("Segoe UI", 9, "bold"),
        )
        style.map("Treeview", background=[("selected", "#4f46e5")])

    def _build_ui(self) -> None:
        # ── TOP HEADER ──
        header = tk.Frame(self, bg="#1e293b", height=74, padx=20, pady=12)
        header.pack(fill=tk.X)

        if self._logo_img is not None:
            tk.Label(header, image=self._logo_img, bg="#1e293b").pack(side=tk.LEFT, padx=(0, 12))

        title_frame = tk.Frame(header, bg="#1e293b")
        title_frame.pack(side=tk.LEFT)

        tk.Label(
            title_frame,
            text="Horus / Cronuz Busca Preço — Servidor Gertec G2",
            bg="#1e293b",
            fg="#ffffff",
            font=("Segoe UI", 15, "bold"),
        ).pack(anchor="w")

        self.lbl_seller_subtitle = tk.Label(
            title_frame,
            text=self._get_seller_subtitle_text(),
            bg="#1e293b",
            fg="#94a3b8",
            font=("Segoe UI", 9),
        )
        self.lbl_seller_subtitle.pack(anchor="w")

        # Status Badges on the right
        right_header = tk.Frame(header, bg="#1e293b")
        right_header.pack(side=tk.RIGHT)

        local_ips = ", ".join(get_local_ips())
        port = self.config_data.get("tcp_port", 6500)
        self.lbl_network_info = tk.Label(
            right_header,
            text=f"Configure no Gertec G2  ➜  IP do Servidor: {local_ips}   |   Porta TCP: {port}",
            bg="#0f172a",
            fg="#38bdf8",
            font=("Consolas", 10, "bold"),
            padx=12,
            pady=6,
        )
        self.lbl_network_info.pack(side=tk.LEFT, padx=(0, 12))

        self.btn_toggle_server = tk.Button(
            right_header,
            text="▶ Iniciar Servidor TCP",
            bg="#10b981",
            fg="#ffffff",
            activebackground="#059669",
            activeforeground="#ffffff",
            relief=tk.FLAT,
            font=("Segoe UI", 10, "bold"),
            padx=14,
            pady=6,
            cursor="hand2",
            command=self.toggle_tcp_server,
        )
        self.btn_toggle_server.pack(side=tk.LEFT)

        # ── BANNER DE ALERTA / DIAGNÓSTICO GLOBAL ──
        self.alert_banner = tk.Frame(self, bg="#7c2d12", padx=16, pady=8)
        self.lbl_alert_banner = tk.Label(
            self.alert_banner,
            text="",
            bg="#7c2d12",
            fg="#ffedd5",
            font=("Segoe UI", 9, "bold"),
            justify=tk.LEFT,
            anchor="w",
        )
        self.lbl_alert_banner.pack(side=tk.LEFT, fill=tk.X, expand=True)

        # ── NOTEBOOK (ABAS) ──
        self.notebook = ttk.Notebook(self)
        self.notebook.pack(fill=tk.BOTH, expand=True, padx=14, pady=10)

        self.tab_monitor = tk.Frame(self.notebook, bg="#0f172a")
        self.tab_diagnostics = tk.Frame(self.notebook, bg="#0f172a")
        self.tab_config = tk.Frame(self.notebook, bg="#0f172a")

        self.notebook.add(self.tab_monitor, text="📡 Monitor ao Vivo & Simulador")
        self.notebook.add(self.tab_diagnostics, text="🩺 Diagnóstico Horus & Checklist")
        self.notebook.add(self.tab_config, text="⚙️ Configurações & Credenciais")

        self._build_tab_monitor()
        self._build_tab_diagnostics()
        self._build_tab_config()

    def _get_seller_subtitle_text(self) -> str:
        comp_name = self.config_data.get("company_name")
        comp_doc = self.config_data.get("company_document")
        if comp_name:
            return f"Seller Autenticado: {comp_name} ({comp_doc or 'Sem CNPJ'})  •  API: {self.config_data.get('api_base_url')}"
        return "⚠️ Nenhum Seller autenticado — Acesse a aba 'Configurações & Credenciais' para conectar sua conta."

    def _render_unconfigured_banner(self) -> None:
        self.alert_banner.configure(bg="#9a3412")
        self.lbl_alert_banner.configure(
            bg="#9a3412",
            fg="#ffedd5",
            text="⚠️ ATENÇÃO: Você ainda não conectou sua conta do Cronuz B2B. Preencha seu E-mail e Senha abaixo para carregar automaticamente as configurações da API do Horus do seu Seller.",
        )
        self.alert_banner.pack(fill=tk.X, before=self.notebook)

    # ──────────────────────────────────────────────────────────────────────────
    # ABA 1: Monitor ao Vivo & Simulador
    # ──────────────────────────────────────────────────────────────────────────
    def _build_tab_monitor(self) -> None:
        top_pane = tk.Frame(self.tab_monitor, bg="#0f172a")
        top_pane.pack(fill=tk.X, padx=10, pady=10)

        # Card 1: Terminais Gertec Conectados
        term_card = tk.LabelFrame(
            top_pane,
            text=" 📟 Terminais Gertec G2 Conectados na Rede ",
            bg="#1e293b",
            fg="#38bdf8",
            font=("Segoe UI", 10, "bold"),
            padx=10,
            pady=8,
        )
        term_card.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 8))

        cols_term = ("ip", "model", "connected_at", "last_seen", "queries")
        self.tree_terminals = ttk.Treeview(term_card, columns=cols_term, show="headings", height=3)
        self.tree_terminals.heading("ip", text="IP do Leitor")
        self.tree_terminals.heading("model", text="Protocolo / Modelo")
        self.tree_terminals.heading("connected_at", text="Conectado às")
        self.tree_terminals.heading("last_seen", text="Último Sinal")
        self.tree_terminals.heading("queries", text="Consultas")

        self.tree_terminals.column("ip", width=130)
        self.tree_terminals.column("model", width=140)
        self.tree_terminals.column("connected_at", width=95, anchor="center")
        self.tree_terminals.column("last_seen", width=95, anchor="center")
        self.tree_terminals.column("queries", width=80, anchor="center")
        self.tree_terminals.pack(fill=tk.BOTH, expand=True)

        term_actions = tk.Frame(term_card, bg="#1e293b")
        term_actions.pack(fill=tk.X, pady=(6, 0))

        tk.Button(
            term_actions,
            text="🔍 Conectar / Diagnosticar Leitor (IP)",
            bg="#0284c7",
            fg="#ffffff",
            activebackground="#0369a1",
            activeforeground="#ffffff",
            relief=tk.FLAT,
            font=("Segoe UI", 9, "bold"),
            padx=10,
            pady=4,
            cursor="hand2",
            command=self.open_gertec_network_diagnostic_modal,
        ).pack(side=tk.LEFT, padx=(0, 6))

        tk.Button(
            term_actions,
            text="🛡️ Liberar Firewall Windows",
            bg="#4f46e5",
            fg="#ffffff",
            activebackground="#4338ca",
            activeforeground="#ffffff",
            relief=tk.FLAT,
            font=("Segoe UI", 9, "bold"),
            padx=10,
            pady=4,
            cursor="hand2",
            command=self.unlock_windows_firewall_ui,
        ).pack(side=tk.LEFT, padx=(0, 6))

        tk.Button(
            term_actions,
            text="🧾 Térmica 80mm",
            bg="#10b981",
            fg="#0f172a",
            activebackground="#059669",
            activeforeground="#0f172a",
            relief=tk.FLAT,
            font=("Segoe UI", 9, "bold"),
            padx=8,
            pady=4,
            cursor="hand2",
            command=self.open_thermal_isbn_sheet,
        ).pack(side=tk.LEFT, padx=(0, 6))

        tk.Button(
            term_actions,
            text="📚 Folha A4",
            bg="#f59e0b",
            fg="#0f172a",
            activebackground="#d97706",
            activeforeground="#0f172a",
            relief=tk.FLAT,
            font=("Segoe UI", 9, "bold"),
            padx=8,
            pady=4,
            cursor="hand2",
            command=self.open_isbn_unlock_sheet,
        ).pack(side=tk.LEFT, padx=(0, 6))

        tk.Button(
            term_actions,
            text="🌐 Painel Web",
            bg="#334155",
            fg="#f8fafc",
            activebackground="#475569",
            activeforeground="#ffffff",
            relief=tk.FLAT,
            font=("Segoe UI", 9, "bold"),
            padx=8,
            pady=4,
            cursor="hand2",
            command=self.open_connected_gertec_web_panel,
        ).pack(side=tk.LEFT)

        # Card 2: Simulador de Bipe + Visor Virtual Gertec G2 (4x20)
        sim_card = tk.LabelFrame(
            top_pane,
            text=" 🧪 Simulador de Leitura & Visor Virtual Gertec G2 ",
            bg="#1e293b",
            fg="#a78bfa",
            font=("Segoe UI", 10, "bold"),
            padx=12,
            pady=8,
        )
        sim_card.pack(side=tk.RIGHT, fill=tk.BOTH)

        sim_input_row = tk.Frame(sim_card, bg="#1e293b")
        sim_input_row.pack(fill=tk.X, pady=(0, 8))

        tk.Label(
            sim_input_row,
            text="ISBN / EAN:",
            bg="#1e293b",
            fg="#cbd5e1",
            font=("Segoe UI", 9, "bold"),
        ).pack(side=tk.LEFT, padx=(0, 6))

        self.entry_sim_barcode = tk.Entry(
            sim_input_row,
            bg="#0f172a",
            fg="#ffffff",
            insertbackground="#ffffff",
            font=("Consolas", 11),
            width=18,
            relief=tk.FLAT,
        )
        self.entry_sim_barcode.pack(side=tk.LEFT, ipady=4, padx=(0, 6))
        self.entry_sim_barcode.bind("<Return>", lambda e: self.simulate_barcode_scan())

        tk.Button(
            sim_input_row,
            text="Simular Bipe",
            bg="#6366f1",
            fg="#ffffff",
            relief=tk.FLAT,
            font=("Segoe UI", 9, "bold"),
            padx=10,
            pady=3,
            cursor="hand2",
            command=self.simulate_barcode_scan,
        ).pack(side=tk.LEFT)

        # Visor LCD/Gráfico simulando exatamente as 4 linhas de 20 colunas + linha de preço do Gertec G2
        lcd_frame = tk.Frame(sim_card, bg="#022c22", bd=2, relief=tk.SUNKEN, padx=10, pady=6)
        lcd_frame.pack(fill=tk.X)

        self.lbl_lcd_lines = tk.Label(
            lcd_frame,
            text="LIVRARIA / PAPELARIA\nCONSULTE O PRECO AQUI\n                    \n                    ",
            bg="#022c22",
            fg="#34d399",
            font=("Consolas", 10, "bold"),
            justify=tk.LEFT,
            anchor="w",
        )
        self.lbl_lcd_lines.pack(anchor="w")

        self.lbl_lcd_price = tk.Label(
            lcd_frame,
            text="PASSE O CODIGO",
            bg="#022c22",
            fg="#fbbf24",
            font=("Consolas", 13, "bold"),
            anchor="e",
        )
        self.lbl_lcd_price.pack(fill=tk.X, pady=(2, 0))

        # Log de Consultas em Tempo Real
        log_card = tk.LabelFrame(
            self.tab_monitor,
            text=" 📋 Histórico de Consultas em Tempo Real (Bipes na Loja) ",
            bg="#1e293b",
            fg="#f8fafc",
            font=("Segoe UI", 10, "bold"),
            padx=10,
            pady=8,
        )
        log_card.pack(fill=tk.BOTH, expand=True, padx=10, pady=(0, 10))

        cols_log = ("time", "terminal", "barcode", "nome", "preco", "saldo", "latency")
        self.tree_logs = ttk.Treeview(log_card, columns=cols_log, show="headings")
        self.tree_logs.heading("time", text="Horário")
        self.tree_logs.heading("terminal", text="Leitor / Origem")
        self.tree_logs.heading("barcode", text="ISBN / Código")
        self.tree_logs.heading("nome", text="Produto Retornado pelo Horus")
        self.tree_logs.heading("preco", text="Preço Exibido")
        self.tree_logs.heading("saldo", text="Saldo")
        self.tree_logs.heading("latency", text="Tempo")

        self.tree_logs.column("time", width=80, anchor="center")
        self.tree_logs.column("terminal", width=120, anchor="center")
        self.tree_logs.column("barcode", width=130, anchor="center")
        self.tree_logs.column("nome", width=380, anchor="w")
        self.tree_logs.column("preco", width=110, anchor="e")
        self.tree_logs.column("saldo", width=70, anchor="center")
        self.tree_logs.column("latency", width=90, anchor="center")

        scrollbar = ttk.Scrollbar(log_card, orient=tk.VERTICAL, command=self.tree_logs.yview)
        self.tree_logs.configure(yscrollcommand=scrollbar.set)
        self.tree_logs.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

    # ──────────────────────────────────────────────────────────────────────────
    # ABA 2: Diagnóstico Horus & Checklist de Configuração
    # ──────────────────────────────────────────────────────────────────────────
    def _build_tab_diagnostics(self) -> None:
        container = tk.Frame(self.tab_diagnostics, bg="#0f172a", padx=16, pady=16)
        container.pack(fill=tk.BOTH, expand=True)

        top_bar = tk.Frame(container, bg="#0f172a")
        top_bar.pack(fill=tk.X, pady=(0, 12))

        tk.Label(
            top_bar,
            text="Checklist de Prontidão — API Cronuz & Horus ERP do Seller",
            bg="#0f172a",
            fg="#ffffff",
            font=("Segoe UI", 13, "bold"),
        ).pack(side=tk.LEFT)

        tk.Button(
            top_bar,
            text="🔄 Executar Diagnóstico Completo Agora",
            bg="#4f46e5",
            fg="#ffffff",
            relief=tk.FLAT,
            font=("Segoe UI", 9, "bold"),
            padx=14,
            pady=6,
            cursor="hand2",
            command=self.run_diagnostics_async,
        ).pack(side=tk.RIGHT)

        self.diag_cards_frame = tk.Frame(container, bg="#0f172a")
        self.diag_cards_frame.pack(fill=tk.BOTH, expand=True)

        # Guia rápido de como configurar o aparelho Gertec G2
        guide_card = tk.LabelFrame(
            container,
            text=" 📖 Como apontar o seu aparelho Gertec Busca Preço G2 para este computador ",
            bg="#1e293b",
            fg="#38bdf8",
            font=("Segoe UI", 10, "bold"),
            padx=14,
            pady=10,
        )
        guide_card.pack(fill=tk.X, pady=(12, 0))

        ips_str = " ou ".join(get_local_ips())
        port_val = self.config_data.get("tcp_port", 6500)
        guide_text = (
            f"1. Conecte um teclado USB no Gertec G2 (ou acesse o painel web do terminal pelo IP dele no navegador).\n"
            f"2. Acesse Configurações de Rede → Servidor (Host).\n"
            f"3. Em 'IP do Servidor', informe o IP fixo deste computador Windows:  {ips_str}\n"
            f"4. Em 'Porta do Servidor', informe:  {port_val}  (Protocolo TCP/IP puro — não coloque http://).\n"
            f"5. Salve e reinicie o Gertec G2. Ele aparecerá conectado automaticamente na aba 'Monitor ao Vivo'!"
        )
        tk.Label(
            guide_card,
            text=guide_text,
            bg="#1e293b",
            fg="#cbd5e1",
            font=("Segoe UI", 9),
            justify=tk.LEFT,
            anchor="w",
        ).pack(fill=tk.X)

    def _render_diagnostic_items(self, data: Dict[str, Any]) -> None:
        for widget in self.diag_cards_frame.winfo_children():
            widget.destroy()

        if data.get("error"):
            err_box = tk.Frame(self.diag_cards_frame, bg="#7f1d1d", padx=16, pady=14)
            err_box.pack(fill=tk.X, pady=6)
            tk.Label(
                err_box,
                text=f"❌ Não foi possível validar as configurações: {data['error']}",
                bg="#7f1d1d",
                fg="#fecaca",
                font=("Segoe UI", 10, "bold"),
                 anchor="w",
                justify=tk.LEFT,
            ).pack(fill=tk.X)
            return

        checklist = data.get("checklist") or []
        for item in checklist:
            ok = bool(item.get("ok"))
            bg_color = "#064e3b" if ok else "#7c2d12"
            border_color = "#10b981" if ok else "#f97316"
            icon = "✅" if ok else "⚠️"

            card = tk.Frame(
                self.diag_cards_frame,
                bg="#1e293b",
                highlightbackground=border_color,
                highlightthickness=1,
                padx=14,
                pady=10,
            )
            card.pack(fill=tk.X, pady=5)

            header_row = tk.Frame(card, bg="#1e293b")
            header_row.pack(fill=tk.X)

            tk.Label(
                header_row,
                text=f"{icon}  {item.get('label', '')}",
                bg="#1e293b",
                fg="#34d399" if ok else "#fb923c",
                font=("Segoe UI", 10, "bold"),
                anchor="w",
            ).pack(side=tk.LEFT)

            status_badge = tk.Label(
                header_row,
                text="CONFIGURADO" if ok else "AÇÃO NECESSÁRIA",
                bg=bg_color,
                fg="#ffffff",
                font=("Segoe UI", 8, "bold"),
                padx=8,
                pady=2,
            )
            status_badge.pack(side=tk.RIGHT)

            tk.Label(
                card,
                text=item.get("detail", ""),
                bg="#1e293b",
                fg="#e2e8f0",
                font=("Segoe UI", 9),
                anchor="w",
                justify=tk.LEFT,
            ).pack(fill=tk.X, pady=(4, 0))

            hint = item.get("action_hint")
            if hint and not ok:
                tk.Label(
                    card,
                    text=f"👉 Como resolver: {hint}",
                    bg="#1e293b",
                    fg="#fde047",
                    font=("Segoe UI", 9, "bold"),
                    anchor="w",
                    justify=tk.LEFT,
                ).pack(fill=tk.X, pady=(4, 0))

    # ──────────────────────────────────────────────────────────────────────────
    # ABA 3: Configurações & Credenciais do Seller
    # ──────────────────────────────────────────────────────────────────────────
    def _build_tab_config(self) -> None:
        container = tk.Frame(self.tab_config, bg="#0f172a", padx=20, pady=16)
        container.pack(fill=tk.BOTH, expand=True)

        # Coluna Esquerda: Autenticação na API Cronuz
        left_col = tk.LabelFrame(
            container,
            text=" 🔐 1. Conexão com a API Cronuz B2B (Credenciais do Seller) ",
            bg="#1e293b",
            fg="#38bdf8",
            font=("Segoe UI", 10, "bold"),
            padx=16,
            pady=14,
        )
        left_col.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 10))

        self.var_api_url = tk.StringVar(value=self.config_data.get("api_base_url", "https://cronuzb2b.com.br/api"))
        self.var_email = tk.StringVar(value=self.config_data.get("email", ""))
        self.var_password = tk.StringVar(value="")
        self.var_company_id = tk.StringVar(value=str(self.config_data.get("company_id") or ""))

        self._add_form_field(
            left_col,
            "URL da API Cronuz B2B:",
            self.var_api_url,
            hint="Produção: https://cronuzb2b.com.br/api  |  Teste Local: http://127.0.0.1:8000",
        )
        self._add_form_field(
            left_col,
            "E-mail ou CNPJ do Usuário Seller:",
            self.var_email,
            hint="Mesmo login utilizado no painel administrativo do Cronuz B2B.",
        )
        self._add_form_field(
            left_col,
            "Senha de Acesso:",
            self.var_password,
            show="*",
            hint="Sua senha nunca é salva em texto puro; gera um token dedicado para o terminal.",
        )
        self._add_form_field(
            left_col,
            "ID da Empresa (Opcional — apenas se usuário Master):",
            self.var_company_id,
            hint="Deixe em branco se o seu usuário já pertence diretamente à loja/editora.",
        )

        tk.Button(
            left_col,
            text="🔑 Autenticar & Validar Configurações do Horus",
            bg="#4f46e5",
            fg="#ffffff",
            activebackground="#4338ca",
            activeforeground="#ffffff",
            relief=tk.FLAT,
            font=("Segoe UI", 10, "bold"),
            padx=16,
            pady=8,
            cursor="hand2",
            command=self.authenticate_and_save,
        ).pack(fill=tk.X, pady=(14, 6))

        self.lbl_auth_feedback = tk.Label(
            left_col,
            text="",
            bg="#1e293b",
            fg="#34d399",
            font=("Segoe UI", 9, "bold"),
            wraplength=420,
            justify=tk.LEFT,
        )
        self.lbl_auth_feedback.pack(fill=tk.X, pady=(4, 0))

        # Coluna Direita: Parâmetros do Servidor Gertec G2
        right_col = tk.LabelFrame(
            container,
            text=" 📟 2. Parâmetros do Servidor Socket & Visor do Gertec G2 ",
            bg="#1e293b",
            fg="#a78bfa",
            font=("Segoe UI", 10, "bold"),
            padx=16,
            pady=14,
        )
        right_col.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True)

        self.var_tcp_port = tk.StringVar(value=str(self.config_data.get("tcp_port", 6500)))
        self.var_welcome1 = tk.StringVar(value=self.config_data.get("welcome_line1", "LIVRARIA / PAPELARIA"))
        self.var_welcome2 = tk.StringVar(value=self.config_data.get("welcome_line2", "CONSULTE O PRECO AQUI"))
        self.var_cache_ttl = tk.StringVar(value=str(self.config_data.get("cache_ttl_sec", 120)))
        self.var_show_stock = tk.BooleanVar(value=bool(self.config_data.get("show_stock_in_price_line", False)))
        self.var_auto_start = tk.BooleanVar(value=bool(self.config_data.get("auto_start_server", True)))

        current_mode_code = str(self.config_data.get("display_format_mode") or "auto_tc502_compact")
        mode_code_to_label = {k: v for k, v in DISPLAY_FORMAT_OPTIONS}
        self.mode_label_to_code = {v: k for k, v in DISPLAY_FORMAT_OPTIONS}
        self.var_display_mode_label = tk.StringVar(
            value=mode_code_to_label.get(current_mode_code, DISPLAY_FORMAT_OPTIONS[0][1])
        )

        tk.Label(
            right_col,
            text="Formato do Visor Físico (Nome | Preço):",
            bg="#1e293b",
            fg="#38bdf8",
            font=("Segoe UI", 9, "bold"),
            anchor="w",
        ).pack(fill=tk.X, pady=(4, 2))

        self.combo_display_mode = ttk.Combobox(
            right_col,
            textvariable=self.var_display_mode_label,
            values=[v for _, v in DISPLAY_FORMAT_OPTIONS],
            state="readonly",
            font=("Segoe UI", 9),
        )
        self.combo_display_mode.pack(fill=tk.X, ipady=3)
        tk.Label(
            right_col,
            text="Para leitores #tc502|4.0, use Automático ou TC502 Compacto para o preço aparecer sem cortar.",
            bg="#1e293b",
            fg="#94a3b8",
            font=("Segoe UI", 8),
            anchor="w",
        ).pack(fill=tk.X, pady=(1, 4))

        self._add_form_field(
            right_col,
            "Porta TCP do Servidor Gertec (Padrão: 6500):",
            self.var_tcp_port,
            hint="Porta configurada no Gertec Busca Preço G2.",
        )
        self._add_form_field(
            right_col,
            "Mensagem do Visor — Linha 1 (Máx. 20 caracteres):",
            self.var_welcome1,
            hint="Exibida no Gertec quando está aguardando leitura.",
        )
        self._add_form_field(
            right_col,
            "Mensagem do Visor — Linha 2 (Máx. 20 caracteres):",
            self.var_welcome2,
            hint="Ex: CONSULTE AQUI! ou PASSE O CODIGO",
        )
        self._add_form_field(
            right_col,
            "Tempo de Cache de Preço em Segundos (Padrão: 120s):",
            self.var_cache_ttl,
            hint="Evita consultas repetidas ao Horus se o cliente bipar o mesmo livro 2x seguidas.",
        )

        tk.Checkbutton(
            right_col,
            text="Exibir quantidade em estoque ao lado do preço (ex: R$ 49,90 (5 UN))",
            variable=self.var_show_stock,
            bg="#1e293b",
            fg="#e2e8f0",
            selectcolor="#0f172a",
            activebackground="#1e293b",
            activeforeground="#ffffff",
            font=("Segoe UI", 9),
        ).pack(anchor="w", pady=(8, 4))

        tk.Checkbutton(
            right_col,
            text="Iniciar Servidor TCP automaticamente ao abrir o aplicativo",
            variable=self.var_auto_start,
            bg="#1e293b",
            fg="#e2e8f0",
            selectcolor="#0f172a",
            activebackground="#1e293b",
            activeforeground="#ffffff",
            font=("Segoe UI", 9),
        ).pack(anchor="w", pady=(0, 12))

        tk.Button(
            right_col,
            text="💾 Salvar Parâmetros do Terminal",
            bg="#10b981",
            fg="#ffffff",
            activebackground="#059669",
            activeforeground="#ffffff",
            relief=tk.FLAT,
            font=("Segoe UI", 10, "bold"),
            padx=16,
            pady=8,
            cursor="hand2",
            command=self.save_terminal_settings,
        ).pack(fill=tk.X, pady=(6, 0))

    def _add_form_field(
        self,
        parent: tk.Widget,
        label_text: str,
        var: tk.StringVar,
        show: str = "",
        hint: str = "",
    ) -> None:
        tk.Label(
            parent,
            text=label_text,
            bg="#1e293b",
            fg="#e2e8f0",
            font=("Segoe UI", 9, "bold"),
            anchor="w",
        ).pack(fill=tk.X, pady=(8, 2))

        entry = tk.Entry(
            parent,
            textvariable=var,
            show=show,
            bg="#0f172a",
            fg="#ffffff",
            insertbackground="#ffffff",
            relief=tk.FLAT,
            font=("Segoe UI", 10),
        )
        entry.pack(fill=tk.X, ipady=5)

        if hint:
            tk.Label(
                parent,
                text=hint,
                bg="#1e293b",
                fg="#64748b",
                font=("Segoe UI", 8),
                anchor="w",
            ).pack(fill=tk.X, pady=(1, 0))

    # ──────────────────────────────────────────────────────────────────────────
    # Ações de Negócio (Autenticação, Diagnóstico, Simulador e Servidor TCP)
    # ──────────────────────────────────────────────────────────────────────────
    def authenticate_and_save(self) -> None:
        api_url = self.var_api_url.get().strip().rstrip("/")
        email = self.var_email.get().strip()
        password = self.var_password.get()
        comp_id_str = self.var_company_id.get().strip()

        if not api_url or not email or not password:
            messagebox.showwarning(
                "Campos Obrigatórios",
                "Preencha a URL da API, o E-mail/CNPJ e a Senha para autenticar o terminal.",
            )
            return

        comp_id = int(comp_id_str) if comp_id_str.isdigit() else None
        self.lbl_auth_feedback.configure(fg="#38bdf8", text="⏳ Autenticando na API Cronuz B2B...")
        self.update_idletasks()

        client = CronuzApiClient(api_url)
        ok, resp = client.authenticate_terminal(email, password, comp_id)
        if not ok:
            err = resp.get("error", "Falha desconhecida")
            self.lbl_auth_feedback.configure(fg="#f87171", text=f"❌ {err}")
            messagebox.showerror("Falha na Autenticação", err)
            return

        self.config_data["api_base_url"] = api_url
        self.config_data["email"] = email
        self.config_data["company_id"] = resp.get("company_id") or ""
        self.config_data["access_token"] = resp.get("access_token", "")
        self.config_data["company_name"] = resp.get("company_name", "")
        self.config_data["company_document"] = resp.get("company_document", "")
        save_config(self.config_data)

        self.var_password.set("")
        self.lbl_seller_subtitle.configure(text=self._get_seller_subtitle_text())
        self.lbl_auth_feedback.configure(
            fg="#34d399",
            text=f"✅ Conectado com sucesso ao Seller: {self.config_data['company_name']}!",
        )

        # Dispara diagnóstico completo do Horus e inicia o servidor TCP
        self.run_diagnostics_async()
        if not (self.server_thread and self.server_thread.running):
            self.start_tcp_server()

    def save_terminal_settings(self) -> None:
        try:
            port = int(self.var_tcp_port.get().strip())
            ttl = int(self.var_cache_ttl.get().strip())
        except ValueError:
            messagebox.showerror("Valor Inválido", "A Porta TCP e o Tempo de Cache devem ser números inteiros.")
            return

        selected_label = self.var_display_mode_label.get()
        selected_code = self.mode_label_to_code.get(selected_label, "auto_tc502_compact")

        self.config_data["tcp_port"] = port
        self.config_data["welcome_line1"] = self.var_welcome1.get().strip()[:20]
        self.config_data["welcome_line2"] = self.var_welcome2.get().strip()[:20]
        self.config_data["cache_ttl_sec"] = max(0, ttl)
        self.config_data["show_stock_in_price_line"] = bool(self.var_show_stock.get())
        self.config_data["auto_start_server"] = bool(self.var_auto_start.get())
        self.config_data["display_format_mode"] = selected_code
        save_config(self.config_data)

        local_ips = ", ".join(get_local_ips())
        self.lbl_network_info.configure(
            text=f"Configure no Gertec G2  ➜  IP do Servidor: {local_ips}   |   Porta TCP: {port}"
        )
        messagebox.showinfo("Configurações Salvas", "Os parâmetros do terminal Gertec G2 foram salvos com sucesso!")

    def run_diagnostics_async(self) -> None:
        def _worker():
            api = CronuzApiClient(
                self.config_data.get("api_base_url", ""),
                self.config_data.get("access_token", ""),
            )
            ok, data = api.check_terminal_status(test_horus=True)
            self.event_queue.put({"type": "diagnostics_result", "payload": {"ok": ok, "data": data}})

        threading.Thread(target=_worker, daemon=True).start()

    def start_tcp_server(self) -> None:
        if self.server_thread and self.server_thread.running:
            return
        port = int(self.config_data.get("tcp_port") or 6500)
        sc504_port = int(self.config_data.get("sc504_port") or 16510)
        threading.Thread(
            target=ensure_windows_firewall_rules,
            args=([port, sc504_port], False),
            daemon=True,
        ).start()
        self.server_thread = GertecTcpServerThread(self.get_config, self.event_queue)
        self.server_thread.start()

    def stop_tcp_server(self) -> None:
        if self.server_thread and self.server_thread.running:
            self.server_thread.stop()

    def toggle_tcp_server(self) -> None:
        if self.server_thread and self.server_thread.running:
            self.stop_tcp_server()
        else:
            self.start_tcp_server()

    def simulate_barcode_scan(self) -> None:
        barcode = self.entry_sim_barcode.get().strip()
        if not barcode:
            messagebox.showinfo("Simulador", "Digite um ISBN ou código de barras para simular a leitura.")
            return

        if not self.config_data.get("access_token"):
            messagebox.showwarning(
                "Autenticação Necessária",
                "Autentique sua conta do Seller na aba 'Configurações & Credenciais' antes de consultar produtos.",
            )
            self.notebook.select(self.tab_config)
            return

        def _sim_worker():
            if self.server_thread:
                self.server_thread.resolve_barcode_sync(barcode, "SIMULADOR LOCAL")
            else:
                temp_srv = GertecTcpServerThread(self.get_config, self.event_queue)
                temp_srv.resolve_barcode_sync(barcode, "SIMULADOR LOCAL")

        threading.Thread(target=_sim_worker, daemon=True).start()

    # ──────────────────────────────────────────────────────────────────────────
    # Processador de Eventos da Thread TCP / Diagnóstico
    # ──────────────────────────────────────────────────────────────────────────
    def _process_events(self) -> None:
        try:
            while True:
                ev = self.event_queue.get_nowait()
                etype = ev.get("type")
                payload = ev.get("payload") or {}

                if etype == "server_started":
                    self.btn_toggle_server.configure(
                        text=f"⏹ Servidor Ativo (Porta {payload.get('port')})",
                        bg="#ef4444",
                        activebackground="#dc2626",
                    )

                elif etype == "server_stopped":
                    self.btn_toggle_server.configure(
                        text="▶ Iniciar Servidor TCP",
                        bg="#10b981",
                        activebackground="#059669",
                    )

                elif etype == "server_error":
                    self.btn_toggle_server.configure(
                        text="▶ Iniciar Servidor TCP",
                        bg="#10b981",
                    )
                    messagebox.showerror("Erro no Servidor TCP", payload.get("error", "Erro ao iniciar servidor"))

                elif etype == "terminals_updated":
                    for item in self.tree_terminals.get_children():
                        self.tree_terminals.delete(item)
                    for t in payload.get("terminals", []):
                        self.tree_terminals.insert(
                            "",
                            tk.END,
                            values=(
                                t.get("ip"),
                                t.get("model"),
                                t.get("connected_at"),
                                t.get("last_seen"),
                                t.get("queries"),
                            ),
                        )

                elif etype == "query_logged":
                    preco_val = payload.get("preco")
                    preco_str = (
                        f"R$ {preco_val:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
                        if preco_val is not None
                        else "—"
                    )
                    saldo_val = payload.get("saldo")
                    saldo_str = str(saldo_val) if saldo_val is not None else "—"
                    lat_str = "Cache (<1ms)" if payload.get("from_cache") else f"{payload.get('latency_ms', 0)} ms"

                    self.tree_logs.insert(
                        "",
                        0,
                        values=(
                            payload.get("time"),
                            payload.get("terminal"),
                            payload.get("barcode"),
                            payload.get("nome"),
                            preco_str,
                            saldo_str,
                            lat_str,
                        ),
                    )
                    # Atualiza o Visor Virtual Gertec G2 (4x20)
                    raw_gertec = payload.get("raw_gertec", "")
                    if raw_gertec == "#nfound":
                        self.lbl_lcd_lines.configure(
                            text="PRODUTO NAO         \nENCONTRADO NO       \nACERVO DA LOJA      \n                    ",
                            fg="#f87171",
                        )
                        self.lbl_lcd_price.configure(text="#nfound", fg="#f87171")
                    elif raw_gertec.startswith("#") and "|" in raw_gertec:
                        body = raw_gertec[1:]
                        name_80, price_20 = body.split("|", 1)
                        l1 = name_80[0:20].ljust(20)
                        l2 = name_80[20:40].ljust(20)
                        l3 = name_80[40:60].ljust(20)
                        l4 = name_80[60:80].ljust(20)
                        self.lbl_lcd_lines.configure(text=f"{l1}\n{l2}\n{l3}\n{l4}", fg="#34d399")
                        self.lbl_lcd_price.configure(text=price_20, fg="#fbbf24")

                elif etype == "diagnostics_result":
                    ok = payload.get("ok")
                    data = payload.get("data") or {}
                    self._render_diagnostic_items(data)

                    if not ok:
                        self.alert_banner.configure(bg="#7f1d1d")
                        self.lbl_alert_banner.configure(
                            bg="#7f1d1d",
                            fg="#fecaca",
                            text=f"⚠️ Alerta de Configuração: {data.get('error', 'Verifique a aba Diagnóstico.')}",
                        )
                        self.alert_banner.pack(fill=tk.X, before=self.notebook)
                        if data.get("unauthorized"):
                            self.notebook.select(self.tab_config)
                    else:
                        ready = bool(data.get("ready"))
                        if ready:
                            self.alert_banner.configure(bg="#064e3b")
                            comp = data.get("company") or {}
                            self.lbl_alert_banner.configure(
                                bg="#064e3b",
                                fg="#d1fae5",
                                text=f"✅ Sistema 100% Pronto! Conectado ao Seller '{comp.get('name')}' e comunicação com Horus ERP ({comp.get('horus_url')}) validada.",
                            )
                            self.alert_banner.pack(fill=tk.X, before=self.notebook)
                        else:
                            pending = [
                                c["label"] for c in (data.get("checklist") or []) if not c.get("ok") and c.get("required", True)
                            ]
                            self.alert_banner.configure(bg="#9a3412")
                            self.lbl_alert_banner.configure(
                                bg="#9a3412",
                                fg="#ffedd5",
                                text=f"⚠️ CONFIGURAÇÃO PENDENTE NO SELLER: {', '.join(pending)}. Veja os detalhes na aba 'Diagnóstico Horus & Checklist'.",
                            )
                            self.alert_banner.pack(fill=tk.X, before=self.notebook)
                            self.notebook.select(self.tab_diagnostics)

        except queue.Empty:
            pass
        finally:
            self.after(150, self._process_events)

    def _get_primary_terminal_ip(self) -> str:
        sel = self.tree_terminals.selection()
        if sel:
            vals = self.tree_terminals.item(sel[0], "values")
            if vals and vals[0]:
                return str(vals[0])
        if self.server_thread and self.server_thread.connected_terminals:
            for t in self.server_thread.connected_terminals.values():
                if t.get("ip"):
                    return str(t["ip"])
        return str(self.config_data.get("last_terminal_ip") or "192.168.15.34")

    def unlock_windows_firewall_ui(self) -> None:
        port = int(self.config_data.get("tcp_port") or 6500)
        sc504_port = int(self.config_data.get("sc504_port") or 16510)
        ok, msg = ensure_windows_firewall_rules([port, sc504_port], elevate_with_uac=True)
        if ok:
            messagebox.showinfo("Firewall do Windows Liberado", msg)
        else:
            messagebox.showwarning("Firewall do Windows", msg)

    def open_gertec_network_diagnostic_modal(self) -> None:
        win = tk.Toplevel(self)
        win.title("Conectar / Diagnosticar Leitor Gertec na Rede")
        win.geometry("680x520")
        win.configure(bg="#0f172a")
        win.transient(self)
        win.grab_set()

        top = tk.Frame(win, bg="#1e293b", padx=16, pady=12)
        top.pack(fill=tk.X)

        tk.Label(
            top,
            text="🔍 Diagnóstico e Conexão Automática — Terminal Gertec (Todas as Versões)",
            bg="#1e293b",
            fg="#38bdf8",
            font=("Segoe UI", 11, "bold"),
            anchor="w",
        ).pack(fill=tk.X)

        body = tk.Frame(win, bg="#0f172a", padx=16, pady=12)
        body.pack(fill=tk.BOTH, expand=True)

        row_inputs = tk.Frame(body, bg="#0f172a")
        row_inputs.pack(fill=tk.X, pady=(0, 10))

        tk.Label(row_inputs, text="IP do Leitor Gertec:", bg="#0f172a", fg="#e2e8f0", font=("Segoe UI", 9, "bold")).pack(
            side=tk.LEFT, padx=(0, 6)
        )
        var_term_ip = tk.StringVar(value=self._get_primary_terminal_ip())
        ent_ip = tk.Entry(row_inputs, textvariable=var_term_ip, bg="#1e293b", fg="#ffffff", insertbackground="#ffffff", font=("Consolas", 10), width=16)
        ent_ip.pack(side=tk.LEFT, ipady=3, padx=(0, 12))

        tk.Label(row_inputs, text="Usuário HTTP:", bg="#0f172a", fg="#cbd5e1", font=("Segoe UI", 9)).pack(side=tk.LEFT, padx=(0, 4))
        var_user = tk.StringVar(value="admin")
        tk.Entry(row_inputs, textvariable=var_user, bg="#1e293b", fg="#ffffff", insertbackground="#ffffff", width=8).pack(
            side=tk.LEFT, ipady=3, padx=(0, 8)
        )

        tk.Label(row_inputs, text="Senha HTTP:", bg="#0f172a", fg="#cbd5e1", font=("Segoe UI", 9)).pack(side=tk.LEFT, padx=(0, 4))
        var_pass = tk.StringVar(value="admin")
        tk.Entry(row_inputs, textvariable=var_pass, show="*", bg="#1e293b", fg="#ffffff", insertbackground="#ffffff", width=8).pack(
            side=tk.LEFT, ipady=3, padx=(0, 8)
        )

        txt_report = tk.Text(
            body,
            bg="#1e293b",
            fg="#f8fafc",
            font=("Consolas", 9),
            height=15,
            padx=12,
            pady=10,
            relief=tk.FLAT,
            wrap=tk.WORD,
        )
        txt_report.pack(fill=tk.BOTH, expand=True, pady=(4, 10))

        def _set_report(text_str: str) -> None:
            txt_report.configure(state=tk.NORMAL)
            txt_report.delete("1.0", tk.END)
            txt_report.insert(tk.END, text_str)
            txt_report.configure(state=tk.DISABLED)

        def _run_inspect() -> None:
            tip = var_term_ip.get().strip()
            if not tip:
                return
            self.config_data["last_terminal_ip"] = tip
            save_config(self.config_data)
            all_ips = get_local_ips()
            best_srv_ip = match_best_server_ip_for_terminal(tip, all_ips)
            srv_port = int(self.config_data.get("tcp_port") or 6500)

            _set_report(f"⏳ Conectando ao painel web do Gertec em http://{tip} ...\n")
            win.update_idletasks()

            info = inspect_gertec_web_panel(tip, username=var_user.get().strip() or "admin", password=var_pass.get().strip() or "admin")
            lines = [
                f"=== DIAGNÓSTICO DE REDE DO TERMINAL ({tip}) ===",
                f"• IPs detectados neste computador Windows: {', '.join(all_ips)}",
                f"• IP DO SERVIDOR CORRETO (mesma faixa do Gertec):  {best_srv_ip}  |  Porta TCP: {srv_port}",
                "",
            ]
            if len(all_ips) > 1:
                lines.append(
                    f"⚠️ ATENÇÃO (Múltiplas Placas de Rede): Este PC possui mais de um IP ({', '.join(all_ips)}).\n"
                    f"   O Gertec ({tip}) DEVE apontar para {best_srv_ip} (que está na mesma sub-rede), e NÃO para os outros IPs!"
                )
                lines.append("")

            if info.get("reachable"):
                lines.append(f"✅ Painel Web do Gertec ALCANÇADO em http://{tip}/principal")
                if info.get("model_name") or info.get("firmware"):
                    lines.append(
                        f"   Modelo: {info.get('model_name') or 'Gertec Busca Preço'}  |  "
                        f"Firmware: {info.get('firmware') or 'N/D'}  |  Bootloader: {info.get('bootloader') or 'N/D'}"
                    )
                if info.get("eth_server_ip") or info.get("wifi_server_ip"):
                    lines.append(
                        f"   Configuração atual no Gertec -> Rede (Cabo): {info.get('eth_server_ip') or '-'}:{info.get('eth_server_port') or '-'} "
                        f"| Wi-Fi: {info.get('wifi_server_ip') or '-'}:{info.get('wifi_server_port') or '-'}"
                    )
                lines.append("")
                lines.append("PASSO A PASSO PARA CONECTAR IMEDIATAMENTE:")
                lines.append(f"1. Clique no botão '⚡ Auto-Configurar Gertec' abaixo (ou abra http://{tip} no navegador).")
                lines.append(f"2. Na aba 'Rede' (se usar cabo) E na aba 'Wifi' (se usar Wi-Fi), confira:")
                lines.append(f"     • IP do Servidor = {best_srv_ip}")
                lines.append(f"     • Porta do Servidor = {srv_port}")
                lines.append("3. MUITO IMPORTANTE (Firmware 4.5.0 S): Após clicar em Salvar na aba Rede/Wifi, clique em 'Salvar e Sair' na barra azul superior do painel do Gertec para ele reiniciar e conectar!")
            else:
                lines.append(f"❌ Não foi possível abrir http://{tip}: {info.get('error')}")
                lines.append("   Verifique se o IP exibido no visor do Gertec ao ligar é realmente este e se está na mesma rede.")

            _set_report("\n".join(lines))

        def _run_autoconfig() -> None:
            tip = var_term_ip.get().strip()
            best_srv_ip = match_best_server_ip_for_terminal(tip)
            srv_port = int(self.config_data.get("tcp_port") or 6500)
            ensure_windows_firewall_rules([srv_port, 16510], elevate_with_uac=False)
            ok, msg = auto_configure_gertec_web_panel(
                tip,
                best_srv_ip,
                srv_port,
                username=var_user.get().strip() or "admin",
                password=var_pass.get().strip() or "admin",
            )
            if ok:
                messagebox.showinfo("Configuração Enviada ao Gertec", msg, parent=win)
            else:
                messagebox.showwarning("Configuração Manual no Navegador", msg, parent=win)
            _run_inspect()

        btn_row = tk.Frame(body, bg="#0f172a")
        btn_row.pack(fill=tk.X)

        tk.Button(
            btn_row,
            text="🔍 Diagnosticar IP Agora",
            bg="#0284c7",
            fg="#ffffff",
            relief=tk.FLAT,
            font=("Segoe UI", 9, "bold"),
            padx=12,
            pady=6,
            cursor="hand2",
            command=_run_inspect,
        ).pack(side=tk.LEFT, padx=(0, 8))

        tk.Button(
            btn_row,
            text="⚡ Auto-Configurar Servidor no Gertec e Reiniciar",
            bg="#10b981",
            fg="#0f172a",
            relief=tk.FLAT,
            font=("Segoe UI", 9, "bold"),
            padx=12,
            pady=6,
            cursor="hand2",
            command=_run_autoconfig,
        ).pack(side=tk.LEFT, padx=(0, 8))

        tk.Button(
            btn_row,
            text="🌐 Abrir http:// no Navegador",
            bg="#334155",
            fg="#ffffff",
            relief=tk.FLAT,
            font=("Segoe UI", 9, "bold"),
            padx=12,
            pady=6,
            cursor="hand2",
            command=lambda: __import__("webbrowser").open(f"http://{var_term_ip.get().strip()}"),
        ).pack(side=tk.LEFT)

        win.after(150, _run_inspect)

    def open_thermal_isbn_sheet(self) -> None:
        try:
            import webbrowser
            term_ip = self._get_primary_terminal_ip()
            thermal_path = generate_thermal_80mm_isbn_sheet_html(term_ip)
            webbrowser.open(thermal_path.resolve().as_uri())
        except Exception as e:
            messagebox.showerror(
                "Erro ao Gerar Cupom Térmico 80mm",
                f"Não foi possível abrir o cupom térmico de teste:\n{e}",
            )

    def open_isbn_unlock_sheet(self) -> None:
        try:
            import webbrowser
            term_ip = self._get_primary_terminal_ip()
            sheet_path = generate_isbn_unlock_and_test_sheet_html(term_ip)
            webbrowser.open(sheet_path.resolve().as_uri())
        except Exception as e:
            messagebox.showerror(
                "Erro ao Gerar Folha ISBN",
                f"Não foi possível abrir a folha de destravamento de livros:\n{e}",
            )

    def open_connected_gertec_web_panel(self) -> None:
        try:
            import webbrowser
            term_ip = self._get_primary_terminal_ip()
            webbrowser.open(f"http://{term_ip}")
        except Exception as e:
            messagebox.showerror(
                "Erro ao Abrir Painel Web",
                f"Não foi possível abrir o navegador para o IP do leitor:\n{e}",
            )


if __name__ == "__main__":
    app = CronuzGertecApp()
    app.mainloop()

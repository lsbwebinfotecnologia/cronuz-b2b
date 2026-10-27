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
import socket
import sys
import textwrap
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
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
APP_VERSION = "1.0.0"
APP_TITLE = f"Cronuz Busca Preço — Servidor Gertec G2 v{APP_VERSION}"

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
    "access_token": "",
    "company_name": "",
    "company_document": "",
    "tcp_port": 6500,
    "welcome_line1": "LIVRARIA / PAPELARIA",
    "welcome_line2": "CONSULTE O PRECO AQUI",
    "display_time_sec": 5,
    "cache_ttl_sec": 120,
    "auto_start_server": True,
    "show_stock_in_price_line": False,
}

# Logo Oficial Horus B2B embutida em Base64 (para funcionar dentro do .exe único sem depender de arquivos externos)
HORUS_ICON_B64 = (
    "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"
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
    """Retorna os IPs IPv4 da máquina Windows na rede local (LAN/Wi-Fi)."""
    ips = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        s.connect(("8.8.8.8", 80))
        primary_ip = s.getsockname()[0]
        s.close()
        if primary_ip and not primary_ip.startswith("127."):
            ips.append(primary_ip)
    except Exception:
        pass

    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    except Exception:
        pass

    return ips or ["127.0.0.1"]


# ──────────────────────────────────────────────────────────────────────────────
# Protocolo Oficial Gertec Busca Preço G2 (TC406 / BPG2S / BPG2E)
# ──────────────────────────────────────────────────────────────────────────────
PRODUCT_NAME_LINE_WIDTH = 20
PRODUCT_NAME_LINE_COUNT = 4
PRODUCT_NAME_MAX_LENGTH = PRODUCT_NAME_LINE_WIDTH * PRODUCT_NAME_LINE_COUNT  # 80 bytes
PRICE_MAX_LENGTH = 20


def strip_accents(text: str) -> str:
    """Remove acentos e caracteres especiais que o display LCD/Gráfico ASCII do Gertec não exibe."""
    if not text:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(text))
    ascii_str = nfkd.encode("ASCII", "ignore").decode("ASCII")
    # Remove pipe '|' pois é o delimitador de protocolo entre Nome e Preço
    return ascii_str.replace("|", " ").upper()


def format_gertec_product_name(nome: str, autor_ou_editora: str = "") -> str:
    """
    Formata o nome do produto para as 4 linhas x 20 colunas (80 bytes) do Gertec G2.
    Se houver espaço nas linhas inferiores e autor/editora existir, exibe na última linha.
    """
    clean_name = " ".join(strip_accents(nome or "PRODUTO").split())
    lines = textwrap.wrap(
        clean_name,
        width=PRODUCT_NAME_LINE_WIDTH,
        max_lines=PRODUCT_NAME_LINE_COUNT,
        placeholder="...",
    )
    if not lines:
        lines = ["PRODUTO"]

    # Se sobrou linha e temos editora/autor, coloca na 4ª linha para enriquecer o visor
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
    Comando #mesg para configurar as frases de espera no visor do Gertec G2 / G2S.
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
) -> bytes:
    """
    Monta o pacote de resposta de preço do protocolo Gertec G2:
      #<80 bytes nome>|<até 20 bytes preço>
    """
    formatted_name = format_gertec_product_name(nome, extra_info)
    if preco is not None and preco > 0:
        price_str = f"R$ {preco:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
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

    def lookup_barcode(self, barcode: str) -> Dict[str, Any]:
        """
        Consulta o código de barras na API Cronuz (/product-search/product),
        que por sua vez consulta o Horus ERP do Seller respeitando OFFSET/LIMIT e filiais,
        e grava o log analítico com source='physical_scanner'.
        """
        status_code, data = self._request(
            "GET",
            "/product-search/product",
            params={
                "term": barcode,
                "search_option": "BARRAS_ISBN",
                "source": "physical_scanner",
                "offset": 0,
                "limit": 5,
            },
            timeout=12.0,
        )

        if status_code == 200 and isinstance(data, dict):
            items = data.get("items") or []
            if len(items) > 0:
                first = items[0]
                nome = first.get("NOM_ITEM") or "PRODUTO SEM NOME"
                raw_price = first.get("VLR_CAPA") or first.get("PRECO_VENDA") or 0
                preco = None
                try:
                    if isinstance(raw_price, str):
                        preco = float(raw_price.replace(".", "").replace(",", ".") if "," in raw_price and "." in raw_price else raw_price.replace(",", "."))
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
                isbn = first.get("COD_BARRA_ITEM") or first.get("BARRAS_ISBN") or barcode
                return {
                    "found": True,
                    "barcode": str(isbn),
                    "nome": str(nome),
                    "preco": preco,
                    "saldo": saldo,
                    "extra": str(editora),
                    "cod_item": first.get("COD_ITEM"),
                    "error": None,
                }
            return {"found": False, "barcode": barcode, "error": None}

        if status_code == 400 and isinstance(data, dict):
            detail = str(data.get("detail") or "")
            # Quando o Horus retorna "Nenhum produto localizado" como HTTP 400
            if "nenhum" in detail.lower() or "não encontrado" in detail.lower() or "nao encontrado" in detail.lower():
                return {"found": False, "barcode": barcode, "error": None}
            return {"found": False, "barcode": barcode, "error": detail}

        err_msg = data.get("detail") if isinstance(data, dict) else str(data)
        return {
            "found": False,
            "barcode": barcode,
            "error": err_msg or f"Erro HTTP {status_code}",
        }


# ──────────────────────────────────────────────────────────────────────────────
# Servidor Socket TCP/IP Assíncrono para os Leitores Gertec G2
# ──────────────────────────────────────────────────────────────────────────────
class GertecTcpServerThread(threading.Thread):
    def __init__(self, config_getter, event_queue: queue.Queue):
        super().__init__(daemon=True, name="GertecTcpServerThread")
        self.config_getter = config_getter
        self.event_queue = event_queue
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.server: Optional[asyncio.AbstractServer] = None
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

        self.running = True
        self.emit("server_started", {"port": port, "ips": get_local_ips()})
        logger.info("Servidor TCP Gertec G2 ouvindo em 0.0.0.0:%d", port)

        async with self.server:
            await self.server.serve_forever()

    def stop(self) -> None:
        if self.loop and self.running:
            self.loop.call_soon_threadsafe(self._shutdown_loop)

    def _shutdown_loop(self) -> None:
        if self.server:
            self.server.close()
        for task in asyncio.all_tasks(self.loop):
            task.cancel()

    def resolve_barcode_sync(self, barcode: str, terminal_label: str = "SIMULADOR") -> Tuple[bytes, Dict[str, Any]]:
        """Consulta um código de barras (usando cache ou chamando a API Cronuz) e formata a resposta Gertec."""
        cfg = self.config_getter()
        ttl = int(cfg.get("cache_ttl_sec") or 120)
        show_stock = bool(cfg.get("show_stock_in_price_line", False))
        now = time.time()

        clean_bc = barcode.strip()
        cached = self.cache.get(clean_bc)
        if cached and (now - cached["ts"]) < ttl:
            res = dict(cached["data"])
            res["from_cache"] = True
        else:
            api = CronuzApiClient(cfg.get("api_base_url", ""), cfg.get("access_token", ""))
            t0 = time.time()
            res = api.lookup_barcode(clean_bc)
            res["latency_ms"] = int((time.time() - t0) * 1000)
            res["from_cache"] = False
            if res.get("found") and not res.get("error"):
                self.cache[clean_bc] = {"data": res, "ts": now}

        if res.get("error"):
            resp_bytes = build_gertec_price_response("ERRO DE COMUNICACAO", None, "VERIFIQUE O SERVIDOR")
        elif res.get("found"):
            resp_bytes = build_gertec_price_response(
                nome=res.get("nome", "PRODUTO"),
                preco=res.get("preco"),
                extra_info=res.get("extra", ""),
                saldo=res.get("saldo"),
                show_stock=show_stock,
            )
        else:
            resp_bytes = b"#nfound"

        log_entry = {
            "time": datetime.now().strftime("%H:%M:%S"),
            "terminal": terminal_label,
            "barcode": clean_bc,
            "found": bool(res.get("found")),
            "nome": res.get("nome") or ("ERRO: " + res["error"] if res.get("error") else "NÃO ENCONTRADO (#nfound)"),
            "preco": res.get("preco"),
            "saldo": res.get("saldo"),
            "from_cache": res.get("from_cache", False),
            "latency_ms": res.get("latency_ms", 0),
            "error": res.get("error"),
            "raw_gertec": resp_bytes.decode("ascii", errors="replace"),
        }
        self.emit("query_logged", log_entry)
        return resp_bytes, log_entry

    async def _handle_terminal(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        addr = writer.get_extra_info("peername")
        ip = addr[0] if addr else "0.0.0.0"
        port = addr[1] if addr else 0
        addr_str = f"{ip}:{port}"

        self.connected_terminals[addr_str] = {
            "ip": ip,
            "addr": addr_str,
            "model": "Conectando...",
            "connected_at": datetime.now().strftime("%H:%M:%S"),
            "last_seen": datetime.now().strftime("%H:%M:%S"),
            "queries": 0,
        }
        self.emit("terminals_updated", {"terminals": list(self.connected_terminals.values())})
        logger.info("Terminal Gertec conectado: %s", addr_str)

        try:
            # 1. Handshake inicial obrigatório (#ok)
            writer.write(b"#ok")
            await writer.drain()
            await asyncio.sleep(0.3)

            model_response = "Gertec G2"
            try:
                data = await asyncio.wait_for(reader.read(255), timeout=5.0)
                if data:
                    decoded = data.decode("ascii", errors="replace").strip("\x00").strip()
                    if decoded:
                        model_response = decoded
            except asyncio.TimeoutError:
                pass

            self.connected_terminals[addr_str]["model"] = model_response
            self.emit("terminals_updated", {"terminals": list(self.connected_terminals.values())})
            logger.info("Handshake terminal %s -> %s", addr_str, model_response)

            # 2. Envia #alwayslive
            writer.write(b"#alwayslive")
            await writer.drain()
            await asyncio.sleep(0.2)
            try:
                await asyncio.wait_for(reader.read(255), timeout=3.0)
            except asyncio.TimeoutError:
                pass

            # 3. Se não for G2E, envia mensagem de boas-vindas customizada (#mesg)
            is_g2e = "bpg2e" in model_response.lower()
            cfg = self.config_getter()
            if not is_g2e:
                w1 = cfg.get("welcome_line1", "LIVRARIA")
                w2 = cfg.get("welcome_line2", "CONSULTE AQUI!")
                t_sec = int(cfg.get("display_time_sec") or 5)
                writer.write(build_gertec_mesg(w1, w2, t_sec))
                await writer.drain()

            # 4. Loop de escuta de códigos de barras e Keep-Alive (#live?)
            while True:
                try:
                    data = await asyncio.wait_for(reader.read(255), timeout=90.0)
                except asyncio.TimeoutError:
                    writer.write(b"#live?")
                    await writer.drain()
                    continue

                if not data:
                    break

                self.connected_terminals[addr_str]["last_seen"] = datetime.now().strftime("%H:%M:%S")
                msg = data.decode("ascii", errors="replace").strip("\x00").strip()
                if not msg:
                    continue

                if msg == "#live" or msg.startswith(
                    ("#gif_ok", "#img_error", "#mesg_error", "#alwayslive", "#tc406", "#tc502", "#bpg2")
                ):
                    self.emit("terminals_updated", {"terminals": list(self.connected_terminals.values())})
                    continue

                # Extrai o código de barras (com ou sem '#' inicial)
                barcode = msg[1:].strip() if msg.startswith("#") else msg.strip()
                if not barcode:
                    continue

                self.connected_terminals[addr_str]["queries"] += 1
                self.emit("terminals_updated", {"terminals": list(self.connected_terminals.values())})

                # Executa a busca em thread separada para não bloquear o loop de sockets
                resp_bytes, _ = await asyncio.get_running_loop().run_in_executor(
                    None, self.resolve_barcode_sync, barcode, ip
                )
                writer.write(resp_bytes)
                await writer.drain()

        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.warning("Conexão encerrada com terminal %s: %s", addr_str, exc)
        finally:
            self.connected_terminals.pop(addr_str, None)
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
            text="Horus & Cronuz Busca Preço — Servidor Gertec G2",
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
        self.tree_terminals = ttk.Treeview(term_card, columns=cols_term, show="headings", height=4)
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

        self.config_data["tcp_port"] = port
        self.config_data["welcome_line1"] = self.var_welcome1.get().strip()[:20]
        self.config_data["welcome_line2"] = self.var_welcome2.get().strip()[:20]
        self.config_data["cache_ttl_sec"] = max(0, ttl)
        self.config_data["show_stock_in_price_line"] = bool(self.var_show_stock.get())
        self.config_data["auto_start_server"] = bool(self.var_auto_start.get())
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


if __name__ == "__main__":
    app = CronuzGertecApp()
    app.mainloop()

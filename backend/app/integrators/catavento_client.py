"""
Integrador Catavento (WinBooks Web API)
---------------------------------------
Base URL padrão: https://api.cataventobr.com.br

Autenticação:
  POST /Sistema/Seguranca/Autenticar
  Body: {"Email": "...", "Senha": "..."}
  Response: {"Codigo": 200, "Token": "..."}
  → Token expira após 2h de inatividade e é cacheado em dst_distributor.token.

Consulta rápida de situação/estoque por ISBN:
  GET /BDIApi/Produto/Situacao?codigo=<ISBN>
  Header: API_TOKEN: <token>
  Response: {"CodigoDeBarras": "...", "Estoque": <int>, "Preco": <float>, "Situacao": <int>, ...}
  (Rota leve que não carrega resenhas e autores pesados do ERP).

Consulta detalhada (fallback):
  GET /BDIApi/Produto/Buscar?codigo=<ISBN>
"""

from typing import Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import httpx
import logging
import time

logger = logging.getLogger(__name__)

CATAVENTO_DEFAULT_BASE_URL = "https://api.cataventobr.com.br"
# Latência medida em produção (19/10/2026): Autenticar ≈ 8–10s | BuscarVarios ≈ 9–18s.
# O servidor da Catavento é o gargalo — read timeout precisa acomodar picos de ~20s.
CATAVENTO_TIMEOUT = httpx.Timeout(32.0, connect=6.0, read=30.0)
CATAVENTO_AUTH_TIMEOUT = httpx.Timeout(20.0, connect=6.0)
DEFAULT_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "CronuzB2B/1.0",
}

# Cache curto em memória (por worker) de resultados por ISBN para evitar
# chamadas repetidas de ~10s ao mesmo produto (ex.: busca + atualizar).
_RESULT_CACHE_TTL_SECONDS = 180
_result_cache: Dict[str, tuple] = {}


def _is_cloudflare_block(resp: "httpx.Response") -> bool:
    """403 do Cloudflare (WAF) não significa token expirado — não deve disparar re-auth."""
    try:
        return "cloudflare" in (resp.text or "")[:400].lower()
    except Exception:
        return False


class CataventoClient:
    """
    Cliente assíncrono para a API Catavento (WinBooks Web).

    Recebe as credenciais diretamente (sem acesso ao banco) para ser
    reutilizável em qualquer contexto. O chamador é responsável por
    persistir/atualizar o token no banco quando ele for renovado.
    """

    def __init__(
        self,
        base_url: str,
        username: str,
        password: str,
        token: Optional[str] = None,
        token_expires: Optional[datetime] = None,
    ):
        raw_url = (base_url or CATAVENTO_DEFAULT_BASE_URL).strip().rstrip("/")
        if not raw_url.startswith("http://") and not raw_url.startswith("https://"):
            raw_url = f"https://{raw_url}"
        self.base_url       = raw_url
        self.username       = username
        self.password       = password
        self._token         = token
        self._token_expires = token_expires
        # Flag: se True, o token foi renovado nesta instância e deve ser
        # persistido pelo chamador em dst_distributor.token
        self.token_renewed  = False
        self.new_token: Optional[str] = None
        self.last_auth_error: Optional[str] = None

    @property
    def token_expires(self) -> Optional[datetime]:
        return self._token_expires

    # ──────────────────────────────────────────────────────────────────
    # Autenticação
    # ──────────────────────────────────────────────────────────────────
    async def authenticate(self) -> bool:
        """
        Gera/renova o token via POST /Sistema/Seguranca/Autenticar.
        Retorna True se bem-sucedido, False se falhar.
        Documentação WinBooks: token expira após 30 min de inatividade.
        """
        if not self.username or not self.password:
            self.last_auth_error = "E-mail ou senha da Catavento não configurados."
            return False

        url = f"{self.base_url}/Sistema/Seguranca/Autenticar"
        try:
            async with httpx.AsyncClient(timeout=CATAVENTO_AUTH_TIMEOUT, follow_redirects=True) as client:
                resp = await client.post(
                    url,
                    json={"Email": self.username, "Senha": self.password},
                    headers={"Content-Type": "application/json", **DEFAULT_HEADERS},
                )
            if resp.status_code == 200:
                data = resp.json()
                if data.get("Codigo") == 200 and data.get("Token"):
                    self._token = data["Token"]
                    # Token expira após 30 min sem uso conforme docs WinBooks. Usamos 25 min como margem de segurança.
                    self._token_expires = datetime.now(timezone.utc) + timedelta(minutes=25)
                    self.token_renewed  = True
                    self.new_token      = self._token
                    self.last_auth_error = None
                    logger.info("[CataventoClient] Token renovado com sucesso.")
                    return True
                else:
                    msgs = data.get("Mensagens") or data.get("Mensagem")
                    if isinstance(msgs, list):
                        self.last_auth_error = "; ".join(str(m) for m in msgs)
                    elif msgs:
                        self.last_auth_error = str(msgs)
                    else:
                        self.last_auth_error = "Credenciais da Catavento recusadas."
            elif resp.status_code in (401, 403):
                self.last_auth_error = "E-mail ou senha da Catavento inválidos."
            else:
                self.last_auth_error = f"Falha na autenticação Catavento (HTTP {resp.status_code})."
            
            logger.warning(f"[CataventoClient] Falha ao autenticar. Status: {resp.status_code}, Msg: {self.last_auth_error}")
        except httpx.TimeoutException:
            self.last_auth_error = "Tempo limite esgotado ao autenticar na Catavento."
            logger.error("[CataventoClient] Timeout na autenticação.")
        except httpx.ConnectError:
            self.last_auth_error = "Não foi possível conectar ao servidor da Catavento (serviço offline)."
            logger.error("[CataventoClient] Falha de conexão ao servidor.")
        except Exception as e:
            self.last_auth_error = f"Erro de conexão com a Catavento: {e}"
            logger.error(f"[CataventoClient] Erro ao autenticar: {e}")
        return False

    def _is_token_valid(self) -> bool:
        if not self._token:
            return False
        if self._token_expires and datetime.now(timezone.utc) >= self._token_expires:
            return False
        return True

    async def _ensure_token(self) -> bool:
        """
        Garante que há um token utilizável.

        Estratégia otimista: se existe QUALQUER token cacheado (mesmo com a validade
        local vencida), tentamos usá-lo. A autenticação da Catavento custa ~9s, então
        só re-autenticamos quando o servidor realmente rejeitar (401/403 não-Cloudflare).
        """
        if self._token:
            return True
        return await self.authenticate()

    # ──────────────────────────────────────────────────────────────────
    # Consulta de estoque por código de barras (ISBN)
    # ──────────────────────────────────────────────────────────────────
    async def get_stock_by_isbn(self, isbn: str, _retried: bool = False) -> Dict[str, Any]:
        """
        Consulta estoque de um produto pelo código de barras (ISBN).
        
        Utiliza a rota funcional POST /BDIApi/Produto/BuscarVarios com payload [isbn],
        que responde com a lista de dados reais de estoque e preço no WinBooks.

        Resiliência:
          - Cache em memória de 180s por (usuário, ISBN) → evita repetir chamadas de ~10s.
          - Token otimista (ver _ensure_token) → re-auth apenas se o servidor rejeitar.
          - Re-autenticação limitada a UMA tentativa por chamada (sem recursão infinita).
          - 403 do Cloudflare (WAF) é reportado como bloqueio, não como sessão expirada.
        """
        cache_key = f"{(self.username or '').lower()}|{isbn}"
        cached = _result_cache.get(cache_key)
        if cached and (time.monotonic() - cached[0]) < _RESULT_CACHE_TTL_SECONDS:
            return cached[1]

        if not await self._ensure_token():
            return {
                "found": False,
                "saldo": 0,
                "error": self.last_auth_error or "Falha ao autenticar na Catavento.",
                "raw": {},
            }

        headers = {
            "API_TOKEN": self._token,
            "Content-Type": "application/json",
            **DEFAULT_HEADERS,
        }

        try:
            async with httpx.AsyncClient(timeout=CATAVENTO_TIMEOUT, follow_redirects=True) as client:
                url_buscar = f"{self.base_url}/BDIApi/Produto/BuscarVarios"
                try:
                    resp = await client.post(url_buscar, json=[isbn], headers=headers)
                except httpx.ConnectTimeout:
                    # Falha transitória de conexão (rápida) — 1 nova tentativa
                    resp = await client.post(url_buscar, json=[isbn], headers=headers)

            if resp.status_code == 404:
                result = {"found": False, "saldo": 0, "error": None, "raw": []}
                _result_cache[cache_key] = (time.monotonic(), result)
                return result

            if resp.status_code in (401, 403):
                if _is_cloudflare_block(resp):
                    return {
                        "found": False,
                        "saldo": 0,
                        "error": "Acesso bloqueado pelo firewall da Catavento (Cloudflare).",
                        "raw": {},
                    }
                if not _retried:
                    # Token expirou no servidor — re-autentica UMA única vez
                    logger.warning("[CataventoClient] Token rejeitado (%s), re-autenticando...", resp.status_code)
                    if await self.authenticate():
                        return await self.get_stock_by_isbn(isbn, _retried=True)
                return {
                    "found": False,
                    "saldo": 0,
                    "error": self.last_auth_error or "Sessão expirada na Catavento (403).",
                    "raw": {},
                }

            if resp.status_code != 200:
                return {
                    "found": False,
                    "saldo": 0,
                    "error": f"Serviço Catavento indisponível (HTTP {resp.status_code}).",
                    "raw": {},
                }

            data = resp.json()
            # Atividade bem-sucedida estende a sessão no servidor da Catavento
            self._token_expires = datetime.now(timezone.utc) + timedelta(minutes=25)

            if isinstance(data, list) and len(data) > 0:
                prod = data[0]
                result = {
                    "found":    True,
                    "saldo":    int(prod.get("Estoque") or 0),
                    "preco":    float(prod.get("Preco") or 0),
                    "situacao": prod.get("Situacao"),
                    "titulo":   (prod.get("Descricao") or "").strip(),
                    "editora":  (prod.get("Editora") or "").strip(),
                    "raw":      prod,
                    "error":    None,
                }
            else:
                result = {"found": False, "saldo": 0, "error": None, "raw": data or []}

            _result_cache[cache_key] = (time.monotonic(), result)
            # Limpeza simples para o cache não crescer indefinidamente
            if len(_result_cache) > 2000:
                cutoff = time.monotonic() - _RESULT_CACHE_TTL_SECONDS
                for k in [k for k, v in _result_cache.items() if v[0] < cutoff]:
                    _result_cache.pop(k, None)
            return result

        except httpx.TimeoutException:
            return {"found": False, "saldo": 0, "error": "A Catavento demorou mais de 30s para responder (lentidão no servidor deles). Tente novamente.", "raw": {}}
        except httpx.ConnectError:
            return {"found": False, "saldo": 0, "error": "Servidor da Catavento inacessível no momento.", "raw": {}}
        except Exception as e:
            logger.error(f"[CataventoClient] Erro ao consultar ISBN {isbn}: {e}")
            return {"found": False, "saldo": 0, "error": f"Erro na consulta Catavento: {str(e)}", "raw": {}}

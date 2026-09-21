"""
Integrador Catavento (WinBooks Web API)
---------------------------------------
Base URL padrão: https://api.cataventobr.com.br

Autenticação:
  POST /Sistema/Seguranca/Autenticar
  Body: {"Email": "...", "Senha": "..."}
  Response: {"Codigo": 200, "Token": "..."}
  → Token cacheado em dst_distributor.token e renovado ao receber 403.

Consulta de estoque por ISBN:
  GET /BDIApi/Produto/Buscar?codigo=<ISBN>
  Header: API_TOKEN: <token>
  Response: {"Estoque": <int>, "Preco": <float>, "CodigoDeBarras": "...", ...}

Rate limit: sem limite documentado — usar com moderação.
"""

from typing import Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import httpx
import logging

logger = logging.getLogger(__name__)

CATAVENTO_DEFAULT_BASE_URL = "http://api.cataventobr.com.br"


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
        # O endpoint HTTPS da Catavento sofre com travamento/timeout de SSL na rota de busca.
        # Forçamos http:// para garantir resposta imediata idêntica à integração PHP estável.
        if "api.cataventobr.com.br" in raw_url and raw_url.startswith("https://"):
            raw_url = "http://" + raw_url[len("https://"):]
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
        Token tem validade de ~23h (definida pelo servidor).
        """
        if not self.username or not self.password:
            self.last_auth_error = "E-mail ou senha da Catavento não configurados."
            return False

        url = f"{self.base_url}/Sistema/Seguranca/Autenticar"
        try:
            async with httpx.AsyncClient(timeout=25.0, follow_redirects=True) as client:
                resp = await client.post(
                    url,
                    json={"Email": self.username, "Senha": self.password},
                    headers={"Content-Type": "application/json"},
                )
            if resp.status_code == 200:
                data = resp.json()
                if data.get("Codigo") == 200 and data.get("Token"):
                    self._token = data["Token"]
                    # Token expira em 23 horas (conservador)
                    self._token_expires = datetime.now(timezone.utc) + timedelta(hours=23)
                    self.token_renewed  = True
                    self.new_token      = self._token
                    self.last_auth_error = None
                    logger.info("[CataventoClient] Token renovado com sucesso.")
                    return True
                else:
                    self.last_auth_error = data.get("Mensagem") or "Credenciais da Catavento recusadas."
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
        """Garante que há um token válido, renovando se necessário."""
        if self._is_token_valid():
            return True
        return await self.authenticate()

    # ──────────────────────────────────────────────────────────────────
    # Consulta de estoque por código de barras (ISBN)
    # ──────────────────────────────────────────────────────────────────
    async def get_stock_by_isbn(self, isbn: str) -> Dict[str, Any]:
        """
        Consulta estoque de um produto pelo código de barras (ISBN).

        GET /BDIApi/Produto/Buscar?codigo=<isbn>
        Header: API_TOKEN: <token>
        """
        if not await self._ensure_token():
            return {
                "found": False,
                "saldo": 0,
                "error": self.last_auth_error or "Falha ao autenticar na Catavento.",
                "raw": {},
            }

        url = f"{self.base_url}/BDIApi/Produto/Buscar"
        try:
            async with httpx.AsyncClient(timeout=25.0, follow_redirects=True) as client:
                resp = await client.get(
                    url,
                    params={"codigo": isbn},
                    headers={"API_TOKEN": self._token},
                )

            if resp.status_code == 404:
                return {"found": False, "saldo": 0, "error": None, "raw": {}}

            if resp.status_code == 403:
                # Token expirou no servidor — re-autentica UMA vez
                logger.warning("[CataventoClient] Token rejeitado (403), re-autenticando...")
                if await self.authenticate():
                    return await self.get_stock_by_isbn(isbn)
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
            if not data:
                return {"found": False, "saldo": 0, "error": None, "raw": {}}

            # Trata resposta de produto não encontrado (objeto zerado)
            if data.get("Estoque") is None and not data.get("CodigoDeBarras"):
                return {"found": False, "saldo": 0, "error": None, "raw": data}

            return {
                "found":    True,
                "saldo":    int(data.get("Estoque") or 0),
                "preco":    float(data.get("Preco") or 0),
                "situacao": data.get("Situacao"),
                "titulo":   (data.get("Descricao") or "").strip(),
                "editora":  (data.get("Editora") or "").strip(),
                "raw":      data,
                "error":    None,
            }

        except httpx.TimeoutException:
            return {"found": False, "saldo": 0, "error": "Tempo limite esgotado ao consultar a Catavento (Timeout).", "raw": {}}
        except httpx.ConnectError:
            return {"found": False, "saldo": 0, "error": "Servidor da Catavento inacessível no momento.", "raw": {}}
        except Exception as e:
            logger.error(f"[CataventoClient] Erro ao consultar ISBN {isbn}: {e}")
            return {"found": False, "saldo": 0, "error": f"Erro na consulta Catavento: {str(e)}", "raw": {}}

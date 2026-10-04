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

logger = logging.getLogger(__name__)

CATAVENTO_DEFAULT_BASE_URL = "https://api.cataventobr.com.br"
CATAVENTO_TIMEOUT = httpx.Timeout(6.0, connect=3.0, read=4.5)
DEFAULT_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "CronuzB2B/1.0",
}


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
        Documentação WinBooks: token expira após 2h de inatividade.
        """
        if not self.username or not self.password:
            self.last_auth_error = "E-mail ou senha da Catavento não configurados."
            return False

        url = f"{self.base_url}/Sistema/Seguranca/Autenticar"
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(8.0, connect=3.0), follow_redirects=True) as client:
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
        
        Utiliza prioritariamente a rota otimizada /BDIApi/Produto/Situacao?codigo=<isbn>,
        que retorna diretamente o status de estoque sem o overhead de joins com sinopses,
        autores e categorias do ERP WinBooks.
        """
        if not await self._ensure_token():
            return {
                "found": False,
                "saldo": 0,
                "error": self.last_auth_error or "Falha ao autenticar na Catavento.",
                "raw": {},
            }

        headers = {"API_TOKEN": self._token, **DEFAULT_HEADERS}
        params = {"codigo": isbn}

        try:
            async with httpx.AsyncClient(timeout=CATAVENTO_TIMEOUT, follow_redirects=True) as client:
                # 1. Rota rápida documentada: /BDIApi/Produto/Situacao
                url_situacao = f"{self.base_url}/BDIApi/Produto/Situacao"
                resp = await client.get(url_situacao, params=params, headers=headers)

                # Se a rota /Situacao responder 404 de endpoint não encontrado ou erro inesperado,
                # fazemos fallback transparente para /BDIApi/Produto/Buscar
                if resp.status_code == 404:
                    # Pode ser produto inexistente OU rota inexistente. Checa se o corpo é JSON de produto
                    try:
                        data = resp.json()
                        if isinstance(data, dict):
                            return {"found": False, "saldo": 0, "error": None, "raw": data}
                    except Exception:
                        pass
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

                # Fallback para /Buscar se /Situacao falhar com erro de servidor (ex: 500 ou 405)
                if resp.status_code not in (200, 404):
                    url_buscar = f"{self.base_url}/BDIApi/Produto/Buscar"
                    resp = await client.get(url_buscar, params=params, headers=headers)
                    if resp.status_code == 404:
                        return {"found": False, "saldo": 0, "error": None, "raw": {}}
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

                # Atualiza a validade do token por mais 25 minutos devido à atividade
                self._token_expires = datetime.now(timezone.utc) + timedelta(minutes=25)

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

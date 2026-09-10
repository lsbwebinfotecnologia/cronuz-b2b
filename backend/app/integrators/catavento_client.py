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

CATAVENTO_DEFAULT_BASE_URL = "https://api.cataventobr.com.br"


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
        self.base_url      = (base_url or CATAVENTO_DEFAULT_BASE_URL).rstrip("/")
        self.username      = username
        self.password      = password
        self._token        = token
        self._token_expires = token_expires
        # Flag: se True, o token foi renovado nesta instância e deve ser
        # persistido pelo chamador em dst_distributor.token
        self.token_renewed = False
        self.new_token: Optional[str] = None

    # ──────────────────────────────────────────────────────────────────
    # Autenticação
    # ──────────────────────────────────────────────────────────────────
    async def authenticate(self) -> bool:
        """
        Gera/renova o token via POST /Sistema/Seguranca/Autenticar.
        Retorna True se bem-sucedido, False se falhar.
        Token tem validade de ~23h (definida pelo servidor).
        """
        url = f"{self.base_url}/Sistema/Seguranca/Autenticar"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
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
                    logger.info("[CataventoClient] Token renovado com sucesso.")
                    return True
            logger.warning(f"[CataventoClient] Falha ao autenticar. Status: {resp.status_code}, Body: {resp.text[:200]}")
        except Exception as e:
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

        Returns:
            {
              "found": bool,
              "saldo": int,
              "preco": float | None,
              "situacao": int | None,
              "titulo": str | None,
              "editora": str | None,
              "raw": dict,   # payload completo da API
              "error": str | None,
            }
        """
        if not await self._ensure_token():
            return {"found": False, "saldo": 0, "error": "Falha ao autenticar na Catavento.", "raw": {}}

        url = f"{self.base_url}/BDIApi/Produto/Buscar"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
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
                return {"found": False, "saldo": 0, "error": "Token inválido (403).", "raw": {}}

            if resp.status_code != 200:
                return {"found": False, "saldo": 0, "error": f"HTTP {resp.status_code}", "raw": {}}

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

        except Exception as e:
            logger.error(f"[CataventoClient] Erro ao consultar ISBN {isbn}: {e}")
            return {"found": False, "saldo": 0, "error": str(e), "raw": {}}

"""
Integrador Disal Marketplace API
-----------------------------------
Base URL: https://marketplaceintegracao.disal.com.br

Autenticação:
  Header fixo: xLtOpenKeyId: <api_key>
  Sem OAuth/login — basta o token de acesso privado.

Consulta de estoque por EAN (ISBN-13):
  GET /api/estoque/byEAN?EAN=<isbn>
  Header: xLtOpenKeyId: <api_key>
  Response: JSON com campos de estoque.

Rate limit:
  /api/estoque/byEAN → 2/seg, 60/min, 1800/hora
"""

from typing import Optional, Dict, Any
import httpx
import logging

logger = logging.getLogger(__name__)

DISAL_DEFAULT_BASE_URL = "https://marketplaceintegracao.disal.com.br"


class DisalClient:
    """
    Cliente assíncrono para a API Disal Marketplace.

    Autenticação via header `xLtOpenKeyId` — sem login/token temporário.
    """

    def __init__(self, base_url: str, api_key: str):
        self.base_url = (base_url or DISAL_DEFAULT_BASE_URL).rstrip("/")
        self.api_key  = api_key

    async def get_stock_by_isbn(self, isbn: str) -> Dict[str, Any]:
        """
        Consulta estoque de um produto pelo EAN/ISBN.

        GET /api/estoque/byEAN?EAN=<isbn>
        Header: xLtOpenKeyId: <api_key>

        Resposta de sucesso (produto encontrado):
            { "ean": "...", "saldo": <int>, "preco": <float>, ... }

        Resposta de produto não encontrado:
            Objeto zerado (saldo=0, EAN vazio).

        Returns:
            {
              "found": bool,
              "saldo": int,
              "preco": float | None,
              "titulo": str | None,
              "raw": dict,
              "error": str | None,
            }
        """
        if not self.api_key:
            return {
                "found": False,
                "saldo": 0,
                "error": "Chave de API da Disal não configurada.",
                "raw": {},
            }

        url = f"{self.base_url}/api/estoque/byEAN"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    url,
                    params={"EAN": isbn},
                    headers={"xLtOpenKeyId": self.api_key},
                )

            if resp.status_code == 401:
                return {
                    "found": False,
                    "saldo": 0,
                    "error": "Chave de API da Disal inválida ou expirada (401).",
                    "raw": {},
                }

            if resp.status_code == 400:
                body = {}
                try:
                    body = resp.json()
                except Exception:
                    pass
                return {
                    "found": False,
                    "saldo": 0,
                    "error": body.get("Message") or "Requisição rejeitada pela API Disal (400).",
                    "raw": body,
                }

            if resp.status_code == 429:
                return {
                    "found": False,
                    "saldo": 0,
                    "error": "Limite de consultas excedido na Disal (Rate limit). Tente novamente em instantes.",
                    "raw": {},
                }

            if resp.status_code != 200:
                return {
                    "found": False,
                    "saldo": 0,
                    "error": f"Serviço da Disal indisponível (HTTP {resp.status_code}).",
                    "raw": {},
                }

            data = resp.json()
            if not data or not isinstance(data, dict):
                return {"found": False, "saldo": 0, "error": None, "raw": {}}

            # Normaliza chaves para case-insensitive por segurança, mantendo acesso direto às oficiais
            # Oficial Disal: {"DATA_ATUALIZACAO_ESTOQUE": "...", "ESTOQUE": 2, "DESCRICAO": "...", "EDITORA": "...", "EAN": "...", "PRECO_CAPA": 101.0, "CODIGOINTERNO": "..."}
            ean_retornado = str(
                data.get("EAN")
                or data.get("ean")
                or data.get("CodigoEAN")
                or ""
            ).strip()

            raw_saldo = (
                data.get("ESTOQUE")
                if data.get("ESTOQUE") is not None
                else (
                    data.get("saldo")
                    or data.get("Saldo")
                    or data.get("estoque")
                    or data.get("Estoque")
                    or 0
                )
            )
            saldo = int(raw_saldo or 0)

            if not ean_retornado or ean_retornado == "0":
                return {"found": False, "saldo": 0, "error": None, "raw": data}

            raw_preco = (
                data.get("PRECO_CAPA")
                if data.get("PRECO_CAPA") is not None
                else (data.get("preco") or data.get("Preco") or data.get("PRECO") or 0)
            )
            preco = float(raw_preco or 0)

            titulo = str(
                data.get("DESCRICAO")
                or data.get("descricao")
                or data.get("titulo")
                or data.get("Titulo")
                or ""
            ).strip()

            return {
                "found":          True,
                "saldo":          saldo,
                "preco":          preco,
                "titulo":         titulo,
                "editora":        str(data.get("EDITORA") or data.get("editora") or "").strip() or None,
                "codigo_interno": str(data.get("CODIGOINTERNO") or "").strip() or None,
                "raw":            data,
                "error":          None,
            }

        except httpx.TimeoutException:
            return {"found": False, "saldo": 0, "error": "Tempo limite esgotado ao consultar a Disal (Timeout).", "raw": {}}
        except httpx.ConnectError:
            return {"found": False, "saldo": 0, "error": "Servidor da Disal inacessível no momento.", "raw": {}}
        except Exception as e:
            logger.error(f"[DisalClient] Erro ao consultar ISBN {isbn}: {e}")
            return {"found": False, "saldo": 0, "error": f"Erro na consulta Disal: {str(e)}", "raw": {}}

    async def get_stock_changes_by_date(
        self,
        data_inicial: str,
        data_final: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Consulta lista de produtos com estoque/dados alterados no período.
        GET /api/estoque/listadata
        Headers:
          xLtOpenKeyId: <api_key>
          XlDataInicial: yyyy-MM-ddTHH:mm:ss
          XlDataFinal: yyyy-MM-ddTHH:mm:ss (opcional)
        Rate limit: 1/seg, 5/min, 100/hora
        """
        if not self.api_key:
            return {"ok": False, "items": [], "error": "Chave de API da Disal não configurada."}

        url = f"{self.base_url}/api/estoque/listadata"
        headers: Dict[str, str] = {
            "xLtOpenKeyId": self.api_key,
            "XlDataInicial": data_inicial,
        }
        if data_final:
            headers["XlDataFinal"] = data_final

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(url, headers=headers)

            if resp.status_code == 401:
                return {"ok": False, "items": [], "error": "Chave de API da Disal inválida (401)."}
            if resp.status_code == 400:
                body = {}
                try:
                    body = resp.json()
                except Exception:
                    pass
                return {"ok": False, "items": [], "error": body.get("Message") or "Parâmetros de data inválidos (400)."}
            if resp.status_code == 429:
                return {"ok": False, "items": [], "error": "Rate limit excedido em /api/estoque/listadata (429)."}
            if resp.status_code != 200:
                return {"ok": False, "items": [], "error": f"Erro HTTP {resp.status_code} na Disal."}

            data = resp.json()
            items = data if isinstance(data, list) else []
            return {"ok": True, "items": items, "error": None}
        except Exception as e:
            logger.error(f"[DisalClient] Erro em listadata: {e}")
            return {"ok": False, "items": [], "error": str(e)}


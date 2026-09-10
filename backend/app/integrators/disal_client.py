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
        url = f"{self.base_url}/api/estoque/byEAN"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    url,
                    params={"EAN": isbn},
                    headers={"xLtOpenKeyId": self.api_key},
                )

            if resp.status_code == 401:
                return {"found": False, "saldo": 0, "error": "Token Disal inválido (401).", "raw": {}}

            if resp.status_code == 400:
                body = {}
                try:
                    body = resp.json()
                except Exception:
                    pass
                return {
                    "found": False,
                    "saldo": 0,
                    "error": body.get("Message", f"Requisição inválida (400)."),
                    "raw": body,
                }

            if resp.status_code == 429:
                return {"found": False, "saldo": 0, "error": "Rate limit Disal (429). Tente novamente em instantes.", "raw": {}}

            if resp.status_code != 200:
                return {"found": False, "saldo": 0, "error": f"HTTP {resp.status_code}", "raw": {}}

            data = resp.json()
            if not data:
                return {"found": False, "saldo": 0, "error": None, "raw": {}}

            # Produto não encontrado: API retorna objeto zerado
            # Detecção: EAN vazio ou saldo 0 com campos básicos ausentes
            ean_retornado = str(data.get("ean") or data.get("EAN") or data.get("CodigoEAN") or "").strip()
            saldo = int(data.get("saldo") or data.get("Saldo") or data.get("estoque") or data.get("Estoque") or 0)

            if not ean_retornado or ean_retornado == "0":
                return {"found": False, "saldo": 0, "error": None, "raw": data}

            return {
                "found":  True,
                "saldo":  saldo,
                "preco":  float(data.get("preco") or data.get("Preco") or 0),
                "titulo": str(data.get("titulo") or data.get("Titulo") or data.get("descricao") or "").strip(),
                "raw":    data,
                "error":  None,
            }

        except Exception as e:
            logger.error(f"[DisalClient] Erro ao consultar ISBN {isbn}: {e}")
            return {"found": False, "saldo": 0, "error": str(e), "raw": {}}

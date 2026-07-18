"""
ErdosClient — Client HTTP para o Hub-Erdos API.

Documentação de referência: Hub-Erdos v1.0 (26/06/2026)
URL base: https://wxcapqbtvgttooamglxx.supabase.co/functions/v1/api-fornecedor
"""
import httpx
from typing import Any, Dict, List, Optional


class ErdosClientError(Exception):
    """Raised when Hub-Erdos returns an error response."""
    pass


class ErdosClient:
    """
    Client HTTP para comunicação com o Hub-Erdos.
    Stateless — instanciado por request com base nas configurações do seller.
    """

    def __init__(self, base_url: str, api_key: str, timeout: float = 30.0):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            headers={
                "x-api-key": api_key,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            timeout=timeout,
            follow_redirects=True,
        )

    async def close(self):
        await self._client.aclose()

    async def _get(self, path: str, params: Optional[Dict] = None) -> Any:
        try:
            response = await self._client.get(path, params=params)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise ErdosClientError(
                f"Erro Hub-Erdos GET {path} (HTTP {e.response.status_code}): {e.response.text[:300]}"
            )
        except httpx.RequestError as e:
            raise ErdosClientError(f"Falha de conexão com Hub-Erdos: {str(e)}")

    async def _post(self, path: str, json_data: Any) -> Any:
        try:
            response = await self._client.post(path, json=json_data)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise ErdosClientError(
                f"Erro Hub-Erdos POST {path} (HTTP {e.response.status_code}): {e.response.text[:300]}"
            )
        except httpx.RequestError as e:
            raise ErdosClientError(f"Falha de conexão com Hub-Erdos: {str(e)}")

    async def _patch(self, path: str, json_data: Any) -> Any:
        try:
            response = await self._client.patch(path, json=json_data)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise ErdosClientError(
                f"Erro Hub-Erdos PATCH {path} (HTTP {e.response.status_code}): {e.response.text[:300]}"
            )
        except httpx.RequestError as e:
            raise ErdosClientError(f"Falha de conexão com Hub-Erdos: {str(e)}")

    # =========================================================================
    # 4.1 — Conectividade
    # =========================================================================

    async def test_connection(self) -> Dict[str, Any]:
        """
        GET / — Verifica autenticação e conectividade.
        Retorna: {"ok": true, "fornecedor": "Vida Nova", "mensagem": "Hub-Erdos API ativa."}
        """
        return await self._get("/")

    # =========================================================================
    # 4.2 — Estoque
    # =========================================================================

    async def push_stock(self, items: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        POST /estoque — Envia posição de estoque para o Hub.
        items: [{"sku": "9786559673698", "quantidade": 30}, ...]
        """
        return await self._post("/estoque", items)

    async def get_stock(self) -> Dict[str, Any]:
        """
        GET /estoque — Consulta estoque registrado no Hub para este fornecedor.
        """
        return await self._get("/estoque")

    # =========================================================================
    # 4.3 — Pedidos para Despacho (Principal endpoint do fluxo)
    # =========================================================================

    async def get_pending_orders(self) -> List[Dict[str, Any]]:
        """
        GET /pedidos/prontos-para-despacho
        Retorna lista de pedidos aguardando despacho.

        ATENÇÃO: As URLs de documentos (NF-e, DANFE, etiqueta) são assinadas
        e expiram em 1 hora. Fazer download imediatamente após receber.
        """
        result = await self._get("/pedidos/prontos-para-despacho")
        if isinstance(result, list):
            return result
        return []

    async def confirm_dispatch(
        self,
        id_pedido_erdos: str,
        tracking_code: Optional[str] = None,
        chave_nfe_remessa: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        POST /pedidos/atualizar-status-despacho
        Confirma despacho do pedido e envia código de rastreamento + chave NF-e 6.923.
        """
        payload: Dict[str, Any] = {
            "id_pedido_erdos": id_pedido_erdos,
            "status": "despachado",
        }
        if tracking_code:
            payload["codigo_rastreamento"] = tracking_code
        if chave_nfe_remessa:
            payload["chave_nfe_remessa_6923"] = chave_nfe_remessa
        return await self._post("/pedidos/atualizar-status-despacho", payload)

    # =========================================================================
    # 4.4 — Downloads de Documentos (geram URL assinada válida por 1h)
    # =========================================================================

    async def get_xml_url(self, id_pedido_erdos: str) -> Dict[str, Any]:
        """
        GET /pedidos/{id}/xml — Retorna URL assinada do XML da NF-e de Venda (6.120).
        """
        return await self._get(f"/pedidos/{id_pedido_erdos}/xml")

    async def get_danfe_url(self, id_pedido_erdos: str) -> Dict[str, Any]:
        """
        GET /pedidos/{id}/danfe — Retorna URL assinada do DANFE PDF.
        """
        return await self._get(f"/pedidos/{id_pedido_erdos}/danfe")

    async def get_label_url(self, id_pedido_erdos: str) -> Dict[str, Any]:
        """
        GET /pedidos/{id}/etiqueta — Retorna URL assinada da Etiqueta de postagem.
        """
        return await self._get(f"/pedidos/{id_pedido_erdos}/etiqueta")

    async def download_file(self, url: str) -> bytes:
        """
        Baixa o conteúdo de uma URL assinada retornada pelo Hub-Erdos.
        Usar imediatamente — URLs expiram em 1 hora.
        """
        try:
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                response = await client.get(url)
                response.raise_for_status()
                return response.content
        except httpx.HTTPStatusError as e:
            raise ErdosClientError(
                f"Erro ao baixar documento (HTTP {e.response.status_code}). "
                "A URL assinada pode ter expirado (validade: 1 hora)."
            )
        except httpx.RequestError as e:
            raise ErdosClientError(f"Falha de conexão ao baixar documento: {str(e)}")

    # =========================================================================
    # 4.5 — Listagem e Detalhes de Pedidos
    # =========================================================================

    async def get_all_orders(
        self,
        status: Optional[str] = None,
        data_inicio: Optional[str] = None,
        data_fim: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        GET /pedidos — Lista todos os pedidos com filtros opcionais.
        status: aguardando | preparando | postado | entregue | cancelado
        data_inicio / data_fim: formato ISO 8601 (ex: 2026-06-01)
        """
        params = {}
        if status:
            params["status"] = status
        if data_inicio:
            params["data_inicio"] = data_inicio
        if data_fim:
            params["data_fim"] = data_fim
        result = await self._get("/pedidos", params=params or None)
        if isinstance(result, list):
            return result
        return []

    async def get_order(self, id_pedido_erdos: str) -> Dict[str, Any]:
        """
        GET /pedidos/{id} — Detalha um pedido específico incluindo itens.
        """
        return await self._get(f"/pedidos/{id_pedido_erdos}")

    async def update_order_status(self, id_pedido_erdos: str, status: str, tracking: Optional[str] = None) -> Dict[str, Any]:
        """
        PATCH /pedidos/{id}/status — Atualiza status manualmente.
        status aceitos: preparando | postado | cancelado
        Se status == 'postado', tracking é obrigatório.
        """
        payload: Dict[str, Any] = {"status": status}
        if tracking:
            payload["codigo_rastreio"] = tracking
        return await self._patch(f"/pedidos/{id_pedido_erdos}/status", payload)

    # =========================================================================
    # 4.6 — Configuração do Fornecedor
    # =========================================================================

    async def get_config(self) -> Dict[str, Any]:
        """
        GET /config — Consulta configurações do fornecedor no Hub.
        """
        return await self._get("/config")

    async def update_stock_interval(self, interval_min: int) -> Dict[str, Any]:
        """
        PATCH /config — Atualiza intervalo mínimo de push de estoque.
        """
        return await self._patch("/config", {"intervalo_estoque_min": interval_min})

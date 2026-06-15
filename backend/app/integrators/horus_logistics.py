import re
from typing import Dict, Any, List, Optional, Union
from app.integrators.horus import HorusClient

class HorusLogisticsClient(HorusClient):
    
    async def search_orders(
        self, 
        cod_empresa: str, 
        cod_filial: str, 
        cod_cli: str, 
        cod_pedido_origem: str,
        cod_metodo: int = 27
    ) -> Any:
        """
        Calls Busca_PedidosVenda to find the sales order.
        First tries by internal sales order code (COD_PED_VENDA) without COD_METODO.
        If not found or error, tries by origin order code (COD_PEDIDO_ORIGEM) with COD_METODO.
        """
        # Try 1: By internal COD_PED_VENDA (for scenarios with no method code/method mapping)
        params_venda = {
            "COD_EMPRESA": cod_empresa,
            "COD_FILIAL": cod_filial,
            "COD_CLI": cod_cli,
            "COD_PED_VENDA": cod_pedido_origem,
            "OFFSET": 0,
            "LIMIT": 10
        }
        if getattr(self._settings, 'horus_legacy_pagination', False):
            params_venda.pop("OFFSET", None)
            params_venda.pop("LIMIT", None)
            
        try:
            res = await self.get("Busca_PedidosVenda", params=params_venda)
            if res and not (isinstance(res, list) and len(res) == 0):
                # Check if it returned a failure message
                first = res[0] if isinstance(res, list) else res
                if isinstance(first, dict) and not (first.get("Falha") or first.get("FALHA") == "S" or first.get("status") == "FALHA"):
                    return res
        except Exception:
            pass
            
        # Try 2: By origin COD_PEDIDO_ORIGEM (fallback)
        params_origem = {
            "COD_EMPRESA": cod_empresa,
            "COD_FILIAL": cod_filial,
            "COD_CLI": cod_cli,
            "COD_PEDIDO_ORIGEM": cod_pedido_origem,
            "COD_METODO": cod_metodo,
            "OFFSET": 0,
            "LIMIT": 10
        }
        if getattr(self._settings, 'horus_legacy_pagination', False):
            params_origem.pop("OFFSET", None)
            params_origem.pop("LIMIT", None)
            
        return await self.get("Busca_PedidosVenda", params=params_origem)


    async def get_order_items(
        self, 
        cod_ped_venda: Union[str, int], 
        cod_empresa: str, 
        cod_filial: str
    ) -> Any:
        """
        Calls Busca_ItensPedidosVenda to retrieve the items for the sales order.
        """
        params = {
            "COD_PED_VENDA": cod_ped_venda,
            "COD_EMPRESA": cod_empresa,
            "COD_FILIAL": cod_filial,
            "OFFSET": 0,
            "LIMIT": 10000
        }
        
        if getattr(self._settings, 'horus_legacy_pagination', False):
            params.pop("OFFSET", None)
            params.pop("LIMIT", None)
            
        return await self.get("Busca_ItensPedidosVenda", params=params)

    async def confere_item_pedido(
        self,
        cod_empresa: str,
        cod_filial: str,
        cod_cli: str,
        cod_ped_venda: str,
        cod_item: str,
        cod_local: str,
        qtd_atendida: int
    ) -> Any:
        """
        Calls ConfereItem_Pedido on Horus ERP to confirm item checking.
        """
        params = {
            "COD_EMPRESA": cod_empresa,
            "COD_FILIAL": cod_filial,
            "COD_CLI": cod_cli,
            "COD_PED_VENDA": cod_ped_venda,
            "COD_ITEM": cod_item,
            "COD_LOCAL": cod_local,
            "QTD_ATENDIDA": qtd_atendida
        }
        
        return await self.get("ConfereItem_Pedido", params=params)

    async def ins_volume_pedido(
        self,
        cod_empresa: str,
        cod_filial: str,
        cod_cli: str,
        cod_ped_venda: str,
        cod_volume: int,
        pes_volume: float
    ) -> Any:
        """
        Calls InsVolume_Pedido on Horus ERP to insert volume details.
        """
        params = {
            "COD_EMPRESA": cod_empresa,
            "COD_FILIAL": cod_filial,
            "COD_CLI": cod_cli,
            "COD_PED_VENDA": cod_ped_venda,
            "COD_VOLUME": cod_volume,
            "PES_VOLUME": pes_volume
        }
        
        return await self.get("InsVolume_Pedido", params=params)


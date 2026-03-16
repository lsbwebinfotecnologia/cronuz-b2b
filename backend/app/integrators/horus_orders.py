from typing import Dict, Any, List, Optional, Union
from app.integrators.horus import HorusClient

class HorusOrders(HorusClient):
    
    async def get_order(self, id_doc: str, id_guid: str, cnpj_destino: str, cod_pedido_origem: Union[str, int], limit: int = 0) -> Any:
        """
        Translates getOrder from HsOrders.php
        """
        params = {
            "COD_PEDIDO_ORIGEM": cod_pedido_origem,
            "ID_DOC": id_doc,
            "ID_GUID": id_guid,
            "CNPJ_DESTINO": cnpj_destino,
        }
        
        if limit > 0:
            params["OFFSET"] = 0
            params["LIMIT"] = limit
            
        result = await self.get("Busca_PedidosVenda", params=params)
        
        # If successfully found the order, optionally fetch the invoice (nota fiscal)
        if result and isinstance(result, list) and len(result) > 0 and not result[0].get("Falha"):
            order_data = result[0]
            nf_params = params.copy()
            nf_params["XML_BASE64"] = "S"
            try:
                invoice = await self.get("Busca_notafiscal", params=nf_params)
                if invoice and isinstance(invoice, list) and len(invoice) > 0:
                    order_data["NOTA_FISCAL"] = invoice[0]
                else:
                    order_data["NOTA_FISCAL"] = None
            except Exception:
                order_data["NOTA_FISCAL"] = None
            return order_data
            
        return False

    async def send_order(self, id_doc: str, id_guid: str, cnpj_destino: str, cod_pedido_origem: Union[str, int], type_order: str = "V", obs: str = "pedido criado através da plataforma Horus B2B") -> Dict[str, Any]:
        """
        Translates sendOrder from HsOrders.php (calls InsPedidoVenda)
        """
        params = {
            "ID_DOC": id_doc,
            "ID_GUID": id_guid,
            "CNPJ_DESTINO": cnpj_destino,
            "TIPO_PEDIDO_V_T_D": type_order,
            "COD_PEDIDO_ORIGEM": cod_pedido_origem,
            "OBS_PEDIDO": obs,
        }
        
        response = await self.get("InsPedidoVenda", params=params)
        
        if response and isinstance(response, list) and response[0].get("Falha"):
            return {
                "error": True,
                "msg": response[0].get("Mensagem", "erro desconhecido ao enviar pedido"),
                "response": response
            }
            
        return {
            "error": False,
            "COD_PED_VENDA": response[0].get("COD_PED_VENDA") if response and isinstance(response, list) else None
        }

    async def send_order_item(self, id_doc: str, id_guid: str, cnpj_destino: str, cod_pedido_origem: Union[str, int], isbn: str, qty: int, price: float) -> Any:
        """
        Translates InsItensPedidoVenda step of sendOrderItems from HsOrders.php
        """
        params = {
            "ID_DOC": id_doc,
            "ID_GUID": id_guid,
            "CNPJ_DESTINO": cnpj_destino,
            "COD_PEDIDO_ORIGEM": cod_pedido_origem,
            "BARRAS_ISBN": isbn,
            "QTD_PEDIDA": qty,
            "VLR_LIQUIDO": price,
        }
        
        return await self.get("InsItensPedidoVenda", params=params)

    async def clear_order_items(self, id_doc: str, id_guid: str, cnpj_destino: str, cod_ped_venda: Union[str, int]) -> Any:
        """
        Translates LimpaItensPedidoVenda step of sendOrderItems from HsOrders.php
        """
        params = {
            "ID_DOC": id_doc,
            "ID_GUID": id_guid,
            "CNPJ_DESTINO": cnpj_destino,
            "COD_PED_VENDA": cod_ped_venda,
        }
        return await self.get("LimpaItensPedidoVenda", params=params)

    async def get_order_items(self, cod_ped_venda: Union[str, int], limit: int = 0) -> Any:
        """
        Translates getItemsOrder from HsOrders.php
        """
        params = {
            "COD_PED_VENDA": cod_ped_venda,
        }
        
        if self._settings.horus_company:
            params["COD_EMPRESA"] = self._settings.horus_company
        if self._settings.horus_branch:
            params["COD_FILIAL"] = self._settings.horus_branch
            
        if limit > 0:
            params["OFFSET"] = 0
            params["LIMIT"] = limit
            
        return await self.get("Busca_ItensPedidosVenda", params=params)

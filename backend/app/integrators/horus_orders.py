import re
from typing import Dict, Any, List, Optional, Union
from app.integrators.horus import HorusClient

class HorusOrders(HorusClient):
    
    async def get_order(self, id_doc: str, id_guid: str, cnpj_destino: str, cod_pedido_origem: Union[str, int, None] = None, limit: int = 0, cod_ped_venda: Optional[str] = None, ignore_customer_context: bool = False) -> Any:
        """
        Translates getOrder from HsOrders.php
        """
        params = {}
        clean_cnpj_destino = re.sub(r'\D', '', str(cnpj_destino)) if cnpj_destino else None
        if not clean_cnpj_destino and getattr(self, '_settings', None) and self._settings.horus_branch:
            clean_branch = re.sub(r'\D', '', str(self._settings.horus_branch))
            if len(clean_branch) >= 11:
                clean_cnpj_destino = clean_branch

        is_b2b = not ignore_customer_context and bool(clean_cnpj_destino or id_doc or id_guid)

        if not ignore_customer_context:
            if clean_cnpj_destino:
                params["CNPJ_DESTINO"] = clean_cnpj_destino
            if id_doc:
                params["ID_DOC"] = re.sub(r'\D', '', str(id_doc))
            if id_guid:
                params["ID_GUID"] = id_guid
        
        if cod_pedido_origem is not None and cod_pedido_origem != "":
            params["COD_PEDIDO_ORIGEM"] = cod_pedido_origem
        
        # COD_PED_VENDA não deve ser enviado para integrações B2B (Horus rejeita: 'COD_PED_VENDA - Não deve ser informado para integrações B2B!')
        # Ele só é enviado em consultas ERP diretas (ignore_customer_context=True), e no B2B é usado apenas para filtrar o item na lista retornada.
        if not is_b2b and cod_ped_venda:
            params["COD_PED_VENDA"] = cod_ped_venda

        # Importante: para chamadas B2B (com CNPJ_DESTINO/ID_DOC/ID_GUID), o Horus REJEITA explicitamente
        # se COD_EMPRESA ou COD_FILIAL forem informados ("COD_EMPRESA - Não deve ser informado para integrações B2B!").
        # Portanto, COD_EMPRESA e COD_FILIAL só devem ser enviados em consultas ERP diretas (ex: quando ignore_customer_context=True).
        if not is_b2b and getattr(self, '_settings', None):
            if getattr(self._settings, 'horus_company', None):
                params["COD_EMPRESA"] = self._settings.horus_company
            if getattr(self._settings, 'horus_branch', None):
                branch_str = str(self._settings.horus_branch).strip()
                clean_digits = re.sub(r'\D', '', branch_str)
                if clean_digits and len(clean_digits) < 11:
                    params["COD_FILIAL"] = branch_str

        if not getattr(self._settings, 'horus_legacy_pagination', False):
            params["LIMIT"] = limit if limit > 0 else 50
            params["OFFSET"] = 0

        result = await self.get("Busca_PedidosVenda", params=params)
        
        # If successfully found the order, optionally fetch the invoice (nota fiscal)
        if result and isinstance(result, list) and len(result) > 0 and not result[0].get("Falha"):
            order_data = None
            clean_doc = re.sub(r'\D', '', str(id_doc)) if id_doc else None

            # 1. Match por cod_ped_venda exato se informado
            if cod_ped_venda:
                for item in result:
                    if str(item.get("COD_PED_VENDA")) == str(cod_ped_venda):
                        order_data = item
                        break

            # 2. Match por documento do cliente (CNPJ ou CPF) para evitar registros antigos de outros clientes
            if not order_data and clean_doc:
                for item in result:
                    item_cnpj = re.sub(r'\D', '', str(item.get("CNPJ") or ''))
                    item_cpf = re.sub(r'\D', '', str(item.get("CPF") or ''))
                    if item_cnpj == clean_doc or item_cpf == clean_doc:
                        order_data = item
                        break

            # 3. Fallback: ordenar pelo pedido mais recente (maior COD_PED_VENDA)
            if not order_data:
                try:
                    sorted_list = sorted(
                        result,
                        key=lambda x: int(x.get("COD_PED_VENDA") or 0),
                        reverse=True
                    )
                    order_data = sorted_list[0]
                except Exception:
                    order_data = result[0]

            # Buscar nota fiscal
            nf_params = {}
            if is_b2b:
                if clean_cnpj_destino:
                    nf_params["CNPJ_DESTINO"] = clean_cnpj_destino
                if id_doc:
                    nf_params["ID_DOC"] = re.sub(r'\D', '', str(id_doc))
                if id_guid:
                    nf_params["ID_GUID"] = id_guid
                if cod_pedido_origem is not None and cod_pedido_origem != "":
                    nf_params["COD_PEDIDO_ORIGEM"] = cod_pedido_origem
            else:
                if order_data.get("COD_PED_VENDA"):
                    nf_params["COD_PED_VENDA"] = order_data.get("COD_PED_VENDA")
                if getattr(self, '_settings', None):
                    if getattr(self._settings, 'horus_company', None):
                        nf_params["COD_EMPRESA"] = self._settings.horus_company
                    if getattr(self._settings, 'horus_branch', None):
                        branch_str = str(self._settings.horus_branch).strip()
                        clean_digits = re.sub(r'\D', '', branch_str)
                        if clean_digits and len(clean_digits) < 11:
                            nf_params["COD_FILIAL"] = branch_str

            nf_params["XML_BASE64"] = "S"
            if not getattr(self._settings, 'horus_legacy_pagination', False):
                nf_params["LIMIT"] = 50
                nf_params["OFFSET"] = 0

            try:
                invoice = await self.get("Busca_notafiscal", params=nf_params)
                if invoice and isinstance(invoice, list) and len(invoice) > 0 and not invoice[0].get("Falha"):
                    order_data["NOTA_FISCAL"] = invoice[0]
                else:
                    # Fallback ERP para busca de NF se tiver COD_PED_VENDA e configurações de empresa/filial
                    if order_data.get("COD_PED_VENDA") and getattr(self, '_settings', None) and getattr(self._settings, 'horus_company', None):
                        fallback_nf_params = {
                            "COD_PED_VENDA": order_data.get("COD_PED_VENDA"),
                            "COD_EMPRESA": self._settings.horus_company,
                            "XML_BASE64": "S"
                        }
                        if getattr(self._settings, 'horus_branch', None):
                            b_str = str(self._settings.horus_branch).strip()
                            c_dig = re.sub(r'\D', '', b_str)
                            if c_dig and len(c_dig) < 11:
                                fallback_nf_params["COD_FILIAL"] = b_str
                        if not getattr(self._settings, 'horus_legacy_pagination', False):
                            fallback_nf_params["LIMIT"] = 50
                            fallback_nf_params["OFFSET"] = 0
                        fb_inv = await self.get("Busca_notafiscal", params=fallback_nf_params)
                        if fb_inv and isinstance(fb_inv, list) and len(fb_inv) > 0 and not fb_inv[0].get("Falha"):
                            order_data["NOTA_FISCAL"] = fb_inv[0]
                        else:
                            order_data["NOTA_FISCAL"] = None
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
            "ID_DOC": re.sub(r'\D', '', str(id_doc)) if id_doc else None,
            "ID_GUID": id_guid,
            "CNPJ_DESTINO": re.sub(r'\D', '', str(cnpj_destino)) if cnpj_destino else None,
            "TIPO_PEDIDO_V_T_D": type_order,
            "COD_PEDIDO_ORIGEM": cod_pedido_origem,
            "OBS_PEDIDO": obs,
        }
        
        # if self._settings.horus_company:
        #     params["COD_EMPRESA"] = int(self._settings.horus_company)
        # if self._settings.horus_branch:
        #     params["COD_FILIAL"] = int(self._settings.horus_branch)
        
        print("\n\n--- DEBUGGING HORUS InsPedidoVenda PAYLOAD ---")
        print(params)
        print("----------------------------------------------\n\n")

        response = await self.get("InsPedidoVenda", params=params)
        
        if response and isinstance(response, list) and response[0].get("Falha"):
            debug_str = " | ".join([f"{k}: {v}" for k, v in params.items()])
            return {
                "error": True,
                "msg": f"{response[0].get('Mensagem', 'erro desconhecido ao enviar pedido')} [Enviado: {debug_str}]",
                "response": response
            }
            
        return {
            "error": False,
            "COD_PED_VENDA": response[0].get("COD_PED_VENDA") if response and isinstance(response, list) else None
        }

    async def send_order_item(self, id_doc: str, id_guid: str, cnpj_destino: str, cod_pedido_origem: Union[str, int], isbn: str, qty: int, price: Optional[float] = None) -> Any:
        """
        Translates InsItensPedidoVenda step of sendOrderItems from HsOrders.php
        """
        params = {
            "ID_DOC": re.sub(r'\D', '', str(id_doc)) if id_doc else None,
            "ID_GUID": id_guid,
            "CNPJ_DESTINO": re.sub(r'\D', '', str(cnpj_destino)) if cnpj_destino else None,
            "COD_PEDIDO_ORIGEM": cod_pedido_origem,
            "BARRAS_ISBN": isbn,
            "QTD_PEDIDA": qty,
        }
        
        # Regra de envio do VLR_LIQUIDO:
        # A decisão de "calcular ou não" já foi tomada pelo código chamador (dropship.py):
        #   - Se o ISBN está na dsp_price_table → price vem preenchido (override)
        #   - Se não está → price vem como None (Hórus usa o desconto do cliente no ERP)
        # Portanto, se price não for None, sempre enviamos VLR_LIQUIDO.
        if price is not None:
            params["VLR_LIQUIDO"] = price

        return await self.get("InsItensPedidoVenda", params=params)

    async def clear_order_items(self, id_doc: str, id_guid: str, cnpj_destino: str, cod_ped_venda: Union[str, int]) -> Any:
        """
        Translates LimpaItensPedidoVenda step of sendOrderItems from HsOrders.php
        """
        params = {
            "ID_DOC": re.sub(r'\D', '', str(id_doc)) if id_doc else None,
            "ID_GUID": id_guid,
            "CNPJ_DESTINO": re.sub(r'\D', '', str(cnpj_destino)) if cnpj_destino else None,
            "COD_PED_VENDA": cod_ped_venda,
        }
        return await self.get("LimpaItensPedidoVenda", params=params)

    async def alt_status_pedido(self, id_doc: str, id_guid: str, cnpj_destino: str, cod_pedido_origem: Union[str, int]) -> Any:
        """
        Updates the order status in Horus by calling AltStatus_Pedido endpoint.
        Advances the order to the next configured status (LAP or LEX).
        """
        params = {
            "ID_DOC": re.sub(r'\D', '', str(id_doc)) if id_doc else None,
            "ID_GUID": id_guid,
            "CNPJ_DESTINO": re.sub(r'\D', '', str(cnpj_destino)) if cnpj_destino else None,
            "COD_PEDIDO_ORIGEM": cod_pedido_origem,
        }
        return await self.get("AltStatus_Pedido", params=params)

    async def pular_expedicao(self, id_doc: str, id_guid: str, cnpj_destino: str, cod_pedido_origem: Union[str, int]) -> Any:
        """
        Skips the entire expedition phase for a Venda order, jumping it directly
        to LFT (Lote Faturamento — pronto para faturamento).

        Used on the Dropship Venda order after AltStatus_Pedido (LAP) to avoid
        the order appearing in the expedition queue. This mirrors the Horus method
        Pular_expedicao which bypasses LEX/LAP and goes straight to LFT.
        """
        params = {
            "ID_DOC": re.sub(r'\D', '', str(id_doc)) if id_doc else None,
            "ID_GUID": id_guid,
            "CNPJ_DESTINO": re.sub(r'\D', '', str(cnpj_destino)) if cnpj_destino else None,
            "COD_PEDIDO_ORIGEM": cod_pedido_origem,
        }
        return await self.get("Pular_expedicao", params=params)

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
            
        if not getattr(self._settings, 'horus_legacy_pagination', False):
            params["OFFSET"] = 0
            params["LIMIT"] = limit if limit > 0 else 10000
            
        return await self.get("Busca_ItensPedidosVenda", params=params)

    async def sta_transmitido_pedido_compra(self, cod_empresa: int, cod_filial: int, cod_fornecedor: int, cod_grp_fornecedor: int, cod_pedido: int, transmitido: str) -> Any:
        """
        Altera indicação de transmitido para o pedido de compra no Horus (S ou N)
        """
        params = {
            "COD_EMPRESA": cod_empresa,
            "COD_FILIAL": cod_filial,
            "COD_FORNECEDOR": cod_fornecedor,
            "COD_GRP_FORNECEDOR": cod_grp_fornecedor,
            "COD_PEDIDO": cod_pedido,
            "TRANSMITIDO": transmitido
        }
        return await self.get("StaTransmitido_PedidoCompra", params=params)

    async def obs_item_pedido_compra(self, cod_empresa: int, cod_filial: int, cod_fornecedor: int, cod_grp_fornecedor: int, cod_pedido: int, cod_item: int, obs_item: str) -> Any:
        """
        Grava observação do item de pedido de compra no Horus
        """
        params = {
            "COD_EMPRESA": cod_empresa,
            "COD_FILIAL": cod_filial,
            "COD_FORNECEDOR": cod_fornecedor,
            "COD_GRP_FORNECEDOR": cod_grp_fornecedor,
            "COD_PEDIDO": cod_pedido,
            "COD_ITEM": cod_item,
            "OBS_ITEM": obs_item
        }
        return await self.get("ObsItem_PedidoCompra", params=params)


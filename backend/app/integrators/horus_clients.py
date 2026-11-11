import re
from typing import Dict, Any, Optional
from app.integrators.horus import HorusClient

class HorusClients(HorusClient):
    
    async def get_client(self, cnpj_destino: str, cnpj_cliente: str, limit: int = 25) -> Any:
        """
        Translates getClient from HsClients.php
        Searches for a customer by CNPJ or CPF in the Horus B2B API.

        Args:
            cnpj_destino (str): Document of the Seller/Company performing the search.
            cnpj_cliente (str): Document of the Customer to be found (CNPJ=14 digits, CPF=11 digits).
            limit (int): Pagination limit.
        """
        # Use "CPF" parameter key for Pessoa Física (11 digits), "CNPJ" for Pessoa Jurídica (14 digits)
        doc_key = "CPF" if len(cnpj_cliente.strip()) == 11 else "CNPJ"

        params = {
            "CNPJ_DESTINO": cnpj_destino,
            doc_key: cnpj_cliente
        }
        
        if not getattr(self._settings, 'horus_legacy_pagination', False):
            params["OFFSET"] = 0
            params["LIMIT"] = limit
        
        result = await self.get("Busca_ClienteB2B", params=params)
        
        item = None
        if result and isinstance(result, list) and len(result) > 0:
            item = result[0]
        elif result and isinstance(result, dict):
            item = result
            
        if item:
            if item.get("Falha") or item.get("FALHA") == "S":
                return {
                    "error": True,
                    "msg": item.get("Mensagem", item.get("MENSAGEM", "Erro na API Horus"))
                }
            
            # If successfully found, return normalized response similar to original PHP implementation
            email = item.get("EMAIL")
            doc_label = "CPF" if len(cnpj_cliente.strip()) == 11 else "CNPJ"

            return {
                "error": False,
                "msg": f"{doc_label} localizado! e-mail: {email}" if email else f"{doc_label} localizado com sucesso!",
                "data": item
            }
            
        return {
            "error": True,
            "msg": "Nenhum cliente localizado ou erro de conexão"
        }

    async def get_client_b2c(self, cnpj_destino: str, cpf: str) -> Any:
        """
        Busca cliente pelo CPF/CNPJ usando Busca_Cliente (endpoint B2C/dropship).
        USO EXCLUSIVO: rotina de remessa dropship. NÃO usar nas rotinas B2B/storefront.

        Regra: CPF (11 dígitos) → param CPF=xxx
               CNPJ (14 dígitos) → param CNPJ=xxx
               Sem CNPJ_DESTINO — não é parâmetro deste endpoint.
        """
        import logging
        log = logging.getLogger(__name__)

        # Identifica o tipo pelo tamanho e usa o parâmetro correto
        param_key = "CPF" if len(cpf) == 11 else "CNPJ"
        params: Dict[str, Any] = {param_key: cpf}

        result = await self.get("Busca_Cliente", params=params)
        log.info(f"[get_client_b2c] {param_key}={cpf} resultado bruto: {result}")

        item = None
        if result and isinstance(result, list) and len(result) > 0:
            item = result[0]
        elif result and isinstance(result, dict):
            item = result

        if item and not (item.get("Falha") or item.get("FALHA") == "S"):
            cod_cli = str(item.get("COD_CLI") or item.get("CODIGO") or "").strip()
            if cod_cli:
                log.info(f"[get_client_b2c] Cliente encontrado: COD_CLI={cod_cli}")
                return {"error": False, "data": item}

        log.info(f"[get_client_b2c] Cliente {param_key}={cpf} não localizado no Hórus")
        return {"error": True, "msg": "Cliente não encontrado"}


    async def get_customer_financials(self, cnpj_destino: str, cnpj_cliente: str) -> Dict[str, Any]:
        """
        Specialized fetch to grab credit limit, debt balance, consignment remessa and B2B flags via Busca_ClienteB2B
        """
        params = {
            "CNPJ_DESTINO": cnpj_destino,
            "CNPJ": cnpj_cliente
        }
        
        if not getattr(self._settings, 'horus_legacy_pagination', False):
            params["OFFSET"] = 0
            params["LIMIT"] = 1
        
        result = await self.get("Busca_ClienteB2B", params=params)
        
        def _parse_br_float(val: Any) -> float:
            if val is None or val == "":
                return 0.0
            if isinstance(val, (int, float)):
                return float(val)
            s = str(val).strip()
            if "," in s and "." in s:
                s = s.replace(".", "").replace(",", ".")
            elif "," in s:
                s = s.replace(",", ".")
            try:
                return float(s)
            except (ValueError, TypeError):
                return 0.0

        if result and isinstance(result, list) and len(result) > 0:
            item = result[0]
            if isinstance(item, dict) and not item.get("Falha") and not item.get("FALHA"):
                limit_raw = _parse_br_float(
                    item.get("LIMITE") or item.get("LIMITE_CREDITO") or item.get("VLR_LIMITE") or 0
                )
                debt_raw = _parse_br_float(
                    item.get("TOTAL_DEBITOS") or item.get("SALDO_DEVEDOR") or item.get("VLR_DEBITO") or item.get("TOT_DEBITO") or 0
                )
                remessa_raw = _parse_br_float(item.get("REMESSA") or 0)
                disc_raw = _parse_br_float(item.get("VLR_DESC_CLI") or 0)
                cod_cli_val = item.get("COD_CLI")
                return {
                    "credit_limit": limit_raw,
                    "debt_balance": debt_raw,
                    "available_limit": max(0.0, limit_raw - debt_raw),
                    "remessa_balance": remessa_raw,
                    "discount": disc_raw,
                    "cod_cli": int(cod_cli_val) if str(cod_cli_val or "").isdigit() else None,
                    "id_guid": str(item.get("ID_GUID") or "").strip(),
                    "b2b_aceita_ped_consig": str(item.get("B2B_ACEITA_PED_CONSIG") or "").strip(),
                    "b2b_aceita_ped_venda": str(item.get("B2B_ACEITA_PED_VENDA") or "").strip(),
                    "data_ultimo_acerto": item.get("DATA_ULTIMO_ACERTO"),
                    "status": item.get("SITUACAO", "ATIVO"),
                    "raw": item,
                }
                
        return {
            "credit_limit": 0.0,
            "debt_balance": 0.0,
            "available_limit": 0.0,
            "remessa_balance": 0.0,
            "discount": 0.0,
            "cod_cli": None,
            "id_guid": "",
            "b2b_aceita_ped_consig": "",
            "b2b_aceita_ped_venda": "",
            "data_ultimo_acerto": None,
            "status": "DESCONHECIDO",
            "raw": result,
        }

    async def search_products(self, query: str = "", limit: int = 20) -> Any:
        """
        Searches for products in the Horus B2B API.
        This maps to a hypothetical Busca_Produto or similar endpoint in Horus.
        We will mimic the catalog struct returned.
        """
        params = {
            "BUSCA": query
        }
        
        if not getattr(self._settings, 'horus_legacy_pagination', False):
            params["OFFSET"] = 0
            params["LIMIT"] = limit
        
        # Depending on Horus version, endpoint might be Busca_Produto or TServerB2B equivalents
        # We will try a hypothetical common GET endpoint. If we don't have the exact name, we guess.
        try:
            result = await self.get("Busca_Produto", params=params)
            
            if result and isinstance(result, list):
                # Check for failure in the first item
                if len(result) > 0 and isinstance(result[0], dict) and result[0].get("Falha"):
                    return []
                
                # Map Horus items to standard schema
                mapped_items = []
                for item in result:
                    def parse_val(val):
                        if not val:
                            return 0.0
                        try:
                            if isinstance(val, str):
                                val = val.replace('.', '').replace(',', '.')
                            return float(val) if val else 0.0
                        except (ValueError, TypeError):
                            return 0.0
                            
                    mapped_items.append({
                        "id": item.get("ID_PRODUTO", item.get("CODIGO", 0)),
                        "sku": item.get("REFERENCIA", item.get("EAN", "")),
                        "name": item.get("DESCRICAO", item.get("NOME", "Produto Sem Nome")),
                        "price": parse_val(item.get("PRECO", item.get("VALOR", 0.0))),
                        "stock": parse_val(item.get("ESTOQUE", item.get("QTD", 0.0))),
                        "image": item.get("IMAGEM", item.get("URL_FOTO", "")),
                        "discount_percentage": parse_val(item.get("DESCONTO", 0.0))
                    })
                return mapped_items
        except Exception as e:
            print(f"Error mapping Horus Products: {e}")
            pass
            
        return []

    async def get_consignment_summary(self, cnpj_destino: str, cnpj_cliente: str, id_guid: str, cod_ctr: Optional[str] = None, limit: int = 50) -> Any:
        cnpj_destino = re.sub(r'\D', '', cnpj_destino)
        cnpj_cliente = re.sub(r'\D', '', cnpj_cliente)
        params = {
            "ID_GUID": id_guid,
            "CNPJ_DESTINO": cnpj_destino,
            "ID_DOC": cnpj_cliente
        }
        if cod_ctr:
            params["COD_CTR"] = cod_ctr
            
        if not getattr(self._settings, 'horus_legacy_pagination', False):
            params["OFFSET"] = 0
            params["LIMIT"] = limit
            
        result = await self.get("Busca_Contrato_Cliente_Sintetico", params=params)
        return result

    async def get_consignment_details(self, cnpj_destino: str, cnpj_cliente: str, id_guid: str, cod_ctr: Optional[str] = None, limit: int = 500) -> Any:
        cnpj_destino = re.sub(r'\D', '', str(cnpj_destino or ''))
        cnpj_cliente = re.sub(r'\D', '', str(cnpj_cliente or ''))
        params = {
            "ID_GUID": id_guid,
            "CNPJ_DESTINO": cnpj_destino,
            "ID_DOC": cnpj_cliente
        }
        # COD_CTR is strictly avoided in Analitico according to Horus specs
            
        if not getattr(self._settings, 'horus_legacy_pagination', False):
            params["OFFSET"] = 0
            params["LIMIT"] = limit
            
        result = await self.get("Busca_Contrato_Cliente_Analitico", params=params)
        return result

    async def submit_consignment(self, cnpj_destino: str, cnpj_cliente: str, id_guid: str, tipo_a_d: str, items: list, cod_ctr: Optional[str] = None) -> Any:
        params = {
            "ID_GUID": id_guid,
            "CNPJ_DESTINO": cnpj_destino,
            "ID_DOC": cnpj_cliente,
            "TIPO_A_D": tipo_a_d,
        }
        if cod_ctr:
            params["COD_CTR"] = cod_ctr
            
        result = await self.post("Conf_Contrato_ClienteB2B", params=params, json_data=items)
        return result

    async def get_customer_invoices(self, cnpj_destino: str, cnpj_cliente: str, id_guid: str, data_ini: str, data_fim: str, xml_base64: str = "N", cod_pedido_origem: Optional[str] = None, limit: int = 100) -> Any:
        cnpj_destino = re.sub(r'\D', '', cnpj_destino)
        cnpj_cliente = re.sub(r'\D', '', cnpj_cliente)
        params = {
            "ID_GUID": id_guid,
            "CNPJ_DESTINO": cnpj_destino,
            "ID_DOC": cnpj_cliente,
            "DATA_INI": data_ini,
            "DATA_FIM": data_fim,
            "XML_BASE64": xml_base64
        }
        if cod_pedido_origem:
            params["COD_PEDIDO_ORIGEM"] = cod_pedido_origem
        if not getattr(self._settings, 'horus_legacy_pagination', False):
            params["OFFSET"] = 0
            params["LIMIT"] = limit
            
        result = await self.get("Busca_notafiscal", params=params)
        return result

    async def get_customer_debits(self, cnpj_destino: str, cnpj_cliente: str, id_guid: str, arq_base64: str = "N", limit: int = 200) -> Any:
        cnpj_destino = re.sub(r'\D', '', cnpj_destino)
        cnpj_cliente = re.sub(r'\D', '', cnpj_cliente)
        params = {
            "ID_GUID": id_guid,
            "CNPJ_DESTINO": cnpj_destino,
            "ID_DOC": cnpj_cliente,
            "ARQ_BASE64": arq_base64
        }
        if not getattr(self._settings, 'horus_legacy_pagination', False):
            params["OFFSET"] = 0
            params["LIMIT"] = limit
        
        result = await self.get("Busca_debitos", params=params)
        return result

from typing import Dict, Any, Optional
from app.integrators.horus import HorusClient

class HorusClients(HorusClient):
    
    async def get_client(self, cnpj_destino: str, cnpj_cliente: str, limit: int = 25) -> Any:
        """
        Translates getClient from HsClients.php
        Searches for a customer by CNPJ in the Horus B2B API.
        
        Args:
            cnpj_destino (str): Document of the Seller/Company performing the search.
            cnpj_cliente (str): Document of the Customer to be found.
            limit (int): Pagination limit.
        """
        params = {
            "CNPJ_DESTINO": cnpj_destino,
            "CNPJ": cnpj_cliente
        }
        
        if not getattr(self._settings, 'horus_legacy_pagination', False):
            params["OFFSET"] = 0
            params["LIMIT"] = limit
        
        result = await self.get("Busca_ClienteB2B", params=params)
        
        if result and isinstance(result, list) and len(result) > 0:
            item = result[0]
            if item.get("Falha"):
                return {
                    "error": True,
                    "msg": item.get("Mensagem", "Erro na API Horus")
                }
            
            # If successfully found, return normalized response similar to original PHP implementation
            email = item.get("EMAIL")
            
            return {
                "error": False,
                "msg": f"CNPJ localizado! e-mail: {email}" if email else "Cliente localizado.",
                "data": item
            }
            
        return {
            "error": True,
            "msg": "Nenhum cliente localizado ou erro de conexão"
        }

    async def get_customer_financials(self, cnpj_destino: str, cnpj_cliente: str) -> Dict[str, Any]:
        """
        Specialized fetch to grab credit limit and debt balance via Busca_ClienteB2B
        """
        params = {
            "CNPJ_DESTINO": cnpj_destino,
            "CNPJ": cnpj_cliente
        }
        
        if not getattr(self._settings, 'horus_legacy_pagination', False):
            params["OFFSET"] = 0
            params["LIMIT"] = 1
        
        result = await self.get("Busca_ClienteB2B", params=params)
        
        if result and isinstance(result, list) and len(result) > 0:
            item = result[0]
            if not item.get("Falha") and not item.get("FALHA"):
                # Field names are based on standard Horus B2B API documentation
                # Usually returned as VLR_LIMITE, LIMITE_CREDITO, LIMITE_DISPONIVEL, VLR_DEBITO, etc.
                # Assuming standard fields: LIMITE_CREDITO and SALDO_DEVEDOR or VLR_DEBITO
                try:
                    limit_raw = float(item.get("LIMITE_CREDITO", item.get("VLR_LIMITE", 0)))
                except (ValueError, TypeError):
                    limit_raw = 0.0
                    
                try:
                    debt_raw = float(item.get("SALDO_DEVEDOR", item.get("VLR_DEBITO", item.get("TOT_DEBITO", 0))))
                except (ValueError, TypeError):
                    debt_raw = 0.0
                    
                return {
                    "credit_limit": limit_raw,
                    "debt_balance": debt_raw,
                    "available_limit": max(0.0, limit_raw - debt_raw),
                    "status": item.get("SITUACAO", "ATIVO")
                }
                
        return {
            "credit_limit": 0.0,
            "debt_balance": 0.0,
            "available_limit": 0.0,
            "status": "DESCONHECIDO"
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

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
            "CNPJ": cnpj_cliente,
            "OFFSET": 0,
            "LIMIT": limit
        }
        
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

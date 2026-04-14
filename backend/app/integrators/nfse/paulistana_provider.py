from typing import Dict, Any
from app.integrators.nfse.base_provider import BaseNfseProvider
from app.models.company import Company
from app.models.service import ServiceOrder, Service
from app.models.customer import Customer, Address

class PaulistanaProvider(BaseNfseProvider):
    def __init__(self, company: Company):
        super().__init__(company)

    async def emitir_nota(self, order: ServiceOrder, service: Service, customer: Customer, address: Address, print_point=None) -> Dict[str, Any]:
        return {
            "success": False,
            "error": "A integração com a Nota Paulistana (São Paulo) ainda está em desenvolvimento. Por favor, aguarde futuras atualizações do B2B.",
            "status_code": 501,
            "raw_body": "Not Implemented",
            "pdf_url": "",
            "protocol_id": "",
            "xml": "",
            "response": {}
        }

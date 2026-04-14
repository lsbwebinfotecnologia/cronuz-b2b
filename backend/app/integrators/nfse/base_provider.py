from abc import ABC, abstractmethod
from typing import Dict, Any

from app.models.company import Company
from app.models.service import ServiceOrder, Service
from app.models.customer import Customer, Address


class BaseNfseProvider(ABC):
    """
    Contrato base / Interface abstrata que todo Provedor de NFS-e (SefinNacional, Paulistana, etc.) deve cumprir.
    """
    
    def __init__(self, company: Company):
        self.company = company
        self.is_homologacao = (company.nfse_environment == "HOMOLOGACAO")

    @abstractmethod
    async def emitir_nota(self, order: ServiceOrder, service: Service, customer: Customer, address: Address, print_point=None) -> Dict[str, Any]:
        """
        Realiza a transmissão síncrona da nota fiscal e devolve um dicionário padronizado do resultado.
        
        Deve retornar obrigatoriamente:
        {
            "success": bool,
            "xml": str,          # XML gerado raw (opcional utilitário)
            "response": dict,    # Response JSON
            "protocol_id": str,  # Chave de Acesso gerada / Recibo
            "pdf_url": str,      # Link do PDF formatado se disponivel
            "status_code": int,
            "raw_body": str,
            "error": str         # Mensagem amigável extraída dos objetos da prefeitura em caso de erro
        }
        """
        pass

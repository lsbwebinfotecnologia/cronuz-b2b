from app.models.company import Company
from app.integrators.nfse.base_provider import BaseNfseProvider

class NFSeFactory:
    """
    Fábrica responsável por rotear a emissão de NFS-e para o provedor correto
    com base no Código IBGE do município da empresa.
    """
    
    # Municípios conhecidos que integram o Padrão Sefin Nacional NFS-e
    NACIONAL_WHITELIST = [
        "3504107", # Atibaia/SP
        # Outros municípios conveniados ao Padrão Nacional entram aqui.
    ]
    
    @staticmethod
    def get_provider(company: Company) -> BaseNfseProvider:
        ibge = company.codigo_municipio_ibge
        
        if not ibge:
            raise ValueError("O Código IBGE do Município não está configurado. Acesse as configurações da empresa para preencher o campo obrigatório.")
            
        ibge = ibge.strip()
        
        # São Paulo (Paulistana)
        if ibge == "3550308":
            from app.integrators.nfse.paulistana_provider import PaulistanaProvider
            return PaulistanaProvider(company)
            
        # Padrão Nacional
        if ibge in NFSeFactory.NACIONAL_WHITELIST:
            from app.integrators.nfse.sefin_nacional_provider import SefinNacionalProvider
            return SefinNacionalProvider(company)
            
        # Fallback de Segurança
        raise ValueError(f"A integração de NFS-e direta ainda não está disponível para o município {ibge}. Consulte o suporte para expansão de provedores.")

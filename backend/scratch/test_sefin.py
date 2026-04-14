import asyncio
import os
from app.integrators.nfse_crypto import NFSeCrypto
from app.db.session import SessionLocal

import requests

async def main():
    # Pula os imports difíceis e vai direto pra crypto
    class DummyCompany:
        cnf_certificate_password = "1"
        cnf_certificate_path = "uploads/certificates/1/cert.pfx"
        
        cnpj = "12345678901234"
        inscricao_municipal = "123"
        nfse_environment = "HOMOLOGACAO"
        
    company = DummyCompany()
    crypto = NFSeCrypto(company)
    cert_path, key_path = crypto.create_mtls_temp_files()
    
    chave = "35041072217026001000108000000000007926044720726972"
    url = f"https://sefin.producaorestrita.nfse.gov.br/v1/nfse/{chave}"
    
    print("GET", url)
    res = requests.get(url, cert=(cert_path, key_path), headers={"Accept": "application/json"})
    print(res.status_code)
    print(res.text)

asyncio.run(main())

import asyncio
import os
import sys

# setup paths
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from app.models.user import User
from app.models.company import Company
from app.models.customer import Customer
from app.models.service import Service, ServiceOrder
from app.db.session import SessionLocal
from app.integrators.nfse_client import NFSeSerproClient
from app.integrators.nfse_crypto import NFSeCrypto
import httpx

async def main():
    db = SessionLocal()
    # Pega primeira empresa com certificado = Cronuz (id=1, provavelmente)
    company = db.query(Company).filter(Company.nfse_certificate_password.isnot(None)).first()
    if not company:
        print("No company with certificate")
        return

    client = NFSeSerproClient(company)
    
    # Extrai arquivos temporarios
    crypto = NFSeCrypto(company.nfse_certificate_pfx, company.nfse_certificate_password)
    cert_path, key_path = crypto.create_mtls_temp_files()
    
    bases = [
        "https://adn.producaorestrita.nfse.gov.br",
        "https://adn.producaorestrita.nfse.gov.br/api",
        "https://adn.producaorestrita.nfse.gov.br/v1",
        "https://adn.producaorestrita.nfse.gov.br/api/v1",
    ]
    paths = [
        "/DFe",
        "/dfe",
        "/DFe/Lote",
        "/recepcao/lote",
        "/lote",
        "/Lote",
        "/recepcao/DFe"
    ]
    
    xml_b64 = "PD94bWwgdmVyc2lvbj0iMS4wIj8+CjxEUFM+PGEvPjwvRFBTPgo="
    payload = {"LoteXmlGZipB64": [xml_b64]}
    
    async with httpx.AsyncClient(cert=(cert_path, key_path), verify=False) as http:
        for base in bases:
            for path in paths:
                url = f"{base}{path}"
                try:
                    res = await http.post(url, json=payload, timeout=5.0)
                    print(f"POST {url} -> {res.status_code}")
                    if res.status_code != 404:
                        print(f"BODY: {res.text}")
                except Exception as e:
                    print(f"POST {url} -> ERROR: {e}")
                    
    if os.path.exists(cert_path): os.remove(cert_path)
    if os.path.exists(key_path): os.remove(key_path)

if __name__ == "__main__":
    asyncio.run(main())

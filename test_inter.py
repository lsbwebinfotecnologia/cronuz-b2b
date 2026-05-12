import sys
import os
import asyncio

sys.path.append("/Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/backend")
from app.db.session import SessionLocal
from app.integrators.inter_client import BancoInterClient
from app.models.company_settings import CompanySettings
from datetime import datetime

cmp_id = 9
db = SessionLocal()
settings = db.query(CompanySettings).filter(CompanySettings.company_id == cmp_id).first()

client = BancoInterClient(
    client_id=settings.inter_client_id,
    client_secret=settings.inter_client_secret,
    cert_path=settings.inter_cert_path,
    key_path=settings.inter_key_path,
    sandbox=settings.inter_sandbox,
    account_number=settings.inter_account_number,
    api_version=settings.inter_api_version
)

print(f"Token: {client.get_token()}")

inst_data = {
    "id": "CRNZP9I47",
    "amount": 170.00,
    "due_date": datetime(2026, 5, 25)
}
customer_data = {
    "document": "12345678909",
    "name": "TESTE MNEMA",
    "address": "Av Teste",
    "city": "Sao Paulo",
    "uf": "SP",
    "zipcode": "01001000",
    "number": "1",
    "neighborhood": "Centro"
}

try:
    res = client.emit_boleto(inst_data, customer_data)
    print("Success!", res)
except Exception as e:
    print(f"ERROR OCCURRED: {e}")


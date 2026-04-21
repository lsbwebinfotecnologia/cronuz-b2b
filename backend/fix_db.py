from app.db.session import SessionLocal
from app.models.financial import FinancialInstallment
import datetime
import requests
import re
from app.integrators.inter_client import BancoInterClient
from app.models.company_settings import CompanySettings

db = SessionLocal()
inst = db.query(FinancialInstallment).filter_by(id=61).first()
settings = db.query(CompanySettings).filter_by(company_id=inst.transaction.company_id).first()

client = BancoInterClient(
    client_id=settings.inter_client_id,
    client_secret=settings.inter_client_secret,
    cert_path=settings.inter_cert_path,
    key_path=settings.inter_key_path,
    sandbox=settings.inter_sandbox,
    account_number=settings.inter_account_number,
    api_version=settings.inter_api_version
)

token = client.get_token()
headers = {
    "Authorization": f"Bearer {token}",
    "x-conta-corrente": re.sub(r"\D", "", client.account_number).lstrip("0") or "1"
}
hoje = datetime.datetime.now().strftime("%Y-%m-%d")
url = f"{client.base_url}/cobranca/v3/cobrancas?dataInicial={hoje}&dataFinal={hoje}"
cert = (client.cert_path, client.key_path) if client.cert_path else None
res = requests.get(url, headers=headers, cert=cert, verify=not client.sandbox)

if res.status_code == 200:
    for c in res.json().get("cobrancas", []):
        if c.get("seuNumero") == "61":
            print("Found UUID:", c.get("codigoSolicitacao"))
            inst.bank_slip_nosso_numero = f"V3_REQ|{c.get('codigoSolicitacao')}|{inst.bank_slip_nosso_numero}"
            db.commit()
            print("Database fixed!")
            break

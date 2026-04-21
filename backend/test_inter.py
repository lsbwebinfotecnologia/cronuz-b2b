import requests
import re
import os
from dotenv import load_dotenv
load_dotenv(".env")
# we can just use requests directly if we connect to psycopg2 with the env vars!
import psycopg2
conn = psycopg2.connect(
    dbname=os.environ.get("POSTGRES_DB", "cronuz"),
    user=os.environ.get("POSTGRES_USER", "postgres"),
    password=os.environ.get("POSTGRES_PASSWORD", "postgres"),
    host=os.environ.get("POSTGRES_SERVER", "localhost"),
    port=os.environ.get("POSTGRES_PORT", "5432")
)
cur = conn.cursor()
cur.execute("SELECT bank_slip_nosso_numero, transaction_id FROM fin_installment WHERE id = 61")
nosso, t_id = cur.fetchone()

cur.execute(f"SELECT company_id FROM fin_transaction WHERE id = {t_id}")
c_id = cur.fetchone()[0]

cur.execute(f"SELECT inter_client_id, inter_client_secret, inter_cert_path, inter_key_path, inter_sandbox, inter_account_number, inter_api_version FROM cmp_settings WHERE company_id = {c_id}")
settings = cur.fetchone()

import urllib.parse
client_id = settings[0]
client_secret = settings[1]
cert_path = settings[2]
key_path = settings[3]
sandbox = settings[4]
account_number = settings[5]

# get token manually
cert = (cert_path, key_path) if cert_path else None
url = "https://cdpj.partners.bancointer.com.br/oauth/v2/token"
data = {"client_id": client_id, "client_secret": client_secret, "grant_type": "client_credentials", "scope": "boleto-cobranca.read"}
headers = {"Content-Type": "application/x-www-form-urlencoded"}

res = requests.post(url, data=data, cert=cert, headers=headers)
token = res.json().get("access_token")

cod = nosso.split("|")[1]
url_cob = f"https://cdpj.partners.bancointer.com.br/cobranca/v3/cobrancas/{cod}"
headers_cob = {
    "Authorization": f"Bearer {token}",
    "x-conta-corrente": re.sub(r"\D", "", account_number).lstrip("0") or "1"
}
res_cob = requests.get(url_cob, headers=headers_cob, cert=cert)
print("Status:", res_cob.status_code)
print("JSON:", res_cob.json())

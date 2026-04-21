import urllib.parse
import os
import requests
import re
from dotenv import load_dotenv
load_dotenv(".env")
import psycopg2
import datetime

conn = psycopg2.connect(
    dbname=os.environ.get("POSTGRES_DB", "cronuz"),
    user=os.environ.get("POSTGRES_USER", "postgres"),
    password=os.environ.get("POSTGRES_PASSWORD", "postgres"),
    host=os.environ.get("POSTGRES_SERVER", "localhost"),
    port=os.environ.get("POSTGRES_PORT", "5432")
)
cur = conn.cursor()
cur.execute("SELECT transaction_id FROM fin_installment WHERE id = 61")
t_id = cur.fetchone()[0]

cur.execute(f"SELECT company_id FROM fin_transaction WHERE id = {t_id}")
c_id = cur.fetchone()[0]

cur.execute(f"SELECT inter_client_id, inter_client_secret, inter_cert_path, inter_key_path, inter_account_number FROM cmp_settings WHERE company_id = {c_id}")
settings = cur.fetchone()

# auth
client_id = settings[0]
client_secret = settings[1]
cert_path = settings[2]
key_path = settings[3]
account_number = settings[4]

cert = (cert_path, key_path) if cert_path else None
url_auth = "https://cdpj.partners.bancointer.com.br/oauth/v2/token"
data = {"client_id": client_id, "client_secret": client_secret, "grant_type": "client_credentials", "scope": "boleto-cobranca.read"}
headers_auth = {"Content-Type": "application/x-www-form-urlencoded"}
res_auth = requests.post(url_auth, data=data, cert=cert, headers=headers_auth)
token = res_auth.json().get("access_token")

hoje = datetime.datetime.now().strftime("%Y-%m-%d")
url_cob = f"https://cdpj.partners.bancointer.com.br/cobranca/v3/cobrancas?dataInicial={hoje}&dataFinal={hoje}"
headers_cob = {
    "Authorization": f"Bearer {token}",
    "x-conta-corrente": re.sub(r"\D", "", account_number).lstrip("0") or "1"
}
res_cob = requests.get(url_cob, headers=headers_cob, cert=cert)

for c in res_cob.json().get("cobrancas", []):
    if c.get("seuNumero") == "61":
        cod_solic = c.get("codigoSolicitacao")
        # keep the original nossoNumero which is currently in the DB
        cur.execute("SELECT bank_slip_nosso_numero FROM fin_installment WHERE id = 61")
        old_nn = cur.fetchone()[0]
        # if it DOES NOT contain V3_REQ yet
        if not old_nn.startswith("V3_REQ"):
            new_nn = f"V3_REQ|{cod_solic}|{old_nn}"
            cur.execute("UPDATE fin_installment SET bank_slip_nosso_numero = %s WHERE id = 61", (new_nn,))
            conn.commit()
            print(f"Fixed row 61. Old: {old_nn}, New: {new_nn}")
        else:
            print(f"Row 61 already fixed: {old_nn}")
        break

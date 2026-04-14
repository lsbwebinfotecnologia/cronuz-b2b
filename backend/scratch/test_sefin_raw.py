import requests
import psycopg2

conn = psycopg2.connect('dbname=cronuz_b2b user=licivandosilva password=cronuz host=localhost')
cur = conn.cursor()
cur.execute("SELECT xml_protocol_id FROM nfse_queues WHERE service_order_id = 29 ORDER BY id DESC LIMIT 1;")
chave = cur.fetchone()[0]
print("CHAVE:", chave)

from app.integrators.nfse_crypto import NFSeCrypto

class DummyCompany:
    cnf_certificate_path = "uploads/certificates/1/cert.pfx"
    cnf_certificate_password = "1"
    cnpj = "3504107221... " # i don't need it
    
crypto = NFSeCrypto(DummyCompany())
cert, key = crypto.create_mtls_temp_files()

url = f"https://sefin.producaorestrita.nfse.gov.br/v1/nfse/{chave}"
print("URL:", url)
res = requests.get(url, cert=(cert, key), headers={"Accept":"application/json"})
print("STATUS:", res.status_code)
print("BODY:", res.text)
import os
os.remove(cert)
os.remove(key)

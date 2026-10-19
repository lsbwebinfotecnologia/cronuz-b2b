"""
Diagnóstico de latência Catavento + conectividade Inovação (rodar no servidor de produção).
Somente leitura no banco (SELECT do token já cacheado). Não grava nada.
Uso: python3 diag_distributors.py <isbn>
"""
import sys
import time
import json
import socket
import subprocess
import urllib.request
import urllib.error

ISBN = sys.argv[1] if len(sys.argv) > 1 else "9786551990168"
BASE = "https://api.cataventobr.com.br"


def get_token():
    out = subprocess.check_output(
        ["psql", "-U", "cronuz_admin", "-h", "localhost", "-d", "cronuz_b2b", "-At", "-c",
         "SELECT token FROM dst_distributor WHERE company_id=2 AND slug='catavento'"],
        env={"PGPASSWORD": "cronuz_password_123", "PATH": "/usr/bin:/bin"},
    )
    return out.decode().strip()


def timed(method, url, token, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "API_TOKEN": token, "Content-Type": "application/json", "Accept": "application/json",
        "User-Agent": "CronuzB2B/1.0",
    })
    t = time.time()
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            payload = r.read().decode("utf-8", "ignore")
            return r.status, round(time.time() - t, 2), payload[:250]
    except urllib.error.HTTPError as e:
        return e.code, round(time.time() - t, 2), e.read().decode("utf-8", "ignore")[:250]
    except Exception as e:
        return -1, round(time.time() - t, 2), str(e)


token = get_token()
print("token_len:", len(token))
for i in range(3):
    print("BuscarVarios", timed("POST", f"{BASE}/BDIApi/Produto/BuscarVarios", token, [ISBN]))
for i in range(3):
    print("Situacao    ", timed("GET", f"{BASE}/BDIApi/Produto/Situacao?codigo={ISBN}", token))

print("--- TCP Inovação 177.102.108.54:443 ---")
for i in range(3):
    s = socket.socket()
    s.settimeout(8)
    t = time.time()
    try:
        s.connect(("177.102.108.54", 443))
        print("connect OK", round(time.time() - t, 2))
    except Exception as e:
        print("connect FAIL", round(time.time() - t, 2), e)
    finally:
        s.close()

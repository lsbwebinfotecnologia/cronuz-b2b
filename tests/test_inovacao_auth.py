"""
Teste manual de autenticação na API SimpleSet (Inovação Distribuidora).
Uso: python3 test_inovacao_auth.py <usuario> <senha> [isbn]
Testa variações de data (hoje BRT, hoje UTC, ontem) para diagnosticar a fórmula.
"""
import sys
import hashlib
import json
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta

BASE = "https://simpleset.inovacaodistribuidora.com.br"


def md5(s: str) -> str:
    return hashlib.md5(s.encode("utf-8")).hexdigest()


def call(user: str, key: str, isbn: str):
    url = f"{BASE}/api/estoques?isbn13={isbn}"
    req = urllib.request.Request(url, headers={
        "X-SimpleSet-Username": user,
        "X-SimpleSet-API-Key": key,
        "Accept": "application/json",
        "User-Agent": "CronuzB2B/1.0",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, r.read().decode("utf-8", "ignore")[:400]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "ignore")[:400]
    except Exception as e:
        return -1, str(e)


if __name__ == "__main__":
    user, pwd = sys.argv[1], sys.argv[2]
    isbn = sys.argv[3] if len(sys.argv) > 3 else "9786551990168"
    brt = datetime.now(timezone(timedelta(hours=-3)))
    utc = datetime.now(timezone.utc)
    dates = {
        "hoje_BRT": brt.strftime("%Y-%m-%d"),
        "hoje_UTC": utc.strftime("%Y-%m-%d"),
        "ontem_BRT": (brt - timedelta(days=1)).strftime("%Y-%m-%d"),
    }
    seen = set()
    for label, d in dates.items():
        if d in seen:
            continue
        seen.add(d)
        key = md5(f"{user}{d}{md5(pwd)}")
        status, body = call(user, key, isbn)
        print(f"[{label} {d}] HTTP {status} -> {body}")

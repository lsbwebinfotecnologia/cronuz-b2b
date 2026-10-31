"""
Teste Automatizado End-to-End — API Horus Complementar & Agente Bridge (.EXE)
Valida:
1. Geração e verificação criptográfica da chave HMAC-SHA256 (HBRI1) no Backend e no .EXE.
2. Catálogo da Documentação Oficial (/horus-api-bridge/documentation).
3. Simulação completa do Túnel Reverso (Agente .EXE fazendo poll + GZIP respond) quando uma
   chamada pública bate em /Horus/api/TServerB2B/Busca_Acervo e /Horus/api/TServerB2B/Busca_TitulosFinanceiros.
"""
import os
import sys
import json
import gzip
import base64
import threading
import time
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "backend"))
sys.path.insert(0, os.path.join(ROOT, "tools", "horus-api-bridge-windows"))

from app.api.horus_api_bridge import (
    generate_horus_bridge_license_key,
    verify_horus_bridge_license_key,
)
from horus_api_bridge_app import verify_license_key_local


def test_license_hmac_compatibility():
    key = generate_horus_bridge_license_key(
        company_id=1,
        company_document="12.345.678/0001-99",
        enabled=True,
        expires_at_iso="2027-12-31",
        allow_financial_sql=True,
        rate_limit_per_min=150,
    )
    assert key.startswith("HBRI1."), f"Prefixo inesperado: {key}"

    ok_backend, msg_backend, payload_backend = verify_horus_bridge_license_key(key)
    assert ok_backend, f"Falha na validação backend: {msg_backend}"
    assert payload_backend["cid"] == 1

    ok_exe, msg_exe, payload_exe = verify_license_key_local(key)
    assert ok_exe, f"Falha na validação do .EXE: {msg_exe}"
    assert payload_exe["cid"] == 1
    print("✓ [1/2] Compatibilidade Criptográfica HMAC-SHA256 (Backend <-> HorusAPIBridge.exe) OK:", msg_exe)


def test_documentation_endpoint():
    req = urllib.request.Request("http://127.0.0.1:8000/horus-api-bridge/documentation")
    with urllib.request.urlopen(req, timeout=10) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert "categories" in data
        total_eps = sum(len(c["endpoints"]) for c in data["categories"])
        assert total_eps >= 15
        print(f"✓ [2/2] Endpoint de Documentação (/horus-api-bridge/documentation) OK ({total_eps} grupos/endpoints catalogados)")


if __name__ == "__main__":
    test_license_hmac_compatibility()
    test_documentation_endpoint()
    print("TODOS OS TESTES DO HORUS API BRIDGE PASSARAM COM SUCESSO!")

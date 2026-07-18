"""
tests/test_sefaz_download.py
============================
Script de teste manual para validar o download de XMLs da SEFAZ.

USO:
  cd backend
  source venv/bin/activate
  python ../tests/test_sefaz_download.py

Antes de rodar:
  1. Configure as variáveis abaixo (BRANCH_ID, DATA_INICIO, DATA_FIM, TOKEN)
  2. Certifique-se que a API está rodando em localhost:8000
  3. O certificado deve estar carregado na filial informada
"""

import requests
import json
import os
from datetime import date, timedelta

# ─────────────────────────────────────────────────
# CONFIGURAÇÃO DO TESTE
# ─────────────────────────────────────────────────
API_URL = "http://localhost:8000"

# Informe seu token JWT (copie do localStorage do browser:
# DevTools > Application > Local Storage > access_token)
TOKEN = os.environ.get("SEFAZ_TEST_TOKEN", "SEU_TOKEN_AQUI")

# ID da filial cadastrada (veja GET /sefaz/branches)
BRANCH_ID = int(os.environ.get("SEFAZ_BRANCH_ID", "1"))

# Período do teste (últimos 30 dias por padrão)
DATA_FIM = date.today()
DATA_INICIO = DATA_FIM - timedelta(days=30)

# Modelos: "65" = NFC-e (cupom), "55" = NF-e, ou ambos
MODELOS = ["65"]  # Apenas NFC-e (cupom fiscal)

# ─────────────────────────────────────────────────


def get_headers():
    return {"Authorization": f"Bearer {TOKEN}"}


def step1_listar_filiais():
    print("\n" + "="*60)
    print("PASSO 1 — Listar filiais cadastradas")
    print("="*60)
    r = requests.get(f"{API_URL}/sefaz/branches", headers=get_headers())
    print(f"Status: {r.status_code}")
    if r.status_code == 200:
        filiais = r.json()
        for f in filiais:
            cert_status = "✅ CERT OK" if f.get("has_sefaz_cert") else "❌ SEM CERT"
            print(f"  ID={f['id']} | {f['nome']} | CNPJ={f.get('cnpj','—')} | UF={f.get('uf','?')} | {f['sefaz_environment']} | {cert_status}")
        return filiais
    else:
        print(f"Erro: {r.text}")
        return []


def step2_download_xml():
    print("\n" + "="*60)
    print("PASSO 2 — Download de XMLs NFC-e (cupom)")
    print("="*60)
    print(f"  Branch ID : {BRANCH_ID}")
    print(f"  Modelos   : {MODELOS}")
    print(f"  Período   : {DATA_INICIO} a {DATA_FIM}")
    print(f"  Dias      : {(DATA_FIM - DATA_INICIO).days}")
    print()

    params = {
        "branch_id": BRANCH_ID,
        "data_inicio": DATA_INICIO.isoformat(),
        "data_fim": DATA_FIM.isoformat(),
        "modelos": MODELOS,
    }

    print("Consultando SEFAZ... (pode levar até 60s dependendo do volume)")
    try:
        r = requests.post(
            f"{API_URL}/sefaz/download-xml",
            params=params,
            headers=get_headers(),
            timeout=120,
        )
    except requests.exceptions.Timeout:
        print("❌ TIMEOUT — A SEFAZ não respondeu em 120 segundos.")
        return

    print(f"Status HTTP: {r.status_code}")

    if r.status_code == 200:
        total_xmls = r.headers.get("X-Total-XMLs", "?")
        content_type = r.headers.get("Content-Type", "")
        print(f"✅ Sucesso!")
        print(f"   Total XMLs encontrados: {total_xmls}")
        print(f"   Content-Type: {content_type}")
        print(f"   Tamanho ZIP: {len(r.content):,} bytes")

        # Salva o ZIP na pasta tests/
        output_path = os.path.join(os.path.dirname(__file__), f"output_sefaz_{DATA_INICIO.strftime('%Y%m%d')}_a_{DATA_FIM.strftime('%Y%m%d')}.zip")
        with open(output_path, "wb") as f:
            f.write(r.content)
        print(f"   Arquivo salvo em: {output_path}")

        if int(total_xmls or 0) == 0:
            print("\n⚠️  Nenhum XML encontrado no período.")
            print("   Sugestões:")
            print("   - Amplie o período (ex: 60-90 dias)")
            print("   - Verifique se o CNPJ emitiu NFC-e no período")
            print("   - Se for Homologação, há XMLs de teste disponíveis?")
    else:
        print(f"❌ Erro da API:")
        try:
            erro = r.json()
            print(f"   {json.dumps(erro, indent=2, ensure_ascii=False)}")
        except Exception:
            print(f"   {r.text[:500]}")


def step3_verificar_conexao_sefaz():
    """Testa imports e inicialização do serviço."""
    print("\n" + "="*60)
    print("PASSO 3 — Validar imports do serviço SEFAZ")
    print("="*60)
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
    try:
        from app.integrators.sefaz_sp_service import (
            UF_CODIGO_IBGE, SEFAZ_NFE_DIST_DFE, TempCertContext, download_xmls_sefaz
        )
        print("✅ Imports OK")
        print(f"   URL PRODUCAO : {SEFAZ_NFE_DIST_DFE['PRODUCAO']}")
        print(f"   URL HML      : {SEFAZ_NFE_DIST_DFE['HOMOLOGACAO']}")
        print(f"   UFs mapeadas : {len(UF_CODIGO_IBGE)}")
    except ImportError as e:
        print(f"❌ Erro de import: {e}")


if __name__ == "__main__":
    import sys

    print("\n" + "█"*60)
    print("  TESTE DE DOWNLOAD SEFAZ")
    print("  Ambiente: LOCAL — API localhost:8000")
    print("█"*60)

    if TOKEN == "SEU_TOKEN_AQUI":
        print("\n⚠️  Configure o TOKEN antes de rodar:")
        print("   export SEFAZ_TEST_TOKEN='eyJ...'")
        print("   export SEFAZ_BRANCH_ID=1")
        print("\n   O token está no localStorage do browser:")
        print("   DevTools > Application > Local Storage > access_token")
        print()

    step3_verificar_conexao_sefaz()
    filiais = step1_listar_filiais()

    if TOKEN != "SEU_TOKEN_AQUI":
        step2_download_xml()
    else:
        print("\n─── Para testar o download, configure o TOKEN e BRANCH_ID ───")
        print("   Filiais acima foram listadas sem autenticação real.")

"""
Teste manual em STAGE: emissão de UM boleto no Banco Cora com as credenciais cadastradas no Master.
Não grava nada no PostgreSQL (apenas lê fin_cora_account). Somente ambiente STAGE.

Uso:
  cd backend && ./venv/bin/python ../tests/cora_stage_emit_test.py check
  cd backend && ./venv/bin/python ../tests/cora_stage_emit_test.py token
  cd backend && ./venv/bin/python ../tests/cora_stage_emit_test.py emit <valor_centavos> <vencimento YYYY-MM-DD> <bairro>
  cd backend && ./venv/bin/python ../tests/cora_stage_emit_test.py get <invoice_id>
"""
import importlib
import json
import os
import pkgutil
import sys
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))
import app.models as _models_pkg  # noqa: E402

for _m in pkgutil.iter_modules(_models_pkg.__path__):
    importlib.import_module(f"app.models.{_m.name}")

from app.db.session import SessionLocal  # noqa: E402
from app.integrators.cora.client import CoraAPIError, CoraClient  # noqa: E402
from app.models.cora import CoraAccount  # noqa: E402

COMPANY_ID = 4
# Padrão STAGE. PRODUCTION somente com CORA_ENV=PRODUCTION explícito (emite boleto REAL).
ENVIRONMENT = os.environ.get("CORA_ENV", "STAGE").upper()
if ENVIRONMENT not in ("STAGE", "PRODUCTION"):
    sys.exit("CORA_ENV inválido.")


def load_account(db):
    acc = db.query(CoraAccount).filter(CoraAccount.company_id == COMPANY_ID, CoraAccount.environment == ENVIRONMENT).first()
    if not acc:
        sys.exit(f"Sem credenciais {ENVIRONMENT} para a company 4.")
    override = os.environ.get("CORA_CLIENT_ID_OVERRIDE")
    if override:
        db.expunge(acc)          # desanexa da sessão: a alteração abaixo NUNCA é gravada no banco
        acc.client_id = override
    return acc


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    db = SessionLocal()
    try:
        acc = load_account(db)
        if cmd == "check":
            print(json.dumps({
                "client_id": acc.client_id, "cert_subject": acc.cert_subject, "cert_format": acc.cert_format,
                "has_key": bool(acc.key_content), "valid_until": str(acc.cert_valid_until),
                "last_test_ok": acc.last_test_ok, "last_test_message": acc.last_test_message,
            }, indent=1, ensure_ascii=False))
            return

        with CoraClient.from_account(acc) as cora:
            if cmd == "token":
                print(cora.test_connection())
            elif cmd == "emit":
                amount, due, district = int(sys.argv[2]), sys.argv[3], sys.argv[4]
                payload = {
                    "code": f"HORUS-TESTE-{uuid.uuid4().hex[:8]}",
                    "customer": {
                        "name": "Licivando Silva",
                        "document": {"identity": "01987476328", "type": "CPF"},
                        "address": {
                            "street": "Rua Sebastiao Cavalheiro", "number": "615", "district": district,
                            "city": "Atibaia", "state": "SP", "complement": "N/A", "zip_code": "12946699",
                        },
                    },
                    "services": [{"name": "ERP Horus", "description": "Boleto de teste - ERP Horus", "amount": amount}],
                    "payment_terms": {"due_date": due},
                    "payment_forms": ["BANK_SLIP", "PIX"],
                }
                try:
                    print(json.dumps(cora.create_invoice(payload, idempotency_key=str(uuid.uuid4())), indent=1, ensure_ascii=False))
                except CoraAPIError as e:
                    print(json.dumps({"erro": str(e), "status": e.status_code, "payload": e.payload}, indent=1, ensure_ascii=False))
            elif cmd == "get":
                print(json.dumps(cora.get_invoice(sys.argv[2]), indent=1, ensure_ascii=False))
            elif cmd == "cancel":
                try:
                    res = cora.cancel_invoice(sys.argv[2])
                    print(json.dumps({"cancel_response": res}, indent=1, ensure_ascii=False))
                except CoraAPIError as e:
                    print(json.dumps({"erro": str(e), "status": e.status_code, "payload": e.payload}, indent=1, ensure_ascii=False))
    finally:
        db.close()


if __name__ == "__main__":
    main()

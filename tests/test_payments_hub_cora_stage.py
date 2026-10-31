"""
Teste de integração do Hub de Pagamentos com o Banco Cora (STAGE), SEM persistir nada no PostgreSQL local.

Tudo roda dentro de uma transação externa revertida ao final (os commits do serviço viram SAVEPOINTs).
No Cora Stage: emite → sincroniza → reemite (novo vencimento; cancela a anterior) → cancela a nova.
Todos os boletos de teste terminam CANCELADOS no Stage.

Uso: cd backend && ./venv/bin/python ../tests/test_payments_hub_cora_stage.py
"""
import importlib
import os
import pkgutil
import sys
from datetime import date, timedelta
from decimal import Decimal

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))
import app.models as _models_pkg  # noqa: E402

for _m in pkgutil.iter_modules(_models_pkg.__path__):
    importlib.import_module(f"app.models.{_m.name}")

from sqlalchemy.orm import Session  # noqa: E402

from app.db.session import engine  # noqa: E402
from app.models.cora import CoraAccount, CoraConfig  # noqa: E402
from app.models.payments import PayChargeEvent, PayProviderEnablement  # noqa: E402
from app.payments import service  # noqa: E402
from app.payments.base import ChargePayer, PaymentProviderError  # noqa: E402

COMPANY_ID = 4


def main():
    conn = engine.connect()
    outer = conn.begin()
    db = Session(bind=conn, join_transaction_mode="create_savepoint")
    try:
        # Preparação (revertida no final)
        db.add(PayProviderEnablement(company_id=COMPANY_ID, provider="CORA", enabled=True))
        cfg = db.query(CoraConfig).filter(CoraConfig.company_id == COMPANY_ID).first() or CoraConfig(company_id=COMPANY_ID)
        cfg.active_environment = "STAGE"
        db.add(cfg)
        acc = db.query(CoraAccount).filter(CoraAccount.company_id == COMPANY_ID, CoraAccount.environment == "STAGE").one()
        if not (acc.client_id or "").startswith("int-"):
            acc.client_id = acc.cert_subject   # Client ID salvo errado no banco local; corrigido só nesta transação
        db.flush()

        payer = ChargePayer(
            name="Licivando Silva", document="01987476328", street="Rua Sebastiao Cavalheiro", number="615",
            district="Jardim Maristela", city="Atibaia", state="SP", zip_code="12946699",
        )

        # Validação: mínimo R$ 5,00
        try:
            service.create_charge(db, COMPANY_ID, payer=payer, amount=Decimal("1.00"), due_date=date.today() + timedelta(days=3),
                                  description="ERP Horus", provider_code="CORA", origin_type="MANUAL")
            raise AssertionError("deveria recusar R$ 1,00")
        except PaymentProviderError as e:
            assert "5,00" in str(e)
            print("✔ Valor abaixo de R$ 5,00 recusado antes de chamar o Cora")

        c1 = service.create_charge(db, COMPANY_ID, payer=payer, amount=Decimal("5.00"), due_date=date.today() + timedelta(days=3),
                                   description="ERP Horus", provider_code="CORA", origin_type="MANUAL", origin_ref="manual:teste-hub")
        assert c1.status == "OPEN" and c1.provider_charge_id and c1.digitable_line, c1.status
        print(f"✔ Emitido no Cora Stage: #{c1.id} {c1.provider_charge_id} status={c1.status} linha={c1.digitable_line[:12]}…")

        try:
            service.create_charge(db, COMPANY_ID, payer=payer, amount=Decimal("5.00"), due_date=date.today() + timedelta(days=3),
                                  description="ERP Horus", provider_code="CORA", origin_type="MANUAL", origin_ref="manual:teste-hub")
            raise AssertionError("deveria bloquear duplicidade da origem")
        except PaymentProviderError:
            print("✔ Segunda cobrança para a mesma origem bloqueada (sem duplicidade)")

        service.sync_charge(db, c1)
        print(f"✔ Sincronizado: status={c1.status} registrado={c1.registered}")

        c2 = service.reissue_charge(db, c1, date.today() + timedelta(days=10))
        assert c1.status == "CANCELLED" and c2.status == "OPEN" and c2.replaces_charge_id == c1.id
        print(f"✔ Reemissão (novo vencimento): #{c1.id} CANCELADO → #{c2.id} {c2.provider_charge_id} venc. {c2.due_date}")

        page = service.query_charges(db, COMPANY_ID, provider="CORA", tab="due").all()
        assert any(x.id == c2.id for x in page)
        dash = service.dashboard(db, COMPANY_ID, provider="CORA", months=6)
        assert dash["kpis"]["due"]["qty"] >= 1 and len(dash["series"]) == 6
        assert dash["kpis"]["error"]["qty"] == 0, "valor inválido não deveria gerar registro de erro"
        print(f"✔ Listagem 'A vencer' e painel OK: {dash['kpis']}")

        service.cancel_charge(db, c2)
        assert c2.status == "CANCELLED"
        print(f"✔ Cancelado no Cora: #{c2.id} {c2.provider_charge_id}")

        events = db.query(PayChargeEvent).filter(PayChargeEvent.charge_id.in_([c1.id, c2.id])).count()
        print(f"✔ Eventos registrados: {events}")
        print("\nTodos os testes passaram. Revertendo transação local (nada gravado no PostgreSQL).")
    finally:
        db.close()
        outer.rollback()
        conn.close()


if __name__ == "__main__":
    main()

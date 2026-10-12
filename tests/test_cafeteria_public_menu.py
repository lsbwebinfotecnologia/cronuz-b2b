import os
import sys
from decimal import Decimal

# Adiciona backend ao PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from fastapi.testclient import TestClient
import main
from main import app
from app.db.session import SessionLocal
from app.models.company import Company
from app.models.cafeteria import CAFTable, CAFTableStatus


def test_public_menu_and_waiter():
    print("=" * 60)
    print("TESTE DO CARDÁPIO DIGITAL PÚBLICO E CHAMADA DE GARÇOM")
    print("=" * 60)

    db = SessionLocal()
    try:
        # Encontra empresa com cafeteria ativa
        company = db.query(Company).filter(Company.module_cafeteria == True).first()
        if not company:
            company = db.query(Company).first()
            if company:
                company.module_cafeteria = True
                db.commit()

        if not company:
            print("[!] Nenhuma empresa encontrada para teste.")
            return

        print(f" -> Testando com empresa id={company.id} ({company.name})")

        # Garante ao menos uma mesa cadastrada
        table = db.query(CAFTable).filter(CAFTable.company_id == company.id).first()
        if not table:
            table = CAFTable(
                company_id=company.id,
                number="01",
                area="Salão Principal",
                capacity=4,
                status=CAFTableStatus.AVAILABLE.value
            )
            db.add(table)
            db.commit()
            db.refresh(table)

        client = TestClient(app)

        # 1. Consulta Cardápio Público por ID da empresa
        print(f"\n[1/3] Testando GET /public/cafeteria/menu/{company.id}?mesa={table.number}...")
        res = client.get(f"/public/cafeteria/menu/{company.id}?mesa={table.number}")
        assert res.status_code == 200, f"Erro status {res.status_code}: {res.text}"
        data = res.json()

        assert "company" in data, "Resposta não contém company"
        assert data["company"]["id"] == company.id, "ID da empresa incorreto"
        assert "products" in data, "Resposta não contém lista de produtos"
        assert "categories" in data, "Resposta não contém categorias"
        if table:
            assert data.get("table") is not None, "Mesa não foi identificada"
            assert data["table"]["number"] == table.number, "Número da mesa incorreto"

        print(f" -> Sucesso! Cardápio retornado com {len(data['products'])} produtos e {len(data['categories'])} categorias.")
        print(f"    Mesa identificada: {data['table']['number']} ({data['table'].get('area')})")

        # 2. Consulta Cardápio Público por domínio ou slug
        if company.domain:
            print(f"\n[2/3] Testando GET /public/cafeteria/menu/{company.domain}...")
            res_domain = client.get(f"/public/cafeteria/menu/{company.domain}")
            assert res_domain.status_code == 200, f"Erro status {res_domain.status_code}"
            print(" -> Sucesso! Cardápio recuperado via domínio/slug da empresa.")

        # 3. Teste de Chamada de Garçom
        print("\n[3/3] Testando POST /public/cafeteria/call-waiter...")
        waiter_payload = {
            "company_id": company.id,
            "table_number": table.number,
            "customer_name": "Cliente VIP Teste",
            "notes": "Gostaria de pedir uma sobremesa e a conta."
        }
        res_waiter = client.post("/public/cafeteria/call-waiter", json=waiter_payload)
        assert res_waiter.status_code == 200, f"Erro status {res_waiter.status_code}: {res_waiter.text}"
        waiter_data = res_waiter.json()
        assert waiter_data["success"] is True, "Chamada de garçom retornou success=False"
        print(f" -> Sucesso! Resposta: {waiter_data['message']}")

        print("\n" + "=" * 60)
        print("TODOS OS TESTES DO CARDÁPIO DIGITAL PASSARAM COM 100% DE SUCESSO!")
        print("=" * 60)

    finally:
        db.close()


if __name__ == "__main__":
    test_public_menu_and_waiter()

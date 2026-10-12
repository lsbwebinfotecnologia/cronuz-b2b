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
from app.models.product import Product
from app.models.cafeteria import (
    CAFTable, CAFTableStatus,
    CAFModifierGroup, CAFModifierOption, CAFProductModifier,
    CAFTab, CAFTabStatus
)
from app.core.dependencies import get_current_user


def test_search_and_add_item_routine():
    print("=" * 60)
    print("TESTE DE ROTINA: BUSCA DE PRODUTOS, COMANDA E LANÇAMENTO")
    print("=" * 60)

    db = SessionLocal()
    try:
        # Empresa com cafeteria ativa (id=4 ou primeira ativa)
        company = db.query(Company).filter(Company.id == 4).first()
        if not company:
            company = db.query(Company).filter(Company.module_cafeteria == True).first()
        if not company:
            company = db.query(Company).first()

        assert company, "Nenhuma empresa encontrada"
        company.module_cafeteria = True
        db.commit()

        print(f" -> Testando com empresa id={company.id} ({company.name})")

        # Mock de usuário autenticado
        class MockUser:
            id = 1
            company_id = company.id
            type = "SELLER"
            name = "Operador Cafeteria Teste"

        app.dependency_overrides[get_current_user] = lambda: MockUser()
        client = TestClient(app)

        # 1. Garante produto de cafeteria cadastrado
        prod = db.query(Product).filter(Product.company_id == company.id).first()
        if not prod:
            prod = Product(
                company_id=company.id,
                sku="CAF-001",
                name="Café Espresso Duplo Especial",
                base_price=9.50,
                status="ACTIVE",
                stock_quantity=100
            )
            db.add(prod)
            db.commit()
            db.refresh(prod)
        print(f" -> Produto de teste: ID={prod.id}, Nome='{prod.name}', Preço=R$ {prod.base_price}")

        # 2. Testa busca de produtos (vazio, 'cafe', 'pao', etc)
        print("\n[1/4] Testando endpoint /products/search com termo vazio (q='')...")
        res_empty = client.get(f"/companies/{company.id}/cafeteria/products/search?q=")
        assert res_empty.status_code == 200, f"Erro status {res_empty.status_code}: {res_empty.text}"
        items_empty = res_empty.json()
        print(f" -> Sucesso! Retornou {len(items_empty)} produtos no catálogo.")

        print("\n[2/4] Testando endpoint /products/search com termo 'cafe' (q='cafe')...")
        res_search = client.get(f"/companies/{company.id}/cafeteria/products/search?q=cafe")
        assert res_search.status_code == 200, f"Erro status {res_search.status_code}: {res_search.text}"
        items_search = res_search.json()
        print(f" -> Sucesso! Retornou {len(items_search)} produtos para a busca 'cafe'.")

        print("\n[3/4] Testando endpoint /products/search com termo 'pao' (q='pao')...")
        res_pao = client.get(f"/companies/{company.id}/cafeteria/products/search?q=pao")
        assert res_pao.status_code == 200, f"Erro status {res_pao.status_code}: {res_pao.text}"
        print(f" -> Sucesso! Respondeu HTTP 200 com {len(res_pao.json())} itens (sem quebrar com 500).")

        # 3. Abre comanda
        tab_num = f"CMD-TEST-{int(Decimal(str(prod.id)) * 100)}"
        print(f"\n[4/4] Testando abertura de comanda #{tab_num} e lançamento de item...")
        open_payload = {
            "tab_number": tab_num,
            "customer_name": "Cliente Teste Rotina",
            "notes": "Mesa do balcão"
        }
        res_tab = client.post(f"/companies/{company.id}/cafeteria/tabs", json=open_payload)
        # Se já existir de execução anterior, não tem problema
        if res_tab.status_code == 201:
            tab_data = res_tab.json()
            tab_id = tab_data["id"]
            print(f" -> Comanda #{tab_num} criada com sucesso! ID={tab_id}")
        else:
            existing = db.query(CAFTab).filter(CAFTab.company_id == company.id, CAFTab.tab_number == tab_num).first()
            tab_id = existing.id
            print(f" -> Usando comanda existente ID={tab_id}")

        # Lança item na comanda
        item_payload = {
            "product_id": prod.id,
            "barcode": prod.ean_gtin or prod.sku,
            "sku": prod.sku,
            "title": prod.name,
            "quantity": 2,
            "unit_price": float(prod.base_price or 9.50),
            "source": "CRONUZ",
            "selected_modifiers": [],
            "notes": "Sem açúcar",
            "requires_preparation": True
        }
        res_item = client.post(f"/companies/{company.id}/cafeteria/tabs/{tab_id}/items", json=item_payload)
        assert res_item.status_code == 200, f"Erro ao adicionar item: {res_item.status_code} - {res_item.text}"
        created_item = res_item.json()
        print(f" -> Item '{created_item['title']}' adicionado com sucesso! Total: R$ {created_item['total_price']}")

        # Verifica detalhes da comanda atualizada
        res_details = client.get(f"/companies/{company.id}/cafeteria/tabs/{tab_id}")
        assert res_details.status_code == 200
        tab_updated = res_details.json()
        print(f" -> Total da comanda recalculado: R$ {tab_updated['total_amount']} com {len(tab_updated['items'])} item(ns).")

        print("\n" + "=" * 60)
        print("TODOS OS TESTES DE BUSCA E LANÇAMENTO PASSARAM COM 100% DE SUCESSO!")
        print("=" * 60)

    finally:
        app.dependency_overrides.clear()
        db.close()


if __name__ == "__main__":
    test_search_and_add_item_routine()

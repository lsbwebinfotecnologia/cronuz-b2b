import os
import sys
from decimal import Decimal

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from fastapi.testclient import TestClient
import main
from app.db.session import SessionLocal
from app.models.company import Company
from app.models.user import User
from app.models.cafeteria import CAFModifierGroup, CAFModifierOption, CAFProductModifier
from app.models.product import Product
from app.models.catalog_support import Category
from app.core.dependencies import get_current_user

app = main.app

def test_cafeteria_menu_crud():
    print("=" * 60)
    print("TESTE: CRUD DE PRODUTOS DO CARDÁPIO DE CAFETERIA")
    print("=" * 60)

    db = SessionLocal()
    try:
        company = db.query(Company).filter(Company.active == True).first()
        assert company is not None, "Nenhuma empresa encontrada"

        # Garante módulo ativo
        company.module_cafeteria = True
        db.commit()

        # Cria ou obtém usuário master/seller
        user = db.query(User).filter(User.company_id == company.id).first()
        if not user:
            user = User(
                name="Atendente Cafeteria",
                email=f"cafetest_{company.id}@test.com",
                password_hash="fake_hash",
                company_id=company.id,
                type="SELLER",
                active=True
            )
            db.add(user)
            db.commit()
            db.refresh(user)

        # Cria grupo de modificador para teste de vínculo
        grp = CAFModifierGroup(
            company_id=company.id,
            name="Leite Especial Teste",
            min_selectable=0,
            max_selectable=1,
            active=True
        )
        db.add(grp)
        db.commit()
        db.refresh(grp)

        opt1 = CAFModifierOption(group_id=grp.id, company_id=company.id, name="Leite de Amêndoas", additional_price=Decimal("4.50"), active=True)
        opt2 = CAFModifierOption(group_id=grp.id, company_id=company.id, name="Leite de Aveia", additional_price=Decimal("3.50"), active=True)
        db.add_all([opt1, opt2])
        db.commit()

        # Override de autenticação para o TestClient
        app.dependency_overrides[get_current_user] = lambda: user
        client = TestClient(app)

        # 1. Teste de Categorias
        res_cat = client.get(f"/companies/{company.id}/cafeteria/categories")
        assert res_cat.status_code == 200, f"Erro ao listar categorias: {res_cat.text}"
        print(f" -> [1/5] Categorias da Cafeteria listadas com sucesso ({len(res_cat.json())} encontradas)")

        # 2. Teste de Criação de Produto de Cafeteria
        payload_create = {
            "name": "Cappuccino Trufado Teste",
            "category_name": "Cafés Especiais",
            "base_price": 14.90,
            "cost_price": 4.20,
            "stock_quantity": 50,
            "sku": "CAF-TEST-001",
            "cover_url": "/uploads/images/test.jpg",
            "short_description": "Espresso duplo, ganache de chocolate meio amargo e vaporização densa.",
            "modifier_group_ids": [grp.id]
        }

        res_create = client.post(f"/companies/{company.id}/cafeteria/menu-products", json=payload_create)
        assert res_create.status_code == 200, f"Erro ao criar produto: {res_create.text}"
        created_prod = res_create.json()
        prod_id = created_prod["id"]
        assert created_prod["name"] == "Cappuccino Trufado Teste"
        assert len(created_prod["modifier_group_ids"]) == 1
        sku_val = created_prod.get('sku')
        print(f" -> [2/5] Produto criado com sucesso via API! ID: {prod_id}, SKU: {sku_val}")

        # 3. Teste de Listagem com Filtros
        res_list = client.get(f"/companies/{company.id}/cafeteria/menu-products?search=Trufado")
        assert res_list.status_code == 200, f"Erro ao buscar produto: {res_list.text}"
        prods = res_list.json()
        assert len(prods) >= 1
        assert any(p["id"] == prod_id for p in prods)
        print(f" -> [3/5] Listagem e busca por termo validada com sucesso! Encontrados: {len(prods)}")

        # 4. Teste de Atualização (PUT)
        payload_update = {
            "name": "Cappuccino Trufado Especial 250ml",
            "base_price": 16.50,
            "stock_quantity": 80
        }
        res_update = client.put(f"/companies/{company.id}/cafeteria/menu-products/{prod_id}", json=payload_update)
        assert res_update.status_code == 200, f"Erro ao atualizar produto: {res_update.text}"
        updated_prod = res_update.json()
        assert updated_prod["name"] == "Cappuccino Trufado Especial 250ml"
        assert float(updated_prod["base_price"]) == 16.50
        assert updated_prod["stock_quantity"] == 80
        name_val = updated_prod.get('name')
        print(f" -> [4/5] Atualização do produto validada com sucesso! Novo nome: {name_val}")

        # 5. Teste de Inativação (DELETE)
        res_del = client.delete(f"/companies/{company.id}/cafeteria/menu-products/{prod_id}")
        assert res_del.status_code == 200, f"Erro ao inativar produto: {res_del.text}"
        
        # Checa status no banco
        p_db = db.query(Product).filter(Product.id == prod_id).first()
        assert p_db.status == "INACTIVE"
        print(" -> [5/5] Inativação do produto com preservação de integridade validada!")

        print("\n TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!")
    finally:
        db.close()
        app.dependency_overrides.clear()

if __name__ == "__main__":
    test_cafeteria_menu_crud()

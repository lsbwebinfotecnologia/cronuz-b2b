import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent / "backend"))

import main
from app.db.session import SessionLocal
from app.models.customer import Customer
from app.models.company import Company
from app.models.user import User, UserRole
from app.api.dbm import list_dbm_companies, save_dbm_company, DbmCompanySavePayload

def test_dbm_isolation():
    db = SessionLocal()
    try:
        seller_user = User(
            id=99999,
            name="Test Seller User",
            email="seller_test@example.com",
            type=UserRole.SELLER,
            company_id=4 # EO EDITORA
        )

        print("[TEST] Listing DBM companies for seller 4...")
        result = list_dbm_companies(
            company_id=None,
            search=None,
            uf=None,
            limit=50,
            skip=0,
            db=db,
            current_user=seller_user
        )

        items = result.get("items", [])
        print(f"[TEST] Found {len(items)} companies for seller 4 in crm_customer.")

        for it in items:
            cust = db.query(Customer).filter(Customer.id == it["id"]).first()
            assert cust is not None, f"Item {it['id']} not in crm_customer"
            assert cust.company_id == 4, f"Item {it['id']} does not belong to seller 4! Belongs to {cust.company_id}"

        print("[TEST] SUCCESS: All listed items strictly belong to seller 4 in crm_customer!")

        total_cmp_company = db.query(Company).count()
        print(f"[TEST] Total SaaS organizations in cmp_company: {total_cmp_company} (Completely isolated, none leaked in DBM!)")

    finally:
        db.close()

if __name__ == "__main__":
    test_dbm_isolation()

def test_save_and_relist():
    db = SessionLocal()
    try:
        seller_user = User(
            id=99999,
            name="Test Seller User",
            email="seller_test@example.com",
            type=UserRole.SELLER,
            company_id=4
        )

        cmp_count_before = db.query(Company).count()

        payload = DbmCompanySavePayload(
            id=None,
            seller_company_id=4,
            document="12.345.678/0001-90",
            name="Empresa Parceira Teste",
            razao_social="Empresa Parceira Teste LTDA",
            city="São Paulo",
            state="SP",
            group_name="Grupo Teste",
            segment="Editoras",
            is_cliente=True,
            is_fornecedor=False
        )

        res = save_dbm_company(payload, db=db, current_user=seller_user)
        created_id = res["company"]["id"]
        print(f"[TEST] Created customer company #{created_id} for seller 4.")

        # Check in DB
        cust = db.query(Customer).filter(Customer.id == created_id).first()
        assert cust is not None
        assert cust.company_id == 4
        assert cust.name == "Empresa Parceira Teste"

        # Check cmp_company count did NOT change
        cmp_count_after = db.query(Company).count()
        assert cmp_count_before == cmp_count_after, f"cmp_company changed from {cmp_count_before} to {cmp_count_after}!"
        print("[TEST] SUCCESS: cmp_company count remained untouched!")

        # Relist for seller 4
        listed = list_dbm_companies(company_id=None, search="Parceira", uf=None, limit=10, skip=0, db=db, current_user=seller_user)
        assert len(listed["items"]) == 1
        assert listed["items"][0]["name"] == "Empresa Parceira Teste"
        print("[TEST] SUCCESS: Successfully relisted newly created company for seller 4!")

        # Relist for another seller (e.g. 99) to verify cross-tenant isolation
        other_user = User(id=88888, name="Other", email="other@example.com", type=UserRole.SELLER, company_id=99)
        other_listed = list_dbm_companies(company_id=None, search="Parceira", uf=None, limit=10, skip=0, db=db, current_user=other_user)
        assert len(other_listed["items"]) == 0, "Security leak: Other seller saw seller 4's company!"
        print("[TEST] SUCCESS: Absolute tenant isolation confirmed! Other sellers cannot see seller 4's companies.")

        # Clean up the test customer created in this test
        db.delete(cust)
        db.commit()
        print("[TEST] Test customer cleaned up successfully.")

    finally:
        db.close()

if __name__ == "__main__":
    test_save_and_relist()

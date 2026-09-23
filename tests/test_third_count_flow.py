import sys
import os
from datetime import datetime

# Set path to backend
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db.session import SessionLocal, engine
import main  # Load all models and FastAPI routes
from app.models.inventory import Inventory, InventorySession, InventoryScan, InventoryItem, InventoryStatus, SessionStatus
from app.api.inventory import toggle_third_count, finalize_inventory, get_discrepancies, get_sku_summary
from app.schemas.inventory import ToggleThirdCountRequest
from fastapi import HTTPException

def run_test():
    db = SessionLocal()
    try:
        print("--- Initiating 3rd Count Flow Verification ---")
        
        # 1. Create test inventory
        inv = Inventory(
            company_id=1,
            code=f"TEST-3RD-{int(datetime.now().timestamp())}",
            name="Inventário Teste 3ª Contagem",
            status=InventoryStatus.EM_ANDAMENTO.value,
            total_expected_skus=1,
            supervisor_pin="1234",
            require_third_count=False
        )
        db.add(inv)
        db.commit()
        db.refresh(inv)
        print(f"Created Inventory ID={inv.id}, require_third_count={inv.require_third_count}")
        
        # 2. Add catalog item
        item = InventoryItem(
            inventory_id=inv.id,
            company_id=1,
            isbn="9788535902777",
            title="Livro Teste Auditoria",
            publisher="Editora Teste",
            category="Ficção"
        )
        db.add(item)
        db.commit()
        
        # 3. Create Round 1 session (C1 = 10)
        s1 = InventorySession(
            inventory_id=inv.id,
            company_id=1,
            location="PRATELEIRA-01",
            session_type="CONTAGEM",
            round_number=1,
            status=SessionStatus.CONCLUIDA.value,
            operator_name="Operador 1"
        )
        db.add(s1)
        db.commit()
        db.refresh(s1)
        
        scan1 = InventoryScan(
            session_id=s1.id,
            inventory_id=inv.id,
            company_id=1,
            isbn="9788535902777",
            location="PRATELEIRA-01",
            quantity=10,
            client_uuid=f"uuid-r1-{inv.id}",
            scanned_at=datetime.now()
        )
        db.add(scan1)
        db.commit()
        
        # 4. Create Round 2 session (C2 = 12) -> Divergence (10 vs 12)
        s2 = InventorySession(
            inventory_id=inv.id,
            company_id=1,
            location="PRATELEIRA-01",
            session_type="RECONTAGEM_AUDITORIA",
            round_number=2,
            status=SessionStatus.CONCLUIDA.value,
            operator_name="Auditor 2"
        )
        db.add(s2)
        db.commit()
        db.refresh(s2)
        
        scan2 = InventoryScan(
            session_id=s2.id,
            inventory_id=inv.id,
            company_id=1,
            isbn="9788535902777",
            location="PRATELEIRA-01",
            quantity=12,
            client_uuid=f"uuid-r2-{inv.id}",
            scanned_at=datetime.now()
        )
        db.add(scan2)
        db.commit()
        print("Created Round 1 (C1=10) and Round 2 (C2=12) -> Divergent Shelf PRATELEIRA-01")
        
        # 5. Toggle require_third_count to True
        inv.require_third_count = True
        db.commit()
        print("Toggled require_third_count = True")
        
        # 6. Try to finalize inventory -> should fail with 422 Unprocessable Entity
        finalization_blocked = False
        try:
            # mock current user
            class MockUser:
                id = 1
                company_id = 1
                role = "MASTER"
                type = "MASTER"
            
            finalize_inventory(company_id=1, inventory_id=inv.id, db=db, current_user=MockUser())
        except HTTPException as e:
            if e.status_code == 422:
                finalization_blocked = True
                print(f"SUCCESS: Finalization correctly blocked with status 422! Message: {e.detail}")
            else:
                print(f"ERROR: Finalization failed with unexpected status code {e.status_code}: {e.detail}")
        
        assert finalization_blocked, "Finalization SHOULD have been blocked due to pending 3rd count!"
        
        # 7. Add Round 3 tie-breaker count (C3 = 11)
        s3 = InventorySession(
            inventory_id=inv.id,
            company_id=1,
            location="PRATELEIRA-01",
            session_type="RECONTAGEM_AUDITORIA",
            round_number=3,
            status=SessionStatus.CONCLUIDA.value,
            operator_name="Auditor Desempate"
        )
        db.add(s3)
        db.commit()
        db.refresh(s3)
        
        scan3 = InventoryScan(
            session_id=s3.id,
            inventory_id=inv.id,
            company_id=1,
            isbn="9788535902777",
            location="PRATELEIRA-01",
            quantity=11,
            client_uuid=f"uuid-r3-{inv.id}",
            scanned_at=datetime.now()
        )
        db.add(scan3)
        db.commit()
        print("Created Round 3 Session (C3 = 11)")
        
        # 8. Check discrepancies calculation
        discrepancies = get_discrepancies(company_id=1, inventory_id=inv.id, db=db, current_user=MockUser())
        disc_item = discrepancies[0]
        print(f"Discrepancy Calculation: C1={disc_item.count_1_qty}, C2={disc_item.count_2_qty}, C3={disc_item.count_3_qty}, Validated={disc_item.validated_qty}")
        assert disc_item.count_3_qty == 11, f"Expected count_3_qty=11, got {disc_item.count_3_qty}"
        assert disc_item.validated_qty == 11, f"Expected validated_qty=11 (from C3), got {disc_item.validated_qty}"
        
        # 9. Finalize inventory now that Round 3 is completed
        res = finalize_inventory(company_id=1, inventory_id=inv.id, db=db, current_user=MockUser())
        print(f"Finalization status: {res.status}")
        assert res.status == InventoryStatus.FINALIZADO.value, "Inventory should be FINALIZADO!"
        print("--- ALL VERIFICATIONS PASSED SUCCESSFULLY! ---")
        
    finally:
        db.close()

if __name__ == "__main__":
    run_test()

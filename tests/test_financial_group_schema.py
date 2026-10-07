import datetime
import sys
sys.path.append('backend')
from app.schemas.financial import FinancialInstallmentsGroupRequest

def test_financial_installments_group_request_compatibility():
    payload_front = {
        "installment_ids": [883, 434],
        "new_due_date": "2026-10-12",
        "combined_notes": "Agrupamento consolidado",
        "new_account_id": 5,
        "new_category_id": 10
    }
    req1 = FinancialInstallmentsGroupRequest(**payload_front)
    assert req1.installment_ids == [883, 434]
    assert req1.new_due_date == datetime.date(2026, 10, 12)
    assert req1.combined_notes == "Agrupamento consolidado"
    assert req1.new_account_id == 5
    assert req1.new_category_id == 10

    payload_canonical = {
        "installment_ids": [883, 434],
        "due_date": "2026-10-12",
        "description": "Agrupamento consolidado",
        "account_id": 5,
        "category_id": 10
    }
    req2 = FinancialInstallmentsGroupRequest(**payload_canonical)
    assert req2.installment_ids == [883, 434]
    assert req2.due_date == datetime.date(2026, 10, 12)
    assert req2.description == "Agrupamento consolidado"
    assert req2.account_id == 5
    assert req2.category_id == 10

    print('ALL TESTS PASSED: FinancialInstallmentsGroupRequest compatibility verified!')

if __name__ == '__main__':
    test_financial_installments_group_request_compatibility()

import sys
sys.path.append("backend")

from app.api.bookinfo_hub import (
    advance_bookinfo_order_auto,
    _auto_analyse_items,
    _auto_submit_bookinfo_evaluation,
    _auto_confront_and_submit_post_conference,
    _auto_sync_nfe_and_complete
)
import inspect

def test_auto_step_signatures():
    # 1. Valida que advance_bookinfo_order_auto existe e tem os parâmetros corretos
    sig = inspect.signature(advance_bookinfo_order_auto)
    params = list(sig.parameters.keys())
    assert "order_id" in params
    assert "db" in params
    assert "current_user" in params

    # 2. Valida que as funções modulares existem e são corrotinas assíncronas
    assert inspect.iscoroutinefunction(advance_bookinfo_order_auto)
    assert inspect.iscoroutinefunction(_auto_analyse_items)
    assert inspect.iscoroutinefunction(_auto_submit_bookinfo_evaluation)
    assert inspect.iscoroutinefunction(_auto_confront_and_submit_post_conference)
    assert inspect.iscoroutinefunction(_auto_sync_nfe_and_complete)

    print("ALL TESTS PASSED: advance_bookinfo_order_auto and modular subroutines verified successfully!")

if __name__ == "__main__":
    test_auto_step_signatures()

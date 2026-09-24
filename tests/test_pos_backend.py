import sys
import os

# Add backend directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

def test_pos_imports():
    print("Testando imports do módulo POS...")
    from app.models.pos import POSSession, POSSale, POSSaleItem, POSSessionStatus, POSCatalogSource, POSPaymentMethod
    print("✅ Modelos carregados com sucesso!")

    from app.schemas.pos import POSSessionCreate, POSSaleCreate, POSSyncBatchRequest, POSSyncBatchResponse
    print("✅ Schemas Pydantic carregados com sucesso!")

    from app.api.pos import router, _assert_pos_access, get_pos_config
    print(f"✅ Router carregado com {len(router.routes)} rotas!")

    from unittest.mock import MagicMock
    from fastapi import HTTPException

    # Teste 1: MASTER tem acesso mesmo com module_pdv = False
    master_user = MagicMock(type="MASTER", role="MASTER", company_id=1)
    company = MagicMock(id=1, module_pdv=False)
    db = MagicMock()
    db.query().filter().first.return_value = company
    res = _assert_pos_access(master_user, 1, db)
    assert res == company
    print("✅ Teste 1: MASTER liberado mesmo com module_pdv desativado")

    # Teste 2: Seller sem module_pdv deve receber HTTP 403
    seller_user = MagicMock(type="SELLER", role="SELLER", company_id=2)
    company_no_pdv = MagicMock(id=2, module_pdv=False)
    db.query().filter().first.return_value = company_no_pdv
    try:
        _assert_pos_access(seller_user, 2, db)
        assert False, "Deveria ter lançado HTTPException 403"
    except HTTPException as exc:
        assert exc.status_code == 403
        print("✅ Teste 2: Seller sem module_pdv bloqueado com 403")

    # Teste 3: Seller com module_pdv = True deve ter acesso
    company_with_pdv = MagicMock(id=3, module_pdv=True)
    db.query().filter().first.return_value = company_with_pdv
    seller_user3 = MagicMock(type="SELLER", role="SELLER", company_id=3)
    res = _assert_pos_access(seller_user3, 3, db)
    assert res == company_with_pdv
    print("✅ Teste 3: Seller com module_pdv ativo liberado")

    # Teste 4: Configuração de validação de saldo
    seller_user_co1 = MagicMock(type="SELLER", role="SELLER", company_id=1)
    company_co1 = MagicMock(id=1, module_pdv=True)
    settings = MagicMock(company_id=1, pdv_allow_out_of_stock=False)
    db.query().filter().first.side_effect = [company_co1, settings]
    cfg = get_pos_config(company_id=1, db=db, current_user=seller_user_co1)
    assert cfg["validate_stock"] is True
    print("✅ Teste 4: Trava de estoque ativada quando pdv_allow_out_of_stock=False")

    settings.pdv_allow_out_of_stock = True
    db.query().filter().first.side_effect = [company_co1, settings]
    cfg2 = get_pos_config(company_id=1, db=db, current_user=seller_user_co1)
    assert cfg2["validate_stock"] is False
    print("✅ Teste 5: Venda sem estoque liberada quando pdv_allow_out_of_stock=True")

    print("\n🎉 TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!")

if __name__ == "__main__":
    test_pos_imports()

import sys
import os

# Add backend directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

def test_pos_imports():
    print("Testando imports do módulo POS...")
    import importlib
    import pkgutil
    import app.models
    for _, modname, _ in pkgutil.walk_packages(app.models.__path__, app.models.__name__ + "."):
        try:
            importlib.import_module(modname)
        except Exception:
            pass

    from app.models.pos import POSSession, POSSessionProduct, POSSale, POSSaleItem, POSSessionStatus, POSCatalogSource, POSPaymentMethod
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

    # Teste 6: Normalização de Barcodes (_clean_barcode)
    from app.api.pos import _clean_barcode
    assert _clean_barcode("9788576570000") == "9788576570000"
    assert _clean_barcode("9788576570000.0") == "9788576570000"
    assert _clean_barcode(" 9788576570000 ") == "9788576570000"
    assert _clean_barcode(9788576570000.0) == "9788576570000"
    print("✅ Teste 6: Normalização de barcodes de planilha e Excel validada")

    # Teste 7: Regra de Deduplicação e Preço Zerado na Carga de Catálogo Cronuz
    import asyncio
    from app.api.pos import load_pos_catalog
    from app.models.product import Product

    prod_valid1 = MagicMock(spec=Product, id=1, ean_gtin="9780001", sku="SKU1", name="Livro 1", brand="Editora A", base_price=45.0, promotional_price=None, stock_quantity=10, status="ACTIVE")
    prod_dup = MagicMock(spec=Product, id=2, ean_gtin="9780001", sku="SKU1-DUP", name="Livro 1 Duplicado", brand="Editora A", base_price=45.0, promotional_price=None, stock_quantity=5, status="ACTIVE")
    prod_zero_price = MagicMock(spec=Product, id=3, ean_gtin="9780002", sku="SKU2", name="Livro Grátis", brand="Editora B", base_price=0.0, promotional_price=None, stock_quantity=20, status="ACTIVE")
    prod_valid2 = MagicMock(spec=Product, id=4, ean_gtin="9780003", sku="SKU3", name="Livro 3", brand="Editora C", base_price=60.0, promotional_price=None, stock_quantity=15, status="ACTIVE")

    db_catalog = MagicMock()
    company_cat = MagicMock(id=1, module_pdv=True)
    db_catalog.query().filter().first.return_value = company_cat
    db_catalog.query().filter().order_by().limit().all.return_value = [prod_valid1, prod_dup, prod_zero_price, prod_valid2]

    catalog_res = asyncio.run(load_pos_catalog(
        company_id=1,
        source="CRONUZ_CATALOG",
        db=db_catalog,
        current_user=seller_user_co1
    ))

    assert catalog_res["count"] == 2, f"Esperado 2 itens válidos, obteve {catalog_res['count']}"
    assert catalog_res["duplicate_count"] == 1, f"Esperado 1 duplicado, obteve {catalog_res['duplicate_count']}"
    assert catalog_res["zero_price_count"] == 1, f"Esperado 1 com preço zero, obteve {catalog_res['zero_price_count']}"
    assert [it["barcode"] for it in catalog_res["items"]] == ["9780001", "9780003"]
    print("✅ Teste 7: Deduplicação e bloqueio de preço zerado no Catálogo validados")

    # Teste 8: Validação na Importação de Planilha via Mock
    from app.api.pos import upload_pos_spreadsheet
    from fastapi import UploadFile
    import io

    # CSV com 1 item válido, 1 repetido (duplicado) e 1 com preço zero
    csv_content = (
        "ISBN;TITULO;PRECO;ESTOQUE\n"
        "978857657001;Livro A;50.00;10\n"
        "978857657001;Livro A Repetido;50.00;5\n"
        "978857657002;Livro B Preço Zero;0.00;15\n"
        "978857657003;Livro C;35.50;8\n"
    ).encode("utf-8")

    upload_file = UploadFile(filename="teste_produtos.csv", file=io.BytesIO(csv_content))

    sheet_res = asyncio.run(upload_pos_spreadsheet(
        company_id=1,
        file=upload_file,
        db=db_catalog,
        current_user=seller_user_co1
    ))

    assert sheet_res["count"] == 2, f"Esperado 2 itens válidos na planilha, obteve {sheet_res['count']}"
    assert sheet_res["duplicate_count"] == 1, f"Esperado 1 duplicado na planilha, obteve {sheet_res['duplicate_count']}"
    assert sheet_res["zero_price_count"] == 1, f"Esperado 1 preço zero na planilha, obteve {sheet_res['zero_price_count']}"
    assert [it["barcode"] for it in sheet_res["items"]] == ["978857657001", "978857657003"]
    print("✅ Teste 8: Deduplicação e bloqueio de preço zerado na Planilha Excel/CSV validados")

    # Teste 9: Consulta de Produtos Atrelados à Sessão (para sincronização Mobile)
    from app.api.pos import get_session_products
    mock_session = MagicMock(id=10, company_id=1, catalog_source="SPREADSHEET")
    mock_sp1 = MagicMock(id=1, session_id=10, barcode="9780001", sku="SKU1", title="Livro A", publisher="Ed 1", price=25.0, stock=50, horus_item_code=None, product_id=None, source="SPREADSHEET")
    mock_sp2 = MagicMock(id=2, session_id=10, barcode="9780002", sku="SKU2", title="Livro B", publisher="Ed 2", price=40.0, stock=30, horus_item_code=None, product_id=None, source="SPREADSHEET")

    db_sess = MagicMock()
    company_sess = MagicMock(id=1, module_pdv=True)
    db_sess.query().filter().first.side_effect = [company_sess, mock_session]
    db_sess.query().filter().order_by().all.return_value = [mock_sp1, mock_sp2]

    sess_prod_res = get_session_products(
        company_id=1,
        session_id=10,
        db=db_sess,
        current_user=seller_user_co1
    )

    assert sess_prod_res["session_id"] == 10
    assert sess_prod_res["count"] == 2
    assert sess_prod_res["catalog_source"] == "SPREADSHEET"
    assert [it["barcode"] for it in sess_prod_res["items"]] == ["9780001", "9780002"]
    print("✅ Teste 9: Endpoint get_session_products para carga automática no Mobile validado")

    print("\n🎉 TODOS OS 9 TESTES PASSARAM COM 100% DE SUCESSO!")

if __name__ == "__main__":
    test_pos_imports()

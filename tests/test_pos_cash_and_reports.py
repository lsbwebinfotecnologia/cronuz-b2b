import sys
import os
from datetime import datetime
from unittest.mock import MagicMock

# Add backend directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

def test_cash_control_and_reports():
    print("Iniciando testes de Controle de Caixa e Relatórios (Excel/PDF)...")

    # 1. Imports
    import importlib
    import pkgutil
    import app.models
    for _, modname, _ in pkgutil.walk_packages(app.models.__path__, app.models.__name__ + "."):
        try:
            importlib.import_module(modname)
        except Exception:
            pass

    from app.models.pos import POSSession, POSSale, POSSaleItem, POSSessionStatus
    from app.schemas.pos import POSSessionCreate, POSSessionCloseRequest
    from app.api.pos import (
        create_pos_session,
        get_session_close_summary,
        close_pos_session,
        get_pos_sales_report,
    )
    print("✅ Modelos e endpoints importados!")

    # 2. Testar POSSessionCreate com validate_stock e initial_cash_amount
    payload = POSSessionCreate(
        title="Caixa 01 - Matriz",
        catalog_source="SPREADSHEET",
        validate_stock=True,
        initial_cash_amount=150.00
    )
    assert payload.validate_stock is True
    assert payload.initial_cash_amount == 150.00
    print("✅ POSSessionCreate aceita validate_stock e initial_cash_amount")

    # 3. Testar POSSessionCloseRequest
    close_req = POSSessionCloseRequest(
        closed_cash_amount=230.50,
        closing_notes="Fechamento turno manhã sem divergência"
    )
    assert close_req.closed_cash_amount == 230.50
    assert "manhã" in close_req.closing_notes
    print("✅ POSSessionCloseRequest validado!")

    # 4. Mock do DB e sessão para testar get_session_close_summary
    db = MagicMock()
    mock_company = MagicMock(id=1, name="Livraria Central Ltda", module_pdv=True)
    mock_user = MagicMock(id=10, type="SELLER", role="SELLER", company_id=1)

    mock_session = POSSession(
        id=42,
        company_id=1,
        user_id=10,
        code="CX-001",
        title="Caixa Principal",
        status=POSSessionStatus.OPEN.value,
        validate_stock=True,
        initial_cash_amount=100.00,
        opened_at=datetime(2026, 10, 3, 8, 0, 0)
    )

    # Simular vendas: Dinheiro R$ 80,00, PIX R$ 150,00
    mock_sales = [
        MagicMock(id=1, payment_method="DINHEIRO", total_amount=50.00, items_count=2),
        MagicMock(id=2, payment_method="DINHEIRO", total_amount=30.00, items_count=1),
        MagicMock(id=3, payment_method="PIX", total_amount=150.00, items_count=3),
    ]

    # Query mockada inteligente
    from app.models.company import Company
    def mock_query(model, *args, **kwargs):
        q = MagicMock()
        if model is Company:
            q.filter.return_value.first.return_value = mock_company
        elif model is POSSession:
            q.filter.return_value.first.return_value = mock_session
        elif model is POSSale:
            q.filter.return_value.all.return_value = mock_sales
            q.filter.return_value.filter.return_value.all.return_value = mock_sales
        else:
            q.filter.return_value.scalar.return_value = 80.0
            q.filter.return_value.count.return_value = 3
        return q
    db.query.side_effect = mock_query

    summary = get_session_close_summary(
        company_id=1,
        session_id=42,
        db=db,
        current_user=mock_user
    )

    assert summary["session_id"] == 42
    assert summary["initial_cash_amount"] == 100.00
    assert summary["sales_count"] == 3
    assert summary["cash_sales_amount"] == 80.00
    assert summary["expected_cash_amount"] == 180.00  # 100 inicial + 80 vendas
    print(f"✅ Close Summary calculou perfeitamente: Fundo {summary['initial_cash_amount']} + Vendas Dinheiro {summary['cash_sales_amount']} = Esperado {summary['expected_cash_amount']}")

    # 5. Testar close_pos_session com apuração de sobra/falta
    close_payload = POSSessionCloseRequest(closed_cash_amount=185.00, closing_notes="Sobra de R$ 5,00")
    closed_result = close_pos_session(
        company_id=1,
        session_id=42,
        payload=close_payload,
        db=db,
        current_user=mock_user
    )
    assert closed_result.status == POSSessionStatus.CLOSED.value
    assert closed_result.closed_cash_amount == 185.00
    assert closed_result.expected_cash_amount == 180.00
    assert closed_result.cash_difference == 5.00
    print(f"✅ Fechamento de caixa validado com sobra de caixa: {closed_result.cash_difference}")

    # 6. Testar Relatórios nos 3 formatos (JSON, Excel, PDF)
    mock_sale_1 = MagicMock(
        id=101,
        sale_number="VD-00101",
        sold_at=datetime(2026, 10, 3, 9, 30, 0),
        session_id=42,
        payment_method="DINHEIRO",
        customer_name="João Silva",
        customer_document="123.456.789-00",
        status="COMPLETED"
    )
    mock_item_1 = MagicMock(
        id=1,
        sale_id=101,
        barcode="9788535902778",
        sku="LIV-001",
        title="Dom Casmurro",
        publisher="Companhia das Letras",
        quantity=2.0,
        unit_price=45.00,
        total_price=90.00
    )

    mock_sale_2 = MagicMock(
        id=102,
        sale_number="VD-00102",
        sold_at=datetime(2026, 10, 3, 10, 15, 0),
        session_id=42,
        payment_method="PIX",
        customer_name="Maria Santos",
        customer_document="987.654.321-99",
        status="COMPLETED"
    )
    mock_item_2 = MagicMock(
        id=2,
        sale_id=102,
        barcode="9788576572008",
        sku="LIV-002",
        title="Duna",
        publisher="Aleph",
        quantity=1.0,
        unit_price=80.00,
        total_price=80.00
    )

    db_rows = [
        (mock_item_1, mock_sale_1, mock_session),
        (mock_item_2, mock_sale_2, mock_session),
    ]

    report_query_mock = MagicMock()
    report_query_mock.join.return_value = report_query_mock
    report_query_mock.outerjoin.return_value = report_query_mock
    report_query_mock.filter.return_value = report_query_mock
    report_query_mock.order_by.return_value = report_query_mock
    report_query_mock.all.return_value = db_rows
    report_query_mock.first.return_value = mock_company
    db.query.side_effect = None
    db.query.return_value = report_query_mock

    # Teste 6.1: JSON
    json_report = get_pos_sales_report(
        company_id=1,
        session_id=42,
        format="json",
        db=db,
        current_user=mock_user
    )
    assert json_report["kpis"]["total_sales"] == 2
    assert json_report["kpis"]["total_items"] == 3.0
    assert json_report["kpis"]["total_amount"] == 170.00
    assert len(json_report["rows"]) == 2
    assert json_report["rows"][0]["barcode"] == "9788535902778"
    print("✅ Relatório JSON gerado com sucesso!")

    # Teste 6.2: Excel
    excel_resp = get_pos_sales_report(
        company_id=1,
        session_id=42,
        format="excel",
        db=db,
        current_user=mock_user
    )
    assert len(excel_resp.body) > 1000
    print(f"✅ Relatório Excel gerado com sucesso! ({len(excel_resp.body)} bytes)")

    # Teste 6.3: PDF
    pdf_resp = get_pos_sales_report(
        company_id=1,
        session_id=42,
        format="pdf",
        db=db,
        current_user=mock_user
    )
    assert len(pdf_resp.body) > 1000
    print(f"✅ Relatório PDF gerado com sucesso! ({len(pdf_resp.body)} bytes)")

    print("\n🎉 TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!")

if __name__ == "__main__":
    test_cash_control_and_reports()

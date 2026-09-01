"""
tests/test_vindi_financial.py
-----------------------------
Validação automatizada do parser e endpoints do módulo Horus Direct Vindi.
"""
import sys
import os

# Adiciona o path do backend
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../backend")))

from app.integrators.vindi_financial_parser import parse_vindi_file, _parse_currency

def test_currency_parser():
    assert _parse_currency("1234.56") == 1234.56
    assert _parse_currency("1.234,56") == 1234.56
    assert _parse_currency("R$ 1.234,56") == 1234.56
    assert _parse_currency("R$ 250,00") == 250.00
    assert _parse_currency(100.5) == 100.5
    print("✅ test_currency_parser passou!")

def test_csv_parser_semicolon():
    csv_data = (
        "Pedido;Cliente;Documento;Valor;Data Pagamento;Status;Forma Pagamento\n"
        "1001;Livraria Central;12.345.678/0001-90;250,00;01/09/2026;Paga;Cartao de Credito\n"
        "1002;Distribuidora ABC;98.765.432/0001-10;1.480,50;01/09/2026;Paga;Boleto\n"
    ).encode("utf-8")

    rows, warnings = parse_vindi_file(csv_data, "extrato_vindi.csv")
    assert len(rows) == 2, f"Esperado 2 linhas, obtido {len(rows)}"
    assert rows[0]["pedido_web"] == "1001"
    assert rows[0]["valor"] == 250.0
    assert rows[0]["cliente_nome"] == "Livraria Central"
    assert rows[1]["pedido_web"] == "1002"
    assert rows[1]["valor"] == 1480.50
    print("✅ test_csv_parser_semicolon passou!")

def test_csv_parser_comma():
    csv_data = (
        "code,customer,document,amount,paid_at,status\n"
        "WEB-500,Livraria Moderna,111.222.333-44,89.90,2026-09-01,paid\n"
    ).encode("utf-8")

    rows, warnings = parse_vindi_file(csv_data, "vindi_export.csv")
    assert len(rows) == 1
    assert rows[0]["pedido_web"] == "WEB-500"
    assert rows[0]["valor"] == 89.90
    print("✅ test_csv_parser_comma passou!")

if __name__ == "__main__":
    print("Iniciando testes de conciliação financeira...")
    test_currency_parser()
    test_csv_parser_semicolon()
    test_csv_parser_comma()
    print("🎉 Todos os testes de validação passaram com 100% de sucesso!")

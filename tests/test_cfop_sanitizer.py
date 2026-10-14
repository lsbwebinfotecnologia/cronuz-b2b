import sys
import os

# Adiciona o backend ao path para rodar o teste
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from app.core.cfop_utils import sanitize_cfop, parse_cfop_list, classify_cfop_movement


def test_sanitize_cfop():
    assert sanitize_cfop("5.102") == "5102"
    assert sanitize_cfop("5,102") == "5102"
    assert sanitize_cfop(" 6.102 ") == "6102"
    assert sanitize_cfop(5102) == "5102"
    assert sanitize_cfop("5-102") == "5102"
    assert sanitize_cfop(None) == ""
    assert sanitize_cfop("") == ""
    print("✅ test_sanitize_cfop passou com sucesso!")


def test_parse_cfop_list():
    raw = "5.101, 5,102; 6101 6.102"
    parsed = parse_cfop_list(raw)
    assert parsed == {"5101", "5102", "6101", "6102"}
    assert parse_cfop_list(None) == set()
    print("✅ test_parse_cfop_list passou com sucesso!")


def test_classify_cfop_movement():
    # Vendas normais
    assert classify_cfop_movement("5.102") == "SALE"
    assert classify_cfop_movement("6,102") == "SALE"
    assert classify_cfop_movement("5114") == "SALE"

    # Consignação
    assert classify_cfop_movement("5.917") == "CONSIGNMENT_SHIPMENT"
    assert classify_cfop_movement("6917") == "CONSIGNMENT_SHIPMENT"

    # Devolução
    assert classify_cfop_movement("1.202") == "SALE_RETURN"
    assert classify_cfop_movement("1.918") == "CONSIGNMENT_RETURN"

    # Outras saídas (doação, bonificação, simples remessa)
    assert classify_cfop_movement("5.910") == "OTHER"
    assert classify_cfop_movement("5.949") == "OTHER"
    assert classify_cfop_movement("5.927") == "OTHER"

    # Configuração customizada pelo seller
    custom_sales = "5102, 5999"
    assert classify_cfop_movement("5.999", sales_cfops=custom_sales) == "SALE"

    print("✅ test_classify_cfop_movement passou com sucesso!")


if __name__ == "__main__":
    test_sanitize_cfop()
    test_parse_cfop_list()
    test_classify_cfop_movement()
    print("\n🎉 TODOS OS TESTES DE CFOP PASSARAM COM SUCESSO!")

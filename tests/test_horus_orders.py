"""
test_horus_orders.py
--------------------
Testes automatizados para a funcionalidade de Pedidos do Horus Direct.
"""
import sys
import os

# Adiciona backend ao path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

def test_orders_router_import():
    from app.api.horus_orders import router
    assert router is not None
    print("✅ Router horus_orders importado com sucesso.")

def test_company_settings_columns():
    from app.models.company_settings import CompanySettings
    assert hasattr(CompanySettings, "horus_sql_feature_pedidos")
    assert hasattr(CompanySettings, "horus_vendas_metodo")
    print("✅ Colunas horus_sql_feature_pedidos e horus_vendas_metodo validadas no modelo.")

if __name__ == "__main__":
    test_orders_router_import()
    test_company_settings_columns()
    print("🎉 Todos os testes de Pedidos Horus Direct passaram!")

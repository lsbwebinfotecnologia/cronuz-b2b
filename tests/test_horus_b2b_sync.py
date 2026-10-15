import asyncio
import os
import sys

# Add backend to PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

import main
from app.db.session import SessionLocal
from app.integrators.horus_orders import HorusOrders

async def run_test():
    db = SessionLocal()
    try:
        # Test Compor (company_id 3)
        print("Initializing HorusOrders for Compor (company_id=3)...")
        horus = HorusOrders(db, 3)
        # Use active Horus host
        horus._client.base_url = "http://grupole.opendata.center:8060/Horus/api/TServerB2B/"

        # Call get_order for order origin '2849' with customer doc '09586600000158'
        print("\n--- TEST: get_order B2B query ---")
        order_data = await horus.get_order(
            id_doc="09586600000158",
            id_guid="D67FD37F-A2BB-46E9-B47C-85C55698D867",
            cnpj_destino="97468250000192",
            cod_pedido_origem="2849",
            cod_ped_venda="28326"
        )

        print("get_order result type:", type(order_data))
        if order_data and isinstance(order_data, dict):
            print("COD_PED_VENDA:", order_data.get("COD_PED_VENDA"))
            print("NOM_CLI:", order_data.get("NOM_CLI"))
            print("STATUS_PEDIDO_VENDA:", order_data.get("STATUS_PEDIDO_VENDA"))
            print("NOTA_FISCAL present?:", bool(order_data.get("NOTA_FISCAL")))
            if order_data.get("NOTA_FISCAL"):
                nf = order_data["NOTA_FISCAL"]
                print("NRO_NOTA_FISCAL:", nf.get("NRO_NOTA_FISCAL"))
                print("CHAVE_ACESSO_NFE:", nf.get("CHAVE_ACESSO_NFE"))
                print("XML present?:", bool(nf.get("XML_Base64")))
        else:
            print("ERROR: order_data is False or empty:", order_data)

        # Also test without passing cod_ped_venda (simulating first search by origin)
        print("\n--- TEST: get_order B2B query by origin only ---")
        order_data_by_origin = await horus.get_order(
            id_doc="09586600000158",
            id_guid="D67FD37F-A2BB-46E9-B47C-85C55698D867",
            cnpj_destino="97468250000192",
            cod_pedido_origem="2849"
        )
        if order_data_by_origin and isinstance(order_data_by_origin, dict):
            print("COD_PED_VENDA by origin:", order_data_by_origin.get("COD_PED_VENDA"))
            print("NOM_CLI:", order_data_by_origin.get("NOM_CLI"))
            print("STATUS_PEDIDO_VENDA:", order_data_by_origin.get("STATUS_PEDIDO_VENDA"))
            print("NOTA_FISCAL present?:", bool(order_data_by_origin.get("NOTA_FISCAL")))
        else:
            print("ERROR: order_data_by_origin is False or empty:", order_data_by_origin)

        await horus.close()
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(run_test())

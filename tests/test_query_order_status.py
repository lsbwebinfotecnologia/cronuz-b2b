from main import app
import asyncio
from app.db.session import SessionLocal
from app.integrators.horus_orders import HorusOrders

async def main():
    db = SessionLocal()
    try:
        client = HorusOrders(db, 4)
        
        # 1. Consulta pedido 19893 via busca B2B
        print("--- Consultando Pedido 19893 ---")
        res = await client.get_order(
            id_doc="01404158000190",
            id_guid="E0B4A512-8772-41B1-AB8A-5B2585C388BA",
            cnpj_destino="10401967000210",
            cod_pedido_origem="BV-Outubro"
        )
        print("Resultado do pedido:", res)
        
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(main())

import asyncio
import os
import sys

sys.path.append(os.path.abspath(os.path.dirname(__file__) + '/backend'))

from backend.app.db.session import SessionLocal
from backend.app.integrators.horus_orders import HorusOrders

async def main():
    db = SessionLocal()
    from backend.app.models.order import Order
    order = db.query(Order).filter(Order.horus_pedido_venda.isnot(None), Order.status != 'CANCELLED').order_by(Order.id.desc()).first()
    if order:
        print(f"Buscando itens do pedido local {order.id} (Horus: {order.horus_pedido_venda})...")
        client = HorusOrders(db, order.company_id)
        res = await client.get_order_items(order.horus_pedido_venda)
        print("\n\nRESPOSTA RAW DO HORUS:\n")
        print(res)
    else:
        print("Nenhum pedido...")
    db.close()

if __name__ == '__main__':
    asyncio.run(main())

import asyncio
from app.db.session import SessionLocal
from app.models.order import Order
from app.integrators.horus_clients import HorusClients

async def test():
    db = SessionLocal()
    order = db.query(Order).filter(Order.id == 60).first()
    print("Order status:", order.status)
    horus_client = HorusClients(db, order.company_id)
    res = await horus_client.get_order_items(order.horus_pedido_venda)
    print("Horus Items:", res)
    await horus_client.close()

asyncio.run(test())

import asyncio
from app.db.session import SessionLocal
from app.models.company import Company
from app.models.customer import Customer
from app.models.product import Product
from app.models.order import Order
from app.models.user import User
from app.integrators.horus_orders import HorusOrders

async def run():
    db = SessionLocal()
    o = db.query(Order).filter(Order.id == 1048).first()
    if not o:
        print("Not found")
        return
    client = HorusOrders(db, o.company_id)
    items = await client.get_order_items(o.horus_pedido_venda)
    print("HORUS RAW:")
    for it in items:
        print(it.get('COD_ITEM'), "VLR_LIQUIDO raw:", it.get('VLR_LIQUIDO'))
    await client.close()

asyncio.run(run())

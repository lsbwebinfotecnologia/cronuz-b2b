import sys
from app.db.session import SessionLocal
from app.integrators.horus_orders import HorusOrders
import asyncio

async def test():
    db = SessionLocal()
    # Company 1
    horus_client = HorusOrders(db, 1)
    
    # Needs a real cod_ped_venda
    # We can check the DB for one
    from app.models.order import Order
    order = db.query(Order).filter(Order.horus_pedido_venda.isnot(None)).order_by(Order.id.desc()).first()
    
    if order:
        print(f"Testing order {order.horus_pedido_venda}")
        res = await horus_client.get_order_items(order.horus_pedido_venda)
        print(res)
    else:
        print("No order with horus_pedido_venda found")
        
    await horus_client.close()
    
if __name__ == "__main__":
    asyncio.run(test())

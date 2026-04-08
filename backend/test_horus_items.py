import asyncio
from app.db.session import SessionLocal
from app.models.order import Order
from app.integrators.horus_clients import HorusClients
# Need to import anything else? The previous one had a KeyError User because app.models.customer Interaction needed User.
from app.models.user import User

async def test():
    db = SessionLocal()
    order = db.query(Order).filter(Order.id == 60).first()
    if not order:
        print("Pedido não encontrado.")
        return
    
    print(f"Buscando itens para Horus Pedido: {order.horus_pedido_venda}")
    horus_client = HorusClients(db, order.company_id)
    try:
        items = await horus_client.get_order_items(order.horus_pedido_venda)
        print("RESPOSTA HORUS:")
        print(items)
    except AttributeError:
        # maybe get_order_items is in different client
        print("ERROR: get_order_items not found in HorusClients. Trying HorusOrders")
        # In horus.py or horus_orders.py
        from app.integrators.horus_orders import HorusOrders
        horus_client_orders = HorusOrders(db, order.company_id)
        items = await horus_client_orders.get_order_items(order.horus_pedido_venda)
        print("RESPOSTA HORUS_ORDERS:")
        print(items)
        await horus_client_orders.close()
    finally:
        await horus_client.close()

if __name__ == "__main__":
    asyncio.run(test())

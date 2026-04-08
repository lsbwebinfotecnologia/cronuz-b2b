import asyncio
from app.db.session import SessionLocal

# Import ALL mapping relationships to fix SQLAlchemy mapper errors
from app.models.company import Company
from app.models.customer import Customer
from app.models.product import Product
from app.models.category import Category
from app.models.brand import Brand
from app.models.order import Order
from app.models.user import User

from app.integrators.horus_clients import HorusClients
from app.integrators.horus_orders import HorusOrders

async def test():
    db = SessionLocal()
    order = db.query(Order).filter(Order.id == 60).first()
    if not order:
        print("Pedido não encontrado.")
        return
    
    print(f"Buscando itens para Horus Pedido: {order.horus_pedido_venda}")
    client = HorusOrders(db, order.company_id)
    try:
        items = await client.get_order_items(order.horus_pedido_venda)
        print("RESPOSTA HORUS_ORDERS:")
        print(items)
    except Exception as e:
        print("Error fetching", e)
    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(test())

import asyncio
from app.db.session import SessionLocal
from app.models.user import User
from app.models.company import Company
from app.models.catalog_support import Category, Brand, Characteristic
from app.models.product import Product
from app.models.customer import Customer
from app.models.order import Order, OrderItem
from app.models.order_log import OrderLog
from app.models.order_interaction import OrderInteraction
from app.api.storefront import search_storefront

async def run():
    db = SessionLocal()
    user = db.query(User).filter(User.type == "CUSTOMER").first()
    if user:
        print(f"Testing search with user {user.email}")
        res = await search_storefront(q="harry", skip=0, limit=20, db=db, current_user=user)
        print("Result Keys:", res.keys())
        if "items" in res:
            print(f"Items array has length {len(res['items'])}")
            if len(res['items']) > 0:
                print("First item preview:", res['items'][0])
    else:
        print("No customer found to test")
    db.close()

if __name__ == "__main__":
    asyncio.run(run())

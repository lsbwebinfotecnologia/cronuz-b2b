import asyncio
from app.db.session import SessionLocal
from app.models.user import User
from app.api.storefront import search_storefront

async def run():
    db = SessionLocal()
    user = db.query(User).filter(User.email == "customer@b2bcronuz.com.br").first()
    
    if user:
        print(f"Testing search with user {user.email}")
        try:
            res = await search_storefront(q="harry", skip=0, limit=20, db=db, current_user=user)
            print("Search success:")
            print(res)
        except Exception as e:
            print("Search failed:")
            print(repr(e))
    db.close()

if __name__ == "__main__":
    asyncio.run(run())

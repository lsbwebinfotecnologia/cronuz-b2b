import asyncio
import httpx
from app.db.session import SessionLocal
import app.models.company
from app.models.user import User
from app.core.security import create_access_token
import datetime

async def test_apis():
    db = SessionLocal()
    user = db.query(User).filter(User.email == "customer@b2bcronuz.com.br").first()
    
    if not user:
        print("User not found")
        return

    token = create_access_token(
        data={"sub": user.email, "id": user.id, "type": user.type, "roles": []},
        expires_delta=datetime.timedelta(days=1)
    )
    db.close()
    
    headers = {"Authorization": f"Bearer {token}"}
    
    async with httpx.AsyncClient() as client:
        print("--- GET /storefront/cart ---")
        res1 = await client.get("http://localhost:8000/storefront/cart", headers=headers)
        print(f"Status: {res1.status_code}")
        
        print("\n--- GET /storefront/search?q=harry ---")
        res2 = await client.get("http://localhost:8000/storefront/search?q=harry", headers=headers)
        print(f"Status: {res2.status_code}")

        print("\n--- GET /storefront/product/43515 (COD_ITEM) ---")
        res3 = await client.get("http://localhost:8000/storefront/product/43515", headers=headers)
        print(f"Status: {res3.status_code}")
        
        print("\n--- GET /storefront/product/9786555372182 (ISBN) ---")
        res4 = await client.get("http://localhost:8000/storefront/product/9786555372182", headers=headers)
        print(f"Status: {res4.status_code}")

if __name__ == "__main__":
    asyncio.run(test_apis())

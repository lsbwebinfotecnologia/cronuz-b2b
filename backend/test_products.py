import asyncio
from app.db.session import SessionLocal
from app.models.user import User
from app.models.customer import Customer
from app.core.security import create_access_token
import httpx

async def main():
    db = SessionLocal()
    livrosnaweb = db.query(User).filter(User.email.ilike("%livrosnaweb.com@gmail.com%")).first()
    
    if not livrosnaweb:
        print("User not found!")
        return
        
    print(f"LivrosNaWeb ID: {livrosnaweb.id}, Company ID: {livrosnaweb.company_id}")
    
    cust = db.query(Customer).filter(Customer.document == livrosnaweb.document, Customer.company_id == livrosnaweb.company_id).first()
    if cust:
        print(f"Customer Name: {cust.name}, ID_GUID: '{cust.id_guid}'")
    else:
        print("No Customer record!")
        
    token = create_access_token({"sub": livrosnaweb.email, "type": livrosnaweb.type, "company_id": livrosnaweb.company_id})
    
    async with httpx.AsyncClient() as client:
        # Check one of the launch ISBNs, e.g. 9788594681003 (A Malinha Vermelha from user screenshot)
        res = await client.get("http://localhost:8000/storefront/product/9788594681003", headers={"Authorization": f"Bearer {token}"})
        print("Product Status:", res.status_code)
        print("Product Body:", res.text[:200])

asyncio.run(main())

import sys
import os
import asyncio

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

import main
from app.db.session import SessionLocal
from app.models.user import User
from app.api.pos import realtime_search_horus

async def run_test():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.company_id == 4).first()
        res = await realtime_search_horus(
            company_id=4,
            term="ps",
            session_id=1,
            branch_id=2,
            search_option=None,
            limit=5,
            db=db,
            current_user=user,
        )
        print("Total items:", len(res.get("items", [])))
        for item in res.get("items", []):
            print(f"Item: {item['title']} | Preço: R$ {item['price']:.2f} | Saldo: {item['stock']} | Barcode: {item['barcode']}")
            assert item['price'] > 0, f"Preço veio zerado para o item: {item['title']}"
        print("✅ Todos os itens retornaram com preço preenchido com sucesso!")
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(run_test())

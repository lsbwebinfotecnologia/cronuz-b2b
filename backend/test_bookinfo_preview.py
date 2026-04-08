import asyncio
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.api.bookinfo_hub import preview_manual_sync_bookinfo_orders
from app.models.user import User

async def main():
    db = SessionLocal()
    master_user = db.query(User).filter(User.type == "MASTER").first()
    try:
        res = await preview_manual_sync_bookinfo_orders(
            company_id=4,
            status="AGUARDANDO",
            page=0,
            db=db,
            current_user=master_user
        )
        print("AGUARDANDO RESULT:", res)
    except Exception as e:
        print("AGUARDANDO ERROR:", e)
        
    try:
        res = await preview_manual_sync_bookinfo_orders(
            company_id=4,
            status="PROCESSADO",
            page=0,
            db=db,
            current_user=master_user
        )
        print("PROCESSADO RESULT:", res)
    except Exception as e:
        print("PROCESSADO ERROR:", e)

if __name__ == "__main__":
    asyncio.run(main())

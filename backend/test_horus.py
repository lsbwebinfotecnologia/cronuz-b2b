import asyncio
from app.db.session import SessionLocal
from app.models.user import User

async def main():
    db = SessionLocal()
    users = db.query(User).all()
    print("USERS:")
    for u in users:
        print(f"ID: {u.id} | Email: {u.email} | CompanyID: {u.company_id}")

if __name__ == "__main__":
    asyncio.run(main())

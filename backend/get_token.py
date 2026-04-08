import asyncio
from app.db.session import SessionLocal
from app.models.user import User
from app.core.security import create_access_token

db = SessionLocal()
u = db.query(User).filter(User.type == "MASTER").first()
token = create_access_token({"sub": u.email})
print(token)

import asyncio
from app.db.session import SessionLocal
import app.models.company
from app.models.user import User
from app.core.security import create_access_token
import datetime

db = SessionLocal()
user = db.query(User).filter(User.email == "customer@b2bcronuz.com.br").first()

if user:
    token = create_access_token(
        data={"sub": user.email, "id": user.id, "type": user.type, "roles": []},
        expires_delta=datetime.timedelta(days=1)
    )
    print(token)
db.close()

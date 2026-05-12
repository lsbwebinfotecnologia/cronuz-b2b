import sys
import os
sys.path.append('backend')
from fastapi.testclient import TestClient
from main import app
from app.db.session import SessionLocal
from app.models.user import User
from app.models.user_session import UserSession

client = TestClient(app)

db = SessionLocal()
user = db.query(User).filter(User.email == 'admin@cronuz.com.br').first()
if not user:
    user = db.query(User).first()

from app.core.security import create_access_token
from datetime import datetime, timedelta, timezone

jti = "test_test"
session = UserSession(
    user_id=user.id,
    role=user.type,
    jti=jti,
    ip_address="127.0.0.1",
    user_agent="test",
    expires_at=datetime.now(timezone.utc) + timedelta(minutes=60),
    is_active=True
)
db.add(session)
db.commit()

token = create_access_token(data={"sub": user.email, "type": user.type, "company_id": user.company_id, "jti": jti}, expires_delta=timedelta(minutes=60))

print("Testing with user:", user.email)
try:
    response = client.get("/financial/generic_installments?page=1&page_size=50", headers={"Authorization": f"Bearer {token}"})
    print("STATUS CODE:", response.status_code)
    print("RESPONSE TEXT TYPE:", type(response.text))
    if len(response.text) < 1000:
        print("RESPONSE:", response.text)
    else:
        print("RESPONSE SNIPPET:", response.text[:1000])
except Exception as e:
    import traceback
    traceback.print_exc()

db.delete(session)
db.commit()

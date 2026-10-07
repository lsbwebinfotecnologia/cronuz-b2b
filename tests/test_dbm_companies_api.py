import sys
import os
backend_path = os.path.join(os.path.dirname(__file__), '..', 'backend')
sys.path.insert(0, backend_path)

import requests
import main
from app.db.session import SessionLocal
from app.models.user import User
from app.core.security import create_access_token

import uuid
from datetime import datetime, timezone, timedelta
from app.models.user_session import UserSession

def test_dbm_api():
    db = SessionLocal()
    user = db.query(User).filter(User.type == "MASTER").first()
    if not user:
        user = db.query(User).first()
    
    if not user:
        print("No user found in local DB.")
        return

    print(f"Testing with user: {user.email} (Type: {user.type})")
    
    jti = str(uuid.uuid4())
    now_utc = datetime.now(timezone.utc)
    new_session = UserSession(
        user_id=user.id,
        role=user.type or "MASTER",
        jti=jti,
        ip_address="127.0.0.1",
        user_agent="pytest-test",
        login_at=now_utc,
        last_activity_at=now_utc,
        expires_at=now_utc + timedelta(hours=1),
        is_active=True
    )
    db.add(new_session)
    db.commit()

    token = create_access_token(
        data={"sub": user.email, "type": user.type, "tenant_id": user.tenant_id, "company_id": user.company_id, "jti": jti}
    )
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Test GET /dbm/companies
    url_list = "http://localhost:8000/dbm/companies?limit=5"
    res = requests.get(url_list, headers=headers)
    print(f"GET /dbm/companies -> Status: {res.status_code}")
    if res.status_code == 200:
        data = res.json()
        items = data.get("items", []) if isinstance(data, dict) else data
        print(f"Successfully retrieved companies. Total count: {data.get('total') if isinstance(data, dict) else len(items)}, items in page: {len(items)}")
        if len(items) > 0:
            print("First company sample:", items[0].get("name"), "CNPJ:", items[0].get("document"), "ID:", items[0].get("id"))
    else:
        print("Error body:", res.text)

    # 2. Test GET /dbm/companies/horus-lookup with the document from screenshot
    url_horus = "http://localhost:8000/dbm/companies/horus-lookup?document=10401967000210"
    res_horus = requests.get(url_horus, headers=headers)
    print(f"GET /dbm/companies/horus-lookup -> Status: {res_horus.status_code}")
    print(f"Horus lookup response: {res_horus.text}")

if __name__ == "__main__":
    test_dbm_api()

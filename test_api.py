import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))
import requests
import main

from app.db.session import SessionLocal
from app.models.user import User
from app.core.security import create_access_token

def run():
    db = SessionLocal()
    # Find master user
    user = db.query(User).filter(User.type == "MASTER").first()
    if not user:
        user = db.query(User).first()
        
    print("User found:", user.email, user.type)
    
    token = create_access_token(
        data={"sub": user.email, "type": user.type, "tenant_id": user.tenant_id, "company_id": user.company_id}
    )
    print("Token created.")
    
    headers = {"Authorization": f"Bearer {token}"}
    url = "http://localhost:8000/bookinfo/orders/2522d3d7-2774-4dfe-af22-bd008bdaa08d"
    
    res = requests.get(url, headers=headers)
    print("Status:", res.status_code)
    print("Response:", res.text[:500])

if __name__ == "__main__":
    run()

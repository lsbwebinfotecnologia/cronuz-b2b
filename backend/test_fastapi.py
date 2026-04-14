import sys
import os
sys.path.append(os.path.abspath(os.path.dirname(__file__)))
from fastapi.testclient import TestClient
from main import app
from app.core.dependencies import get_current_user

def fake_get_current_user():
    from app.models.user import User
    return User(id=1, company_id=8)

app.dependency_overrides[get_current_user] = fake_get_current_user

client = TestClient(app)
res = client.get("/service-orders/21/pdf")
print("STATUS CODE:", res.status_code)
if res.status_code >= 400:
    print("ERROR:", res.text)
else:
    print("SUCCESS: ", len(res.content))

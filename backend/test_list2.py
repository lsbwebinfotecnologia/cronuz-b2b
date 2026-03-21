import sys
import os

sys.path.append(os.getcwd())

import main
from app.db.session import SessionLocal
from app.api.subscriptions import list_subscribers
from app.models.user import User, UserRole

db = SessionLocal()
mock_user = User(id=1, email="seller@mythos.com", type=UserRole.SELLER, company_id=3)

try:
    res = list_subscribers(skip=0, limit=10, db=db, current_user=mock_user)
    print("SUCCESS RESULT:", res)
except Exception as e:
    import traceback
    traceback.print_exc()

db.close()

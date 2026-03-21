import sys, os
sys.path.append(os.getcwd())
import main
from app.db.session import SessionLocal
from app.models.user import User

db = SessionLocal()
for u in db.query(User).all():
    print(f"User: id={u.id}, email={u.email}, type={u.type}, company_id={u.company_id}")

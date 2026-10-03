import sys
import os
import traceback

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

import main # this loads all models and routers

from app.db.session import SessionLocal
from app.models.company import Company
from app.models.user import User
from app.models.pos import POSSession
from app.schemas.pos import POSSessionCreate, POSSessionResponse
from app.api.pos import create_pos_session

def run_test():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.active == True).first()
        company = db.query(Company).filter(Company.id == user.company_id).first() if user else None
        print(f"User: {user.id if user else None} ({user.email if user else None}), Company: {company.id if company else None}")
        
        payload = POSSessionCreate(
            title="pdv olhares",
            catalog_source="HORUS_REALTIME",
            branch_id=2,
            validate_stock=True,
            initial_cash_amount=0.0
        )
        print("Calling create_pos_session...")
        res = create_pos_session(
            company_id=company.id if company else 1,
            payload=payload,
            db=db,
            current_user=user
        )
        print("Success! Created session:", res.id, res.code, res.title)
        print("Testing Pydantic serialization...")
        out = POSSessionResponse.from_orm(res)
        print("Pydantic output:", out.dict())
    except Exception as e:
        print("ERROR OCCURRED:")
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    run_test()

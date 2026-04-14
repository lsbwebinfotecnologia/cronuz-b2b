import sys
import os
sys.path.append(os.getcwd())

from app.db.session import SessionLocal
from app.api.services import get_service_order_details
from app.models.service import ServiceOrder
import traceback

db = SessionLocal()
order = db.query(ServiceOrder).filter(ServiceOrder.id == 30).first()
if not order:
    print("Order 30 not found!")
    sys.exit(1)

class FakeUser:
    company_id = order.company_id
    
try:
    resp = get_service_order_details(order_id=30, db=db, current_user=FakeUser())
    print("SUCCESS")
except Exception as e:
    traceback.print_exc()

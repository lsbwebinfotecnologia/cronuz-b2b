import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import SessionLocal
from app.models.service import ServiceOrder
import json

db = SessionLocal()
order = db.query(ServiceOrder).first()
if order:
    d = dict(order.__dict__)
    d.pop('_sa_instance_state', None)
    print("ORDER DICT:")
    print(d)
else:
    print("No order found")

import sys
import os
import json

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import SessionLocal
from app.models.service import ServiceOrder
from fastapi.encoders import jsonable_encoder

db = SessionLocal()
order = db.query(ServiceOrder).first()

if order:
    raw_dict = {
        **order.__dict__, 
        "customer_name": order.customer.name,
        "service_name": order.service.name if order.service else None
    }
    raw_dict.pop('_sa_instance_state', None)
    
    print(json.dumps(jsonable_encoder(raw_dict)))
else:
    print("NO ORDER")

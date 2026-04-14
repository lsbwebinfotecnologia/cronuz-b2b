import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.models import company, user, service, financial, customer, pdv, integrators
from app.db.session import engine, SessionLocal
from app.models.service import ServiceOrder

db = SessionLocal()
order = db.query(ServiceOrder).first()
print(order.__dict__)

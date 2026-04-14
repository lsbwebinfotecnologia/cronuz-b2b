from main import app 
from app.db.session import SessionLocal
from app.models.service import ServiceOrder

db = SessionLocal()
order = db.query(ServiceOrder).filter(ServiceOrder.id == 21).first()
if order:
    print(f"OS: {order.id}, STATUS NFSE: {order.status_nfse.name if hasattr(order.status_nfse, 'name') else getattr(order, 'status_nfse')}")
else:
    print("OS 21 has no record")

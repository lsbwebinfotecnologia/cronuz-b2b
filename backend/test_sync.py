import asyncio
import app.main
from app.tasks.nfse_worker import process_nfse_queue_jobs
from app.models.service import ServiceOrder
from app.db.session import SessionLocal

db = SessionLocal()
orders = db.query(ServiceOrder).all()
for o in orders:
    print(f"OS #{o.id} - Status: {o.status_nfse.value}")

print("Running worker...")
process_nfse_queue_jobs()

db.expire_all()
for o in orders:
    db.refresh(o)
    print(f"OS #{o.id} - Status: {o.status_nfse.value}")

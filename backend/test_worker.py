import asyncio
from app.db.session import SessionLocal
from app.models.nfse import NFSeQueue, NFSeQueueStatus
from app.tasks.nfse_worker import process_nfse_queue_jobs

db = SessionLocal()

# manually create a pending queue item just for testing
q = NFSeQueue(
    company_id=8,
    service_order_id=21,
    status="PENDING"
)
db.add(q)
db.commit()

print("Created queue item:", q.id)

# run worker
try:
    process_nfse_queue_jobs()
    print("Worker finished without crashing.")
except Exception as e:
    print("Worker CRASHED:", str(e))

db.refresh(q)
print("Final queue status:", q.status.value if hasattr(q.status, 'value') else q.status)
print("Final error:", getattr(q, 'error_message', 'No error'))

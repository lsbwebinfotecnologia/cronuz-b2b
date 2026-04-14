from main import app 
from app.db.session import SessionLocal
from app.models.service import ServiceOrder, ServiceOrderNfseStatus
from app.models.nfse import NFSeQueue, NFSeQueueStatus

db = SessionLocal()
order = db.query(ServiceOrder).filter(ServiceOrder.id == 20).first()
if order:
    order.status_nfse = ServiceOrderNfseStatus.PROCESSING

job = db.query(NFSeQueue).filter(NFSeQueue.id == 1).first()
if job:
    job.status = NFSeQueueStatus.PENDING
    job.retry_count = 0
    job.error_message = None

db.commit()
print("Reset success! Running worker now...")

from app.tasks.nfse_worker import process_nfse_queue_jobs
process_nfse_queue_jobs()
print("Finished!")

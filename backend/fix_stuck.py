from main import app 
from app.db.session import SessionLocal
from app.models.service import ServiceOrder, ServiceOrderNfseStatus
from app.models.nfse import NFSeQueue

db = SessionLocal()
# Any OS that is PROCESSING but has no active queue, or all PROCESSING
stuck_orders = db.query(ServiceOrder).filter(ServiceOrder.status_nfse == ServiceOrderNfseStatus.PROCESSING).all()

count = 0
for order in stuck_orders:
    # Check if a pending queue exists
    queue_exists = db.query(NFSeQueue).filter(NFSeQueue.service_order_id == order.id, NFSeQueue.status.in_(["PENDING", "PROCESSING"])).first()
    if not queue_exists:
        order.status_nfse = ServiceOrderNfseStatus.NOT_ISSUED
        count += 1

db.commit()
print(f"Fixed {count} stuck orders.")

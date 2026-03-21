import sys
import os

sys.path.append(os.getcwd())

import main
from app.db.session import SessionLocal
from app.models.subscription import CustomerSubscription

db = SessionLocal()
subs = db.query(CustomerSubscription).all()
print("TOTAL SUBSCRIPTIONS IN DB:", len(subs))
if len(subs) > 0:
    for s in subs:
        print("Sub:", "ID", s.id, "Company", s.company_id, "Status", s.status, "EFI ID", s.efi_subscription_id)
db.close()

import sys, os
sys.path.append(os.getcwd())
import main
from app.db.session import SessionLocal
from app.models.subscription import CustomerSubscription, SubscriptionBilling

db = SessionLocal()

# Find dummy subs
subs = db.query(CustomerSubscription).filter(CustomerSubscription.customer_id == 1).all()
for sub in subs:
    # Delete related billings
    db.query(SubscriptionBilling).filter(SubscriptionBilling.subscription_id == sub.id).delete()
    print(f"Deleted billings for sub {sub.id}")
    
# Delete subs
db.query(CustomerSubscription).filter(CustomerSubscription.customer_id == 1).delete()
print(f"Deleted subs for customer_id 1")

db.commit()
db.close()

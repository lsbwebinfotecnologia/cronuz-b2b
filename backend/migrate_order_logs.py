import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import engine
from app.db.session import Base

# NEW MODELS
from app.models.order_log import OrderLog
from app.models.order_interaction import OrderInteraction
from app.models.order import Order
from app.models.user import User

print("Creating new tables...")
Base.metadata.create_all(bind=engine)
print("Done!")

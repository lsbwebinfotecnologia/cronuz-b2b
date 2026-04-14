import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.db.session import engine

def apply_migrations():
    with engine.begin() as conn:
        try:
            # Add service_order_id to svc_nfse_queue
            conn.execute(text("ALTER TABLE svc_nfse_queue ADD COLUMN service_order_id INTEGER REFERENCES svc_service_order(id);"))
            print("Successfully added: service_order_id to svc_nfse_queue")
        except Exception as e:
            print(f"Skipping svc_nfse_queue.service_order_id (likely exists): {e}")

if __name__ == "__main__":
    print("Starting Phase 3 NFSe Schema Migrations...")
    apply_migrations()
    print("Phase 3 Migrations Completed!")

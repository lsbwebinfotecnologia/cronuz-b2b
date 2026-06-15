import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import engine, Base
from app.models.company import Company
from app.models.seller_branch import SellerBranch
from app.models.order_conference import OrderConference, OrderConferenceVolume, OrderConferenceVolumeItem
from sqlalchemy import text

fields = [
    "module_logistica_horus BOOLEAN DEFAULT FALSE"
]

def run_migration():
    print("Starting Horus Logistics PostgreSQL Migration...")
    
    # 1. Patch Company Table
    with engine.connect() as conn:
        for field in fields:
            try:
                # Nested transaction to handle specific column addition failures
                with conn.begin_nested():
                    conn.execute(text(f"ALTER TABLE cmp_company ADD COLUMN {field}"))
                print(f"Added column {field} to cmp_company")
            except Exception as e:
                print(f"Skipping {field} - Exists or err: {e}")
        
        conn.commit()

    # 2. Create New Tables
    Base.metadata.create_all(bind=engine, tables=[
        SellerBranch.__table__,
        OrderConference.__table__,
        OrderConferenceVolume.__table__,
        OrderConferenceVolumeItem.__table__
    ])
    print("Horus Logistics tables checked/created successfully!")

    # 3. Add weight column if not exists
    with engine.connect() as conn:
        try:
            with conn.begin_nested():
                conn.execute(text("ALTER TABLE cmp_order_conference_volume ADD COLUMN IF NOT EXISTS weight DOUBLE PRECISION;"))
            print("Successfully checked/added weight column to cmp_order_conference_volume")
        except Exception as e:
            print(f"Skipping weight column - error: {e}")
        conn.commit()

if __name__ == "__main__":
    run_migration()

import sys
import os

sys.path.append(os.getcwd())

from app.db.session import engine
from sqlalchemy import text

try:
    with engine.connect() as conn:
        conn.execute(text('ALTER TABLE sub_customer ADD COLUMN efi_subscription_id INTEGER;'))
        conn.commit()
        print("Column efi_subscription_id added successfully!")
except Exception as e:
    print(f"Error alternating table: {e}")

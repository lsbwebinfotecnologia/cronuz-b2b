import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.db.session import engine

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE leads ADD COLUMN status VARCHAR(50) DEFAULT 'new'"))
        conn.commit()
        print("Column 'status' added successfully.")
    except Exception as e:
        print(f"Error (possibly column already exists): {e}")

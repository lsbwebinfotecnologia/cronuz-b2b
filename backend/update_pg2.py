import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import engine
from sqlalchemy import text

fields = [
    "shipping_zip_code VARCHAR",
    "shipping_street VARCHAR",
    "shipping_number VARCHAR",
    "shipping_complement VARCHAR",
    "shipping_neighborhood VARCHAR",
    "shipping_city VARCHAR",
    "shipping_state VARCHAR"
]

with engine.connect() as conn:
    for field in fields:
        # Start a nested transaction per statement to avoid aborting the whole block
        try:
            with conn.begin_nested():
                conn.execute(text(f"ALTER TABLE sub_customer ADD COLUMN {field}"))
            print(f"Added {field}")
        except Exception as e:
            print(f"Skipping {field} - Exists or err")
    
    conn.commit()

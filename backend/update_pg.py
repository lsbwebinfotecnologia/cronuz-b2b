import os
import sys

# Add current dir to path to find app module
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import engine
from sqlalchemy import text

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE sub_plan ADD COLUMN hotsite_config JSON"))
        print("Column hotsite_config added successfully to sub_plan")
    except Exception as e:
        print("hotsite_config err:", e)
        
    try:
        conn.execute(text("ALTER TABLE sub_customer ADD COLUMN shipping_zip_code VARCHAR"))
        conn.execute(text("ALTER TABLE sub_customer ADD COLUMN shipping_street VARCHAR"))
        conn.execute(text("ALTER TABLE sub_customer ADD COLUMN shipping_number VARCHAR"))
        conn.execute(text("ALTER TABLE sub_customer ADD COLUMN shipping_complement VARCHAR"))
        conn.execute(text("ALTER TABLE sub_customer ADD COLUMN shipping_neighborhood VARCHAR"))
        conn.execute(text("ALTER TABLE sub_customer ADD COLUMN shipping_city VARCHAR"))
        conn.execute(text("ALTER TABLE sub_customer ADD COLUMN shipping_state VARCHAR"))
        print("Shipping columns added successfully to sub_customer")
    except Exception as e:
        print("shipping array err:", e)
        
    conn.commit()

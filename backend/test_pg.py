import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import engine
from sqlalchemy import text

with engine.connect() as conn:
    try:
        res = conn.execute(text("SELECT shipping_zip_code FROM sub_customer LIMIT 1"))
        print("SUCCESS! shipping_zip_code exists!")
    except Exception as e:
        print("FAILED!", e)

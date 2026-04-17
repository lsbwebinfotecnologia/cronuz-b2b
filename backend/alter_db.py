import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), "."))

from app.db.session import engine
from sqlalchemy import text

try:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE cmp_settings ADD COLUMN b2b_show_stock_quantity BOOLEAN NOT NULL DEFAULT TRUE;"))
        print("Column added successfully!")
except Exception as e:
    print(f"Error: {e}")

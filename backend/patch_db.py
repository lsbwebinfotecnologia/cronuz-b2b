import sys
import traceback
from sqlalchemy import text
from app.db.session import engine

def patch_db():
    with engine.connect() as conn:
        try:
            # Drop constraint if exists
            conn.execute(text("ALTER TABLE ord_order ADD COLUMN external_id VARCHAR;"))
            conn.commit()
            print("Successfully added external_id to ord_order")
        except Exception as e:
            print(f"Error: {e}")
            
        try:
            conn.execute(text("ALTER TABLE ord_order DROP COLUMN bookinfo_import_id;"))
            conn.commit()
            print("Successfully dropped bookinfo_import_id from ord_order")
        except Exception as e:
            print(f"Error dropping: {e}")

if __name__ == "__main__":
    patch_db()

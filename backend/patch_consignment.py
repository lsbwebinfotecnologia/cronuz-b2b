import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), "app"))
from sqlalchemy import text
from app.db.session import engine

def apply_patch():
    try:
        with engine.connect() as connection:
            print("Adding module_consignment column to cmp_company...")
            # Check if column exists
            result = connection.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='cmp_company' and column_name='module_consignment'"))
            if result.fetchone():
                print("Column module_consignment already exists.")
            else:
                connection.execute(text("ALTER TABLE cmp_company ADD COLUMN module_consignment BOOLEAN NOT NULL DEFAULT FALSE;"))
                connection.commit()
                print("Column added successfully.")
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    apply_patch()

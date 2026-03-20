import sys
from sqlalchemy import text
from app.db.session import SessionLocal

def patch_db():
    db = SessionLocal()
    try:
        # Add new columns to cmp_company
        columns_to_add = [
            "zip_code VARCHAR",
            "street VARCHAR",
            "number VARCHAR",
            "complement VARCHAR",
            "neighborhood VARCHAR",
            "city VARCHAR",
            "state VARCHAR"
        ]
        
        for col in columns_to_add:
            try:
                print(f"Adding column: {col}")
                db.execute(text(f"ALTER TABLE cmp_company ADD COLUMN {col};"))
                db.commit()
            except Exception as e:
                db.rollback()
                print(f"Column {col} might already exist or error: {e}")
                
        print("Done patching PostgreSQL database.")
    finally:
        db.close()

if __name__ == "__main__":
    patch_db()

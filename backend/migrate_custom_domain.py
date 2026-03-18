import os
import sqlite3
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./cronuz_b2b.db")

def migrate():
    print(f"Migrating database: {DATABASE_URL}")
    if DATABASE_URL.startswith("postgresql"):
        # PostgreSQL Migration
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()
        try:
            cursor.execute("ALTER TABLE cmp_company ADD COLUMN custom_domain VARCHAR(255) UNIQUE;")
            conn.commit()
            print("Successfully added custom_domain to PostgreSQL.")
        except psycopg2.errors.DuplicateColumn:
            print("custom_domain column already exists in PostgreSQL.")
            conn.rollback()
        except Exception as e:
            print(f"PostgreSQL Error: {e}")
            conn.rollback()
        finally:
            cursor.close()
            conn.close()
    else:
        # SQLite Migration
        db_path = DATABASE_URL.replace("sqlite:///", "")
        if db_path.startswith("./"):
            db_path = db_path[2:]
            
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        try:
            cursor.execute("ALTER TABLE cmp_company ADD COLUMN custom_domain VARCHAR(255);")
            cursor.execute("CREATE UNIQUE INDEX ix_cmp_company_custom_domain ON cmp_company (custom_domain);")
            conn.commit()
            print("Successfully added custom_domain to SQLite.")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e).lower() or "already exists" in str(e).lower():
                print("custom_domain column already exists in SQLite.")
            else:
                print(f"SQLite Error: {e}")
        finally:
            conn.close()

if __name__ == "__main__":
    migrate()

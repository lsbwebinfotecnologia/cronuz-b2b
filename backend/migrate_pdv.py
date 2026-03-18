import os
from sqlalchemy import create_engine, text

def migrate():
    # 1. Migrate SQLite
    sqlite_url = "sqlite:///./cronuz_b2b.db"
    if os.path.exists("./cronuz_b2b.db"):
        print(f"Migrating database: {sqlite_url}")
        engine_sqlite = create_engine(sqlite_url)
        with engine_sqlite.connect() as conn:
            try:
                conn.execute(text("ALTER TABLE cmp_company ADD COLUMN module_pdv BOOLEAN DEFAULT 0 NOT NULL;"))
                print("Successfully added module_pdv to SQLite.")
            except Exception as e:
                print(f"module_pdv column already exists or error in SQLite cmp_company: {e}")
                
            try:
                conn.execute(text("ALTER TABLE cmp_settings ADD COLUMN pdv_type VARCHAR(50) DEFAULT 'NON_FISCAL' NOT NULL;"))
                print("Successfully added pdv_type to SQLite.")
            except Exception as e:
                print(f"pdv_type column already exists or error in SQLite cmp_settings: {e}")
            conn.commit()

    # 2. Migrate PostgreSQL
    # Hardcoded fallback as requested in previous sessions
    pg_url = os.environ.get("DATABASE_URL", "postgresql://cronuz_admin:cronuz_password_123@localhost:5432/cronuz_b2b")
    print(f"Migrating database: {pg_url}")
    try:
        engine_pg = create_engine(pg_url)
        with engine_pg.connect() as conn:
            # We must commit the DDL changes in postgres
            with conn.begin():
                try:
                    conn.execute(text("ALTER TABLE cmp_company ADD COLUMN module_pdv BOOLEAN DEFAULT FALSE NOT NULL;"))
                    print("Successfully added module_pdv to PostgreSQL.")
                except Exception as e:
                    print(f"module_pdv column already exists or error in PostgreSQL cmp_company: {e}")
                
                try:
                    conn.execute(text("ALTER TABLE cmp_settings ADD COLUMN pdv_type VARCHAR(50) DEFAULT 'NON_FISCAL' NOT NULL;"))
                    print("Successfully added pdv_type to PostgreSQL.")
                except Exception as e:
                    print(f"pdv_type column already exists or error in PostgreSQL cmp_settings: {e}")
    except Exception as e:
        print(f"Failed to connect or migrate PostgreSQL: {e}")

if __name__ == "__main__":
    migrate()

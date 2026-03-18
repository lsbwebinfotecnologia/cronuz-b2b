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
                conn.execute(text("ALTER TABLE ord_order ADD COLUMN agent_id INTEGER REFERENCES usr_user(id);"))
                conn.execute(text("CREATE INDEX ix_ord_order_agent_id ON ord_order (agent_id);"))
                print("Successfully added agent_id to SQLite.")
            except Exception as e:
                print(f"agent_id column already exists or error in SQLite ord_order: {e}")
            conn.commit()

    # 2. Migrate PostgreSQL
    pg_url = os.environ.get("DATABASE_URL", "postgresql://cronuz_admin:cronuz_password_123@localhost:5432/cronuz_b2b")
    print(f"Migrating database: {pg_url}")
    try:
        engine_pg = create_engine(pg_url)
        with engine_pg.connect() as conn:
            with conn.begin():
                try:
                    conn.execute(text("ALTER TABLE ord_order ADD COLUMN agent_id INTEGER REFERENCES usr_user(id);"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_ord_order_agent_id ON ord_order (agent_id);"))
                    print("Successfully added agent_id to PostgreSQL.")
                except Exception as e:
                    print(f"agent_id column already exists or error in PostgreSQL ord_order: {e}")
    except Exception as e:
        print(f"Failed to connect or migrate PostgreSQL: {e}")

if __name__ == "__main__":
    migrate()

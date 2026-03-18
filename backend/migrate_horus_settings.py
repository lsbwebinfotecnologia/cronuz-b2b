from app.db.session import engine
from sqlalchemy import text

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE cmp_settings ADD COLUMN horus_default_b2b_guid VARCHAR;"))
        conn.commit()
    except Exception as e:
        print(f"Skipping horus_default_b2b_guid: {e}")
        conn.rollback()

    try:
        conn.execute(text("ALTER TABLE cmp_settings ADD COLUMN horus_api_mode VARCHAR DEFAULT 'STANDARD';"))
        conn.commit()
    except Exception as e:
        print(f"Skipping horus_api_mode: {e}")
        conn.rollback()

print("Schema updated.")

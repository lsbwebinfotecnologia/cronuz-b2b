import sys
from sqlalchemy import text
from app.db.session import engine

def run_migration():
    queries = [
        "ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_enabled BOOLEAN DEFAULT FALSE NOT NULL;",
        "ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_url VARCHAR(255);",
        "ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_port VARCHAR(50);",
        "ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_username VARCHAR(255);",
        "ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_password VARCHAR(255);",
        "ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_company VARCHAR(50);",
        "ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS horus_branch VARCHAR(50);",
        "ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS cover_image_base_url VARCHAR(500);",
    ]
    with engine.connect() as conn:
        for query in queries:
            try:
                conn.execute(text(query))
                print(f"Executed: {query}")
            except Exception as e:
                print(f"Skipped (likely exists): {e}")
        conn.commit()

if __name__ == "__main__":
    run_migration()

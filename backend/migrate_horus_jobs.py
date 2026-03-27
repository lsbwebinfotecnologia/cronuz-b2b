import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

DB_URL = "postgresql://cronuz_admin:cronuz_password_123@localhost:5432/cronuz_b2b"

def migrate():
    conn = psycopg2.connect(DB_URL)
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cursor = conn.cursor()

    commands = [
        "ALTER TABLE ord_order ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100) NULL;",
        "ALTER TABLE ord_order ADD COLUMN IF NOT EXISTS invoice_key VARCHAR(100) NULL;",
        "ALTER TABLE ord_order ADD COLUMN IF NOT EXISTS bookinfo_nfe_sent BOOLEAN NOT NULL DEFAULT FALSE;",
        "ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS bookinfo_notify_processing_early BOOLEAN NOT NULL DEFAULT FALSE;"
    ]

    for cmd in commands:
        try:
            print(f"Executing: {cmd}")
            cursor.execute(cmd)
            print("Success.")
        except Exception as e:
            print(f"Error executing {cmd}: {e}")

    cursor.close()
    conn.close()
    print("Migration finished.")

if __name__ == "__main__":
    migrate()

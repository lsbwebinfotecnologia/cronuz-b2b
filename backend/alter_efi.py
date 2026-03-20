import sqlite3
import os

db_path = os.getenv("DATABASE_URL", "sqlite:///./cronuz_b2b.db")
if "sqlite" in db_path:
    conn = sqlite3.connect("cronuz_b2b.db")
    c = conn.cursor()
    # cmp_settings
    try:
        c.execute("ALTER TABLE cmp_settings ADD COLUMN efi_sandbox BOOLEAN DEFAULT 1 NOT NULL")
    except Exception as e: print(e)
    try:
        c.execute("ALTER TABLE cmp_settings ADD COLUMN efi_client_id VARCHAR(255)")
    except Exception as e: print(e)
    try:
        c.execute("ALTER TABLE cmp_settings ADD COLUMN efi_client_secret VARCHAR(255)")
    except Exception as e: print(e)
    try:
        c.execute("ALTER TABLE cmp_settings ADD COLUMN efi_payee_code VARCHAR(255)")
    except Exception as e: print(e)
    try:
        c.execute("ALTER TABLE cmp_settings ADD COLUMN efi_certificate_path VARCHAR(500)")
    except Exception as e: print(e)

    # sub_customer
    try:
        c.execute("ALTER TABLE sub_customer ADD COLUMN efi_subscription_id INTEGER")
    except Exception as e: print(e)

    conn.commit()
    conn.close()
    print("SQLite Alterations complete")
else:
    # PostgreSQL
    import psycopg2
    db_path = db_path.replace("postgresql://", "")
    user_pass, host_db = db_path.split("@")
    user, password = user_pass.split(":")
    host_port, dbname = host_db.split("/")
    host, port = host_port.split(":")
    conn = psycopg2.connect(host=host, port=port, user=user, password=password, dbname=dbname)
    conn.autocommit = True
    c = conn.cursor()
    try:
        c.execute("ALTER TABLE cmp_settings ADD COLUMN efi_sandbox BOOLEAN DEFAULT TRUE NOT NULL")
    except Exception as e: print(e)
    try:
        c.execute("ALTER TABLE cmp_settings ADD COLUMN efi_client_id VARCHAR(255)")
    except Exception as e: print(e)
    try:
        c.execute("ALTER TABLE cmp_settings ADD COLUMN efi_client_secret VARCHAR(255)")
    except Exception as e: print(e)
    try:
        c.execute("ALTER TABLE cmp_settings ADD COLUMN efi_payee_code VARCHAR(255)")
    except Exception as e: print(e)
    try:
        c.execute("ALTER TABLE cmp_settings ADD COLUMN efi_certificate_path VARCHAR(500)")
    except Exception as e: print(e)

    # sub_customer
    try:
        c.execute("ALTER TABLE sub_customer ADD COLUMN efi_subscription_id INTEGER")
    except Exception as e: print(e)
    conn.close()
    print("PostgreSQL Alterations complete")

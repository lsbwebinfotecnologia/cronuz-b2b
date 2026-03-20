from sqlalchemy import create_engine, text

SQLALCHEMY_DATABASE_URL = "postgresql://cronuz_admin:cronuz_password_123@localhost:5432/cronuz_b2b"
engine = create_engine(SQLALCHEMY_DATABASE_URL)

queries = [
    "ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS efi_sandbox BOOLEAN DEFAULT TRUE NOT NULL;",
    "ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS efi_client_id VARCHAR(255);",
    "ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS efi_client_secret VARCHAR(255);",
    "ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS efi_payee_code VARCHAR(255);",
    "ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS efi_certificate_path VARCHAR(500);",
    "ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS pdv_type VARCHAR(50) DEFAULT 'NON_FISCAL' NOT NULL;",
    "ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS pdv_allow_out_of_stock BOOLEAN DEFAULT FALSE NOT NULL;",
    "ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS allow_backorder BOOLEAN DEFAULT FALSE NOT NULL;",
    "ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS max_backorder_qty INTEGER DEFAULT 0 NOT NULL;",
    "ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS cover_image_base_url VARCHAR(500);"
]

def patch():
    with engine.begin() as conn:
        for q in queries:
            try:
                conn.execute(text(q))
                print("Executed:", q)
            except Exception as e:
                print("Error:", e)
    print("Database patched successfully.")

if __name__ == "__main__":
    patch()

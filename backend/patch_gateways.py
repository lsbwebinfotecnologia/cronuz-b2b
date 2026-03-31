from app.db.session import engine
from sqlalchemy import text

def patch():
    queries = [
        "ALTER TABLE cmp_settings ADD COLUMN payment_gateway_active VARCHAR(50) DEFAULT 'EFI' NOT NULL",
        "ALTER TABLE cmp_settings ADD COLUMN cielo_client_id VARCHAR(255)",
        "ALTER TABLE cmp_settings ADD COLUMN cielo_client_secret VARCHAR(255)",
        "ALTER TABLE cmp_settings ADD COLUMN cielo_merchant_id VARCHAR(255)",
        "ALTER TABLE cmp_settings ADD COLUMN rede_pv VARCHAR(255)",
        "ALTER TABLE cmp_settings ADD COLUMN rede_token VARCHAR(255)",
        "ALTER TABLE cmp_settings ADD COLUMN vindi_api_key VARCHAR(255)",
        "ALTER TABLE cmp_settings ADD COLUMN freight_gateway_active VARCHAR(50)",
        "ALTER TABLE cmp_settings ADD COLUMN origin_zip_code VARCHAR(20)",
        "ALTER TABLE cmp_settings ADD COLUMN correios_user VARCHAR(255)",
        "ALTER TABLE cmp_settings ADD COLUMN correios_password VARCHAR(255)",
        "ALTER TABLE cmp_settings ADD COLUMN frenet_token VARCHAR(255)",
        "ALTER TABLE cmp_settings ADD COLUMN jadlog_token VARCHAR(255)",
        "ALTER TABLE cmp_settings ADD COLUMN tray_envios_token VARCHAR(255)"
    ]
    
    for q in queries:
        try:
            with engine.begin() as conn:
                conn.execute(text(q))
                print(f"Success: {q}")
        except Exception as e:
            print(f"Failed (prob already exists): {e}")

if __name__ == "__main__":
    patch()

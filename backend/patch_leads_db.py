from sqlalchemy import create_engine, text

SQLALCHEMY_DATABASE_URL = "postgresql://cronuz_admin:cronuz_password_123@localhost:5432/cronuz_b2b"
engine = create_engine(SQLALCHEMY_DATABASE_URL)

queries = [
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS source VARCHAR(100);",
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to INTEGER;",
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);",
    "ALTER TABLE leads ADD COLUMN IF NOT EXISTS role VARCHAR(100);"
]

def patch():
    with engine.begin() as conn:
        for q in queries:
            try:
                conn.execute(text(q))
                print("Executed:", q)
            except Exception as e:
                print("Error:", e)
    print("Leads Database patched successfully.")

if __name__ == "__main__":
    patch()

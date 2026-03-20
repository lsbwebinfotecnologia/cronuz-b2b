from sqlalchemy import text
from app.db.session import engine

with engine.begin() as conn:
    conn.execute(text("ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS module_b2b_native BOOLEAN DEFAULT TRUE NOT NULL;"))
    conn.execute(text("ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS module_products BOOLEAN DEFAULT TRUE NOT NULL;"))
    conn.execute(text("ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS module_customers BOOLEAN DEFAULT TRUE NOT NULL;"))
    conn.execute(text("ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS module_marketing BOOLEAN DEFAULT FALSE NOT NULL;"))
    conn.execute(text("ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS module_agents BOOLEAN DEFAULT FALSE NOT NULL;"))
print("Done!")

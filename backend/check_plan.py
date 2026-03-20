import sys
from sqlalchemy import create_engine, text
from app.db.session import engine

with engine.connect() as conn:
    res = conn.execute(text("SELECT id, name, company_id, hotsite_slug FROM sub_plan WHERE hotsite_slug = 'racing-cars'")).fetchone()
    if res:
        print(f"Plan: {res}")
        settings = conn.execute(text(f"SELECT efi_payee_code FROM cmp_settings WHERE company_id = {res.company_id}")).fetchone()
        print(f"Settings for company {res.company_id}: {settings}")
    else:
        print("Plan not found")

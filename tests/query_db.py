from sqlalchemy import create_engine
engine = create_engine("postgresql://cronuz_admin:cronuz_password_123@localhost:5433/cronuz_b2b")
with engine.connect() as conn:
    res = conn.execute("SELECT id, name, document, email FROM crm_customer ORDER BY id DESC LIMIT 5;")
    for row in res:
        print(row)

from app.db.session import engine
from sqlalchemy import text

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE cmp_company ADD COLUMN nfse_default_print_point_id INTEGER REFERENCES cmp_print_point(id)"))
        print("Added nfse_default_print_point_id to cmp_company")
    except Exception as e:
        print(f"Skipped cmp_company: {e}")
        
    try:
        conn.execute(text("ALTER TABLE svc_nfse_queue ADD COLUMN print_point_id INTEGER REFERENCES cmp_print_point(id)"))
        print("Added print_point_id to svc_nfse_queue")
    except Exception as e:
        print(f"Skipped svc_nfse_queue: {e}")
        
    conn.commit()

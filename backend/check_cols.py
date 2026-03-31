from app.db.session import engine
from sqlalchemy import text

try:
    with engine.connect() as conn:
        res = conn.execute(text("SELECT cielo_client_id FROM cmp_settings LIMIT 1"))
        print("Success, columns:", res.keys())
except Exception as e:
    print("FAILED:", str(e))

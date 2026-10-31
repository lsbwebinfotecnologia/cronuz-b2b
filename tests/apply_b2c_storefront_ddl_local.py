import os
import sys
from pathlib import Path
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.db.session import engine

def run_migration():
    sql_path = Path(__file__).resolve().parent.parent / "deploy" / "DEPLOY_B2C_STOREFRONT_TRAY.sql"
    sql_content = sql_path.read_text(encoding="utf-8")
    with engine.begin() as conn:
        conn.execute(text(sql_content))
    print("✅ Local PostgreSQL migration applied successfully from DEPLOY_B2C_STOREFRONT_TRAY.sql!")

if __name__ == "__main__":
    run_migration()

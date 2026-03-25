import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sqlalchemy import create_engine, text
from app.db.session import SQLALCHEMY_DATABASE_URL

def upgrade():
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE cmp_settings ADD COLUMN b2b_showcases_config JSON;"))
            conn.commit()
            print("Successfully added b2b_showcases_config to cmp_settings")
        except Exception as e:
            print(f"Error or column already exists: {e}")

if __name__ == "__main__":
    upgrade()

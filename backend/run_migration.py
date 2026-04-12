import os
from sqlalchemy import create_engine, text

# Get db url like database.py does
from dotenv import load_dotenv
load_dotenv()

db_url = os.getenv("DATABASE_URL", "postgresql://cronuz_admin:cronuz_password_123@localhost:5432/cronuz_b2b")
try:
    engine = create_engine(db_url)
    with engine.connect() as conn:
        try:
            conn.execute(text('ALTER TABLE fin_category ADD COLUMN dre_group VARCHAR(50);'))
            print("dre_group added.")
        except Exception as e:
            print("dre_group might already exist or error:", e)

        conn.commit()
    print("Migration finished!")
except Exception as e:
    print("Engine error:", e)

import sys
import os
from sqlalchemy import text
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__))))

from app.db.session import engine

def check():
    with engine.connect() as conn:
        res = conn.execute(text("SELECT id, name, type, initial_balance FROM fin_account;")).fetchall()
        for r in res:
            print(dict(r._mapping))
        print(f"Total: {len(res)}")

if __name__ == "__main__":
    check()

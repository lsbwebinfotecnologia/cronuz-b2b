import os
import sys

# Ensure backend path is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.db.session import engine

with engine.begin() as conn:
    with open("migrate.sql", "r") as f:
        sql = f.read()
    conn.execute(text(sql))
    print("Migration executed successfully.")

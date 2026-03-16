from sqlalchemy import create_engine, text
from app.db.session import engine

def main():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE mkt_showcase ADD COLUMN sort_by VARCHAR DEFAULT 'MANUAL';"))
            conn.commit()
            print("Migration applied successfully")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    main()

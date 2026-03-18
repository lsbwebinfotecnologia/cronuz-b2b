from sqlalchemy import create_engine, inspect
import sys

# Ensure models are loaded
import app.models.company
import app.models.user
import app.models.customer
import app.models.company_settings
import app.models.product
import app.models.catalog_support
import app.models.marketing_showcase
import app.models.subscription
import app.models.order
from app.db.session import Base
from sqlalchemy.orm import declarative_base

def check_schema(url):
    print(f"Checking database: {url}")
    engine = create_engine(url)
    try:
        inspector = inspect(engine)
    except Exception as e:
        print(f"Failed to connect: {e}")
        return

    model_tables = Base.metadata.tables

    missing_tables = []
    missing_columns = []

    for table_name, table in model_tables.items():
        if not inspector.has_table(table_name):
            missing_tables.append(table_name)
            continue
        
        existing_columns = {c['name'] for c in inspector.get_columns(table_name)}
        model_columns = {c.name for c in table.columns}
        
        for col_name in model_columns:
            if col_name not in existing_columns:
                missing_columns.append((table_name, col_name, str(table.columns[col_name].type)))

    if missing_tables:
        print("\nMissing Tables:")
        for t in missing_tables:
            print(f" - {t}")
    else:
        print("\nNo tables missing.")

    if missing_columns:
        print("\nMissing Columns:")
        for t, c, t_type in missing_columns:
            print(f" - Table {t} is missing column {c} (Type: {t_type})")
        
        print("\n--- SQL FOR MISSING COLUMNS ---")
        for t, c, t_type in missing_columns:
            # Basic mapping
            sql_type = t_type
            if 'VARCHAR' in sql_type:
                sql_type = 'VARCHAR'
            if 'BOOLEAN' in sql_type:
                sql_type = 'BOOLEAN DEFAULT FALSE'
            print(f"ALTER TABLE {t} ADD COLUMN {c} {sql_type};")
    else:
        print("\nNo columns missing.")

if __name__ == '__main__':
    url = sys.argv[1] if len(sys.argv) > 1 else "postgresql://cronuz_admin:cronuz_password_123@localhost:5432/cronuz_b2b"
    check_schema(url)

import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent))

from app.db.session import SessionLocal
from sqlalchemy import text

db = SessionLocal()
try:
    db.execute(text("ALTER TABLE fin_transaction ADD COLUMN email_sent_at TIMESTAMP WITH TIME ZONE;"))
    db.execute(text("ALTER TABLE fin_transaction ADD COLUMN email_logs JSONB DEFAULT '[]'::jsonb;"))
    db.execute(text("ALTER TABLE svc_service_order ADD COLUMN email_sent_at TIMESTAMP WITH TIME ZONE;"))
    db.execute(text("ALTER TABLE svc_service_order ADD COLUMN email_logs JSONB DEFAULT '[]'::jsonb;"))
    db.commit()
    print("Columns added successfully")
except Exception as e:
    db.rollback()
    print("Error:", e)
finally:
    db.close()
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent))

from app.db.session import SessionLocal
from sqlalchemy import text

db = SessionLocal()
try:
    db.execute(text("ALTER TABLE fin_transaction ADD COLUMN email_sent_at TIMESTAMP WITH TIME ZONE;"))
    db.execute(text("ALTER TABLE fin_transaction ADD COLUMN email_logs JSONB DEFAULT '[]'::jsonb;"))
    db.execute(text("ALTER TABLE svc_service_order ADD COLUMN email_sent_at TIMESTAMP WITH TIME ZONE;"))
    db.execute(text("ALTER TABLE svc_service_order ADD COLUMN email_logs JSONB DEFAULT '[]'::jsonb;"))
    db.commit()
    print("Columns added successfully")
except Exception as e:
    db.rollback()
    print("Error:", e)
finally:
    db.close()

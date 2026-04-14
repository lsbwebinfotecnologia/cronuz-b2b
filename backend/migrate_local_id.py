import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import engine
from sqlalchemy import text

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE svc_service_order ADD COLUMN local_id INTEGER NULL"))
        conn.commit()
        print("Adicionada coluna local_id")
    except Exception as e:
        print("Coluna ja existe ou erro:", e)

with engine.connect() as conn:
    # Backfill with row number partitioned by company_id
    backfill_query = """
    UPDATE svc_service_order
    SET local_id = subquery.seq
    FROM (
        SELECT id, row_number() over (partition by company_id order by id) as seq
        FROM svc_service_order
    ) AS subquery
    WHERE svc_service_order.id = subquery.id
      AND svc_service_order.local_id IS NULL;
    """
    try:
        conn.execute(text(backfill_query))
        conn.commit()
        print("Backfill de local_id concluido com sucesso")
    except Exception as e:
        print("Erro no backfill:", e)

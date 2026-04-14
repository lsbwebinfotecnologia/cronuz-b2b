import os
import sys

# setup paths
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy.orm import Session
from app.db.session import SessionLocal

def run():
    db = SessionLocal()
    # Direct raw sql execution
    res = db.execute("SELECT id, status, error_message, nfse_response_json FROM svc_nfse_queue WHERE service_order_id = 28 ORDER BY id DESC LIMIT 1").fetchone()
    
    if res:
        print(f"Status: {res[1]}")
        print(f"Error Msg: {res[2]}")
        print(f"JSON Resp: {res[3]}")
    else:
        print("Not found for OS 28")

if __name__ == "__main__":
    run()

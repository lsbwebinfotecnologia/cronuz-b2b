import asyncio
# Need to import all models via main to avoid circular dependencies
import app.main 
from app.db.session import SessionLocal
from app.models.nfse import NFSeQueue
import json

db = SessionLocal()
queue = db.query(NFSeQueue).order_by(NFSeQueue.id.desc()).limit(2).all()
for q in queue:
    print(f"ID: {q.id}, Status: {q.status}, Protocol: {q.xml_protocol_id}")
    if q.nfse_response_json:
        print(f"Response: {json.dumps(q.nfse_response_json, indent=2)}")

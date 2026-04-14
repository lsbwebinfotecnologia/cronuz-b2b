import asyncio
from main import app
from app.tasks.nfse_worker import process_nfse_queue_jobs

print("Starting manual worker trigger...")
try:
    process_nfse_queue_jobs()
    print("Worker finished without crashing!")
except Exception as e:
    import traceback
    print("Worker CRASHED:")
    traceback.print_exc()

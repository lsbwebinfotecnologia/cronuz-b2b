import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__))))
from app.db.session import engine
from app.models.catalog_support import Base

print("Creating catalog support tables...")
Base.metadata.create_all(bind=engine)
print("Done.")

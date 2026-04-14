import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), 'backend')))

from app.db.session import engine
from app.models.nfse import Base

print("Syncing NFSe Tables...")
try:
    Base.metadata.create_all(bind=engine)
    print("Sucesso!")
except Exception as e:
    print(f"Erro: {e}")

import os
import sys

# Adiciona o diretório atual ao PYTHONPATH para conseguir importar o app
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import engine
from sqlalchemy import text

def enable_unaccent():
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS unaccent;"))
        conn.commit()
    print("Extensão 'unaccent' verificada/criada com sucesso.")

if __name__ == "__main__":
    enable_unaccent()

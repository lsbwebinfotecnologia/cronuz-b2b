"""
Migração: adiciona coluna horus_use_cronuz_discount em cmp_settings
Aplicar localmente e em produção antes do deploy desta feature.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.db.session import engine
from sqlalchemy import text

def migrate():
    with engine.connect() as conn:
        # Verifica se a coluna já existe antes de adicionar
        check = conn.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='cmp_settings' AND column_name='horus_use_cronuz_discount'
        """)).fetchone()
        
        if check:
            print("✅ Coluna 'horus_use_cronuz_discount' já existe em cmp_settings. Nada a fazer.")
            return
        
        conn.execute(text("""
            ALTER TABLE cmp_settings
            ADD COLUMN horus_use_cronuz_discount BOOLEAN NOT NULL DEFAULT FALSE
        """))
        conn.commit()
        print("✅ Coluna 'horus_use_cronuz_discount' adicionada com sucesso em cmp_settings.")

if __name__ == "__main__":
    migrate()

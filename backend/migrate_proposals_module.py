import os
import sys
from sqlalchemy import text

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import engine, SessionLocal

def run_migration():
    print("Iniciando migração para adicionar o módulo de Propostas...")
    db = SessionLocal()
    try:
        # Check if module_proposals column exists on cmp_company
        check_column = db.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='cmp_company' AND column_name='module_proposals';"
        )).fetchone()
        
        if not check_column:
            print("Adicionando coluna module_proposals na tabela cmp_company...")
            # Alter table to add column
            db.execute(text(
                "ALTER TABLE cmp_company ADD COLUMN module_proposals BOOLEAN NOT NULL DEFAULT FALSE;"
            ))
            db.commit()
            print("Coluna module_proposals adicionada com sucesso.")
            
            # Enable the module for all existing companies so they don't lose access
            print("Ativando o módulo de Propostas para as empresas existentes...")
            db.execute(text(
                "UPDATE cmp_company SET module_proposals = TRUE;"
            ))
            db.commit()
            print("Módulo de Propostas ativado para empresas existentes.")
        else:
            print("Coluna module_proposals já existe na tabela cmp_company.")
            
        print("Migração do módulo concluída com sucesso!")
        
    except Exception as e:
        db.rollback()
        print(f"Erro durante a migração do módulo: {e}")
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()

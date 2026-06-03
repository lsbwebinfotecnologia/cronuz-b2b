import os
import sys
from sqlalchemy import text

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import SessionLocal

def run_migration():
    print("Iniciando migração para assinatura digital de propostas...")
    db = SessionLocal()
    try:
        check_column = db.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='crm_proposal' AND column_name='signature_name';"
        )).fetchone()
        
        if not check_column:
            print("Adicionando colunas de assinatura na tabela crm_proposal...")
            db.execute(text(
                "ALTER TABLE crm_proposal ADD COLUMN signature_name VARCHAR(255);"
            ))
            db.execute(text(
                "ALTER TABLE crm_proposal ADD COLUMN signature_document VARCHAR(50);"
            ))
            db.execute(text(
                "ALTER TABLE crm_proposal ADD COLUMN signature_email VARCHAR(255);"
            ))
            db.execute(text(
                "ALTER TABLE crm_proposal ADD COLUMN signature_ip VARCHAR(50);"
            ))
            db.execute(text(
                "ALTER TABLE crm_proposal ADD COLUMN signature_at TIMESTAMP WITHOUT TIME ZONE;"
            ))
            db.execute(text(
                "ALTER TABLE crm_proposal ADD COLUMN signature_user_agent VARCHAR(500);"
            ))
            db.commit()
            print("Colunas de assinatura adicionadas com sucesso.")
        else:
            print("Colunas de assinatura já existem na tabela crm_proposal.")
            
        print("Migração concluída com sucesso!")
        
    except Exception as e:
        db.rollback()
        print(f"Erro durante a migração: {e}")
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()

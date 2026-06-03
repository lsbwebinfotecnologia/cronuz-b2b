import os
import sys
from sqlalchemy import text
# Set PYTHONPATH to load app modules properly
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import engine, SessionLocal
from app.models import proposal as proposal_models
import app.models.order
import app.models.service
import app.models.user

def run_migration():
    print("Iniciando migração de Propostas...")
    
    # 1. Cria as novas tabelas crm_proposal e crm_proposal_item
    print("Criando tabelas crm_proposal e crm_proposal_item se não existirem...")
    proposal_models.Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        # 2. Adiciona coluna proposal_id em ord_order
        print("Verificando coluna proposal_id na tabela ord_order...")
        check_order_col = db.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='ord_order' AND column_name='proposal_id';"
        )).fetchone()
        
        if not check_order_col:
            print("Adicionando coluna proposal_id na tabela ord_order...")
            db.execute(text(
                "ALTER TABLE ord_order ADD COLUMN proposal_id INTEGER REFERENCES crm_proposal(id) ON DELETE SET NULL;"
            ))
            db.commit()
            print("Coluna proposal_id adicionada com sucesso em ord_order.")
        else:
            print("Coluna proposal_id já existe em ord_order.")

        # 3. Adiciona coluna proposal_id em svc_service_order
        print("Verificando coluna proposal_id na tabela svc_service_order...")
        check_service_col = db.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='svc_service_order' AND column_name='proposal_id';"
        )).fetchone()
        
        if not check_service_col:
            print("Adicionando coluna proposal_id na tabela svc_service_order...")
            db.execute(text(
                "ALTER TABLE svc_service_order ADD COLUMN proposal_id INTEGER REFERENCES crm_proposal(id) ON DELETE SET NULL;"
            ))
            db.commit()
            print("Coluna proposal_id adicionada com sucesso em svc_service_order.")
        else:
            print("Coluna proposal_id já existe em svc_service_order.")
            
        print("Migração concluída com sucesso!")
        
    except Exception as e:
        db.rollback()
        print(f"Erro durante a migração: {e}")
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()

import sys
import os
from sqlalchemy import text

# Add current dir to path to find app module
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import engine, Base
from app.models.company import Company
from app.models.customer import Customer
from app.models.order import Order
from app.models.financial import FinancialCategory, FinancialTransaction, FinancialInstallment, FinancialAccount, FinancialCashFlowLog

def run_migration():
    print("Atualizando Banco de Dados: Módulo Financeiro")
    print("-----------------------------------------------")
    
    # 1. Cria novas tabelas mapeadas (fin_account, fin_transaction, etc) que ainda não existem
    print("1. Criando tabelas nativas de finanças...")
    try:
        Base.metadata.create_all(bind=engine)
        print("-> Tabelas criadas/verificadas com sucesso.")
    except Exception as e:
        print(f"-> Erro ao criar tabelas: {e}")

    # 2. Adiciona a flag de permissão na tabela company
    print("2. Alterando tabela cmp_company (Permissão do Módulo Financeiro)...")
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE cmp_company ADD COLUMN module_financial BOOLEAN DEFAULT FALSE NOT NULL;"))
            conn.commit()
            print("-> Coluna module_financial adicionada com sucesso.")
        except Exception as e:
            if "already exists" in str(e).lower() or "duplicate column" in str(e).lower():
                print("-> Coluna module_financial já existe (ignorado).")
            else:
                print(f"-> Erro ao adicionar module_financial: {e}")
                
if __name__ == "__main__":
    run_migration()

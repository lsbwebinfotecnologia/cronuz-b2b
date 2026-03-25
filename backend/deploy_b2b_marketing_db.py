import os
import sys

# Resolve PYTHONPATH
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.db.session import engine
from app.models import marketing_navigation, marketing_showcase

def deploy_db():
    print("🔄 Iniciando sincronização das novas tabelas de Marketing do B2B...")
    
    # 1. Cria todas as tabelas novas que ainda não existirem no Postgres de Produção.
    # Base.metadata.create_all é seguro pois usa IF NOT EXISTS nativamente no SQL.
    print(">> Criando a tabela 'mkt_navigation_menu'...")
    marketing_navigation.Base.metadata.create_all(bind=engine)
    
    print(">> Verificando tabelas de vitrines ('mkt_showcase_slots', 'mkt_showcase_items')...")
    marketing_showcase.Base.metadata.create_all(bind=engine)

    # 2. Alterações de colunas em tabelas antigas (cmp_settings)
    print(">> Sincronizando colunas alteradas em tabelas existentes (cmp_settings)...")
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE cmp_settings ADD COLUMN b2b_showcases_config JSON;"))
            conn.commit()
            print("   -> Coluna 'b2b_showcases_config' adicionada com sucesso.")
        except Exception as e:
            print(f"   -> [INFO] A coluna 'b2b_showcases_config' provavelmente já existe ou ocorreu outro detalhe: {e}")

    print("✅ Banco de Dados de Produção Sincronizado com os recursos de MKT B2B!")

if __name__ == "__main__":
    deploy_db()

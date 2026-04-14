import sys
sys.path.insert(0, "/Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/backend")

from sqlalchemy.orm import Session
from sqlalchemy import create_engine
import os
sys.path.append("/Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/backend")
from app.database import SessionLocal, get_db
from app.models.company import SystemUpdate

def register_update(env):
    db: Session = SessionLocal()
    try:
        new_update = SystemUpdate(
            version="1.6.0-NFS-e-Cancel",
            description=f"Refatoração do XML (Schema XSD) e Assinatura para o Cancelamento (pedRegEvento) da Sefin Nacional. Restrições de botão Excluir/Baixar e exibição de OS/Fatura como Cancelados na Gestão Financeira. \nAmbiente: {env}",
            environment=env
        )
        db.add(new_update)
        db.commit()
        print(f"✅ Atualização registrada com sucesso no BD ({env}).")
    except Exception as e:
        print(f"❌ Erro ao registrar no BD: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    if len(sys.argv) > 1:
        register_update(sys.argv[1])
    else:
        register_update("LOCAL")

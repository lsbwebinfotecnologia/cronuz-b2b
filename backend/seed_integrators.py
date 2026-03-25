import os
import sys

# Setup environment to import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import SessionLocal
from app.models.system_integrator import SystemIntegrator, SystemIntegratorGroup, SystemIntegratorField

def seed():
    db = SessionLocal()
    try:
        integrators = [
            {
                "name": "Horus ERP Backoffice",
                "code": "HORUS",
                "description": "Integração nativa com ERP Horus (Produtos, Estoque, Preços e Pedidos)",
                "active": True
            },
            {
                "name": "E-Commerce Tray",
                "code": "TRAY",
                "description": "Plataforma de E-commerce Tray",
                "active": True
            },
            {
                "name": "Nuvemshop",
                "code": "NUVEMSHOP",
                "description": "Plataforma de E-commerce Nuvemshop",
                "active": True
            },
            {
                "name": "Bling ERP",
                "code": "BLING",
                "description": "Software de Gestão Empresarial",
                "active": True
            }
        ]

        for int_data in integrators:
            existing = db.query(SystemIntegrator).filter(SystemIntegrator.code == int_data["code"]).first()
            if not existing:
                new_int = SystemIntegrator(**int_data)
                db.add(new_int)
                print(f"Added {int_data['name']}")
        
        db.commit()
        print("Seed of System Integrators completed successfully.")
    except Exception as e:
        print(f"Error seeding: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed()

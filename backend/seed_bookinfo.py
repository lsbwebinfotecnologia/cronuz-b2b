import json
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import SessionLocal
from app.models.company import Company # required for relationships
from app.models.integrator import Integrator # required for relationships
from app.models.system_integrator import SystemIntegrator, SystemIntegratorGroup, SystemIntegratorField

def seed():
    db = SessionLocal()
    
    # Check if BOOKINFO exists
    si = db.query(SystemIntegrator).filter_by(code="BOOKINFO").first()
    if not si:
        si = SystemIntegrator(
            name="Bookinfo B2B",
            code="BOOKINFO",
            description="Integração de recepção eletrônica de pedidos unificada com ERP Horus.",
            active=True
        )
        db.add(si)
        db.commit()
        db.refresh(si)
        print("Created Catalog Integrator: Bookinfo")
    else:
        print("Bookinfo Catalog Integration already exists.")
    
    # Create Group
    group = db.query(SystemIntegratorGroup).filter_by(system_integrator_id=si.id, name="Configurações de Acesso").first()
    if not group:
        group = SystemIntegratorGroup(
            system_integrator_id=si.id,
            name="Configurações de Acesso",
            order_index=0
        )
        db.add(group)
        db.commit()
        db.refresh(group)
        print("Created Config Group.")
    
    # Create Fields
    fields_data = [
        {"name": "Ambiente", "label": "Ambiente", "type": "TEXT", "order_index": 0},
        {"name": "Token", "label": "Token de Acesso da Parceira", "type": "TEXT", "order_index": 1}
    ]
    
    for fd in fields_data:
        field = db.query(SystemIntegratorField).filter_by(group_id=group.id, name=fd["name"]).first()
        if not field:
            f = SystemIntegratorField(
                group_id=group.id,
                name=fd["name"],
                label=fd["label"],
                type=fd["type"],
                order_index=fd["order_index"],
                is_required=True
            )
            db.add(f)
            print(f"Created Field: {fd['name']}")
            
    db.commit()
    print("Bookinfo metadata seeded successfully!")

if __name__ == "__main__":
    seed()

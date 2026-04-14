from app.db.session import engine, Base
from app.models.service import Service, ServiceOrder

def run_migration():
    print("Starting Service Module Migration...")
    
    # Creates svc_service and svc_service_order
    # Only creates tables that don't exist yet, it's safe and idempotent.
    Base.metadata.create_all(bind=engine, tables=[
        Service.__table__,
        ServiceOrder.__table__
    ])
    
    print("Service Module Tables checked/created successfully!")

if __name__ == "__main__":
    run_migration()

from app.db.session import SessionLocal
from app.models.company import Company
from app.models.customer import Customer
from app.models.user import User

def check():
    db = SessionLocal()
    companies = db.query(Company).count()
    customers = db.query(Customer).count()
    users = db.query(User).count()
    print(f"Total Companies: {companies}")
    print(f"Total Customers: {customers}")
    print(f"Total Users: {users}")
    
    all_companies = db.query(Company).all()
    for c in all_companies:
        print(f" - Empresa: {c.name} (ID: {c.id})")
        
    all_users = db.query(User).all()
    for u in all_users:
        print(f" - Usuário: {u.email} (ID: {u.id})")
    
if __name__ == "__main__":
    check()

from app.db.session import engine, Base
from app.models.company import Company
from app.models.bookinfo_supplier import BookinfoSupplier

def run_migration():
    print("Creating spl_supplier table...")
    BookinfoSupplier.__table__.create(bind=engine, checkfirst=True)
    print("Success!")

if __name__ == "__main__":
    run_migration()

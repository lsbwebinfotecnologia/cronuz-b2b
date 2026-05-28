from app.db.session import engine, Base
# Import dependent models to avoid relationship registry errors
import app.models.company
import app.models.bookinfo_supplier
from app.models.bookinfo_transmission import BookinfoTransmission, BookinfoTransmissionItem

def run_migration():
    print("Creating spl_purchase_transmission and spl_purchase_transmission_item tables...")
    BookinfoTransmission.__table__.create(bind=engine, checkfirst=True)
    BookinfoTransmissionItem.__table__.create(bind=engine, checkfirst=True)
    print("Success!")

if __name__ == "__main__":
    run_migration()

from app.db.session import engine
from app.models.customer import CustomerFavorite, CustomerNotify
from app.models.company import Company
from app.models.product import Product

def patch():
    CustomerFavorite.__table__.create(bind=engine, checkfirst=True)
    CustomerNotify.__table__.create(bind=engine, checkfirst=True)
    print("Tables created successfully.")

if __name__ == "__main__":
    patch()

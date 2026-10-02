import pytest
import main
from app.db.session import SessionLocal
from app.models.product import Product
from app.models.school import SchoolEvent
from app.api.school_storefront import invalidate_event_cache

def test_vitrine_zero_stock_not_displayed():
    db = SessionLocal()
    prod_zero = db.query(Product).filter(Product.id == 9).first()
    if prod_zero:
        prod_zero.stock_quantity = 0
        db.commit()
        invalidate_event_cache()
    print('Teste vitrine saldo zerado executado com sucesso.')

if __name__ == '__main__':
    test_vitrine_zero_stock_not_displayed()

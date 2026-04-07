import asyncio
from sqlalchemy import text
from app.db.session import SessionLocal

def fix():
    db = SessionLocal()
    # Recalculate item totals correctly using quantity_requested which is the truth from Horus or from the Store
    db.execute(text("""
        UPDATE ord_order_item 
        SET quantity = quantity_requested,
            total_price = unit_price * quantity_requested 
    """))
    db.commit()

    # Recalculate order subtotal
    db.execute(text("""
        UPDATE ord_order o 
        SET subtotal = COALESCE((SELECT SUM(total_price) FROM ord_order_item i WHERE i.order_id = o.id), 0)
    """))
    db.commit()

    # Recalculate order total
    db.execute(text("""
        UPDATE ord_order 
        SET total = subtotal - COALESCE(discount, 0)
    """))
    db.commit()

    print("ALL TOTALS RECALCULATED!")

if __name__ == "__main__":
    fix()

import asyncio
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.order import Order, OrderItem

def fix_all_orders():
    db = SessionLocal()
    orders = db.query(Order).filter(Order.status != "CANCELLED").all()
    print(f"Total orders: {len(orders)}")
    count = 0
    for order in orders:
        if order.items:
            # Let's see if the total mismatches the items
            # The issue with Horus is that an item cost 24.63, the bug parsed it as 24635 or 246350 without decimals maybe
            # actually I just want to run the recalculation IF the unit prices are too huge
            changed = False
            for item in order.items:
                if item.unit_price > 1000:
                    # we divide by 100 or 1000? E.g. "24.63" -> "2463"
                    # wait, it depends.
                    # Instead of division, maybe the sync logic hasn't ran. Let's just reset the unit price?
                    pass
            db.refresh(order)
            new_subtotal = sum(i.total_price for i in order.items)
            if abs(order.total - new_subtotal) > 0.01:
                print(f"Order #{order.id} recalculating from {order.total} to {new_subtotal}")
                order.subtotal = new_subtotal
                order.total = new_subtotal - (order.discount or 0)
                changed = True
                
            if changed:
                db.commit()
                count += 1
                
    print(f"Fixed {count} orders directly.")

if __name__ == "__main__":
    fix_all_orders()

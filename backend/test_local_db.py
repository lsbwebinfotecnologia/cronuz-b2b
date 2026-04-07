import sys
sys.path.append('/Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/backend')
from app.db.session import SessionLocal
from app.models.user import User
from app.models.company_settings import CompanySettings
from app.models.order import Order

db = SessionLocal()
order = db.query(Order).filter(Order.id == 163).first()
if not order:
    print('Order 163 not found')
else:
    print(f'Order 163 found: horus_pedido_venda={order.horus_pedido_venda}')
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == order.company_id).first()
    if not settings:
        print('Settings not found')
    else:
        print(f'Settings found: horus_enabled={settings.horus_enabled}')

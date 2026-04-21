from app.db.session import SessionLocal
from app.models.company import Company
from app.models.user import User
from app.models.print_point import PrintPoint
from app.models.financial import FinancialInstallment
from app.models.customer import Customer
from app.models.order import Order
from app.models.company_settings import CompanySettings
from sqlalchemy.orm import configure_mappers
configure_mappers()

db = SessionLocal()
inst = db.query(FinancialInstallment).filter_by(id=61).first()
inst.bank_slip_nosso_numero = "V3_REQ|dc09547f-bfae-4c44-9f6f-0e67bca7df49|90682637262"
db.commit()
print("Fixed!", inst.bank_slip_nosso_numero)

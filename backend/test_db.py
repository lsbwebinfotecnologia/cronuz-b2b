from app.db.session import SessionLocal
# Provide enough to run compiler
from app.models.company import Company
from app.models.customer import Customer
from app.models.user import User
from app.models.order import Order
from app.models.financial import FinancialInstallment, FinancialTransaction
from app.models.service import ServiceOrder
from sqlalchemy.sql import func
from datetime import datetime

db = SessionLocal()

start_dt = datetime(2026,4,1)
end_dt = datetime(2026,5,1)

order_query = db.query(Order.status, func.count(Order.id).label('count')).filter(Order.created_at >= start_dt, Order.created_at < end_dt)
order_query = order_query.join(Company, Order.company_id == Company.id).filter(Company.tenant_id == 'bookinfo')
order_query = order_query.group_by(Order.status)

revenue_query = db.query(Order.status, func.sum(Order.total).label('rev')).filter(Order.created_at >= start_dt, Order.created_at < end_dt)
revenue_query = revenue_query.join(Company, Order.company_id == Company.id).filter(Company.tenant_id == 'bookinfo')
revenue_query = revenue_query.group_by(Order.status)

print("ORDER QUERY:")
print(str(order_query.statement.compile(compile_kwargs={"literal_binds": True})))

print("\nREVENUE QUERY:")
print(str(revenue_query.statement.compile(compile_kwargs={"literal_binds": True})))

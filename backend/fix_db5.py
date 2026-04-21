from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.sql import text

engine = create_engine("postgresql://cronuz_admin:cronuz_password_123@localhost:5432/cronuz_b2b")
Session = sessionmaker(bind=engine)
db = Session()

db.execute(text("UPDATE fin_installment SET bank_slip_nosso_numero = 'V3_REQ|dc09547f-bfae-4c44-9f6f-0e67bca7df49|90682637262' WHERE id = 61"))
db.commit()
print("Fixed ID 61")

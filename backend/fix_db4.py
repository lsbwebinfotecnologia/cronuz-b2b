import urllib.parse
import os
from dotenv import load_dotenv
load_dotenv(".env")
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

engine = create_engine(os.environ.get("SQLALCHEMY_DATABASE_URI"))
Session = sessionmaker(bind=engine)
db = Session()

db.execute("UPDATE fin_installment SET bank_slip_nosso_numero = 'V3_REQ|dc09547f-bfae-4c44-9f6f-0e67bca7df49|90682637262' WHERE id = 61")
db.commit()
print("Fixed ID 61")

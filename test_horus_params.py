import asyncio
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

engine = create_engine("postgresql://cronuz_admin:cronuz_password_123@localhost/cronuz_b2b")
Session = sessionmaker(bind=engine)
session = Session()

from app.models.company import Company
from app.models.company_settings import CompanySettings
from app.models.customer import Customer

customer = session.query(Customer).filter(Customer.id == 455).first()
if customer:
    company = session.query(Company).filter(Company.id == customer.company_id).first()
    settings = session.query(CompanySettings).filter(CompanySettings.company_id == customer.company_id).first()
    
    print("----- PARAMETERS FOR POSTMAN -----")
    print(f"URL: /Horus/api/TServerB2B/Busca_Contrato_Cliente_Sintetico")
    
    import re
    cnpj_destino = re.sub(r'\D', '', company.document)
    cnpj_cliente = re.sub(r'\D', '', customer.document)
    id_guid = customer.id_guid if customer.id_guid else (settings.horus_default_b2b_guid if settings else "")
    
    print(f"?ID_GUID={id_guid}&CNPJ_DESTINO={cnpj_destino}&ID_DOC={cnpj_cliente}&LIMIT=100&OFFSET=0")
    print("----------------------------------")
else:
    print("Customer 455 not found in DB!")


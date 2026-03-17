import asyncio
from app.db.session import SessionLocal
from app.integrators.horus_orders import HorusOrders
from app.models.company import Company
from app.models.company_settings import CompanySettings

# Hardcoding data from DB to avoid model loading issues
company_id = 1
company_document = "27415865000100" # Example from earlier context
customer_id_guid = "9b6dcaff-eaec-4131-b4f0-bced41680d28" # Assuming from earlier context 
customer_document = "41052219808" 
order_id = 24 # The user recommended trying 24
horus_id = 24

async def test():
    db = SessionLocal()

    # To be perfectly accurate we fetch only the subset we need without loading the whole ORM graph
    from sqlalchemy import text
    result = db.execute(text("SELECT document FROM cmp_company WHERE id = 1")).first()
    company_document = result[0]
    
    result = db.execute(text("SELECT document, id_guid FROM crm_customer WHERE id = 4")).first()
    customer_document = result[0]
    customer_id_guid = result[1]
    
    print(f"Testing Order ID: {order_id} | Horus ID: {horus_id}")
    print(f"Company Doc: {company_document}")
    print(f"Customer Doc/GUID: {customer_document} / {customer_id_guid}")
    
    horus_client = HorusOrders(db, company_id)
    import re
    params = {
        "COD_PEDIDO_ORIGEM": order_id,
        "ID_DOC": re.sub(r'\D', '', customer_document),
        "ID_GUID": customer_id_guid,
        "CNPJ_DESTINO": re.sub(r'\D', '', company_document)
    }
    raw_response = await horus_client.get("Busca_PedidosVenda", params=params)
    
    print("\n[HORUS RAW RESPONSE]")
    print(raw_response)
    
    db.close()
    await horus_client.close()

if __name__ == "__main__":
    asyncio.run(test())

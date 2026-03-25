import asyncio
import sys
import os
import copy
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.db.session import SessionLocal
from app.integrators.horus_products import HorusProducts
from app.models.company_settings import CompanySettings
from app.models.company import Company
from app.models.customer import Customer

async def main():
    db = SessionLocal()
    # Find settings for company 1
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == 1).first()
    
    products_client = HorusProducts(db, 1)
    
    # The ISBN from the user's screenshot: 9788564816169
    isbns = [{"BARRAS_ISBN": "9788564816169"}]
    
    # 1. Test with current settings (horus_hide_zero_balance = True)
    print("Testing with current DB settings (hide_zero_balance = True):")
    res_true = await products_client.busca_acervo_b2b(
        id_doc="1", # Change to mythos document if required, wait, the method uses company.document, I will use "57022365000180" or let me search for the company doc.
        id_guid="mythos_admin", # ID GUID
        isbns=isbns
    )
    print("Result (True):", res_true)
    
    # 2. Test forcing hide_zero_balance to False
    print("\nTesting with hide_zero_balance = False:")
    products_client._settings.horus_hide_zero_balance = False
    res_false = await products_client.busca_acervo_b2b(
        id_doc="57022365000180", # I will get doc correctly in next step
        id_guid="mythos_admin",
        isbns=isbns
    )
    print("Result (False):", res_false)
    
    await products_client.close()

if __name__ == "__main__":
    asyncio.run(main())

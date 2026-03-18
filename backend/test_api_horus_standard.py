import asyncio
from app.db.session import SessionLocal
from app.models.company_settings import CompanySettings
from app.models.company import Company
from app.integrators.horus_products import HorusProducts

db = SessionLocal()
target_company_id = 4
settings = db.query(CompanySettings).filter(CompanySettings.company_id == target_company_id).first()
company = db.query(Company).filter(Company.id == target_company_id).first()

horus_client = HorusProducts(db, target_company_id)

async def test_search():
    print("Testing Busca Acervo Padrao...")
    horus_response = await horus_client.busca_acervo_padrao(
        id_doc=company.document or "",
        term="harry",
        search_option="NOM_ITEM",
        offset=0,
        limit=25
    )
    print(horus_response)
    await horus_client.close()

asyncio.run(test_search())
db.close()

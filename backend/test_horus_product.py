import asyncio
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.integrators.horus_products import HorusProducts
from app.models.company_settings import CompanySettings
from app.models.company import Company
import json

async def main():
    db = SessionLocal()
    client = HorusProducts(db=db, company_id=1)
    
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == 1).first()
    id_doc = "0"
    if settings.horus_company and settings.horus_branch:
        id_doc = f"{settings.horus_company}{settings.horus_branch}"
        
    res = await client.busca_acervo_padrao(
        id_doc=id_doc,
        term="978-65-5586-849-0",
        search_option="BARRAS_ISBN",
        limit=1
    )
    if not res or (isinstance(res, list) and len(res) > 0 and res[0].get("Falha")):
        res = await client.busca_acervo_padrao(
            id_doc=id_doc,
            term="9786556252391",
            search_option="BARRAS_ISBN",
            limit=1
        )
    print(json.dumps(res, indent=2))
    await client.close()

if __name__ == "__main__":
    asyncio.run(main())

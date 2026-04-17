import sys
import os
import asyncio
sys.path.append(os.path.join(os.path.dirname(__file__), "."))

from app.db.session import SessionLocal
from app.models.company import Company
from app.models.user import User
from app.integrators.horus_clients import HorusClients

async def fetch_horus():
    db = SessionLocal()
    # Company 1
    # We need some id_guid, let's use company default
    from app.models.company_settings import CompanySettings
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == 1).first()
    id_guid = settings.horus_default_b2b_guid if settings else ""
    cnpj_destino = settings.company.document

    horus_client = HorusClients(db, 1)
    
    # Try search catalogue for some item
    try:
        # Paginacao = S or N
        res = await horus_client.busca_acervo_catalogo(
            cnpj_destino=cnpj_destino,
            cnpj_cliente=cnpj_destino, # same
            id_guid=id_guid,
            pPesquisa="978" # just broad search
        )
        if isinstance(res, list) and len(res) > 0:
            print("KEYS IN HORUS RESPONSE:")
            for k, v in res[0].items():
                print(f"{k}: {v}")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await horus_client.close()

if __name__ == "__main__":
    asyncio.run(fetch_horus())

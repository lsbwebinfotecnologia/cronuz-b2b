import asyncio
import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.integrator import Integrator

engine = create_engine("postgresql://cronuz_admin:cronuz_password_123@localhost:5432/cronuz_b2b")
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

async def test_bookinfo():
    db = SessionLocal()
    config = db.query(Integrator).filter(
        Integrator.company_id == 8,
        Integrator.platform == "BOOKINFO"
    ).first()
    
    import json
    creds = json.loads(config.credentials) if isinstance(config.credentials, str) else config.credentials
    token = creds.get("Token", "")
    
    base_url = "https://bookhub-api.bookinfo.com.br"
    
    async with httpx.AsyncClient(
        base_url=base_url, 
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        timeout=20.0,
        verify=False
    ) as client:
        print("Fetching NOVO...")
        resp = await client.get(f"/pedido?status=NOVO&tamanho=50")
        print("NOVO:", resp.status_code, resp.text[:200])

        print("Fetching PROCESSADO...")
        resp2 = await client.get(f"/pedido?status=PROCESSADO&tamanho=50")
        print("PROCESSADO:", resp2.status_code, resp2.text[:200])

asyncio.run(test_bookinfo())

import asyncio
from httpx import AsyncClient

async def run():
    async with AsyncClient() as client:
        # get token locally 
        res = await client.post("http://127.0.0.1:8000/auth/login", data={"username":"admin","password":"admin"})
        if not res.is_success:
            print("Login failed")
            return
        token = res.json()["access_token"]
        res = await client.get("http://127.0.0.1:8000/orders/4/horus-debug-preview?search_type=venda", headers={"Authorization": f"Bearer {token}"})
        print(f"Status: {res.status_code}")
        print(f"Body: {res.text}")

asyncio.run(run())

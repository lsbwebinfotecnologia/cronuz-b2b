import asyncio
import httpx

async def main():
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Autentica como master
        login_res = await client.post("http://127.0.0.1:8000/token", data={
            "username": "system@cronuz.com.br",
            "password": "C1r2o34@9182"
        })
        print(f"Login status: {login_res.status_code}")
        token = login_res.json().get("access_token")
        if not token:
            print("Token não obtido:", login_res.text)
            return

        headers = {"Authorization": f"Bearer {token}"}
        
        # Testar chamada do endpoint de process-check para a empresa 4
        print("Chamando POST /companies/4/logistics/process-check...")
        check_res = await client.post(
            "http://127.0.0.1:8000/companies/4/logistics/process-check",
            headers=headers
        )
        print(f"Check status: {check_res.status_code}")
        print("Check response:", check_res.json())

if __name__ == "__main__":
    asyncio.run(main())

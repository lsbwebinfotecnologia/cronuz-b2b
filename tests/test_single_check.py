import asyncio
import httpx

async def main():
    async with httpx.AsyncClient(timeout=90.0) as client:
        login_res = await client.post("http://127.0.0.1:8000/token", data={
            "username": "system@cronuz.com.br",
            "password": "C1r2o34@9182"
        })
        token = login_res.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"}
        
        # Testar pedido 19594
        print("Chamando process-check para pedido 19594...")
        check_res = await client.post(
            "http://127.0.0.1:8000/companies/4/logistics/process-check?cod_ped_venda=19594",
            headers=headers
        )
        print("Status:", check_res.status_code)
        print("Response:", check_res.json())

if __name__ == "__main__":
    asyncio.run(main())

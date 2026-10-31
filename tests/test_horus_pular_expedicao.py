from main import app
import asyncio
from app.db.session import SessionLocal
from app.models.company_settings import CompanySettings
from app.models.customer import Customer
from app.integrators.horus_orders import HorusOrders

async def main():
    db = SessionLocal()
    try:
        settings = db.query(CompanySettings).filter(CompanySettings.company_id == 4).first()
        customer = db.query(Customer).filter(Customer.company_id == 4, Customer.name.ilike('%pearson%')).first()
        
        print("Config CompanySettings:")
        print(f"  horus_company: {settings.horus_company}")
        print(f"  horus_branch: {settings.horus_branch}")
        print(f"  horus_stock_local: {settings.horus_stock_local}")
        print(f"  horus_api_mode: {settings.horus_api_mode}")
        if customer:
            print(f"Customer: {customer.name}, horus_cod_cli: {customer.horus_cod_cli}, doc: {customer.document}")
            
        client = HorusOrders(db, 4)
        
        # Vamos testar o endpoint Pular_expedicao no Horus com os parâmetros corretos
        # Testando diferentes combinações aceitas pelo Horus
        cod_local = settings.horus_stock_local or "2"
        cod_empresa = settings.horus_company or "1"
        cod_filial = settings.horus_branch or "2"
        cod_cli = customer.horus_cod_cli if (customer and customer.horus_cod_cli) else 96
        
        params1 = {
            "COD_EMPRESA": cod_empresa,
            "COD_FILIAL": cod_filial,
            "COD_CLI": 17930,
            "COD_PED_VENDA": 19893,
            "COD_LOCAL": 15
        }
        print("Enviando params:", params1)
        try:
            res1 = await client.get("Pular_expedicao", params=params1)
            print("Resposta Pular_expedicao (com COD_LOCAL 15):", res1)
        except Exception as e:
            print("Erro Pular_expedicao:", e)
            
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(main())

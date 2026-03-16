from fastapi import APIRouter

router = APIRouter()

@router.get("/inventory/horus/status")
def get_horus_status():
    """
    Simula a verificação de status da integração com o sistema Horus.
    No futuro, isso fará chamadas reais para a API do Horus (ex: via httpx).
    """
    return {
        "status": "connected",
        "last_sync": "2024-03-20T10:00:00Z",
        "items_synced": 8432,
        "message": "Integração Horus operando normalmente."
    }

@router.get("/inventory/horus/products")
def get_horus_products(limit: int = 10):
    """
    Simula a busca de produtos no Horus.
    """
    return [
        {"id": "H-101", "name": "O Senhor dos Anéis", "stock": 45},
        {"id": "H-102", "name": "Clean Code", "stock": 12},
    ]

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.integrators.horus_clients import HorusClients
from app.core.dependencies import get_current_user

@router.get("/companies/{company_id}/horus/customers/{cnpj_cliente}")
async def get_horus_customer(
    company_id: int, 
    cnpj_cliente: str, 
    db: Session = Depends(get_db), 
    current_user: dict = Depends(get_current_user)
):
    """
    Search for a customer by CNPJ in the Horus ERP API.
    """
    try:
        from app.models.company import Company
        company = db.query(Company).filter(Company.id == company_id).first()
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")
            
        cnpj_destino = company.document
        
        try:
            horus_client = HorusClients(db, company_id)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
        
        # Test connection before fetching
        test_res = await horus_client.test_api()
        if test_res.get("status") != "connected":
            await horus_client.close()
            raise HTTPException(status_code=400, detail=f"Falha na API Horus: {test_res.get('message')}")
            
        # Perform the actual search
        try:
            result = await horus_client.get_client(
                cnpj_destino=cnpj_destino,
                cnpj_cliente=cnpj_cliente
            )
        except Exception as e:
            await horus_client.close()
            raise HTTPException(status_code=400, detail=str(e))
            
        await horus_client.close()
        
        if result.get("error"):
            # Ensure the frontend gets a clean error message inside 'detail'
            raise HTTPException(status_code=400, detail=result.get("msg"))
            
        result["cnpj_seller"] = cnpj_destino
        
        # Extract and normalize financial data
        data = result.get("data", {})
        def parse_br_money(val) -> float:
            if not val:
                return 0.0
            try:
                return float(str(val).replace(".", "").replace(",", "."))
            except ValueError:
                return 0.0
                
        result["financials"] = {
            "credit_limit": parse_br_money(data.get("LIMITE", "0")),
            "open_debts": parse_br_money(data.get("TOTAL_DEBITOS", "0")),
            "consignment_status": "ACTIVE" if data.get("B2B_ACEITA_PED_CONSIG", "N") == "S" else "INACTIVE"
        }
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
        from app.models.customer import Customer
        customer = db.query(Customer).filter(Customer.document == cnpj_cliente, Customer.company_id == company_id).first()
        id_guid = customer.id_guid if customer and customer.id_guid else ""
        if not id_guid:
            from app.models.company_settings import CompanySettings
            settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
            id_guid = settings.horus_default_b2b_guid if settings and settings.horus_default_b2b_guid else ""

        
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
        from app.core.utils import parse_horus_price
                
        result["financials"] = {
            "credit_limit": parse_horus_price(data.get("LIMITE", "0")),
            "open_debts": parse_horus_price(data.get("TOTAL_DEBITOS", "0")),
            "consignment_status": "ACTIVE" if data.get("B2B_ACEITA_PED_CONSIG", "N") == "S" else "INACTIVE"
        }
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from pydantic import BaseModel
from typing import Optional, List

class ConsignmentSubmitItem(BaseModel):
    BARRAS_ISBN: str
    QTD: str

class ConsignmentSubmitRequest(BaseModel):
    tipo_a_d: str
    items: List[ConsignmentSubmitItem]
    cod_ctr: Optional[str] = None

@router.get("/companies/{company_id}/horus/customers/{cnpj_cliente}/consignment/summary")
async def get_consignment_summary(
    company_id: int, 
    cnpj_cliente: str, 
    cod_ctr: Optional[str] = None,
    db: Session = Depends(get_db), 
    current_user: dict = Depends(get_current_user)
):
    try:
        from app.models.company import Company
        company = db.query(Company).filter(Company.id == company_id).first()
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")
            
        cnpj_destino = company.document        
        from app.models.customer import Customer
        customer = db.query(Customer).filter(Customer.document == cnpj_cliente, Customer.company_id == company_id).first()
        id_guid = customer.id_guid if customer and customer.id_guid else ""
        if not id_guid:
            from app.models.company_settings import CompanySettings
            settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
            id_guid = settings.horus_default_b2b_guid if settings and settings.horus_default_b2b_guid else ""

        
        try:
            horus_client = HorusClients(db, company_id)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
            
        result = await horus_client.get_consignment_summary(
            cnpj_destino=cnpj_destino,
            cnpj_cliente=cnpj_cliente,
            id_guid=id_guid,
            cod_ctr=cod_ctr
        )
        await horus_client.close()
        
        # Horus returns lists or objects, wrap in a single standard response
        if isinstance(result, list):
            if len(result) > 0 and result[0].get("Falha"):
                raise HTTPException(status_code=400, detail=result[0].get("Mensagem", "Erro na API Horus"))
            return result
        elif isinstance(result, dict) and result.get("Falha"):
            raise HTTPException(status_code=400, detail=result.get("Mensagem", "Erro na API Horus"))
            
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/companies/{company_id}/horus/customers/{cnpj_cliente}/consignment/details")
async def get_consignment_details(
    company_id: int, 
    cnpj_cliente: str, 
    cod_ctr: Optional[str] = None,
    db: Session = Depends(get_db), 
    current_user: dict = Depends(get_current_user)
):
    try:
        from app.models.company import Company
        company = db.query(Company).filter(Company.id == company_id).first()
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")
            
        cnpj_destino = company.document        
        from app.models.customer import Customer
        customer = db.query(Customer).filter(Customer.document == cnpj_cliente, Customer.company_id == company_id).first()
        id_guid = customer.id_guid if customer and customer.id_guid else ""
        if not id_guid:
            from app.models.company_settings import CompanySettings
            settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
            id_guid = settings.horus_default_b2b_guid if settings and settings.horus_default_b2b_guid else ""

        
        try:
            horus_client = HorusClients(db, company_id)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
            
        result = await horus_client.get_consignment_details(
            cnpj_destino=cnpj_destino,
            cnpj_cliente=cnpj_cliente,
            id_guid=id_guid,
            cod_ctr=cod_ctr
        )
        await horus_client.close()
        
        if isinstance(result, list):
            if len(result) > 0 and result[0].get("Falha"):
                raise HTTPException(status_code=400, detail=result[0].get("Mensagem", "Erro na API Horus"))
            return result
        elif isinstance(result, dict) and result.get("Falha"):
            raise HTTPException(status_code=400, detail=result.get("Mensagem", "Erro na API Horus"))
            
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/companies/{company_id}/horus/customers/{cnpj_cliente}/consignment/submit")
async def submit_consignment(
    company_id: int, 
    cnpj_cliente: str, 
    payload: ConsignmentSubmitRequest,
    db: Session = Depends(get_db), 
    current_user: dict = Depends(get_current_user)
):
    try:
        from app.models.company import Company
        company = db.query(Company).filter(Company.id == company_id).first()
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")
            
        cnpj_destino = company.document        
        from app.models.customer import Customer
        customer = db.query(Customer).filter(Customer.document == cnpj_cliente, Customer.company_id == company_id).first()
        id_guid = customer.id_guid if customer and customer.id_guid else ""
        if not id_guid:
            from app.models.company_settings import CompanySettings
            settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
            id_guid = settings.horus_default_b2b_guid if settings and settings.horus_default_b2b_guid else ""

        
        if payload.tipo_a_d not in ["A", "D"]:
            raise HTTPException(status_code=400, detail="Invalid tipo_a_d parameters. Must be 'A' or 'D'.")
            
        items_dict = [item.model_dump() for item in payload.items]
        
        try:
            horus_client = HorusClients(db, company_id)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
            
        result = await horus_client.submit_consignment(
            cnpj_destino=cnpj_destino,
            cnpj_cliente=cnpj_cliente,
            id_guid=id_guid,
            tipo_a_d=payload.tipo_a_d,
            items=items_dict,
            cod_ctr=payload.cod_ctr
        )
        await horus_client.close()
        
        if isinstance(result, list):
            if len(result) > 0 and result[0].get("Falha") and "CONTRATO BLOQUEADO" in str(result[0].get("Mensagem", "")):
                 raise HTTPException(status_code=400, detail=result[0].get("Mensagem"))
        elif isinstance(result, dict) and result.get("Falha"):
            raise HTTPException(status_code=400, detail=result.get("Mensagem", "Erro na API Horus"))
            
        # Update draft to COMPLETED
        from app.models.consignment_draft import ConsignmentDraft
        draft = db.query(ConsignmentDraft).filter(
            ConsignmentDraft.company_id == company_id,
            ConsignmentDraft.cnpj_cliente == cnpj_cliente,
            ConsignmentDraft.cod_ctr == (payload.cod_ctr or ""),
            ConsignmentDraft.status == "DRAFT"
        ).first()
        if draft:
            draft.status = "COMPLETED"
            db.commit()

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ConsignmentDraftRequest(BaseModel):
    cod_ctr: str
    operation_type: str
    items_json: list

@router.get("/companies/{company_id}/horus/customers/{cnpj_cliente}/consignment/draft")
async def get_consignment_draft(
    company_id: int, 
    cnpj_cliente: str, 
    cod_ctr: str,
    db: Session = Depends(get_db), 
    current_user: dict = Depends(get_current_user)
):
    from app.models.consignment_draft import ConsignmentDraft
    draft = db.query(ConsignmentDraft).filter(
        ConsignmentDraft.company_id == company_id,
        ConsignmentDraft.cnpj_cliente == cnpj_cliente,
        ConsignmentDraft.cod_ctr == cod_ctr,
        ConsignmentDraft.status == "DRAFT"
    ).first()
    if not draft:
        return {"items_json": [], "operation_type": "A"}
    return {"items_json": draft.items_json, "operation_type": draft.operation_type}

@router.post("/companies/{company_id}/horus/customers/{cnpj_cliente}/consignment/draft")
async def save_consignment_draft(
    company_id: int, 
    cnpj_cliente: str, 
    payload: ConsignmentDraftRequest,
    db: Session = Depends(get_db), 
    current_user: dict = Depends(get_current_user)
):
    from app.models.consignment_draft import ConsignmentDraft
    draft = db.query(ConsignmentDraft).filter(
        ConsignmentDraft.company_id == company_id,
        ConsignmentDraft.cnpj_cliente == cnpj_cliente,
        ConsignmentDraft.cod_ctr == payload.cod_ctr,
        ConsignmentDraft.status == "DRAFT"
    ).first()
    
    if draft:
        draft.operation_type = payload.operation_type
        draft.items_json = payload.items_json
    else:
        draft = ConsignmentDraft(
            company_id=company_id,
            cnpj_cliente=cnpj_cliente,
            cod_ctr=payload.cod_ctr,
            operation_type=payload.operation_type,
            items_json=payload.items_json
        )
        db.add(draft)
    
    db.commit()
    return {"success": True}


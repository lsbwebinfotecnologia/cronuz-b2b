from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List

class ConsignmentSubmitItem(BaseModel):
    BARRAS_ISBN: str
    QTD: str

class ConsignmentSubmitRequest(BaseModel):
    tipo_a_d: str
    items: List[ConsignmentSubmitItem]
    cod_ctr: Optional[str] = None

endpoints_code = """
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
        
        try:
            horus_client = HorusClients(db, company_id)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
            
        result = await horus_client.get_consignment_summary(
            cnpj_destino=cnpj_destino,
            cnpj_cliente=cnpj_cliente,
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
        
        try:
            horus_client = HorusClients(db, company_id)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
            
        result = await horus_client.get_consignment_details(
            cnpj_destino=cnpj_destino,
            cnpj_cliente=cnpj_cliente,
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
            tipo_a_d=payload.tipo_a_d,
            items=items_dict,
            cod_ctr=payload.cod_ctr
        )
        await horus_client.close()
        
        if isinstance(result, list):
            # The API returns the list but with individual messages or errors
            # Let's check for global errors
            if len(result) > 0 and result[0].get("Falha") and "CONTRATO BLOQUEADO" in str(result[0].get("Mensagem", "")):
                 raise HTTPException(status_code=400, detail=result[0].get("Mensagem"))
                 
        elif isinstance(result, dict) and result.get("Falha"):
            raise HTTPException(status_code=400, detail=result.get("Mensagem", "Erro na API Horus"))
            
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
"""

with open("app/api/horus.py", "a") as f:
    f.write(endpoints_code)

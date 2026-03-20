from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.lead import Lead as LeadModel
from app.schemas.lead import LeadCreate, Lead

router = APIRouter(prefix="/leads", tags=["leads"])

@router.post("/", response_model=Lead)
def create_lead(lead_in: LeadCreate, db: Session = Depends(get_db)):
    db_lead = LeadModel(**lead_in.model_dump())
    db.add(db_lead)
    db.commit()
    db.refresh(db_lead)
    return db_lead

@router.get("/", response_model=list[Lead])
def list_leads(status: str = None, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    # Em produção isso deve ser protegido por authenticação MASTER
    query = db.query(LeadModel)
    if status:
        query = query.filter(LeadModel.status == status)
    return query.order_by(LeadModel.created_at.desc()).offset(skip).limit(limit).all()

@router.get("/summary")
def leads_summary(db: Session = Depends(get_db)):
    from sqlalchemy import func
    counts = db.query(LeadModel.status, func.count(LeadModel.id)).group_by(LeadModel.status).all()
    # counts is like [('new', 5), ('contacted', 2)]
    summary_dict: dict[str, int] = {str(s): int(count) for s, count in counts}
    total = sum(summary_dict.values())
    return {
        "new": summary_dict.get("new", 0),
        "contacted": summary_dict.get("contacted", 0),
        "archived": summary_dict.get("archived", 0),
        "total": total
    }

from app.schemas.lead import LeadStatusUpdate, LeadCompanyUpdate

@router.patch("/{lead_id}/status", response_model=Lead)
def update_lead_status(lead_id: str, payload: LeadStatusUpdate, db: Session = Depends(get_db)):
    lead = db.query(LeadModel).filter(LeadModel.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    lead.status = payload.status
    db.commit()
    db.refresh(lead)
    return lead

@router.patch("/{lead_id}/company", response_model=Lead)
def update_lead_company(lead_id: str, payload: LeadCompanyUpdate, db: Session = Depends(get_db)):
    lead = db.query(LeadModel).filter(LeadModel.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    lead.company_id = payload.company_id
    lead.status = "contacted"
    db.commit()
    db.refresh(lead)
    return lead

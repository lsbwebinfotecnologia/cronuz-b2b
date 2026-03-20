from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.models.integrator import Integrator
from app.models.user import User, UserRole
from app.schemas.integrator import IntegratorCreate, IntegratorUpdate, IntegratorResponse
from app.core.dependencies import get_current_user

router = APIRouter()

@router.get("/{company_id}", response_model=List[IntegratorResponse])
def get_integrators(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type != UserRole.MASTER and current_user.company_id != company_id:
        raise HTTPException(status_code=403, detail="Acesso negado")
        
    integrators = db.query(Integrator).filter(Integrator.company_id == company_id).all()
    return integrators

@router.post("/", response_model=IntegratorResponse)
def create_integrator(
    integrator_in: IntegratorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type != UserRole.MASTER and current_user.company_id != integrator_in.company_id:
        raise HTTPException(status_code=403, detail="Acesso negado")
        
    # Optional: check if an integrator for the same platform already exists to avoid duplicates
    existing = db.query(Integrator).filter(
        Integrator.company_id == integrator_in.company_id,
        Integrator.platform == integrator_in.platform
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail=f"Já existe uma integração para a plataforma {integrator_in.platform}")
        
    new_integrator = Integrator(
        company_id=integrator_in.company_id,
        platform=integrator_in.platform,
        credentials=integrator_in.credentials,
        active=integrator_in.active
    )
    db.add(new_integrator)
    db.commit()
    db.refresh(new_integrator)
    return new_integrator

@router.put("/{integrator_id}", response_model=IntegratorResponse)
def update_integrator(
    integrator_id: int,
    integrator_in: IntegratorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    integrator = db.query(Integrator).filter(Integrator.id == integrator_id).first()
    if not integrator:
        raise HTTPException(status_code=404, detail="Integração não encontrada")
        
    if current_user.type != UserRole.MASTER and current_user.company_id != integrator.company_id:
        raise HTTPException(status_code=403, detail="Acesso negado")
        
    update_data = integrator_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(integrator, key, value)
        
    db.commit()
    db.refresh(integrator)
    return integrator

@router.delete("/{integrator_id}")
def delete_integrator(
    integrator_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    integrator = db.query(Integrator).filter(Integrator.id == integrator_id).first()
    if not integrator:
        raise HTTPException(status_code=404, detail="Integração não encontrada")
        
    if current_user.type != UserRole.MASTER and current_user.company_id != integrator.company_id:
        raise HTTPException(status_code=403, detail="Acesso negado")
        
    db.delete(integrator)
    db.commit()
    return {"message": "Integração removida com sucesso"}

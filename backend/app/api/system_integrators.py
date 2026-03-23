from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.models.system_integrator import SystemIntegrator, SystemIntegratorGroup, SystemIntegratorField
from app.models.user import User, UserRole
from app.schemas.system_integrator import (
    SystemIntegratorCreate, SystemIntegratorUpdate, SystemIntegratorResponse,
    SystemIntegratorGroupCreate, SystemIntegratorGroupUpdate, SystemIntegratorGroupResponse,
    SystemIntegratorFieldCreate, SystemIntegratorFieldUpdate, SystemIntegratorFieldResponse
)
from app.core.dependencies import require_master_user

router = APIRouter()

@router.get("/", response_model=List[SystemIntegratorResponse])
def get_system_integrators(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master_user)
):
    integrators = db.query(SystemIntegrator).all()
    return integrators

@router.get("/{integrator_id}", response_model=SystemIntegratorResponse)
def get_system_integrator(
    integrator_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master_user)
):
    integrator = db.query(SystemIntegrator).filter(SystemIntegrator.id == integrator_id).first()
    if not integrator:
        raise HTTPException(status_code=404, detail="Integrador não encontrado")
    return integrator

@router.post("/", response_model=SystemIntegratorResponse)
def create_system_integrator(
    integrator_in: SystemIntegratorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master_user)
):
    existing = db.query(SystemIntegrator).filter(SystemIntegrator.code == integrator_in.code).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Já existe um integrador com o código {integrator_in.code}")
        
    db_integrator = SystemIntegrator(**integrator_in.model_dump())
    db.add(db_integrator)
    db.commit()
    db.refresh(db_integrator)
    return db_integrator

@router.put("/{integrator_id}", response_model=SystemIntegratorResponse)
def update_system_integrator(
    integrator_id: int,
    integrator_in: SystemIntegratorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master_user)
):
    integrator = db.query(SystemIntegrator).filter(SystemIntegrator.id == integrator_id).first()
    if not integrator:
        raise HTTPException(status_code=404, detail="Integrador não encontrado")
        
    if integrator_in.code and integrator_in.code != integrator.code:
        existing = db.query(SystemIntegrator).filter(SystemIntegrator.code == integrator_in.code).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"O código {integrator_in.code} já está em uso")
            
    update_data = integrator_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(integrator, key, value)
        
    db.commit()
    db.refresh(integrator)
    return integrator

@router.delete("/{integrator_id}")
def delete_system_integrator(
    integrator_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master_user)
):
    integrator = db.query(SystemIntegrator).filter(SystemIntegrator.id == integrator_id).first()
    if not integrator:
        raise HTTPException(status_code=404, detail="Integrador não encontrado")
        
    # Later: optionally check if it's being used by companies before deleting
    
    db.delete(integrator)
    db.commit()
    return {"message": "Integrador removido com sucesso"}


@router.post("/{integrator_id}/groups", response_model=SystemIntegratorGroupResponse)
def create_integrator_group(
    integrator_id: int,
    group_in: SystemIntegratorGroupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master_user)
):
    db_group = SystemIntegratorGroup(**group_in.model_dump(), system_integrator_id=integrator_id)
    db.add(db_group)
    db.commit()
    db.refresh(db_group)
    return db_group

@router.put("/groups/{group_id}", response_model=SystemIntegratorGroupResponse)
def update_integrator_group(
    group_id: int,
    group_in: SystemIntegratorGroupUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master_user)
):
    group = db.query(SystemIntegratorGroup).filter(SystemIntegratorGroup.id == group_id).first()
    if not group: 
        raise HTTPException(status_code=404, detail="Grupo não encontrado")
    update_data = group_in.model_dump(exclude_unset=True)
    for k, v in update_data.items(): 
        setattr(group, k, v)
    db.commit()
    db.refresh(group)
    return group

@router.delete("/groups/{group_id}")
def delete_integrator_group(
    group_id: int, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(require_master_user)
):
    group = db.query(SystemIntegratorGroup).filter(SystemIntegratorGroup.id == group_id).first()
    if not group: 
        raise HTTPException(status_code=404, detail="Grupo não encontrado")
    db.delete(group)
    db.commit()
    return {"message": "Grupo removido"}


@router.post("/groups/{group_id}/fields", response_model=SystemIntegratorFieldResponse)
def create_integrator_field(
    group_id: int,
    field_in: SystemIntegratorFieldCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master_user)
):
    db_field = SystemIntegratorField(**field_in.model_dump(), group_id=group_id)
    db.add(db_field)
    db.commit()
    db.refresh(db_field)
    return db_field

@router.put("/fields/{field_id}", response_model=SystemIntegratorFieldResponse)
def update_integrator_field(
    field_id: int,
    field_in: SystemIntegratorFieldUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master_user)
):
    field = db.query(SystemIntegratorField).filter(SystemIntegratorField.id == field_id).first()
    if not field: 
        raise HTTPException(status_code=404, detail="Campo não encontrado")
    update_data = field_in.model_dump(exclude_unset=True)
    for k, v in update_data.items(): 
        setattr(field, k, v)
    db.commit()
    db.refresh(field)
    return field

@router.delete("/fields/{field_id}")
def delete_integrator_field(
    field_id: int, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(require_master_user)
):
    field = db.query(SystemIntegratorField).filter(SystemIntegratorField.id == field_id).first()
    if not field: 
        raise HTTPException(status_code=404, detail="Campo não encontrado")
    db.delete(field)
    db.commit()
    return {"message": "Campo removido"}

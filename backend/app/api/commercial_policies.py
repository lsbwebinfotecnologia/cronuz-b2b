from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.commercial_policy import CommercialPolicy
from app.schemas.commercial_policy import CommercialPolicyCreate, CommercialPolicyResponse, CommercialPolicyUpdate

router = APIRouter()

@router.get("/commercial-policies", response_model=List[CommercialPolicyResponse])
def get_commercial_policies(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in ["MASTER", "SELLER"]:
        raise HTTPException(status_code=403, detail="Não autorizado")
        
    policies = db.query(CommercialPolicy).filter(
        CommercialPolicy.company_id == current_user.company_id
    ).offset(skip).limit(limit).all()
    
    return policies

@router.post("/commercial-policies", response_model=CommercialPolicyResponse)
def create_commercial_policy(
    policy: CommercialPolicyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in ["MASTER", "SELLER"]:
        raise HTTPException(status_code=403, detail="Não autorizado")
        
    db_policy = CommercialPolicy(
        **policy.model_dump(),
        company_id=current_user.company_id
    )
    db.add(db_policy)
    db.commit()
    db.refresh(db_policy)
    return db_policy

@router.get("/commercial-policies/{policy_id}", response_model=CommercialPolicyResponse)
def get_commercial_policy(
    policy_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    policy = db.query(CommercialPolicy).filter(
        CommercialPolicy.id == policy_id, 
        CommercialPolicy.company_id == current_user.company_id
    ).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Política não encontrada")
    return policy

@router.patch("/commercial-policies/{policy_id}", response_model=CommercialPolicyResponse)
def update_commercial_policy(
    policy_id: int,
    policy_data: CommercialPolicyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in ["MASTER", "SELLER"]:
        raise HTTPException(status_code=403, detail="Não autorizado")
        
    policy = db.query(CommercialPolicy).filter(
        CommercialPolicy.id == policy_id, 
        CommercialPolicy.company_id == current_user.company_id
    ).first()
    
    if not policy:
        raise HTTPException(status_code=404, detail="Política não encontrada")
        
    update_data = policy_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(policy, key, value)
        
    db.commit()
    db.refresh(policy)
    return policy

@router.delete("/commercial-policies/{policy_id}")
def delete_commercial_policy(
    policy_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in ["MASTER"]:
        raise HTTPException(status_code=403, detail="Somente um master pode deletar")
        
    policy = db.query(CommercialPolicy).filter(
        CommercialPolicy.id == policy_id, 
        CommercialPolicy.company_id == current_user.company_id
    ).first()
    
    if not policy:
        raise HTTPException(status_code=404, detail="Política não encontrada")
        
    db.delete(policy)
    db.commit()
    return {"message": "Deletado com sucesso"}

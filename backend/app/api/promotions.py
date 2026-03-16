from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from datetime import datetime
from zoneinfo import ZoneInfo

from app.db.session import get_db
from app.models.catalog_support import Promotion, PromotionTarget, PromotionStatus
from app.schemas.promotion import PromotionCreate, PromotionUpdate, PromotionResponse, PromotionTargetResponse
from app.core.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/promotions", tags=["promotions"])

@router.post("/", response_model=PromotionResponse, status_code=status.HTTP_201_CREATED)
def create_promotion(
    prom_in: PromotionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="User without company")
        
    # Auto logic for status
    now = datetime.now(ZoneInfo("UTC"))
    initial_status = prom_in.status
    if initial_status != PromotionStatus.INACTIVE.value:
        if prom_in.start_date > now:
            initial_status = PromotionStatus.SCHEDULED.value
        elif prom_in.start_date <= now <= prom_in.end_date:
            initial_status = PromotionStatus.ACTIVE.value
        else:
            initial_status = PromotionStatus.COMPLETED.value
            
    db_prom = Promotion(
        company_id=current_user.company_id,
        name=prom_in.name,
        description=prom_in.description,
        start_date=prom_in.start_date,
        end_date=prom_in.end_date,
        discount_type=prom_in.discount_type,
        discount_value=prom_in.discount_value,
        status=initial_status
    )
    db.add(db_prom)
    db.flush()
    
    # Add targets
    for target in prom_in.targets:
        db_target = PromotionTarget(
            promotion_id=db_prom.id,
            target_type=target.target_type,
            category_id=target.category_id,
            brand_id=target.brand_id,
            product_id=target.product_id
        )
        db.add(db_target)
        
    db.commit()
    db.refresh(db_prom)
    
    # We must explicitly query targets for Pydantic returning
    targets = db.query(PromotionTarget).filter(PromotionTarget.promotion_id == db_prom.id).all()
    resp = PromotionResponse.from_orm(db_prom)
    resp.targets = [PromotionTargetResponse.from_orm(t) for t in targets]
    return resp

@router.get("/", response_model=List[PromotionResponse])
def get_promotions(
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.company_id:
        return []
        
    query = db.query(Promotion).filter(Promotion.company_id == current_user.company_id)
    if status_filter:
        query = query.filter(Promotion.status == status_filter)
        
    promotions = query.order_by(Promotion.start_date.desc()).all()
    
    results = []
    for p in promotions:
        targets = db.query(PromotionTarget).filter(PromotionTarget.promotion_id == p.id).all()
        resp = PromotionResponse.from_orm(p)
        resp.targets = [PromotionTargetResponse.from_orm(t) for t in targets]
        results.append(resp)
        
    return results

@router.delete("/{promotion_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_promotion(
    promotion_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    prom = db.query(Promotion).filter(
        Promotion.id == promotion_id,
        Promotion.company_id == current_user.company_id
    ).first()
    
    if not prom:
        raise HTTPException(status_code=404, detail="Promotion not found")
        
    # Delete targets first
    db.query(PromotionTarget).filter(PromotionTarget.promotion_id == promotion_id).delete()
    db.delete(prom)
    db.commit()
    return None

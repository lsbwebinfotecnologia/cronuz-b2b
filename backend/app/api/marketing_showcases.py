from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional

from app.db.session import get_db
from app.models.user import User, UserRole
from app.core.dependencies import get_current_user
from app.models.marketing_showcase import MarketingShowcase, ShowcaseRuleType, ShowcaseProduct
from app.models.product import Product
from app.schemas import marketing_showcase as schemas

router = APIRouter(prefix="/marketing/showcases", tags=["marketing"])

def _ensure_free_display_order(db: Session, company_id: int, desired_order: int, exclude_id: Optional[int] = None):
    # Check if someone already has this order
    q = db.query(MarketingShowcase).filter(
        MarketingShowcase.company_id == company_id,
        MarketingShowcase.display_order == desired_order
    )
    if exclude_id:
        q = q.filter(MarketingShowcase.id != exclude_id)
        
    existing = q.first()
    if existing:
        # Find an available slot from 1 to 5
        used_orders = [s.display_order for s in db.query(MarketingShowcase).filter(MarketingShowcase.company_id == company_id).all()]
        available_order = next((i for i in range(1, 6) if i not in used_orders), None)
        
        # If no available slot (e.g. they have 5 showcases already), we just do a raw swap with the exclude_id's old order
        if available_order is None and exclude_id:
            old_showcase = db.query(MarketingShowcase).filter(MarketingShowcase.id == exclude_id).first()
            if old_showcase:
                existing.display_order = old_showcase.display_order
        elif available_order is not None:
            existing.display_order = available_order
        
        db.add(existing)

@router.post("/", response_model=schemas.MarketingShowcase)
def create_showcase(
    showcase: schemas.MarketingShowcaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER]:
        raise HTTPException(status_code=403, detail="Not authorized")

    total_showcases = db.query(MarketingShowcase).filter(MarketingShowcase.company_id == current_user.company_id).count()
    if total_showcases >= 5:
         raise HTTPException(status_code=400, detail="Limite máximo de 5 vitrines atingido.")

    if showcase.display_on_home:
        active_home = db.query(MarketingShowcase).filter(
            MarketingShowcase.company_id == current_user.company_id,
            MarketingShowcase.display_on_home == True
        ).count()
        if active_home >= 3:
             raise HTTPException(status_code=400, detail="Limite de 3 vitrines ativas na Home atingido.")

    _ensure_free_display_order(db, current_user.company_id, showcase.display_order)

    showcase_data = showcase.model_dump(exclude={"product_ids"})
    db_showcase = MarketingShowcase(**showcase_data, company_id=current_user.company_id)
    db.add(db_showcase)
    db.commit()
    db.refresh(db_showcase)

    if db_showcase.rule_type == ShowcaseRuleType.MANUAL and showcase.product_ids:
        for idx, p_id in enumerate(showcase.product_ids):
             sp = ShowcaseProduct(showcase_id=db_showcase.id, product_id=p_id, position=idx+1)
             db.add(sp)
        db.commit()
    
    return db_showcase

@router.put("/{showcase_id}", response_model=schemas.MarketingShowcase)
def update_showcase(
    showcase_id: int,
    showcase: schemas.MarketingShowcaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER]:
        raise HTTPException(status_code=403, detail="Not authorized")

    db_showcase = db.query(MarketingShowcase).filter(
        MarketingShowcase.id == showcase_id,
        MarketingShowcase.company_id == current_user.company_id
    ).first()

    if not db_showcase:
        raise HTTPException(status_code=404, detail="Vitrine não encontrada")

    if showcase.display_on_home and not db_showcase.display_on_home:
        # User is activating this one, check the limit
        active_home = db.query(MarketingShowcase).filter(
            MarketingShowcase.company_id == current_user.company_id,
            MarketingShowcase.display_on_home == True,
            MarketingShowcase.id != showcase_id
        ).count()
        if active_home >= 3:
             raise HTTPException(status_code=400, detail="Limite de 3 vitrines ativas na Home atingido.")

    # Auto swap logic
    if showcase.display_order != db_showcase.display_order:
         _ensure_free_display_order(db, current_user.company_id, showcase.display_order, db_showcase.id)

    showcase_data = showcase.model_dump(exclude={"product_ids"})
    for key, value in showcase_data.items():
        setattr(db_showcase, key, value)
    
    db.add(db_showcase)

    # Manage ShowcaseProducts
    db.query(ShowcaseProduct).filter(ShowcaseProduct.showcase_id == showcase_id).delete()
    if db_showcase.rule_type == ShowcaseRuleType.MANUAL and showcase.product_ids:
        for idx, p_id in enumerate(showcase.product_ids):
             sp = ShowcaseProduct(showcase_id=db_showcase.id, product_id=p_id, position=idx+1)
             db.add(sp)

    db.commit()
    db.refresh(db_showcase)
    return db_showcase

@router.get("/{showcase_id}", response_model=schemas.MarketingShowcase)
def get_showcase(
    showcase_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER]:
        raise HTTPException(status_code=403, detail="Not authorized")

    db_showcase = db.query(MarketingShowcase).filter(
        MarketingShowcase.id == showcase_id,
        MarketingShowcase.company_id == current_user.company_id
    ).first()

    if not db_showcase:
        raise HTTPException(status_code=404, detail="Vitrine não encontrada.")

    # Populate explicit products
    if db_showcase.rule_type == ShowcaseRuleType.MANUAL:
        sp_links = db.query(ShowcaseProduct).filter(ShowcaseProduct.showcase_id == db_showcase.id).order_by(ShowcaseProduct.position).all()
        product_ids = [sp.product_id for sp in sp_links]
        if product_ids:
            prods = db.query(Product).filter(Product.id.in_(product_ids)).all()
            prod_dict = {p.id: p for p in prods}
            db_showcase.products = [prod_dict[p_id] for p_id in product_ids if p_id in prod_dict]
    else:
        db_showcase.products = []

    return db_showcase

@router.get("/", response_model=List[schemas.MarketingShowcase])
def list_showcases(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER]:
        raise HTTPException(status_code=403, detail="Not authorized")

    return db.query(MarketingShowcase).filter(
        MarketingShowcase.company_id == current_user.company_id
    ).order_by(MarketingShowcase.display_order).all()

@router.delete("/{showcase_id}")
def delete_showcase(
    showcase_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    showcase = db.query(MarketingShowcase).filter(
        MarketingShowcase.id == showcase_id,
        MarketingShowcase.company_id == current_user.company_id
    ).first()

    if not showcase:
        raise HTTPException(status_code=404, detail="Vitrine não encontrada.")

    # Remove relationships first
    db.query(ShowcaseProduct).filter(ShowcaseProduct.showcase_id == showcase.id).delete()
    
    db.delete(showcase)
    db.commit()
    return {"message": "Vitrine removida."}

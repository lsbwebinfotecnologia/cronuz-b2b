from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.models.user import User
from app.core.dependencies import get_current_user_optional
from app.models.marketing_showcase import MarketingShowcase, ShowcaseRuleType, ShowcaseProduct
from app.models.product import Product
from app.schemas import marketing_showcase as schemas

router = APIRouter(prefix="/storefront", tags=["storefront"])

@router.get("/config")
def get_storefront_config(
    company_id: int = Query(1, description="ID da empresa"),
    db: Session = Depends(get_db)
):
    from app.models.company_settings import CompanySettings
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    
    return {
        "cover_image_base_url": settings.cover_image_base_url if settings else None
    }

@router.get("/home", response_model=List[schemas.StorefrontShowcase])
def get_storefront_home(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_optional)
):
    # Customer belongs to a company if logged in, otherwise default to Company 1
    company_id = 1
    if current_user and current_user.company_id:
         company_id = current_user.company_id

    # Fetch top 3 active showcases for this company
    showcases = db.query(MarketingShowcase).filter(
        MarketingShowcase.company_id == company_id,
        MarketingShowcase.display_on_home == True
    ).order_by(MarketingShowcase.display_order).limit(3).all()

    result = []
    
    for sc in showcases:
        showcase_data = schemas.StorefrontShowcase.model_validate(sc)
        
        # Execute Rule Engine
        products_query = db.query(Product).filter(
            Product.company_id == company_id,
            Product.status == "ACTIVE"
        )
        
        # Apply Sorting Logic if not MANUAL (Manual handles its own position)
        if sc.rule_type != ShowcaseRuleType.MANUAL:
            if hasattr(sc, 'sort_by') and sc.sort_by:
                from app.models.marketing_showcase import ShowcaseSortBy
                if sc.sort_by == ShowcaseSortBy.ALPHA_ASC:
                    products_query = products_query.order_by(Product.name.asc())
                elif sc.sort_by == ShowcaseSortBy.ALPHA_DESC:
                    products_query = products_query.order_by(Product.name.desc())
                elif sc.sort_by == ShowcaseSortBy.PRICE_ASC:
                    products_query = products_query.order_by(Product.price.asc())
                elif sc.sort_by == ShowcaseSortBy.PRICE_DESC:
                    products_query = products_query.order_by(Product.price.desc())
                elif sc.sort_by == ShowcaseSortBy.SALES_DESC:
                    products_query = products_query.order_by(Product.stock_quantity.asc()) # Proxy for most sold
            
            # Apply specific rule overrides
            if sc.rule_type == ShowcaseRuleType.RECENT:
                 # Primary sort by id desc, secondary by sort_by
                 products_query = products_query.order_by(Product.id.desc())
            elif sc.rule_type == ShowcaseRuleType.HIGH_STOCK:
                 products_query = products_query.order_by(Product.stock_quantity.desc())
            elif sc.rule_type == ShowcaseRuleType.CATEGORY and sc.reference_id:
                 products_query = products_query.filter(Product.category_id == sc.reference_id)
            elif sc.rule_type == ShowcaseRuleType.BRAND and sc.reference_id:
                 products_query = products_query.filter(Product.brand_id == sc.reference_id)
                 
            # Finalize limit
            showcase_data.products = products_query.limit(20).all()
             
        elif sc.rule_type == ShowcaseRuleType.MANUAL:
             # Fetch from bridge table
             sp_links = db.query(ShowcaseProduct).filter(ShowcaseProduct.showcase_id == sc.id).order_by(ShowcaseProduct.position).limit(20).all()
             manual_product_ids = [sp.product_id for sp in sp_links]
             
             if manual_product_ids:
                 prods = products_query.filter(Product.id.in_(manual_product_ids)).all()
                 # Sort them back based on manual position
                 prod_dict = {p.id: p for p in prods}
                 sorted_prods = [prod_dict[p_id] for p_id in manual_product_ids if p_id in prod_dict]
                 showcase_data.products = sorted_prods
             else:
                 showcase_data.products = []
        
        result.append(showcase_data)
        
    return result

@router.get("/search", response_model=dict)
def search_storefront(
    q: str = Query(..., min_length=1),
    skip: int = Query(0, ge=0),
    limit: int = Query(24, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_optional)
):
    from sqlalchemy import or_
    from app.models.catalog_support import Brand
    from app.schemas.product import ProductResponse

    company_id = 1
    if current_user and getattr(current_user, "company_id", None):
         company_id = current_user.company_id

    query = db.query(Product).outerjoin(Brand, Product.brand_id == Brand.id).filter(
        Product.company_id == company_id,
        Product.status == "ACTIVE"
    )

    search_filter = f"%{q}%"
    query = query.filter(
        or_(
            Product.name.ilike(search_filter),
            Product.ean_gtin.ilike(search_filter),
            Product.sku.ilike(search_filter),
            Product.brand.ilike(search_filter),
            Brand.name.ilike(search_filter)
        )
    )

    total = query.count()
    products = query.order_by(Product.name.asc()).offset(skip).limit(limit).all()

    return {
        "items": [ProductResponse.model_validate(p) for p in products],
        "total": total,
        "page": (skip // limit) + 1,
        "pages": (total + limit - 1) // limit
    }


from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.db.session import get_db
from app.models.product import Product
from app.models.catalog_support import StockMovement, PriceHistory
from app.schemas.product import ProductCreate, ProductUpdate, ProductResponse
from app.core.dependencies import get_current_user, get_current_user_optional
from app.models.user import User

router = APIRouter(prefix="/products", tags=["products"])

@router.post("/", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
def create_product(
    product_in: ProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="Usuário sem empresa vinculada.")
    
    existing = db.query(Product).filter(
        Product.company_id == current_user.company_id,
        Product.sku == product_in.sku
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Já existe um produto com este SKU.")

    db_product = Product(
        **product_in.dict(),
        company_id=current_user.company_id
    )
    db.add(db_product)
    db.flush() # flush to get db_product.id

    # Initial Audit Logs
    if db_product.stock_quantity > 0:
        db.add(StockMovement(
            product_id=db_product.id,
            old_quantity=0,
            new_quantity=db_product.stock_quantity,
            change_amount=db_product.stock_quantity,
            reason="Estoque Inicial",
            created_by=current_user.id
        ))
    
    db.add(PriceHistory(
        product_id=db_product.id,
        price_type="BASE",
        old_price=0.0,
        new_price=db_product.base_price,
        reason="Preço Inicial",
        created_by=current_user.id
    ))

    if db_product.promotional_price:
        db.add(PriceHistory(
            product_id=db_product.id,
            price_type="PROMOTIONAL",
            old_price=0.0,
            new_price=db_product.promotional_price,
            reason="Preço Promocional Inicial",
            created_by=current_user.id
        ))

    db.commit()
    db.refresh(db_product)
    return db_product

@router.get("/", response_model=dict)
def list_products(
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    # If the user is logged in, restrict to their company.
    # If not (public storefront), default to Company 1 or main catalog.
    target_company_id = current_user.company_id if current_user and current_user.company_id else 1
    
    query = db.query(Product).filter(Product.company_id == target_company_id)
    
    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            (Product.name.ilike(search_filter)) |
            (Product.sku.ilike(search_filter))
        )
        
    total = query.count()
    products = query.order_by(Product.name.asc()).offset(skip).limit(limit).all()
    
    return {
        "items": [ProductResponse.from_orm(p) for p in products],
        "total": total,
        "page": (skip // limit) + 1,
        "pages": (total + limit - 1) // limit
    }

@router.get("/{product_id}", response_model=ProductResponse)
def get_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.company_id == current_user.company_id
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
    return product

@router.patch("/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: int,
    product_in: ProductUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db_product = db.query(Product).filter(
        Product.id == product_id,
        Product.company_id == current_user.company_id
    ).first()
    
    if not db_product:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
        
    update_data = product_in.dict(exclude_unset=True)
    
    if "sku" in update_data and update_data["sku"] != db_product.sku:
        existing = db.query(Product).filter(
            Product.company_id == current_user.company_id,
            Product.sku == update_data["sku"]
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Já existe um produto com este SKU.")

    # Audit Stock Changes
    if "stock_quantity" in update_data and update_data["stock_quantity"] != db_product.stock_quantity:
        db.add(StockMovement(
            product_id=db_product.id,
            old_quantity=db_product.stock_quantity,
            new_quantity=update_data["stock_quantity"],
            change_amount=update_data["stock_quantity"] - db_product.stock_quantity,
            reason="Atualização Manual",
            created_by=current_user.id
        ))

    # Audit Base Price Changes
    if "base_price" in update_data and update_data["base_price"] != db_product.base_price:
        db.add(PriceHistory(
            product_id=db_product.id,
            price_type="BASE",
            old_price=db_product.base_price,
            new_price=update_data["base_price"],
            reason="Atualização Manual",
            created_by=current_user.id
        ))

    # Audit Promotional Price Changes
    if "promotional_price" in update_data and update_data["promotional_price"] != db_product.promotional_price:
        db.add(PriceHistory(
            product_id=db_product.id,
            price_type="PROMOTIONAL",
            old_price=db_product.promotional_price,
            new_price=update_data["promotional_price"],
            reason="Atualização Manual",
            created_by=current_user.id
        ))
        
    # Audit Cost Price Changes
    if "cost_price" in update_data and update_data["cost_price"] != db_product.cost_price:
        db.add(PriceHistory(
            product_id=db_product.id,
            price_type="COST",
            old_price=db_product.cost_price,
            new_price=update_data["cost_price"],
            reason="Atualização Manual",
            created_by=current_user.id
        ))

    for field, value in update_data.items():
        setattr(db_product, field, value)
        
    db.commit()
    db.refresh(db_product)
    return db_product

@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db_product = db.query(Product).filter(
        Product.id == product_id,
        Product.company_id == current_user.company_id
    ).first()
    
    if not db_product:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
        
    db.delete(db_product)
    db.commit()
    return None

@router.get("/{product_id}/history")
def get_product_history(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.company_id == current_user.company_id
    ).first()
    
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
        
    stock_logs = db.query(StockMovement).filter(
        StockMovement.product_id == product_id
    ).order_by(StockMovement.created_at.desc()).all()
    
    price_logs = db.query(PriceHistory).filter(
        PriceHistory.product_id == product_id
    ).order_by(PriceHistory.created_at.desc()).all()
    
    return {
        "stock": stock_logs,
        "prices": price_logs
    }

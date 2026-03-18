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
    source: Optional[str] = None,
    customer_id: Optional[int] = Query(None, description="Obrigatório no modo B2B para tabelas de preço"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    # If the user is logged in, restrict to their company.
    # If not (public storefront), default to Company 1 or main catalog.
    target_company_id = current_user.company_id if current_user and current_user.company_id else 1
    
    target_company_id = current_user.company_id if current_user and current_user.company_id else 1
    
    from app.models.company_settings import CompanySettings
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == target_company_id).first()
    
    # 1) If Horus is enabled, fetch EXCLUSIVELY from Horus as the Single Source of Truth
    if settings and settings.horus_enabled:
        import asyncio
        from app.integrators.horus_products import HorusProducts
        from app.models.company import Company
        from app.api.storefront import map_horus_product

        try:
            company = db.query(Company).filter(Company.id == target_company_id).first()
            if not company:
                return {"items": [], "total": 0, "page": 1, "pages": 1, "error": "Company not found."}
                
            allow_backorder = settings.allow_backorder if settings else False

            horus_client = HorusProducts(db, target_company_id)
            
            # Determine search option
            search_option = None
            term = search or ""
            if term:
                search_option = "BARRAS_ISBN" if term.isdigit() and len(term) >= 10 else "NOM_ITEM"
                
            # Determine API Mode from company settings
            api_mode = getattr(settings, "horus_api_mode", "B2B") or "B2B"
            
            if api_mode == "STANDARD":
                # Padrão: Não exige ID_GUID, usa o acervo da filial em vez de tabela do cliente
                horus_response = asyncio.run(horus_client.busca_acervo_padrao(
                    id_doc=company.document or "",
                    term=term,
                    search_option=search_option,
                    offset=skip,
                    limit=limit
                ))
            else:
                # B2B: Exige obrigatoriamente um cliente logado/selecionado com GUID
                if not customer_id:
                    return {
                        "items": [],
                        "total": 0,
                        "page": 1,
                        "pages": 1,
                        "error": "O modo B2B exige que um cliente seja selecionado antes de pesquisar produtos."
                    }
                    
                from app.models.customer import Customer
                customer = db.query(Customer).filter(Customer.id == customer_id, Customer.company_id == target_company_id).first()
                if not customer or not customer.id_guid:
                    return {
                        "items": [],
                        "total": 0,
                        "page": 1,
                        "pages": 1,
                        "error": "O cliente selecionado não possui sincronização com o Horus (ID_GUID ausente)."
                    }
                    
                horus_response = asyncio.run(horus_client.busca_acervo_b2b(
                    id_doc=company.document or "",
                    id_guid=customer.id_guid,
                    term=term,
                    search_option=search_option,
                    offset=skip,
                    limit=limit
                ))
            
            items = []
            if isinstance(horus_response, list) and len(horus_response) > 0:
                # FIX: Check if the dictionary has the key 'Falha' instead of hasattr
                if not ("Falha" in horus_response[0] or "FALHA" in horus_response[0]):
                    for h_item in horus_response:
                        mapped = map_horus_product(h_item, target_company_id, allow_backorder)
                        # PDV expects 'price' and 'stock' fields directly due to legacy mappings
                        mapped["price"] = mapped.get("promotional_price") if mapped.get("promotional_price") else mapped.get("base_price", 0.0)
                        mapped["stock"] = mapped.get("stock_quantity", 0)
                        # make sure ID doesn't collide with local DB integers on frontend iterators
                        mapped["id"] = f"horus-{mapped.get('id', 'unknown')}"
                        items.append(mapped)
                    
            asyncio.run(horus_client.close())
            return {
                "items": items,
                "total": len(items),
                "page": 1,
                "pages": 1
            }
        except Exception as e:
            print(f"Error checking Horus integration: {e}")
            return {"items": [], "total": 0, "page": 1, "pages": 1, "error": str(e)}

    # 2) Search in local database EXCLUSIVELY
    query = db.query(Product).filter(Product.company_id == target_company_id)
    
    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            (Product.name.ilike(search_filter)) |
            (Product.sku.ilike(search_filter))
        )
        
    local_total = query.count()
    local_products = query.order_by(Product.name.asc()).offset(skip).limit(limit).all()
    
    # Convert local products to dictionary matching schema
    items = []
    for p in local_products:
        item_dict = ProductResponse.from_orm(p).dict()
        item_dict["price"] = p.promotional_price if p.promotional_price else p.base_price
        item_dict["stock"] = p.stock_quantity
        items.append(item_dict)

    return {
        "items": items,
        "total": local_total,
        "page": (skip // limit) + 1,
        "pages": max(1, (local_total + limit - 1) // limit)
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

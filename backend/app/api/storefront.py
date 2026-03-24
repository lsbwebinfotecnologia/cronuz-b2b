from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.models.user import User
from app.core.dependencies import get_current_user_optional, get_current_user
from app.models.marketing_showcase import MarketingShowcase, ShowcaseRuleType, ShowcaseProduct
from app.models.product import Product
from app.schemas import marketing_showcase as schemas
from app.schemas.order import OrderResponse, OrderItemCreate, CheckoutRequest
from pydantic import BaseModel
from app.models.company_settings import CompanySettings
from app.models.order import Order, OrderItem
from app.core import security

class PasswordUpdate(BaseModel):
    current_password: str
    new_password: str
router = APIRouter(prefix="/storefront", tags=["storefront"])

def calculate_product_availability(stock_qty: int, situacao: str = None, is_pre_sale: bool = False, is_out_of_print: bool = False, allow_backorder: bool = False):
    allow_purchase = False
    status_label = "DISPONÍVEL"
    
    if situacao == 'ES' or is_out_of_print:
        allow_purchase = False
        status_label = "ESGOTADA"
    elif situacao == 'IP' or is_pre_sale:
        allow_purchase = True
        status_label = "PRÉ-VENDA"
    elif stock_qty > 0:
        allow_purchase = True
    else:
        if allow_backorder:
            allow_purchase = True
            status_label = "ENCOMENDA"
        else:
            allow_purchase = False
            status_label = "SEM ESTOQUE"
            
    return allow_purchase, status_label

def map_horus_product(item: dict, company_id: int, allow_backorder: bool) -> dict:
    vlr_capa = float(str(item.get("VLR_CAPA", "0")).replace(',', '.')) if "VLR_CAPA" in item else 0.0
    vlr_liq = float(str(item.get("VLR_LIQ_CLI", item.get("VLR_LIQ_DESCONTO_PDV", "0"))).replace(',', '.'))
    
    stock_quantity = int(item.get("SALDO_DISPONIVEL", 0))
    situacao = item.get("SITUACAO_ITEM", "")
    
    allow_purchase, status_label = calculate_product_availability(
        stock_qty=stock_quantity,
        situacao=situacao,
        is_pre_sale=False,
        is_out_of_print=False,
        allow_backorder=allow_backorder
    )
    
    return {
        "id": int(item.get("COD_ITEM", 0)),
        "company_id": company_id,
        "sku": str(item.get("COD_ITEM", "")),
        "ean_gtin": item.get("COD_BARRA_ITEM", ""),
        "name": item.get("NOM_ITEM", ""),
        "base_price": vlr_capa,
        "promotional_price": vlr_liq if vlr_liq < vlr_capa else None,
        "stock_quantity": stock_quantity,
        "status": "ACTIVE",
        "short_description": item.get("DESC_SINOPSE", ""),
        "long_description": item.get("DESC_SINOPSE", ""),
        "brand": item.get("NOM_EDITORA", ""),
        "category": {"id": 0, "name": item.get("NOM_EDITORA", ""), "company_id": company_id, "active": True},
        "weight_kg": None,
        "width_cm": None,
        "height_cm": None,
        "length_cm": None,
        "allow_purchase": allow_purchase,
        "stock_status_label": status_label,
        "created_at": None,
        "updated_at": None
    }

@router.get("/domain/{domain_name}")
def get_storefront_domain_info(
    domain_name: str,
    db: Session = Depends(get_db)
):
    from app.models.company import Company
    
    # Check custom_domain first
    company = db.query(Company).filter(
        Company.custom_domain == domain_name,
        Company.active == True
    ).first()
    
    # Fallback to internal app domain
    if not company:
        company = db.query(Company).filter(
            Company.domain == domain_name,
            Company.active == True
        ).first()
        
    if not company:
        raise HTTPException(status_code=404, detail="Domínio não encontrado")
        
    return {
        "company_id": company.id,
        "name": company.name,
        "domain": company.domain,
        "custom_domain": company.custom_domain,
        "login_background_url": company.login_background_url,
        "logo": company.logo,
        "tenant_id": company.tenant_id
    }

@router.get("/config")
def get_storefront_config(
    company_id: int = Query(1, description="ID da empresa"),
    db: Session = Depends(get_db)
):
    from app.models.company_settings import CompanySettings
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    
    return {
        "cover_image_base_url": settings.cover_image_base_url if settings else None,
        "uses_horus": settings.horus_enabled if settings else False
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

    from app.models.company_settings import CompanySettings
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    allow_backorder = settings.allow_backorder if settings else False

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
        
        # Apply availability logic to each product
        for p in showcase_data.products:
            allow, label = calculate_product_availability(p.stock_quantity, None, p.is_pre_sale, p.is_out_of_print, allow_backorder)
            setattr(p, "allow_purchase", allow)
            setattr(p, "stock_status_label", label)
            
        result.append(showcase_data)
        
    return result

async def _fetch_from_horus_storefront(
    db: Session,
    company_id: int,
    current_user: User,
    term: str,
    search_type: str,
    skip: int,
    limit: int,
    settings: CompanySettings
) -> list[dict]:
    """
    Centralized point to fetch products from Horus for the Storefront.
    """
    from fastapi import HTTPException
    from app.models.customer import Customer
    from app.models.company import Company
    
    if not current_user or current_user.type != "CUSTOMER":
        raise HTTPException(status_code=403, detail="Acesso não autorizado ao catálogo Horus.")
        
    customer = db.query(Customer).filter(Customer.document == current_user.document, Customer.company_id == company_id).first()
    company = db.query(Company).filter(Company.id == company_id).first()
    
    if not customer or not customer.id_guid or not company or not company.document:
        raise HTTPException(status_code=403, detail="Cadastro de cliente incompleto para Horus.")
        
    from app.integrators.horus_products import HorusProducts
    horus_client = HorusProducts(db, company_id)
    
    try:
        # Improved logic: only treat as ISBN if it has at least 10 digits
        if search_type == "SEARCH":
            search_option = "BARRAS_ISBN" if term.isdigit() and len(term) >= 10 else "NOM_ITEM"
        else: # PRODUCT
            search_option = "BARRAS_ISBN" if term.isdigit() and len(term) >= 10 else "COD_ITEM"
            
        horus_response = await horus_client.busca_acervo_b2b(
            id_doc=company.document,
            id_guid=customer.id_guid,
            term=term,
            search_option=search_option,
            offset=skip,
            limit=limit
        )
        
        if isinstance(horus_response, list) and len(horus_response) > 0 and hasattr(horus_response[0], "Falha"):
            return []
            
        horus_items = horus_response if isinstance(horus_response, list) else []
        
        mapped_items = []
        allow_backorder = settings.allow_backorder if settings else False
        for item in horus_items:
            mapped_item = map_horus_product(item, company_id, allow_backorder)
            mapped_items.append(mapped_item)
            
        return mapped_items
    except Exception as e:
        print(f"Horus Fetch Error: {e}")
        return []
    finally:
        await horus_client.close()


@router.get("/search", response_model=dict)
async def search_storefront(
    q: str = Query(..., min_length=1),
    skip: int = Query(0, ge=0),
    limit: int = Query(24, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_optional)
):
    from sqlalchemy import or_
    from app.models.catalog_support import Brand
    from app.models.company_settings import CompanySettings
    from app.schemas.product import ProductResponse
    from app.models.company import Company

    company_id = 1
    if current_user and getattr(current_user, "company_id", None):
         company_id = current_user.company_id

    # Check if this company has Horus enabled
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    
    if settings and settings.horus_enabled:
        try:
            mapped_items = await _fetch_from_horus_storefront(db, company_id, current_user, q, "SEARCH", skip, limit, settings)
            return {
                "items": mapped_items,
                "total": len(mapped_items),
                "page": (skip // limit) + 1,
                "pages": 1 if len(mapped_items) < limit else (skip // limit) + 2
            }
        except HTTPException:
            return {"items": [], "total": 0, "page": 1, "pages": 0}

    # Local Database Search Path
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

    allow_backorder = settings.allow_backorder if settings else False
    for p in products:
        allow, label = calculate_product_availability(p.stock_quantity, None, getattr(p, "is_pre_sale", False), getattr(p, "is_out_of_print", False), allow_backorder)
        setattr(p, "allow_purchase", allow)
        setattr(p, "stock_status_label", label)

    return {
        "items": [ProductResponse.model_validate(p) for p in products],
        "total": total,
        "page": (skip // limit) + 1,
        "pages": (total + limit - 1) // limit
    }

@router.get("/product/{id_or_isbn}", response_model=dict)
async def get_storefront_product(
    id_or_isbn: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_optional)
):
    from sqlalchemy import or_
    from app.models.catalog_support import Brand
    from app.models.company_settings import CompanySettings
    from app.schemas.product import ProductResponse
    from app.models.company import Company

    company_id = 1
    if current_user and getattr(current_user, "company_id", None):
         company_id = current_user.company_id

    # Check if this company has Horus enabled
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    
    if settings and settings.horus_enabled:
        mapped_items = await _fetch_from_horus_storefront(db, company_id, current_user, id_or_isbn, "PRODUCT", 0, 1, settings)
        if not mapped_items:
            raise HTTPException(status_code=404, detail="Produto não encontrado no Horus.")
        return mapped_items[0]

    # Local Database Search Path
    query = db.query(Product).outerjoin(Brand, Product.brand_id == Brand.id).filter(
        Product.company_id == company_id,
        Product.status == "ACTIVE"
    )

    if id_or_isbn.isdigit():
        # First try exact ID, then EAN
        query = query.filter(or_(Product.id == int(id_or_isbn), Product.ean_gtin == id_or_isbn))
    else:
        query = query.filter(Product.sku == id_or_isbn)

    product = query.first()
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
        
    allow_backorder = settings.allow_backorder if settings else False
    allow, label = calculate_product_availability(product.stock_quantity, None, getattr(product, "is_pre_sale", False), getattr(product, "is_out_of_print", False), allow_backorder)
    setattr(product, "allow_purchase", allow)
    setattr(product, "stock_status_label", label)
        
    return ProductResponse.model_validate(product).model_dump()

@router.get("/customer/me", response_model=dict)
def get_storefront_customer_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.customer import Customer
    
    if current_user.type != "CUSTOMER":
        raise HTTPException(status_code=403, detail="Apenas clientes podem acessar esta rota do storefront.")

    # We match the customer based on document or email
    customer = db.query(Customer).filter(
        Customer.company_id == current_user.company_id,
        (Customer.document == current_user.document) | (Customer.email == current_user.email)
    ).first()

    if not customer:
        raise HTTPException(status_code=404, detail="Cadastro de cliente não encontrado.")

    from app.schemas.customer import Customer as CustomerSchema
    return CustomerSchema.model_validate(customer).model_dump()


def _get_or_create_cart(db: Session, company_id: int, customer_document: str) -> Order:
    from app.models.customer import Customer
    customer = db.query(Customer).filter(
        Customer.company_id == company_id,
        Customer.document == customer_document
    ).first()
    
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente não encontrado no sistema.")
        
    order = db.query(Order).filter(
        Order.company_id == company_id,
        Order.customer_id == customer.id,
        Order.status == "NEW"
    ).first()
    
    if not order:
        order = Order(
            company_id=company_id,
            customer_id=customer.id,
            status="NEW",
            origin="store",
            subtotal=0,
            discount=0,
            total=0
        )
        db.add(order)
        db.commit()
        db.refresh(order)
        
    return order


@router.get("/cart", response_model=OrderResponse)
def get_cart(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type != "CUSTOMER":
        raise HTTPException(status_code=403, detail="Acesso restrito a clientes.")
        
    cart = _get_or_create_cart(db, current_user.company_id, current_user.document)
    return OrderResponse.model_validate(cart)


@router.post("/cart/items", response_model=OrderResponse)
def add_or_update_cart_item(
    item_data: OrderItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type != "CUSTOMER":
        raise HTTPException(status_code=403, detail="Acesso restrito a clientes.")
        
    cart = _get_or_create_cart(db, current_user.company_id, current_user.document)
    
    # Check if item already exists in cart based on ean_isbn or sku or product_id
    existing_item = None
    for item in cart.items:
        if item_data.ean_isbn and item.ean_isbn == item_data.ean_isbn:
            existing_item = item
            break
        elif item_data.sku and item.sku == item_data.sku:
            existing_item = item
            break
        elif item_data.product_id and item.product_id == item_data.product_id:
            existing_item = item
            break
            
    if existing_item:
        existing_item.quantity = item_data.quantity
        existing_item.unit_price = item_data.unit_price
        existing_item.total_price = item_data.quantity * item_data.unit_price
    else:
        # Prevent Foreign Key constraint violations if product_id is an external Horus ID
        from app.models.product import Product
        actual_product_id = None
        if item_data.product_id:
             local_prod = db.query(Product).filter(Product.id == item_data.product_id).first()
             if local_prod:
                 actual_product_id = local_prod.id

        new_item = OrderItem(
            order_id=cart.id,
            product_id=actual_product_id,
            ean_isbn=item_data.ean_isbn,
            sku=item_data.sku,
            name=item_data.name,
            brand=item_data.brand,
            quantity=item_data.quantity,
            unit_price=item_data.unit_price,
            total_price=item_data.quantity * item_data.unit_price
        )
        db.add(new_item)
        
    db.commit()
    db.refresh(cart)
    
    # Recalculate totals
    subtotal = sum(i.total_price for i in cart.items)
    cart.subtotal = subtotal
    cart.total = subtotal - cart.discount
    db.commit()
    db.refresh(cart)
    
    return OrderResponse.model_validate(cart)


@router.delete("/cart/items/{item_id}", response_model=OrderResponse)
def remove_cart_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type != "CUSTOMER":
        raise HTTPException(status_code=403, detail="Acesso restrito a clientes.")
        
    cart = _get_or_create_cart(db, current_user.company_id, current_user.document)
    
    item_to_remove = next((item for item in cart.items if item.id == item_id), None)
    
    if not item_to_remove:
        raise HTTPException(status_code=404, detail="Item não encontrado no carrinho.")
        
    db.delete(item_to_remove)
    db.commit()
    db.refresh(cart)
    
    # Recalculate totals
    subtotal = sum(i.total_price for i in cart.items)
    cart.subtotal = subtotal
    cart.total = subtotal - cart.discount
    db.commit()
    db.refresh(cart)
    
    return OrderResponse.model_validate(cart)

@router.get("/cart/validate_stock")
async def validate_cart_stock(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.company_settings import CompanySettings
    from app.models.company import Company
    from app.models.customer import Customer
    from app.models.product import Product
    from app.integrators.horus_products import HorusProducts

    cart = _get_or_create_cart(db, current_user.company_id, current_user.document)
    if not cart.items:
        return {"out_of_stock": []}

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == current_user.company_id).first()
    if not settings or not settings.horus_enabled:
        return {"out_of_stock": []}

    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    customer = db.query(Customer).filter(Customer.id == cart.customer_id).first()
    
    if not customer or not customer.id_guid:
        return {"out_of_stock": []}

    allow_backorder = settings.allow_backorder
    max_backorder_qty = settings.max_backorder_qty

    horus_products_client = HorusProducts(db, current_user.company_id)
    out_of_stock_msgs = []
    
    try:
        isbns_to_check = [{"BARRAS_ISBN": item.ean_isbn or item.sku} for item in cart.items]
        if isbns_to_check:
            stock_data = await horus_products_client.busca_acervo_b2b(
                id_doc=company.document,
                id_guid=customer.id_guid,
                isbns=isbns_to_check
            )
            
            stock_map = {}
            if stock_data and isinstance(stock_data, list):
                for prod in stock_data:
                    isbn = prod.get("BARRAS_ISBN") or prod.get("ISBN")
                    if isbn:
                        try:
                            s = float(prod.get("SALDO_DISPONIVEL", 0))
                        except (ValueError, TypeError):
                            s = 0.0
                        
                        situacao = prod.get("SITUACAO_ITEM", "")
                        stock_map[isbn] = {"saldo": s, "situacao": situacao}

            for item in cart.items:
                key = item.ean_isbn or item.sku
                local_prod = None
                if item.product_id:
                    local_prod = db.query(Product).filter(Product.id == item.product_id).first()
                
                is_oop = local_prod.is_out_of_print if local_prod else False
                is_pre = local_prod.is_pre_sale if local_prod else False

                horus_node = stock_map.get(key, {"saldo": 0, "situacao": ""})
                available = int(horus_node["saldo"])
                situacao = horus_node["situacao"]
                
                requested = item.quantity
                allowed = True
                status_label = "DISPONÍVEL"
                msg = ""

                # 1. Pre-sale
                if situacao == "IP" or is_pre:
                    status_label = "PRÉ-VENDA"
                    allowed = True
                    msg = "Item em pré-venda."
                
                # 2. Out of print -> cannot be backordered
                elif is_oop:
                    if requested > available:
                        status_label = "ESGOTADA"
                        allowed = False
                        msg = f"Item esgotado no editor/fornecedor. Saldo disponível: {available}."
                    else:
                        status_label = "DISPONÍVEL"
                        allowed = True
                
                # 3. Regular items
                else:
                    if requested <= available:
                        status_label = "DISPONÍVEL"
                        allowed = True
                    else:
                        # Missing stock context
                        if allow_backorder:
                            backorder_needed = requested - available
                            if max_backorder_qty > 0 and backorder_needed > max_backorder_qty:
                                status_label = "ERRO_LIMITE_ENCOMENDA"
                                allowed = False
                                msg = f"Limite de encomenda excedido. (Máx: {max_backorder_qty} un). Reduza a quantidade."
                            else:
                                if available > 0:
                                    status_label = f"{available} DISPONÍVEL / {backorder_needed} ENCOMENDA"
                                else:
                                    status_label = "ENCOMENDA"
                                allowed = True
                                msg = "Parte ou total do pedido será processado como encomenda."
                        else:
                            status_label = "SEM ESTOQUE"
                            allowed = False
                            msg = f"Estoque insuficiente. Saldo disponível: {available}."

                if not allowed or status_label != "DISPONÍVEL":
                    out_of_stock_msgs.append({
                        "id": getattr(item, 'id', None),
                        "product_id": item.product_id,
                        "isbn": key,
                        "name": item.name,
                        "requested": requested,
                        "available": available,
                        "label": status_label,
                        "message": msg,
                        "allowed": allowed
                    })
    except Exception as e:
        print(f"Error validating cart stock on checkout page: {e}")
    finally:
        await horus_products_client.close()

    return {"out_of_stock": out_of_stock_msgs}


@router.post("/cart/checkout", response_model=dict)
async def checkout_cart(
    payload: CheckoutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.company_settings import CompanySettings
    from app.models.company import Company
    
    if current_user.type != "CUSTOMER":
        raise HTTPException(status_code=403, detail="Acesso restrito a clientes.")
        
    cart = _get_or_create_cart(db, current_user.company_id, current_user.document)
    
    if not cart.items:
        raise HTTPException(status_code=400, detail="O carrinho está vazio.")
        
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == current_user.company_id).first()
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    
    # Send to Horus Flow
    if settings and settings.horus_enabled:
        from app.integrators.horus_orders import HorusOrders
        from app.models.customer import Customer
        
        customer = db.query(Customer).filter(Customer.id == cart.customer_id).first()
        if not customer or not customer.id_guid:
            raise HTTPException(status_code=400, detail="Cliente não sincronizado com o Horus.")
            
        horus_client = HorusOrders(db, current_user.company_id)
        
        # 0. Validate Stock Before Checkout
        from app.integrators.horus_products import HorusProducts
        horus_products_client = HorusProducts(db, current_user.company_id)
        
        try:
            isbns_to_check = [{"BARRAS_ISBN": item.ean_isbn or item.sku} for item in cart.items]
            if isbns_to_check:
                print(f"DEBUG CHECKOUT: isbns_to_check = {isbns_to_check}")
                stock_data = await horus_products_client.busca_acervo_b2b(
                    id_doc=company.document,
                    id_guid=customer.id_guid,
                    isbns=isbns_to_check
                )
                print(f"DEBUG CHECKOUT: stock_data = {stock_data}")
                
                out_of_stock_msgs = []
                if stock_data and isinstance(stock_data, list):
                    # mapping isbn to stock
                    stock_map = {}
                    for prod in stock_data:
                        isbn = prod.get("BARRAS_ISBN") or prod.get("ISBN")
                        saldo_raw = prod.get("SALDO_DISPONIVEL", 0)
                        if isbn:
                            try:
                                stock_map[isbn] = float(saldo_raw)
                            except (ValueError, TypeError):
                                stock_map[isbn] = 0.0

                    # Validate cart requirements
                    for item in cart.items:
                        key = item.ean_isbn or item.sku
                        if key in stock_map:
                            available = stock_map[key]
                            if item.quantity > available:
                                out_of_stock_msgs.append(f"[{item.name[:25]}...] Estoque insuficiente: você pediu {item.quantity}, saldo atual {int(available)}.")
                        else:
                            out_of_stock_msgs.append(f"[{item.name[:25]}...] Produto indisponível ou EAN não reconhecido no estoque atual.")
                            
                if out_of_stock_msgs:
                    await horus_products_client.close()
                    raise HTTPException(status_code=400, detail=" | ".join(out_of_stock_msgs))
        except HTTPException:
            raise
        except Exception as e:
            print(f"Error validating stock: {e}")
        finally:
            await horus_products_client.close()
        
        try:
            # 1. Start Order
            cart.type_order = payload.type_order
            
            order_res = await horus_client.send_order(
                id_doc=customer.document,
                id_guid=customer.id_guid,
                cnpj_destino=company.document,
                cod_pedido_origem=cart.id,
                type_order=cart.type_order,
                obs=f"B2B PEDIDO {cart.id}"
            )
            
            if order_res.get("error"):
                raise HTTPException(status_code=400, detail=f"Erro no Horus: {order_res.get('msg')}")
                
            horus_ped_venda = order_res.get("COD_PED_VENDA")
            
            # 2. Upload Items
            for item in cart.items:
                res_item = await horus_client.send_order_item(
                    id_doc=customer.document,
                    id_guid=customer.id_guid,
                    cnpj_destino=company.document,
                    cod_pedido_origem=cart.id,
                    isbn=item.ean_isbn or item.sku,
                    qty=item.quantity,
                    price=item.unit_price
                )
                
                if res_item and isinstance(res_item, list) and len(res_item) > 0:
                    msg = res_item[0].get("Mensagem", "")
                    if msg != "REGISTRO ENVIADO COM SUCESSO!":
                        # failure: clear items from horus to rollback the order's items
                        await horus_client.clear_order_items(
                            id_doc=customer.document,
                            id_guid=customer.id_guid,
                            cnpj_destino=company.document,
                            cod_ped_venda=horus_ped_venda
                        )
                        raise HTTPException(status_code=400, detail=f"Falha ao integrar itens no Horus: {msg}")
                
            cart.horus_pedido_venda = str(horus_ped_venda)
            cart.status = "SENT_TO_HORUS"
            db.commit()
            
            return {"status": "success", "message": "Pedido enviado para o Horus", "order_id": cart.id, "horus_id": cart.horus_pedido_venda}
            
        except HTTPException as he:
            raise he
        except Exception as e:
            print(f"Error checking out with Horus: {e}")
            raise HTTPException(status_code=500, detail=f"Erro de comunicação com o ERP: {str(e)}")
        finally:
            await horus_client.close()
            
    # Default local branch
    cart.type_order = payload.type_order
    cart.status = "PROCESSING"
    db.commit()
    
    return {"status": "success", "message": "Pedido local finalizado com sucesso", "order_id": cart.id}


@router.get("/orders", response_model=List[OrderResponse])
def get_customer_orders(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.customer import Customer
    
    if current_user.type != "CUSTOMER":
        raise HTTPException(status_code=403, detail="Acesso restrito a clientes.")
        
    customer = db.query(Customer).filter(
        Customer.company_id == current_user.company_id,
        (Customer.document == current_user.document) | (Customer.email == current_user.email)
    ).first()

    if not customer:
        return []
        
    orders = db.query(Order).filter(
        Order.company_id == current_user.company_id,
        Order.customer_id == customer.id,
        Order.status != "NEW"  # Don't show active carts
    ).order_by(Order.created_at.desc()).all()
    
    return [OrderResponse.model_validate(o) for o in orders]


@router.get("/orders/{order_id}", response_model=dict)
async def get_customer_order_detail(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.customer import Customer
    from app.models.company_settings import CompanySettings
    from app.models.company import Company
    
    if current_user.type != "CUSTOMER":
        raise HTTPException(status_code=403, detail="Acesso restrito a clientes.")
        
    order = db.query(Order).filter(
        Order.id == order_id,
        Order.company_id == current_user.company_id
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")
        
    # Sincronização em tempo real com o Horus, se ativado e se já enviado
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == current_user.company_id).first()
    
    if settings and settings.horus_enabled and order.horus_pedido_venda:
        company = db.query(Company).filter(Company.id == current_user.company_id).first()
        customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
        
        if company and customer and customer.id_guid:
            from app.integrators.horus_orders import HorusOrders
            horus_client = HorusOrders(db, current_user.company_id)
            try:
                # Poll Horus API logic
                # cod_pedido_origem in Horus is our local order.id
                horus_data = await horus_client.get_order(
                    id_doc=customer.document,
                    id_guid=customer.id_guid,
                    cnpj_destino=company.document,
                    cod_pedido_origem=order.id
                )
                
                if horus_data and isinstance(horus_data, list) and len(horus_data) > 0:
                    horus_data = horus_data[0]

                if not horus_data:
                    new_status = "CANCELLED"
                elif isinstance(horus_data, dict) and horus_data.get("Falha"):
                    new_status = order.status
                elif horus_data and isinstance(horus_data, dict):
                    status_api = horus_data.get("STATUS_PEDIDO_VENDA", "")
                    
                    status_mapping = {
                        "LEX": "DISPATCH",
                        "IMP": "DISPATCH",
                        "CON": "DISPATCH",
                        "LFT": "DISPATCH",
                        "NOV": "SENT_TO_HORUS",
                        "LAP": "SENT_TO_HORUS",
                        "FAT": "INVOICED",
                        "CAN": "CANCELLED"
                    }
                    
                    new_status = status_mapping.get(status_api, order.status)
                else:
                    new_status = order.status
                    
                changed = False
                if new_status != order.status:
                    from app.models.order_log import OrderLog
                    
                    log_entry = OrderLog(
                        order_id=order.id,
                        old_status=order.status,
                        new_status=new_status
                    )
                    db.add(log_entry)
                    order.status = new_status
                    changed = True
                    
                if horus_data and isinstance(horus_data, dict):
                    # Handle Nota Fiscal (Invoice XML)
                    nf = horus_data.get("NOTA_FISCAL")
                    if nf and isinstance(nf, dict):
                        xml_base64 = nf.get("XML_Base64")
                        if xml_base64 and order.invoice_xml != xml_base64:
                            order.invoice_xml = xml_base64
                            changed = True
                            
                if changed:
                    db.commit()
                    db.refresh(order)
                        
                # Sync Items strictly with Horus (Add, Update, Remove)
                horus_items = await horus_client.get_order_items(order.horus_pedido_venda)
                if horus_items and isinstance(horus_items, list):
                    items_changed = False
                    
                    # Track what we saw from Horus
                    h_seen_identifiers = set()
                    
                    for h_item in horus_items:
                        h_isbn = h_item.get("COD_BARRA_ITEM") or h_item.get("COD_BARRA_ITEM_ALT") or h_item.get("COD_ISBN_ITEM")
                        h_sku = str(h_item.get("COD_ITEM", ""))
                        
                        try:
                            # Horus numbers
                            h_qty_req = int(float(h_item.get("QT_PEDIDA", 0)))
                            h_qty_f = int(float(h_item.get("QTD_ATENDIDA", 0)))
                            
                            # Parse price, horus sends comma for decimals e.g "29,19"
                            h_price_str = str(h_item.get("VLR_LIQUIDO", "0")).replace(".", "").replace(",", ".")
                            h_unit_price = float(h_price_str)
                        except (ValueError, TypeError):
                            continue
                            
                        # Identify local item
                        local_match = None
                        for local_item in order.items:
                            if (h_isbn and local_item.ean_isbn == h_isbn) or (h_sku and local_item.sku == h_sku):
                                local_match = local_item
                                break
                                
                        if local_match:
                            identifier = h_isbn or h_sku
                            h_seen_identifiers.add(identifier)
                            
                            # Update existing
                            if local_match.quantity != h_qty_req or \
                               local_match.quantity_fulfilled != h_qty_f or \
                               abs(local_match.unit_price - h_unit_price) > 0.01:
                                
                                local_match.quantity = h_qty_req
                                local_match.quantity_requested = h_qty_req 
                                local_match.quantity_fulfilled = h_qty_f
                                local_match.unit_price = h_unit_price
                                local_match.total_price = h_qty_req * h_unit_price
                                items_changed = True
                        else:
                            # Item exists in Horus but not locally. Add it.
                            from app.models.order import OrderItem
                            identifier = h_isbn or h_sku
                            h_seen_identifiers.add(identifier)
                            
                            new_item = OrderItem(
                                order_id=order.id,
                                ean_isbn=h_isbn,
                                sku=h_sku,
                                name=h_item.get("NOM_ITEM", "Produto Horus"),
                                quantity=h_qty_req,
                                quantity_requested=h_qty_req,
                                quantity_fulfilled=h_qty_f,
                                unit_price=h_unit_price,
                                total_price=h_qty_req * h_unit_price
                            )
                            db.add(new_item)
                            items_changed = True
                            
                    # Remove local items not returned by Horus anymore
                    for local_item in list(order.items):
                        identifier = local_item.ean_isbn or local_item.sku
                        if identifier not in h_seen_identifiers:
                            db.delete(local_item)
                            items_changed = True
                            
                    if items_changed:
                        order.sync_status = "SYNCED"
                        # Recalculate totals
                        db.commit() # commit once so order.items is refreshed if we added/removed
                        db.refresh(order)
                        
                        new_subtotal = sum(i.total_price for i in order.items)
                        order.subtotal = new_subtotal
                        order.total = new_subtotal - (order.discount or 0)
                        
                        db.commit()
                        db.refresh(order)
            except Exception as e:
                print(f"Error syncing order {order.id} with Horus: {e}")
            finally:
                await horus_client.close()

    # Format the response manually to include our extra fields since OrderResponse doesn't have invoice_xml explicitly mapped yet in Pydantic
    order_dict = OrderResponse.model_validate(order).model_dump()
    order_dict["invoice_xml_available"] = bool(order.invoice_xml)
    order_dict["tracking_code"] = order.tracking_code
    
    return order_dict

from app.schemas.order import OrderInteractionCreate, OrderInteractionResponse
from app.models.order_interaction import OrderInteraction

@router.post("/orders/{order_id}/interactions", response_model=OrderInteractionResponse)
def add_customer_interaction(
    order_id: int,
    interaction_in: OrderInteractionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.customer import Customer
    if current_user.type != "CUSTOMER":
        raise HTTPException(status_code=403, detail="Acesso restrito.")
        
    customer = db.query(Customer).filter(
        Customer.company_id == current_user.company_id,
        (Customer.document == current_user.document) | (Customer.email == current_user.email)
    ).first()
    
    if not customer:
        raise HTTPException(status_code=403, detail="Cliente não encontrado.")
        
    order = db.query(Order).filter(
        Order.id == order_id,
        Order.company_id == current_user.company_id,
        Order.customer_id == customer.id
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")
        
    if order.status in ["INVOICED", "CANCELLED"]:
        raise HTTPException(status_code=400, detail="Não é possível interagir com pedido faturado ou cancelado.")
        
    interaction = OrderInteraction(
        order_id=order.id,
        user_type="CUSTOMER",
        user_id=current_user.id,
        customer_id=customer.id,
        message=interaction_in.message
    )
    
    db.add(interaction)
    db.commit()
    db.refresh(interaction)
    
    return interaction

@router.put("/orders/{order_id}/interactions/{interaction_id}/read", response_model=OrderInteractionResponse)
def mark_interaction_read(
    order_id: int,
    interaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.customer import Customer
    if current_user.type != "CUSTOMER":
        raise HTTPException(status_code=403, detail="Acesso restrito.")
        
    customer = db.query(Customer).filter(
        Customer.company_id == current_user.company_id,
        (Customer.document == current_user.document) | (Customer.email == current_user.email)
    ).first()
    
    if not customer:
        raise HTTPException(status_code=403, detail="Cliente não encontrado.")

    # Verify order belongs to customer
    order = db.query(Order).filter(
        Order.id == order_id,
        Order.customer_id == customer.id
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")
        
    from app.models.order_interaction import OrderInteraction
    interaction = db.query(OrderInteraction).filter(
        OrderInteraction.id == interaction_id,
        OrderInteraction.order_id == order.id
    ).first()
    
    if not interaction:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada.")
        
    from datetime import datetime, timezone
    interaction.read_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(interaction)
    
    return interaction

@router.put("/profile/password")
def update_customer_password(
    password_data: PasswordUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type != "CUSTOMER":
        raise HTTPException(status_code=403, detail="Acesso não autorizado")
        
    if not security.verify_password(password_data.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Senha atual incorreta")
        
    if len(password_data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Nova senha deve ter pelo menos 6 caracteres")
        
    current_user.password_hash = security.get_password_hash(password_data.new_password)
    db.commit()
    
    return {"message": "Senha atualizada com sucesso"}

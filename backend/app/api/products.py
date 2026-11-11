from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional

from app.db.session import get_db
from app.models.product import Product
from app.models.catalog_support import StockMovement, PriceHistory, ProductCharacteristic
from app.schemas.product import ProductCreate, ProductUpdate, ProductResponse
from app.core.dependencies import get_current_user, get_current_user_optional
from app.models.user import User

router = APIRouter(prefix="/products", tags=["products"])

@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
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

    product_data = product_in.dict()
    characteristics_data = product_data.pop("characteristics", [])

    db_product = Product(
        **product_data,
        company_id=current_user.company_id
    )
    db.add(db_product)
    db.flush() # flush to get db_product.id

    if characteristics_data:
        for char in characteristics_data:
            db.add(ProductCharacteristic(
                product_id=db_product.id,
                characteristic_id=char["characteristic_id"],
                value=char["value"]
            ))

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

@router.get("", response_model=dict)
@router.get("/", response_model=dict)
def list_products(
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=5000),
    search: Optional[str] = None,
    source: Optional[str] = None,
    customer_id: Optional[int] = Query(None, description="Obrigatório no modo B2B para tabelas de preço"),
    category_id: Optional[int] = None,
    company_id: Optional[int] = Query(None, description="Filtrar por company_id (DBM / Admin)"),
    order_by: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    # Se o usuário for master ou passar company_id explicitamente:
    target_company_id = company_id or (current_user.company_id if current_user and current_user.company_id else 1)
    
    from app.models.company_settings import CompanySettings
    from app.models.company import Company
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == target_company_id).first()
    company_obj = db.query(Company).filter(Company.id == target_company_id).first()
    b2c_active = bool(
        (getattr(company_obj, "module_b2c_storefront", False) if company_obj else False)
        or (getattr(settings, "b2c_storefront_open", False) if settings else False)
    )
    has_local_products = (
        db.query(Product.id).filter(Product.company_id == target_company_id).first() is not None
        if source == "admin"
        else False
    )

    # 1) If Horus is enabled, fetch EXCLUSIVELY from Horus as the Single Source of Truth for B2B
    # Exceto quando source for "dbm"/"local", ou na listagem administrativa ("admin") quando já existem produtos sincronizados no Cronuz (prd_product)
    if (
        settings
        and settings.horus_enabled
        and source not in ("dbm", "local")
        and not (source == "admin" and (has_local_products or b2c_active and has_local_products))
    ):
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
            term = (search or "").strip()
            if term:
                search_option = "BARRAS_ISBN" if term.isdigit() and len(term) >= 10 else "NOM_ITEM"
                
            # Determine API Mode from company settings
            api_mode = getattr(settings, "horus_api_mode", "B2B") or "B2B"
            
            if api_mode == "STANDARD" or source == "admin" or not customer_id:
                # Padrão / Admin: Não exige ID_GUID, usa o acervo da filial em vez de tabela do cliente.
                # Quando a busca inicial está vazia, envia "A" pois o endpoint Busca_Acervo do Horus exige ao menos 1 caractere.
                effective_term = term if len(term) >= 1 else "A"
                effective_opt = search_option or "NOM_ITEM"
                horus_response = asyncio.run(horus_client.busca_acervo_padrao(
                    id_doc=company.document or "",
                    term=effective_term,
                    search_option=effective_opt,
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
            
            # Regra de negócio: desconto Cronuz no B2B Horus
            # Ativo quando: modo B2B + flag horus_use_cronuz_discount=True + cliente com desconto
            use_cronuz_discount = (
                api_mode == "B2B"
                and getattr(settings, "horus_use_cronuz_discount", False)
                and customer_id is not None
            )
            customer_discount_pct = 0.0
            if use_cronuz_discount and customer_id:
                # customer já foi carregado acima (modo B2B)
                if customer and customer.discount and customer.discount > 0:
                    customer_discount_pct = float(customer.discount)

            if isinstance(horus_response, list) and len(horus_response) > 0:
                # FIX: Check if the dictionary has the key 'Falha' instead of hasattr
                if not ("Falha" in horus_response[0] or "FALHA" in horus_response[0]):
                    from app.api.upload import STATIC_DIR
                    from app.api.storefront import parse_horus_price
                    import re
                    company_cover_dir = STATIC_DIR / str(target_company_id)

                    for h_item in horus_response:
                        mapped = map_horus_product(
                            h_item, target_company_id, allow_backorder,
                            customer_discount_pct=customer_discount_pct,
                            use_cronuz_discount=use_cronuz_discount
                        )
                        # PDV expects 'price' and 'stock' fields directly due to legacy mappings
                        mapped["price"] = mapped.get("promotional_price") if mapped.get("promotional_price") else mapped.get("base_price", 0.0)
                        mapped["stock"] = mapped.get("stock_quantity", 0)
                        raw_peso = parse_horus_price(
                            str(h_item.get("PESO") or h_item.get("PESO_ITEM") or h_item.get("PESO_BRUTO") or h_item.get("PESO_LIQ") or "0")
                        )
                        if raw_peso > 15:
                            mapped["weight_kg"] = round(raw_peso / 1000.0, 3)
                        elif raw_peso > 0:
                            mapped["weight_kg"] = round(raw_peso, 3)
                        mapped["width_cm"] = parse_horus_price(str(h_item.get("LARGURA") or h_item.get("LARGURA_ITEM") or "0")) or None
                        mapped["height_cm"] = parse_horus_price(str(h_item.get("ALTURA") or h_item.get("ALTURA_ITEM") or "0")) or None
                        mapped["length_cm"] = parse_horus_price(str(h_item.get("COMPRIMENTO") or h_item.get("COMPRIMENTO_ITEM") or h_item.get("PROFUNDIDADE") or h_item.get("ESPESSURA") or "0")) or None
                        isbn_val = str(mapped.get("ean_gtin") or "").strip()
                        if isbn_val and not mapped.get("cover_url"):
                            clean_isbn = re.sub(r"[^a-zA-Z0-9_\-]", "", isbn_val)
                            if clean_isbn:
                                if (company_cover_dir / f"{clean_isbn}.jpg").exists():
                                    mapped["cover_url"] = f"/uploads/covers/{target_company_id}/{clean_isbn}.jpg"
                                elif (company_cover_dir / f"{clean_isbn}.png").exists():
                                    mapped["cover_url"] = f"/uploads/covers/{target_company_id}/{clean_isbn}.png"
                        # make sure ID doesn't collide with local DB integers on frontend iterators
                        mapped["id"] = f"horus-{mapped.get('id', 'unknown')}"
                        items.append(mapped)
                    
            asyncio.run(horus_client.close())
            if len(items) > 0:
                current_page = (skip // limit) + 1
                estimated_total = skip + len(items) + (limit if len(items) == limit else 0)
                estimated_pages = max(1, (estimated_total + limit - 1) // limit)
                return {
                    "items": items,
                    "total": estimated_total,
                    "page": current_page,
                    "pages": estimated_pages
                }
        except Exception as e:
            print(f"Error checking Horus integration: {e}")

    # 2) Search in local database EXCLUSIVELY
    query = db.query(Product).filter(Product.company_id == target_company_id)
    
    if search:
        import unicodedata
        from sqlalchemy import func, cast, String
        search_clean = search.strip()
        search_filter = f"%{search_clean}%"
        search_norm = (
            unicodedata.normalize("NFKD", search_clean)
            .encode("ASCII", "ignore")
            .decode("ASCII")
            .lower()
        )
        search_norm_filter = f"%{search_norm}%" if search_norm else search_filter
        accent_src = "áàâãäéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ"
        accent_dst = "aaaaaeeeeiiiiooooouuuucnyyaaaaaeeeeiiiiooooouuuucny"
        search_digits = "".join(ch for ch in search_clean if ch.isdigit() or ch.upper() == "X")
        digits_filter = f"%{search_digits}%" if len(search_digits) >= 4 else search_filter
        query = query.filter(
            (Product.name.ilike(search_filter)) |
            (func.translate(func.lower(Product.name), accent_src, accent_dst).like(search_norm_filter)) |
            (Product.brand.ilike(search_filter)) |
            (Product.model.ilike(search_filter)) |
            (Product.sku.ilike(search_filter)) |
            (Product.ean_gtin.ilike(search_filter)) |
            (Product.ean_gtin.ilike(digits_filter)) |
            (Product.additional_isbns.ilike(search_filter)) |
            (Product.additional_isbns.ilike(digits_filter)) |
            (Product.barcode.ilike(search_filter)) |
            (Product.cod_dbm.ilike(search_filter)) |
            (Product.publisher_code.ilike(search_filter)) |
            (cast(Product.horus_cod_item, String).ilike(search_filter))
        )
        
    if category_id:
        query = query.filter(Product.category_id == category_id)
        
    local_total = query.count()
    
    if order_by == 'name':
        query = query.order_by(Product.name.asc())
    elif order_by == 'name_desc':
        query = query.order_by(Product.name.desc())
    elif order_by == 'sku':
        query = query.order_by(Product.sku.asc())
    elif order_by == 'sku_desc':
        query = query.order_by(Product.sku.desc())
    elif order_by == 'price':
        query = query.order_by(Product.promotional_price.asc().nulls_last(), Product.base_price.asc())
    elif order_by == 'price_desc':
        query = query.order_by(Product.promotional_price.desc().nulls_last(), Product.base_price.desc())
    else:
        query = query.order_by(Product.id.desc())

    local_products = query.options(
        joinedload(Product.brand_rel),
        joinedload(Product.category)
    ).offset(skip).limit(limit).all()
    
    # Convert local products to dictionary matching schema
    from app.api.upload import STATIC_DIR
    import re
    company_cover_dir = STATIC_DIR / str(target_company_id)

    items = []
    for p in local_products:
        item_dict = ProductResponse.from_orm(p).dict()
        item_dict["price"] = p.promotional_price if p.promotional_price else p.base_price
        item_dict["stock"] = p.stock_quantity
        if not item_dict.get("cover_url") and p.ean_gtin:
            clean_isbn = re.sub(r"[^a-zA-Z0-9_\-]", "", p.ean_gtin.strip())
            if clean_isbn:
                if (company_cover_dir / f"{clean_isbn}.jpg").exists():
                    item_dict["cover_url"] = f"/uploads/covers/{target_company_id}/{clean_isbn}.jpg"
                elif (company_cover_dir / f"{clean_isbn}.png").exists():
                    item_dict["cover_url"] = f"/uploads/covers/{target_company_id}/{clean_isbn}.png"
        if p.brand_rel and p.brand_rel.name:
            item_dict["brand"] = p.brand_rel.name
        elif not item_dict.get("brand"):
            item_dict["brand"] = p.brand or ""
        if p.category and p.category.name:
            item_dict["category_name"] = p.category.name
        elif p.subject:
            item_dict["category_name"] = p.subject
        items.append(item_dict)

    return {
        "items": items,
        "total": local_total,
        "page": (skip // limit) + 1,
        "pages": max(1, (local_total + limit - 1) // limit)
    }

def _resolve_or_import_product(db: Session, company_id: int, product_id_str: str) -> Optional[Product]:
    """
    Resolve um produto na tabela prd_product tanto por ID numérico quanto por referência
    do Horus ('horus-1', 'horus-3', etc.). Caso o item venha da listagem do Horus e ainda
    não exista na tabela prd_product do Cronuz, busca os dados no Horus ERP e grava na
    tabela prd_product automaticamente para permitir edição de descrição, dimensões,
    características e upload/coleta de capa sem redundância.
    """
    import re
    from app.api.upload import STATIC_DIR
    company_cover_dir = STATIC_DIR / str(company_id)

    raw_id = str(product_id_str or "").strip()
    if not raw_id:
        return None

    product: Optional[Product] = None

    if raw_id.isdigit():
        pid = int(raw_id)
        product = db.query(Product).filter(
            Product.id == pid,
            Product.company_id == company_id
        ).first()
    elif raw_id.lower().startswith("horus-"):
        cod_str = raw_id[6:].strip()
        if cod_str.isdigit():
            cod_int = int(cod_str)
            product = db.query(Product).filter(
                Product.company_id == company_id,
                (Product.horus_cod_item == cod_int) | (Product.sku == cod_str) | (Product.ean_gtin == cod_str)
            ).first()
        else:
            product = db.query(Product).filter(
                Product.company_id == company_id,
                (Product.sku == cod_str) | (Product.ean_gtin == cod_str)
            ).first()

        if not product and cod_str:
            # Import on-demand from Horus ERP into prd_product
            try:
                import asyncio
                from app.integrators.horus_products import HorusProducts
                from app.models.company import Company
                from app.models.company_settings import CompanySettings
                from app.models.catalog_support import Category, Brand
                from app.api.storefront import parse_horus_price

                company = db.query(Company).filter(Company.id == company_id).first()
                settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
                if company and settings and settings.horus_enabled:
                    horus_client = HorusProducts(db, company_id)
                    search_opt = "COD_ITEM" if (cod_str.isdigit() and len(cod_str) < 10) else "BARRAS_ISBN"
                    h_res = asyncio.run(horus_client.busca_acervo_padrao(
                        id_doc=company.document or "",
                        term=cod_str,
                        search_option=search_opt,
                        offset=0,
                        limit=10
                    ))
                    asyncio.run(horus_client.close())

                    matched_item = None
                    if isinstance(h_res, list) and len(h_res) > 0 and not ("Falha" in h_res[0] or "FALHA" in h_res[0]):
                        for cand in h_res:
                            c_cod = str(cand.get("COD_ITEM") or "").strip()
                            c_isbn = str(cand.get("BARRAS_ISBN") or cand.get("COD_BARRA_ITEM") or "").strip()
                            if c_cod == cod_str or c_isbn == cod_str:
                                matched_item = cand
                                break
                        if not matched_item:
                            matched_item = h_res[0]

                    if matched_item:
                        raw_cod = matched_item.get("COD_ITEM")
                        cod_item = int(raw_cod) if str(raw_cod or "").strip().isdigit() else 0
                        isbn = str(
                            matched_item.get("BARRAS_ISBN")
                            or matched_item.get("COD_BARRA_ITEM")
                            or matched_item.get("COD_ISBN_ITEM")
                            or matched_item.get("ISBN")
                            or ""
                        ).strip()
                        sku = str(cod_item if cod_item > 0 else (isbn or cod_str)).strip()
                        name = str(matched_item.get("NOM_ITEM") or matched_item.get("DESCRICAO") or f"Produto {sku}").strip()
                        synopsis = str(
                            matched_item.get("DESC_SINOPSE")
                            or matched_item.get("SINOPSE")
                            or matched_item.get("OBS_ITEM")
                            or ""
                        ).strip()
                        author = str(matched_item.get("NOM_AUTOR") or matched_item.get("AUTOR") or "").strip()
                        publisher = str(matched_item.get("NOM_EDITORA") or matched_item.get("NOM_FANTASIA") or "").strip()
                        genre = str(
                            matched_item.get("GENERO_NIVEL_1")
                            or matched_item.get("DSC_GENERO")
                            or matched_item.get("NOM_GENERO")
                            or ""
                        ).strip()

                        vlr_capa = parse_horus_price(
                            str(matched_item.get("VLR_CAPA") or matched_item.get("PRECO") or matched_item.get("VLR_PRECO") or "0")
                        )
                        vlr_liq = parse_horus_price(
                            str(matched_item.get("VLR_LIQ_CLI") or matched_item.get("VLR_LIQ_DESCONTO_PDV") or "0")
                        )
                        base_price = vlr_capa if vlr_capa > 0 else vlr_liq
                        promo_price = vlr_liq if (0 < vlr_liq < base_price) else None

                        try:
                            stock_qty = max(
                                0,
                                int(float(str(matched_item.get("SALDO_DISPONIVEL", matched_item.get("SALDO", 0)) or 0).replace(",", "."))),
                            )
                        except Exception:
                            stock_qty = 0

                        raw_peso = parse_horus_price(
                            str(
                                matched_item.get("PESO")
                                or matched_item.get("PESO_ITEM")
                                or matched_item.get("PESO_BRUTO")
                                or matched_item.get("PESO_LIQ")
                                or "0"
                            )
                        )
                        default_weight = float(getattr(settings, "b2c_default_item_weight_kg", 0.35) or 0.35)
                        if raw_peso > 15:
                            weight_kg = round(raw_peso / 1000.0, 3)
                        elif raw_peso > 0:
                            weight_kg = round(raw_peso, 3)
                        else:
                            weight_kg = default_weight

                        width_cm = parse_horus_price(str(matched_item.get("LARGURA") or matched_item.get("LARGURA_ITEM") or "0")) or None
                        height_cm = parse_horus_price(str(matched_item.get("ALTURA") or matched_item.get("ALTURA_ITEM") or "0")) or None
                        length_cm = parse_horus_price(str(matched_item.get("COMPRIMENTO") or matched_item.get("COMPRIMENTO_ITEM") or matched_item.get("PROFUNDIDADE") or matched_item.get("ESPESSURA") or "0")) or None

                        cat_id = None
                        if genre:
                            cat_obj = db.query(Category).filter(Category.company_id == company_id, Category.name.ilike(genre[:150])).first()
                            if not cat_obj:
                                cat_obj = Category(company_id=company_id, name=genre[:150])
                                db.add(cat_obj)
                                db.flush()
                            cat_id = cat_obj.id

                        brand_id = None
                        if publisher:
                            brand_obj = db.query(Brand).filter(Brand.company_id == company_id, Brand.name.ilike(publisher[:100])).first()
                            if not brand_obj:
                                brand_obj = Brand(company_id=company_id, name=publisher[:100])
                                db.add(brand_obj)
                                db.flush()
                            brand_id = brand_obj.id

                        clean_isbn_file = re.sub(r"[^a-zA-Z0-9_\-]", "", isbn)
                        local_cover_url = None
                        if clean_isbn_file:
                            if (company_cover_dir / f"{clean_isbn_file}.jpg").exists():
                                local_cover_url = f"/uploads/covers/{company_id}/{clean_isbn_file}.jpg"
                            elif (company_cover_dir / f"{clean_isbn_file}.png").exists():
                                local_cover_url = f"/uploads/covers/{company_id}/{clean_isbn_file}.png"

                        product = Product(
                            company_id=company_id,
                            sku=sku,
                            name=name[:255],
                            short_description=synopsis[:400] if synopsis else None,
                            long_description=synopsis if synopsis else None,
                            base_price=base_price,
                            promotional_price=promo_price,
                            weight_kg=weight_kg,
                            width_cm=width_cm,
                            height_cm=height_cm,
                            length_cm=length_cm,
                            brand=publisher[:100] if publisher else None,
                            model=author[:100] if author else None,
                            ean_gtin=isbn[:50] if isbn else None,
                            category_id=cat_id,
                            brand_id=brand_id,
                            status="ACTIVE",
                            stock_quantity=stock_qty,
                            allow_purchase=stock_qty > 0,
                            stock_status_label="DISPONÍVEL" if stock_qty > 0 else "SEM ESTOQUE",
                            cover_url=local_cover_url,
                            horus_cod_item=cod_item if cod_item > 0 else None,
                            subject=genre[:150] if genre else None,
                        )
                        db.add(product)
                        db.commit()
                        db.refresh(product)
            except Exception as e:
                print(f"[Products] Erro ao importar produto {raw_id} sob demanda do Horus: {e}")

    if product and not product.cover_url and product.ean_gtin:
        clean_isbn = re.sub(r"[^a-zA-Z0-9_\-]", "", product.ean_gtin.strip())
        if clean_isbn:
            if (company_cover_dir / f"{clean_isbn}.jpg").exists():
                product.cover_url = f"/uploads/covers/{company_id}/{clean_isbn}.jpg"
            elif (company_cover_dir / f"{clean_isbn}.png").exists():
                product.cover_url = f"/uploads/covers/{company_id}/{clean_isbn}.png"

    return product


@router.get("/{product_id}", response_model=ProductResponse)
def get_product(
    product_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    product = _resolve_or_import_product(db, current_user.company_id, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
    return product

@router.put("/{product_id}", response_model=ProductResponse)
@router.patch("/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: str,
    product_in: ProductUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db_product = _resolve_or_import_product(db, current_user.company_id, product_id)
    
    if not db_product:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
        
    update_data = product_in.dict(exclude_unset=True)
    characteristics_data = update_data.pop("characteristics", None)
    
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
        
    if characteristics_data is not None:
        db.query(ProductCharacteristic).filter(ProductCharacteristic.product_id == db_product.id).delete()
        for char in characteristics_data:
            db.add(ProductCharacteristic(
                product_id=db_product.id,
                characteristic_id=char["characteristic_id"],
                value=char["value"]
            ))

    db.commit()
    db.refresh(db_product)
    return db_product

@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    product_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db_product = _resolve_or_import_product(db, current_user.company_id, product_id)
    
    if not db_product:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
        
    db.delete(db_product)
    db.commit()
    return None

@router.get("/{product_id}/history")
def get_product_history(
    product_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    product = _resolve_or_import_product(db, current_user.company_id, product_id)
    
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
        
    stock_logs = db.query(StockMovement).filter(
        StockMovement.product_id == product.id
    ).order_by(StockMovement.created_at.desc()).all()
    
    price_logs = db.query(PriceHistory).filter(
        PriceHistory.product_id == product.id
    ).order_by(PriceHistory.created_at.desc()).all()
    
    return {
        "stock": stock_logs,
        "prices": price_logs
    }

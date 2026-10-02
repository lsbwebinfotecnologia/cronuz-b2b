import asyncio
import logging
from typing import List, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app.db.session import get_db
from app.models.user import User, UserRole
from app.core.dependencies import get_current_user
from app.models.dynamic_showcase import DynamicShowcase, DynamicShowcaseItem
from app.models.product import Product, ProductStatus
from app.models.catalog_support import Category, Brand
from app.models.company_settings import CompanySettings
from app.schemas import dynamic_showcase as schemas
from app.core.utils import parse_horus_price

logger = logging.getLogger("cronuz.dynamic_showcases")
router = APIRouter(prefix="/marketing/dynamic-showcases", tags=["dynamic-showcases"])

def _build_cover_url(base_url: Optional[str], isbn: Optional[str]) -> Optional[str]:
    if not base_url or not isbn:
        return None
    base = base_url.rstrip("/")
    return f"{base}/{isbn}.jpg"

@router.post("/", response_model=schemas.DynamicShowcaseResponse)
def create_dynamic_showcase(
    showcase: schemas.DynamicShowcaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER]:
        raise HTTPException(status_code=403, detail="Não autorizado")

    source = showcase.search_source.upper()
    if source not in ["CRONUZ", "HORUS_API"]:
        source = "CRONUZ"

    db_showcase = DynamicShowcase(
        company_id=current_user.company_id,
        title=showcase.title.strip(),
        description=showcase.description,
        search_source=source,
        active=showcase.active,
        display_order=showcase.display_order,
        banner_url=showcase.banner_url,
        banner_mobile_url=showcase.banner_mobile_url,
        logo_url=showcase.logo_url,
        start_date=showcase.start_date,
        end_date=showcase.end_date
    )
    db.add(db_showcase)
    db.commit()
    db.refresh(db_showcase)
    
    res = schemas.DynamicShowcaseResponse.model_validate(db_showcase)
    res.items_count = 0
    res.is_currently_active = db_showcase.is_currently_active
    return res

@router.get("/", response_model=List[schemas.DynamicShowcaseResponse])
def list_dynamic_showcases(
    only_active: Optional[bool] = Query(None, description="Se True, filtra apenas vitrines atualmente ativas dentro do prazo"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER]:
        raise HTTPException(status_code=403, detail="Não autorizado")

    query = db.query(DynamicShowcase).filter(
        DynamicShowcase.company_id == current_user.company_id
    )

    if only_active:
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        query = query.filter(
            DynamicShowcase.active == True,
            or_(DynamicShowcase.start_date.is_(None), DynamicShowcase.start_date <= now),
            or_(DynamicShowcase.end_date.is_(None), DynamicShowcase.end_date >= now)
        )

    showcases = query.order_by(DynamicShowcase.display_order.asc(), DynamicShowcase.id.desc()).all()

    # Pre-count items
    showcase_ids = [s.id for s in showcases]
    counts_map = {}
    if showcase_ids:
        counts = db.query(
            DynamicShowcaseItem.showcase_id,
            func.count(DynamicShowcaseItem.id)
        ).filter(
            DynamicShowcaseItem.showcase_id.in_(showcase_ids)
        ).group_by(DynamicShowcaseItem.showcase_id).all()
        counts_map = dict(counts)

    result = []
    for s in showcases:
        resp = schemas.DynamicShowcaseResponse.model_validate(s)
        resp.items_count = counts_map.get(s.id, 0)
        resp.is_currently_active = s.is_currently_active
        result.append(resp)

    return result

@router.get("/{showcase_id}", response_model=schemas.DynamicShowcaseDetailResponse)
def get_dynamic_showcase(
    showcase_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER]:
        raise HTTPException(status_code=403, detail="Não autorizado")

    showcase = db.query(DynamicShowcase).filter(
        DynamicShowcase.id == showcase_id,
        DynamicShowcase.company_id == current_user.company_id
    ).first()

    if not showcase:
        raise HTTPException(status_code=404, detail="Vitrine não encontrada")

    resp = schemas.DynamicShowcaseDetailResponse.model_validate(showcase)
    resp.items_count = len(showcase.items)
    resp.is_currently_active = showcase.is_currently_active
    return resp

@router.put("/{showcase_id}", response_model=schemas.DynamicShowcaseResponse)
def update_dynamic_showcase(
    showcase_id: int,
    data: schemas.DynamicShowcaseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER]:
        raise HTTPException(status_code=403, detail="Não autorizado")

    showcase = db.query(DynamicShowcase).filter(
        DynamicShowcase.id == showcase_id,
        DynamicShowcase.company_id == current_user.company_id
    ).first()

    if not showcase:
        raise HTTPException(status_code=404, detail="Vitrine não encontrada")

    if data.title is not None:
        showcase.title = data.title.strip()
    if data.description is not None:
        showcase.description = data.description
    if data.search_source is not None:
        showcase.search_source = data.search_source.upper()
    if data.active is not None:
        showcase.active = data.active
    if data.display_order is not None:
        showcase.display_order = data.display_order
    if data.banner_url is not None:
        showcase.banner_url = data.banner_url
    if data.banner_mobile_url is not None:
        showcase.banner_mobile_url = data.banner_mobile_url
    if data.logo_url is not None:
        showcase.logo_url = data.logo_url
    if "start_date" in data.model_fields_set:
        showcase.start_date = data.start_date
    if "end_date" in data.model_fields_set:
        showcase.end_date = data.end_date

    db.commit()
    db.refresh(showcase)

    count = db.query(DynamicShowcaseItem).filter(DynamicShowcaseItem.showcase_id == showcase.id).count()
    resp = schemas.DynamicShowcaseResponse.model_validate(showcase)
    resp.items_count = count
    resp.is_currently_active = showcase.is_currently_active
    return resp

@router.delete("/{showcase_id}")
def delete_dynamic_showcase(
    showcase_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER]:
        raise HTTPException(status_code=403, detail="Não autorizado")

    showcase = db.query(DynamicShowcase).filter(
        DynamicShowcase.id == showcase_id,
        DynamicShowcase.company_id == current_user.company_id
    ).first()

    if not showcase:
        raise HTTPException(status_code=404, detail="Vitrine não encontrada")

    db.delete(showcase)
    db.commit()
    return {"message": "Vitrine excluída com sucesso"}

@router.get("/{showcase_id}/search")
def search_items_for_showcase(
    showcase_id: int,
    q: str = Query("", description="Termo de busca (nome, ISBN ou código)"),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER]:
        raise HTTPException(status_code=403, detail="Não autorizado")

    showcase = db.query(DynamicShowcase).filter(
        DynamicShowcase.id == showcase_id,
        DynamicShowcase.company_id == current_user.company_id
    ).first()

    if not showcase:
        raise HTTPException(status_code=404, detail="Vitrine não encontrada")

    company_id = current_user.company_id
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    cover_base = settings.cover_image_base_url if settings else None

    # Get set of already added product IDs and ISBNs in this showcase
    added_links = db.query(DynamicShowcaseItem).filter(DynamicShowcaseItem.showcase_id == showcase.id).all()
    added_prod_ids = {item.product_id for item in added_links}
    
    # Produtos já na vitrine (para checar por ISBN e Código)
    added_products = db.query(Product).filter(Product.id.in_(added_prod_ids)).all() if added_prod_ids else []
    added_isbns = {p.ean_gtin.strip() for p in added_products if p.ean_gtin}
    added_cods = {p.horus_cod_item for p in added_products if p.horus_cod_item}

    # Also map existing local products by ean_gtin or horus_cod_item to link them easily
    local_prods = db.query(Product).filter(Product.company_id == company_id).all()
    local_by_ean = {p.ean_gtin.strip(): p for p in local_prods if p.ean_gtin}
    local_by_cod = {p.horus_cod_item: p for p in local_prods if p.horus_cod_item}

    query_term = (q or "").strip()

    # 1) Search Source: CRONUZ (banco local)
    if showcase.search_source == "CRONUZ":
        query = db.query(Product).filter(Product.company_id == company_id)
        if query_term:
            query = query.filter(
                or_(
                    Product.name.ilike(f"%{query_term}%"),
                    Product.ean_gtin.ilike(f"%{query_term}%"),
                    Product.sku.ilike(f"%{query_term}%"),
                    Product.brand.ilike(f"%{query_term}%")
                )
            )
        total = query.count()
        products = query.order_by(Product.name.asc()).offset(offset).limit(limit).all()

        results = []
        for p in products:
            cover = p.cover_url or _build_cover_url(cover_base, p.ean_gtin)
            is_in_showcase = (
                p.id in added_prod_ids or 
                (p.ean_gtin and p.ean_gtin.strip() in added_isbns) or
                (p.horus_cod_item and p.horus_cod_item in added_cods)
            )

            results.append({
                "source": "CRONUZ",
                "product_id": p.id,
                "horus_cod_item": p.horus_cod_item,
                "title": p.name,
                "isbn": p.ean_gtin,
                "sku": p.sku,
                "publisher": p.brand,
                "category_name": p.category.name if p.category else None,
                "base_price": p.base_price,
                "promotional_price": p.promotional_price,
                "stock_quantity": p.stock_quantity,
                "cover_url": cover,
                "already_added": is_in_showcase
            })
        return {"source": "CRONUZ", "total": total, "items": results}

    # 2) Search Source: HORUS_API (busca direto da API do Horus ERP)
    else:
        if not settings or not settings.horus_enabled:
            return {
                "source": "HORUS_API",
                "total": 0,
                "items": [],
                "warning": "A integração com o Horus ERP não está habilitada para esta empresa."
            }

        from app.integrators.horus_product_search import HorusProductSearch
        try:
            horus_searcher = HorusProductSearch(db, company_id)
            
            # Escolhe parâmetro apropriado de busca
            if query_term.isdigit() and len(query_term) >= 10:
                search_option = "BARRAS_ISBN"
            elif query_term.isdigit():
                search_option = "COD_ITEM"
            else:
                search_option = "NOME"

            raw_resp = asyncio.run(horus_searcher.busca_acervo(
                term=query_term,
                search_option=search_option,
                offset=offset,
                limit=limit
            ))
            
            # Resposta do Horus pode ser lista ou dicionário com lista
            horus_items = []
            if isinstance(raw_resp, list):
                horus_items = raw_resp
            elif isinstance(raw_resp, dict):
                horus_items = raw_resp.get("item", raw_resp.get("itens", raw_resp.get("Acervo", [])))
                if isinstance(horus_items, dict):
                    horus_items = [horus_items]

            results = []
            for item in horus_items:
                if not isinstance(item, dict):
                    continue
                
                cod_item = int(item.get("COD_ITEM") or 0)
                isbn = str(item.get("BARRAS_ISBN") or item.get("COD_BARRA_ITEM") or item.get("ISBN") or "").strip()
                title = str(item.get("NOM_ITEM") or item.get("DESCRICAO") or "").strip()
                publisher = str(item.get("NOM_EDITORA") or "").strip()
                category_name = str(item.get("GENERO_NIVEL_1") or item.get("DSC_GENERO") or "").strip()
                synopsis = str(item.get("DESC_SINOPSE") or "").strip()
                
                vlr_capa = parse_horus_price(item.get("VLR_CAPA", "0"))
                vlr_liq = parse_horus_price(item.get("VLR_LIQ_CLI", item.get("VLR_LIQ_DESCONTO_PDV", item.get("PRECO_VENDA", "0"))))
                stock_qty = int(item.get("SALDO_DISPONIVEL", item.get("SALDO", 0)))

                cover = _build_cover_url(cover_base, isbn)

                # Checa se já existe no Cronuz
                existing_prod = None
                if isbn and isbn in local_by_ean:
                    existing_prod = local_by_ean[isbn]
                elif cod_item and cod_item in local_by_cod:
                    existing_prod = local_by_cod[cod_item]

                already_added = False
                if existing_prod and existing_prod.id in added_prod_ids:
                    already_added = True
                elif isbn and isbn in added_isbns:
                    already_added = True
                elif cod_item and cod_item in added_cods:
                    already_added = True

                results.append({
                    "source": "HORUS_API",
                    "product_id": existing_prod.id if existing_prod else None,
                    "exists_in_cronuz": existing_prod is not None,
                    "horus_cod_item": cod_item,
                    "title": title,
                    "isbn": isbn,
                    "publisher": publisher,
                    "category_name": category_name,
                    "description": synopsis,
                    "base_price": vlr_capa or vlr_liq,
                    "promotional_price": vlr_liq if (vlr_liq and vlr_capa and vlr_liq < vlr_capa) else None,
                    "stock_quantity": stock_qty,
                    "cover_url": cover,
                    "already_added": already_added
                })

            return {"source": "HORUS_API", "total": len(results), "items": results}

        except Exception as e:
            logger.error(f"Erro na busca Horus ERP: {e}")
            return {
                "source": "HORUS_API",
                "total": 0,
                "items": [],
                "error": f"Falha ao consultar acervo no Horus ERP: {str(e)}"
            }

@router.post("/{showcase_id}/items")
def add_item_to_showcase(
    showcase_id: int,
    item_in: schemas.AddItemRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER]:
        raise HTTPException(status_code=403, detail="Não autorizado")

    showcase = db.query(DynamicShowcase).filter(
        DynamicShowcase.id == showcase_id,
        DynamicShowcase.company_id == current_user.company_id
    ).first()

    if not showcase:
        raise HTTPException(status_code=404, detail="Vitrine não encontrada")

    company_id = current_user.company_id
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    cover_base = settings.cover_image_base_url if settings else None

    product: Optional[Product] = None

    # 1) Caso o produto já exista no Cronuz por product_id
    if item_in.product_id:
        product = db.query(Product).filter(
            Product.id == item_in.product_id,
            Product.company_id == company_id
        ).first()

    # 2) Se não achou por product_id, busca por ISBN ou horus_cod_item
    if not product and item_in.isbn:
        product = db.query(Product).filter(
            Product.company_id == company_id,
            Product.ean_gtin == item_in.isbn.strip()
        ).first()

    if not product and item_in.horus_cod_item:
        product = db.query(Product).filter(
            Product.company_id == company_id,
            Product.horus_cod_item == item_in.horus_cod_item
        ).first()

    # 3) Se AINDA NÃO existir no Cronuz, CADASTRAR AUTOMATICAMENTE!
    if not product:
        if not item_in.title:
            raise HTTPException(status_code=400, detail="Título do produto é obrigatório para cadastro.")

        # Categoria / Gênero
        cat_id = None
        if item_in.category_name:
            c_name = item_in.category_name.strip()
            cat = db.query(Category).filter(Category.company_id == company_id, Category.name.ilike(c_name)).first()
            if not cat:
                cat = Category(company_id=company_id, name=c_name)
                db.add(cat)
                db.flush()
            cat_id = cat.id

        # Marca / Editora
        brand_id = None
        if item_in.publisher:
            b_name = item_in.publisher.strip()
            b = db.query(Brand).filter(Brand.company_id == company_id, Brand.name.ilike(b_name)).first()
            if not b:
                b = Brand(company_id=company_id, name=b_name)
                db.add(b)
                db.flush()
            brand_id = b.id

        isbn_clean = (item_in.isbn or "").strip()
        cod_clean = item_in.horus_cod_item or (isbn_clean if isbn_clean else None)
        cover = item_in.cover_url or _build_cover_url(cover_base, isbn_clean)

        product = Product(
            company_id=company_id,
            sku=str(cod_clean or f"HORUS-{isbn_clean or '0'}"),
            name=item_in.title.strip(),
            short_description=item_in.description,
            long_description=item_in.description,
            base_price=item_in.base_price or 0.0,
            promotional_price=item_in.promotional_price,
            brand=item_in.publisher,
            ean_gtin=isbn_clean if isbn_clean else None,
            category_id=cat_id,
            brand_id=brand_id,
            status=ProductStatus.ACTIVE.value,
            stock_quantity=item_in.stock_quantity or 0,
            cover_url=cover,
            horus_cod_item=item_in.horus_cod_item
        )
        db.add(product)
        db.flush()
        logger.info(f"Produto auto-cadastrado no Cronuz: id={product.id}, isbn={isbn_clean}, title={product.name}")

    # 4) Verificar se já está vinculado à vitrine (por product_id ou por ISBN duplicado)
    existing_item = db.query(DynamicShowcaseItem).filter(
        DynamicShowcaseItem.showcase_id == showcase.id,
        DynamicShowcaseItem.product_id == product.id
    ).first()

    if existing_item:
        raise HTTPException(status_code=400, detail="Este produto já está incluído nesta vitrine.")

    # Proteção adicional mandatória: verificar se outro produto com o mesmo ISBN já está na vitrine
    if product.ean_gtin:
        duplicate_isbn_item = (
            db.query(DynamicShowcaseItem)
            .join(Product, Product.id == DynamicShowcaseItem.product_id)
            .filter(
                DynamicShowcaseItem.showcase_id == showcase.id,
                Product.company_id == company_id,
                Product.ean_gtin == product.ean_gtin.strip()
            )
            .first()
        )
        if duplicate_isbn_item:
            raise HTTPException(
                status_code=400,
                detail=f"Já existe um produto com o ISBN {product.ean_gtin} vinculado a esta vitrine."
            )

    # Próxima posição
    max_pos = db.query(func.max(DynamicShowcaseItem.position)).filter(
        DynamicShowcaseItem.showcase_id == showcase.id
    ).scalar() or 0

    showcase_item = DynamicShowcaseItem(
        showcase_id=showcase.id,
        product_id=product.id,
        position=max_pos + 1
    )
    db.add(showcase_item)
    db.commit()
    db.refresh(showcase_item)

    return {
        "message": "Produto adicionado à vitrine com sucesso.",
        "item_id": showcase_item.id,
        "product_id": product.id,
        "product_name": product.name,
        "cover_url": product.cover_url
    }

@router.delete("/{showcase_id}/items/{product_id}")
def remove_item_from_showcase(
    showcase_id: int,
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER]:
        raise HTTPException(status_code=403, detail="Não autorizado")

    showcase = db.query(DynamicShowcase).filter(
        DynamicShowcase.id == showcase_id,
        DynamicShowcase.company_id == current_user.company_id
    ).first()

    if not showcase:
        raise HTTPException(status_code=404, detail="Vitrine não encontrada")

    item = db.query(DynamicShowcaseItem).filter(
        DynamicShowcaseItem.showcase_id == showcase.id,
        DynamicShowcaseItem.product_id == product_id
    ).first()

    if not item:
        raise HTTPException(status_code=404, detail="Produto não encontrado nesta vitrine.")

    db.delete(item)
    db.commit()
    return {"message": "Produto removido da vitrine com sucesso."}

@router.put("/{showcase_id}/reorder")
def reorder_showcase_items(
    showcase_id: int,
    reorder_in: schemas.ReorderItemRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER]:
        raise HTTPException(status_code=403, detail="Não autorizado")

    showcase = db.query(DynamicShowcase).filter(
        DynamicShowcase.id == showcase_id,
        DynamicShowcase.company_id == current_user.company_id
    ).first()

    if not showcase:
        raise HTTPException(status_code=404, detail="Vitrine não encontrada")

    for index, prod_id in enumerate(reorder_in.product_ids):
        item = db.query(DynamicShowcaseItem).filter(
            DynamicShowcaseItem.showcase_id == showcase.id,
            DynamicShowcaseItem.product_id == prod_id
        ).first()
        if item:
            item.position = index + 1
            db.add(item)

    db.commit()
    return {"message": "Ordenação atualizada com sucesso."}

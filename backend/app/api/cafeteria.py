from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.sql import func
from typing import List, Optional
from datetime import datetime, timezone, date, timedelta
from decimal import Decimal
import uuid
import secrets
import json

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.core.utils import assert_company_ownership
from app.models.company import Company
from app.models.company_settings import CompanySettings
from app.models.pos import POSSession, POSSale, POSSaleItem, POSSessionStatus
from app.models.product import Product
from app.models.catalog_support import Category
from app.models.cafeteria import (
    CAFTable, CAFTableStatus,
    CAFModifierGroup, CAFModifierOption, CAFProductModifier,
    CAFTab, CAFTabStatus,
    CAFOrderItem, CAFPrepStatus, CAFPrepSector
)
from app.schemas.cafeteria import (
    CAFTableCreate, CAFTableUpdate, CAFTableResponse,
    CAFModifierGroupCreate, CAFModifierGroupResponse,
    CAFModifierOptionResponse,
    CAFProductModifierLink,
    CAFMenuProductCreate, CAFMenuProductUpdate,
    CAFMenuProductItemResponse, CAFCategoryItemResponse,
    CAFTabCreate, CAFTabResponse, CAFTabCancelRequest,
    CAFOrderItemCreate, CAFOrderItemResponse,
    CAFKdsItemResponse, CAFKdsUpdateStatus,
    CAFItemAlertRequest, CAFDispatchSectorRequest,
    CAFCheckoutRequest, CAFCheckoutResponse,
    CAFProductItem,
    CAFPublicMenuResponse, CAFPublicCompanyInfo, CAFPublicTableInfo,
    CAFPublicProductItem, CAFPublicModifierGroup, CAFPublicModifierOption,
    CAFCallWaiterRequest, CAFCallWaiterResponse
)
from app.integrators.horus import HorusClient

router = APIRouter(prefix="/companies/{company_id}/cafeteria", tags=["cafeteria"])
public_router = APIRouter(prefix="/public/cafeteria", tags=["cafeteria-public"])


def _check_cafeteria_access(current_user, company: Company):
    """Garante que a empresa tem o módulo de cafeteria ativo ou usuário é Master."""
    is_master = getattr(current_user, "type", "") == "MASTER"
    if not is_master and not getattr(company, "module_cafeteria", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Módulo de Cafeteria não está ativo para esta empresa. Solicite a liberação ao administrador."
        )


# ─── MESAS ───────────────────────────────────────────────────────────────────

@router.get("/tables", response_model=List[CAFTableResponse])
def list_tables(
    company_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    _check_cafeteria_access(current_user, company)

    tables = db.query(CAFTable).filter(
        CAFTable.company_id == company_id,
        CAFTable.active == True
    ).order_by(CAFTable.number).all()

    # Busca comandas ativas com seus itens para preencher info nas mesas
    active_tabs = db.query(CAFTab).options(
        joinedload(CAFTab.items)
    ).filter(
        CAFTab.company_id == company_id,
        CAFTab.table_id.isnot(None),
        CAFTab.status.in_([CAFTabStatus.OPEN.value, CAFTabStatus.BILL_REQUESTED.value])
    ).all()
    tab_by_table = {tab.table_id: tab for tab in active_tabs}

    result = []
    for t in tables:
        active_tab = tab_by_table.get(t.id)
        has_alert = False
        if active_tab and active_tab.items:
            has_alert = any(
                bool(it.kitchen_alert and not it.kitchen_alert_acknowledged and it.prep_status != CAFPrepStatus.CANCELLED.value)
                for it in active_tab.items
            )

        result.append(CAFTableResponse(
            id=t.id,
            company_id=t.company_id,
            number=t.number,
            table_token=t.table_token,
            area=t.area,
            capacity=t.capacity,
            status=t.status,
            active=t.active,
            active_tab_id=active_tab.id if active_tab else None,
            active_tab_number=active_tab.tab_number if active_tab else None,
            active_tab_total=active_tab.total_amount if active_tab else None,
            has_kitchen_alert=has_alert,
            opened_at=active_tab.opened_at if active_tab else None,
            created_at=t.created_at
        ))
    return result


@router.post("/tables", response_model=CAFTableResponse, status_code=status.HTTP_201_CREATED)
def create_table(
    company_id: int,
    payload: CAFTableCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    company = db.query(Company).filter(Company.id == company_id).first()
    _check_cafeteria_access(current_user, company)

    # Evita duplicação de número
    existing = db.query(CAFTable).filter(
        CAFTable.company_id == company_id,
        CAFTable.number == payload.number,
        CAFTable.active == True
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Já existe uma mesa cadastrada com o número '{payload.number}'.")

    # Gera table_token criptográfico único para a mesa
    new_token = f"tab_{secrets.token_hex(6)}"
    table = CAFTable(
        company_id=company_id,
        number=payload.number,
        table_token=new_token,
        area=payload.area or "Salão Principal",
        capacity=payload.capacity or 4,
        status=CAFTableStatus.AVAILABLE.value,
        active=True
    )
    db.add(table)
    db.commit()
    db.refresh(table)
    return table


@router.put("/tables/{table_id}", response_model=CAFTableResponse)
def update_table(
    company_id: int,
    table_id: int,
    payload: CAFTableUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    table = db.query(CAFTable).filter(
        CAFTable.id == table_id,
        CAFTable.company_id == company_id
    ).first()
    if not table:
        raise HTTPException(status_code=404, detail="Mesa não encontrada")

    if payload.number is not None:
        table.number = payload.number
    if payload.area is not None:
        table.area = payload.area
    if payload.capacity is not None:
        table.capacity = payload.capacity
    if payload.status is not None:
        table.status = payload.status
    if payload.active is not None:
        table.active = payload.active

    db.commit()
    db.refresh(table)
    return table


@router.delete("/tables/{table_id}")
def delete_table(
    company_id: int,
    table_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Exclui uma mesa física do salão caso não haja comanda ativa vinculada."""
    assert_company_ownership(current_user, company_id)
    table = db.query(CAFTable).filter(
        CAFTable.id == table_id,
        CAFTable.company_id == company_id
    ).first()
    if not table:
        raise HTTPException(status_code=404, detail="Mesa não encontrada")

    # Verifica se há comanda ativa ou com conta solicitada nesta mesa
    active_tab = db.query(CAFTab).filter(
        CAFTab.table_id == table_id,
        CAFTab.company_id == company_id,
        CAFTab.status.in_([CAFTabStatus.OPEN.value, CAFTabStatus.BILL_REQUESTED.value])
    ).first()
    if active_tab:
        raise HTTPException(
            status_code=400,
            detail=f"Não é possível excluir a Mesa {table.number} porque há uma comanda ativa vinculada a ela (#{active_tab.tab_number}). Cancele ou encerre a comanda primeiro."
        )

    # Desvincula com segurança de comandas históricas já quitadas/canceladas
    db.query(CAFTab).filter(CAFTab.table_id == table_id).update({CAFTab.table_id: None}, synchronize_session=False)

    db.delete(table)
    db.commit()
    return {"ok": True, "message": f"Mesa {table.number} excluída com sucesso"}


@router.get("/menu-token")
def get_cafeteria_menu_token(
    company_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Retorna o token público e URL do cardápio digital do seller."""
    assert_company_ownership(current_user, company_id)
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    _check_cafeteria_access(current_user, company)

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not settings:
        settings = CompanySettings(company_id=company_id)
        db.add(settings)
        db.flush()

    if not settings.cafeteria_menu_token:
        settings.cafeteria_menu_token = f"crd_{secrets.token_hex(8)}"
        db.commit()
        db.refresh(settings)

    return {
        "company_id": company_id,
        "menu_token": settings.cafeteria_menu_token,
        "company_name": company.name,
        "trade_name": getattr(company, "trade_name", None) or company.name
    }


@router.post("/regenerate-menu-token")
def regenerate_cafeteria_menu_token(
    company_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Regenera o token público do cardápio digital, invalidando links antigos."""
    assert_company_ownership(current_user, company_id)
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    _check_cafeteria_access(current_user, company)

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not settings:
        settings = CompanySettings(company_id=company_id)
        db.add(settings)

    new_token = f"crd_{secrets.token_hex(8)}"
    settings.cafeteria_menu_token = new_token
    db.commit()
    db.refresh(settings)

    return {
        "success": True,
        "company_id": company_id,
        "menu_token": new_token,
        "message": "Token do cardápio digital renovado com sucesso! Links antigos foram invalidados."
    }


@router.post("/tables/{table_id}/regenerate-token", response_model=CAFTableResponse)
def regenerate_table_token(
    company_id: int,
    table_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Regenera o token criptográfico da mesa física (para QR code novo)."""
    assert_company_ownership(current_user, company_id)
    company = db.query(Company).filter(Company.id == company_id).first()
    _check_cafeteria_access(current_user, company)

    table = db.query(CAFTable).filter(
        CAFTable.id == table_id,
        CAFTable.company_id == company_id
    ).first()
    if not table:
        raise HTTPException(status_code=404, detail="Mesa não encontrada")

    table.table_token = f"tab_{secrets.token_hex(6)}"
    db.commit()
    db.refresh(table)
    return table


# ─── MODIFICADORES & OPCIONAIS ──────────────────────────────────────────────

@router.get("/modifiers", response_model=List[CAFModifierGroupResponse])
def list_modifiers(
    company_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    groups = db.query(CAFModifierGroup).options(
        joinedload(CAFModifierGroup.options)
    ).filter(
        CAFModifierGroup.company_id == company_id,
        CAFModifierGroup.active == True
    ).order_by(CAFModifierGroup.name).all()
    return groups


@router.post("/modifiers", response_model=CAFModifierGroupResponse, status_code=status.HTTP_201_CREATED)
def create_modifier_group(
    company_id: int,
    payload: CAFModifierGroupCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    group = CAFModifierGroup(
        company_id=company_id,
        name=payload.name,
        min_selectable=payload.min_selectable,
        max_selectable=payload.max_selectable,
        active=payload.active
    )
    db.add(group)
    db.flush()

    for opt_in in payload.options or []:
        opt = CAFModifierOption(
            group_id=group.id,
            company_id=company_id,
            name=opt_in.name,
            additional_price=opt_in.additional_price,
            active=opt_in.active
        )
        db.add(opt)

    db.commit()
    db.refresh(group)
    return group


@router.post("/products/{product_id}/modifiers")
def link_product_modifiers(
    company_id: int,
    product_id: int,
    payload: CAFProductModifierLink,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.company_id == company_id
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    # Remove vínculos existentes
    db.query(CAFProductModifier).filter(
        CAFProductModifier.company_id == company_id,
        CAFProductModifier.product_id == product_id
    ).delete()

    for gid in payload.group_ids:
        link = CAFProductModifier(
            company_id=company_id,
            product_id=product_id,
            group_id=gid
        )
        db.add(link)

    db.commit()
    return {"ok": True, "message": "Modificadores vinculados com sucesso"}


# ─── PRODUTOS DO CARDÁPIO (CRUD CAFETERIA) ───────────────────────────────────

@router.get("/categories", response_model=List[CAFCategoryItemResponse])
def list_cafeteria_categories(
    company_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    categories = db.query(Category).filter(Category.company_id == company_id).order_by(Category.name.asc()).all()
    
    # Contagem de produtos por categoria
    counts = (
        db.query(Product.category_id, func.count(Product.id))
        .filter(Product.company_id == company_id, Product.status == "ACTIVE")
        .group_by(Product.category_id)
        .all()
    )
    count_map = {cid: cnt for cid, cnt in counts if cid}

    return [
        CAFCategoryItemResponse(
            id=cat.id,
            name=cat.name,
            product_count=count_map.get(cat.id, 0)
        )
        for cat in categories
    ]


@router.get("/menu-products", response_model=List[CAFMenuProductItemResponse])
def list_menu_products(
    company_id: int,
    category_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    status: Optional[str] = Query("ACTIVE"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)

    query = db.query(Product).options(joinedload(Product.category)).filter(Product.company_id == company_id)

    if status and status.upper() != "ALL":
        query = query.filter(Product.status == status.upper())

    if category_id:
        query = query.filter(Product.category_id == category_id)

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            (Product.name.ilike(term)) |
            (Product.sku.ilike(term)) |
            (Product.ean_gtin.ilike(term)) |
            (Product.short_description.ilike(term))
        )

    products = query.order_by(Product.name.asc()).limit(200).all()

    # Carrega vínculos de modificadores para esses produtos
    prod_ids = [p.id for p in products]
    modifiers_by_prod = {}
    if prod_ids:
        links = (
            db.query(CAFProductModifier)
            .options(joinedload(CAFProductModifier.group).joinedload(CAFModifierGroup.options))
            .filter(
                CAFProductModifier.product_id.in_(prod_ids),
                CAFProductModifier.company_id == company_id
            )
            .all()
        )
        for link in links:
            if link.product_id not in modifiers_by_prod:
                modifiers_by_prod[link.product_id] = []
            grp = link.group
            if grp:
                modifiers_by_prod[link.product_id].append(grp)

    results = []
    for p in products:
        grps = modifiers_by_prod.get(p.id, [])
        grp_ids = [g.id for g in grps]
        grp_responses = [
            CAFModifierGroupResponse(
                id=g.id,
                company_id=g.company_id,
                name=g.name,
                min_selectable=g.min_selectable,
                max_selectable=g.max_selectable,
                active=g.active,
                options=[
                    CAFModifierOptionResponse(
                        id=opt.id,
                        group_id=opt.group_id,
                        company_id=opt.company_id,
                        name=opt.name,
                        additional_price=opt.additional_price,
                        active=opt.active
                    )
                    for opt in (g.options or [])
                ]
            )
            for g in grps
        ]

        results.append(
            CAFMenuProductItemResponse(
                id=p.id,
                company_id=p.company_id,
                name=p.name,
                sku=p.sku,
                ean_gtin=p.ean_gtin,
                category_id=p.category_id,
                category_name=p.category.name if p.category else None,
                base_price=Decimal(str(p.base_price or 0)),
                cost_price=Decimal(str(p.cost_price)) if p.cost_price is not None else None,
                stock_quantity=p.stock_quantity or 0,
                cover_url=p.cover_url,
                short_description=p.short_description,
                status=p.status or "ACTIVE",
                modifier_group_ids=grp_ids,
                modifier_groups=grp_responses
            )
        )

    return results


@router.post("/menu-products", response_model=CAFMenuProductItemResponse)
def create_menu_product(
    company_id: int,
    payload: CAFMenuProductCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)

    if not payload.name or not payload.name.strip():
        raise HTTPException(status_code=400, detail="O nome do produto é obrigatório")

    # Resolução de Categoria
    category_id = payload.category_id
    if not category_id and payload.category_name and payload.category_name.strip():
        cat_clean = payload.category_name.strip()
        cat = db.query(Category).filter(
            Category.company_id == company_id,
            Category.name.ilike(cat_clean)
        ).first()
        if not cat:
            cat = Category(company_id=company_id, name=cat_clean)
            db.add(cat)
            db.flush()
        category_id = cat.id

    # SKU automático se não informado
    sku = payload.sku.strip() if payload.sku and payload.sku.strip() else f"CAF-{company_id}-{uuid.uuid4().hex[:6].upper()}"

    # Cria o produto na estrutura nativa prd_product
    product = Product(
        company_id=company_id,
        name=payload.name.strip(),
        sku=sku,
        ean_gtin=payload.ean_gtin.strip() if payload.ean_gtin and payload.ean_gtin.strip() else None,
        category_id=category_id,
        base_price=float(payload.base_price),
        cost_price=float(payload.cost_price) if payload.cost_price is not None else None,
        stock_quantity=payload.stock_quantity if payload.stock_quantity is not None else 999,
        cover_url=payload.cover_url.strip() if payload.cover_url else None,
        short_description=payload.short_description.strip() if payload.short_description else None,
        status="ACTIVE"
    )
    db.add(product)
    db.flush()

    # Vínculo com Grupos de Modificadores selecionados
    if payload.modifier_group_ids:
        for gid in payload.modifier_group_ids:
            # Confirma que o grupo pertence à empresa
            grp_exists = db.query(CAFModifierGroup).filter(
                CAFModifierGroup.id == gid,
                CAFModifierGroup.company_id == company_id
            ).first()
            if grp_exists:
                db.add(CAFProductModifier(
                    company_id=company_id,
                    product_id=product.id,
                    group_id=gid
                ))

    db.commit()
    db.refresh(product)

    # Retorna o produto formatado
    category_name = None
    if product.category_id:
        c = db.query(Category).filter(Category.id == product.category_id).first()
        category_name = c.name if c else None

    # Carrega grupos vinculados
    links = (
        db.query(CAFProductModifier)
        .options(joinedload(CAFProductModifier.group).joinedload(CAFModifierGroup.options))
        .filter(CAFProductModifier.product_id == product.id)
        .all()
    )
    grp_ids = [l.group_id for l in links]
    grp_responses = [
        CAFModifierGroupResponse(
            id=l.group.id,
            company_id=l.group.company_id,
            name=l.group.name,
            min_selectable=l.group.min_selectable,
            max_selectable=l.group.max_selectable,
            active=l.group.active,
            options=[
                CAFModifierOptionResponse(
                    id=opt.id,
                    group_id=opt.group_id,
                    company_id=opt.company_id,
                    name=opt.name,
                    additional_price=opt.additional_price,
                    active=opt.active
                )
                for opt in (l.group.options or [])
            ]
        )
        for l in links if l.group
    ]

    return CAFMenuProductItemResponse(
        id=product.id,
        company_id=product.company_id,
        name=product.name,
        sku=product.sku,
        ean_gtin=product.ean_gtin,
        category_id=product.category_id,
        category_name=category_name,
        base_price=Decimal(str(product.base_price or 0)),
        cost_price=Decimal(str(product.cost_price)) if product.cost_price is not None else None,
        stock_quantity=product.stock_quantity or 0,
        cover_url=product.cover_url,
        short_description=product.short_description,
        status=product.status or "ACTIVE",
        modifier_group_ids=grp_ids,
        modifier_groups=grp_responses
    )


@router.put("/menu-products/{product_id}", response_model=CAFMenuProductItemResponse)
def update_menu_product(
    company_id: int,
    product_id: int,
    payload: CAFMenuProductUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)

    product = db.query(Product).filter(
        Product.id == product_id,
        Product.company_id == company_id
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    if payload.name is not None and payload.name.strip():
        product.name = payload.name.strip()

    if payload.base_price is not None:
        product.base_price = float(payload.base_price)

    if payload.cost_price is not None:
        product.cost_price = float(payload.cost_price)

    if payload.stock_quantity is not None:
        product.stock_quantity = payload.stock_quantity

    if payload.sku is not None and payload.sku.strip():
        product.sku = payload.sku.strip()

    if payload.ean_gtin is not None:
        product.ean_gtin = payload.ean_gtin.strip() if payload.ean_gtin.strip() else None

    if payload.cover_url is not None:
        product.cover_url = payload.cover_url.strip() if payload.cover_url.strip() else None

    if payload.short_description is not None:
        product.short_description = payload.short_description.strip() if payload.short_description.strip() else None

    if payload.status is not None:
        product.status = payload.status.upper()

    # Categoria
    if payload.category_id is not None:
        product.category_id = payload.category_id
    elif payload.category_name is not None and payload.category_name.strip():
        cat_clean = payload.category_name.strip()
        cat = db.query(Category).filter(
            Category.company_id == company_id,
            Category.name.ilike(cat_clean)
        ).first()
        if not cat:
            cat = Category(company_id=company_id, name=cat_clean)
            db.add(cat)
            db.flush()
        product.category_id = cat.id

    # Sincroniza modificadores se fornecidos
    if payload.modifier_group_ids is not None:
        db.query(CAFProductModifier).filter(
            CAFProductModifier.company_id == company_id,
            CAFProductModifier.product_id == product.id
        ).delete()

        for gid in payload.modifier_group_ids:
            grp_exists = db.query(CAFModifierGroup).filter(
                CAFModifierGroup.id == gid,
                CAFModifierGroup.company_id == company_id
            ).first()
            if grp_exists:
                db.add(CAFProductModifier(
                    company_id=company_id,
                    product_id=product.id,
                    group_id=gid
                ))

    db.commit()
    db.refresh(product)

    category_name = None
    if product.category_id:
        c = db.query(Category).filter(Category.id == product.category_id).first()
        category_name = c.name if c else None

    links = (
        db.query(CAFProductModifier)
        .options(joinedload(CAFProductModifier.group).joinedload(CAFModifierGroup.options))
        .filter(CAFProductModifier.product_id == product.id)
        .all()
    )
    grp_ids = [l.group_id for l in links]
    grp_responses = [
        CAFModifierGroupResponse(
            id=l.group.id,
            company_id=l.group.company_id,
            name=l.group.name,
            min_selectable=l.group.min_selectable,
            max_selectable=l.group.max_selectable,
            active=l.group.active,
            options=[
                CAFModifierOptionResponse(
                    id=opt.id,
                    group_id=opt.group_id,
                    company_id=opt.company_id,
                    name=opt.name,
                    additional_price=opt.additional_price,
                    active=opt.active
                )
                for opt in (l.group.options or [])
            ]
        )
        for l in links if l.group
    ]

    return CAFMenuProductItemResponse(
        id=product.id,
        company_id=product.company_id,
        name=product.name,
        sku=product.sku,
        ean_gtin=product.ean_gtin,
        category_id=product.category_id,
        category_name=category_name,
        base_price=Decimal(str(product.base_price or 0)),
        cost_price=Decimal(str(product.cost_price)) if product.cost_price is not None else None,
        stock_quantity=product.stock_quantity or 0,
        cover_url=product.cover_url,
        short_description=product.short_description,
        status=product.status or "ACTIVE",
        modifier_group_ids=grp_ids,
        modifier_groups=grp_responses
    )


@router.delete("/menu-products/{product_id}")
def delete_menu_product(
    company_id: int,
    product_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)

    product = db.query(Product).filter(
        Product.id == product_id,
        Product.company_id == company_id
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    # Inativa o produto com segurança
    product.status = "INACTIVE"
    db.commit()

    return {"ok": True, "message": "Produto inativado com sucesso do cardápio"}



# ─── COMANDAS (TABS) ─────────────────────────────────────────────────────────

@router.get("/tabs", response_model=List[CAFTabResponse])
def list_active_tabs(
    company_id: int,
    status_filter: Optional[str] = Query(None, alias="status"),
    date_filter: Optional[str] = Query(None, alias="date"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    query = db.query(CAFTab).options(
        joinedload(CAFTab.items),
        joinedload(CAFTab.table)
    ).filter(CAFTab.company_id == company_id)

    today = date.today()
    s_date = None
    e_date = None

    if date_filter == "today":
        s_date = today
        e_date = today
    elif date_filter == "yesterday":
        s_date = today - timedelta(days=1)
        e_date = today - timedelta(days=1)
    elif date_filter == "last7days":
        s_date = today - timedelta(days=6)
        e_date = today
    elif date_filter == "last30days":
        s_date = today - timedelta(days=29)
        e_date = today
    elif date_filter and date_filter != "all":
        try:
            parsed = datetime.strptime(date_filter, "%Y-%m-%d").date()
            s_date = parsed
            e_date = parsed
        except ValueError:
            pass

    if start_date:
        try:
            s_date = datetime.strptime(start_date, "%Y-%m-%d").date()
        except ValueError:
            pass
    if end_date:
        try:
            e_date = datetime.strptime(end_date, "%Y-%m-%d").date()
        except ValueError:
            pass

    if s_date:
        query = query.filter(func.date(CAFTab.opened_at) >= s_date)
    if e_date:
        query = query.filter(func.date(CAFTab.opened_at) <= e_date)

    if status_filter and status_filter.upper() != "ALL":
        query = query.filter(CAFTab.status == status_filter)
    elif not status_filter and not date_filter and not start_date:
        query = query.filter(CAFTab.status.in_([CAFTabStatus.OPEN.value, CAFTabStatus.BILL_REQUESTED.value]))

    tabs = query.order_by(CAFTab.opened_at.desc()).all()
    
    res = []
    for tab in tabs:
        res.append(CAFTabResponse(
            id=tab.id,
            company_id=tab.company_id,
            table_id=tab.table_id,
            table_number=tab.table.number if tab.table else None,
            tab_number=tab.tab_number,
            customer_name=tab.customer_name,
            customer_document=tab.customer_document,
            waiter_user_id=tab.waiter_user_id,
            waiter_name=tab.waiter.name if tab.waiter else None,
            status=tab.status,
            subtotal=tab.subtotal,
            discount=tab.discount,
            total_amount=tab.total_amount,
            opened_at=tab.opened_at,
            closed_at=tab.closed_at,
            items=[CAFOrderItemResponse.from_orm(it) for it in tab.items if it.prep_status != CAFPrepStatus.CANCELLED.value]
        ))
    return res


@router.post("/tabs", response_model=CAFTabResponse, status_code=status.HTTP_201_CREATED)
def open_tab(
    company_id: int,
    payload: CAFTabCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    company = db.query(Company).filter(Company.id == company_id).first()
    _check_cafeteria_access(current_user, company)

    # Se vinculada a uma mesa, valida mesa
    table = None
    if payload.table_id:
        table = db.query(CAFTable).filter(
            CAFTable.id == payload.table_id,
            CAFTable.company_id == company_id
        ).first()
        if not table:
            raise HTTPException(status_code=404, detail="Mesa não encontrada")
        # Se a mesa já está ocupada, verifica se já existe comanda aberta nela
        open_tab_on_table = db.query(CAFTab).filter(
            CAFTab.table_id == table.id,
            CAFTab.status.in_([CAFTabStatus.OPEN.value, CAFTabStatus.BILL_REQUESTED.value])
        ).first()
        if open_tab_on_table:
            raise HTTPException(
                status_code=400,
                detail=f"A mesa '{table.number}' já possui uma comanda aberta (#{open_tab_on_table.tab_number})."
            )

    # Valida se já existe uma comanda aberta com o mesmo número
    existing_tab = db.query(CAFTab).filter(
        CAFTab.company_id == company_id,
        CAFTab.tab_number == payload.tab_number.strip(),
        CAFTab.status.in_([CAFTabStatus.OPEN.value, CAFTabStatus.BILL_REQUESTED.value])
    ).first()
    if existing_tab:
        raise HTTPException(
            status_code=400,
            detail=f"Já existe uma comanda aberta com o número #{payload.tab_number.strip()}."
        )

    tab = CAFTab(
        company_id=company_id,
        table_id=payload.table_id,
        waiter_user_id=getattr(current_user, "id", None),
        tab_number=payload.tab_number,
        customer_name=payload.customer_name,
        customer_document=payload.customer_document,
        notes=payload.notes,
        status=CAFTabStatus.OPEN.value,
        subtotal=Decimal("0.00"),
        discount=Decimal("0.00"),
        total_amount=Decimal("0.00")
    )
    db.add(tab)

    if table:
        table.status = CAFTableStatus.OCCUPIED.value

    db.commit()
    db.refresh(tab)

    return CAFTabResponse(
        id=tab.id,
        company_id=tab.company_id,
        table_id=tab.table_id,
        table_number=table.number if table else None,
        tab_number=tab.tab_number,
        customer_name=tab.customer_name,
        customer_document=tab.customer_document,
        waiter_user_id=tab.waiter_user_id,
        waiter_name=current_user.name if hasattr(current_user, "name") else None,
        status=tab.status,
        subtotal=tab.subtotal,
        discount=tab.discount,
        total_amount=tab.total_amount,
        opened_at=tab.opened_at,
        closed_at=tab.closed_at,
        items=[]
    )


@router.get("/tabs/{tab_id}", response_model=CAFTabResponse)
def get_tab_details(
    company_id: int,
    tab_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    tab = db.query(CAFTab).options(
        joinedload(CAFTab.items),
        joinedload(CAFTab.table),
        joinedload(CAFTab.waiter)
    ).filter(
        CAFTab.id == tab_id,
        CAFTab.company_id == company_id
    ).first()
    if not tab:
        raise HTTPException(status_code=404, detail="Comanda não encontrada")

    return CAFTabResponse(
        id=tab.id,
        company_id=tab.company_id,
        table_id=tab.table_id,
        table_number=tab.table.number if tab.table else None,
        tab_number=tab.tab_number,
        customer_name=tab.customer_name,
        customer_document=tab.customer_document,
        waiter_user_id=tab.waiter_user_id,
        waiter_name=tab.waiter.name if tab.waiter else None,
        status=tab.status,
        subtotal=tab.subtotal,
        discount=tab.discount,
        total_amount=tab.total_amount,
        opened_at=tab.opened_at,
        closed_at=tab.closed_at,
        items=[CAFOrderItemResponse.from_orm(it) for it in tab.items]
    )


def _infer_prep_sector(title: str, category_name: Optional[str] = None, explicit_sector: Optional[str] = None) -> str:
    if explicit_sector and explicit_sector.upper() in [s.value for s in CAFPrepSector]:
        return explicit_sector.upper()

    text = f"{title or ''} {category_name or ''}".lower()
    beverage_keywords = [
        "café", "cafe", "espresso", "cappuccino", "capuccino", "latte", "mocha", "macchiato",
        "chá", "cha", "suco", "água", "agua", "refrigerante", "refri", "coca", "guaraná", "guarana",
        "cerveja", "chopp", "drink", "cocktail", "caipirinha", "gin", "tônica", "tonica",
        "shake", "smoothie", "leite", "soda", "bebida", "dose", "vinho", "whisky", "licor", "coquetel"
    ]
    kitchen_keywords = [
        "sanduíche", "sanduiche", "misto", "queijo quente", "bauru", "croissant",
        "torta salgada", "quiche", "empada", "coxinha", "pastel", "salgado", "pão de queijo",
        "pao de queijo", "tapioca", "crepe", "waffle", "panqueca", "omelete", "ovo", "ovos",
        "toast", "hambúrguer", "hamburguer", "burger", "batata", "porção", "porcao", "prato",
        "almoço", "almoco", "salada", "sopa", "caldo", "refeição", "refeicao", "sanduba"
    ]

    for kw in beverage_keywords:
        if kw in text:
            return CAFPrepSector.BEVERAGE.value

    for kw in kitchen_keywords:
        if kw in text:
            return CAFPrepSector.KITCHEN.value

    return CAFPrepSector.OTHER.value


@router.post("/tabs/{tab_id}/items", response_model=CAFOrderItemResponse)
def add_item_to_tab(
    company_id: int,
    tab_id: int,
    payload: CAFOrderItemCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    tab = db.query(CAFTab).filter(
        CAFTab.id == tab_id,
        CAFTab.company_id == company_id
    ).first()
    if not tab:
        raise HTTPException(status_code=404, detail="Comanda não encontrada")
    if tab.status != CAFTabStatus.OPEN.value:
        raise HTTPException(status_code=400, detail=f"Comanda não está aberta para novos itens (status={tab.status}).")

    # Calcula preço adicional dos modificadores
    modifiers_sum = Decimal("0.00")
    mod_list = []
    for mod in payload.selected_modifiers or []:
        mod_price = Decimal(str(mod.price or 0))
        modifiers_sum += mod_price
        mod_list.append({
            "group_id": mod.group_id,
            "group_name": mod.group_name,
            "option_id": mod.option_id,
            "option_name": mod.option_name,
            "price": float(mod_price)
        })

    unit_price = Decimal(str(payload.unit_price or 0))
    qty = Decimal(str(payload.quantity or 1))
    total_price = (unit_price + modifiers_sum) * qty

    # Determina setor de preparo e status inicial
    prep_sector = _infer_prep_sector(payload.title, payload.category_name, payload.prep_sector)

    # Regra especialista Bar, Restaurante & Cafeteria:
    # 1. Se o garçom escolheu salvar como RASCUNHO na mesa (send_now is False):
    if payload.send_now is False:
        init_prep_status = CAFPrepStatus.DRAFT.value
    # 2. Se for para envio imediato (send_now is True ou padrão):
    else:
        init_prep_status = CAFPrepStatus.PENDING.value

    item = CAFOrderItem(
        company_id=company_id,
        tab_id=tab.id,
        product_id=payload.product_id,
        created_by_user_id=getattr(current_user, "id", None),
        barcode=payload.barcode,
        sku=payload.sku,
        title=payload.title,
        source=payload.source or "CRONUZ",
        horus_item_code=payload.horus_item_code,
        category_name=payload.category_name,
        prep_sector=prep_sector,
        quantity=qty,
        unit_price=unit_price,
        modifiers_price=modifiers_sum,
        total_price=total_price,
        modifiers_json=mod_list,
        notes=payload.notes,
        requires_preparation=True,
        prep_status=init_prep_status
    )
    db.add(item)

    # Recalcula total da comanda
    tab.subtotal = (tab.subtotal or Decimal("0.00")) + total_price
    tab.total_amount = max(Decimal("0.00"), tab.subtotal - (tab.discount or Decimal("0.00")))

    db.commit()
    db.refresh(item)
    return item


@router.post("/tabs/{tab_id}/items/{item_id}/dispatch", response_model=CAFOrderItemResponse)
def dispatch_order_item(
    company_id: int,
    tab_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Dispara um item avulso que estava em DRAFT (ou reenviando) para a fila de produção do KDS."""
    assert_company_ownership(current_user, company_id)
    item = db.query(CAFOrderItem).filter(
        CAFOrderItem.id == item_id,
        CAFOrderItem.tab_id == tab_id,
        CAFOrderItem.company_id == company_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado na comanda")

    # Permite enviar para a fila se estiver em DRAFT ou reenviar item DELIVERED
    if item.prep_status in [CAFPrepStatus.DRAFT.value, CAFPrepStatus.DELIVERED.value]:
        item.prep_status = CAFPrepStatus.PENDING.value
        item.requires_preparation = True
        item.prep_started_at = None
        db.commit()
        db.refresh(item)

    return item


@router.post("/tabs/{tab_id}/dispatch")
def dispatch_tab_sector(
    company_id: int,
    tab_id: int,
    payload: Optional[CAFDispatchSectorRequest] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Dispara itens que estão em DRAFT para a produção, filtrando por setor (BEVERAGE, KITCHEN, OTHER ou ALL)."""
    assert_company_ownership(current_user, company_id)
    tab = db.query(CAFTab).filter(
        CAFTab.id == tab_id,
        CAFTab.company_id == company_id
    ).first()
    if not tab:
        raise HTTPException(status_code=404, detail="Comanda não encontrada")

    sector = (payload.sector if payload and payload.sector else "ALL").upper()
    query = db.query(CAFOrderItem).filter(
        CAFOrderItem.tab_id == tab_id,
        CAFOrderItem.company_id == company_id,
        CAFOrderItem.prep_status.in_([CAFPrepStatus.DRAFT.value, CAFPrepStatus.DELIVERED.value])
    )
    if sector != "ALL":
        query = query.filter(CAFOrderItem.prep_sector == sector)

    dispatched_count = query.update({
        CAFOrderItem.prep_status: CAFPrepStatus.PENDING.value,
        CAFOrderItem.requires_preparation: True
    }, synchronize_session=False)
    db.commit()
    return {"ok": True, "dispatched_count": dispatched_count, "sector": sector}


@router.post("/tabs/{tab_id}/items/{item_id}/acknowledge-alert")
def acknowledge_kitchen_alert(
    company_id: int,
    tab_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Marca o alerta emitido pela cozinha/barista como reconhecido pelo garçom."""
    assert_company_ownership(current_user, company_id)
    item = db.query(CAFOrderItem).filter(
        CAFOrderItem.id == item_id,
        CAFOrderItem.tab_id == tab_id,
        CAFOrderItem.company_id == company_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado")

    item.kitchen_alert_acknowledged = True
    db.commit()
    return {"ok": True, "message": "Alerta reconhecido pelo garçom"}


@router.delete("/tabs/{tab_id}/items/{item_id}")
def cancel_item_from_tab(
    company_id: int,
    tab_id: int,
    item_id: int,
    reason: str = Query("Cancelado pelo cliente", alias="reason"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    item = db.query(CAFOrderItem).filter(
        CAFOrderItem.id == item_id,
        CAFOrderItem.tab_id == tab_id,
        CAFOrderItem.company_id == company_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado na comanda")

    if item.prep_status == CAFPrepStatus.CANCELLED.value:
        raise HTTPException(status_code=400, detail="Item já foi cancelado anteriormente")

    tab = db.query(CAFTab).filter(CAFTab.id == tab_id).first()

    # Marca item como cancelado e estorna valor da comanda
    item.prep_status = CAFPrepStatus.CANCELLED.value
    item.cancelled_at = func.now()
    item.cancel_reason = reason

    tab.subtotal = max(Decimal("0.00"), (tab.subtotal or Decimal("0.00")) - item.total_price)
    tab.total_amount = max(Decimal("0.00"), tab.subtotal - (tab.discount or Decimal("0.00")))

    db.commit()
    return {"ok": True, "message": "Item cancelado com sucesso"}


def _cancel_tab_internal(tab: CAFTab, db: Session, reason: str = "Comanda cancelada"):
    tab.status = CAFTabStatus.CANCELLED.value
    tab.closed_at = func.now()

    # Libera mesa se não houver outra comanda aberta nela
    if tab.table:
        other_active = db.query(CAFTab).filter(
            CAFTab.table_id == tab.table_id,
            CAFTab.id != tab.id,
            CAFTab.status.in_([CAFTabStatus.OPEN.value, CAFTabStatus.BILL_REQUESTED.value])
        ).first()
        if not other_active:
            tab.table.status = CAFTableStatus.AVAILABLE.value

    # Cancela itens pendentes ou em preparo no KDS
    for it in tab.items:
        if it.prep_status in [CAFPrepStatus.PENDING.value, CAFPrepStatus.PREPARING.value]:
            it.prep_status = CAFPrepStatus.CANCELLED.value
            it.cancelled_at = func.now()
            it.cancel_reason = reason


@router.post("/tabs/{tab_id}/cancel")
def cancel_tab(
    company_id: int,
    tab_id: int,
    payload: Optional[CAFTabCancelRequest] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    tab = db.query(CAFTab).options(
        joinedload(CAFTab.items),
        joinedload(CAFTab.table)
    ).filter(
        CAFTab.id == tab_id,
        CAFTab.company_id == company_id
    ).first()
    if not tab:
        raise HTTPException(status_code=404, detail="Comanda não encontrada")

    if tab.status in [CAFTabStatus.PAID.value, "BILLED", "CLOSED"]:
        raise HTTPException(status_code=400, detail="Comandas já quitadas ou faturadas não podem ser canceladas.")

    if tab.status == CAFTabStatus.CANCELLED.value:
        return {"ok": True, "message": "Comanda já estava cancelada", "status": tab.status}

    reason = payload.reason if payload and payload.reason else "Cancelada pelo operador"
    _cancel_tab_internal(tab, db, reason)
    db.commit()
    return {"ok": True, "message": "Comanda cancelada com sucesso", "status": tab.status}


@router.patch("/tabs/{tab_id}/status")
def update_tab_status(
    company_id: int,
    tab_id: int,
    new_status: str = Query(..., alias="status"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    tab = db.query(CAFTab).options(
        joinedload(CAFTab.items),
        joinedload(CAFTab.table)
    ).filter(
        CAFTab.id == tab_id,
        CAFTab.company_id == company_id
    ).first()
    if not tab:
        raise HTTPException(status_code=404, detail="Comanda não encontrada")

    valid_statuses = [s.value for s in CAFTabStatus]
    if new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Status inválido. Permitidos: {valid_statuses}")

    if new_status == CAFTabStatus.CANCELLED.value:
        _cancel_tab_internal(tab, db, "Cancelada pelo operador")
    else:
        tab.status = new_status
        if new_status == CAFTabStatus.BILL_REQUESTED.value and tab.table:
            tab.table.status = CAFTableStatus.BILL_REQUESTED.value

    db.commit()
    return {"ok": True, "status": tab.status}


# ─── KDS (BARISTA / COZINHA) ────────────────────────────────────────────────

@router.get("/kds/queue", response_model=List[CAFKdsItemResponse])
def get_kds_queue(
    company_id: int,
    status_filter: Optional[str] = Query(None, alias="status"),
    sector_filter: Optional[str] = Query(None, alias="sector"),
    date_filter: Optional[str] = Query(None, alias="date"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    company = db.query(Company).filter(Company.id == company_id).first()
    _check_cafeteria_access(current_user, company)

    query = db.query(CAFOrderItem).join(CAFTab).outerjoin(CAFTable).filter(
        CAFOrderItem.company_id == company_id,
        CAFOrderItem.prep_status != CAFPrepStatus.DRAFT.value
    )

    if sector_filter and sector_filter.upper() != "ALL":
        query = query.filter(CAFOrderItem.prep_sector == sector_filter.upper())

    today = date.today()
    s_date = None
    e_date = None

    if date_filter == "today":
        s_date = today
        e_date = today
    elif date_filter == "yesterday":
        s_date = today - timedelta(days=1)
        e_date = today - timedelta(days=1)
    elif date_filter == "last7days":
        s_date = today - timedelta(days=6)
        e_date = today
    elif date_filter and date_filter != "all":
        try:
            parsed = datetime.strptime(date_filter, "%Y-%m-%d").date()
            s_date = parsed
            e_date = parsed
        except ValueError:
            pass

    if start_date:
        try:
            s_date = datetime.strptime(start_date, "%Y-%m-%d").date()
        except ValueError:
            pass
    if end_date:
        try:
            e_date = datetime.strptime(end_date, "%Y-%m-%d").date()
        except ValueError:
            pass

    if s_date:
        query = query.filter(func.date(CAFOrderItem.created_at) >= s_date)
    if e_date:
        query = query.filter(func.date(CAFOrderItem.created_at) <= e_date)

    if status_filter and status_filter.upper() != "ALL":
        query = query.filter(CAFOrderItem.prep_status == status_filter)

    items = query.order_by(CAFOrderItem.created_at.asc()).all()

    now = datetime.now(timezone.utc)
    res = []
    for item in items:
        elapsed = 0
        if item.created_at:
            created_tz = item.created_at if item.created_at.tzinfo else item.created_at.replace(tzinfo=timezone.utc)
            elapsed = max(0, int((now - created_tz).total_seconds() / 60))

        res.append(CAFKdsItemResponse(
            id=item.id,
            tab_id=item.tab_id,
            tab_number=item.tab.tab_number if item.tab else "",
            table_number=item.tab.table.number if item.tab and item.tab.table else None,
            customer_name=item.tab.customer_name if item.tab else None,
            title=item.title,
            quantity=item.quantity,
            notes=item.notes,
            modifiers=item.modifiers_json or [],
            category_name=item.category_name,
            prep_sector=item.prep_sector or "BEVERAGE",
            prep_status=item.prep_status,
            created_at=item.created_at,
            prep_started_at=item.prep_started_at,
            prep_finished_at=item.prep_finished_at,
            elapsed_minutes=elapsed,
            kitchen_alert=item.kitchen_alert,
            kitchen_alert_at=item.kitchen_alert_at,
            kitchen_alert_acknowledged=item.kitchen_alert_acknowledged
        ))
    return res


@router.patch("/kds/items/{item_id}/status")
def update_kds_item_status(
    company_id: int,
    item_id: int,
    payload: CAFKdsUpdateStatus,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    item = db.query(CAFOrderItem).filter(
        CAFOrderItem.id == item_id,
        CAFOrderItem.company_id == company_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado no KDS")

    new_status = payload.prep_status
    if new_status == CAFPrepStatus.PREPARING.value:
        item.prep_started_at = func.now()
    elif new_status == CAFPrepStatus.READY.value:
        item.prep_finished_at = func.now()
    elif new_status == CAFPrepStatus.DELIVERED.value:
        item.delivered_at = func.now()
    elif new_status == CAFPrepStatus.CANCELLED.value:
        item.cancelled_at = func.now()
        item.cancel_reason = payload.cancel_reason or "Cancelado pelo Barista"

    item.prep_status = new_status
    db.commit()
    return {"ok": True, "prep_status": item.prep_status}


@router.post("/kds/items/{item_id}/alert", response_model=CAFKdsItemResponse)
def send_kitchen_alert(
    company_id: int,
    item_id: int,
    payload: CAFItemAlertRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """Envia um alerta da cozinha/barista para o garçom no salão (ex: falta de produto, demora)."""
    assert_company_ownership(current_user, company_id)
    item = db.query(CAFOrderItem).filter(
        CAFOrderItem.id == item_id,
        CAFOrderItem.company_id == company_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado no KDS")

    item.kitchen_alert = payload.message.strip()
    item.kitchen_alert_at = func.now()
    item.kitchen_alert_acknowledged = False
    db.commit()
    db.refresh(item)

    now = datetime.now(timezone.utc)
    elapsed = 0
    if item.created_at:
        created_tz = item.created_at if item.created_at.tzinfo else item.created_at.replace(tzinfo=timezone.utc)
        elapsed = max(0, int((now - created_tz).total_seconds() / 60))

    return CAFKdsItemResponse(
        id=item.id,
        tab_id=item.tab_id,
        tab_number=item.tab.tab_number if item.tab else "",
        table_number=item.tab.table.number if item.tab and item.tab.table else None,
        customer_name=item.tab.customer_name if item.tab else None,
        title=item.title,
        quantity=item.quantity,
        notes=item.notes,
        modifiers=item.modifiers_json or [],
        category_name=item.category_name,
        prep_sector=item.prep_sector or "BEVERAGE",
        prep_status=item.prep_status,
        created_at=item.created_at,
        prep_started_at=item.prep_started_at,
        prep_finished_at=item.prep_finished_at,
        elapsed_minutes=elapsed,
        kitchen_alert=item.kitchen_alert,
        kitchen_alert_at=item.kitchen_alert_at,
        kitchen_alert_acknowledged=item.kitchen_alert_acknowledged
    )


# ─── BUSCA HÍBRIDA (CRONUZ + HORUS) ─────────────────────────────────────────

@router.get("/products/search", response_model=List[CAFProductItem])
async def search_cafeteria_products(
    company_id: int,
    q: str = Query("", alias="q"),
    category: Optional[str] = Query(None, alias="category"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)
    company = db.query(Company).filter(Company.id == company_id).first()
    _check_cafeteria_access(current_user, company)

    results: List[CAFProductItem] = []

    # 1. Busca produtos Cronuz Direto
    cronuz_query = db.query(Product).options(joinedload(Product.category)).filter(
        Product.company_id == company_id,
        (Product.status == "ACTIVE") | (Product.status == None)
    )
    if q.strip():
        term = f"%{q.strip()}%"
        cronuz_query = cronuz_query.filter(
            (func.unaccent(Product.name).ilike(func.unaccent(term))) |
            (Product.ean_gtin.ilike(term)) |
            (Product.sku.ilike(term))
        )
    if category:
        cronuz_query = cronuz_query.join(Product.category).filter(Category.name.ilike(f"%{category}%"))

    cronuz_products = cronuz_query.order_by(Product.name.asc()).limit(50).all()

    # Puxa modificadores vinculados aos produtos Cronuz encontrados
    prod_ids = [p.id for p in cronuz_products]
    modifiers_by_prod = {}
    if prod_ids:
        links = db.query(CAFProductModifier).options(
            joinedload(CAFProductModifier.group).joinedload(CAFModifierGroup.options)
        ).filter(
            CAFProductModifier.product_id.in_(prod_ids),
            CAFProductModifier.company_id == company_id
        ).all()
        for link in links:
            if link.product_id not in modifiers_by_prod:
                modifiers_by_prod[link.product_id] = []
            grp = link.group
            if grp and grp.active:
                opts = [
                    CAFModifierOptionResponse(
                        id=opt.id,
                        group_id=opt.group_id,
                        company_id=opt.company_id,
                        name=opt.name,
                        additional_price=opt.additional_price,
                        active=opt.active
                    )
                    for opt in (grp.options or [])
                    if opt.active
                ]
                modifiers_by_prod[link.product_id].append(
                    CAFModifierGroupResponse(
                        id=grp.id,
                        company_id=grp.company_id,
                        name=grp.name,
                        min_selectable=grp.min_selectable,
                        max_selectable=grp.max_selectable,
                        active=grp.active,
                        options=opts
                    )
                )

    for p in cronuz_products:
        cat_name = p.category.name if p.category else None
        requires_prep = True if (cat_name and any(k in cat_name.lower() for k in ["caf", "bebid", "lanche", "salgad", "suco", "chá", "shake", "drink", "sandu"])) else False
        results.append(CAFProductItem(
            id=p.id,
            source="CRONUZ",
            barcode=p.ean_gtin or p.sku or str(p.id),
            sku=p.sku,
            title=p.name or "Item do Cardápio",
            price=Decimal(str(p.base_price or 0)),
            stock=Decimal(str(p.stock_quantity or 0)),
            category=cat_name,
            requires_preparation=requires_prep,
            modifier_groups=modifiers_by_prod.get(p.id, [])
        ))

    # 2. Busca híbrida no Horus ERP (se ativo para o seller e houver termo de busca)
    if getattr(company, "module_horus_erp", False) and q.strip():
        try:
            settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
            legacy_pagination = getattr(settings, "horus_legacy_pagination", False)
            client = HorusClient(company, settings)

            # Paginação segura Horus respeitando horus_legacy_pagination
            offset = None if legacy_pagination else 0
            limit = None if legacy_pagination else 15

            horus_items = await client.get_products(
                search=q.strip(),
                offset=offset,
                limit=limit
            )
            for item in (horus_items or []):
                # Normaliza campos Horus
                barcode = item.get("COD_BARRA") or item.get("COD_ITEM") or ""
                title = item.get("NOM_ITEM") or item.get("TITULO") or "Produto Horus"
                vlr = item.get("VLR_CAPA") or item.get("PRECO_VENDA") or 0
                stock = item.get("QTD_DISPONIVEL") or item.get("ESTOQUE") or 0
                cod_item = str(item.get("COD_ITEM") or "")

                results.append(CAFProductItem(
                    id=None,
                    source="HORUS",
                    barcode=str(barcode),
                    sku=cod_item,
                    title=f"[Horus] {title}",
                    price=Decimal(str(vlr)),
                    stock=Decimal(str(stock)),
                    category="Horus ERP",
                    requires_preparation=False,
                    modifier_groups=[]
                ))
        except Exception:
            pass

    return results


# ─── CHECKOUT INTEGRADO AO PDV ──────────────────────────────────────────────

@router.post("/tabs/{tab_id}/checkout", response_model=CAFCheckoutResponse)
def checkout_tab_into_pos(
    company_id: int,
    tab_id: int,
    payload: CAFCheckoutRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    """
    Fecha uma comanda da cafeteria liquidando o valor diretamente na sessão de caixa ativa do PDV.
    Cria a venda (pos_sale e pos_sale_item), atualiza totais da sessão e libera a mesa.
    """
    assert_company_ownership(current_user, company_id)
    company = db.query(Company).filter(Company.id == company_id).first()
    _check_cafeteria_access(current_user, company)

    tab = db.query(CAFTab).options(
        joinedload(CAFTab.items),
        joinedload(CAFTab.table)
    ).filter(
        CAFTab.id == tab_id,
        CAFTab.company_id == company_id
    ).first()
    if not tab:
        raise HTTPException(status_code=404, detail="Comanda não encontrada")

    if tab.status == CAFTabStatus.PAID.value:
        raise HTTPException(status_code=400, detail="Esta comanda já foi quitada anteriormente.")

    active_items = [it for it in tab.items if it.prep_status != CAFPrepStatus.CANCELLED.value]
    if not active_items:
        raise HTTPException(status_code=400, detail="A comanda não possui itens ativos para cobrança.")

    # Valida sessão do PDV
    session = db.query(POSSession).filter(
        POSSession.id == payload.session_id,
        POSSession.company_id == company_id,
        POSSession.status == POSSessionStatus.OPEN.value
    ).first()
    if not session:
        raise HTTPException(status_code=400, detail="Sessão de caixa do PDV informada não existe ou está fechada.")

    # Aplica desconto informado no checkout se houver
    discount = Decimal(str(payload.discount or tab.discount or 0))
    subtotal = tab.subtotal
    total_amount = max(Decimal("0.00"), subtotal - discount)

    # Gera UUID de idempotência e número de venda do PDV
    sale_uuid = f"caf-{tab.id}-{uuid.uuid4().hex[:12]}"
    sale_number = f"CAF-{tab.tab_number}-{datetime.now().strftime('%H%M%S')}"

    # Monta detalhes de pagamento
    pay_details = payload.payment_details or ""
    if payload.splits:
        pay_details = json.dumps([{"method": s.method, "amount": float(s.amount)} for s in payload.splits])

    sale = POSSale(
        company_id=company_id,
        session_id=session.id,
        user_id=getattr(current_user, "id", None),
        client_sale_uuid=sale_uuid,
        sale_number=sale_number,
        customer_name=payload.customer_name or tab.customer_name or "Consumidor Cafeteria",
        customer_document=payload.customer_document or tab.customer_document,
        payment_method=payload.payment_method,
        payment_details=pay_details,
        subtotal=subtotal,
        discount=discount,
        total_amount=total_amount,
        items_count=len(active_items),
        sold_at=func.now(),
        origin="cafeteria_pos",
        status="COMPLETED",
        notes=f"Comanda #{tab.tab_number}" + (f" - Mesa {tab.table.number}" if tab.table else "")
    )
    db.add(sale)
    db.flush()

    # Cria itens na venda do PDV
    for item in active_items:
        sale_item = POSSaleItem(
            sale_id=sale.id,
            product_id=item.product_id,
            barcode=item.barcode or (item.sku or "CAF"),
            sku=item.sku,
            title=item.title + (f" ({item.notes})" if item.notes else ""),
            publisher="Cafeteria",
            quantity=item.quantity,
            unit_price=item.unit_price + item.modifiers_price,
            total_price=item.total_price,
            horus_item_code=item.horus_item_code
        )
        db.add(sale_item)

    # Atualiza sessão do PDV
    session.total_sales_count = (session.total_sales_count or 0) + 1
    session.total_sales_amount = (session.total_sales_amount or Decimal("0.00")) + total_amount

    # Atualiza Comanda
    tab.status = CAFTabStatus.PAID.value
    tab.pos_session_id = session.id
    tab.pos_sale_id = sale.id
    tab.discount = discount
    tab.total_amount = total_amount
    tab.closed_at = func.now()

    # Libera mesa se vinculada
    if tab.table:
        tab.table.status = CAFTableStatus.AVAILABLE.value

    db.commit()

    return CAFCheckoutResponse(
        tab_id=tab.id,
        sale_id=sale.id,
        sale_number=sale.sale_number,
        total_amount=total_amount,
        status="PAID",
        message="Comanda quitada com sucesso no PDV!"
    )


# ─── ROTAS PÚBLICAS DO CARDÁPIO DIGITAL ─────────────────────────────────────

@public_router.get("/menu/{identifier}", response_model=CAFPublicMenuResponse)
def get_public_menu(
    identifier: str,
    mesa: Optional[str] = Query(None, description="Token ou número da mesa"),
    token: Optional[str] = Query(None, description="Token de QR code da mesa"),
    db: Session = Depends(get_db)
):
    """
    Retorna o Cardápio Digital público protegido por token seguro (crd_...).
    Para evitar scraping e IDOR, não aceita IDs inteiros brutos.
    """
    company = None
    identifier_clean = identifier.strip()

    # 1. Busca por token seguro do cardápio (crd_...)
    settings = db.query(CompanySettings).filter(
        CompanySettings.cafeteria_menu_token == identifier_clean
    ).first()
    if settings:
        company = db.query(Company).filter(Company.id == settings.company_id).first()

    # 2. Busca por domínio ou custom_domain caso o seller use domínio próprio
    if not company:
        company = db.query(Company).filter(
            (Company.custom_domain == identifier_clean) | 
            (Company.domain == identifier_clean)
        ).first()

    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cardápio não encontrado ou link desativado/revogado."
        )

    if not getattr(company, "module_cafeteria", False):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="O módulo de Cafeteria não está ativo neste estabelecimento."
        )

    if not settings:
        settings = db.query(CompanySettings).filter(CompanySettings.company_id == company.id).first()

    company_info = CAFPublicCompanyInfo(
        id=company.id,
        name=company.name,
        trade_name=getattr(company, "trade_name", None) or company.name,
        logo_url=getattr(settings, "brand_logo_url", None) or getattr(company, "logo", None),
        primary_color=getattr(settings, "brand_primary_color", None) or "#78350f",
        phone=getattr(company, "phone", None),
        address=f"{company.street or ''}, {company.number or ''} - {company.neighborhood or ''}, {company.city or ''} - {company.state or ''}".strip(" ,-")
    )

    # Identificação da mesa (aceita table_token seguro do QR Code ou número)
    table_info = None
    table_query = (mesa or token or "").strip()
    if table_query:
        table_obj = db.query(CAFTable).filter(
            CAFTable.company_id == company.id,
            (CAFTable.table_token == table_query) | (CAFTable.number == table_query),
            CAFTable.active == True
        ).first()
        if table_obj:
            table_info = CAFPublicTableInfo(
                id=table_obj.id,
                number=table_obj.number,
                table_token=table_obj.table_token,
                area=table_obj.area,
                status=table_obj.status
            )

    # Produtos ativos da empresa
    products_db = (
        db.query(Product)
        .options(joinedload(Product.category))
        .filter(
            Product.company_id == company.id,
            (Product.status == "ACTIVE") | (Product.status == None)
        )
        .order_by(Product.name.asc())
        .all()
    )

    # Carrega grupos de modificadores vinculados aos produtos
    all_prod_ids = [p.id for p in products_db]
    modifiers_by_prod = {}
    if all_prod_ids:
        links = (
            db.query(CAFProductModifier)
            .join(CAFModifierGroup, CAFProductModifier.group_id == CAFModifierGroup.id)
            .options(joinedload(CAFProductModifier.group).joinedload(CAFModifierGroup.options))
            .filter(
                CAFProductModifier.product_id.in_(all_prod_ids),
                CAFModifierGroup.active == True
            )
            .all()
        )
        for link in links:
            grp = link.group
            if grp:
                public_opts = [
                    CAFPublicModifierOption(
                        id=opt.id,
                        name=opt.name,
                        additional_price=opt.additional_price
                    )
                    for opt in (grp.options or [])
                    if opt.active
                ]
                public_grp = CAFPublicModifierGroup(
                    id=grp.id,
                    name=grp.name,
                    min_options=grp.min_selectable,
                    max_options=grp.max_selectable,
                    is_required=grp.min_selectable > 0,
                    options=public_opts
                )
                modifiers_by_prod.setdefault(link.product_id, []).append(public_grp)

    # Monta lista de produtos para o cardápio
    public_products = []
    categories_set = set()

    for p in products_db:
        cat_name = p.category.name if p.category else "Cafés & Bebidas"
        categories_set.add(cat_name)

        public_products.append(CAFPublicProductItem(
            id=p.id,
            title=p.name or "Item do Cardápio",
            description=getattr(p, "short_description", None) or getattr(p, "description", None),
            price=Decimal(str(p.base_price or 0)),
            cover_url=getattr(p, "cover_url", None),
            category=cat_name,
            is_available=True if (p.stock_quantity is None or p.stock_quantity > 0) else False,
            modifier_groups=modifiers_by_prod.get(p.id, [])
        ))

    # Ordena categorias com "Cafés" ou "Bebidas" no início
    sorted_categories = sorted(
        list(categories_set),
        key=lambda c: (
            0 if "caf" in c.lower() else
            1 if "bebid" in c.lower() else
            2 if "salgad" in c.lower() else
            3 if "doc" in c.lower() or "sobremes" in c.lower() else
            4,
            c
        )
    )

    return CAFPublicMenuResponse(
        company=company_info,
        table=table_info,
        categories=sorted_categories,
        products=public_products
    )


@public_router.post("/call-waiter", response_model=CAFCallWaiterResponse)
def call_waiter(
    payload: CAFCallWaiterRequest,
    db: Session = Depends(get_db)
):
    """
    Registra um chamado de garçom/atendimento pelo cliente na mesa.
    Exige o token seguro da mesa (table_token) para evitar fraudes/trotes.
    """
    company = db.query(Company).filter(Company.id == payload.company_id).first()
    if not company or not getattr(company, "module_cafeteria", False):
        raise HTTPException(status_code=404, detail="Estabelecimento não encontrado.")

    token_clean = (payload.table_token or "").strip()
    if not token_clean:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token da mesa é obrigatório para acionar o atendimento."
        )

    # Busca a mesa exclusivamente pelo table_token (ou número validado pelo token)
    table = db.query(CAFTable).filter(
        CAFTable.company_id == payload.company_id,
        CAFTable.table_token == token_clean,
        CAFTable.active == True
    ).first()

    if not table:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Mesa não identificada ou QR Code inválido/expirado."
        )

    table_desc = f"Mesa {table.number}" + (f" ({table.area})" if table.area else "")
    customer_info = f" pelo cliente {payload.customer_name}" if payload.customer_name else ""

    return CAFCallWaiterResponse(
        success=True,
        message=f"Atendente acionado para a {table_desc}{customer_info}! Já estamos nos dirigindo até você."
    )

import re
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.api.product_search import ensure_cronuz_product_record
from app.models.backorder import Backorder
from app.models.company import Company
from app.models.customer import Customer
from app.models.encomenda import CustomerEncomenda, CustomerEncomendaItem
from app.models.user import User
from app.schemas.backorder import BackorderCreate, BackorderResponse, BackorderUpdateStatus

router = APIRouter(prefix="/backorders", tags=["backorders"])

BACKORDER_STATUS_ALIASES = {
    "OPEN": "PENDING",
    "PURCHASE_ORDERED": "ORDER_PLACED",
    "RECEIVED_AT_STORE": "RECEIVED",
    "DELIVERED": "COMPLETED",
}


def _ensure_backorders_enabled(db: Session, user: User) -> int:
    """Garante que a empresa contratou e teve o módulo de Encomendas ativado pelo Master."""
    user_type = getattr(user, "type", None)
    if hasattr(user_type, "value"):
        user_type = user_type.value
    if user_type == "MASTER":
        return user.company_id or 1

    if not user.company_id:
        raise HTTPException(status_code=400, detail="Usuário sem empresa vinculada.")

    comp = db.query(Company).filter(Company.id == user.company_id).first()
    if not comp or not getattr(comp, "module_encomendas", False):
        raise HTTPException(
            status_code=403,
            detail="O Módulo de Encomendas não está ativo para a sua empresa. Solicite a ativação ao administrador Master.",
        )
    return user.company_id


@router.get("", response_model=List[BackorderResponse])
def list_backorders(
    status: Optional[str] = Query(None, description="Filtrar por status"),
    search: Optional[str] = Query(None, description="Buscar por ISBN, título ou cliente"),
    q: Optional[str] = Query(None, description="Alias de busca"),
    customer_id: Optional[int] = Query(None),
    page: Optional[int] = Query(None, ge=1),
    page_size: Optional[int] = Query(None, ge=1, le=200),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company_id = _ensure_backorders_enabled(db, current_user)

    effective_limit = page_size if page_size is not None else limit
    effective_offset = ((page - 1) * effective_limit) if page is not None else offset

    query = (
        db.query(Backorder)
        .options(joinedload(Backorder.customer))
        .filter(Backorder.company_id == company_id)
    )

    if status and status.strip().upper() != "ALL":
        raw_st = status.strip().upper()
        norm_st = BACKORDER_STATUS_ALIASES.get(raw_st, raw_st)
        if norm_st in ("GROUPED", "ORDER_PLACED"):
            query = query.filter(Backorder.status.in_(["GROUPED", "ORDER_PLACED"]))
        else:
            query = query.filter(Backorder.status == norm_st)

    if customer_id:
        query = query.filter(Backorder.customer_id == customer_id)

    effective_search = (search or q or "").strip()
    if effective_search:
        s = f"%{effective_search}%"
        clean_digits = re.sub(r"\D", "", effective_search)
        conditions = [
            Backorder.isbn.ilike(s),
            Backorder.title.ilike(s),
            Backorder.author.ilike(s),
            Backorder.publisher.ilike(s),
            Backorder.notes.ilike(s),
            Customer.name.ilike(s),
            Customer.document.ilike(s),
            Customer.phone.ilike(s),
        ]
        if clean_digits and clean_digits != effective_search:
            digits_term = f"%{clean_digits}%"
            conditions.extend([
                Backorder.isbn.ilike(digits_term),
                Customer.document.ilike(digits_term),
                Customer.phone.ilike(digits_term),
            ])
        query = query.outerjoin(Customer, Backorder.customer_id == Customer.id).filter(
            or_(*conditions)
        )

    orders = query.order_by(desc(Backorder.created_at)).offset(effective_offset).limit(effective_limit).all()
    return orders


@router.get("/metrics")
def get_backorder_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company_id = _ensure_backorders_enabled(db, current_user)

    counts = (
        db.query(Backorder.status, func.count(Backorder.id))
        .filter(Backorder.company_id == company_id)
        .group_by(Backorder.status)
        .all()
    )
    metric_map = {st: int(cnt) for st, cnt in counts}

    total = sum(metric_map.values())
    grouped_and_ordered = metric_map.get("GROUPED", 0) + metric_map.get("ORDER_PLACED", 0)
    return {
        "total": total,
        "pending": metric_map.get("PENDING", 0),
        "grouped": grouped_and_ordered,
        "order_placed": metric_map.get("ORDER_PLACED", 0),
        "received": metric_map.get("RECEIVED", 0),
        "notified": metric_map.get("NOTIFIED", 0),
        "completed": metric_map.get("COMPLETED", 0),
        "cancelled": metric_map.get("CANCELLED", 0),
    }


@router.post("", response_model=BackorderResponse)
def create_backorder(
    payload: BackorderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company_id = _ensure_backorders_enabled(db, current_user)

    customer_id = payload.customer_id
    if not customer_id and payload.customer_document:
        clean_doc = re.sub(r"\D", "", str(payload.customer_document))
        if clean_doc:
            existing_cst = (
                db.query(Customer)
                .filter(
                    Customer.company_id == company_id,
                    func.regexp_replace(Customer.document, r"\D", "", "g") == clean_doc,
                )
                .first()
            )

            if existing_cst:
                customer_id = existing_cst.id
                if payload.customer_phone and not existing_cst.phone:
                    existing_cst.phone = payload.customer_phone
                if payload.customer_email and not existing_cst.email:
                    existing_cst.email = payload.customer_email
                db.commit()
            else:
                ctype = "PJ" if len(clean_doc) > 11 else "PF"
                clean_name = (payload.customer_name or "Cliente Balcão").strip()
                new_cst = Customer(
                    company_id=company_id,
                    document=clean_doc,
                    name=clean_name,
                    corporate_name=clean_name,
                    customer_type=ctype,
                    phone=payload.customer_phone,
                    email=payload.customer_email,
                )
                db.add(new_cst)
                db.commit()
                db.refresh(new_cst)
                customer_id = new_cst.id

    prod_rec, has_horus, effective_cod = ensure_cronuz_product_record(
        db=db,
        company_id=company_id,
        isbn=payload.isbn,
        title=payload.title,
        publisher=payload.publisher,
        author=payload.author,
        unit_price=float(payload.price_estimated or 0.0),
        cover_url=payload.cover_url,
        horus_cod_item=payload.horus_cod_item,
        product_id=payload.product_id,
    )

    backorder = Backorder(
        company_id=company_id,
        customer_id=customer_id,
        product_id=prod_rec.id,
        isbn=payload.isbn.strip(),
        title=payload.title.strip(),
        publisher=payload.publisher.strip() if payload.publisher else None,
        author=payload.author.strip() if payload.author else None,
        quantity=payload.quantity,
        cover_url=payload.cover_url or prod_rec.cover_url,
        price_estimated=payload.price_estimated or 0.0,
        has_erp_registration=has_horus or bool(payload.has_erp_registration and effective_cod),
        horus_cod_item=effective_cod,
        origin=payload.origin or "BUSCA_PRECO",
        notes=payload.notes,
        status="PENDING",
        created_by=current_user.id,
    )
    db.add(backorder)
    db.commit()
    db.refresh(backorder)
    return backorder


@router.patch("/{backorder_id}/status", response_model=BackorderResponse)
def update_backorder_status(
    backorder_id: int,
    payload: BackorderUpdateStatus,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company_id = _ensure_backorders_enabled(db, current_user)

    valid_statuses = {"PENDING", "GROUPED", "ORDER_PLACED", "RECEIVED", "NOTIFIED", "COMPLETED", "CANCELLED"}
    raw_status = (payload.status or "").strip().upper()
    new_status = BACKORDER_STATUS_ALIASES.get(raw_status, raw_status)
    if new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Status inválido. Permitidos: {', '.join(valid_statuses)}")

    bo = (
        db.query(Backorder)
        .options(joinedload(Backorder.customer))
        .filter(Backorder.id == backorder_id, Backorder.company_id == company_id)
        .first()
    )

    if not bo:
        raise HTTPException(status_code=404, detail="Item de encomenda não encontrado.")

    bo.status = new_status
    if payload.notes:
        bo.notes = f"{bo.notes}\n[{new_status}]: {payload.notes}".strip() if bo.notes else payload.notes

    # Se este item de suprimento veio de uma Encomenda de Cliente ([ENC-YYYY-XXXX]), sincroniza o item lá também
    if bo.notes:
        match = re.match(r"^\[(ENC-\d{4}-\d+)\]", bo.notes.strip())
        if match:
            enc_num = match.group(1)
            enc = (
                db.query(CustomerEncomenda)
                .options(joinedload(CustomerEncomenda.items))
                .filter(
                    CustomerEncomenda.company_id == company_id,
                    CustomerEncomenda.encomenda_number == enc_num,
                )
                .first()
            )
            if enc:
                bo_to_item_status = {
                    "PENDING": "PENDING",
                    "GROUPED": "ORDERED",
                    "ORDER_PLACED": "ORDERED",
                    "RECEIVED": "RECEIVED",
                    "NOTIFIED": "RECEIVED",
                    "COMPLETED": "DELIVERED",
                    "CANCELLED": "CANCELLED",
                }
                mapped_item_st = bo_to_item_status.get(new_status)
                if mapped_item_st:
                    for it in enc.items:
                        if it.isbn == bo.isbn:
                            it.status = mapped_item_st
                    active_items = [it for it in enc.items if it.status != "CANCELLED"]
                    if active_items and all(it.status == "RECEIVED" for it in active_items):
                        if enc.status in ("OPEN", "PURCHASE_ORDERED"):
                            enc.status = "RECEIVED_AT_STORE"
                    elif active_items and all(it.status == "ORDERED" for it in active_items):
                        if enc.status == "OPEN":
                            enc.status = "PURCHASE_ORDERED"
                    elif active_items and all(it.status == "DELIVERED" for it in active_items):
                        enc.status = "DELIVERED"

    db.commit()
    db.refresh(bo)
    return bo

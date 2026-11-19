import re
import logging
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
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
from app.schemas.encomenda import (
    CustomerEncomendaCreate,
    CustomerEncomendaItemUpdateStatus,
    CustomerEncomendaMetrics,
    CustomerEncomendaResponse,
    CustomerEncomendaUpdateStatus,
)

logger = logging.getLogger("cronuz.encomendas")

router = APIRouter(prefix="/encomendas", tags=["encomendas"])

STATUS_MAPPING = {
    "PENDING": "OPEN",
    "GROUPED": "PURCHASE_ORDERED",
    "ORDER_PLACED": "PURCHASE_ORDERED",
    "RECEIVED": "RECEIVED_AT_STORE",
    "COMPLETED": "DELIVERED",
}

VALID_ENCOMENDA_STATUSES = {
    "OPEN",
    "PURCHASE_ORDERED",
    "RECEIVED_AT_STORE",
    "NOTIFIED",
    "DELIVERED",
    "CANCELLED",
}

ENCOMENDA_TO_BACKORDER_STATUS = {
    "OPEN": "PENDING",
    "PURCHASE_ORDERED": "ORDER_PLACED",
    "RECEIVED_AT_STORE": "RECEIVED",
    "NOTIFIED": "NOTIFIED",
    "DELIVERED": "COMPLETED",
    "CANCELLED": "CANCELLED",
}


def _normalize_encomenda_status(raw_status: str) -> str:
    clean = (raw_status or "").strip().upper()
    return STATUS_MAPPING.get(clean, clean)


def _ensure_module_encomendas(db: Session, user: User) -> int:
    """Valida se o usuário tem acesso e se o módulo de encomendas está ativo."""
    user_type = getattr(user, "type", None)
    if hasattr(user_type, "value"):
        user_type = user_type.value

    if user_type == "MASTER":
        return user.company_id or 1

    if not user.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuário sem empresa vinculada.",
        )

    company = db.query(Company).filter(Company.id == user.company_id).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empresa não localizada.",
        )

    if not getattr(company, "module_encomendas", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="O Módulo de Encomendas não está contratado ou ativado para esta empresa. Solicite a liberação ao Administrador Master.",
        )

    return user.company_id


def _generate_encomenda_number(db: Session, company_id: int) -> str:
    """Gera um número sequencial e amigável: ENC-2026-0001"""
    year = datetime.now().year
    prefix = f"ENC-{year}-"

    last = (
        db.query(CustomerEncomenda)
        .filter(
            CustomerEncomenda.company_id == company_id,
            CustomerEncomenda.encomenda_number.like(f"{prefix}%"),
        )
        .order_by(desc(CustomerEncomenda.id))
        .first()
    )

    seq = 1
    if last and last.encomenda_number:
        try:
            parts = last.encomenda_number.split("-")
            if len(parts) == 3:
                seq = int(parts[2]) + 1
        except Exception:
            seq = 1

    return f"{prefix}{seq:04d}"


def _resolve_or_create_customer(
    db: Session,
    company_id: int,
    customer_id: Optional[int],
    customer_name: str,
    customer_document: Optional[str],
    customer_phone: Optional[str],
    customer_email: Optional[str],
) -> Optional[int]:
    """Vincula cliente existente por CPF/CNPJ ou cria automaticamente sem duplicar."""
    if customer_id:
        existing = (
            db.query(Customer)
            .filter(Customer.id == customer_id, Customer.company_id == company_id)
            .first()
        )
        if existing:
            return existing.id

    clean_doc = re.sub(r"\D", "", customer_document or "")
    if not clean_doc:
        return None

    existing_cst = (
        db.query(Customer)
        .filter(
            Customer.company_id == company_id,
            func.regexp_replace(Customer.document, r"\D", "", "g") == clean_doc,
        )
        .first()
    )
    if existing_cst:
        if customer_phone and not existing_cst.phone:
            existing_cst.phone = customer_phone.strip()
        if customer_email and not existing_cst.email:
            existing_cst.email = customer_email.strip()
        return existing_cst.id

    if len(clean_doc) >= 11:
        ctype = "PJ" if len(clean_doc) > 11 else "PF"
        clean_name = (customer_name or "Cliente Balcão").strip()
        new_cst = Customer(
            company_id=company_id,
            document=clean_doc,
            name=clean_name,
            corporate_name=clean_name,
            customer_type=ctype,
            phone=customer_phone.strip() if customer_phone else None,
            email=customer_email.strip() if customer_email else None,
        )
        db.add(new_cst)
        db.flush()
        return new_cst.id

    return None


@router.get("/metrics", response_model=CustomerEncomendaMetrics)
def get_encomendas_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company_id = _ensure_module_encomendas(db, current_user)

    rows = (
        db.query(
            CustomerEncomenda.status,
            func.count(CustomerEncomenda.id),
            func.coalesce(func.sum(CustomerEncomenda.total_items), 0),
            func.coalesce(func.sum(CustomerEncomenda.total_amount), 0),
        )
        .filter(CustomerEncomenda.company_id == company_id)
        .group_by(CustomerEncomenda.status)
        .all()
    )

    counts = {}
    active_items = 0
    active_amount = Decimal("0.00")
    total_orders = 0

    for st, cnt, sum_items, sum_amt in rows:
        cnt_int = int(cnt or 0)
        counts[st] = cnt_int
        total_orders += cnt_int
        if st != "CANCELLED":
            active_items += int(sum_items or 0)
            active_amount += Decimal(str(sum_amt or "0.00"))

    return CustomerEncomendaMetrics(
        total=total_orders,
        total_open=counts.get("OPEN", 0),
        total_ordered=counts.get("PURCHASE_ORDERED", 0),
        total_received=counts.get("RECEIVED_AT_STORE", 0),
        total_notified=counts.get("NOTIFIED", 0),
        total_delivered=counts.get("DELIVERED", 0),
        total_cancelled=counts.get("CANCELLED", 0),
        total_items=active_items,
        total_amount=active_amount,
    )


@router.get("", response_model=List[CustomerEncomendaResponse])
def list_encomendas(
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company_id = _ensure_module_encomendas(db, current_user)

    query = (
        db.query(CustomerEncomenda)
        .options(joinedload(CustomerEncomenda.items))
        .filter(CustomerEncomenda.company_id == company_id)
    )

    if status_filter and status_filter.strip().upper() != "ALL":
        norm_status = _normalize_encomenda_status(status_filter)
        query = query.filter(CustomerEncomenda.status == norm_status)

    effective_search = (search or q or "").strip()
    if effective_search:
        term = f"%{effective_search}%"
        clean_digits = re.sub(r"\D", "", effective_search)
        filters = [
            CustomerEncomenda.encomenda_number.ilike(term),
            CustomerEncomenda.customer_name.ilike(term),
            CustomerEncomenda.customer_document.ilike(term),
            CustomerEncomenda.customer_phone.ilike(term),
            CustomerEncomenda.items.any(CustomerEncomendaItem.isbn.ilike(term)),
            CustomerEncomenda.items.any(CustomerEncomendaItem.title.ilike(term)),
        ]
        if clean_digits and clean_digits != effective_search:
            digits_term = f"%{clean_digits}%"
            filters.append(CustomerEncomenda.customer_document.ilike(digits_term))
            filters.append(CustomerEncomenda.customer_phone.ilike(digits_term))
            filters.append(CustomerEncomenda.items.any(CustomerEncomendaItem.isbn.ilike(digits_term)))
        query = query.filter(or_(*filters))

    encomendas = (
        query.order_by(desc(CustomerEncomenda.id))
        .offset(offset)
        .limit(limit)
        .all()
    )

    return encomendas


@router.post("", response_model=CustomerEncomendaResponse, status_code=status.HTTP_201_CREATED)
def create_encomenda(
    payload: CustomerEncomendaCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company_id = _ensure_module_encomendas(db, current_user)

    if not payload.items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A encomenda deve conter ao menos um título.",
        )

    clean_customer_name = (payload.customer_name or "").strip() or "Cliente Balcão"
    clean_doc = re.sub(r"\D", "", payload.customer_document or "") or None
    resolved_customer_id = _resolve_or_create_customer(
        db=db,
        company_id=company_id,
        customer_id=payload.customer_id,
        customer_name=clean_customer_name,
        customer_document=clean_doc,
        customer_phone=payload.customer_phone,
        customer_email=payload.customer_email,
    )

    raw_delivery = (payload.delivery_type or "BALCAO").strip().upper()
    delivery_type = "ENTREGA" if raw_delivery in ("ENTREGA", "HOME_DELIVERY", "DELIVERY") else "BALCAO"

    encomenda_num = _generate_encomenda_number(db, company_id)

    total_qty = 0
    total_val = Decimal("0.00")
    for it in payload.items:
        qty = max(1, it.quantity)
        u_price = Decimal(str(it.unit_price or "0.00"))
        total_qty += qty
        total_val += u_price * qty

    encomenda = CustomerEncomenda(
        company_id=company_id,
        encomenda_number=encomenda_num,
        customer_id=resolved_customer_id,
        customer_name=clean_customer_name,
        customer_document=clean_doc,
        customer_phone=payload.customer_phone.strip() if payload.customer_phone else None,
        customer_email=payload.customer_email.strip() if payload.customer_email else None,
        delivery_type=delivery_type,
        pickup_branch_name=payload.pickup_branch_name,
        shipping_zip_code=payload.shipping_zip_code,
        shipping_street=payload.shipping_street,
        shipping_number=payload.shipping_number,
        shipping_complement=payload.shipping_complement,
        shipping_neighborhood=payload.shipping_neighborhood,
        shipping_city=payload.shipping_city,
        shipping_state=payload.shipping_state,
        status="OPEN",
        total_items=total_qty,
        total_amount=total_val,
        notes=payload.notes.strip() if payload.notes else None,
        created_by=current_user.id,
    )

    db.add(encomenda)
    db.flush()

    note_suffix = f" - {payload.notes.strip()}" if payload.notes and payload.notes.strip() else ""

    for it in payload.items:
        qty = max(1, it.quantity)
        u_price = Decimal(str(it.unit_price or "0.00"))
        tot_price = u_price * qty
        clean_isbn = it.isbn.strip()
        clean_title = it.title.strip()
        clean_pub = it.publisher.strip() if it.publisher else None
        clean_author = it.author.strip() if it.author else None

        # Garante vínculo em prd_product (pré-cadastro no Cronuz se ainda não estiver no Hórus)
        prod_rec, has_horus, effective_cod = ensure_cronuz_product_record(
            db=db,
            company_id=company_id,
            isbn=clean_isbn,
            title=clean_title,
            publisher=clean_pub,
            author=clean_author,
            unit_price=float(u_price),
            cover_url=it.cover_url,
            horus_cod_item=it.horus_cod_item,
            product_id=it.product_id,
        )

        item_row = CustomerEncomendaItem(
            encomenda_id=encomenda.id,
            product_id=prod_rec.id,
            isbn=clean_isbn,
            title=clean_title,
            publisher=clean_pub,
            author=clean_author,
            cover_url=it.cover_url or prod_rec.cover_url,
            quantity=qty,
            unit_price=u_price,
            total_price=tot_price,
            has_erp_registration=has_horus,
            horus_cod_item=effective_cod,
            suggested_supplier_id=it.suggested_supplier_id,
            status="PENDING",
        )
        db.add(item_row)

        # Alimenta automaticamente a fila de suprimentos (ord_backorder)
        backorder_row = Backorder(
            company_id=company_id,
            customer_id=resolved_customer_id,
            product_id=prod_rec.id,
            isbn=clean_isbn,
            title=clean_title,
            publisher=clean_pub,
            author=clean_author,
            quantity=qty,
            cover_url=it.cover_url or prod_rec.cover_url,
            price_estimated=u_price,
            has_erp_registration=has_horus,
            horus_cod_item=effective_cod,
            suggested_supplier_id=it.suggested_supplier_id,
            origin="ENCOMENDA",
            notes=f"[{encomenda_num}]{note_suffix}",
            status="PENDING",
            created_by=current_user.id,
        )
        db.add(backorder_row)

    db.commit()
    db.refresh(encomenda)

    logger.info(
        "[Encomenda] Criada com sucesso: %s (ID %s) p/ cliente %s",
        encomenda.encomenda_number,
        encomenda.id,
        encomenda.customer_name,
    )
    return encomenda


@router.get("/{encomenda_id}", response_model=CustomerEncomendaResponse)
def get_encomenda(
    encomenda_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company_id = _ensure_module_encomendas(db, current_user)

    enc = (
        db.query(CustomerEncomenda)
        .options(joinedload(CustomerEncomenda.items))
        .filter(CustomerEncomenda.id == encomenda_id, CustomerEncomenda.company_id == company_id)
        .first()
    )
    if not enc:
        raise HTTPException(status_code=404, detail="Encomenda não encontrada.")

    return enc


@router.patch("/{encomenda_id}/status", response_model=CustomerEncomendaResponse)
def update_encomenda_status(
    encomenda_id: int,
    payload: CustomerEncomendaUpdateStatus,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company_id = _ensure_module_encomendas(db, current_user)

    enc = (
        db.query(CustomerEncomenda)
        .options(joinedload(CustomerEncomenda.items))
        .filter(CustomerEncomenda.id == encomenda_id, CustomerEncomenda.company_id == company_id)
        .first()
    )
    if not enc:
        raise HTTPException(status_code=404, detail="Encomenda não encontrada.")

    new_status = _normalize_encomenda_status(payload.status)
    if new_status not in VALID_ENCOMENDA_STATUSES:
        raise HTTPException(status_code=400, detail=f"Status inválido: {payload.status}")

    enc.status = new_status
    if payload.notes is not None and payload.notes.strip():
        enc.notes = payload.notes.strip()

    item_status_map = {
        "OPEN": "PENDING",
        "PURCHASE_ORDERED": "ORDERED",
        "RECEIVED_AT_STORE": "RECEIVED",
        "NOTIFIED": "RECEIVED",
        "DELIVERED": "DELIVERED",
        "CANCELLED": "CANCELLED",
    }
    mapped_item_st = item_status_map.get(new_status)
    if mapped_item_st:
        for item in enc.items:
            if item.status != "CANCELLED" or new_status == "CANCELLED":
                item.status = mapped_item_st

    # Sincroniza status na esteira de suprimentos vinculada ([ENC-YYYY-XXXX])
    mapped_bo_st = ENCOMENDA_TO_BACKORDER_STATUS.get(new_status)
    if mapped_bo_st and enc.encomenda_number:
        linked_backorders = (
            db.query(Backorder)
            .filter(
                Backorder.company_id == company_id,
                Backorder.notes.like(f"[{enc.encomenda_number}]%"),
            )
            .all()
        )
        for bo in linked_backorders:
            if bo.status != "CANCELLED" or new_status == "CANCELLED":
                bo.status = mapped_bo_st

    db.commit()
    db.refresh(enc)
    return enc


@router.patch("/{encomenda_id}/items/{item_id}/status", response_model=CustomerEncomendaResponse)
def update_encomenda_item_status(
    encomenda_id: int,
    item_id: int,
    payload: CustomerEncomendaItemUpdateStatus,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company_id = _ensure_module_encomendas(db, current_user)

    enc = (
        db.query(CustomerEncomenda)
        .options(joinedload(CustomerEncomenda.items))
        .filter(CustomerEncomenda.id == encomenda_id, CustomerEncomenda.company_id == company_id)
        .first()
    )
    if not enc:
        raise HTTPException(status_code=404, detail="Encomenda não encontrada.")

    valid_item_statuses = {"PENDING", "ORDERED", "RECEIVED", "DELIVERED", "CANCELLED"}
    new_item_status = (payload.status or "").strip().upper()
    if new_item_status not in valid_item_statuses:
        raise HTTPException(status_code=400, detail=f"Status de item inválido: {payload.status}")

    target_item = next((it for it in enc.items if it.id == item_id), None)
    if not target_item:
        raise HTTPException(status_code=404, detail="Item da encomenda não encontrado.")

    target_item.status = new_item_status

    # Promove automaticamente a encomenda caso todos os itens ativos tenham chegado
    active_items = [it for it in enc.items if it.status != "CANCELLED"]
    if active_items and all(it.status == "RECEIVED" for it in active_items):
        if enc.status in ("OPEN", "PURCHASE_ORDERED"):
            enc.status = "RECEIVED_AT_STORE"
    elif active_items and all(it.status == "DELIVERED" for it in active_items):
        enc.status = "DELIVERED"

    db.commit()
    db.refresh(enc)
    return enc


@router.delete("/{encomenda_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_encomenda(
    encomenda_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company_id = _ensure_module_encomendas(db, current_user)

    enc = (
        db.query(CustomerEncomenda)
        .options(joinedload(CustomerEncomenda.items))
        .filter(CustomerEncomenda.id == encomenda_id, CustomerEncomenda.company_id == company_id)
        .first()
    )
    if not enc:
        raise HTTPException(status_code=404, detail="Encomenda não encontrada.")

    enc.status = "CANCELLED"
    for item in enc.items:
        item.status = "CANCELLED"

    if enc.encomenda_number:
        linked_backorders = (
            db.query(Backorder)
            .filter(
                Backorder.company_id == company_id,
                Backorder.notes.like(f"[{enc.encomenda_number}]%"),
            )
            .all()
        )
        for bo in linked_backorders:
            bo.status = "CANCELLED"

    db.commit()
    return None

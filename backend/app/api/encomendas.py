from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc, func, or_
from typing import List, Optional
from datetime import datetime
from decimal import Decimal
import logging

from app.db.session import get_db
from app.models.encomenda import CustomerEncomenda, CustomerEncomendaItem
from app.models.company import Company
from app.models.customer import Customer
from app.models.user import User
from app.schemas.encomenda import (
    CustomerEncomendaCreate,
    CustomerEncomendaResponse,
    CustomerEncomendaUpdateStatus,
    CustomerEncomendaMetrics,
    CustomerEncomendaItemResponse
)
from app.core.dependencies import get_current_user

logger = logging.getLogger("cronuz.encomendas")

router = APIRouter(prefix="/encomendas", tags=["encomendas"])

def _ensure_module_encomendas(db: Session, user: User) -> int:
    """Valida se o usuário tem acesso e se o módulo de encomendas está ativo."""
    if user.type == "MASTER":
        return user.company_id or 1
    
    if not user.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuário sem empresa vinculada."
        )
    
    company = db.query(Company).filter(Company.id == user.company_id).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empresa não localizada."
        )
    
    if not getattr(company, "module_encomendas", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="O Módulo de Encomendas não está contratado ou ativado para esta empresa. Solicite a liberação ao Administrador Master."
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
            CustomerEncomenda.encomenda_number.like(f"{prefix}%")
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


@router.get("/metrics", response_model=CustomerEncomendaMetrics)
def get_encomendas_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company_id = _ensure_module_encomendas(db, current_user)
    
    query = db.query(CustomerEncomenda).filter(CustomerEncomenda.company_id == company_id)
    
    total_open = query.filter(CustomerEncomenda.status == "OPEN").count()
    total_ordered = query.filter(CustomerEncomenda.status == "PURCHASE_ORDERED").count()
    total_received = query.filter(CustomerEncomenda.status == "RECEIVED_AT_STORE").count()
    total_delivered = query.filter(CustomerEncomenda.status == "DELIVERED").count()
    
    items_agg = (
        db.query(
            func.coalesce(func.sum(CustomerEncomenda.total_items), 0),
            func.coalesce(func.sum(CustomerEncomenda.total_amount), 0)
        )
        .filter(CustomerEncomenda.company_id == company_id)
        .filter(CustomerEncomenda.status != "CANCELLED")
        .first()
    )
    
    return CustomerEncomendaMetrics(
        total_open=total_open,
        total_ordered=total_ordered,
        total_received=total_received,
        total_delivered=total_delivered,
        total_items=int(items_agg[0] or 0),
        total_amount=Decimal(str(items_agg[1] or "0.00"))
    )


@router.get("", response_model=List[CustomerEncomendaResponse])
def list_encomendas(
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
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
    
    if status_filter and status_filter.upper() != "ALL":
        query = query.filter(CustomerEncomenda.status == status_filter.upper())
        
    if search and search.strip():
        term = f"%{search.strip()}%"
        # Busca por número da encomenda, cliente, documento ou ISBN de algum item
        query = query.filter(
            or_(
                CustomerEncomenda.encomenda_number.ilike(term),
                CustomerEncomenda.customer_name.ilike(term),
                CustomerEncomenda.customer_document.ilike(term),
                CustomerEncomenda.customer_phone.ilike(term),
                CustomerEncomenda.items.any(CustomerEncomendaItem.isbn.ilike(term)),
                CustomerEncomenda.items.any(CustomerEncomendaItem.title.ilike(term)),
            )
        )
        
    encomendas = (
        query
        .order_by(desc(CustomerEncomenda.id))
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
            detail="A encomenda deve conter ao menos um título."
        )
        
    encomenda_num = _generate_encomenda_number(db, company_id)
    
    # Calcular totais
    total_qty = 0
    total_val = Decimal("0.00")
    for it in payload.items:
        qty = max(1, it.quantity)
        u_price = Decimal(str(it.unit_price or "0.00"))
        total_qty += qty
        total_val += (u_price * qty)
        
    encomenda = CustomerEncomenda(
        company_id=company_id,
        encomenda_number=encomenda_num,
        customer_id=payload.customer_id,
        customer_name=payload.customer_name.strip(),
        customer_document=payload.customer_document.strip() if payload.customer_document else None,
        customer_phone=payload.customer_phone.strip() if payload.customer_phone else None,
        customer_email=payload.customer_email.strip() if payload.customer_email else None,
        delivery_type=payload.delivery_type or "BALCAO",
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
        notes=payload.notes,
        created_by=current_user.id
    )
    
    db.add(encomenda)
    db.flush()
    
    for it in payload.items:
        qty = max(1, it.quantity)
        u_price = Decimal(str(it.unit_price or "0.00"))
        tot_price = u_price * qty
        
        item_row = CustomerEncomendaItem(
            encomenda_id=encomenda.id,
            isbn=it.isbn.strip(),
            title=it.title.strip(),
            publisher=it.publisher.strip() if it.publisher else None,
            author=it.author.strip() if it.author else None,
            cover_url=it.cover_url,
            quantity=qty,
            unit_price=u_price,
            total_price=tot_price,
            horus_cod_item=it.horus_cod_item,
            suggested_supplier_id=it.suggested_supplier_id,
            status="PENDING"
        )
        db.add(item_row)
        
    db.commit()
    db.refresh(encomenda)
    
    logger.info(f"[Encomenda] Criada com sucesso: {encomenda.encomenda_number} (ID {encomenda.id}) p/ cliente {encomenda.customer_name}")
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
        .filter(CustomerEncomenda.id == encomenda_id, CustomerEncomenda.company_id == company_id)
        .first()
    )
    if not enc:
        raise HTTPException(status_code=404, detail="Encomenda não encontrada.")
        
    status_mapping = {
        "PENDING": "OPEN",
        "GROUPED": "PURCHASE_ORDERED",
        "ORDER_PLACED": "PURCHASE_ORDERED",
        "RECEIVED": "RECEIVED_AT_STORE",
        "COMPLETED": "DELIVERED",
    }
    raw_status = payload.status.upper()
    new_status = status_mapping.get(raw_status, raw_status)
    valid_statuses = {"OPEN", "PURCHASE_ORDERED", "RECEIVED_AT_STORE", "NOTIFIED", "DELIVERED", "CANCELLED"}
    if new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Status inválido: {payload.status}")
        
    enc.status = new_status
    if payload.notes:
        enc.notes = payload.notes
        
    # Se a encomenda foi cancelada ou entregue, atualiza os itens
    if new_status in ("DELIVERED", "CANCELLED"):
        for item in enc.items:
            item.status = new_status
            
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
        .filter(CustomerEncomenda.id == encomenda_id, CustomerEncomenda.company_id == company_id)
        .first()
    )
    if not enc:
        raise HTTPException(status_code=404, detail="Encomenda não encontrada.")
        
    enc.status = "CANCELLED"
    for item in enc.items:
        item.status = "CANCELLED"
        
    db.commit()
    return None

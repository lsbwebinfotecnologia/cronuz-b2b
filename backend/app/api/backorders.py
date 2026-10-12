import re
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc, func
from typing import List, Optional

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.models.user import User, UserRole
from app.models.company import Company
from app.models.customer import Customer
from app.models.product import Product
from app.models.backorder import Backorder
from app.schemas.backorder import BackorderCreate, BackorderUpdateStatus, BackorderResponse

router = APIRouter(prefix="/backorders", tags=["backorders"])


def _ensure_backorders_enabled(db: Session, user: User):
    """Garante que a empresa contratou e teve o módulo de Encomendas ativado pelo Master."""
    user_type = getattr(user, "type", None)
    if hasattr(user_type, "value"):
        user_type = user_type.value
    if user_type == "MASTER":
        return

    if not user.company_id:
        raise HTTPException(status_code=400, detail="Usuário sem empresa vinculada.")

    comp = db.query(Company).filter(Company.id == user.company_id).first()
    if not comp or not getattr(comp, "module_encomendas", False):
        raise HTTPException(
            status_code=403,
            detail="O Módulo de Encomendas não está ativo para a sua empresa. Solicite a ativação ao administrador Master."
        )


@router.get("", response_model=List[BackorderResponse])
def list_backorders(
    status: Optional[str] = Query(None, description="Filtrar por status"),
    search: Optional[str] = Query(None, description="Buscar por ISBN, título ou cliente"),
    customer_id: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_backorders_enabled(db, current_user)

    q = db.query(Backorder).filter(Backorder.company_id == current_user.company_id)

    if status and status != "ALL":
        q = q.filter(Backorder.status == status.upper())

    if customer_id:
        q = q.filter(Backorder.customer_id == customer_id)

    if search:
        s = f"%{search.strip()}%"
        q = q.outerjoin(Customer, Backorder.customer_id == Customer.id).filter(
            or_(
                Backorder.isbn.ilike(s),
                Backorder.title.ilike(s),
                Backorder.author.ilike(s),
                Backorder.publisher.ilike(s),
                Customer.name.ilike(s),
                Customer.document.ilike(s),
            )
        )

    orders = q.order_by(desc(Backorder.created_at)).offset(offset).limit(limit).all()
    return orders

@router.get("/metrics")
def get_backorder_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_backorders_enabled(db, current_user)

    counts = (
        db.query(Backorder.status, func.count(Backorder.id))
        .filter(Backorder.company_id == current_user.company_id)
        .group_by(Backorder.status)
        .all()
    )
    metric_map = {status: count for status, count in counts}
    
    total = sum(metric_map.values())
    return {
        "total": total,
        "pending": metric_map.get("PENDING", 0),
        "grouped": metric_map.get("GROUPED", 0),
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
    _ensure_backorders_enabled(db, current_user)

    # 1. Resolução do Cliente (evita qualquer duplicação por CPF/CNPJ)
    customer_id = payload.customer_id
    if not customer_id and payload.customer_document:
        clean_doc = re.sub(r'\D', '', str(payload.customer_document))
        if clean_doc:
            existing_cst = db.query(Customer).filter(
                Customer.company_id == current_user.company_id,
                Customer.document == clean_doc
            ).first()

            if existing_cst:
                customer_id = existing_cst.id
                # Atualiza dados de contato caso enviados
                if payload.customer_phone and not existing_cst.phone:
                    existing_cst.phone = payload.customer_phone
                if payload.customer_email and not existing_cst.email:
                    existing_cst.email = payload.customer_email
                db.commit()
            else:
                # Cria novo cliente sem duplicidade
                new_cst = Customer(
                    company_id=current_user.company_id,
                    document=clean_doc,
                    name=(payload.customer_name or "Cliente Balcão").strip(),
                    corporate_name=(payload.customer_name or "Cliente Balcão").strip(),
                    phone=payload.customer_phone,
                    email=payload.customer_email,
                )
                db.add(new_cst)
                db.commit()
                db.refresh(new_cst)
                customer_id = new_cst.id

    # 2. Criação da Encomenda
    backorder = Backorder(
        company_id=current_user.company_id,
        customer_id=customer_id,
        isbn=payload.isbn.strip(),
        title=payload.title.strip(),
        publisher=payload.publisher.strip() if payload.publisher else None,
        author=payload.author.strip() if payload.author else None,
        quantity=payload.quantity,
        cover_url=payload.cover_url,
        price_estimated=payload.price_estimated or 0.0,
        has_erp_registration=payload.has_erp_registration,
        horus_cod_item=payload.horus_cod_item,
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
    _ensure_backorders_enabled(db, current_user)

    valid_statuses = {"PENDING", "GROUPED", "ORDER_PLACED", "RECEIVED", "NOTIFIED", "COMPLETED", "CANCELLED"}
    new_status = payload.status.upper().strip()
    if new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Status inválido. Permitidos: {', '.join(valid_statuses)}")

    bo = db.query(Backorder).filter(
        Backorder.id == backorder_id,
        Backorder.company_id == current_user.company_id
    ).first()

    if not bo:
        raise HTTPException(status_code=404, detail="Encomenda não encontrada.")

    bo.status = new_status
    if payload.notes:
        bo.notes = f"{bo.notes}\n[{new_status}]: {payload.notes}".strip() if bo.notes else payload.notes

    db.commit()
    db.refresh(bo)
    return bo

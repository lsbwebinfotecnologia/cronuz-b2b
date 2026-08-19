from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from datetime import datetime, timezone

from app.db.session import get_db
from app.models.alert import StoreAlert
from app.schemas.alert import AlertCreate, AlertUpdate, AlertResponse
from app.models.user import User
from app.core.dependencies import get_current_user, get_current_user_optional

router = APIRouter(tags=["alerts"])


# ---------------------------------------------------------------------------
# GET /store/alerts — público, sem auth obrigatória
# Filtra alertas ativos no momento: active=True + janela de datas
# ---------------------------------------------------------------------------
@router.get("/store/alerts", response_model=List[AlertResponse])
def get_store_alerts(
    company_id: int = Query(..., description="ID da empresa (seller)"),
    db: Session = Depends(get_db),
    _current_user: Optional[User] = Depends(get_current_user_optional),
):
    now = datetime.now(timezone.utc)

    alerts = (
        db.query(StoreAlert)
        .filter(
            StoreAlert.company_id == company_id,
            StoreAlert.active == True,
            or_(StoreAlert.starts_at == None, StoreAlert.starts_at <= now),
            or_(StoreAlert.ends_at == None, StoreAlert.ends_at >= now),
        )
        .order_by(StoreAlert.created_at.desc())
        .limit(10)
        .all()
    )
    return alerts


# ---------------------------------------------------------------------------
# GET /alerts — requer auth SELLER/MASTER/AGENT
# Lista todos os alertas da empresa do usuário logado
# ---------------------------------------------------------------------------
@router.get("/alerts", response_model=List[AlertResponse])
def list_alerts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.type not in ("SELLER", "MASTER", "AGENT"):
        raise HTTPException(status_code=403, detail="Acesso negado.")

    alerts = (
        db.query(StoreAlert)
        .filter(StoreAlert.company_id == current_user.company_id)
        .order_by(StoreAlert.created_at.desc())
        .all()
    )
    return alerts


# ---------------------------------------------------------------------------
# POST /alerts — requer auth SELLER/MASTER
# Cria novo alerta para a empresa do usuário logado
# ---------------------------------------------------------------------------
@router.post("/alerts", response_model=AlertResponse, status_code=201)
def create_alert(
    payload: AlertCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.type not in ("SELLER", "MASTER"):
        raise HTTPException(status_code=403, detail="Acesso negado. Apenas SELLER ou MASTER podem criar alertas.")

    alert = StoreAlert(
        **payload.model_dump(),
        company_id=current_user.company_id,
        created_by=current_user.id,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


# ---------------------------------------------------------------------------
# PUT /alerts/{alert_id} — requer auth SELLER/MASTER
# Atualiza alerta da própria empresa
# ---------------------------------------------------------------------------
@router.put("/alerts/{alert_id}", response_model=AlertResponse)
def update_alert(
    alert_id: int,
    payload: AlertUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.type not in ("SELLER", "MASTER"):
        raise HTTPException(status_code=403, detail="Acesso negado. Apenas SELLER ou MASTER podem editar alertas.")

    alert = db.query(StoreAlert).filter(
        StoreAlert.id == alert_id,
        StoreAlert.company_id == current_user.company_id,
    ).first()

    if not alert:
        raise HTTPException(status_code=404, detail="Alerta não encontrado.")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(alert, field, value)

    db.commit()
    db.refresh(alert)
    return alert


# ---------------------------------------------------------------------------
# DELETE /alerts/{alert_id} — requer auth SELLER/MASTER
# Remove alerta da própria empresa
# ---------------------------------------------------------------------------
@router.delete("/alerts/{alert_id}", status_code=204)
def delete_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.type not in ("SELLER", "MASTER"):
        raise HTTPException(status_code=403, detail="Acesso negado. Apenas SELLER ou MASTER podem remover alertas.")

    alert = db.query(StoreAlert).filter(
        StoreAlert.id == alert_id,
        StoreAlert.company_id == current_user.company_id,
    ).first()

    if not alert:
        raise HTTPException(status_code=404, detail="Alerta não encontrado.")

    db.delete(alert)
    db.commit()
    return None

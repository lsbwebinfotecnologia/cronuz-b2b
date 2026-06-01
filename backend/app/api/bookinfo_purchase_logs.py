"""
Endpoints para o master consultar logs do job automatico de pedidos de compra Bookinfo
e ativar/desativar a automacao por seller.

Acesso restrito a usuarios MASTER.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
import json
from datetime import datetime

from app.db.session import get_db
from app.models.user import User
from app.core.dependencies import get_current_user
from app.models.bookinfo_purchase_log import BookinfoPurchaseJobLog
from app.models.company_settings import CompanySettings
from app.models.company import Company
from app.models.bookinfo_supplier import BookinfoSupplier
from app.models.integrator import Integrator
from pydantic import BaseModel

router = APIRouter(prefix="/bookinfo-purchases/job-logs", tags=["bookinfo_purchase_logs"])


def _require_master(current_user: User):
    if current_user.type != "MASTER":
        raise HTTPException(status_code=403, detail="Acesso restrito ao MASTER.")


def _require_master_or_seller(current_user: User):
    if current_user.type not in ("MASTER", "SELLER"):
        raise HTTPException(status_code=403, detail="Acesso não autorizado.")


class AutoToggleRequest(BaseModel):
    bookinfo_purchase_auto: bool
    bookinfo_purchase_interval_minutes: Optional[int] = None


# -------------------------------------------------------------------
# Toggle de automacao por seller
# -------------------------------------------------------------------
@router.put("/settings/{company_id}/auto")
def toggle_purchase_auto(
    company_id: int,
    body: AutoToggleRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ativa/desativa o job automático e/ou atualiza o intervalo em minutos.
    MASTER pode alterar qualquer seller (toggle + intervalo).
    SELLER pode atualizar apenas o intervalo da própria empresa.
    """
    is_master = current_user.type == "MASTER"
    is_own_company = (
        current_user.type == "SELLER"
        and current_user.company_id == company_id
    )

    if not is_master and not is_own_company:
        raise HTTPException(
            status_code=403,
            detail="Acesso não autorizado para alterar configurações deste seller."
        )

    settings = db.query(CompanySettings).filter(
        CompanySettings.company_id == company_id
    ).first()

    if not settings:
        settings = CompanySettings(company_id=company_id)
        db.add(settings)

    # Somente MASTER pode ativar/desativar a automação
    if is_master:
        settings.bookinfo_purchase_auto = body.bookinfo_purchase_auto

    if body.bookinfo_purchase_interval_minutes is not None:
        interval = max(5, min(1440, body.bookinfo_purchase_interval_minutes))
        settings.bookinfo_purchase_interval_minutes = interval

    db.commit()
    db.refresh(settings)

    return {
        "company_id": company_id,
        "bookinfo_purchase_auto": settings.bookinfo_purchase_auto,
        "bookinfo_purchase_interval_minutes": settings.bookinfo_purchase_interval_minutes,
    }



# -------------------------------------------------------------------
# Limpar logs de um seller
# -------------------------------------------------------------------
@router.delete("/clear/{company_id}")
def clear_company_logs(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove todos os registros de log do job de compras para um seller.
    MASTER pode limpar qualquer seller.
    SELLER só pode limpar seus próprios logs.
    """
    is_master = current_user.type == "MASTER"
    is_own_company = (
        current_user.type == "SELLER"
        and current_user.company_id == company_id
    )

    if not is_master and not is_own_company:
        raise HTTPException(
            status_code=403,
            detail="Acesso não autorizado para limpar logs deste seller."
        )

    deleted = db.query(BookinfoPurchaseJobLog).filter(
        BookinfoPurchaseJobLog.company_id == company_id
    ).delete(synchronize_session=False)
    db.commit()

    return {"company_id": company_id, "deleted": deleted}


# -------------------------------------------------------------------
# Resumo consolidado por seller (ultimo run, totais)
# -------------------------------------------------------------------
@router.get("/summary")
def get_job_logs_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retorna um resumo consolidado por seller.
    MASTER vê todos os sellers com Bookinfo configurado.
    SELLER vê apenas a própria empresa.
    A verificação de "API Key" usa a tabela Integrator (platform=BOOKINFO, active=True).
    """
    _require_master_or_seller(current_user)

    # Busca todos os sellers que tem integrador Bookinfo ativo
    bookinfo_integrators = db.query(Integrator).filter(
        Integrator.platform == "BOOKINFO",
        Integrator.active == True,  # noqa: E712
    )
    if current_user.type == "SELLER":
        bookinfo_integrators = bookinfo_integrators.filter(
            Integrator.company_id == current_user.company_id
        )
    bookinfo_integrators = bookinfo_integrators.all()

    # Monta set de company_ids com Bookinfo configurado
    bookinfo_company_ids = {i.company_id for i in bookinfo_integrators}

    # Também inclui sellers que tenham bookinfo_purchase_auto ativo (mesmo sem integrador ativo)
    auto_settings = db.query(CompanySettings).filter(
        CompanySettings.bookinfo_purchase_auto == True  # noqa: E712
    )
    if current_user.type == "SELLER":
        auto_settings = auto_settings.filter(
            CompanySettings.company_id == current_user.company_id
        )
    for s in auto_settings.all():
        bookinfo_company_ids.add(s.company_id)

    if not bookinfo_company_ids:
        return []

    result = []
    for company_id in sorted(bookinfo_company_ids):
        company = db.query(Company).filter(Company.id == company_id).first()
        if not company:
            continue

        settings = db.query(CompanySettings).filter(
            CompanySettings.company_id == company_id
        ).first()

        has_bookinfo_active = company_id in {i.company_id for i in bookinfo_integrators}

        # Ultimo log desse seller
        last_log = db.query(BookinfoPurchaseJobLog).filter(
            BookinfoPurchaseJobLog.company_id == company_id
        ).order_by(BookinfoPurchaseJobLog.run_at.desc()).first()

        # Contadores acumulados (ultimos 30 dias)
        from sqlalchemy import func as sqlfunc
        from datetime import timedelta
        cutoff = datetime.utcnow() - timedelta(days=30)
        agg = db.query(
            sqlfunc.sum(BookinfoPurchaseJobLog.orders_sent).label("total_sent"),
            sqlfunc.sum(BookinfoPurchaseJobLog.orders_error).label("total_error"),
            sqlfunc.sum(BookinfoPurchaseJobLog.syncs_done).label("total_syncs"),
        ).filter(
            BookinfoPurchaseJobLog.company_id == company_id,
            BookinfoPurchaseJobLog.run_at >= cutoff,
        ).first()

        supplier_count = db.query(BookinfoSupplier).filter(
            BookinfoSupplier.company_id == company_id
        ).count()

        result.append({
            "company_id": company_id,
            "company_name": company.name,
            "bookinfo_purchase_auto": settings.bookinfo_purchase_auto if settings else False,
            "bookinfo_purchase_interval_minutes": getattr(settings, "bookinfo_purchase_interval_minutes", 15) if settings else 15,
            "bookinfo_api_key_set": has_bookinfo_active,
            "supplier_count": supplier_count,
            "last_run_at": last_log.run_at.isoformat() if last_log else None,
            "last_status": last_log.status if last_log else None,
            "last_orders_found": last_log.orders_found if last_log else 0,
            "last_orders_sent": last_log.orders_sent if last_log else 0,
            "last_orders_error": last_log.orders_error if last_log else 0,
            "last_syncs_done": last_log.syncs_done if last_log else 0,
            "total_sent_30d": int(agg.total_sent or 0),
            "total_error_30d": int(agg.total_error or 0),
            "total_syncs_30d": int(agg.total_syncs or 0),
        })

    return result


# -------------------------------------------------------------------
# Historico de logs paginado (por seller ou global)
# -------------------------------------------------------------------
@router.get("")
def list_job_logs(
    company_id: Optional[int] = Query(None, description="Filtrar por seller"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista o historico de execucoes do job, paginado."""
    _require_master_or_seller(current_user)

    query = db.query(BookinfoPurchaseJobLog).order_by(
        BookinfoPurchaseJobLog.run_at.desc()
    )

    # SELLER so pode ver sua propria empresa
    if current_user.type == "SELLER":
        query = query.filter(BookinfoPurchaseJobLog.company_id == current_user.company_id)
    elif company_id:
        query = query.filter(BookinfoPurchaseJobLog.company_id == company_id)

    total = query.count()
    logs = query.offset((page - 1) * limit).limit(limit).all()

    items = []
    for log in logs:
        # Parseia details JSON para incluir na resposta
        details_parsed = None
        if log.details:
            try:
                details_parsed = json.loads(log.details)
            except Exception:
                details_parsed = log.details

        items.append({
            "id": log.id,
            "company_id": log.company_id,
            "supplier_id": log.supplier_id,
            "supplier_name": log.supplier_name,
            "run_at": log.run_at.isoformat() if log.run_at else None,
            "orders_found": log.orders_found,
            "orders_sent": log.orders_sent,
            "orders_skipped": log.orders_skipped,
            "orders_error": log.orders_error,
            "syncs_done": log.syncs_done,
            "syncs_error": log.syncs_error,
            "status": log.status,
            "details": details_parsed,
        })

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "items": items,
    }


# -------------------------------------------------------------------
# Detalhes de um log especifico
# -------------------------------------------------------------------
@router.get("/{log_id}")
def get_job_log_detail(
    log_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retorna os detalhes completos de uma execucao especifica do job."""
    _require_master_or_seller(current_user)

    q = db.query(BookinfoPurchaseJobLog).filter(BookinfoPurchaseJobLog.id == log_id)
    # SELLER so pode ver sua propria empresa
    if current_user.type == "SELLER":
        q = q.filter(BookinfoPurchaseJobLog.company_id == current_user.company_id)

    log = q.first()
    if not log:
        raise HTTPException(status_code=404, detail="Log nao encontrado.")

    details_parsed = None
    if log.details:
        try:
            details_parsed = json.loads(log.details)
        except Exception:
            details_parsed = log.details

    return {
        "id": log.id,
        "company_id": log.company_id,
        "supplier_id": log.supplier_id,
        "supplier_name": log.supplier_name,
        "run_at": log.run_at.isoformat() if log.run_at else None,
        "orders_found": log.orders_found,
        "orders_sent": log.orders_sent,
        "orders_skipped": log.orders_skipped,
        "orders_error": log.orders_error,
        "syncs_done": log.syncs_done,
        "syncs_error": log.syncs_error,
        "status": log.status,
        "details": details_parsed,
    }

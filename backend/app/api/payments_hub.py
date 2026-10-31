"""
payments_hub.py
---------------
Hub de Pagamentos do Master: habilitação de intermediadores e roteamento canal × forma por seller.

  GET   /companies/{id}/payments/hub                    → catálogo + habilitação + status + rotas
  PATCH /companies/{id}/payments/providers/{provider}   → habilita/desabilita (somente MASTER)
  PUT   /companies/{id}/payments/routes                 → define a matriz canal × forma (somente MASTER)
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_master_user
from app.core.utils import assert_company_ownership
from app.db.session import get_db
from app.models.company import Company
from app.models.company_settings import CompanySettings
from app.models.payments import PAY_PROVIDERS, PayChannelRoute, PayProviderEnablement
from app.payments.base import PaymentProviderError
from app.payments.catalog import CHANNEL_CATALOG, METHOD_LABELS, PROVIDER_CATALOG, provider_config_status
from app.payments.registry import enabled_providers, routes_map, validate_route

router = APIRouter()
logger = logging.getLogger(__name__)


def _company_or_404(db: Session, company_id: int) -> Company:
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")
    return company


def _hub(db: Session, company_id: int) -> dict:
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    enabled = set(enabled_providers(db, company_id))
    providers = []
    for code in PAY_PROVIDERS:
        meta = PROVIDER_CATALOG[code]
        providers.append({
            "code": code,
            "name": meta["name"],
            "methods": meta["methods"],
            "config_location": meta["config_location"],
            "operational": meta["operational"],
            "enabled": code in enabled,
            **provider_config_status(db, company_id, code, settings),
        })
    return {
        "providers": providers,
        "channels": CHANNEL_CATALOG,
        "method_labels": METHOD_LABELS,
        "routes": routes_map(db, company_id),
    }


@router.get("/companies/{company_id}/payments/hub")
def get_payments_hub(company_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    assert_company_ownership(current_user, company_id)   # seller pode visualizar; alterações são do Master
    _company_or_404(db, company_id)
    return _hub(db, company_id)


class ProviderTogglePayload(BaseModel):
    enabled: bool


@router.patch("/companies/{company_id}/payments/providers/{provider}")
def toggle_payment_provider(
    company_id: int,
    provider: str,
    payload: ProviderTogglePayload,
    db: Session = Depends(get_db),
    current_user=Depends(require_master_user),
):
    _company_or_404(db, company_id)
    code = provider.upper()
    if code not in PAY_PROVIDERS:
        raise HTTPException(status_code=400, detail="Intermediador inválido.")

    row = db.query(PayProviderEnablement).filter(
        PayProviderEnablement.company_id == company_id, PayProviderEnablement.provider == code
    ).first()
    if row is None:
        row = PayProviderEnablement(company_id=company_id, provider=code)
        db.add(row)
    row.enabled = payload.enabled
    row.changed_by_user_id = current_user.id

    removed_routes = 0
    if not payload.enabled:
        # Sem intermediador habilitado, a rota deixa de valer: remove para não haver roteamento órfão
        removed_routes = db.query(PayChannelRoute).filter(
            PayChannelRoute.company_id == company_id, PayChannelRoute.provider == code
        ).delete(synchronize_session=False)

    db.commit()
    logger.info("[PaymentsHub] %s %s company=%s por user=%s (rotas removidas=%s)",
                code, "habilitado" if payload.enabled else "desabilitado", company_id, current_user.id, removed_routes)
    return {"removed_routes": removed_routes, **_hub(db, company_id)}


class RouteItem(BaseModel):
    channel: str
    method: str
    provider: Optional[str] = None   # None = sem intermediador para a célula


class RoutesPayload(BaseModel):
    routes: List[RouteItem]


@router.put("/companies/{company_id}/payments/routes")
def update_payment_routes(
    company_id: int,
    payload: RoutesPayload,
    db: Session = Depends(get_db),
    current_user=Depends(require_master_user),
):
    _company_or_404(db, company_id)
    enabled = set(enabled_providers(db, company_id))
    existing = {
        (r.channel, r.method): r
        for r in db.query(PayChannelRoute).filter(PayChannelRoute.company_id == company_id).all()
    }
    for item in payload.routes:
        channel, method = item.channel.upper(), item.method.upper()
        provider = item.provider.upper() if item.provider else None
        try:
            validate_route(provider, channel, method)
        except PaymentProviderError as e:
            raise HTTPException(status_code=400, detail=str(e))
        if provider and provider not in enabled:
            raise HTTPException(status_code=400, detail=f"{PROVIDER_CATALOG[provider]['name']} não está habilitado para este seller.")

        row = existing.get((channel, method))
        if provider is None:
            if row:
                db.delete(row)
        elif row:
            row.provider = provider
            row.changed_by_user_id = current_user.id
        else:
            db.add(PayChannelRoute(company_id=company_id, channel=channel, method=method,
                                   provider=provider, changed_by_user_id=current_user.id))
    db.commit()
    return _hub(db, company_id)

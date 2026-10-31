"""
registry.py
-----------
Habilitação (Master), roteamento canal × forma e instanciação dos provedores.
"""
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.payments import PAY_PROVIDERS, PayChannelRoute, PayProviderEnablement
from app.payments.base import PaymentProvider, PaymentProviderError
from app.payments.catalog import CHANNEL_CATALOG, PROVIDER_CATALOG


def enabled_providers(db: Session, company_id: int) -> List[str]:
    providers = [
        p for (p,) in db.query(PayProviderEnablement.provider).filter(
            PayProviderEnablement.company_id == company_id, PayProviderEnablement.enabled.is_(True)
        ).all()
    ]
    if "CORA" not in providers:
        from app.models.company import Company
        if db.query(Company.id).filter(Company.id == company_id, getattr(Company, "module_cora", False).is_(True)).first():
            providers.append("CORA")
    return providers


def is_enabled(db: Session, company_id: int, provider: str) -> bool:
    row = db.query(PayProviderEnablement.id).filter(
        PayProviderEnablement.company_id == company_id,
        PayProviderEnablement.provider == provider,
        PayProviderEnablement.enabled.is_(True),
    ).first()
    if row is not None:
        return True
    if provider == "CORA":
        from app.models.company import Company
        return db.query(Company.id).filter(Company.id == company_id, getattr(Company, "module_cora", False).is_(True)).first() is not None
    return False


def routes_map(db: Session, company_id: int) -> Dict[str, Dict[str, str]]:
    out: Dict[str, Dict[str, str]] = {}
    for r in db.query(PayChannelRoute).filter(PayChannelRoute.company_id == company_id).all():
        out.setdefault(r.channel, {})[r.method] = r.provider
    return out


def resolve_provider_code(db: Session, company_id: int, channel: str, method: str) -> str:
    route = db.query(PayChannelRoute).filter(
        PayChannelRoute.company_id == company_id, PayChannelRoute.channel == channel, PayChannelRoute.method == method
    ).first()
    if not route:
        raise PaymentProviderError("Nenhum intermediador definido para este canal e forma de pagamento no Hub de Pagamentos.")
    return route.provider


def validate_route(provider: Optional[str], channel: str, method: str) -> None:
    channel_def = next((c for c in CHANNEL_CATALOG if c["code"] == channel), None)
    if not channel_def:
        raise PaymentProviderError(f"Canal inválido: {channel}.")
    if method not in channel_def["methods"]:
        raise PaymentProviderError(f"A forma {method} não se aplica ao canal {channel_def['name']}.")
    if provider is not None:
        if provider not in PAY_PROVIDERS:
            raise PaymentProviderError(f"Intermediador inválido: {provider}.")
        if method not in PROVIDER_CATALOG[provider]["methods"]:
            raise PaymentProviderError(f"{PROVIDER_CATALOG[provider]['name']} não suporta {method}.")


def get_provider(db: Session, company_id: int, provider: str, environment: Optional[str] = None) -> PaymentProvider:
    """Instancia o provedor (exige habilitação pelo Master e implementação operacional)."""
    if not is_enabled(db, company_id, provider):
        raise PaymentProviderError(f"{PROVIDER_CATALOG.get(provider, {}).get('name', provider)} não está habilitado para esta empresa.")
    if provider == "CORA":
        from app.payments.providers.cora import CoraProvider
        return CoraProvider(db, company_id, environment=environment)
    raise PaymentProviderError(
        f"{PROVIDER_CATALOG.get(provider, {}).get('name', provider)} ainda não opera pelo Hub de Pagamentos."
    )

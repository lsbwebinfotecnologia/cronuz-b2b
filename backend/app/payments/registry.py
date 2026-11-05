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
    from app.models.company import Company
    from app.models.company_settings import CompanySettings
    from app.payments.catalog import provider_config_status

    if "CORA" not in providers:
        if db.query(Company.id).filter(Company.id == company_id, getattr(Company, "module_cora", False).is_(True)).first():
            providers.append("CORA")

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    for code in PAY_PROVIDERS:
        if code not in providers:
            st = provider_config_status(db, company_id, code, settings)
            if st.get("configured"):
                providers.append(code)
    return providers


def default_channel_modes(settings=None, routes: Optional[Dict[str, Dict[str, str]]] = None) -> Dict[str, dict]:
    """
    Retorna o modo de finalização de cada canal:
      - mode: 'PER_METHOD' (Checkout Transparente: 1 provedor por Forma de Pagamento)
              | 'PAYMENT_LINK' (Finalizador Único no Fim da Venda via Link Hospedado, ex: Vindi)
              | 'TRAY_REDIRECT' (Finalizador Único enviando carrinho para a Tray)
      - link_provider: 'VINDI' | 'EFI' | 'CIELO' | 'REDE'
      - express_cpf_only: bool (No Link Vindi, solicitar apenas CPF no storefront)
      - allow_horus_invoicing: bool (No B2B, manter faturamento Horus ERP 28/56d além dos meios online)
    """
    raw_cfg = getattr(settings, "b2c_showcases_config", None) if settings else None
    raw_cfg = raw_cfg if isinstance(raw_cfg, dict) else {}
    saved_modes = raw_cfg.get("payment_channel_modes") if isinstance(raw_cfg.get("payment_channel_modes"), dict) else {}
    vindi_cfg = raw_cfg.get("vindi_config") if isinstance(raw_cfg.get("vindi_config"), dict) else {}

    b2c_checkout_mode = getattr(settings, "b2c_checkout_mode", "NATIVE_GATEWAY") if settings else "NATIVE_GATEWAY"
    active_gw = (getattr(settings, "payment_gateway_active", "EFI") or "EFI").upper() if settings else "EFI"
    vindi_int_mode = str(vindi_cfg.get("integration_mode") or "TRANSPARENT").upper()
    vindi_express = bool(vindi_cfg.get("express_cpf_only", True))

    inferred_b2c_mode = "PER_METHOD"
    if b2c_checkout_mode == "TRAY_REDIRECT" and getattr(settings, "tray_enabled", False):
        inferred_b2c_mode = "TRAY_REDIRECT"
    elif active_gw == "VINDI" and vindi_int_mode == "PAYMENT_LINK":
        inferred_b2c_mode = "PAYMENT_LINK"
    elif routes and routes.get("B2C_STOREFRONT", {}).get("LINK") and not any(
        routes.get("B2C_STOREFRONT", {}).get(m) for m in ("CARD", "PIX", "BOLETO")
    ):
        inferred_b2c_mode = "PAYMENT_LINK"

    defaults = {
        "B2C_STOREFRONT": {
            "mode": inferred_b2c_mode,
            "link_provider": (routes or {}).get("B2C_STOREFRONT", {}).get("LINK") or ("VINDI" if active_gw == "VINDI" else "VINDI"),
            "express_cpf_only": vindi_express,
        },
        "SCHOOLS": {
            "mode": "PER_METHOD",
            "link_provider": "VINDI",
            "express_cpf_only": True,
        },
        "SUBSCRIPTIONS": {
            "mode": "PER_METHOD",
            "link_provider": "VINDI",
            "express_cpf_only": False,
        },
        "B2B_STOREFRONT": {
            "mode": "PER_METHOD",
            "link_provider": "VINDI",
            "allow_horus_invoicing": True,
        },
        "INVOICES": {
            "mode": "PER_METHOD",
        },
        "FINANCIAL": {
            "mode": "PER_METHOD",
        },
        "PDV": {
            "mode": "PER_METHOD",
        },
    }

    out: Dict[str, dict] = {}
    for ch_code, def_val in defaults.items():
        custom = saved_modes.get(ch_code)
        if isinstance(custom, dict):
            out[ch_code] = {**def_val, **custom}
        else:
            out[ch_code] = dict(def_val)
    return out


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

    # Se o seller ainda não salvou rotas na matriz para B2C_STOREFRONT, espelha o gateway ativo legado
    if "B2C_STOREFRONT" not in out:
        from app.models.company_settings import CompanySettings
        settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
        if settings:
            active_gw = (getattr(settings, "payment_gateway_active", "EFI") or "EFI").upper()
            if active_gw in PAY_PROVIDERS:
                b2c_map: Dict[str, str] = {}
                if "CARD" in PROVIDER_CATALOG[active_gw]["methods"]:
                    b2c_map["CARD"] = active_gw
                if "PIX" in PROVIDER_CATALOG[active_gw]["methods"]:
                    b2c_map["PIX"] = active_gw
                if "LINK" in PROVIDER_CATALOG[active_gw]["methods"]:
                    b2c_map["LINK"] = active_gw
                if b2c_map:
                    out["B2C_STOREFRONT"] = b2c_map
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

"""
catalog.py
----------
Metadados dos intermediadores exibidos no Hub do Master.

`config_location`:
  - "HUB"             → configurado na tela própria do provedor (Master/Seller), credenciais em tabela própria.
  - "SELLER_SETTINGS" → configuração legada em Configurações > Pagamentos do seller (cmp_settings) — migra na fase 5.
`operational`: True quando a emissão via Hub (pay_charge) já está implementada para o provedor.
"""
from typing import Dict, List

from sqlalchemy.orm import Session

PROVIDER_CATALOG: Dict[str, dict] = {
    "CORA":  {"name": "Banco Cora",  "methods": ["BOLETO", "PIX"],                  "config_location": "HUB",             "operational": True},
    "INTER": {"name": "Banco Inter", "methods": ["BOLETO", "PIX"],                  "config_location": "SELLER_SETTINGS", "operational": False},
    "EFI":   {"name": "Efí Bank",    "methods": ["BOLETO", "PIX", "CARD", "LINK"],  "config_location": "SELLER_SETTINGS", "operational": False},
    "VINDI": {"name": "Vindi",       "methods": ["BOLETO", "PIX", "CARD", "LINK"],  "config_location": "SELLER_SETTINGS", "operational": False},
    "CIELO": {"name": "Cielo",       "methods": ["PIX", "CARD", "LINK"],            "config_location": "SELLER_SETTINGS", "operational": False},
    "REDE":  {"name": "Rede",        "methods": ["CARD", "LINK"],                   "config_location": "SELLER_SETTINGS", "operational": False},
}

METHOD_LABELS = {"BOLETO": "Boleto", "PIX": "Pix", "CARD": "Cartão", "LINK": "Link de pagamento"}

CHANNEL_CATALOG: List[dict] = [
    {"code": "FINANCIAL",       "name": "Financeiro (lançamentos / Horus)", "methods": ["BOLETO", "PIX"]},
    {"code": "B2B_STOREFRONT",  "name": "Storefront B2B",                   "methods": ["BOLETO", "PIX", "CARD"]},
    {"code": "B2C_STOREFRONT",  "name": "Storefront B2C",                   "methods": ["BOLETO", "PIX", "CARD"]},
    {"code": "SUBSCRIPTIONS",   "name": "Assinaturas / Portal do Cliente",  "methods": ["BOLETO", "PIX", "CARD"]},
    {"code": "SCHOOLS",         "name": "Storefront de Escolas",            "methods": ["BOLETO", "PIX", "CARD"]},
    {"code": "PDV",             "name": "PDV",                              "methods": ["PIX", "CARD"]},
    {"code": "PAYMENT_LINK",    "name": "Link de pagamento avulso",         "methods": ["LINK"]},
]


def provider_config_status(db: Session, company_id: int, provider: str, settings=None) -> dict:
    """Retorna {configured: bool, detail: str} sem expor credenciais."""
    if provider == "CORA":
        from app.models.cora import CoraAccount, CoraConfig
        cfg = db.query(CoraConfig).filter(CoraConfig.company_id == company_id).first()
        env = cfg.active_environment if cfg else "STAGE"
        acc = db.query(CoraAccount).filter(CoraAccount.company_id == company_id, CoraAccount.environment == env).first()
        ok = bool(acc and acc.client_id and acc.cert_content and acc.key_content)
        detail = f"Ambiente ativo: {'Produção' if env == 'PRODUCTION' else 'Stage'}"
        if acc and acc.last_test_ok is False:
            detail += " · último teste com falha"
        elif acc and acc.last_test_ok:
            detail += " · conexão testada"
        return {"configured": ok, "detail": detail if ok else "Credenciais não cadastradas"}

    s = settings
    if provider == "INTER":
        ok = bool(s and s.inter_client_id and (s.inter_cert_content or s.inter_cert_path))
    elif provider == "EFI":
        ok = bool(s and s.efi_client_id and s.efi_client_secret)
    elif provider == "VINDI":
        ok = bool(s and s.vindi_api_key)
    elif provider == "CIELO":
        ok = bool(s and s.cielo_merchant_id)
    elif provider == "REDE":
        ok = bool(s and s.rede_pv and s.rede_token)
    else:
        ok = False
    return {"configured": ok, "detail": "Configurado pelo seller em Configurações > Pagamentos" if ok else "Não configurado"}

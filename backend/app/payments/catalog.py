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

METHOD_LABELS = {"BOLETO": "Boleto Bancário", "PIX": "PIX Instantâneo", "CARD": "Cartão de Crédito", "LINK": "Link de Pagamento (Fim da Venda)"}

CHANNEL_CATALOG: List[dict] = [
    {
        "code": "B2C_STOREFRONT",
        "name": "Storefront B2C (Loja Virtual & Cupons CPF)",
        "short_name": "1. Loja Virtual B2C",
        "description": "E-commerce B2C (/loja/...), domínio próprio e pagamento de diferença de cupons/vale-livro.",
        "methods": ["CARD", "PIX", "BOLETO", "LINK"],
        "supports_checkout_finisher": True,
        "primary_usage": True,
    },
    {
        "code": "SCHOOLS",
        "name": "Eventos Escolares & Feiras do Livro (/evento/...)",
        "short_name": "2. Eventos Escolares",
        "description": "Projeto de feiras literárias, adoção escolar, Amigo Secreto e sacola de compras dos pais/alunos.",
        "methods": ["CARD", "PIX", "BOLETO", "LINK"],
        "supports_checkout_finisher": True,
        "primary_usage": True,
    },
    {
        "code": "SUBSCRIPTIONS",
        "name": "Clube de Assinaturas & Recorrência",
        "short_name": "3. Assinaturas",
        "description": "Planos recorrentes, fascículos, pré-venda e cobranças periódicas de assinantes (/subscriptions).",
        "methods": ["CARD", "PIX", "BOLETO", "LINK"],
        "supports_checkout_finisher": True,
        "primary_usage": True,
    },
    {
        "code": "B2B_STOREFRONT",
        "name": "Storefront B2B (Portal Atacado & Propostas)",
        "short_name": "4. Atacado B2B",
        "description": "Pedidos CNPJ de livrarias e distribuidores (integra faturamento Horus ERP 28/56d e/ou pagamento imediato).",
        "methods": ["BOLETO", "PIX", "CARD", "LINK"],
        "supports_checkout_finisher": True,
        "primary_usage": True,
    },
    {
        "code": "INVOICES",
        "name": "Financeiro Horus ERP (Notas Fiscais & Títulos)",
        "short_name": "5. Financeiro Horus ERP",
        "description": "Emissão e conciliação de Boletos registrados e BolePix a partir das Notas Fiscais faturadas no Horus ERP.",
        "methods": ["BOLETO", "PIX"],
        "supports_checkout_finisher": False,
        "primary_usage": True,
    },
    {
        "code": "FINANCIAL",
        "name": "Financeiro Cronuz (Contas a Receber & Ordens de Serviço)",
        "short_name": "6. Financeiro Cronuz",
        "description": "Lançamentos diretos no Financeiro do Cronuz, contratos avulsos e Ordens de Serviço (OS).",
        "methods": ["BOLETO", "PIX", "LINK"],
        "supports_checkout_finisher": False,
        "primary_usage": True,
    },
    {
        "code": "PDV",
        "name": "Frente de Caixa Presencial (PDV & Feiras)",
        "short_name": "7. Frente de Caixa (PDV)",
        "description": "Vendas presenciais no balcão ou feiras com QR Code PIX na tela, maquineta/cartão e Vale-Livro.",
        "methods": ["PIX", "CARD"],
        "supports_checkout_finisher": False,
        "primary_usage": False,
    },
    {
        "code": "PAYMENT_LINK",
        "name": "Link de Pagamento Avulso",
        "short_name": "Link Avulso",
        "description": "Emissão manual/avulsa de links de pagamento.",
        "methods": ["LINK"],
        "supports_checkout_finisher": False,
        "primary_usage": False,
    },
]

PRIMARY_USAGE_CHANNELS: List[dict] = [
    {
        "code": "B2C_STOREFRONT",
        "name": "Storefront B2C",
        "description": "Emissão automática de boletos/Pix no checkout da Loja Virtual B2C.",
        "methods": ["BOLETO", "PIX"],
    },
    {
        "code": "B2B_STOREFRONT",
        "name": "Storefront B2B",
        "description": "Emissão de boletos/Pix para pedidos finalizados no Portal B2B.",
        "methods": ["BOLETO", "PIX"],
    },
    {
        "code": "FINANCIAL",
        "name": "Financeiro Direto",
        "description": "Lançamentos diretos no Financeiro e cobranças avulsas/títulos de clientes.",
        "methods": ["BOLETO", "PIX"],
    },
    {
        "code": "INVOICES",
        "name": "Notas Fiscais (Horus ERP)",
        "description": "Emissão de boletos a partir das últimas Notas Fiscais faturadas no Horus ERP.",
        "methods": ["BOLETO", "PIX"],
    },
]

RECONCILIATION_PROFILES_CATALOG: List[dict] = [
    {
        "code": "TRAY_SHOPEE",
        "name": "Shopee ↔ Tray ↔ Horus ERP",
        "short_name": "Shopee + Tray",
        "channel_label": "Shopee",
        "hub_label": "Tray E-commerce",
        "mode": "DUAL_FILE",
        "badge": "2 Planilhas (Shopee + Tray)",
        "description": "Cruza a planilha de pedidos/repasses recebidos da Shopee com a planilha de pedidos da Tray para amarrar o nº do pedido enviado ao Horus ERP e localizar o Contas a Receber.",
        "file_1_label": "Planilha de Repasse / Pedidos da Shopee (.xlsx ou .csv)",
        "file_2_label": "Planilha de Pedidos da Tray com vínculo Shopee ↔ Horus (.xlsx ou .csv)",
    },
    {
        "code": "TRAY_TIKTOK",
        "name": "TikTok Shop ↔ Tray ↔ Horus ERP",
        "short_name": "TikTok + Tray",
        "channel_label": "TikTok Shop",
        "hub_label": "Tray E-commerce",
        "mode": "DUAL_FILE",
        "badge": "2 Planilhas (TikTok + Tray)",
        "description": "Cruza a planilha de liquidação do TikTok Shop com a planilha de pedidos da Tray para identificar o pedido integrado no Horus ERP e baixar o Contas a Receber.",
        "file_1_label": "Planilha de Recebimentos / Liquidação do TikTok Shop (.xlsx ou .csv)",
        "file_2_label": "Planilha de Pedidos da Tray com vínculo TikTok ↔ Horus (.xlsx ou .csv)",
    },
    {
        "code": "TRAY_VINDI",
        "name": "Vindi ↔ Tray ↔ Horus ERP",
        "short_name": "Vindi + Tray",
        "channel_label": "Vindi",
        "hub_label": "Tray E-commerce",
        "mode": "DUAL_FILE",
        "badge": "2 Planilhas (Vindi + Tray)",
        "description": "Cruza o extrato de transações pagas na Vindi com a planilha de pedidos da Tray para amarrar o número do pedido no Horus ERP e gerar o Borderô.",
        "file_1_label": "Planilha Financeira / Extrato da Vindi (.xlsx ou .csv)",
        "file_2_label": "Planilha de Pedidos da Tray com vínculo Vindi ↔ Horus (.xlsx ou .csv)",
    },
    {
        "code": "VINDI_DIRECT",
        "name": "Vindi Direto ↔ Horus ERP",
        "short_name": "Vindi Direto",
        "channel_label": "Vindi",
        "hub_label": "Direto Horus",
        "mode": "SINGLE_FILE",
        "badge": "1 Planilha (Vindi Direto)",
        "description": "Conciliação direta do extrato da Vindi com os lançamentos de Contas a Receber (PEDIDOS_VENDA.COD_PEDIDO_ORIGEM) no Horus ERP.",
        "file_1_label": "Planilha Financeira / Extrato da Vindi (.xlsx ou .csv)",
        "file_2_label": None,
    },
]


def get_company_reconciliation_profiles(settings) -> List[dict]:
    """
    Retorna a lista completa de perfis de conciliação homologados com o status de
    habilitação do seller e parâmetros bancários opcionais de Borderô por perfil.
    """
    raw_cfg = (
        dict(settings.b2c_showcases_config)
        if (settings and isinstance(settings.b2c_showcases_config, dict))
        else {}
    )
    saved_map = (
        raw_cfg.get("bank_reconciliations")
        if isinstance(raw_cfg.get("bank_reconciliations"), dict)
        else {}
    )
    vindi_legacy_enabled = bool(getattr(settings, "horus_sql_feature_vindi_baixa", False))

    default_bank = {
        "forma_pagto": (getattr(settings, "horus_banco_forma_pagto", "") or "").strip(),
        "banco": (getattr(settings, "horus_banco_codigo", "") or "").strip(),
        "agencia": (getattr(settings, "horus_banco_agencia", "") or "").strip(),
        "conta": (getattr(settings, "horus_banco_conta", "") or "").strip(),
        "carteira": (getattr(settings, "horus_banco_carteira", "") or "").strip(),
    }

    result = []
    for item in RECONCILIATION_PROFILES_CATALOG:
        code = item["code"]
        saved = saved_map.get(code) if isinstance(saved_map.get(code), dict) else {}
        if "enabled" in saved:
            enabled = bool(saved.get("enabled"))
        else:
            enabled = vindi_legacy_enabled if code == "VINDI_DIRECT" else False

        use_custom_bank = bool(saved.get("use_custom_bank", False))
        custom_bank = {
            "forma_pagto": str(saved.get("forma_pagto") or "").strip(),
            "banco": str(saved.get("banco") or "").strip(),
            "agencia": str(saved.get("agencia") or "").strip(),
            "conta": str(saved.get("conta") or "").strip(),
            "carteira": str(saved.get("carteira") or "").strip(),
        }
        effective_bank = custom_bank if use_custom_bank else default_bank
        bank_configured = all(
            bool(effective_bank.get(k))
            for k in ("forma_pagto", "banco", "agencia", "conta", "carteira")
        )

        result.append({
            **item,
            "enabled": enabled,
            "use_custom_bank": use_custom_bank,
            "custom_bank": custom_bank,
            "effective_bank": effective_bank,
            "bank_configured": bank_configured,
        })
    return result


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

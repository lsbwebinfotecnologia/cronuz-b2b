import re
import uuid
import logging
import xml.etree.ElementTree as ET
from typing import Dict, Any, Optional, Union, List

import httpx
from sqlalchemy.orm import Session

from app.models.company import Company
from app.models.company_settings import CompanySettings

logger = logging.getLogger(__name__)


# Tabela oficial de erros da API Vindi Commerce (https://developers.vindi.com.br/docs/mensagens-de-erro)
VINDI_COMMERCE_ERROR_CATALOG: Dict[str, Dict[str, str]] = {
    "001001": {
        "message": "Token inválido ou não encontrado",
        "solution": (
            "Verifique o token_account em Painel Vindi Commerce → Minha Conta → Token. "
            "Confirme também se a opção 'Homologação (Sandbox)' corresponde ao ambiente do seu Token (Sandbox vs Produção)."
        ),
    },
    "003003": {
        "message": "Forma de Pagamento Inválida",
        "solution": (
            "Verifique se o meio de pagamento (PIX = 27, Cartão Visa = 3, Mastercard = 4, Elo = 16, Boleto = 6) "
            "está habilitado na sua conta Vindi Commerce."
        ),
    },
    "003004": {
        "message": "Número da Parcela Inválido",
        "solution": "Verifique o parâmetro de parcelamento (split). Deve ser entre 1 e o limite configurado na conta Vindi.",
    },
    "003011": {
        "message": "Número do cartão inválido",
        "solution": "Verifique os dígitos do cartão de crédito informado (card_number).",
    },
    "003012": {
        "message": "Nome do titular do cartão em branco",
        "solution": "Informe o nome impresso no cartão (card_name).",
    },
    "003014": {
        "message": "Código de segurança (CVV) inválido",
        "solution": "Verifique o CVV do cartão (3 dígitos para Visa/Mastercard/Elo ou 4 dígitos para Amex).",
    },
    "003015": {
        "message": "Mês de vencimento do cartão inválido",
        "solution": "Informe o mês de validade com 2 dígitos (MM, de 01 a 12).",
    },
    "003020": {
        "message": "Ano de vencimento do cartão inválido",
        "solution": "Informe o ano de validade com 4 dígitos (AAAA, ex: 2030) e futuro.",
    },
    "003021": {
        "message": "O vendedor não pode ser igual ao comprador",
        "solution": (
            "Na Vindi Commerce, o CPF/CNPJ e o E-mail do cliente comprador NÃO podem ser iguais "
            "ao CPF/CNPJ ou E-mail cadastrados na conta do lojista (vendedor)."
        ),
    },
    "003039": {
        "message": "Vendedor inválido ou não encontrado",
        "solution": (
            "O token_account informado não foi localizado neste ambiente da Vindi Commerce. "
            "1) Se o seu Token foi copiado do painel de Produção (intermediador.yapay.com.br), DESMARQUE 'Homologação (Sandbox)' e salve. "
            "2) Se estiver testando em Sandbox (intermediador.sandbox.yapay.com.br), use o Token gerado dentro da conta Sandbox e verifique se a conta está ativa."
        ),
    },
    "003065": {
        "message": "Valor menor que o mínimo permitido",
        "solution": (
            "Na Vindi Commerce, o valor mínimo da parcela em compras parceladas é R$ 10,00 "
            "(ou verifique o valor mínimo configurado na sua conta). Tente testar com R$ 10,00 em 1x."
        ),
    },
    "009006": {
        "message": "Número da parcela maior que o permitido",
        "solution": "A quantidade de parcelas (split) excede o máximo habilitado para esta bandeira na sua conta Vindi.",
    },
    "058001": {
        "message": "Revendedor inválido",
        "solution": "O reseller_token informado não está configurado como Revendedor na Vindi Commerce. Deixe em branco se não usar revendedor.",
    },
    "037010": {
        "message": "E-mail do afiliado informado deve ser diferente do vendedor",
        "solution": "O e-mail do afiliado de split não pode ser igual ao e-mail principal da conta do vendedor.",
    },
    "037022": {
        "message": "Afiliado não possui conta na Vindi Pagamentos",
        "solution": "Todas as contas de afiliados informadas no split devem possuir conta ativa na Vindi Commerce.",
    },
}


class VindiCheckoutError(Exception):
    """Falha de cobrança na Vindi. O checkout NUNCA deve aprovar o pedido quando esta exceção ocorre."""

    def __init__(
        self,
        message: str,
        declined: bool = False,
        diagnostics: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message)
        self.message = message
        self.declined = declined
        self.diagnostics: Dict[str, Any] = diagnostics or {}

    def friendly_customer_message(self, payment_method: str = "") -> str:
        """
        Retorna uma mensagem amigável, humana e livre de termos técnicos/gateway para o Consumidor Final (Customer).
        """
        v_errors = (self.diagnostics or {}).get("vindi_errors") or []
        codes = {str(x.get("code") or "") for x in v_errors if isinstance(x, dict)}

        if codes & {"003011", "003012", "003014", "003015", "003020"}:
            return "Alguns dados do cartão de crédito parecem inválidos (número, nome, validade ou código de segurança). Confira os dados e tente novamente."
        if codes & {"003065", "009006", "003004"}:
            return "A opção de parcelamento escolhida não atinge o valor mínimo por parcela. Escolha menos parcelas ou outra forma de pagamento."
        if "003021" in codes:
            return "Os dados de CPF ou e-mail informados não podem ser iguais aos do cadastro da própria loja. Utilize os dados do comprador para finalizar."
        if (payment_method or "").upper() == "CREDIT_CARD" and self.declined and not (codes & {"001001", "003039"}):
            return "Não foi possível aprovar o pagamento com este cartão. Verifique os dados informados ou escolha outra forma de pagamento."
        return "Não foi possível concluir o processamento do pagamento neste momento. Por favor, aguarde alguns instantes e tente novamente."

    def friendly_seller_message(self) -> str:
        """
        Retorna uma mensagem orientada ao negócio para o Lojista (Seller), sem códigos HTTP crus ou JSON técnico.
        """
        v_errors = (self.diagnostics or {}).get("vindi_errors") or []
        codes = {str(x.get("code") or "") for x in v_errors if isinstance(x, dict)}
        if codes & {"001001", "003039"}:
            return "Não foi possível validar a chave da operadora de pagamento. Confira se o Token está correto e se o modo Homologação/Produção corresponde à sua conta."
        if "003021" in codes:
            return "Para testar uma compra, utilize um CPF e e-mail diferentes dos cadastrados na conta principal da loja."
        if "003065" in codes:
            return "O valor de teste é inferior ao mínimo permitido para parcelamento na sua conta. Teste com um valor a partir de R$ 10,00 em 1x."
        return "Não foi possível concluir a comunicação com a operadora de pagamento. Verifique as configurações da conta e tente novamente."


# Bandeiras aceitas pelo Vindi Commerce (Intermediador Yapay) -> payment_method_id
# Ref: https://developers.vindi.com.br/docs/bandeiras-e-m%C3%A9todos-de-pagamento-dispon%C3%ADveis
_YAPAY_CARD_BRANDS = {
    "DINERS": 2,
    "VISA": 3,
    "MASTERCARD": 4,
    "AMEX": 5,
    "ELO": 16,
    "HIPERCARD": 20,
    "JCB": 25,
}
_YAPAY_BOLETO_METHOD_ID = 6
_YAPAY_PIX_METHOD_ID = 27
_YAPAY_BOLEPIX_METHOD_ID = 28

# Status de transação do Vindi Commerce (Intermediador)
_YAPAY_STATUS_PAID = {6}  # 6 = Aprovada
_YAPAY_STATUS_WAITING = {4, 5, 24, 87}  # 4 = Aguardando Pagamento, 5 = Em Processamento, 87 = Em Monitoramento
_YAPAY_STATUS_DECLINED = {7, 89}  # 7 = Cancelada, 89 = Reprovada


def detect_card_brand(card_number: str) -> Optional[str]:
    n = "".join(filter(str.isdigit, card_number or ""))
    if not n:
        return None
    if n.startswith(
        (
            "4011",
            "4312",
            "4389",
            "4514",
            "4576",
            "5041",
            "5066",
            "5067",
            "509",
            "6277",
            "6362",
            "6363",
            "650",
            "6516",
            "6550",
        )
    ):
        return "ELO"
    if n.startswith(("606282", "3841")):
        return "HIPERCARD"
    if n.startswith(("34", "37")):
        return "AMEX"
    if n.startswith(("300", "301", "302", "303", "304", "305", "36", "38")):
        return "DINERS"
    if n.startswith("35"):
        return "JCB"
    if n.startswith("4"):
        return "VISA"
    if n[:2].isdigit() and (51 <= int(n[:2]) <= 55 or 2221 <= int(n[:4]) <= 2720):
        return "MASTERCARD"
    return None


def _mask_secret(val: str) -> str:
    s = (val or "").strip()
    if len(s) <= 6:
        return "***" if s else ""
    return f"{s[:4]}...{s[-3:]} (len={len(s)})"


def _public_url_for_vindi_waf(url: str) -> str:
    """
    O AWS WAF da Vindi Commerce (`api.intermediador.yapay.com.br` e `sandbox`) bloqueia com
    `HTTP 403 Forbidden` qualquer payload JSON que contenha `localhost`, `127.0.0.1` ou `0.0.0.0`
    nos campos `url_notification`, `url_success`, `url_process` ou `url_cancel` (regra anti-SSRF).
    Quando a aplicação está rodando localmente, substitui automaticamente o host local por um
    domínio HTTPS público válido para que o WAF da Vindi aceite a transação.
    """
    raw = (url or "").strip().rstrip("/")
    if not raw or any(local_h in raw.lower() for local_h in ("localhost", "127.0.0.1", "0.0.0.0")):
        return "https://b2bcronuz.com.br"
    return raw


def _sanitize_payload_for_preview(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Remove dados sensíveis (cartão, CVV, token completo) para exibir no painel de diagnóstico."""
    import copy

    clean = copy.deepcopy(payload)
    if "token_account" in clean and clean["token_account"]:
        clean["token_account"] = _mask_secret(str(clean["token_account"]))
    if "access_token" in clean and clean["access_token"]:
        clean["access_token"] = _mask_secret(str(clean["access_token"]))
    if isinstance(clean.get("payment"), dict):
        pay = clean["payment"]
        if pay.get("card_number"):
            num = str(pay["card_number"])
            pay["card_number"] = f"{num[:4]}********{num[-4:]}" if len(num) >= 8 else "****"
        if pay.get("card_cvv"):
            pay["card_cvv"] = "***"
    return clean


def _extract_yapay_structured_errors(body: Any, raw_text: str = "") -> List[Dict[str, str]]:
    """Extrai códigos, campos, mensagens e soluções recomendadas do retorno JSON ou XML da Vindi Commerce."""
    extracted: List[Dict[str, str]] = []

    if isinstance(body, dict):
        err = body.get("error_response") or {}
        if isinstance(err, dict):
            for item in err.get("general_errors") or []:
                if isinstance(item, dict):
                    code = str(item.get("code") or "").strip()
                    msg = str(item.get("message") or item.get("message_complete") or "").strip()
                    cat = VINDI_COMMERCE_ERROR_CATALOG.get(code, {})
                    extracted.append(
                        {
                            "code": code or "GERAL",
                            "field": "token_account / transação",
                            "message": msg or cat.get("message", "Erro geral retornado pela Vindi"),
                            "solution": cat.get("solution", "Verifique os dados enviados e o ambiente (Sandbox vs Produção)."),
                        }
                    )
            for item in err.get("validation_errors") or []:
                if isinstance(item, dict):
                    code = str(item.get("code") or "").strip()
                    field = str(item.get("field") or "").strip()
                    msg = str(item.get("message_complete") or item.get("message") or "").strip()
                    cat = VINDI_COMMERCE_ERROR_CATALOG.get(code, {})
                    extracted.append(
                        {
                            "code": code or "VALIDACAO",
                            "field": field or "parametro",
                            "message": msg or cat.get("message", "Erro de validação de campo"),
                            "solution": cat.get(
                                "solution",
                                f"Verifique o preenchimento obrigatório e formato do campo '{field or 'informado'}'.",
                            ),
                        }
                    )

    if not extracted and raw_text and "<" in raw_text:
        try:
            root = ET.fromstring(raw_text)
            for g_err in root.findall(".//general_error") + root.findall(".//error"):
                code = (g_err.findtext("code") or "").strip()
                msg = (g_err.findtext("message_complete") or g_err.findtext("message") or "").strip()
                field = (g_err.findtext("field") or "").strip()
                if code or msg:
                    cat = VINDI_COMMERCE_ERROR_CATALOG.get(code, {})
                    extracted.append(
                        {
                            "code": code or "XML_ERR",
                            "field": field or "geral",
                            "message": msg or cat.get("message", "Erro retornado pela Vindi"),
                            "solution": cat.get("solution", "Verifique os parâmetros enviados à Vindi Commerce."),
                        }
                    )
        except Exception:
            pass

    return extracted


def read_vindi_config(settings: Optional[CompanySettings]) -> Dict[str, Any]:
    """Lê a configuração completa da Vindi salva pelo Seller em b2c_showcases_config.vindi_config."""
    raw_cfg = getattr(settings, "b2c_showcases_config", None) if settings else None
    vcfg = (
        raw_cfg.get("vindi_config")
        if isinstance(raw_cfg, dict) and isinstance(raw_cfg.get("vindi_config"), dict)
        else {}
    )
    return {
        "sandbox": bool(vcfg.get("sandbox", True)),
        "integration_mode": str(vcfg.get("integration_mode") or "TRANSPARENT").upper(),  # TRANSPARENT or PAYMENT_LINK
        "express_cpf_only": bool(vcfg.get("express_cpf_only", True)),
        "platform": str(vcfg.get("platform") or "AUTO").upper(),  # AUTO, VINDI_PAGAMENTOS, VINDI_API_V1
        "max_installments": max(1, min(12, int(vcfg.get("max_installments") or 6))),
        "allow_pix": bool(vcfg.get("allow_pix", True)),
        "allow_credit_card": bool(vcfg.get("allow_credit_card", True)),
        "allow_boleto": bool(vcfg.get("allow_boleto", False)),
        "postal_code_seller": "".join(filter(str.isdigit, str(vcfg.get("postal_code_seller") or "01001000"))) or "01001000",
        "reseller_token": str(vcfg.get("reseller_token") or "").strip(),
        "consumer_key": str(vcfg.get("consumer_key") or "").strip(),
        "consumer_secret": str(vcfg.get("consumer_secret") or "").strip(),
        "access_token": str(vcfg.get("access_token") or "").strip(),
        "return_url": str(vcfg.get("return_url") or "").strip(),
    }


def read_vindi_sandbox_flag(settings: Optional[CompanySettings]) -> bool:
    """Flag de homologação própria da Vindi (independente da Efí), guardada em b2c_showcases_config.vindi_config."""
    return read_vindi_config(settings)["sandbox"]


class VindiCheckoutClient:
    """
    Cliente Oficial Vindi Commerce (Intermediador Yapay v3 / v1) & Vindi Recorrência (API v1).
    Documentação oficial: https://developers.vindi.com.br/docs/commerce

    Fluxos suportados:
      1. Checkout Transparente PIX e Cartão de Crédito:
         - POST /api/v3/transactions/payment (usando `token_account` + `finger_print` + `url_notification`)
      2. Link de Pagamento / Checkout Hospedado:
         - Se `access_token` OAuth configurado: POST /api/v3/charges (Envio de Cobrança V3 -> `payment_link`)
         - Com `token_account`: POST /v1/tmp_transactions/create (Carrinho/Link Vindi Commerce -> `url_car` + `token_transaction`)
           e Redirecionamento POST Hospedado (`tc.intermediador.yapay.com.br/payment/transaction`)
      3. Consulta de Transação (Webhook / Polling):
         - GET /api/v3/transactions/get_by_token?token_account=...&token_transaction=...
    """

    def __init__(
        self,
        db_or_api_key: Union[Session, str, None] = None,
        company_id: Optional[int] = None,
        *,
        api_key: Optional[str] = None,
        sandbox: Optional[bool] = None,
    ):
        self.company_name: str = "LOJAB2C"
        self.company_obj: Optional[Company] = None
        self.api_key: str = ""
        self.sandbox: bool = True
        self.settings_obj: Optional[CompanySettings] = None

        if isinstance(db_or_api_key, Session) and company_id:
            comp = db_or_api_key.query(Company).filter(Company.id == company_id).first()
            self.company_obj = comp
            if comp and comp.name:
                self.company_name = comp.name
            self.settings_obj = (
                db_or_api_key.query(CompanySettings)
                .filter(CompanySettings.company_id == company_id)
                .first()
            )
            self.api_key = (getattr(self.settings_obj, "vindi_api_key", None) or "").strip()
            self.sandbox = read_vindi_sandbox_flag(self.settings_obj)
        elif isinstance(db_or_api_key, str):
            self.api_key = db_or_api_key.strip()

        if api_key is not None:
            self.api_key = api_key.strip()
        if sandbox is not None:
            self.sandbox = bool(sandbox)

        self.company_id = company_id
        self.vindi_config = read_vindi_config(self.settings_obj)

        # Base URLs oficiais da documentação https://developers.vindi.com.br/docs/commerce
        self.yapay_base_url = (
            "https://api.intermediador.sandbox.yapay.com.br"
            if self.sandbox
            else "https://api.intermediador.yapay.com.br"
        )
        self.yapay_url = f"{self.yapay_base_url}/api/v3/transactions/payment"
        self.yapay_get_by_token_url = f"{self.yapay_base_url}/api/v3/transactions/get_by_token"
        self.yapay_charges_v3_url = f"{self.yapay_base_url}/api/v3/charges"
        self.yapay_tmp_cart_url = f"{self.yapay_base_url}/v1/tmp_transactions/create"
        self.yapay_oauth_url = f"{self.yapay_base_url}/api/authorizations/access_token"
        self.yapay_hosted_checkout_url = (
            "https://tc.intermediador.sandbox.yapay.com.br/payment/transaction"
            if self.sandbox
            else "https://tc.intermediador.yapay.com.br/payment/transaction"
        )
        self.v1_url = (
            "https://sandbox-app.vindi.com.br/api/v1"
            if self.sandbox
            else "https://app.vindi.com.br/api/v1"
        )

    # ------------------------------------------------------------------ helpers
    @property
    def is_configured(self) -> bool:
        return len(self.api_key) >= 8

    def resolve_store_home_url(self, fallback_base: str = "") -> str:
        """
        Determina a URL pública inicial da loja B2C para redirecionar o cliente após o pagamento.
        Ignora URLs de webhook/API caso tenham sido preenchidas por engano em return_url.
        """
        import unicodedata

        cfg_return = (self.vindi_config.get("return_url") or "").strip().rstrip("/")
        if cfg_return and "/webhook" not in cfg_return.lower() and "/api/" not in cfg_return.lower() and "@" not in cfg_return:
            return _public_url_for_vindi_waf(cfg_return)

        if self.company_obj:
            b2c_dom = (getattr(self.company_obj, "b2c_custom_domain", None) or "").strip().rstrip("/")
            if b2c_dom and "@" not in b2c_dom and "." in b2c_dom:
                return b2c_dom if b2c_dom.startswith("http") else f"https://{b2c_dom}"

            raw_cfg = getattr(self.settings_obj, "b2c_showcases_config", None) if self.settings_obj else None
            raw_branding = raw_cfg.get("branding") if isinstance(raw_cfg, dict) and isinstance(raw_cfg.get("branding"), dict) else {}
            store_slug = (raw_branding.get("store_slug") or "").strip().lower()
            if not store_slug:
                raw_name = str(self.company_obj.name or f"loja-{self.company_obj.id}").strip().lower()
                norm_name = unicodedata.normalize("NFKD", raw_name).encode("ASCII", "ignore").decode("ASCII")
                store_slug = re.sub(r"[^a-z0-9]+", "-", norm_name).strip("-") or f"loja-{self.company_obj.id}"
            return f"https://app.horusb2b.com.br/loja/{store_slug}"

        return _public_url_for_vindi_waf(fallback_base or "https://app.horusb2b.com.br")

    def resolve_webhook_url(self, api_base_url: str = "") -> str:
        """
        Determina a URL pública de notificação automática (Webhook POST) da Vindi.
        """
        raw = (api_base_url or "").strip().rstrip("/")
        if not raw or any(local_h in raw.lower() for local_h in ("localhost", "127.0.0.1", "0.0.0.0")):
            return "https://cronuzb2b.com.br/api/b2c/webhooks/vindi"
        if raw.endswith("/api"):
            return f"{raw}/b2c/webhooks/vindi"
        return f"{raw}/b2c/webhooks/vindi"

    @property
    def credential_type(self) -> str:
        if not self.is_configured:
            return "NONE"
        forced = self.vindi_config.get("platform", "AUTO")
        if forced in ("VINDI_PAGAMENTOS", "VINDI_API_V1"):
            return forced
        return "VINDI_PAGAMENTOS" if len(self.api_key) <= 24 else "VINDI_API_V1"

    def available_payment_methods_csv(self) -> str:
        methods: List[str] = []
        if self.vindi_config.get("allow_credit_card", True):
            methods.extend(["2", "3", "4", "5", "16", "20", "25"])
        if self.vindi_config.get("allow_boleto", False):
            methods.append("6")
        if self.vindi_config.get("allow_pix", True):
            methods.append("27")
        if not methods:
            methods = ["3", "4", "16", "27"]
        return ",".join(methods)

    @staticmethod
    def _split_expiration(raw: str):
        raw = (raw or "").replace(" ", "")
        parts = raw.split("/") if "/" in raw else [raw[:2], raw[2:]]
        month = (parts[0] or "").zfill(2)
        year = parts[1] if len(parts) > 1 else ""
        if len(year) == 2:
            year = f"20{year}"
        return month, year

    # -------------------------------------------------------------- public API
    async def create_b2c_charge(
        self,
        order_id: int,
        amount: float,
        payment_method: str,
        customer: Dict[str, Any],
        address: Optional[Dict[str, Any]] = None,
        card_data: Optional[Dict[str, Any]] = None,
        customer_ip: Optional[str] = None,
        finger_print: Optional[str] = None,
        api_base_url: str = "http://localhost:8000",
        allow_simulation: bool = False,
    ) -> Dict[str, Any]:
        method = (payment_method or "PIX").upper()
        amount = round(float(amount), 2)
        if amount <= 0:
            raise VindiCheckoutError("Valor da cobrança inválido (deve ser maior que R$ 0,00).")
        if method == "CREDIT_CARD" and not (card_data and card_data.get("card_number")):
            raise VindiCheckoutError(
                "Dados do cartão de crédito não informados (número, validade e CVV são obrigatórios)."
            )

        if not self.is_configured:
            if allow_simulation:
                return self._simulated(order_id, amount, method)
            raise VindiCheckoutError("Gateway Vindi não configurado para esta loja (token_account ausente).")

        if self.credential_type == "VINDI_PAGAMENTOS":
            return await self._charge_vindi_pagamentos(
                order_id=order_id,
                amount=amount,
                method=method,
                customer=customer,
                address=address,
                card_data=card_data,
                customer_ip=customer_ip,
                finger_print=finger_print,
                api_base_url=api_base_url,
            )
        return await self._charge_api_v1(order_id, amount, method, customer, address, card_data)

    async def create_credit_card_bill(
        self,
        order_id,
        amount,
        customer,
        card_data,
        address=None,
        customer_ip=None,
        finger_print=None,
        api_base_url="http://localhost:8000",
        allow_simulation=False,
    ):
        return await self.create_b2c_charge(
            order_id=order_id,
            amount=amount,
            payment_method="CREDIT_CARD",
            customer=customer,
            address=address,
            card_data=card_data,
            customer_ip=customer_ip,
            finger_print=finger_print,
            api_base_url=api_base_url,
            allow_simulation=allow_simulation,
        )

    async def create_pix_bill(
        self,
        order_id,
        amount,
        customer,
        address=None,
        customer_ip=None,
        finger_print=None,
        api_base_url="http://localhost:8000",
        allow_simulation=False,
    ):
        return await self.create_b2c_charge(
            order_id=order_id,
            amount=amount,
            payment_method="PIX",
            customer=customer,
            address=address,
            card_data=None,
            customer_ip=customer_ip,
            finger_print=finger_print,
            api_base_url=api_base_url,
            allow_simulation=allow_simulation,
        )

    async def get_transaction_by_token(self, token_transaction: str) -> Dict[str, Any]:
        """
        Consulta oficial de detalhes da transação no Vindi Commerce:
        GET /api/v3/transactions/get_by_token?token_account=...&token_transaction=...
        Ref: https://developers.vindi.com.br/reference/detalhes-da-transacao
        """
        if not self.is_configured or not token_transaction:
            raise VindiCheckoutError("token_account e token_transaction são obrigatórios para consulta.")

        params = {
            "token_account": self.api_key,
            "token_transaction": token_transaction.strip(),
        }
        effective_sandbox = self.sandbox
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                r = await client.get(self.yapay_get_by_token_url, params=params)
                # Auto-fallback entre Sandbox e Produção caso o token pertença ao outro ambiente
                if r.status_code not in (200, 201) or '"error"' in (r.text or ""):
                    alt_sandbox = not self.sandbox
                    alt_base = (
                        "https://api.intermediador.sandbox.yapay.com.br"
                        if alt_sandbox
                        else "https://api.intermediador.yapay.com.br"
                    )
                    r_alt = await client.get(f"{alt_base}/api/v3/transactions/get_by_token", params=params)
                    if r_alt.status_code in (200, 201) and '"success"' in (r_alt.text or ""):
                        r = r_alt
                        effective_sandbox = alt_sandbox
        except httpx.HTTPError as e:
            raise VindiCheckoutError(f"Erro ao consultar transação na Vindi: {e}")

        try:
            body = r.json()
        except ValueError:
            body = {}

        tx = (body.get("data_response") or {}).get("transaction") or {}
        pay = tx.get("payment") or {}
        cust = tx.get("customer") or {}
        status_id = int(tx.get("status_id") or 0)
        pm_id = int(pay.get("payment_method_id") or 0)
        pm_name = str(pay.get("payment_method_name") or "").strip()
        split_count = int(pay.get("split") or 1)
        if pm_id == 27 or "pix" in pm_name.lower():
            resolved_method = "PIX"
        elif pm_id == 6 or "boleto" in pm_name.lower():
            resolved_method = "BOLETO"
        elif pm_id > 0:
            resolved_method = f"CREDIT_CARD ({pm_name or pm_id} {split_count}x)"
        else:
            resolved_method = "PAYMENT_LINK"

        return {
            "http_status": r.status_code,
            "environment": "SANDBOX" if effective_sandbox else "PRODUCTION",
            "status_id": status_id,
            "status_name": tx.get("status_name") or ("Aguardando Pagamento no Link" if status_id == 0 else str(status_id)),
            "paid": status_id in _YAPAY_STATUS_PAID,
            "declined": status_id in _YAPAY_STATUS_DECLINED,
            "order_number": tx.get("order_number"),
            "transaction_id": tx.get("transaction_id"),
            "token_transaction": tx.get("token_transaction") or token_transaction,
            "payment_method_id": pm_id,
            "payment_method_name": pm_name,
            "resolved_payment_method": resolved_method,
            "split": split_count,
            "payment": pay,
            "customer": cust,
            "raw": body,
        }

    async def create_payment_link(
        self,
        order_id: int,
        amount: float,
        customer: Dict[str, Any],
        address: Optional[Dict[str, Any]] = None,
        api_base_url: str = "http://localhost:8000",
    ) -> Dict[str, Any]:
        """
        Gera e VALIDA um Link de Pagamento (Checkout Hospedado da Vindi) para o pedido B2C:
          1. No Vindi Commerce (`VINDI_PAGAMENTOS`):
             a) Se houver `access_token` OAuth configurado, usa `POST /api/v3/charges` (Envio de Cobrança V3)
                que retorna `payment_link` (`https://pagar.vindi.com.br/...`).
             b) Com `token_account`, chama `POST /v1/tmp_transactions/create` (API de Carrinho de Compras da Vindi)
                para validar a chave e gerar o `token_transaction` oficial na Vindi. Se o `token_account` for
                inválido ou de outro ambiente (ex: `003039`), levanta `VindiCheckoutError` imediatamente com o
                diagnóstico completo!
          2. Na Vindi Recorrência (`VINDI_API_V1`):
             Cria a fatura em `POST /api/v1/bills` e retorna `bill.url`.
        """
        amount = round(float(amount), 2)
        if amount <= 0:
            raise VindiCheckoutError("Valor para geração do link de pagamento deve ser maior que zero.")
        if not self.is_configured:
            raise VindiCheckoutError("Token / Chave da Vindi não configurada nas Configurações do Seller.")

        clean_base = (api_base_url or "http://localhost:8000").rstrip("/")

        if self.credential_type == "VINDI_PAGAMENTOS":
            # 1a. Se o lojista configurou access_token OAuth para Cobrança V3 (/api/v3/charges)
            oauth_access_token = self.vindi_config.get("access_token") or ""
            if oauth_access_token:
                charge_v3_payload = {
                    "available_payment_methods": self.available_payment_methods_csv(),
                    "code": str(order_id),
                    "customer_email": (customer.get("email") or "cliente@loja.com.br").strip().lower(),
                    "description": f"PEDIDO LOJA B2C #{order_id}",
                    "max_split_transaction": str(self.vindi_config.get("max_installments", 6)),
                    "new_checkout": True,
                    "order_number": f"CRZ-{order_id}",
                    "use_cards": False,
                    "value": f"{amount:.2f}",
                }
                headers = {
                    "Content-Type": "application/json",
                    "access-token": oauth_access_token,
                    "Authorization": f"Bearer {oauth_access_token}",
                }
                try:
                    async with httpx.AsyncClient(timeout=25.0) as client:
                        r_v3 = await client.post(
                            self.yapay_charges_v3_url,
                            json=charge_v3_payload,
                            headers=headers,
                        )
                    if r_v3.status_code in (200, 201):
                        b_v3 = r_v3.json() if r_v3.text else {}
                        p_link = b_v3.get("payment_link")
                        if p_link:
                            return {
                                "gateway": "VINDI",
                                "mode": "VINDI_COBRANCA_V3",
                                "credential_type": "VINDI_PAGAMENTOS",
                                "sandbox": self.sandbox,
                                "simulated": False,
                                "transaction_id": f"VINDI-CHG-{b_v3.get('id') or order_id}",
                                "gateway_tx_id": f"VINDI-CHG-{b_v3.get('id') or order_id}",
                                "gateway_status": "waiting_payment",
                                "status": "WAITING_PAYMENT",
                                "paid": False,
                                "amount": amount,
                                "payment_url": p_link,
                                "pix_code": None,
                                "pix_qr_code_url": None,
                                "diagnostics": {
                                    "endpoint": f"POST {self.yapay_charges_v3_url}",
                                    "environment": "SANDBOX" if self.sandbox else "PRODUCTION",
                                    "http_status": r_v3.status_code,
                                    "request_preview": _sanitize_payload_for_preview(charge_v3_payload),
                                    "response_preview": b_v3,
                                },
                            }
                except Exception as e:
                    logger.warning(f"[Vindi Cobrança V3] Fallback para Carrinho/Link padrão: {e}")

            # 1b. Fluxo Oficial de Carrinho de Compra / Link via token_account (POST /v1/tmp_transactions/create)
            # Ref: https://developers.vindi.com.br/reference/criar-carrinho-de-compra
            addr = address or {}
            waf_safe_base = _public_url_for_vindi_waf(clean_base)
            return_url = self.resolve_store_home_url(waf_safe_base)
            webhook_url = self.resolve_webhook_url(clean_base)
            tmp_payload: Dict[str, Any] = {
                "token_account": self.api_key,
                "order_number": f"CRZ-{order_id}",
                "postal_code_seller": self.vindi_config.get("postal_code_seller") or "01001000",
                "postal_code_customer": "".join(filter(str.isdigit, addr.get("zip_code") or "")) or "01001000",
                "available_payment_methods": self.available_payment_methods_csv(),
                "max_split_transaction": str(self.vindi_config.get("max_installments", 6)),
                "shipping_type": "Frete",
                "shipping_price": "0.00",
                "url_notification": webhook_url,
                "url_success": return_url,
                "url_process": return_url,
                "url_cancel": return_url,
                "transaction_product": [
                    {
                        "code": str(order_id),
                        "description": f"PEDIDO LOJA B2C #{order_id}",
                        "quantity": "1",
                        "price_unit": f"{amount:.2f}",
                        "sku_code": f"ORD-{order_id}",
                        "type_product": "1",
                        "edit": "false",
                    }
                ],
            }
            if self.vindi_config.get("reseller_token"):
                tmp_payload["reseller_token"] = self.vindi_config["reseller_token"]

            effective_sandbox = self.sandbox
            target_tmp_url = self.yapay_tmp_cart_url

            async def _call_tmp(url_to_call: str):
                async with httpx.AsyncClient(timeout=25.0) as client:
                    return await client.post(url_to_call, json=tmp_payload)

            try:
                r_tmp = await _call_tmp(target_tmp_url)
            except httpx.HTTPError as e:
                raise VindiCheckoutError(
                    f"Falha de rede ao comunicar com a Vindi Commerce ({target_tmp_url}): {e}",
                    diagnostics={
                        "endpoint": f"POST {target_tmp_url}",
                        "environment": "SANDBOX" if effective_sandbox else "PRODUCTION",
                        "http_status": 0,
                        "request_preview": _sanitize_payload_for_preview(tmp_payload),
                    },
                )

            def _parse_tmp_response(resp_obj):
                r_xml = resp_obj.text or ""
                b_json: Dict[str, Any] = {}
                try:
                    b_json = resp_obj.json()
                except ValueError:
                    pass
                t_tx = ""
                u_car = ""
                m_status = ""
                if "<" in r_xml:
                    try:
                        root = ET.fromstring(r_xml)
                        m_status = (root.findtext(".//message_response/message") or "").strip().lower()
                        t_tx = (root.findtext(".//data_response/token_transaction") or "").strip()
                        u_car = (root.findtext(".//data_response/url_car") or "").strip()
                    except Exception:
                        pass
                elif isinstance(b_json, dict):
                    m_status = str((b_json.get("message_response") or {}).get("message") or "").lower()
                    dr = b_json.get("data_response") or {}
                    t_tx = str(dr.get("token_transaction") or "")
                    u_car = str(dr.get("url_car") or "")
                return r_xml, b_json, m_status, t_tx, u_car

            raw_xml, body_json, msg_status, token_tx, url_car = _parse_tmp_response(r_tmp)

            # Auto-detecção de ambiente: se o Seller marcou Sandbox mas o token_account é de Produção (ou vice-versa)
            if (r_tmp.status_code not in (200, 201) or msg_status != "success") and (
                "001001" in raw_xml or "003039" in raw_xml
            ):
                alt_sandbox = not self.sandbox
                alt_base = (
                    "https://api.intermediador.sandbox.yapay.com.br"
                    if alt_sandbox
                    else "https://api.intermediador.yapay.com.br"
                )
                alt_tmp_url = f"{alt_base}/v1/tmp_transactions/create"
                try:
                    r_alt = await _call_tmp(alt_tmp_url)
                    alt_xml, alt_json, alt_status, alt_tx, alt_car = _parse_tmp_response(r_alt)
                    if r_alt.status_code in (200, 201) and alt_status == "success" and alt_tx:
                        r_tmp = r_alt
                        raw_xml, body_json, msg_status, token_tx, url_car = (
                            alt_xml,
                            alt_json,
                            alt_status,
                            alt_tx,
                            alt_car,
                        )
                        effective_sandbox = alt_sandbox
                        target_tmp_url = alt_tmp_url
                except Exception:
                    pass

            if r_tmp.status_code not in (200, 201) or (msg_status and msg_status != "success"):
                v_errors = _extract_yapay_structured_errors(body_json, raw_xml)
                detail_str = (
                    "; ".join(f"[{e['code']}] {e['message']} ({e['field']})" for e in v_errors)
                    or raw_xml[:300]
                )
                hint_str = (
                    " | ".join(dict.fromkeys(e["solution"] for e in v_errors if e.get("solution")))
                    or "Verifique se o token_account pertence ao ambiente selecionado (Sandbox vs Produção)."
                )
                diag = {
                    "endpoint": f"POST {target_tmp_url}",
                    "environment": "SANDBOX" if effective_sandbox else "PRODUCTION",
                    "credential_type": "VINDI_COMMERCE_TOKEN",
                    "http_status": r_tmp.status_code,
                    "vindi_errors": v_errors,
                    "diagnostic_hint": hint_str,
                    "request_preview": _sanitize_payload_for_preview(tmp_payload),
                    "response_preview": body_json if body_json else raw_xml[:1000],
                }
                raise VindiCheckoutError(
                    f"Vindi recusou a geração do Link de Pagamento (HTTP {r_tmp.status_code}): {detail_str}",
                    declined=True,
                    diagnostics=diag,
                )

            # Link validado com sucesso na Vindi Commerce!
            # URL oficial do Checkout Vindi: https://checkout.yapay.com.br/transacao/{token_transaction}
            # e URL do Carrinho Vindi: https://tc.intermediador.yapay.com.br/payment/car/v1/{token_transaction}
            cart_full_url = f"{url_car.rstrip('/')}/{token_tx}" if url_car and token_tx else ""
            direct_checkout_url = (
                f"https://checkout.yapay.com.br/transacao/{token_tx}"
                if (not effective_sandbox and token_tx)
                else (cart_full_url or f"{clean_base}/b2c/public/vindi-checkout/{order_id}")
            )
            env_note = (
                " (Nota: Seu token_account foi identificado automaticamente como chave de PRODUÇÃO na Vindi Commerce; desmarque 'Homologação (Sandbox)' nas configurações para fixar em Produção.)"
                if effective_sandbox != self.sandbox
                else ""
            )
            return {
                "gateway": "VINDI",
                "mode": "VINDI_PAYMENT_LINK",
                "credential_type": "VINDI_PAGAMENTOS",
                "sandbox": effective_sandbox,
                "simulated": False,
                "transaction_id": token_tx or f"VINDI-LINK-{order_id}",
                "gateway_tx_id": token_tx or f"VINDI-LINK-{order_id}",
                "token_transaction": token_tx,
                "url_car": cart_full_url or url_car,
                "gateway_status": "waiting_payment",
                "status": "WAITING_PAYMENT",
                "paid": False,
                "amount": amount,
                "payment_url": direct_checkout_url,
                "pix_code": None,
                "pix_qr_code_url": None,
                "diagnostics": {
                    "endpoint": f"POST {target_tmp_url}",
                    "environment": "SANDBOX" if effective_sandbox else "PRODUCTION",
                    "credential_type": "VINDI_COMMERCE_TOKEN",
                    "http_status": r_tmp.status_code,
                    "token_transaction": token_tx,
                    "url_car": cart_full_url or url_car,
                    "direct_checkout_url": direct_checkout_url,
                    "diagnostic_hint": f"Transação temporária validada com sucesso na Vindi ({token_tx}).{env_note}",
                    "request_preview": _sanitize_payload_for_preview(tmp_payload),
                    "response_preview": raw_xml[:1000] if raw_xml else body_json,
                },
            }

        # Vindi Recorrência / Faturas (API v1) -> cria fatura e devolve bill.url
        auth = (self.api_key, "")
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                customer_id = await self._v1_customer_id(client, customer, address)
                product_id = await self._v1_product_id(client)
                bill_payload: Dict[str, Any] = {
                    "customer_id": customer_id,
                    "payment_method_code": "pix",
                    "bill_items": [
                        {"product_id": product_id, "amount": amount, "description": f"PEDIDO LOJA B2C #{order_id}"}
                    ],
                    "code": f"B2C-ORD-{order_id}-{uuid.uuid4().hex[:4].upper()}",
                    "installments": max(1, min(12, int(self.vindi_config.get("max_installments") or 1))),
                }
                r_bill = await client.post(f"{self.v1_url}/bills", json=bill_payload, auth=auth)
        except httpx.HTTPError as e:
            logger.error(f"[Vindi API v1 Link] Falha de comunicação: {e}")
            raise VindiCheckoutError("Não foi possível comunicar com a Vindi para gerar o link de pagamento.")

        if r_bill.status_code not in (200, 201):
            raise VindiCheckoutError(
                f"Vindi recusou a geração do link/fatura (HTTP {r_bill.status_code}): {r_bill.text[:300]}",
                declined=True,
                diagnostics={
                    "endpoint": f"POST {self.v1_url}/bills",
                    "environment": "SANDBOX" if self.sandbox else "PRODUCTION",
                    "http_status": r_bill.status_code,
                    "response_preview": r_bill.text[:1000],
                },
            )

        bill = r_bill.json().get("bill") or {}
        charge = (bill.get("charges") or [{}])[0]
        last_tx = charge.get("last_transaction") or {}
        gw = last_tx.get("gateway_response_fields") or {}
        bill_url = bill.get("url") or charge.get("print_url")
        return {
            "gateway": "VINDI",
            "mode": "VINDI_PAYMENT_LINK",
            "credential_type": "VINDI_API_V1",
            "sandbox": self.sandbox,
            "simulated": False,
            "transaction_id": f"VINDI-BILL-{bill.get('id')}",
            "gateway_tx_id": f"VINDI-BILL-{bill.get('id')}",
            "gateway_status": bill.get("status"),
            "status": "WAITING_PAYMENT",
            "paid": False,
            "amount": amount,
            "payment_url": bill_url,
            "pix_code": gw.get("qrcode_original_path") or gw.get("emv"),
            "pix_qr_code_url": gw.get("qrcode_path"),
            "diagnostics": {
                "endpoint": f"POST {self.v1_url}/bills",
                "environment": "SANDBOX" if self.sandbox else "PRODUCTION",
                "http_status": r_bill.status_code,
            },
        }

    # ------------------------------------------- Vindi Commerce (Intermediador v3)
    async def _charge_vindi_pagamentos(
        self,
        order_id: int,
        amount: float,
        method: str,
        customer: Dict[str, Any],
        address: Optional[Dict[str, Any]],
        card_data: Optional[Dict[str, Any]],
        customer_ip: Optional[str],
        finger_print: Optional[str] = None,
        api_base_url: str = "http://localhost:8000",
    ) -> Dict[str, Any]:
        addr = address or {}
        doc_digits = "".join(filter(str.isdigit, customer.get("cpf") or customer.get("document") or ""))
        phone = "".join(filter(str.isdigit, customer.get("phone") or "")) or "11999999999"
        if len(doc_digits) not in (11, 14):
            raise VindiCheckoutError("CPF (11 dígitos) ou CNPJ (14 dígitos) do cliente inválido para cobrança.")

        payment: Dict[str, Any] = {
            "payment_method_id": str(_YAPAY_PIX_METHOD_ID),
            "split": "1",
        }
        if method == "CREDIT_CARD":
            brand = detect_card_brand((card_data or {}).get("card_number"))
            if not brand:
                raise VindiCheckoutError(
                    "Bandeira do cartão não reconhecida (aceitos: Visa, Mastercard, Elo, Amex, Hipercard, Diners, JCB).",
                    declined=True,
                )
            month, year = self._split_expiration((card_data or {}).get("card_expiration"))
            split_count = max(1, min(12, int((card_data or {}).get("installments") or 1)))
            payment = {
                "payment_method_id": str(_YAPAY_CARD_BRANDS[brand]),
                "split": str(split_count),
                "card_name": ((card_data or {}).get("holder_name") or customer.get("name") or "").upper().strip(),
                "card_number": "".join(filter(str.isdigit, str((card_data or {}).get("card_number")))),
                "card_expdate_month": month,
                "card_expdate_year": year,
                "card_cvv": "".join(filter(str.isdigit, str((card_data or {}).get("card_cvv") or ""))),
            }

        clean_base = (api_base_url or "http://localhost:8000").rstrip("/")
        waf_safe_base = _public_url_for_vindi_waf(clean_base)
        customer_node: Dict[str, Any] = {
            "name": (customer.get("name") or "CLIENTE").upper().strip(),
            "email": (customer.get("email") or "cliente@loja.com.br").strip().lower(),
            "cpf": doc_digits if len(doc_digits) == 11 else None,
            "cnpj": doc_digits if len(doc_digits) == 14 else None,
            "company_name": (customer.get("name") or "").upper().strip() if len(doc_digits) == 14 else None,
            "trade_name": None,
            "contacts": [{"type_contact": "M", "number_contact": phone}],
            "addresses": [
                {
                    "type_address": "B",
                    "postal_code": "".join(filter(str.isdigit, addr.get("zip_code") or "")) or "01001000",
                    "street": (addr.get("street") or "PRACA DA SE").upper(),
                    "number": (addr.get("number") or "100").upper(),
                    "completion": (addr.get("complement") or "").upper(),
                    "neighborhood": (addr.get("neighborhood") or "CENTRO").upper(),
                    "city": (addr.get("city") or "SAO PAULO").upper(),
                    "state": (addr.get("state") or "SP")[:2].upper(),
                }
            ],
        }

        payload: Dict[str, Any] = {
            "token_account": self.api_key,
            "finger_print": finger_print or None,
            "affiliates": None,
            "customer": customer_node,
            "transaction_product": [
                {
                    "description": f"PEDIDO LOJA B2C #{order_id}",
                    "quantity": "1",
                    "price_unit": f"{amount:.2f}",
                    "code": str(order_id),
                }
            ],
            "transaction": {
                "available_payment_methods": self.available_payment_methods_csv(),
                "customer_ip": (
                    customer_ip
                    if (customer_ip and customer_ip not in ("127.0.0.1", "::1", "localhost"))
                    else "177.54.144.10"
                ),
                "max_split_transaction": str(self.vindi_config.get("max_installments", 6)),
                "order_number": f"CRZ-{order_id}-{uuid.uuid4().hex[:4].upper()}",
                "price_additional": None,
                "price_discount": None,
                "shipping_type": "Frete",
                "shipping_price": "0.00",
                "url_notification": self.resolve_webhook_url(clean_base),
            },
            "payment": payment,
        }
        if self.vindi_config.get("reseller_token"):
            payload["reseller_token"] = self.vindi_config["reseller_token"]

        effective_sandbox = self.sandbox
        target_yapay_url = self.yapay_url

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                r = await client.post(target_yapay_url, json=payload)
        except httpx.HTTPError as e:
            logger.error(f"[Vindi Pagamentos] Falha de comunicação: {e}")
            raise VindiCheckoutError(
                f"Não foi possível comunicar com a Vindi ({target_yapay_url}): {e}",
                diagnostics={
                    "endpoint": f"POST {target_yapay_url}",
                    "environment": "SANDBOX" if effective_sandbox else "PRODUCTION",
                    "http_status": 0,
                    "request_preview": _sanitize_payload_for_preview(payload),
                },
            )

        try:
            body = r.json()
        except ValueError:
            body = {}

        # Se retornou 003039 ou 001001, testa automaticamente o ambiente oposto (Sandbox <-> Produção)
        if r.status_code not in (200, 201) or (body.get("message_response") or {}).get("message") != "success":
            raw_err_text = r.text or ""
            if "001001" in raw_err_text or "003039" in raw_err_text:
                alt_sandbox = not self.sandbox
                alt_base = (
                    "https://api.intermediador.sandbox.yapay.com.br"
                    if alt_sandbox
                    else "https://api.intermediador.yapay.com.br"
                )
                alt_url = f"{alt_base}/api/v3/transactions/payment"
                try:
                    async with httpx.AsyncClient(timeout=25.0) as client:
                        r_alt = await client.post(alt_url, json=payload)
                    b_alt = r_alt.json() if r_alt.text else {}
                    if r_alt.status_code in (200, 201) and (b_alt.get("message_response") or {}).get("message") == "success":
                        r = r_alt
                        body = b_alt
                        effective_sandbox = alt_sandbox
                        target_yapay_url = alt_url
                except Exception:
                    pass

        if r.status_code not in (200, 201) or (body.get("message_response") or {}).get("message") != "success":
            v_errors = _extract_yapay_structured_errors(body, r.text)
            err_codes = {x.get("code") for x in v_errors}

            # Fallback Inteligente Vindi Commerce:
            # Muitas contas Vindi Commerce (ex: Lopes Leme Movimento Literário LTDA) possuem o token_account
            # ativo para Checkout Vindi / Carrinho (`POST /v1/tmp_transactions/create` -> `https://checkout.yapay.com.br/transacao/...`),
            # enquanto o endpoint de API Transparente Direta (`/api/v3/transactions/payment`) retorna 001001/003039
            # caso o Checkout Transparente PCI não esteja habilitado no contrato da conta Vindi.
            if err_codes & {"001001", "003039"}:
                try:
                    link_fallback = await self.create_payment_link(
                        order_id=order_id,
                        amount=amount,
                        customer=customer,
                        address=address,
                        api_base_url=api_base_url,
                    )
                    if link_fallback and link_fallback.get("payment_url"):
                        fb_diag = link_fallback.get("diagnostics") or {}
                        fb_env = fb_diag.get("environment") or ("SANDBOX" if link_fallback.get("sandbox") else "PRODUCTION")
                        fb_hint = (
                            f"Seu token_account foi validado com sucesso no ambiente {fb_env} via Checkout Vindi "
                            f"(POST /v1/tmp_transactions/create -> token_transaction {link_fallback.get('token_transaction')}). "
                            f"Observação: O endpoint de API Transparente direta (/api/v3/transactions/payment) retornou {list(err_codes)[0]} "
                            f"porque sua conta Vindi está habilitada para Checkout Hospedado/Link (checkout.yapay.com.br) — "
                            f"o link seguro de pagamento PIX/Cartão foi gerado automaticamente!"
                        )
                        link_fallback["mode"] = "VINDI_PAYMENT_LINK_FALLBACK"
                        link_fallback["diagnostics"] = {
                            **fb_diag,
                            "transparent_http_status": r.status_code,
                            "transparent_vindi_errors": v_errors,
                            "diagnostic_hint": fb_hint,
                        }
                        return link_fallback
                except Exception as fb_err:
                    logger.warning(f"[Vindi Fallback Link] Falha ao tentar fallback tmp_transactions: {fb_err}")

            detail = (
                "; ".join(f"[{x['code']}] {x['message']} (campo: {x['field']})" for x in v_errors)
                or r.text[:300]
            )
            hint_str = (
                " | ".join(dict.fromkeys(x["solution"] for x in v_errors if x.get("solution")))
                or "Verifique o token_account e se o ambiente (Sandbox vs Produção) corresponde à chave."
            )
            diag = {
                "endpoint": f"POST {target_yapay_url}",
                "environment": "SANDBOX" if effective_sandbox else "PRODUCTION",
                "credential_type": "VINDI_COMMERCE_TOKEN",
                "http_status": r.status_code,
                "vindi_errors": v_errors,
                "diagnostic_hint": hint_str,
                "request_preview": _sanitize_payload_for_preview(payload),
                "response_preview": body if body else r.text[:1000],
            }
            logger.warning(f"[Vindi Pagamentos] HTTP {r.status_code} pedido #{order_id}: {detail}")
            raise VindiCheckoutError(
                f"Vindi recusou a cobrança (HTTP {r.status_code}): {detail}",
                declined=True,
                diagnostics=diag,
            )

        tx = (body.get("data_response") or {}).get("transaction") or {}
        pay = tx.get("payment") or {}
        status_id = int(tx.get("status_id") or 0)
        status_name = tx.get("status_name") or str(status_id)
        pay_resp = str(pay.get("payment_response") or "").strip()
        pay_resp_code = str(pay.get("payment_response_code") or "").strip()
        token_tx = str(tx.get("token_transaction") or "")
        tx_id = tx.get("transaction_id") or token_tx

        diag_ok = {
            "endpoint": f"POST {self.yapay_url}",
            "environment": "SANDBOX" if self.sandbox else "PRODUCTION",
            "credential_type": "VINDI_COMMERCE_TOKEN",
            "http_status": r.status_code,
            "vindi_status_id": status_id,
            "vindi_status_name": status_name,
            "payment_response": pay_resp,
            "payment_response_code": pay_resp_code,
            "token_transaction": token_tx,
            "transaction_id": tx_id,
            "url_payment": pay.get("url_payment"),
            "request_preview": _sanitize_payload_for_preview(payload),
            "response_preview": body,
        }

        if method == "CREDIT_CARD" and status_id in _YAPAY_STATUS_DECLINED:
            op_detail = f" — Operadora: {pay_resp} (cód. {pay_resp_code})" if pay_resp else ""
            raise VindiCheckoutError(
                f"Pagamento no cartão recusado ({status_name}{op_detail}).",
                declined=True,
                diagnostics=diag_ok,
            )

        return {
            "gateway": "VINDI",
            "mode": "VINDI_PAGAMENTOS",
            "credential_type": "VINDI_PAGAMENTOS",
            "sandbox": self.sandbox,
            "simulated": False,
            "transaction_id": f"VINDI-PG-{tx_id}",
            "gateway_tx_id": token_tx or f"VINDI-PG-{tx_id}",
            "token_transaction": token_tx,
            "gateway_status": f"{status_name} (status_id={status_id})" + (f" — {pay_resp}" if pay_resp else ""),
            "status": "PAID" if status_id in _YAPAY_STATUS_PAID else "WAITING_PAYMENT",
            "paid": status_id in _YAPAY_STATUS_PAID,
            "amount": amount,
            "payment_url": pay.get("url_payment") or None,
            "pix_code": pay.get("qrcode_original_path") if method == "PIX" else None,
            "pix_qr_code_url": pay.get("qrcode_path") if method == "PIX" else None,
            "diagnostics": diag_ok,
        }

    # ------------------------------------------------- Vindi Recorrência (API v1)
    async def _v1_customer_id(self, client: httpx.AsyncClient, customer: Dict[str, Any], address: Optional[Dict[str, Any]]):
        auth = (self.api_key, "")
        cpf = "".join(filter(str.isdigit, customer.get("cpf") or ""))
        r = await client.get(f"{self.v1_url}/customers", params={"query": f"registry_code:{cpf}"}, auth=auth)
        if r.status_code == 401:
            raise VindiCheckoutError(
                "Chave da API Vindi Recorrência (v1) inválida ou de outro ambiente (Sandbox vs Produção).",
                diagnostics={
                    "endpoint": f"GET {self.v1_url}/customers",
                    "environment": "SANDBOX" if self.sandbox else "PRODUCTION",
                    "http_status": 401,
                    "diagnostic_hint": "Verifique se a API Key da Vindi Recorrência pertence ao ambiente selecionado.",
                },
            )
        if r.status_code == 200 and (r.json().get("customers") or []):
            return r.json()["customers"][0]["id"]

        payload: Dict[str, Any] = {
            "name": (customer.get("name") or "CLIENTE").upper().strip(),
            "email": (customer.get("email") or "").strip().lower(),
            "registry_code": cpf,
            "code": f"B2C-{cpf}",
        }
        if address and address.get("zip_code"):
            payload["address"] = {
                "street": (address.get("street") or "").upper(),
                "number": (address.get("number") or "S/N").upper(),
                "additional_details": (address.get("complement") or "").upper(),
                "zipcode": "".join(filter(str.isdigit, address.get("zip_code") or "")),
                "neighborhood": (address.get("neighborhood") or "").upper(),
                "city": (address.get("city") or "").upper(),
                "state": (address.get("state") or "")[:2].upper(),
                "country": "BR",
            }
        r = await client.post(f"{self.v1_url}/customers", json=payload, auth=auth)
        if r.status_code not in (200, 201):
            raise VindiCheckoutError(
                f"Vindi recusou o cadastro do cliente (HTTP {r.status_code}): {r.text[:300]}",
                diagnostics={
                    "endpoint": f"POST {self.v1_url}/customers",
                    "environment": "SANDBOX" if self.sandbox else "PRODUCTION",
                    "http_status": r.status_code,
                    "response_preview": r.text[:1000],
                },
            )
        return r.json()["customer"]["id"]

    async def _v1_product_id(self, client: httpx.AsyncClient):
        auth = (self.api_key, "")
        r = await client.get(f"{self.v1_url}/products", params={"query": "code:PEDIDO_B2C"}, auth=auth)
        if r.status_code == 200 and (r.json().get("products") or []):
            return r.json()["products"][0]["id"]
        r = await client.post(
            f"{self.v1_url}/products",
            json={
                "name": "PEDIDO LOJA VIRTUAL B2C",
                "code": "PEDIDO_B2C",
                "status": "active",
                "pricing_schema": {"price": 0, "schema_type": "flat"},
            },
            auth=auth,
        )
        if r.status_code not in (200, 201):
            raise VindiCheckoutError(f"Vindi recusou o cadastro do produto padrão: {r.text[:300]}")
        return r.json()["product"]["id"]

    async def _charge_api_v1(self, order_id, amount, method, customer, address, card_data):
        auth = (self.api_key, "")
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                customer_id = await self._v1_customer_id(client, customer, address)
                product_id = await self._v1_product_id(client)

                if method == "CREDIT_CARD":
                    r_prof = await client.post(
                        f"{self.v1_url}/payment_profiles",
                        json={
                            "holder_name": (card_data.get("holder_name") or customer.get("name") or "").upper(),
                            "card_expiration": card_data.get("card_expiration"),
                            "card_number": "".join(filter(str.isdigit, str(card_data.get("card_number")))),
                            "card_cvv": str(card_data.get("card_cvv") or ""),
                            "payment_method_code": "credit_card",
                            "customer_id": customer_id,
                        },
                        auth=auth,
                    )
                    if r_prof.status_code not in (200, 201):
                        raise VindiCheckoutError(
                            f"Cartão recusado pela Vindi (HTTP {r_prof.status_code}): {r_prof.text[:300]}",
                            declined=True,
                            diagnostics={
                                "endpoint": f"POST {self.v1_url}/payment_profiles",
                                "environment": "SANDBOX" if self.sandbox else "PRODUCTION",
                                "http_status": r_prof.status_code,
                                "response_preview": r_prof.text[:1000],
                            },
                        )

                bill_payload: Dict[str, Any] = {
                    "customer_id": customer_id,
                    "payment_method_code": "pix" if method == "PIX" else "credit_card",
                    "bill_items": [
                        {"product_id": product_id, "amount": amount, "description": f"PEDIDO LOJA B2C #{order_id}"}
                    ],
                    "code": f"B2C-ORD-{order_id}-{uuid.uuid4().hex[:4].upper()}",
                }
                if method == "CREDIT_CARD":
                    bill_payload["installments"] = max(1, min(12, int(card_data.get("installments") or 1)))

                r_bill = await client.post(f"{self.v1_url}/bills", json=bill_payload, auth=auth)
        except httpx.HTTPError as e:
            logger.error(f"[Vindi API v1] Falha de comunicação: {e}")
            raise VindiCheckoutError("Não foi possível comunicar com a Vindi. Tente novamente em instantes.")

        if r_bill.status_code not in (200, 201):
            raise VindiCheckoutError(
                f"Vindi recusou a fatura (HTTP {r_bill.status_code}): {r_bill.text[:300]}",
                declined=True,
                diagnostics={
                    "endpoint": f"POST {self.v1_url}/bills",
                    "environment": "SANDBOX" if self.sandbox else "PRODUCTION",
                    "http_status": r_bill.status_code,
                    "response_preview": r_bill.text[:1000],
                },
            )

        bill = r_bill.json().get("bill") or {}
        charge = (bill.get("charges") or [{}])[0]
        last_tx = charge.get("last_transaction") or {}
        gw = last_tx.get("gateway_response_fields") or {}
        paid = bill.get("status") == "paid" or charge.get("status") == "paid"
        if method == "CREDIT_CARD" and not paid and last_tx.get("status") in ("rejected", "failure"):
            raise VindiCheckoutError(
                f"Pagamento recusado: {last_tx.get('gateway_message') or last_tx.get('status')}",
                declined=True,
                diagnostics={
                    "endpoint": f"POST {self.v1_url}/bills",
                    "environment": "SANDBOX" if self.sandbox else "PRODUCTION",
                    "http_status": r_bill.status_code,
                    "response_preview": bill,
                },
            )
        return {
            "gateway": "VINDI",
            "mode": "VINDI_API_V1",
            "credential_type": "VINDI_API_V1",
            "sandbox": self.sandbox,
            "simulated": False,
            "transaction_id": f"VINDI-BILL-{bill.get('id')}",
            "gateway_tx_id": f"VINDI-BILL-{bill.get('id')}",
            "gateway_status": bill.get("status"),
            "status": "PAID" if paid else "WAITING_PAYMENT",
            "paid": paid,
            "amount": amount,
            "payment_url": bill.get("url") or charge.get("print_url"),
            "pix_code": (gw.get("qrcode_original_path") or gw.get("emv")) if method == "PIX" else None,
            "pix_qr_code_url": gw.get("qrcode_path") if method == "PIX" else None,
            "diagnostics": {
                "endpoint": f"POST {self.v1_url}/bills",
                "environment": "SANDBOX" if self.sandbox else "PRODUCTION",
                "http_status": r_bill.status_code,
            },
        }

    # ------------------------------------------------------------- simulação
    def _simulated(self, order_id: int, amount: float, method: str) -> Dict[str, Any]:
        tx_ref = f"SIMULADO-{order_id}-{uuid.uuid4().hex[:6].upper()}"
        return {
            "gateway": "VINDI",
            "mode": "SIMULADO_SEM_CHAVE",
            "credential_type": "NONE",
            "sandbox": True,
            "simulated": True,
            "transaction_id": tx_ref,
            "gateway_tx_id": tx_ref,
            "gateway_status": "simulated",
            "status": "SIMULATED",
            "paid": False,
            "amount": amount,
            "pix_code": None,
            "pix_qr_code_url": None,
            "diagnostics": {
                "diagnostic_hint": "Nenhuma chave (token_account) foi informada. Preencha o Token da Conta Vindi e salve."
            },
        }

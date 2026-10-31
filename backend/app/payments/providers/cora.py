"""
cora.py
-------
Provedor Banco Cora (Integração Direta) para o Hub de Pagamentos.

Usa CoraConfig (ambiente ativo, formas, multa/juros/desconto, notificações) e CoraAccount (credenciais
do ambiente ativo). Uma única sessão mTLS por bloco `with` (reaproveitada em lotes).
"""
import re
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.integrators.cora.client import CoraAPIError, CoraClient, CoraConfigError
from app.models.cora import CoraAccount, CoraConfig
from app.payments.base import ChargeRequest, ChargeResult, PaymentProvider, PaymentProviderError

_STATUS_MAP = {"CANCELED": "CANCELLED", "DRAFT": "PENDING"}


def _digits(v: Any) -> str:
    return re.sub(r"\D", "", str(v or ""))


def _clean(v: Any, max_len: int) -> str:
    return re.sub(r"\s+", " ", str(v or "")).strip()[:max_len]


def _cents(v: Decimal) -> int:
    return int((Decimal(str(v)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _from_cents(v: Any) -> Optional[Decimal]:
    return None if v is None else (Decimal(int(v)) / Decimal(100)).quantize(Decimal("0.01"))


def _parse_dt(v: Any) -> Optional[datetime]:
    if not v:
        return None
    try:
        dt = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        try:
            dt = datetime.strptime(str(v)[:10], "%Y-%m-%d")
        except ValueError:
            return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


class CoraProvider(PaymentProvider):
    code = "CORA"
    capabilities = frozenset({"BOLETO", "PIX"})
    min_amount = Decimal("5.00")   # regra do Cora: amount >= 500 centavos

    def __init__(self, db: Session, company_id: int, environment: Optional[str] = None):
        self.db = db
        self.company_id = company_id
        self.config = db.query(CoraConfig).filter(CoraConfig.company_id == company_id).first()
        env = (environment or (self.config.active_environment if self.config else "STAGE")).upper()
        self._environment = env
        self.account = db.query(CoraAccount).filter(
            CoraAccount.company_id == company_id, CoraAccount.environment == env
        ).first()
        if not self.account or not (self.account.client_id and self.account.cert_content and self.account.key_content):
            raise PaymentProviderError(
                f"Credenciais do Banco Cora ({'Produção' if env == 'PRODUCTION' else 'Stage'}) não cadastradas."
            )
        self._client: Optional[CoraClient] = None

    @property
    def environment(self) -> str:
        return self._environment

    # ── sessão mTLS ──────────────────────────────────────────────────────────
    def __enter__(self):
        self._open()
        return self

    def _open(self) -> CoraClient:
        if self._client is None:
            try:
                self._client = CoraClient.from_account(self.account).__enter__()
            except CoraConfigError as e:
                raise PaymentProviderError(str(e))
        return self._client

    def close(self):
        if self._client is not None:
            self._client.close()
            self._client = None

    def _call(self, fn, *args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except (CoraAPIError, CoraConfigError) as e:
            raise PaymentProviderError(f"Cora: {e}", status_code=getattr(e, "status_code", None))

    # ── payload ──────────────────────────────────────────────────────────────
    def validate(self, method, amount, due_date, payer) -> None:
        if method not in self.capabilities:
            raise PaymentProviderError(f"O Banco Cora não suporta a forma de pagamento {method}.")
        if Decimal(str(amount)).quantize(Decimal("0.01")) < self.min_amount:
            raise PaymentProviderError("Valor mínimo de boleto no Banco Cora é R$ 5,00.")
        if due_date < datetime.now().date():
            raise PaymentProviderError("O vencimento não pode ser anterior a hoje.")
        if len(_digits(payer.document)) not in (11, 14):
            raise PaymentProviderError("CPF/CNPJ do pagador inválido.")
        missing = [label for label, v in (
            ("nome", payer.name), ("logradouro", payer.street), ("bairro", payer.district),
            ("cidade", payer.city), ("UF", payer.state), ("CEP", _digits(payer.zip_code)),
        ) if not _clean(v, 100)]
        if missing:
            raise PaymentProviderError(f"Dados do pagador incompletos: {', '.join(missing)}.")

    def build_payload(self, req: ChargeRequest) -> Dict[str, Any]:
        self.validate(req.method, req.amount, req.due_date, req.payer)
        amount = Decimal(str(req.amount)).quantize(Decimal("0.01"))
        p = req.payer
        document = _digits(p.document)
        address = {
            "street": _clean(p.street, 100),
            "number": _clean(p.number, 20) or "S/N",
            "district": _clean(p.district, 60),
            "city": _clean(p.city, 60),
            "state": _clean(p.state, 2).upper(),
            "complement": _clean(p.complement, 60) or "N/A",
            "zip_code": _digits(p.zip_code).zfill(8)[:8],
        }

        customer: Dict[str, Any] = {
            "name": _clean(p.name, 60),
            "document": {"identity": document, "type": "CNPJ" if len(document) == 14 else "CPF"},
            "address": address,
        }
        if p.email:
            customer["email"] = _clean(p.email, 60)

        cfg, opt = self.config, req.options or {}
        terms: Dict[str, Any] = {"due_date": req.due_date.isoformat()}
        fine = opt.get("fine_rate", cfg.fine_rate if cfg else None)
        interest = opt.get("interest_rate", cfg.interest_rate if cfg else None)
        discount = opt.get("discount_rate", cfg.discount_rate if cfg else None)
        if fine and Decimal(str(fine)) > 0:
            terms["fine"] = {"rate": float(fine)}
        if interest and Decimal(str(interest)) > 0:
            terms["interest"] = {"rate": float(interest)}
        if discount and Decimal(str(discount)) > 0:
            terms["discount"] = {"type": "PERCENT", "value": float(discount)}

        forms = ["BANK_SLIP", "PIX"] if (not cfg or cfg.payment_forms == "BANK_SLIP_PIX") else ["BANK_SLIP"]
        svc_name = _clean(opt.get("service_name") or req.description, 60) or "Cobrança"
        svc_desc = _clean(opt.get("service_description") or req.description, 100) or "Cobrança"
        payload: Dict[str, Any] = {
            "code": _clean(req.code, 60),
            "customer": customer,
            "services": [{
                "name": svc_name,
                "description": svc_desc,
                "amount": _cents(amount),
            }],
            "payment_terms": terms,
            "payment_forms": forms,
        }
        rules = [r for r in ((cfg.notify_rules or "").split(",") if cfg else []) if r]
        if cfg and cfg.notify_enabled and p.email and rules:
            payload["notification"] = {
                "name": customer["name"],
                "channels": [{"channel": "EMAIL", "contact": customer["email"], "rules": rules}],
            }
        return payload

    @staticmethod
    def normalize(data: Dict[str, Any]) -> ChargeResult:
        bank_slip = ((data or {}).get("payment_options") or {}).get("bank_slip") or {}
        status = (data.get("status") or "PENDING").upper()
        status = _STATUS_MAP.get(status, status)
        paid_at = _parse_dt(data.get("occurrence_date")) if status == "PAID" else None
        if status == "PAID" and not paid_at:
            payments = data.get("payments") or []
            paid_at = _parse_dt((payments[0] or {}).get("finalized_at")) if payments else None
        return ChargeResult(
            provider_charge_id=data.get("id"),
            status=status,
            digitable_line=bank_slip.get("digitable"),
            barcode=bank_slip.get("barcode"),
            our_number=bank_slip.get("our_number"),
            pix_emv=(data.get("pix") or {}).get("emv"),
            pdf_url=bank_slip.get("url"),
            registered=bank_slip.get("registered"),
            total_paid=_from_cents(data.get("total_paid")),
            paid_at=paid_at,
        )

    # ── operações ────────────────────────────────────────────────────────────
    def create_charge(self, request: ChargeRequest) -> ChargeResult:
        payload = self.build_payload(request)
        data = self._call(self._open().create_invoice, payload, idempotency_key=request.idempotency_key)
        return self.normalize(data)

    def get_charge(self, provider_charge_id: str) -> ChargeResult:
        return self.normalize(self._call(self._open().get_invoice, provider_charge_id))

    def cancel_charge(self, provider_charge_id: str) -> None:
        self._call(self._open().cancel_invoice, provider_charge_id)

    def list_charges(self, start=None, end=None, state=None, search=None, page=1, per_page=200) -> List[ChargeResult]:
        data = self._call(self._open().list_invoices, start=start, end=end, state=state, search=search, page=page, per_page=per_page)
        return [self.normalize(i) for i in (data or {}).get("items", [])]

    def simulate_payment(self, provider_charge_id: str) -> None:
        if self.environment != "STAGE":
            raise PaymentProviderError("Pagamento simulado só é permitido no ambiente Stage.")
        self._call(self._open().stage_pay_invoice, provider_charge_id)

    # ── webhooks ─────────────────────────────────────────────────────────────
    def register_webhooks(self, url: str, previous_ids: List[str]) -> List[str]:
        client = self._open()
        for old in previous_ids:
            try:
                client.delete_endpoint(old)
            except CoraAPIError:
                pass
        created = []
        for trigger in ("paid", "canceled", "overdue"):
            res = self._call(client.create_endpoint, url=url, resource="invoice", trigger=trigger)
            if isinstance(res, dict) and res.get("id"):
                created.append(res["id"])
        return created

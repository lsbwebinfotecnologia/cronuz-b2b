"""
base.py
-------
Contrato único dos intermediadores de pagamento. Cada provedor traduz este contrato para a sua API.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional


class PaymentProviderError(Exception):
    """Erro de negócio/comunicação com o intermediador (mensagem pronta para o usuário)."""

    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


@dataclass
class ChargePayer:
    name: str
    document: str                       # CPF/CNPJ (somente dígitos)
    email: Optional[str] = None
    street: Optional[str] = None
    number: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    complement: Optional[str] = None

    def as_dict(self) -> Dict[str, Any]:
        return {k: v for k, v in self.__dict__.items()}


@dataclass
class ChargeRequest:
    method: str                         # BOLETO | PIX | CARD | LINK
    amount: Decimal
    due_date: date
    payer: ChargePayer
    description: str
    code: str                           # referência enviada ao provedor
    idempotency_key: str
    options: Dict[str, Any] = field(default_factory=dict)   # sobrescritas (multa/juros/desconto) por cobrança


@dataclass
class ChargeResult:
    """Retorno normalizado de qualquer provedor."""
    provider_charge_id: Optional[str]
    status: str                         # PENDING, OPEN, LATE, IN_PAYMENT, PAID, CANCELLED
    digitable_line: Optional[str] = None
    barcode: Optional[str] = None
    our_number: Optional[str] = None
    pix_emv: Optional[str] = None
    pdf_url: Optional[str] = None
    registered: Optional[bool] = None
    total_paid: Optional[Decimal] = None
    paid_at: Optional[datetime] = None


class PaymentProvider(ABC):
    code: str = ""
    capabilities: frozenset = frozenset()
    min_amount: Decimal = Decimal("0.01")

    @property
    @abstractmethod
    def environment(self) -> str:
        """STAGE | PRODUCTION"""

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()

    def close(self):
        pass

    def validate(self, method: str, amount: Decimal, due_date: date, payer: ChargePayer) -> None:
        """Validação local antes de gravar/emitir (sem chamada ao provedor). Levanta PaymentProviderError."""
        return None

    @abstractmethod
    def create_charge(self, request: ChargeRequest) -> ChargeResult: ...

    @abstractmethod
    def get_charge(self, provider_charge_id: str) -> ChargeResult: ...

    @abstractmethod
    def cancel_charge(self, provider_charge_id: str) -> None: ...

    def list_charges(self, **filters) -> List[ChargeResult]:
        raise PaymentProviderError(f"{self.code}: listagem em lote não suportada.")

    def simulate_payment(self, provider_charge_id: str) -> None:
        raise PaymentProviderError(f"{self.code}: pagamento simulado não suportado.")

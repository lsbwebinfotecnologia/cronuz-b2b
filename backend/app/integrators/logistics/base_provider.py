from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Type
from app.models.logistics_settings import LogisticsSettings

class LogisticsProvider(ABC):
    def __init__(self, settings: LogisticsSettings):
        self.settings = settings

    @abstractmethod
    async def test_connection(self) -> dict:
        """Test the connection to the logistics provider."""
        pass

    @abstractmethod
    async def send_order(self, payload: dict) -> dict:
        """Send an order to the logistics provider."""
        pass

    @abstractmethod
    async def get_movements(self, start_date: str, end_date: str, situacao: Optional[str] = None, codigo_referencia: Optional[str] = None) -> List[dict]:
        """Fetch movement updates (e.g., status changes) from the provider."""
        pass

    @abstractmethod
    async def invoice_order(self, id_sys_log: str, payload: dict) -> dict:
        """Send invoice details to the logistics provider."""
        pass

    @classmethod
    def factory(cls, provider_name: str, settings: LogisticsSettings) -> "LogisticsProvider":
        if provider_name.upper() == "MKT":
            from app.integrators.logistics.mkt_provider import MKTProvider
            return MKTProvider(settings)
        raise ValueError(f"Provider {provider_name} not supported.")

    @classmethod
    def supported_providers(cls) -> List[str]:
        return ["MKT"]

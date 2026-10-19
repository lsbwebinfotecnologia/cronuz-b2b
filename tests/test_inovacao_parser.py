"""Teste local (sem rede) do parser da Inovação com o payload real capturado em 19/10/2026."""
import asyncio
import sys
from unittest.mock import patch

sys.path.insert(0, "backend")
from app.integrators.inovacao_client import InovacaoClient  # noqa: E402

REAL = {"code": 200, "message": "OK", "estoques": {"04774358000122": {"9786551990168": {
    "produto": "Enaldinho na Copa Starter Pack", "qtd": "10.0", "reserva": "0.0",
    "situacao": "Disponível", "preco": "89.900000000000006", "disponivel": 10, "desconto": "40.0"}}}}


class FakeResp:
    status_code = 200
    text = ""

    def json(self):
        return REAL


class FakeClient:
    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def get(self, *a, **k):
        return FakeResp()


async def main():
    with patch("app.integrators.inovacao_client.httpx.AsyncClient", FakeClient):
        r = await InovacaoClient("", "u", "p").get_stock_by_isbn("9786551990168")
    r.pop("raw")
    print(r)
    assert r["found"] and r["saldo"] == 10 and r["preco"] == 89.9 and r["titulo"].startswith("Enaldinho")
    print("OK")


asyncio.run(main())

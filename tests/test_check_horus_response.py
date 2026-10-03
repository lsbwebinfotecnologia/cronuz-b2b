import sys
import os
import asyncio

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

import main
from app.db.session import SessionLocal
from app.integrators.horus_product_search import HorusProductSearch
from app.core.utils import parse_horus_price

async def main_test():
    db = SessionLocal()
    try:
        client = HorusProductSearch(db, 4)
        res = await client.busca_acervo(term="ps", search_option="NOME", limit=6)
        print(f"Total results: {len(res) if isinstance(res, list) else 0}")
        if isinstance(res, list):
            for i, it in enumerate(res):
                title = it.get("NOM_ITEM")
                isbn = it.get("COD_BARRA_ITEM") or it.get("COD_ISBN_ITEM")
                vlr_capa = it.get("VLR_CAPA")
                price_val = (
                    it.get("VLR_CAPA")
                    or it.get("PRECO")
                    or it.get("VLR_ITEM")
                    or it.get("PRECO_TABELA")
                    or it.get("PRECO_VENDA")
                    or it.get("PRECO_CAPA")
                    or it.get("VLR_LIQUIDO")
                    or 0.0
                )
                parsed_price = parse_horus_price(price_val)
                print(f"[{i+1}] {title} | ISBN: {isbn} | VLR_CAPA: {vlr_capa} -> Parsed: R$ {parsed_price:.2f}")
        await client.close()
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(main_test())

import asyncio
import os
import sys

sys.path.insert(0, "/var/www/cronuz/backend")
os.chdir("/var/www/cronuz/backend")

import main
from app.db.session import SessionLocal
from app.models.logistics_settings import LogisticsSettings
from app.integrators.logistics.base_provider import LogisticsProvider

async def test_mkt_items():
    db = SessionLocal()
    st = db.query(LogisticsSettings).filter(LogisticsSettings.company_id == 22).first()
    p = LogisticsProvider.factory(st.provider, st)
    for ped in [19597, 19595, 19534, 19598]:
        movs = await p.get_movements(start_date="2026-09-20", end_date="2026-09-24", codigo_referencia=str(ped))
        print(f"=== MKT PARA PEDIDO {ped} ===")
        if not movs:
            print("Nenhum movimento retornado")
            continue
        m = movs[0]
        mov = m.get("Movimento") or {}
        sit = mov.get("situacao") or m.get("situacao")
        dt_pick = mov.get("picking_dh_finish")
        print(f"Situacao: {sit} | dt_pick: {dt_pick}")
        itens = m.get("MovimentoItensPedido") or []
        print(f"Total Itens no MKT: {len(itens)}")
        for it in itens[:8]:
            prod = it.get("Produto") or {}
            cprod = prod.get("codigo_cliente") or it.get("cProd")
            ean = prod.get("codigo_barras") or it.get("cEAN")
            inner_mov = it.get("MovimentoItensPedido")
            print(f"  Item: {cprod} | EAN: {ean} | it.qty_bom: {it.get('quantidade_bom')} | it.qty: {it.get('quantidade')}")
            if inner_mov and isinstance(inner_mov, list) and len(inner_mov) > 0:
                print(f"    Inner mov: {inner_mov[0]}")
        await asyncio.sleep(2.0)
    db.close()

if __name__ == "__main__":
    asyncio.run(test_mkt_items())

import asyncio
import os
import sys

sys.path.insert(0, "/var/www/cronuz/backend")
os.chdir("/var/www/cronuz/backend")

import main
from app.db.session import SessionLocal
from app.integrators.horus_logistics import HorusLogisticsClient

async def inspect():
    db = SessionLocal()
    h = HorusLogisticsClient(db, 22)
    peds = [19597, 19595, 19534, 19598]
    
    for p in peds:
        print(f"================ PEDIDO {p} ================")
        cab = await h.get("Busca_PedidosVenda", params={"COD_EMPRESA": 1, "COD_FILIAL": 2, "COD_PED_VENDA": p})
        if cab and isinstance(cab, list):
            c = cab[0]
            st = c.get("STATUS_PEDIDO_VENDA")
            cli = c.get("COD_CLI")
            dt = c.get("DAT_PEDIDO")
            vlr = c.get("VLR_TOTAL_PEDIDO")
            print(f"Horus Cabecalho: STATUS={st} | COD_CLI={cli} | DATA={dt} | VLR={vlr}")
            
            itens = await h.get("Busca_ItensPedidosVenda", params={"COD_EMPRESA": 1, "COD_FILIAL": 2, "COD_CLI": cli, "COD_PED_VENDA": p})
            if itens and isinstance(itens, list):
                print(f"Itens no Horus ({len(itens)}):")
                for it in itens:
                    cod = it.get("COD_ITEM")
                    ean = it.get("COD_BARRA_ITEM_ALT")
                    nome = it.get("NOM_ITEM")
                    qp = it.get("QT_PEDIDA")
                    qa = it.get("QT_ATENDIDA")
                    print(f"  Item: {cod} | EAN: {ean} | Nome: {nome} | QtdPedida: {qp} | QtdAtendida: {qa}")
        else:
            print(f"Cabecalho nao encontrado na filial 2 para pedido {p}")
            
    await h.close()
    db.close()

if __name__ == "__main__":
    asyncio.run(inspect())

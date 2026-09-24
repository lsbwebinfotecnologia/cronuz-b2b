import asyncio
import main
from app.db.session import SessionLocal
from app.integrators.horus_logistics import HorusLogisticsClient

async def main():
    db = SessionLocal()
    try:
        client = HorusLogisticsClient(db, 4)
        # Busca pedido 19594
        p_res = await client.get("Busca_PedidosVenda", params={
            "COD_EMPRESA": "1",
            "COD_FILIAL": "2",
            "COD_PED_VENDA": 19594,
            "OFFSET": 0,
            "LIMIT": 1
        })
        print("Pedido 19594:", p_res)
        
        # Itens do pedido 19594 no Horus
        it_res = await client.get_order_items(19594, "1", "2")
        print("Itens do pedido 19594 no Horus:", it_res)

        # Testa chamada ConfereItem_Pedido para o primeiro item
        if it_res and isinstance(it_res, list) and len(it_res) > 0:
            it = it_res[0]
            cod_item = it.get("COD_ITEM")
            cod_cli = p_res[0].get("COD_CLI") if isinstance(p_res, list) and len(p_res) > 0 else "1"
            print(f"Testando ConfereItem_Pedido para cod_item={cod_item}, cod_cli={cod_cli}...")
            conf_res = await client.confere_item_pedido(
                cod_empresa="1",
                cod_filial="2",
                cod_cli=str(cod_cli),
                cod_ped_venda="19594",
                cod_item=str(cod_item),
                cod_local="1",
                qtd_atendida=1
            )
            print("Resposta ConfereItem_Pedido:", conf_res)
    finally:
        await client.close()
        db.close()

if __name__ == "__main__":
    asyncio.run(main())

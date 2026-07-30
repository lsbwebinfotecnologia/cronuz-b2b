"""
Script: refresh_orders_from_erdos.py
Busca os dados atualizados de pedidos específicos no Hub-Erdos
e atualiza customer_data e items_data no banco local.
NÃO altera o status dos pedidos.

Uso:
  python tests/refresh_orders_from_erdos.py [--company-id N] [--order-ids 1 2 3]
"""
import sys, os, asyncio, json, argparse
import psycopg2
import psycopg2.extras

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

DB_URL = "postgresql://cronuz_admin:cronuz_password_123@localhost:5432/cronuz_b2b"


async def refresh_order_data(company_id: int = None, order_ids: list = None):
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    try:
        # Buscar pedidos solicitados com seus configs
        where = []
        params = []
        if company_id:
            where.append("o.company_id = %s")
            params.append(company_id)
        if order_ids:
            where.append(f"o.id = ANY(%s)")
            params.append(order_ids)

        where_clause = "WHERE " + " AND ".join(where) if where else ""
        cur.execute(f"""
            SELECT
                o.id, o.external_order_id, o.status, o.config_id,
                o.customer_data, o.items_data,
                c.api_token, c.api_base_url, c.enabled
            FROM dsp_order o
            JOIN dsp_config c ON c.id = o.config_id
            {where_clause}
            ORDER BY o.id ASC
        """, params or [])

        orders = cur.fetchall()
        if not orders:
            print("Nenhum pedido encontrado com os filtros informados.")
            return

        print(f"Pedidos encontrados: {len(orders)}")

        # Importar ErdosClient aqui para não quebrar os imports de models
        from app.integrators.erdos_client import ErdosClient, ErdosClientError

        updated = 0
        errors = []

        for order in orders:
            order_id    = order["id"]
            ext_id      = str(order["external_order_id"])
            status      = order["status"]
            api_token   = order["api_token"]
            api_base    = order["api_base_url"]
            enabled     = order["enabled"]

            print(f"\n{'─'*50}")
            print(f"Pedido ID={order_id} | ext_id={ext_id} | status={status}")

            if not enabled:
                print("  ⚠️  Integração desativada — pulando")
                continue
            if not api_token or not api_base:
                print("  ⚠️  Token/URL não configurados — pulando")
                continue

            client = ErdosClient(base_url=api_base, api_key=api_token)
            try:
                data = await client.get_order(ext_id)

                if not data or (isinstance(data, dict) and (data.get("error") or data.get("detail"))):
                    msg = (data or {}).get("detail") or (data or {}).get("error") or "Pedido não encontrado"
                    print(f"  ⚠️  {msg}")
                    errors.append({"order_id": order_id, "ext_id": ext_id, "error": msg})
                    await client.close()
                    continue

                # Exibir dados recebidos
                cliente = data.get("dados_cliente") or {}
                itens   = data.get("itens") or []
                print(f"  Nome:     {cliente.get('nome', 'N/A')}")
                print(f"  CPF:      {cliente.get('cpf_cnpj', 'N/A')}")
                print(f"  CEP:      {cliente.get('cep', 'N/A')}")
                print(f"  UF:       {cliente.get('uf', 'N/A')}")
                print(f"  Cidade:   {cliente.get('cidade', 'N/A')}")
                print(f"  Endereço: {cliente.get('endereco', 'N/A')}, {cliente.get('numero', '')}")
                print(f"  Itens:    {len(itens)}")

                # Atualizar apenas dados — sem mexer no status
                cur.execute("""
                    UPDATE dsp_order
                    SET customer_data = %s,
                        items_data    = %s,
                        synced_at     = NOW()
                    WHERE id = %s
                """, (
                    json.dumps(cliente, ensure_ascii=False) if cliente else None,
                    json.dumps(itens,   ensure_ascii=False) if itens   else None,
                    order_id,
                ))
                updated += 1
                print(f"  ✅ Dados atualizados no banco")

            except ErdosClientError as e:
                print(f"  ❌ Erro Erdos: {e}")
                errors.append({"order_id": order_id, "ext_id": ext_id, "error": str(e)})
            except Exception as e:
                print(f"  ❌ Erro inesperado: {e}")
                errors.append({"order_id": order_id, "ext_id": ext_id, "error": str(e)})
            finally:
                await client.close()

        conn.commit()
        print(f"\n{'='*50}")
        print(f"✅ Atualizados: {updated} | ❌ Erros: {len(errors)}")
        if errors:
            for e in errors:
                print(f"  ID={e['order_id']} ext={e['ext_id']}: {e['error']}")

    except Exception as e:
        conn.rollback()
        print(f"Erro geral: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Refresh order data from Erdos")
    parser.add_argument("--company-id", type=int, default=None, help="Filtrar por company_id")
    parser.add_argument("--order-ids", type=int, nargs="+", default=None, help="IDs dos pedidos locais")
    args = parser.parse_args()

    asyncio.run(refresh_order_data(
        company_id=args.company_id,
        order_ids=args.order_ids,
    ))

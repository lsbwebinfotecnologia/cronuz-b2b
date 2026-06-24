import re

def update_endpoint(filepath):
    content = open(filepath).read()
    
    # We will replace the debug code block inside both files
    old_block_customer = '''        try:
            horus_client = HorusClients(db, company.id)
            result = await horus_client.get_consignment_summary(
                cnpj_destino=cnpj_destino,
                cnpj_cliente=cnpj_cliente,
                id_guid=id_guid,
                cod_ctr=cod_ctr
            )
            await horus_client.close()
        except Exception as e:
            result = str(e)

        return {"params": debug_payload, "response": result}'''

    new_block_customer = '''        try:
            horus_client = HorusClients(db, company.id)
            result_sintetico = await horus_client.get_consignment_summary(
                cnpj_destino=cnpj_destino,
                cnpj_cliente=cnpj_cliente,
                id_guid=id_guid,
                cod_ctr=cod_ctr
            )
            result_analitico = await horus_client.get_consignment_details(
                cnpj_destino=cnpj_destino,
                cnpj_cliente=cnpj_cliente,
                id_guid=id_guid,
                cod_ctr=cod_ctr
            )
            await horus_client.close()
        except Exception as e:
            result_sintetico = str(e)
            result_analitico = "Not reached due to error in Sintetico"

        return {"params": debug_payload, "response": result_sintetico, "response_analitico": result_analitico}'''

    old_block_master = '''        try:
            horus_client = HorusClients(db, company_id)
            result = await horus_client.get_consignment_summary(
                cnpj_destino=cnpj_destino,
                cnpj_cliente=cnpj_cliente,
                id_guid=id_guid,
                cod_ctr=cod_ctr
            )
            await horus_client.close()
        except Exception as e:
            result = str(e)

        return {"params": debug_payload, "response": result}'''

    new_block_master = '''        try:
            horus_client = HorusClients(db, company_id)
            result_sintetico = await horus_client.get_consignment_summary(
                cnpj_destino=cnpj_destino,
                cnpj_cliente=cnpj_cliente,
                id_guid=id_guid,
                cod_ctr=cod_ctr
            )
            result_analitico = await horus_client.get_consignment_details(
                cnpj_destino=cnpj_destino,
                cnpj_cliente=cnpj_cliente,
                id_guid=id_guid,
                cod_ctr=cod_ctr
            )
            await horus_client.close()
        except Exception as e:
            result_sintetico = str(e)
            result_analitico = "Not reached due to error in Sintetico"

        return {"params": debug_payload, "response": result_sintetico, "response_analitico": result_analitico}'''

    if "customer_portal" in filepath:
        content = content.replace(old_block_customer, new_block_customer)
    else:
        content = content.replace(old_block_master, new_block_master)
        
    open(filepath, 'w').write(content)

update_endpoint("backend/app/api/customer_portal.py")
update_endpoint("backend/app/api/horus.py")


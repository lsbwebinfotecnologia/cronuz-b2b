import os

files_to_patch = [
    "backend/app/api/customer_portal.py",
    "backend/app/api/horus.py"
]

def patch_file(filepath):
    content = open(filepath).read()
    
    # In customer_portal.py
    if "get_my_consignment_summary" in content:
        content = content.replace(
'''        result = await horus_client.get_consignment_summary(
            cnpj_destino=cnpj_destino,
            cnpj_cliente=cnpj_cliente,
            id_guid=id_guid,
            cod_ctr=cod_ctr
        )
        await horus_client.close()''',
'''        try:
            result = await horus_client.get_consignment_summary(
                cnpj_destino=cnpj_destino,
                cnpj_cliente=cnpj_cliente,
                id_guid=id_guid,
                cod_ctr=cod_ctr
            )
        except HTTPException as e:
            if e.status_code == 404:
                result = []
            else:
                raise e
        finally:
            await horus_client.close()''')
            
        content = content.replace(
'''        result = await horus_client.get_consignment_details(
            cnpj_destino=cnpj_destino,
            cnpj_cliente=cnpj_cliente,
            id_guid=id_guid,
            cod_ctr=cod_ctr
        )
        await horus_client.close()''',
'''        try:
            result = await horus_client.get_consignment_details(
                cnpj_destino=cnpj_destino,
                cnpj_cliente=cnpj_cliente,
                id_guid=id_guid,
                cod_ctr=cod_ctr
            )
        except HTTPException as e:
            if e.status_code == 404:
                result = []
            else:
                raise e
        finally:
            await horus_client.close()''')
            
    # For horus.py
    if "get_consignment_summary" in content and "def get_consignment_summary(" in content:
        content = content.replace(
'''        result = await horus_client.get_consignment_summary(
            cnpj_destino=company.document,
            cnpj_cliente=cnpj_cliente,
            id_guid=company_settings.horus_default_b2b_guid,
            cod_ctr=cod_ctr
        )
        await horus_client.close()''',
'''        try:
            result = await horus_client.get_consignment_summary(
                cnpj_destino=company.document,
                cnpj_cliente=cnpj_cliente,
                id_guid=company_settings.horus_default_b2b_guid,
                cod_ctr=cod_ctr
            )
        except HTTPException as e:
            if e.status_code == 404:
                result = []
            else:
                raise e
        finally:
            await horus_client.close()''')
            
        content = content.replace(
'''        result = await horus_client.get_consignment_details(
            cnpj_destino=company.document,
            cnpj_cliente=cnpj_cliente,
            id_guid=company_settings.horus_default_b2b_guid,
            cod_ctr=cod_ctr
        )
        await horus_client.close()''',
'''        try:
            result = await horus_client.get_consignment_details(
                cnpj_destino=company.document,
                cnpj_cliente=cnpj_cliente,
                id_guid=company_settings.horus_default_b2b_guid,
                cod_ctr=cod_ctr
            )
        except HTTPException as e:
            if e.status_code == 404:
                result = []
            else:
                raise e
        finally:
            await horus_client.close()''')

    open(filepath, 'w').write(content)

for f in files_to_patch:
    patch_file(f)

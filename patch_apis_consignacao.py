import os

# 1. Update horus_clients.py
with open("backend/app/integrators/horus_clients.py", "r") as f:
    content = f.read()

import re

# Find the start of get_consignment_summary
start_idx = content.find("async def get_consignment_summary")
if start_idx != -1:
    content = content[:start_idx] + """async def get_consignment_summary(self, cnpj_destino: str, cnpj_cliente: str, id_guid: str, cod_ctr: Optional[str] = None) -> Any:
        params = {
            "ID_GUID": id_guid,
            "CNPJ_DESTINO": cnpj_destino,
            "ID_DOC": cnpj_cliente,
            "LIMIT": 100,
            "OFFSET": 0
        }
        if cod_ctr:
            params["COD_CTR"] = cod_ctr
            
        result = await self.get("Busca_Contrato_Cliente_Sintetico", params=params)
        return result

    async def get_consignment_details(self, cnpj_destino: str, cnpj_cliente: str, id_guid: str, cod_ctr: Optional[str] = None) -> Any:
        params = {
            "ID_GUID": id_guid,
            "CNPJ_DESTINO": cnpj_destino,
            "ID_DOC": cnpj_cliente,
            "LIMIT": 500,
            "OFFSET": 0
        }
        # COD_CTR is strictly avoided in Analitico according to Horus specs
            
        result = await self.get("Busca_Contrato_Cliente_Analitico", params=params)
        return result

    async def submit_consignment(self, cnpj_destino: str, cnpj_cliente: str, id_guid: str, tipo_a_d: str, items: list, cod_ctr: Optional[str] = None) -> Any:
        params = {
            "ID_GUID": id_guid,
            "CNPJ_DESTINO": cnpj_destino,
            "ID_DOC": cnpj_cliente,
            "TIPO_A_D": tipo_a_d,
        }
        if cod_ctr:
            params["COD_CTR"] = cod_ctr
            
        result = await self.post("Conf_Contrato_ClienteB2B", params=params, json_data=items)
        return result
"""

with open("backend/app/integrators/horus_clients.py", "w") as f:
    f.write(content)

# 2. Update horus.py endpoints
with open("backend/app/api/horus.py", "r") as f:
    horus_api = f.read()

# Helper block string
setup_id_guid_horus = """        
        from app.models.customer import Customer
        customer = db.query(Customer).filter(Customer.document == cnpj_cliente, Customer.company_id == company_id).first()
        id_guid = customer.id_guid if customer and customer.id_guid else ""
        if not id_guid:
            from app.models.company_settings import CompanySettings
            settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
            id_guid = settings.horus_default_b2b_guid if settings and settings.horus_default_b2b_guid else ""
"""

# Replace in get_consignment_summary
horus_api = horus_api.replace(
    "cnpj_destino = company.document",
    "cnpj_destino = company.document" + setup_id_guid_horus
)

horus_api = horus_api.replace(
    "cnpj_destino=cnpj_destino,\n            cnpj_cliente=cnpj_cliente,\n            cod_ctr=cod_ctr",
    "cnpj_destino=cnpj_destino,\n            cnpj_cliente=cnpj_cliente,\n            id_guid=id_guid,\n            cod_ctr=cod_ctr"
)

horus_api = horus_api.replace(
    "cnpj_destino=cnpj_destino,\n            cnpj_cliente=cnpj_cliente,\n            tipo_a_d=payload.tipo_a_d",
    "cnpj_destino=cnpj_destino,\n            cnpj_cliente=cnpj_cliente,\n            id_guid=id_guid,\n            tipo_a_d=payload.tipo_a_d"
)

with open("backend/app/api/horus.py", "w") as f:
    f.write(horus_api)

# 3. Update customer_portal.py endpoints
with open("backend/app/api/customer_portal.py", "r") as f:
    portal_api = f.read()

setup_id_guid_portal = """        
        id_guid = customer.id_guid if customer.id_guid else ""
        if not id_guid:
            from app.models.company_settings import CompanySettings
            settings = db.query(CompanySettings).filter(CompanySettings.company_id == customer.company_id).first()
            id_guid = settings.horus_default_b2b_guid if settings and settings.horus_default_b2b_guid else ""
"""

portal_api = portal_api.replace(
    "cnpj_cliente = customer.document",
    "cnpj_cliente = customer.document" + setup_id_guid_portal
)

portal_api = portal_api.replace(
    "cnpj_destino=cnpj_destino,\n            cnpj_cliente=cnpj_cliente,\n            cod_ctr=cod_ctr",
    "cnpj_destino=cnpj_destino,\n            cnpj_cliente=cnpj_cliente,\n            id_guid=id_guid,\n            cod_ctr=cod_ctr"
)

portal_api = portal_api.replace(
    "cnpj_destino=cnpj_destino,\n            cnpj_cliente=cnpj_cliente,\n            tipo_a_d=payload.tipo_a_d",
    "cnpj_destino=cnpj_destino,\n            cnpj_cliente=cnpj_cliente,\n            id_guid=id_guid,\n            tipo_a_d=payload.tipo_a_d"
)

with open("backend/app/api/customer_portal.py", "w") as f:
    f.write(portal_api)

print("Patch applied")

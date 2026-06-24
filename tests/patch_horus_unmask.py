import re

filepath = "backend/app/integrators/horus_clients.py"
content = open(filepath).read()

# Make sure we unmask arguments in the key methods
# Because we only pass string masks, let's add a small helper at top
if "import re" not in content:
    content = "import re\n" + content

# For get_consignment_summary
if "def get_consignment_summary(" in content and "cnpj_destino = re.sub" not in content:
    content = content.replace(
'''    async def get_consignment_summary(self, cnpj_destino: str, cnpj_cliente: str, id_guid: str, cod_ctr: Optional[str] = None) -> Any:
        params = {''',
'''    async def get_consignment_summary(self, cnpj_destino: str, cnpj_cliente: str, id_guid: str, cod_ctr: Optional[str] = None) -> Any:
        cnpj_destino = re.sub(r'\\D', '', cnpj_destino)
        cnpj_cliente = re.sub(r'\\D', '', cnpj_cliente)
        params = {''')

# For get_consignment_details
if "def get_consignment_details(" in content and "cnpj_destino = re.sub" not in content:
    content = content.replace(
'''    async def get_consignment_details(self, cnpj_destino: str, cnpj_cliente: str, id_guid: str, cod_ctr: Optional[str] = None) -> Any:
        params = {''',
'''    async def get_consignment_details(self, cnpj_destino: str, cnpj_cliente: str, id_guid: str, cod_ctr: Optional[str] = None) -> Any:
        cnpj_destino = re.sub(r'\\D', '', cnpj_destino)
        cnpj_cliente = re.sub(r'\\D', '', cnpj_cliente)
        params = {''')

# For submit_consignment
if "def submit_consignment(" in content and "cnpj_destino = re.sub" not in content:
    content = content.replace(
'''    async def submit_consignment(self, cnpj_destino: str, cnpj_cliente: str, id_guid: str, tipo_a_d: str, items: list, cod_ctr: Optional[str] = None) -> Any:
        params = {''',
'''    async def submit_consignment(self, cnpj_destino: str, cnpj_cliente: str, id_guid: str, tipo_a_d: str, items: list, cod_ctr: Optional[str] = None) -> Any:
        cnpj_destino = re.sub(r'\\D', '', cnpj_destino)
        cnpj_cliente = re.sub(r'\\D', '', cnpj_cliente)
        params = {''')

open(filepath, 'w').write(content)

path = "backend/app/integrators/inter_client.py"
with open(path, "r") as f:
    content = f.read()

# Update init
import re
content = re.sub(
    r"def __init__\(self, client_id: str, client_secret: str, cert_path: str, key_path: str, sandbox: bool = True, account_number: str = None\):",
    r"def __init__(self, client_id: str, client_secret: str, cert_path: str, key_path: str, sandbox: bool = True, account_number: str = None, api_version: str = 'V2'):",
    content
)

content = content.replace(
    "self.account_number = account_number",
    "self.account_number = account_number\n        self.api_version = api_version"
)

# Update emit_boleto
old_emit = """    def emit_boleto(self, installment_data, customer_data):
        token = self.get_token()
        url = f"{self.base_url}/cobranca/v2/boletos"
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        if self.account_number:
            headers["x-inter-conta-corrente"] = self.account_number"""

new_emit = """    def emit_boleto(self, installment_data, customer_data):
        token = self.get_token()
        
        endpoint = "v3/cobrancas" if self.api_version == "V3" else "v2/boletos"
        url = f"{self.base_url}/cobranca/{endpoint}"
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        if self.account_number:
            headers["x-conta-corrente" if self.api_version == "V3" else "x-inter-conta-corrente"] = self.account_number"""

if old_emit in content:
    content = content.replace(old_emit, new_emit)
else:
    print("WARNING: Could not patch emit_boleto")

old_get_pdf = """    def get_boleto_pdf(self, nosso_numero: str):
        token = self.get_token()
        url = f"{self.base_url}/cobranca/v2/boletos/{nosso_numero}/pdf"
        
        headers = {
            "Authorization": f"Bearer {token}"
        }
        if self.account_number:
            headers["x-inter-conta-corrente"] = self.account_number"""

new_get_pdf = """    def get_boleto_pdf(self, nosso_numero: str):
        token = self.get_token()
        endpoint = f"v3/cobrancas/{nosso_numero}/pdf" if self.api_version == "V3" else f"v2/boletos/{nosso_numero}/pdf"
        url = f"{self.base_url}/cobranca/{endpoint}"
        
        headers = {
            "Authorization": f"Bearer {token}"
        }
        if self.account_number:
            headers["x-conta-corrente" if self.api_version == "V3" else "x-inter-conta-corrente"] = self.account_number"""

if old_get_pdf in content:
    content = content.replace(old_get_pdf, new_get_pdf)
else:
    print("WARNING: Could not patch get_boleto_pdf")
    
# Inject polling method inside class BancoInterClient
polling_method = """
    def find_nosso_numero_v3(self, seu_numero: str, timeout: int = 4) -> str:
        import time
        from datetime import datetime
        
        token = self.get_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        if self.account_number:
            headers["x-conta-corrente"] = self.account_number
            
        hoje = datetime.now().strftime("%Y-%m-%d")
        url = f"{self.base_url}/cobranca/v3/cobrancas?dataInicial={hoje}&dataFinal={hoje}"
        
        cert = (self.cert_path, self.key_path) if self.cert_path and self.key_path else None
        
        # Start Polling
        attempts = 0
        while attempts < timeout:
            time.sleep(1) # wait 1s before checking
            attempts += 1
            try:
                res = requests.get(url, headers=headers, cert=cert, verify=not self.sandbox)
                if res.status_code == 200:
                    data = res.json()
                    cobrancas = data.get("cobrancas", [])
                    # Find our cobranca
                    for c in cobrancas:
                        if c.get("seuNumero") == seu_numero:
                            situacao = c.get("situacao")
                            if situacao != "EM_PROCESSAMENTO" and c.get("nossoNumero"):
                                return c.get("nossoNumero")
                            break # Found it but still processing, re-poll
            except:
                pass
                
        return None  # Failed to get nosso_numero in time
"""

# add polling method just before the end of emit_boleto definition.. wait, append to end of file
with open(path, "w") as f:
    f.write(content + polling_method)
print("Patched inter client!")

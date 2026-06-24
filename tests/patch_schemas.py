import re

path = "backend/app/schemas/company_settings.py"
with open(path, "r") as f:
    content = f.read()

target = "efi_certificate_path: Optional[str] = None"
repl = """efi_certificate_path: Optional[str] = None
    
    inter_enabled: Optional[bool] = False
    inter_sandbox: Optional[bool] = True
    inter_client_id: Optional[str] = None
    inter_client_secret: Optional[str] = None
    inter_cert_path: Optional[str] = None
    inter_key_path: Optional[str] = None
    inter_account_number: Optional[str] = None"""

if "inter_enabled" not in content:
    content = content.replace(target, repl)
    with open(path, "w") as f:
        f.write(content)
    print("Schema updated successfully")
else:
    print("Schema already updated")

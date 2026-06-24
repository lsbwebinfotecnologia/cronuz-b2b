import re

path = "backend/app/integrators/inter_client.py"
with open(path, "r") as f:
    content = f.read()

old_pdf_v3 = """        if self.account_number:
            headers["x-conta-corrente" if self.api_version == "V3" else "x-inter-conta-corrente"] = self.account_number"""

new_pdf_v3 = """        if self.account_number:
            import re
            clean_account = re.sub(r'\\D', '', self.account_number)
            if self.api_version == "V3":
                headers["x-conta-corrente"] = clean_account.lstrip('0') or "1"
            else:
                headers["x-inter-conta-corrente"] = self.account_number"""

content = content.replace(old_pdf_v3, new_pdf_v3)

old_poll = """        if self.account_number:
            headers["x-conta-corrente"] = self.account_number"""

new_poll = """        if self.account_number:
            import re
            clean_account = re.sub(r'\\D', '', self.account_number)
            headers["x-conta-corrente"] = clean_account.lstrip('0') or "1" """

if old_poll in content:
    content = content.replace(old_poll, new_poll)
    with open(path, "w") as f:
        f.write(content)
    print("Patched headers across the file!")
else:
    print("Logic not found!")

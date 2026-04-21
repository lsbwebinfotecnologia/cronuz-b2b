import re

path = "backend/app/integrators/inter_client.py"
with open(path, "r") as f:
    content = f.read()

old_num = '"numero": customer_data.get("number", "0")[:10] or "0",'
new_num = '''"numero": (lambda n: n if n and re.match(r"^[1-9]\d*$", n) else "1")(re.sub(r"\\D", "", customer_data.get("number", "1"))),'''

if old_num in content:
    content = content.replace(old_num, new_num)
    with open(path, "w") as f:
        f.write(content)
    print(f"Patched numero logic!")
else:
    print("Numero logic not found")

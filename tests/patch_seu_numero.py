import re

paths = ["backend/app/integrators/inter_client.py", "backend/app/api/financial.py"]

for path in paths:
    with open(path, "r") as f:
        content = f.read()

    # inter_client.py payload
    if '"seuNumero": f"CRONUZ_{installment_data[\'id\']}",' in content:
        content = content.replace('"seuNumero": f"CRONUZ_{installment_data[\'id\']}",', '"seuNumero": str(installment_data[\'id\']),')
        with open(path, "w") as f:
            f.write(content)
        print(f"Patched {path}")

    # financial.py polling
    if 'seu_numero=f"CRONUZ_{inst_id}"' in content:
        content = content.replace('seu_numero=f"CRONUZ_{inst_id}"', 'seu_numero=str(inst_id)')
        with open(path, "w") as f:
            f.write(content)
        print(f"Patched {path}")
        
    if 'seu_numero=f"CRONUZ_{inst_data[\'id\']}"' in content:
        content = content.replace('seu_numero=f"CRONUZ_{inst_data[\'id\']}"', 'seu_numero=str(inst_data[\'id\'])')
        with open(path, "w") as f:
            f.write(content)
        print(f"Patched {path}")

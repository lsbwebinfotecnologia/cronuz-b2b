import os
file_path = "/Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/backend/app/api/dashboard.py"
with open(file_path, "r") as f:
    content = f.read()

import re

# We want to replace the revenue_grouped loop for orders:
old_loop = """        revenue_grouped = revenue_query.group_by(Order.status).all()
        for st, rev in revenue_grouped:
            if st == "INVOICED":
                invoiced_revenue = float(rev or 0)
            elif st in ["NEW", "PROCESSING", "SENT_TO_HORUS", "DISPATCH"]:
                pending_revenue += float(rev or 0)"""

new_loop = """        revenue_grouped = revenue_query.group_by(Order.status).all()
        for st, rev in revenue_grouped:
            st_val = str(getattr(st, 'value', st)).upper().strip()
            if st_val in ["INVOICED", "FATURADO"]:
                invoiced_revenue += float(rev or 0)
            elif st_val in ["NEW", "NOVO", "PROCESSING", "EM PROCESSAMENTO", "SENT_TO_HORUS", "DISPATCH"]:
                pending_revenue += float(rev or 0)"""

if old_loop in content:
    content = content.replace(old_loop, new_loop)
    with open(file_path, "w") as f:
        f.write(content)
    print("Replaced successfully.")
else:
    print("Old loop not found!")

import re

with open("task.md", "r") as f:
    text = f.read()
    
text = text.replace("- `[ ]` Run PostgreSQL ALTER TABLE commands for `cmp_settings` and `fin_installment`", "- `[x]` Run PostgreSQL ALTER TABLE commands for `cmp_settings` and `fin_installment`")
text = text.replace("- `[ ]` Update SQLAlchemy models `company_settings.py` and `financial.py`", "- `[x]` Update SQLAlchemy models `company_settings.py` and `financial.py`")
text = text.replace("- `[ ]` Update Pydantic schemas in `schemas/company_settings.py`", "- `[x]` Update Pydantic schemas in `schemas/company_settings.py`")
text = text.replace("- `[ ]` Create `backend/app/integrators/inter_clients.py` with stubbed methods", "- `[x]` Create `backend/app/integrators/inter_clients.py` with stubbed methods")

with open("task.md", "w") as f:
    f.write(text)

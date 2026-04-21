import re

def fix_file(filepath):
    content = open(filepath).read()
    imports = """from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.integrators.horus_clients import HorusClients
from typing import Optional
"""
    if "customer_portal.py" in filepath:
        imports += "from app.api.auth import get_current_customer\nfrom app.models.customer import Customer\n"
    else:
        imports += "from app.core.dependencies import get_current_user\n"
        
    content = content.replace("from fastapi import APIRouter", imports)
    open(filepath, 'w').write(content)

fix_file("backend/app/api/horus.py")
fix_file("backend/app/api/customer_portal.py")

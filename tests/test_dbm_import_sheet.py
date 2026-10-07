import sys
import os
backend_path = os.path.join(os.path.dirname(__file__), '..', 'backend')
sys.path.insert(0, backend_path)

import io
import uuid
from datetime import datetime, timezone, timedelta
import openpyxl
import requests
import main
from app.db.session import SessionLocal
from app.models.user import User
from app.models.user_session import UserSession
from app.core.security import create_access_token

def test_sheet_import():
    db = SessionLocal()
    user = db.query(User).filter(User.type == "MASTER").first()
    if not user:
        user = db.query(User).first()
    
    jti = str(uuid.uuid4())
    now_utc = datetime.now(timezone.utc)
    new_session = UserSession(
        user_id=user.id,
        role=user.type or "MASTER",
        jti=jti,
        ip_address="127.0.0.1",
        user_agent="pytest-test",
        login_at=now_utc,
        last_activity_at=now_utc,
        expires_at=now_utc + timedelta(hours=1),
        is_active=True
    )
    db.add(new_session)
    db.commit()

    token = create_access_token(
        data={"sub": user.email, "type": user.type, "tenant_id": user.tenant_id, "company_id": user.company_id, "jti": jti}
    )
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Test template download
    res_tpl = requests.get("http://localhost:8000/dbm/companies/import/template", headers=headers)
    print(f"GET /companies/import/template -> Status: {res_tpl.status_code}, Length: {len(res_tpl.content)} bytes")
    assert res_tpl.status_code == 200

    # 2. Generate a test Excel in memory with client 11740 (EO Editora)
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["codigo_horus", "apelido", "grupo", "segmento", "obs da empresa", "detalhes fechamento roy", "account"])
    ws.append([11740, "EO Editora Planilha", "Grupo Teste DBM", "Editoras", "Obs de teste planilha", "Banco Teste Roy", "ACC-999"])
    out = io.BytesIO()
    wb.save(out)
    out.seek(0)

    # 3. Test parse endpoint
    files = {"file": ("test_import.xlsx", out, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    data = {"company_id": "4"}
    res_parse = requests.post("http://localhost:8000/dbm/companies/import/parse", files=files, data=data, headers=headers)
    print(f"POST /companies/import/parse -> Status: {res_parse.status_code}")
    print("Parse response:", res_parse.text)
    assert res_parse.status_code == 200
    parse_data = res_parse.json()
    assert parse_data["total_rows"] == 1
    items = parse_data["rows"]

    # 4. Test process-batch endpoint
    batch_payload = {
        "company_id": 4,
        "seller_company_id": 4,
        "items": items
    }
    res_batch = requests.post("http://localhost:8000/dbm/companies/import/process-batch", json=batch_payload, headers=headers)
    print(f"POST /companies/import/process-batch -> Status: {res_batch.status_code}")
    print("Batch response:", res_batch.text)
    assert res_batch.status_code == 200
    batch_data = res_batch.json()
    print("Result items:", batch_data.get("results"))
    print("Test finished successfully!")

if __name__ == "__main__":
    test_sheet_import()

import sys
import os
import io
import openpyxl
from datetime import datetime, timezone

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from fastapi.testclient import TestClient
from main import app
from app.db.session import SessionLocal
from app.models.company import Company
from app.models.user import User, UserRole
from app.models.seller_branch import SellerBranch
from app.models.product_address import ProductAddress
from app.core import security

client = TestClient(app)


def run_addressing_tests():
    db = SessionLocal()
    try:
        # 1. Obter ou criar empresa e filial de teste
        company = db.query(Company).filter(Company.document == "00000000000199").first()
        if not company:
            company = Company(
                name="Empresa Teste Enderecamento",
                document="00000000000199",
                domain="teste-addr.cronuz.com.br",
                module_horus_erp=True,
            )
            db.add(company)
            db.commit()
            db.refresh(company)

        user = db.query(User).filter(User.email == "seller_addr_test@teste.com").first()
        if not user:
            user = User(
                name="Operador Enderecamento",
                email="seller_addr_test@teste.com",
                type=UserRole.SELLER,
                password_hash=security.get_password_hash("123456"),
                company_id=company.id,
            )
            db.add(user)
            db.commit()
            db.refresh(user)

        branch = db.query(SellerBranch).filter(
            SellerBranch.company_id == company.id,
            SellerBranch.cod_filial == "001"
        ).first()
        if not branch:
            branch = SellerBranch(
                company_id=company.id,
                nome="Filial Matriz Teste",
                cod_empresa="1",
                cod_filial="001",
                cod_local_estoque=["001", "002"],
                active=True
            )
            db.add(branch)
        import uuid
        from datetime import timedelta
        from app.models.user_session import UserSession

        jti = str(uuid.uuid4())
        now_utc = datetime.now(timezone.utc)
        session_log = UserSession(
            user_id=user.id,
            role=user.type.value,
            jti=jti,
            ip_address="127.0.0.1",
            user_agent="TestClient",
            login_at=now_utc,
            last_activity_at=now_utc,
            expires_at=now_utc + timedelta(days=1),
            is_active=True,
        )
        db.add(session_log)
        db.commit()

        token = security.create_access_token({
            "sub": user.email,
            "role": user.type.value,
            "company_id": user.company_id,
            "jti": jti,
        })
        headers = {"Authorization": f"Bearer {token}"}

        print("--- 1. Teste de Criação Manual de Endereço (POST /addressing) ---")
        test_isbn = "9786555640123"
        resp = client.post(
            "/addressing",
            json={
                "branch_id": branch.id,
                "cod_local_estoque": "001",
                "isbn": test_isbn,
                "horus_cod_item": "55001",
                "title": "Livro de Teste Enderecamento",
                "address": "RUA-A-PRAT-01",
                "notes": "Prateleira do meio"
            },
            headers=headers
        )
        assert resp.status_code == 200, f"Falha ao criar endereço: {resp.text}"
        data = resp.json()
        assert data.get("created") is True
        addr_id_1 = data.get("id")

        print("--- 2. Teste de Multi-endereçamento (Mesmo ISBN em outro endereço) ---")
        resp2 = client.post(
            "/addressing",
            json={
                "branch_id": branch.id,
                "cod_local_estoque": "001",
                "isbn": test_isbn,
                "horus_cod_item": "55001",
                "title": "Livro de Teste Enderecamento",
                "address": "ESTOQUE-B-05",
                "notes": "Estoque extra fundo"
            },
            headers=headers
        )
        assert resp2.status_code == 200
        addr_id_2 = resp2.json().get("id")
        assert addr_id_1 != addr_id_2, "Multi-endereçamento deve gerar IDs distintos para endereços diferentes"

        print("--- 3. Teste de Consulta por Produto (GET /addressing/by-product) ---")
        resp_by_prod = client.get(f"/addressing/by-product?isbn={test_isbn}", headers=headers)
        assert resp_by_prod.status_code == 200
        prod_data = resp_by_prod.json()
        assert prod_data.get("total") >= 2
        addresses_found = [a["address"] for a in prod_data["addresses"]]
        assert "RUA-A-PRAT-01" in addresses_found
        assert "ESTOQUE-B-05" in addresses_found

        print("--- 4. Teste de Listagem e Busca (GET /addressing) ---")
        resp_list = client.get(f"/addressing?search={test_isbn}", headers=headers)
        assert resp_list.status_code == 200
        list_data = resp_list.json()
        assert list_data["total"] >= 2

        print("--- 5. Teste de Sincronização em Lote Mobile (POST /addressing/sync-batch) ---")
        sync_payload = {
            "items": [
                {
                    "branch_id": branch.id,
                    "cod_local_estoque": "001",
                    "isbn": "9788535914849",
                    "title": "1984 - George Orwell",
                    "address": "CORREDOR-C-3",
                    "notes": "Bipado no coletor offline"
                },
                {
                    "branch_id": branch.id,
                    "cod_local_estoque": "001",
                    "isbn": "9788535914849",
                    "title": "1984 - George Orwell",
                    "address": "VITRINE-ENTRADA",
                    "notes": "Exemplar de mostruário"
                }
            ],
            "mode": "append"
        }
        resp_sync = client.post("/addressing/sync-batch", json=sync_payload, headers=headers)
        assert resp_sync.status_code == 200
        sync_res = resp_sync.json()
        assert sync_res["total_received"] == 2
        assert sync_res["inserted_count"] >= 1

        print("--- 6. Teste de Template Excel (GET /addressing/template) ---")
        resp_tpl = client.get("/addressing/template", headers=headers)
        assert resp_tpl.status_code == 200
        assert resp_tpl.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

        print("--- 7. Teste de Upload de Planilha (.xlsx) ---")
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["ISBN", "ENDERECO", "TITULO", "COD_LOCAL_ESTOQUE"])
        ws.append(["9788533615540", "SALA-ARQUIVO-01", "O Senhor dos Anéis", "001"])
        ws.append(["9788533615540", "PRAT-LIVROS-TOP", "O Senhor dos Anéis", "001"])
        
        stream = io.BytesIO()
        wb.save(stream)
        stream.seek(0)

        upload_files = {
            "file": ("planilha_teste.xlsx", stream.read(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        }
        upload_data = {
            "branch_id": str(branch.id),
            "cod_local_estoque": "001",
            "mode": "append"
        }
        resp_up = client.post("/addressing/upload", files=upload_files, data=upload_data, headers=headers)
        assert resp_up.status_code == 200, f"Upload falhou: {resp_up.text}"
        summary = resp_up.json()
        assert summary["inserted"] >= 1

        print("--- 8. Teste de Exclusão Individual e em Lote (DELETE) ---")
        del_single = client.delete(f"/addressing/{addr_id_1}", headers=headers)
        assert del_single.status_code == 200

        del_batch = client.request("DELETE", "/addressing/batch/delete", json=[addr_id_2], headers=headers)
        assert del_batch.status_code == 200

        print("TODOS OS TESTES DE ENDEREÇAMENTO PASSARAM COM SUCESSO!")
    finally:
        db.close()


if __name__ == "__main__":
    run_addressing_tests()

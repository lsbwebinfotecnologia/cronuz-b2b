import sys
import os
from datetime import datetime, timezone
import io

# Setup path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from fastapi.testclient import TestClient
from main import app
from app.db.session import SessionLocal
from app.models.company import Company
from app.models.user import User, UserRole
from app.models.inventory import Inventory, InventorySession, InventoryScan, InventoryItem
from app.core import security

client = TestClient(app)

def run_tests():
    db = SessionLocal()
    try:
        # 1. Garantir empresa de teste com has_inventory_module = True
        company = db.query(Company).filter(Company.document == "00000000000199").first()
        if not company:
            company = Company(
                name="Empresa Teste Inventário",
                document="00000000000199",
                domain="teste-inv.cronuz.com.br",
                has_inventory_module=True,
                active=True
            )
            db.add(company)
            db.commit()
            db.refresh(company)
        else:
            company.has_inventory_module = True
            db.commit()

        # 2. Usuários de teste (Operador 1 e Operador 2)
        u1 = db.query(User).filter(User.email == "op1@teste.com").first()
        if not u1:
            u1 = User(
                name="Contador 1",
                email="op1@teste.com",
                type=UserRole.SELLER,
                password_hash=security.get_password_hash("123456"),
                company_id=company.id
            )
            db.add(u1)
            db.commit()
            db.refresh(u1)

        u2 = db.query(User).filter(User.email == "op2@teste.com").first()
        if not u2:
            u2 = User(
                name="Contador 2",
                email="op2@teste.com",
                type=UserRole.SELLER,
                password_hash=security.get_password_hash("123456"),
                company_id=company.id
            )
            db.add(u2)
            db.commit()
            db.refresh(u2)

        import uuid
        from datetime import timedelta
        from app.models.user_session import UserSession

        exp = datetime.now(timezone.utc) + timedelta(days=7)
        jti1 = str(uuid.uuid4())
        sess1_db = UserSession(user_id=u1.id, role=u1.type.value if hasattr(u1.type, "value") else str(u1.type), jti=jti1, expires_at=exp, is_active=True)
        db.add(sess1_db)
        
        jti2 = str(uuid.uuid4())
        sess2_db = UserSession(user_id=u2.id, role=u2.type.value if hasattr(u2.type, "value") else str(u2.type), jti=jti2, expires_at=exp, is_active=True)
        db.add(sess2_db)
        db.commit()

        token1 = security.create_access_token(data={"sub": u1.email, "company_id": company.id, "type": "SELLER", "id": u1.id, "jti": jti1})
        headers1 = {"Authorization": f"Bearer {token1}"}

        token2 = security.create_access_token(data={"sub": u2.email, "company_id": company.id, "type": "SELLER", "id": u2.id, "jti": jti2})
        headers2 = {"Authorization": f"Bearer {token2}"}

        print("[TEST 1] Criar novo Inventário...")
        res = client.post(f"/companies/{company.id}/inventory", json={"name": "Inventário Teste 01", "description": "Teste automatizado"}, headers=headers1)
        assert res.status_code == 200, f"Falha ao criar inventário: {res.text}"
        inv_data = res.json()
        inv_id = inv_data["id"]
        print(f" -> Inventário criado: ID {inv_id}, Código {inv_data['code']}")

        print("[TEST 2] Upload de CSV de produtos...")
        # 2a. Teste de rejeição de ISBN duplicado na mesma planilha
        csv_duplicado = (
            "ISBN;Titulo;Editora;Categoria;Endereco\n"
            "9788535914849;Livro 1984;Companhia das Letras;Ficção;Prateleira A-01\n"
            "9788535914849;Livro 1984 Duplicado;Companhia das Letras;Ficção;Prateleira A-01\n"
        )
        files_dupl = {"file": ("duplicado.csv", io.BytesIO(csv_duplicado.encode("utf-8")), "text/csv")}
        res_fail = client.post(f"/companies/{company.id}/inventory/{inv_id}/upload-sheet", files=files_dupl, headers=headers1)
        assert res_fail.status_code == 400, f"Deveria ter rejeitado planilha com ISBN duplicado: {res_fail.text}"
        assert "duplicado" in res_fail.text.lower()
        print(f" -> Bloqueio de ISBN duplicado na planilha validado com sucesso: {res_fail.json()['detail']}")

        # 2b. Upload válido sem duplicatas
        csv_content = (
            "ISBN;Titulo;Editora;Categoria;Endereco\n"
            "9788535914849;Livro 1984;Companhia das Letras;Ficção;Prateleira A-01\n"
            "9788576572008;Duna;Aleph;Ficção;Prateleira A-02\n"
            "9788595081512;O Hobbit;HarperCollins;Fantasia;Prateleira B-01\n"
        )
        files = {"file": ("carga.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
        res_upload = client.post(f"/companies/{company.id}/inventory/{inv_id}/upload-sheet", files=files, headers=headers1)
        assert res_upload.status_code == 200, f"Falha no upload: {res_upload.text}"
        print(f" -> Upload concluído: {res_upload.json()}")

        # 2c. Teste de rejeição de ISBN que já existe no inventário
        files_ja_existe = {"file": ("ja_existe.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
        res_fail_exist = client.post(f"/companies/{company.id}/inventory/{inv_id}/upload-sheet", files=files_ja_existe, headers=headers1)
        assert res_fail_exist.status_code == 400, f"Deveria rejeitar ISBNs já cadastrados: {res_fail_exist.text}"
        print(f" -> Rejeição de ISBN já existente no inventário validada: {res_fail_exist.json()['detail']}")

        print("[TEST 3] Buscar Catálogo Leve (Offline-First cache)...")
        res_cache = client.get(f"/companies/{company.id}/inventory/{inv_id}/catalog-cache", headers=headers1)
        assert res_cache.status_code == 200
        catalog = res_cache.json()
        assert len(catalog) == 3
        print(f" -> Catálogo cache recebido com {len(catalog)} itens.")

        print("[TEST 4] Checar Localização 'PRATELEIRA A-01' antes de contar...")
        res_loc = client.get(f"/companies/{company.id}/inventory/{inv_id}/sessions/check-location?location=PRATELEIRA%20A-01", headers=headers1)
        assert res_loc.status_code == 200
        assert res_loc.json()["exists"] == False
        print(" -> Localização confirmada como livre.")

        print("[TEST 5] Abrir Sessão do Contador 1 na 'PRATELEIRA A-01'...")
        res_sess1 = client.post(f"/companies/{company.id}/inventory/{inv_id}/sessions", json={"location": "PRATELEIRA A-01"}, headers=headers1)
        assert res_sess1.status_code == 200
        s1 = res_sess1.json()
        s1_id = s1["id"]
        assert s1["session_type"] == "CONTAGEM"
        assert s1["round_number"] == 1
        print(f" -> Sessão 1 aberta: ID {s1_id}, tipo {s1['session_type']}")

        print("[TEST 6] Bipar itens na Sessão 1 (com idempotência de client_uuid)...")
        now_iso = datetime.now(timezone.utc).isoformat()
        scans_batch = [
            {"client_uuid": "uuid-1", "isbn": "9788535914849", "location": "PRATELEIRA A-01", "quantity": 1, "scanned_at": now_iso},
            {"client_uuid": "uuid-2", "isbn": "9788535914849", "location": "PRATELEIRA A-01", "quantity": 1, "scanned_at": now_iso},
            {"client_uuid": "uuid-3", "isbn": "9788576572008", "location": "PRATELEIRA A-01", "quantity": 1, "scanned_at": now_iso},
            {"client_uuid": "uuid-4", "isbn": "7891234567890", "location": "PRATELEIRA A-01", "quantity": 1, "scanned_at": now_iso}, # Item novo fora da base
        ]
        res_scan1 = client.post(f"/companies/{company.id}/inventory/{inv_id}/sessions/{s1_id}/scans/batch", json={"scans": scans_batch}, headers=headers1)
        assert res_scan1.status_code == 200
        assert res_scan1.json()["synced_count"] == 4
        print(f" -> Bips gravados: {res_scan1.json()}")

        # Repetir o mesmo lote para validar idempotência
        res_scan_dupl = client.post(f"/companies/{company.id}/inventory/{inv_id}/sessions/{s1_id}/scans/batch", json={"scans": scans_batch}, headers=headers1)
        assert res_scan_dupl.status_code == 200
        assert res_scan_dupl.json()["synced_count"] == 0
        assert res_scan_dupl.json()["ignored_duplicate_count"] == 4
        print(" -> Idempotência comprovada: bips duplicados ignorados com sucesso!")

        print("[TEST 7] Fechar Sessão 1 do Contador 1...")
        res_close1 = client.put(f"/companies/{company.id}/inventory/{inv_id}/sessions/{s1_id}/close", headers=headers1)
        assert res_close1.status_code == 200
        assert res_close1.json()["status"] == "CONCLUIDA"
        print(" -> Sessão 1 fechada com sucesso.")

        # Tentar bipar na sessão fechada deve ser recusado
        res_rejected = client.post(f"/companies/{company.id}/inventory/{inv_id}/sessions/{s1_id}/scans/batch", json={"scans": scans_batch}, headers=headers1)
        assert res_rejected.status_code == 409
        print(" -> Bloqueio de bips em sessão fechada verificado (HTTP 409).")

        print("[TEST 8] Contador 2 abre Recontagem/Auditoria na mesma 'PRATELEIRA A-01'...")
        res_check2 = client.get(f"/companies/{company.id}/inventory/{inv_id}/sessions/check-location?location=PRATELEIRA%20A-01", headers=headers2)
        assert res_check2.json()["exists"] == True
        print(f" -> Sistema avisou que já existe contagem prévia por: {res_check2.json()['last_operator_name']}")

        res_sess2 = client.post(f"/companies/{company.id}/inventory/{inv_id}/sessions", json={"location": "PRATELEIRA A-01", "is_audit": True}, headers=headers2)
        assert res_sess2.status_code == 200
        s2 = res_sess2.json()
        s2_id = s2["id"]
        assert s2["session_type"] == "RECONTAGEM_AUDITORIA"
        assert s2["round_number"] == 2
        print(f" -> Sessão 2 aberta como auditoria: ID {s2_id}, round {s2['round_number']}")

        # Contador 2 bipa apenas 1 unidade de 9788535914849 (gerando divergência intencional)
        scans_c2 = [
            {"client_uuid": "uuid-c2-1", "isbn": "9788535914849", "location": "PRATELEIRA A-01", "quantity": 1, "scanned_at": now_iso}
        ]
        client.post(f"/companies/{company.id}/inventory/{inv_id}/sessions/{s2_id}/scans/batch", json={"scans": scans_c2}, headers=headers2)
        client.put(f"/companies/{company.id}/inventory/{inv_id}/sessions/{s2_id}/close", headers=headers2)

        print("[TEST 9] Verificar relatório de Divergências (1ª Contagem vs 2ª Contagem)...")
        res_div = client.get(f"/companies/{company.id}/inventory/{inv_id}/discrepancies", headers=headers1)
        assert res_div.status_code == 200
        div_list = res_div.json()
        item_divergente = next((d for d in div_list if d["isbn"] == "9788535914849"), None)
        assert item_divergente is not None
        assert item_divergente["count_1_qty"] == 2
        assert item_divergente["count_2_qty"] == 1
        assert item_divergente["difference"] == 1
        assert item_divergente["has_divergence"] == True
        print(f" -> Divergência detectada com precisão: C1={item_divergente['count_1_qty']}, C2={item_divergente['count_2_qty']}, Diff={item_divergente['difference']}")

        print("[TEST 10] Fluxo Público Mobile (Sem Login) via Token de Acesso...")
        access_token = inv_data["access_token"]
        assert access_token, "Inventário deve possuir access_token"

        # 10a. Consultar info pública sem header de autenticação
        res_pub_info = client.get(f"/inventory/public/{access_token}")
        assert res_pub_info.status_code == 200
        pub_info = res_pub_info.json()
        assert pub_info["code"] == inv_data["code"]
        print(f" -> Info pública obtida com sucesso: {pub_info['name']}")

        # 10b. Obter catálogo cache sem autenticação (3 cadastrados + 1 avulso detectado no scan)
        res_pub_cat = client.get(f"/inventory/public/{access_token}/catalog-cache")
        assert res_pub_cat.status_code == 200
        assert len(res_pub_cat.json()) == 4
        print(f" -> Catálogo público obtido com sucesso: {len(res_pub_cat.json())} itens (incluindo avulso)")

        # 10c. Abrir sessão pública de operador (informando apenas nome e prateleira)
        res_pub_sess = client.post(
            f"/inventory/public/{access_token}/sessions",
            json={"location": "PRATELEIRA C-01", "operator_name": "João da Silva (Operador Móvel)"}
        )
        assert res_pub_sess.status_code == 200
        pub_s = res_pub_sess.json()
        pub_s_id = pub_s["id"]
        assert pub_s["operator_name"] == "João da Silva (Operador Móvel)"
        print(f" -> Sessão pública aberta com sucesso: ID {pub_s_id}, Operador: {pub_s['operator_name']}")

        # 10d. Bipar produtos na sessão pública
        pub_scans = [
            {"client_uuid": "uuid-pub-1", "isbn": "9788595081512", "location": "PRATELEIRA C-01", "quantity": 1, "scanned_at": now_iso, "operator_name": "João da Silva (Operador Móvel)"},
            {"client_uuid": "uuid-pub-2", "isbn": "9788595081512", "location": "PRATELEIRA C-01", "quantity": 1, "scanned_at": now_iso, "operator_name": "João da Silva (Operador Móvel)"}
        ]
        res_pub_scan = client.post(f"/inventory/public/{access_token}/sessions/{pub_s_id}/scans/batch", json={"scans": pub_scans})
        assert res_pub_scan.status_code == 200
        assert res_pub_scan.json()["synced_count"] == 2
        print(" -> Bipagem pública sincronizada com sucesso!")

        # 10e. Fechar sessão pública
        res_pub_close = client.put(f"/inventory/public/{access_token}/sessions/{pub_s_id}/close")
        assert res_pub_close.status_code == 200
        assert res_pub_close.json()["status"] == "CONCLUIDA"
        print(" -> Sessão pública fechada com sucesso!")

        # 10f. Regenerar Token pelo gestor
        res_regen = client.post(f"/companies/{company.id}/inventory/{inv_id}/regenerate-token", headers=headers1)
        assert res_regen.status_code == 200
        new_token = res_regen.json()["access_token"]
        assert new_token != access_token
        # Token antigo deve falhar agora
        assert client.get(f"/inventory/public/{access_token}").status_code == 404
        # Token novo funciona
        assert client.get(f"/inventory/public/{new_token}").status_code == 200
        print(f" -> Regeneração de token validada! Novo token ativo: {new_token[:8]}...")

        print("[TEST 11] Exportar Relatório Consolidado em Excel (.xlsx)...")
        res_excel = client.get(f"/companies/{company.id}/inventory/{inv_id}/export-excel", headers=headers1)
        assert res_excel.status_code == 200
        assert "application/vnd.openxmlformats-officedocument" in res_excel.headers["content-type"]
        assert len(res_excel.content) > 1000
        print(f" -> Arquivo Excel gerado com sucesso ({len(res_excel.content)} bytes).")

        print("[TEST 12] Finalização Geral do Inventário pelo Gestor...")
        res_fin = client.put(f"/companies/{company.id}/inventory/{inv_id}/finalize", headers=headers1)
        assert res_fin.status_code == 200
        assert res_fin.json()["status"] == "FINALIZADO"
        print(" -> Inventário finalizado.")

        # Tentar abrir nova sessão deve ser bloqueado
        res_lock = client.post(f"/companies/{company.id}/inventory/{inv_id}/sessions", json={"location": "PRATELEIRA B"}, headers=headers1)
        assert res_lock.status_code == 423
        print(" -> Trava absoluta confirmada (HTTP 423 Locked).")

        print("\n✅ TODOS OS 11 TESTES DO MÓDULO DE INVENTÁRIO PASSARAM COM SUCESSO!\n")
    finally:
        db.close()

if __name__ == "__main__":
    run_tests()

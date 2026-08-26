import io
import zipfile
import sys
import uuid
from pathlib import Path
from datetime import datetime, timedelta

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from fastapi.testclient import TestClient
from main import app
from app.db.session import SessionLocal
from app.models.user import User, UserRole
from app.models.user_session import UserSession
from app.models.hosted_site import HostedSite
from app.core.security import create_access_token

client = TestClient(app)

def test_hosted_sites_lifecycle():
    db = SessionLocal()
    master_user = db.query(User).filter(User.type == UserRole.MASTER).first()
    if not master_user:
        master_user = db.query(User).first()
    
    assert master_user is not None, "Nenhum usuário encontrado no banco de dados."

    # Cria sessão válida com JTI e role
    jti = uuid.uuid4().hex
    user_role_str = master_user.type.value if hasattr(master_user.type, 'value') else str(master_user.type)
    user_session = UserSession(
        user_id=master_user.id,
        role=user_role_str,
        jti=jti,
        is_active=True,
        expires_at=datetime.utcnow() + timedelta(days=1)
    )
    db.add(user_session)
    db.commit()

    token = create_access_token(
        data={"sub": master_user.email, "company_id": master_user.company_id, "jti": jti}
    )
    headers = {"Authorization": f"Bearer {token}"}

    test_slug = "test-site-automacao"

    # Limpa caso já exista
    existing = db.query(HostedSite).filter(HostedSite.slug == test_slug).first()
    if existing:
        db.delete(existing)
        db.commit()

    # 2. Criar novo site
    create_res = client.post(
        "/hosted-sites",
        json={
            "title": "Site Teste Automação",
            "slug": test_slug,
            "description": "Site para validação do extrator estático"
        },
        headers=headers
    )
    assert create_res.status_code == 201, create_res.text
    site_data = create_res.json()
    site_id = site_data["id"]
    assert site_data["slug"] == test_slug
    assert site_data["status"] == "pending_upload"
    assert "test-site-automacao.site.cronuzb2b.com.br" in site_data["public_url"]

    # 3. Criar arquivo ZIP em memória com index.html e css
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("index.html", "<!DOCTYPE html><html><body><h1>Site Teste Cronuz</h1></body></html>")
        zf.writestr("assets/style.css", "body { background: #f0f0f0; }")
    zip_buffer.seek(0)

    # 4. Fazer upload do ZIP
    upload_res = client.post(
        f"/hosted-sites/{site_id}/upload-zip",
        files={"file": ("site.zip", zip_buffer, "application/zip")},
        headers=headers
    )
    assert upload_res.status_code == 200, upload_res.text
    assert upload_res.json()["status"] == "pending_extract"

    # 5. Extrair e Publicar
    extract_res = client.post(
        f"/hosted-sites/{site_id}/extract",
        headers=headers
    )
    assert extract_res.status_code == 200, extract_res.text
    extracted_data = extract_res.json()
    assert extracted_data["status"] == "ready"
    assert extracted_data["has_index"] is True
    assert extracted_data["files_count"] == 2

    # 6. Testar Preview do site extraído
    preview_res = client.get(f"/hosted-sites/preview/{test_slug}/index.html")
    assert preview_res.status_code == 200
    assert "<h1>Site Teste Cronuz</h1>" in preview_res.text

    # 7. Testar Detalhes e Árvore de Arquivos
    detail_res = client.get(f"/hosted-sites/{site_id}", headers=headers)
    assert detail_res.status_code == 200
    assert len(detail_res.json()["files"]) >= 1

    # 8. Excluir site
    del_res = client.delete(f"/hosted-sites/{site_id}", headers=headers)
    assert del_res.status_code == 204

    # Limpa sessão de teste
    db.delete(user_session)
    db.commit()
    db.close()

    print("\n=======================================================")
    print("TODOS OS TESTES DO MÓDULO HOSTED SITES PASSARAM COM SUCESSO!")
    print("=======================================================\n")

if __name__ == "__main__":
    test_hosted_sites_lifecycle()

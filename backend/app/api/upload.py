from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
import os
import shutil
import uuid
from pathlib import Path

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/upload", tags=["upload"])

# Directory to store uploaded covers/images
# This saves the files internally to be served by FastAPI's StaticFiles under /uploads
UPLOADS_DIR = Path(__file__).parent.parent.parent / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

STATIC_DIR = UPLOADS_DIR / "covers"
STATIC_DIR.mkdir(parents=True, exist_ok=True)

@router.post("/cover")
async def upload_cover(
    file: UploadFile = File(...),
    isbn: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="Usuário sem empresa vinculada.")
        
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="O arquivo de envio deve ser uma imagem.")

    MAX_FILE_SIZE = 4 * 1024 * 1024 # 4MB
    if file.size and file.size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="O arquivo excede o limite de 4MB.")

    company_dir = STATIC_DIR / str(current_user.company_id)
    company_dir.mkdir(parents=True, exist_ok=True)
    
    # Force extension to .jpg as per requirements
    file_path = company_dir / f"{isbn}.jpg"
    
    try:
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar arquivo: {str(e)}")
        
    # Return the relative URL string that can be used on frontend
    # Since we are saving inside `frontend/public/uploads`, the URL is `/uploads/...`
    relative_url = f"/uploads/covers/{current_user.company_id}/{isbn}.jpg"
    
    return {"message": "Imagem de capa salva com sucesso.", "url": relative_url}

from typing import Optional

@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    company_id: Optional[int] = Form(None),
    current_user: User = Depends(get_current_user)
):
    """
    Endpoint de uso geral para upload de imagens diversas (ex: Hotsite, Banners, Backgrounds de Login).
    Opcional usar em conjunto com UUID para previnir conflitos.
    """
    target_company_id = company_id or current_user.company_id
    
    if not target_company_id:
        raise HTTPException(status_code=400, detail="Empresa não informada ou Usuário sem empresa vinculada.")
        
    from app.models.user import UserRole
    if current_user.type != UserRole.MASTER and target_company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Acesso restrito. Você só pode enviar arquivos para a sua própria empresa.")
        
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="O arquivo de envio deve ser uma imagem.")

    MAX_FILE_SIZE = 10 * 1024 * 1024 # 10MB
    if file.size and file.size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="O arquivo excede o limite de 10MB.")

    # Diretorio para imagens gerais
    images_dir = UPLOADS_DIR / "images" / str(target_company_id)
    images_dir.mkdir(parents=True, exist_ok=True)
    
    # Manter a extensao original com base no content type ou nome do file
    extension = Path(file.filename).suffix if file.filename else ".jpg"
    unique_filename = f"{uuid.uuid4().hex}{extension}"
    
    file_path = images_dir / unique_filename
    
    try:
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar o arquivo: {str(e)}")
        
    relative_url = f"/uploads/images/{target_company_id}/{unique_filename}"
    
    return {"message": "Imagem enviada com sucesso.", "url": relative_url}

@router.post("/certificate")
async def upload_certificate(
    file: UploadFile = File(...),
    company_id: int = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Endpoint para envio do certificado .p12 ou .pem da Efí.
    Salva fora da pasta pública para maior segurança.
    """
    from app.models.user import UserRole
    if current_user.type != UserRole.SELLER or current_user.company_id != company_id:
        raise HTTPException(status_code=403, detail="Acesso restrito.")
        
    if not file.filename.endswith(".p12") and not file.filename.endswith(".pem"):
        raise HTTPException(status_code=400, detail="O arquivo deve ser .p12 ou .pem")

    certs_dir = Path(__file__).parent.parent.parent.parent / "certs" / str(company_id)
    certs_dir.mkdir(parents=True, exist_ok=True)
    
    unique_filename = f"efi_cert_{uuid.uuid4().hex}{Path(file.filename).suffix}"
    file_path = certs_dir / unique_filename
    
    try:
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar o certificado: {str(e)}")
        
    from app.models.company_settings import CompanySettings
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not settings:
        settings = CompanySettings(company_id=company_id)
        db.add(settings)
    
    settings.efi_certificate_path = str(file_path.absolute())
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Erro ao salvar no banco.")
        
    return {"message": "Certificado enviado e configurado com sucesso.", "path": settings.efi_certificate_path}

@router.post("/nfse-certificate")
async def upload_nfse_certificate(
    file: UploadFile = File(...),
    company_id: int = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Endpoint para envio do certificado A1 (.pfx) da NFS-e Nacional.
    Salva isolado na pasta de certificados da aplicação backend.
    """
    from app.models.user import UserRole
    if current_user.type != UserRole.MASTER and current_user.company_id != company_id:
        raise HTTPException(status_code=403, detail="Acesso restrito.")
        
    if not file.filename.lower().endswith(".pfx") and not file.filename.lower().endswith(".p12"):
        raise HTTPException(status_code=400, detail="O certificado digital deve ser no formato .pfx arquivado.")

    certs_dir = Path(__file__).parent.parent.parent.parent / "certs" / "nfse" / str(company_id)
    certs_dir.mkdir(parents=True, exist_ok=True)
    
    unique_filename = f"nfse_cert_{uuid.uuid4().hex}{Path(file.filename).suffix}"
    file_path = certs_dir / unique_filename
    
    try:
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar o certificado: {str(e)}")
        
    from app.models.company import Company
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não localizada.")
    
    company.cert_path = str(file_path.absolute())
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Erro ao salvar no banco.")
        
    return {"message": "Certificado digital enviado e atrelado com sucesso ao emissor.", "path": company.cert_path}


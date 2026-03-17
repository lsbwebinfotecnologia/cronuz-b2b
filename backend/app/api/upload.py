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

# Directory to store uploaded covers/images (pointing to the Next.js public directory)
# This assumes backend and frontend are siblings in the project root
FRONTEND_PUBLIC_DIR = Path(__file__).parent.parent.parent.parent / "frontend" / "public" / "uploads"
FRONTEND_PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

STATIC_DIR = FRONTEND_PUBLIC_DIR / "covers"
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

@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """
    Endpoint de uso geral para upload de imagens diversas (ex: Hotsite, Banners).
    Opcional usar em conjunto com UUID para previnir conflitos.
    """
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="Usuário sem empresa vinculada.")
        
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="O arquivo de envio deve ser uma imagem.")

    # Diretorio para imagens gerais
    images_dir = FRONTEND_PUBLIC_DIR / "images" / str(current_user.company_id)
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
        
    relative_url = f"/uploads/images/{current_user.company_id}/{unique_filename}"
    
    return {"message": "Imagem enviada com sucesso.", "url": relative_url}

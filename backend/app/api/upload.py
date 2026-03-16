from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
import os
import shutil
from pathlib import Path

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/upload", tags=["upload"])

# Directory to store uploaded covers
STATIC_DIR = Path("static/covers")
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
    # Since we are mounting 'static/' in FastAPI at '/static', the URL is:
    relative_url = f"/static/covers/{current_user.company_id}/{isbn}.jpg"
    
    return {"message": "Imagem de capa salva com sucesso.", "url": relative_url}

import re

path = "backend/app/api/upload.py"
with open(path, "r") as f:
    content = f.read()

new_endpoint = """
@router.post("/inter-certificates")
async def upload_inter_certificates(
    cert_file: UploadFile = File(...),
    key_file: UploadFile = File(...),
    company_id: int = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    \"\"\"
    Upload MTLS certificates (.crt and .key) for Banco Inter.
    \"\"\"
    from app.models.user import UserRole
    if current_user.type != UserRole.SELLER or current_user.company_id != company_id:
        raise HTTPException(status_code=403, detail="Acesso restrito.")
        
    if not cert_file.filename.endswith(".crt") and not cert_file.filename.endswith(".pem"):
        raise HTTPException(status_code=400, detail="O arquivo do certificado deve ser .crt ou .pem")
        
    if not key_file.filename.endswith(".key"):
        raise HTTPException(status_code=400, detail="O arquivo da chave privada deve ser .key")

    certs_dir = Path(__file__).parent.parent.parent.parent / "certs" / "inter" / str(company_id)
    certs_dir.mkdir(parents=True, exist_ok=True)
    
    cert_path = certs_dir / f"inter_cert_{uuid.uuid4().hex}{Path(cert_file.filename).suffix}"
    key_path = certs_dir / f"inter_key_{uuid.uuid4().hex}{Path(key_file.filename).suffix}"
    
    try:
        with cert_path.open("wb") as buffer:
            shutil.copyfileobj(cert_file.file, buffer)
        with key_path.open("wb") as buffer:
            shutil.copyfileobj(key_file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar os certificados: {str(e)}")
        
    from app.models.company_settings import CompanySettings
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not settings:
        settings = CompanySettings(company_id=company_id)
        db.add(settings)
    
    settings.inter_cert_path = str(cert_path.absolute())
    settings.inter_key_path = str(key_path.absolute())
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Erro ao salvar no banco.")
        
    return {"message": "Certificados do Inter enviados e configurados com sucesso."}
"""

if "upload_inter_certificates" not in content:
    with open(path, "a") as f:
        f.write(new_endpoint)
    print("Endpoint added")
else:
    print("Endpoint already exists")


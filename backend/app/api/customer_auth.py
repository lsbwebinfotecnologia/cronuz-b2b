from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
import uuid
import re

from app.db.session import get_db
from app.models.customer import Customer
from app.models.company import Company
from app.models.user_session import UserSession
from app.core.security import verify_password, get_password_hash, create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES

router = APIRouter(prefix="/auth/customer", tags=["customer_auth"])

class CustomerLoginRequest(BaseModel):
    email: str
    password: str
    tenant_slug: str # Used to ensure they login to the correct store

class CustomerSetPasswordRequest(BaseModel):
    email: str
    document: str # CPF or CNPJ for verification
    password: str
    tenant_slug: str

def clean_document(doc: str) -> str:
    if not doc: return ""
    return re.sub(r"\D", "", doc)

@router.post("/login")
def login_customer(request: Request, payload: CustomerLoginRequest, db: Session = Depends(get_db)):
    company = db.query(Company).filter(Company.hotsite_slug == payload.tenant_slug).first()
    if not company:
        raise HTTPException(status_code=404, detail="Loja não encontrada.")

    customer = db.query(Customer).filter(
        Customer.company_id == company.id,
        Customer.email == payload.email
    ).first()

    if not customer:
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos.")

    if not customer.password_hash:
        raise HTTPException(
            status_code=403, 
            detail="Conta não possui senha cadastrada. Por favor, crie sua senha no Primeiro Acesso."
        )

    if not verify_password(payload.password, customer.password_hash):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos.")

    jti = str(uuid.uuid4())
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    expire_date = datetime.now(timezone.utc) + access_token_expires

    # Store new session
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")[:255] if request.headers.get("user-agent") else None
    
    new_session = UserSession(
        customer_id=customer.id,
        role="CUSTOMER",
        jti=jti,
        ip_address=client_ip,
        user_agent=user_agent,
        expires_at=expire_date,
        is_active=True
    )
    db.add(new_session)
    db.commit()

    access_token = create_access_token(
        data={
            "sub": str(customer.id), 
            "role": "customer",
            "company_id": company.id,
            "jti": jti
        },
        expires_delta=access_token_expires
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "customer": {
            "id": customer.id,
            "name": customer.name,
            "email": customer.email,
        }
    }

@router.post("/set-password")
def set_customer_password(payload: CustomerSetPasswordRequest, db: Session = Depends(get_db)):
    company = db.query(Company).filter(Company.hotsite_slug == payload.tenant_slug).first()
    if not company:
        raise HTTPException(status_code=404, detail="Loja não encontrada.")

    clean_doc = clean_document(payload.document)
    
    customer = db.query(Customer).filter(
        Customer.company_id == company.id,
        Customer.email == payload.email
    ).first()

    if not customer:
        raise HTTPException(status_code=404, detail="Não encontramos nenhuma assinatura vinculada a este e-mail.")

    customer_doc_clean = clean_document(customer.document)
    if customer_doc_clean != clean_doc:
        raise HTTPException(status_code=401, detail="O CPF/CNPJ fornecido não corresponde ao e-mail informado.")

    if customer.password_hash:
        raise HTTPException(status_code=400, detail="Esta conta já possui uma senha. Por favor, faça o Login normalmente.")

    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="A senha deve ter no mínimo 6 caracteres.")

    customer.password_hash = get_password_hash(payload.password)
    db.commit()

    return {"message": "Senha criada com sucesso! Você já pode fazer login."}

from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
import uuid
import re

from app.db.session import get_db
from app.models.customer import Customer
from app.models.company import Company
from app.models.subscription import SubscriptionPlan
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
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.hotsite_slug == payload.tenant_slug).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Loja não encontrada.")

    customer = db.query(Customer).filter(
        Customer.company_id == plan.company_id,
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
            "company_id": plan.company_id,
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
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.hotsite_slug == payload.tenant_slug).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Loja não encontrada.")

    clean_doc = clean_document(payload.document)
    
    customer = db.query(Customer).filter(
        Customer.company_id == plan.company_id,
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

class CustomerForgotPasswordRequest(BaseModel):
    email: str
    tenant_slug: str

class CustomerResetPasswordRequest(BaseModel):
    token: str
    new_password: str

@router.post("/forgot-password")
def forgot_password_customer(payload: CustomerForgotPasswordRequest, db: Session = Depends(get_db)):
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.hotsite_slug == payload.tenant_slug).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Loja não encontrada.")

    customer = db.query(Customer).filter(
        Customer.company_id == plan.company_id,
        Customer.email == payload.email
    ).first()

    if not customer:
        # Prevent email enumeration by returning a generic success message
        return {"message": "Se o e-mail estiver cadastrado, você receberá um link de recuperação."}

    from app.core.security import create_reset_token
    from app.models.company_settings import CompanySettings
    from app.core.email import send_smtp_email
    
    token = create_reset_token(email=customer.email, company_id=plan.company_id, user_type="customer")
    
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == plan.company_id).first()
    if settings and settings.smtp_host and settings.smtp_username and settings.smtp_password:
        company = db.query(Company).filter(Company.id == plan.company_id).first()
        company_name = company.name if company else "Nossa Loja"
        
        # Link para redefinição no frontend (hotsite)
        reset_link = f"{settings.cover_image_base_url or 'http://localhost:3000'}/h/{payload.tenant_slug}/login?token={token}"
        # Se for localhost, usa a origem como fallback provisório (ajustável dps)
        reset_link = f"http://localhost:3000/h/{payload.tenant_slug}/login?token={token}"
        
        html_content = f"""
        <html>
            <body style="font-family: sans-serif; line-height: 1.6; color: #333;">
                <h2 style="color: #0f172a;">Recuperação de Senha - {company_name}</h2>
                <p>Olá, {customer.name}</p>
                <p>Recebemos uma solicitação para redefinir a senha da sua conta.</p>
                <p>Para criar uma nova senha, clique no botão abaixo (este link expira em 30 minutos):</p>
                <div style="margin: 30px 0;">
                    <a href="{reset_link}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Redefinir Minha Senha</a>
                </div>
                <p>Se você não solicitou esta alteração, pode ignorar este e-mail em segurança.</p>
                <hr style="border: 1px solid #eee; margin-top: 40px;" />
                <p style="font-size: 12px; color: #888;">Equipe {company_name}</p>
            </body>
        </html>
        """
        try:
            send_smtp_email(
                smtp_host=settings.smtp_host,
                smtp_port=settings.smtp_port or 587,
                smtp_username=settings.smtp_username,
                smtp_password=settings.smtp_password,
                smtp_from=settings.smtp_from_email or settings.smtp_username,
                to_email=customer.email,
                subject=f"Recuperação de Senha - {company_name}",
                html_content=html_content,
                use_ssl=settings.smtp_use_ssl or False
            )
        except Exception as e:
            # Em caso de falha silenciosa
            print(f"Erro ao enviar email de recuperação: {e}")
            pass

    return {"message": "Se o e-mail estiver cadastrado, você receberá um link de recuperação."}

@router.post("/reset-password")
def reset_password_customer(payload: CustomerResetPasswordRequest, db: Session = Depends(get_db)):
    from app.core.security import verify_reset_token
    
    token_data = verify_reset_token(payload.token)
    if not token_data or token_data.get("user_type") != "customer":
        raise HTTPException(status_code=400, detail="Token inválido ou expirado.")
        
    email = token_data.get("sub")
    company_id = token_data.get("company_id")
    
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="A senha deve ter no mínimo 6 caracteres.")
        
    customer = db.query(Customer).filter(
        Customer.company_id == company_id,
        Customer.email == email
    ).first()
    
    if not customer:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
        
    customer.password_hash = get_password_hash(payload.new_password)
    db.commit()
    
    return {"message": "Senha redefinida com sucesso! Você já pode fazer login."}

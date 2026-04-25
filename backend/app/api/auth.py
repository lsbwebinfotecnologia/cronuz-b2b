from fastapi import APIRouter, Depends, HTTPException, status, Request, Form
from pydantic import BaseModel
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import or_
import re
from datetime import datetime, timedelta, timezone
import uuid

from app.db.session import get_db
from app.models.user import User
from app.models.company import Company
from app.models.company_settings import CompanySettings
from app.models.customer import Customer
from app.models.user_session import UserSession
from app.core import security
from app.core.dependencies import get_current_user_optional, oauth2_scheme

router = APIRouter()

@router.post("/token")
def login_for_access_token(
    request: Request,
    company_id: int = Form(None),
    db: Session = Depends(get_db), 
    form_data: OAuth2PasswordRequestForm = Depends()
):
    # Prepare search inputs
    username_input = form_data.username.strip()
    username_clean = re.sub(r"\D", "", username_input)
    
    filters = [User.email == username_input]
    if username_clean:
         filters.append(User.document == username_clean)

    # Find user
    query = db.query(User).filter(or_(*filters))
    
    # Isolate by tenant if accessing via storefront
    if company_id:
        query = query.filter(User.company_id == company_id)
        
    user = query.first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    # Check if user is temporarily locked out
    now = datetime.now(timezone.utc)
    if user.locked_until and user.locked_until.replace(tzinfo=timezone.utc) > now:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Sua conta foi temporariamente bloqueada por muitas tentativas falhas. Tente novamente mais tarde.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify password
    if not security.verify_password(form_data.password, user.password_hash):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= 5:
            user.locked_until = now + timedelta(minutes=15)
        
        db.commit()
        db.refresh(user)
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check Horus Rules for CUSTOMER accounts
    if user.type == "CUSTOMER" and user.company_id:
        settings = db.query(CompanySettings).filter(CompanySettings.company_id == user.company_id).first()
        if settings and settings.horus_enabled:
            customer = db.query(Customer).filter(
                Customer.document == user.document,
                Customer.company_id == user.company_id
            ).first()
            
            if not customer or not customer.id_guid or not customer.id_doc:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Seu cadastro ainda não foi sincronizado com o ERP Horus. Entre em contato com o administrador da distribuidora."
                )

    # Success, reset attempts
    user.failed_login_attempts = 0
    user.locked_until = None
    
    # Session Management
    jti = str(uuid.uuid4())
    access_token_expires = timedelta(minutes=security.ACCESS_TOKEN_EXPIRE_MINUTES)
    expire_date = datetime.now(timezone.utc) + access_token_expires

    # Invalidate previous sessions for SELLER and AGENT
    if user.type in ["SELLER", "AGENT"]:
        db.query(UserSession).filter(
            UserSession.user_id == user.id,
            UserSession.is_active == True
        ).update({"is_active": False})
    
    # Store new session
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")[:255] if request.headers.get("user-agent") else None
    
    new_session = UserSession(
        user_id=user.id,
        role=user.type,
        jti=jti,
        ip_address=client_ip,
        user_agent=user_agent,
        expires_at=expire_date,
        is_active=True
    )
    db.add(new_session)
    db.commit()
    
    access_token = security.create_access_token(
        data={"sub": user.email, "type": user.type, "company_id": user.company_id, "jti": jti},
        expires_delta=access_token_expires
    )
    
    company_name = "Sede Master Cronuz"
    if user.company_id:
        company = db.query(Company).filter(Company.id == user.company_id).first()
        if company:
            company_name = company.name

    return {"access_token": access_token, "token_type": "bearer", "user": {
        "name": user.name,
        "email": user.email,
        "type": user.type,
        "company_id": user.company_id,
        "company_name": company_name,
        "tenant_id": user.tenant_id
    }}

@router.post("/logout")
def logout(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)):
    try:
        from jose import jwt
        payload = jwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
        jti: str = payload.get("jti")
        if jti:
            session_log = db.query(UserSession).filter(UserSession.jti == jti).first()
            if session_log:
                session_log.is_active = False
                db.commit()
    except Exception as e:
        pass # Ignore token decode errors on logout, just proceed
    
    return {"message": "Deslogado com sucesso."}

class UserForgotPasswordRequest(BaseModel):
    email: str

class UserResetPasswordRequest(BaseModel):
    token: str
    new_password: str

@router.post("/forgot-password")
def forgot_password_user(payload: UserForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()

    if not user:
        return {"message": "Se o e-mail estiver cadastrado, você receberá um link de recuperação."}

    from app.core.security import create_reset_token
    from app.models.company_settings import CompanySettings
    from app.core.email import send_smtp_email
    
    token = create_reset_token(email=user.email, company_id=user.company_id or 1, user_type="user")
    
    company_id_to_check = user.company_id if user.company_id else 1
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id_to_check).first()
    
    if settings and settings.smtp_host and settings.smtp_username and settings.smtp_password:
        company = db.query(Company).filter(Company.id == company_id_to_check).first()
        company_name = company.name if company else "Cronuz"
        
        # Link para redefinição no frontend (login B2B)
        reset_link = f"{settings.cover_image_base_url or 'http://localhost:3000'}/login?token={token}"
        # Fallback local
        reset_link = f"http://localhost:3000/login?token={token}"
        
        html_content = f"""
        <html>
            <body style="font-family: sans-serif; line-height: 1.6; color: #333;">
                <h2 style="color: #0f172a;">Recuperação de Senha - {company_name}</h2>
                <p>Olá, {user.name}</p>
                <p>Recebemos uma solicitação para redefinir a senha do seu acesso corporativo.</p>
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
                to_email=user.email,
                subject=f"Recuperação de Senha - {company_name}",
                html_content=html_content,
                use_ssl=settings.smtp_use_ssl or False
            )
        except Exception as e:
            print(f"Erro ao enviar email de recuperação (User): {e}")
            pass

    return {"message": "Se o e-mail estiver cadastrado, você receberá um link de recuperação."}

@router.post("/reset-password")
def reset_password_user(payload: UserResetPasswordRequest, db: Session = Depends(get_db)):
    from app.core.security import verify_reset_token
    
    token_data = verify_reset_token(payload.token)
    if not token_data or token_data.get("user_type") != "user":
        raise HTTPException(status_code=400, detail="Token inválido ou expirado.")
        
    email = token_data.get("sub")
    
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="A senha deve ter no mínimo 6 caracteres.")
        
    user = db.query(User).filter(User.email == email).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
        
    user.password_hash = security.get_password_hash(payload.new_password)
    db.commit()
    
    return {"message": "Senha redefinida com sucesso! Você já pode fazer login."}

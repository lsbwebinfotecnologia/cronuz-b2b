from fastapi import APIRouter, Depends, HTTPException, status, Request, Form
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


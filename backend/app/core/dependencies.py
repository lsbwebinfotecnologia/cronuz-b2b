from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.security import SECRET_KEY, ALGORITHM
from app.models.user import User, UserRole
from app.models.customer import Customer
from app.models.user_session import UserSession

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        jti: str = payload.get("jti")
        company_id = payload.get("company_id")
        if email is None or jti is None:
            raise credentials_exception
            
        # Check if session is explicitly active
        session_log = db.query(UserSession).filter(UserSession.jti == jti).first()
        if not session_log or not session_log.is_active:
            raise credentials_exception
            
    except JWTError:
        raise credentials_exception
        
    query = db.query(User).filter(User.email == email)
    if company_id is not None:
        query = query.filter(User.company_id == company_id)
        
    user = query.first()
    if user is None:
        raise credentials_exception
    return user

def get_current_user_optional(token: str = Depends(OAuth2PasswordBearer(tokenUrl="token", auto_error=False)), db: Session = Depends(get_db)):
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        jti: str = payload.get("jti")
        company_id = payload.get("company_id")
        if email is None or jti is None:
            return None
            
        # Check if session is explicitly active
        session_log = db.query(UserSession).filter(UserSession.jti == jti).first()
        if not session_log or not session_log.is_active:
            return None
            
    except JWTError:
        return None
        
    query = db.query(User).filter(User.email == email)
    if company_id is not None:
        query = query.filter(User.company_id == company_id)
        
    user = query.first()
    return user

def require_master_user(current_user: User = Depends(get_current_user)):
    if current_user.type != UserRole.MASTER:
        raise HTTPException(status_code=403, detail="Acesso negado. Apenas usuários MASTER permitidos.")
    return current_user

def get_current_customer(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Login required to access Customer Portal",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        jti: str = payload.get("jti")
        if not jti:
            raise credentials_exception

        # Check session explicitly
        session_log = db.query(UserSession).filter(UserSession.jti == jti).first()
        if not session_log or not session_log.is_active:
            raise credentials_exception

        role: str = payload.get("role")
        user_type: str = payload.get("type")
        sub_val: str = payload.get("sub")
        
        customer = None
        
        # Schema 1: Legacy Customer Portal (/h/[slug]/login)
        if role == "customer" and sub_val:
            customer = db.query(Customer).filter(Customer.id == int(sub_val)).first()
            
        # Schema 2: Storefront B2B Multi-tenant (/login)
        elif user_type == "CUSTOMER" and sub_val:
            # sub_val is the user's email
            from app.models.user import User
            user = db.query(User).filter(User.email == sub_val).first()
            if user and user.document:
                customer = db.query(Customer).filter(
                    Customer.document == user.document,
                    Customer.company_id == user.company_id
                ).first()

        if not customer:
            raise credentials_exception

    except JWTError:
        raise credentials_exception
        
    return customer

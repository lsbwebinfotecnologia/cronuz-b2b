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
        if email is None or jti is None:
            raise credentials_exception
            
        # Check if session is explicitly active
        session_log = db.query(UserSession).filter(UserSession.jti == jti).first()
        if not session_log or not session_log.is_active:
            raise credentials_exception
            
    except JWTError:
        raise credentials_exception
        
    user = db.query(User).filter(User.email == email).first()
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
        if email is None or jti is None:
            return None
            
        # Check if session is explicitly active
        session_log = db.query(UserSession).filter(UserSession.jti == jti).first()
        if not session_log or not session_log.is_active:
            return None
            
    except JWTError:
        return None
        
    user = db.query(User).filter(User.email == email).first()
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
        role: str = payload.get("role")
        customer_id_str: str = payload.get("sub")
        jti: str = payload.get("jti")
        if not customer_id_str or role != "customer" or not jti:
            raise credentials_exception
            
        # Check session explicitly
        session_log = db.query(UserSession).filter(UserSession.jti == jti).first()
        if not session_log or not session_log.is_active:
            raise credentials_exception
            
    except JWTError:
        raise credentials_exception
        
    customer = db.query(Customer).filter(Customer.id == int(customer_id_str)).first()
    if customer is None:
        raise credentials_exception
    return customer

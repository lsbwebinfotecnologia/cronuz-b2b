import os
import logging
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext

logger = logging.getLogger(__name__)

# [SEC] A SECRET_KEY DEVE ser configurada via .env em produção.
SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    if os.environ.get("ENVIRONMENT", "development").lower() == "production":
        logger.critical("[FATAL-SECURITY] SECRET_KEY não configurada no ambiente de produção!")
        raise RuntimeError("SECRET_KEY obrigatória em produção.")
    logger.warning("[SECURITY] SECRET_KEY não informada no .env. Utilizando chave de desenvolvimento local.")
    SECRET_KEY = "SUPER_SECRET_KEY_FOR_CRONUZ_B2B_DEV"

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 10080  # 7 dias (mobile B2B precisa de sessão longa)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def create_reset_token(email: str, company_id: int, user_type: str = "customer", expires_delta: Optional[timedelta] = None):
    to_encode = {"sub": email, "type": "reset", "user_type": user_type, "company_id": company_id}
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=30)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_reset_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "reset":
            return None
        return payload
    except JWTError:
        return None

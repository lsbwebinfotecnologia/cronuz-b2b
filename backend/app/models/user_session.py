from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.db.session import Base

class UserSession(Base):
    __tablename__ = "usr_session_logs"

    id = Column(Integer, primary_key=True, index=True)
    # References main panel users (MASTER, SELLER, AGENT, CUSTOMER-dashboard)
    user_id = Column(Integer, ForeignKey("usr_user.id"), nullable=True, index=True)
    # References Storefront B2B customers
    customer_id = Column(Integer, ForeignKey("crm_customer.id"), nullable=True, index=True)
    
    role = Column(String(50), nullable=False) # 'MASTER', 'SELLER', 'AGENT', 'CUSTOMER', etc
    jti = Column(String(50), unique=True, index=True, nullable=False) # JWT Token ID
    
    ip_address = Column(String(100), nullable=True)
    user_agent = Column(String(255), nullable=True)
    
    login_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    
    is_active = Column(Boolean, default=True, nullable=False)

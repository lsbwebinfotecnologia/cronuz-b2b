import enum
from sqlalchemy import Column, Integer, String, Enum, ForeignKey, DateTime, UniqueConstraint, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base

class UserRole(str, enum.Enum):
    MASTER = "MASTER"
    SELLER = "SELLER"
    CUSTOMER = "CUSTOMER"
    AGENT = "AGENT"

class User(Base):
    __tablename__ = "usr_user"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False, index=True)
    document = Column(String(50), nullable=True) # CPF/CNPJ
    password_hash = Column(String(255), nullable=False)
    
    type = Column(Enum(UserRole), nullable=False)
    tenant_id = Column(String(50), nullable=True) # Used by MASTER to restrict to specific brand (e.g. 'horus')
    
    # Nullable because MASTER doesn't have a company
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=True)
    
    active = Column(Boolean, default=True, nullable=False)
    
    # Security & 2FA
    failed_login_attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    is_2fa_enabled = Column(Boolean, default=False, nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    company = relationship("Company")

    __table_args__ = (
        # You cannot have the same email for the same TYPE in the same COMPANY
        # Example: john@email.com can be a CUSTOMER and an AGENT in the same company, 
        # but cannot be two CUSTOMERs in the same company.
        # SQLite treats NULL values as distinct in unique constraints in newer versions, 
        # so for MASTER (company_id=NULL), it might allow multiples if we aren't careful, 
        # but logic normally handles this.
        UniqueConstraint('email', 'type', 'company_id', name='uq_usr_email_type_company'),
        UniqueConstraint('document', 'type', 'company_id', name='uq_usr_document_type_company'),
    )

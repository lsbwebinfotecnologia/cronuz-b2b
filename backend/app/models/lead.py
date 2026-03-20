from sqlalchemy import Column, String, DateTime, Text, Integer
import uuid
from datetime import datetime
from app.db.session import Base

class Lead(Base):
    __tablename__ = "leads"

    id = Column(String(32), primary_key=True, default=lambda: uuid.uuid4().hex)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False)
    whatsapp = Column(String(50), nullable=True)
    need_type = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), default="new")
    
    # Nex CRM extension fields
    source = Column(String(100), nullable=True)
    assigned_to = Column(Integer, nullable=True)
    company_name = Column(String(255), nullable=True)
    role = Column(String(100), nullable=True)
    company_id = Column(Integer, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)

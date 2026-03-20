from sqlalchemy import Column, String, DateTime, Text
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
    created_at = Column(DateTime, default=datetime.utcnow)

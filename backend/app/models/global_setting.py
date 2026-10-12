from sqlalchemy import Column, String, Text, DateTime
from sqlalchemy.sql import func
from app.db.session import Base

class GlobalSetting(Base):
    __tablename__ = "sys_global_setting"

    key = Column(String(100), primary_key=True, index=True)
    value = Column(Text, nullable=True)
    description = Column(String(255), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

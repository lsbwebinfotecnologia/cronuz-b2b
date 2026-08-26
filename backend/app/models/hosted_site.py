from sqlalchemy import Column, Integer, BigInteger, String, Boolean, DateTime, Text
from sqlalchemy.sql import func
from app.db.session import Base


class HostedSite(Base):
    __tablename__ = "sit_hosted_sites"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, index=True, nullable=False)
    description = Column(Text, nullable=True)
    custom_domain = Column(String(255), nullable=True)
    
    # Status: pending_upload, ready, extracting, error
    status = Column(String(50), nullable=False, default="pending_upload", index=True)
    
    zip_filename = Column(String(255), nullable=True)
    zip_size_bytes = Column(BigInteger, nullable=True)
    has_index = Column(Boolean, nullable=False, default=False)
    files_count = Column(Integer, nullable=False, default=0)
    storage_path = Column(String(500), nullable=True)
    
    last_deployed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.session import Base

class Integrator(Base):
    __tablename__ = "integrators"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False)
    platform = Column(String(50), nullable=False)       # e.g., 'TRAY', 'SHOPIFY'
    credentials = Column(Text, nullable=True)           # JSON string to store API keys
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    company = relationship("Company", backref="integrators")

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base

class SystemIntegrator(Base):
    __tablename__ = "system_integrators"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    code = Column(String(50), nullable=False, unique=True, index=True) # e.g. HORUS, EFI, TRAY
    description = Column(String(500), nullable=True)
    logo = Column(String(500), nullable=True)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    groups = relationship("SystemIntegratorGroup", back_populates="integrator", cascade="all, delete-orphan", order_by="SystemIntegratorGroup.order_index")

class SystemIntegratorGroup(Base):
    __tablename__ = "system_integrator_groups"
    
    id = Column(Integer, primary_key=True, index=True)
    system_integrator_id = Column(Integer, ForeignKey("system_integrators.id"), nullable=False)
    name = Column(String(100), nullable=False)
    order_index = Column(Integer, default=0)
    
    integrator = relationship("SystemIntegrator", back_populates="groups")
    fields = relationship("SystemIntegratorField", back_populates="group", cascade="all, delete-orphan", order_by="SystemIntegratorField.order_index")

class SystemIntegratorField(Base):
    __tablename__ = "system_integrator_fields"
    
    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("system_integrator_groups.id"), nullable=False)
    name = Column(String(100), nullable=False) # JSON key 
    label = Column(String(100), nullable=False) # UI Label
    type = Column(String(50), default="TEXT") # e.g. TEXT, PASSWORD, NUMBER, BOOLEAN
    is_required = Column(Boolean, default=True, nullable=False)
    order_index = Column(Integer, default=0)
    
    group = relationship("SystemIntegratorGroup", back_populates="fields")

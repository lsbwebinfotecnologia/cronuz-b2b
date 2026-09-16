from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, UniqueConstraint, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base
import enum

class InventoryStatus(str, enum.Enum):
    EM_ANDAMENTO = "EM_ANDAMENTO"
    FINALIZADO = "FINALIZADO"
    CANCELADO = "CANCELADO"

class SessionStatus(str, enum.Enum):
    ABERTA = "ABERTA"
    CONCLUIDA = "CONCLUIDA"
    CANCELADA = "CANCELADA"

class SessionType(str, enum.Enum):
    CONTAGEM = "CONTAGEM"
    RECONTAGEM_AUDITORIA = "RECONTAGEM_AUDITORIA"

class Inventory(Base):
    __tablename__ = "inv_inventory"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False)
    
    code = Column(String(50), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    status = Column(String(50), default=InventoryStatus.EM_ANDAMENTO.value, nullable=False)
    description = Column(Text, nullable=True)
    
    total_expected_skus = Column(Integer, default=0, nullable=False)
    access_token = Column(String(64), unique=True, index=True, nullable=True)
    is_public_access_enabled = Column(Boolean, default=True, nullable=False)
    
    created_by_user_id = Column(Integer, ForeignKey("usr_user.id"), nullable=True)
    finalized_by_user_id = Column(Integer, ForeignKey("usr_user.id"), nullable=True)
    finalized_at = Column(DateTime(timezone=True), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships with explicit foreign_keys
    company = relationship("Company", foreign_keys=[company_id])
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    finalized_by = relationship("User", foreign_keys=[finalized_by_user_id])
    
    items = relationship("InventoryItem", back_populates="inventory", cascade="all, delete-orphan", foreign_keys="InventoryItem.inventory_id")
    sessions = relationship("InventorySession", back_populates="inventory", cascade="all, delete-orphan", foreign_keys="InventorySession.inventory_id")
    scans = relationship("InventoryScan", back_populates="inventory", cascade="all, delete-orphan", foreign_keys="InventoryScan.inventory_id")

    __table_args__ = (
        Index("idx_inv_inventory_company_status", "company_id", "status"),
    )


class InventoryItem(Base):
    __tablename__ = "inv_inventory_item"

    id = Column(Integer, primary_key=True, index=True)
    inventory_id = Column(Integer, ForeignKey("inv_inventory.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False)
    
    isbn = Column(String(50), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    publisher = Column(String(255), nullable=True)
    category = Column(String(100), nullable=True)
    default_location = Column(String(100), nullable=True)
    
    is_unregistered = Column(Boolean, default=False, nullable=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    inventory = relationship("Inventory", back_populates="items", foreign_keys=[inventory_id])
    company = relationship("Company", foreign_keys=[company_id])

    __table_args__ = (
        UniqueConstraint("inventory_id", "isbn", name="uq_inv_item_inventory_isbn"),
        Index("idx_inv_item_lookup", "inventory_id", "isbn"),
        Index("idx_inv_item_location", "inventory_id", "default_location"),
    )


class InventorySession(Base):
    __tablename__ = "inv_inventory_session"

    id = Column(Integer, primary_key=True, index=True)
    inventory_id = Column(Integer, ForeignKey("inv_inventory.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("usr_user.id"), nullable=True)
    operator_name = Column(String(255), nullable=True)
    
    location = Column(String(100), nullable=False, index=True)
    session_type = Column(String(50), default=SessionType.CONTAGEM.value, nullable=False)
    round_number = Column(Integer, default=1, nullable=False)
    status = Column(String(50), default=SessionStatus.ABERTA.value, nullable=False)
    total_scans = Column(Integer, default=0, nullable=False)
    
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    closed_at = Column(DateTime(timezone=True), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    inventory = relationship("Inventory", back_populates="sessions", foreign_keys=[inventory_id])
    company = relationship("Company", foreign_keys=[company_id])
    user = relationship("User", foreign_keys=[user_id])
    
    scans = relationship("InventoryScan", back_populates="session", cascade="all, delete-orphan", foreign_keys="InventoryScan.session_id")

    __table_args__ = (
        Index("idx_inv_session_lookup", "inventory_id", "location", "status"),
        Index("idx_inv_session_user", "user_id", "inventory_id"),
    )


class InventoryScan(Base):
    __tablename__ = "inv_inventory_scan"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("inv_inventory_session.id", ondelete="CASCADE"), nullable=False, index=True)
    inventory_id = Column(Integer, ForeignKey("inv_inventory.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("usr_user.id"), nullable=True)
    operator_name = Column(String(255), nullable=True)
    
    isbn = Column(String(50), nullable=False, index=True)
    location = Column(String(100), nullable=False)
    quantity = Column(Integer, default=1, nullable=False)
    client_uuid = Column(String(64), nullable=False)
    
    scanned_at = Column(DateTime(timezone=True), nullable=False)
    synced_at = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("InventorySession", back_populates="scans", foreign_keys=[session_id])
    inventory = relationship("Inventory", back_populates="scans", foreign_keys=[inventory_id])
    company = relationship("Company", foreign_keys=[company_id])
    user = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        UniqueConstraint("session_id", "client_uuid", name="uq_inv_scan_client_uuid"),
        Index("idx_inv_scan_isbn_inventory", "inventory_id", "isbn"),
        Index("idx_inv_scan_session", "session_id"),
    )

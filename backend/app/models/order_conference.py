from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.session import Base

class OrderConference(Base):
    __tablename__ = "cmp_order_conference"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("cmp_seller_branch.id"), nullable=False)
    cod_cli = Column(String(50), nullable=False)
    cod_pedido_origem = Column(String(50), nullable=False)
    status = Column(String(20), default="IN_PROGRESS", nullable=False) # IN_PROGRESS, COMPLETED
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Explicit relationships with foreign_keys as per Rule 1
    company = relationship("Company", back_populates="conferences", foreign_keys=[company_id])
    branch = relationship("SellerBranch", foreign_keys=[branch_id])
    volumes = relationship("OrderConferenceVolume", back_populates="conference", foreign_keys="OrderConferenceVolume.conference_id", cascade="all, delete-orphan")

class OrderConferenceVolume(Base):
    __tablename__ = "cmp_order_conference_volume"

    id = Column(Integer, primary_key=True, index=True)
    conference_id = Column(Integer, ForeignKey("cmp_order_conference.id"), nullable=False)
    volume_number = Column(Integer, nullable=False)
    barcode = Column(String(100), unique=True, index=True, nullable=False)
    weight = Column(Float, nullable=True)
    status = Column(String(20), default="COMPLETED", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Explicit relationships with foreign_keys as per Rule 1
    conference = relationship("OrderConference", back_populates="volumes", foreign_keys=[conference_id])
    items = relationship("OrderConferenceVolumeItem", back_populates="volume", foreign_keys="OrderConferenceVolumeItem.volume_id", cascade="all, delete-orphan")

class OrderConferenceVolumeItem(Base):
    __tablename__ = "cmp_order_conference_volume_item"

    id = Column(Integer, primary_key=True, index=True)
    volume_id = Column(Integer, ForeignKey("cmp_order_conference_volume.id"), nullable=False)
    isbn = Column(String(50), nullable=False)
    name = Column(String(255), nullable=False)
    quantity = Column(Integer, nullable=False)

    # Explicit relationships with foreign_keys as per Rule 1
    volume = relationship("OrderConferenceVolume", back_populates="items", foreign_keys=[volume_id])

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.session import Base

class OrderInteraction(Base):
    __tablename__ = "ord_interaction"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("ord_order.id"), nullable=False)
    user_type = Column(String(50), nullable=False) # "CUSTOMER" ou "SELLER"
    user_id = Column(Integer, ForeignKey("usr_user.id"), nullable=True)
    customer_id = Column(Integer, ForeignKey("crm_customer.id"), nullable=True)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    read_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    order = relationship("Order", back_populates="interactions")

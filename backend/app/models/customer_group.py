from sqlalchemy import Column, Integer, String, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from app.db.session import Base

class CustomerGroup(Base):
    __tablename__ = "crm_customer_group"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    color = Column(String(50), nullable=True) # Ex: '#FF0000'

    # Relacionamento com clientes através da tabela de link (grupos adicionais)
    customers = relationship("CustomerGroupLink", back_populates="group", cascade="all, delete-orphan")

class CustomerGroupLink(Base):
    __tablename__ = "crm_customer_group_link"

    customer_id = Column(Integer, ForeignKey("crm_customer.id", ondelete="CASCADE"), primary_key=True)
    group_id = Column(Integer, ForeignKey("crm_customer_group.id", ondelete="CASCADE"), primary_key=True)

    customer = relationship("app.models.customer.Customer", back_populates="additional_groups_links")
    group = relationship("CustomerGroup", back_populates="customers")

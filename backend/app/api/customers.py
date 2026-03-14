from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.db.session import get_db
from app.models.customer import Customer
from app.models.user import User, UserRole
from app.schemas.customer import CustomerCreate, Customer as CustomerSchema
from app.core.dependencies import get_current_user

router = APIRouter()

@router.post("/customers", response_model=CustomerSchema)
def create_customer(
    customer: CustomerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER]:
        raise HTTPException(status_code=403, detail="Não autorizado a cadastrar clientes.")
        
    if current_user.company_id is None:
        raise HTTPException(status_code=400, detail="Usuário precisa estar vinculado a uma empresa para cadastrar clientes.")

    # Check if document already exists for this company
    existing = db.query(Customer).filter(
        Customer.company_id == current_user.company_id,
        Customer.document == customer.document
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Cliente com este CNPJ já cadastrado nesta empresa.")

    db_customer = Customer(
        **customer.model_dump(),
        company_id=current_user.company_id
    )
    db.add(db_customer)
    db.commit()
    db.refresh(db_customer)
    return db_customer

@router.get("/customers", response_model=List[CustomerSchema])
def read_customers(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Sellers only see their own company's customers
    if current_user.company_id is None:
        # Master user logic if they somehow try to hit this, or we just restrict.
        raise HTTPException(status_code=403, detail="Usuário sem empresa vinculada.")

    customers = db.query(Customer).filter(
        Customer.company_id == current_user.company_id
    ).offset(skip).limit(limit).all()
    
    return customers

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.session import get_db
from app.models.customer import Customer, Address, Contact
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

    # Extract nested data
    customer_data = customer.model_dump(exclude={"addresses", "contacts"})
    
    db_customer = Customer(
        **customer_data,
        company_id=current_user.company_id
    )
    db.add(db_customer)
    db.commit()
    db.refresh(db_customer)
    
    # Process Addresses
    if customer.addresses:
        for addr in customer.addresses:
            db_addr = Address(**addr.model_dump(), customer_id=db_customer.id)
            db.add(db_addr)
            
    # Process Contacts
    if customer.contacts:
        for cnt in customer.contacts:
            db_cnt = Contact(**cnt.model_dump(), customer_id=db_customer.id)
            db.add(db_cnt)
    
    if customer.addresses or customer.contacts:
        db.commit()
        db.refresh(db_customer)
        
    return db_customer

@router.get("/customers", response_model=List[CustomerSchema])
def read_customers(
    skip: int = 0,
    limit: int = 25,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.company_id is None:
        raise HTTPException(status_code=403, detail="Usuário sem empresa vinculada.")

    query = db.query(Customer).filter(Customer.company_id == current_user.company_id)
    
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (Customer.name.ilike(search_term)) | 
            (Customer.document.ilike(search_term)) |
            (Customer.corporate_name.ilike(search_term))
        )

    customers = query.offset(skip).limit(limit).all()
    return customers

@router.get("/customers/{customer_id}", response_model=CustomerSchema)
def read_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.company_id is None:
        raise HTTPException(status_code=403, detail="Usuário sem empresa vinculada.")

    customer = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.company_id == current_user.company_id
    ).first()
    
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")
        
    return customer

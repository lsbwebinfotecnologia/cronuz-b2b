from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.session import get_db
from app.models.customer import Customer, Address, Contact, Interaction
from app.models.user import User, UserRole
from app.schemas.customer import CustomerCreate, CustomerUpdate, Customer as CustomerSchema, ContactCreate, Contact as ContactSchema
from app.core.dependencies import get_current_user
from app.core.security import get_password_hash
from pydantic import BaseModel

class InteractionCreate(BaseModel):
    type: str # CALL, EMAIL, MEETING, NOTE
    content: str

class CustomerUserCreate(BaseModel):
    email: str
    password: str

router = APIRouter()

@router.post("/customers", response_model=CustomerSchema)
def create_customer(
    customer: CustomerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER, UserRole.AGENT]:
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

@router.patch("/customers/{customer_id}", response_model=CustomerSchema)
def update_customer(
    customer_id: int,
    customer_in: CustomerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER, UserRole.AGENT]:
        raise HTTPException(status_code=403, detail="Não autorizado a alterar clientes.")
        
    customer = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.company_id == current_user.company_id
    ).first()
    
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    update_data = customer_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(customer, field, value)
        
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer

@router.post("/customers/{customer_id}/interactions")
def create_interaction(
    customer_id: int,
    interaction: InteractionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER, UserRole.AGENT]:
        raise HTTPException(status_code=403, detail="Não autorizado a criar interações.")
        
    customer = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.company_id == current_user.company_id
    ).first()
    
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    db_interaction = Interaction(
        customer_id=customer_id,
        seller_id=current_user.id,
        type=interaction.type,
        content=interaction.content
    )
    db.add(db_interaction)
    db.commit()
    db.refresh(db_interaction)
    return {"message": "Interação registrada com sucesso.", "id": db_interaction.id}

@router.post("/customers/{customer_id}/contacts", response_model=ContactSchema)
def create_contact(
    customer_id: int,
    contact_in: ContactCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER, UserRole.AGENT]:
        raise HTTPException(status_code=403, detail="Não autorizado a gerenciar contatos.")
        
    customer = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.company_id == current_user.company_id
    ).first()
    
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    db_contact = Contact(**contact_in.model_dump(), customer_id=customer_id)
    db.add(db_contact)
    db.commit()
    db.refresh(db_contact)
    return db_contact

@router.delete("/customers/{customer_id}/contacts/{contact_id}")
def delete_contact(
    customer_id: int,
    contact_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER, UserRole.AGENT]:
        raise HTTPException(status_code=403, detail="Não autorizado a gerenciar contatos.")
        
    contact = db.query(Contact).join(Customer).filter(
        Contact.id == contact_id,
        Contact.customer_id == customer_id,
        Customer.company_id == current_user.company_id
    ).first()
    
    if not contact:
        raise HTTPException(status_code=404, detail="Contato não encontrado.")
        
    db.delete(contact)
    db.commit()
    return {"message": "Contato excluído com sucesso."}

@router.get("/customers/{customer_id}/users")
def get_customer_user(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER, UserRole.AGENT]:
        raise HTTPException(status_code=403, detail="Não autorizado.")
        
    customer = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.company_id == current_user.company_id
    ).first()
    
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    user = db.query(User).filter(
        User.document == customer.document,
        User.company_id == customer.company_id,
        User.type == UserRole.CUSTOMER
    ).first()

    if not user:
        return None
        
    from app.schemas.user import User as UserPydanticSchema
    return UserPydanticSchema.from_orm(user)

@router.post("/customers/{customer_id}/users")
def create_customer_user(
    customer_id: int,
    user_in: CustomerUserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from sqlalchemy.exc import IntegrityError
    from app.schemas.user import User as UserPydanticSchema
    
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER, UserRole.AGENT]:
        raise HTTPException(status_code=403, detail="Não autorizado.")
        
    customer = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.company_id == current_user.company_id
    ).first()
    
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    existing_user = db.query(User).filter(
        User.document == customer.document,
        User.company_id == customer.company_id,
        User.type == UserRole.CUSTOMER
    ).first()
    
    if existing_user:
        raise HTTPException(status_code=400, detail="Este cliente já possui credencial de acesso.")

    db_user = User(
        name=customer.name,
        email=user_in.email,
        document=customer.document,
        password_hash=get_password_hash(user_in.password),
        type=UserRole.CUSTOMER,
        company_id=customer.company_id
    )
    
    try:
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return UserPydanticSchema.from_orm(db_user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="E-mail já cadastrado por outro usuário.")

@router.get("/customers/{customer_id}/financials")
async def get_customer_financials_api(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER, UserRole.AGENT]:
        raise HTTPException(status_code=403, detail="Não autorizado a consultar dados financeiros.")
        
    customer = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.company_id == current_user.company_id
    ).first()
    
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")
        
    if not customer.id_guid:
        raise HTTPException(status_code=400, detail="Cliente não sincronizado com o Horus (sem ID_GUID).")

    from app.models.company import Company
    from app.integrators.horus_clients import HorusClients
    
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    if not company or not company.document:
        raise HTTPException(status_code=400, detail="Documento da empresa não configurado.")

    horus_client = HorusClients(db, current_user.company_id)
    try:
        financials = await horus_client.get_customer_financials(
            cnpj_destino=company.document,
            cnpj_cliente=customer.document
        )
        return financials
    except Exception as e:
        print(f"Horus Financial Fetch Error: {e}")
        return {
            "credit_limit": 0.0,
            "debt_balance": 0.0,
            "available_limit": 0.0,
            "status": "ERRO"
        }
    finally:
        await horus_client.close()


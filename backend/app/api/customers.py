from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.session import get_db
from app.models.customer import Customer, Address, Contact, Interaction
from app.models.user import User, UserRole
from app.schemas.customer import CustomerCreate, CustomerUpdate, Customer as CustomerSchema, ContactCreate, Contact as ContactSchema, AddressCreate, Address as AddressSchema
from app.core.dependencies import get_current_user
from app.core.security import get_password_hash
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class InteractionCreate(BaseModel):
    type: str # CALL, EMAIL, MEETING, NOTE, TASK
    content: str
    due_date: Optional[datetime] = None
    status: Optional[str] = "COMPLETED"

class InteractionUpdate(BaseModel):
    status: Optional[str] = None
    type: Optional[str] = None
    content: Optional[str] = None
    due_date: Optional[datetime] = None

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

    from app.models.order import Order
    from sqlalchemy import func

    # We use a subquery to find the last purchase date per customer.
    last_orders_subq = db.query(
        Order.customer_id,
        func.max(Order.created_at).label("last_purchase")
    ).filter(Order.status != "CANCELLED").group_by(Order.customer_id).subquery()

    query = db.query(Customer, last_orders_subq.c.last_purchase).filter(Customer.company_id == current_user.company_id)
    
    # Outer join to attach the subquery result
    query = query.outerjoin(last_orders_subq, Customer.id == last_orders_subq.c.customer_id)

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (Customer.name.ilike(search_term)) | 
            (Customer.document.ilike(search_term)) |
            (Customer.corporate_name.ilike(search_term))
        )

    # Order by most recently created first
    query = query.order_by(Customer.created_at.desc())

    results = query.offset(skip).limit(limit).all()

    # Map the scalar value into the Customer object
    final_customers = []
    for c, last_purchase in results:
        c.last_purchase = last_purchase
        final_customers.append(c)

    return final_customers

@router.get("/customers/stats")
def get_customers_stats(
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.company_id is None:
        raise HTTPException(status_code=403, detail="Usuário sem empresa vinculada.")

    from sqlalchemy import func
    
    query = db.query(
        func.count(Customer.id).label("total_customers"),
        func.sum(Customer.credit_limit).label("total_credit"),
        func.sum(Customer.open_debts).label("total_debts")
    ).filter(Customer.company_id == current_user.company_id)
    
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (Customer.name.ilike(search_term)) | 
            (Customer.document.ilike(search_term)) |
            (Customer.corporate_name.ilike(search_term))
        )

    result = query.first()
    return {
        "total_customers": result.total_customers or 0,
        "total_credit": result.total_credit or 0,
        "total_debts": result.total_debts or 0
    }

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
        content=interaction.content,
        due_date=interaction.due_date,
        status=interaction.status if interaction.status else "COMPLETED"
    )
    db.add(db_interaction)
    db.commit()
    db.refresh(db_interaction)
    return {"message": "Interação registrada com sucesso.", "id": db_interaction.id}

@router.patch("/customers/{customer_id}/interactions/{interaction_id}")
def update_interaction(
    customer_id: int,
    interaction_id: int,
    update_data: InteractionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER, UserRole.AGENT]:
        raise HTTPException(status_code=403, detail="Não autorizado.")
    
    inter = db.query(Interaction).filter(Interaction.id == interaction_id, Interaction.customer_id == customer_id).first()
    if not inter:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada.")
    
    if update_data.status is not None:
        inter.status = update_data.status
    if update_data.type is not None:
        inter.type = update_data.type
    if update_data.content is not None:
        inter.content = update_data.content
        
    # Optional because you can pass a null date to remove the due date
    # But since it's Optional[datetime] = None, we need to check if the dict contains it
    update_dict = update_data.dict(exclude_unset=True)
    if "due_date" in update_dict:
        inter.due_date = update_dict["due_date"]
        
    db.add(inter)
    db.commit()
    return {"message": "Interação atualizada."}

@router.delete("/customers/{customer_id}/interactions/{interaction_id}")
def delete_interaction(
    customer_id: int,
    interaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER, UserRole.AGENT]:
        raise HTTPException(status_code=403, detail="Não autorizado.")
    
    inter = db.query(Interaction).filter(Interaction.id == interaction_id, Interaction.customer_id == customer_id).first()
    if not inter:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada.")
    
    inter.status = "DELETED"
    db.add(inter)
    db.commit()
    return {"message": "Interação marcada como removida."}


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
        
    contact = db.query(Contact).filter(
        Contact.id == contact_id,
        Contact.customer_id == customer_id
    ).first()
    
    if not contact:
        raise HTTPException(status_code=404, detail="Contato não encontrado.")
        
    db.delete(contact)
    db.commit()
    return {"message": "Contato removido com sucesso"}

@router.post("/customers/{customer_id}/addresses", response_model=AddressSchema)
def create_address(
    customer_id: int,
    address_in: AddressCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER, UserRole.AGENT]:
        raise HTTPException(status_code=403, detail="Não autorizado a gerenciar endereços.")
        
    customer = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.company_id == current_user.company_id
    ).first()
    
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    db_address = Address(**address_in.model_dump(), customer_id=customer_id)
    db.add(db_address)
    db.commit()
    db.refresh(db_address)
    return db_address

@router.patch("/customers/{customer_id}/addresses/{address_id}", response_model=AddressSchema)
def update_address(
    customer_id: int,
    address_id: int,
    address_in: AddressCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER, UserRole.AGENT]:
        raise HTTPException(status_code=403, detail="Não autorizado a gerenciar endereços.")
        
    address = db.query(Address).filter(
        Address.id == address_id,
        Address.customer_id == customer_id
    ).first()
    
    if not address:
        raise HTTPException(status_code=404, detail="Endereço não encontrado.")

    update_data = address_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(address, field, value)
        
    db.add(address)
    db.commit()
    db.refresh(address)
    return address

@router.delete("/customers/{customer_id}/addresses/{address_id}")
def delete_address(
    customer_id: int,
    address_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER, UserRole.AGENT]:
        raise HTTPException(status_code=403, detail="Não autorizado a gerenciar endereços.")
        
    address = db.query(Address).filter(
        Address.id == address_id,
        Address.customer_id == customer_id
    ).first()
    
    if not address:
        raise HTTPException(status_code=404, detail="Endereço não encontrado.")
        
    db.delete(address)
    db.commit()
    return {"message": "Endereço removido com sucesso"}

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

@router.get("/customers/{customer_id}/crm-insights")
def get_crm_insights(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from sqlalchemy import func
    from app.models.order import Order, OrderItem
    from app.models.product import Product

    # Verify access
    customer = db.query(Customer).filter(Customer.id == customer_id, Customer.company_id == current_user.company_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    # Get RFM base variables (Recency, Frequency, Monetary)
    # We only care about native orders that aren't cancelled
    valid_statuses = ["NEW", "PROCESSING", "SENT_TO_HORUS", "DISPATCH", "INVOICED"]
    
    order_stats = db.query(
        func.count(Order.id).label("total_orders"),
        func.sum(Order.total).label("ltv"),
        func.max(Order.created_at).label("last_purchase")
    ).filter(
        Order.customer_id == customer_id,
        Order.status.in_(valid_statuses)
    ).first()

    total_orders = order_stats.total_orders or 0
    ltv = float(order_stats.ltv) if order_stats.ltv else 0.0
    average_ticket = ltv / total_orders if total_orders > 0 else 0.0
    last_purchase = order_stats.last_purchase
    
    recency_days = 0
    if last_purchase:
        from datetime import datetime, timezone
        # last_purchase might be naive if using sqlite
        now = datetime.utcnow() if last_purchase.tzinfo is None else datetime.now(timezone.utc)
        
        # force naive for subtraction if needed
        if last_purchase.tzinfo is None:
             delta = now - last_purchase
        else:
             delta = now.astimezone(timezone.utc) - last_purchase
             
        recency_days = delta.days

    # Top recommended / most bought products (Basket)
    top_products_query = db.query(
        OrderItem.product_id,
        Product.name.label("title"),
        Product.sku,
        Product.cover_url.label("image_url"),
        func.sum(OrderItem.quantity).label("total_qty")
    ).join(Product, Product.id == OrderItem.product_id).join(Order, Order.id == OrderItem.order_id).filter(
        Order.customer_id == customer_id,
        Order.status.in_(valid_statuses)
    ).group_by(
        OrderItem.product_id, Product.name, Product.sku, Product.cover_url
    ).order_by(func.sum(OrderItem.quantity).desc()).limit(5).all()
    
    top_products = [
        {
            "product_id": tp.product_id,
            "title": tp.title,
            "sku": tp.sku,
            "image_url": tp.image_url,
            "total_bought": float(tp.total_qty)
        } for tp in top_products_query
    ]

    return {
        "status": customer.crm_status,
        "rfm": {
            "recency_days": recency_days,
            "frequency_total": total_orders,
            "monetary_ltv": ltv,
            "average_ticket": average_ticket,
            "last_purchase_date": last_purchase.isoformat() if last_purchase else None
        },
        "recommendations": top_products
    }

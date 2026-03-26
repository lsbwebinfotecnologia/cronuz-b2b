from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from app.db.session import engine, get_db, SessionLocal
from app.models import company as company_models
from app.models import user as user_models
from app.models import customer as customer_models
from app.models import company_settings as settings_models
from app.models import product as product_models
from app.models import catalog_support as catalog_models
from app.models import marketing_showcase as marketing_models
from app.models import marketing_navigation as marketing_nav_models
from app.models import subscription as subscription_models
from app.models import lead as lead_models
from app.models import system_integrator as system_integrator_models
from app.schemas import company as schemas
from app.schemas import user as user_schemas
from app.schemas import company_settings as settings_schemas
from app.api import horus
from app.api import auth
from app.api import customers
from app.api import products
from app.api import catalog_support
from app.api import promotions
from app.api import marketing_showcases
from app.api import marketing_navigation
from app.api import storefront
from app.api import upload
from app.api import dashboard
from app.api import orders
from app.api import subscriptions
from app.api import leads
from app.api import company_notes
from app.api import integrators
from app.api import customer_auth
from app.api import customer_portal
from app.api import system_integrators
from app.api import bookinfo_hub
from app.core import security
from app.core import dependencies
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles
import os

# Create tables for both company and user
company_models.Base.metadata.create_all(bind=engine)
user_models.Base.metadata.create_all(bind=engine)
customer_models.Base.metadata.create_all(bind=engine)
settings_models.Base.metadata.create_all(bind=engine)
product_models.Base.metadata.create_all(bind=engine)
catalog_models.Base.metadata.create_all(bind=engine)
marketing_models.Base.metadata.create_all(bind=engine)
subscription_models.Base.metadata.create_all(bind=engine)
lead_models.Base.metadata.create_all(bind=engine)
system_integrator_models.Base.metadata.create_all(bind=engine)
marketing_nav_models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Cronuz B2B API", version="0.1.0")

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    import json
    body = await request.body()
    try:
        body_text = body.decode()
    except:
        body_text = str(body)
    error_msg = f"Validation Error!\nBody: {body_text}\nErrors: {exc.errors()}"
    print(error_msg, flush=True)
    with open("/tmp/pydantic_error.log", "w") as f:
        f.write(error_msg)
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": body_text},
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    err_msg = traceback.format_exc()
    print("GLOBAL ERROR:", err_msg, flush=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "traceback": err_msg},
    )

# Enable CORS for Next.js frontend (Allow all origins for Multitenant Custom Domains)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, tags=["authentication"])
app.include_router(horus.router, tags=["inventory"])
app.include_router(customers.router, tags=["customers"])
app.include_router(products.router, tags=["products"])
app.include_router(catalog_support.router, tags=["catalog-metadata"])
app.include_router(promotions.router, tags=["promotions"])
app.include_router(marketing_showcases.router, tags=["marketing"])
app.include_router(marketing_navigation.router, prefix="/marketing-navigation", tags=["marketing-navigation"])
app.include_router(storefront.router, tags=["storefront"])
app.include_router(upload.router, tags=["upload"])
app.include_router(dashboard.router, tags=["dashboard"])
app.include_router(orders.router, tags=["orders"])
app.include_router(subscriptions.router, tags=["subscriptions"])
app.include_router(leads.router, tags=["leads"])
app.include_router(company_notes.router, prefix="/company-notes", tags=["company-notes"])
app.include_router(integrators.router, prefix="/integrators", tags=["integrators"])
app.include_router(system_integrators.router, prefix="/system-integrators", tags=["system-integrators"])
app.include_router(bookinfo_hub.router, tags=["bookinfo"])

# Mount static files directory
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

@app.on_event("startup")
def seed_master_user():
    db = SessionLocal()
    try:
        master_email = "system@cronuz.com.br"
        existing_master = db.query(user_models.User).filter(user_models.User.email == master_email).first()
        if not existing_master:
            master_user = user_models.User(
                name="Cronuz Master System",
                email=master_email,
                type=user_models.UserRole.MASTER,
                password_hash=security.get_password_hash("C1r2o34@9182"),
                company_id=None
            )
            db.add(master_user)
            db.commit()
            print("INFO:     Master user seeded successfully")
    finally:
        db.close()

@app.get("/")
def read_root():
    return {"message": "Cronuz B2B API is running."}

@app.post("/companies", response_model=schemas.Company)
def create_company(
    company: schemas.CompanyCreate, 
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.require_master_user)
):
    company_data = company.model_dump()
    lead_id = company_data.pop("lead_id", None)
    
    # Partner Masters can only create companies within their own tenant
    if current_user.type == user_models.UserRole.MASTER and current_user.tenant_id and current_user.tenant_id != "cronuz":
        company_data["tenant_id"] = current_user.tenant_id
        
    db_company = company_models.Company(**company_data)
    db.add(db_company)
    db.commit()
    db.refresh(db_company)
    
    if lead_id:
        from app.models.lead import Lead
        lead = db.query(Lead).filter(Lead.id == lead_id).first()
        if lead:
            lead.company_id = db_company.id
            db.commit()
            
    return db_company

@app.get("/companies", response_model=list[schemas.Company])
def read_companies(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user)
):
    query = db.query(company_models.Company)
    
    if current_user.type == user_models.UserRole.MASTER and current_user.tenant_id and current_user.tenant_id != "cronuz":
        query = query.filter(company_models.Company.tenant_id == current_user.tenant_id)
    elif current_user.type != user_models.UserRole.MASTER:
        query = query.filter(company_models.Company.id == current_user.company_id)
        
    companies = query.offset(skip).limit(limit).all()
    return companies

@app.post("/users", response_model=user_schemas.User)
def create_user(
    user: user_schemas.UserCreate, 
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user)
):
    # Master can't be linked to a company
    if user.type == user_models.UserRole.MASTER and user.company_id is not None:
         raise HTTPException(status_code=400, detail="MASTER users cannot belong to a company")
         
    # Sellers, Customers, Agents MUST be linked to a company
    if user.type in [user_models.UserRole.SELLER, user_models.UserRole.CUSTOMER, user_models.UserRole.AGENT] and user.company_id is None:
         raise HTTPException(status_code=400, detail="This user type must belong to a company")

    user_data = user.model_dump()
    password = user_data.pop("password")
    
    # Restrict Partner Masters from creating Global Masters or users outside their tenant
    if current_user.type == user_models.UserRole.MASTER and current_user.tenant_id and current_user.tenant_id != "cronuz":
        if user_data.get("type") == user_models.UserRole.MASTER:
            # Force the new Master to have the same partner tenant
            user_data["tenant_id"] = current_user.tenant_id
            
    db_user = user_models.User(**user_data, password_hash=security.get_password_hash(password))
    
    try:
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="Constraint failed: Unique email or document by type and company")

@app.get("/users", response_model=list[user_schemas.User])
def read_users(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.require_master_user)
):
    query = db.query(user_models.User)
    
    # Partner Masters should only see users from companies belonging to their tenant, or other partner masters of their tenant
    if current_user.tenant_id and current_user.tenant_id != "cronuz":
        from app.models.company import Company
        query = query.outerjoin(Company, user_models.User.company_id == Company.id)
        query = query.filter(
            (Company.tenant_id == current_user.tenant_id) | 
            ((user_models.User.type == user_models.UserRole.MASTER) & (user_models.User.tenant_id == current_user.tenant_id))
        )
        
    users = query.offset(skip).limit(limit).all()
    return users

# User password and status update schemas
class UserPasswordUpdate(BaseModel):
    password: str

class StatusUpdate(BaseModel):
    active: bool

class ModuleUpdate(BaseModel):
    module_b2b_native: bool
    module_horus_erp: bool
    module_products: bool
    module_customers: bool
    module_marketing: bool
    module_subscriptions: bool
    module_pdv: bool
    module_agents: bool

@app.patch("/users/{user_id}/status", response_model=user_schemas.User)
def update_user_status(
    user_id: int,
    status_update: StatusUpdate,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user)
):
    user = db.query(user_models.User).filter(user_models.User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    # Restrict permissions: MASTER can edit anyone. SELLER can edit CUSTOMERS/AGENTS within same company.
    if current_user.type != user_models.UserRole.MASTER:
       if current_user.company_id != user.company_id or current_user.type != user_models.UserRole.SELLER or user.type in [user_models.UserRole.MASTER, user_models.UserRole.SELLER]:
           raise HTTPException(status_code=403, detail="Sem permissão para alterar este usuário")

    user.active = status_update.active
    db.commit()
    db.refresh(user)
    return user

@app.patch("/users/{user_id}/password")
def update_user_password(
    user_id: int,
    password_update: UserPasswordUpdate,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user)
):
    user = db.query(user_models.User).filter(user_models.User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    if current_user.type != user_models.UserRole.MASTER:
       if current_user.company_id != user.company_id or current_user.type != user_models.UserRole.SELLER or user.type in [user_models.UserRole.MASTER, user_models.UserRole.SELLER]:
           raise HTTPException(status_code=403, detail="Sem permissão para alterar este usuário")

    user.password_hash = security.get_password_hash(password_update.password)
    db.commit()
    return {"message": "Senha atualizada com sucesso"}

@app.patch("/users/{user_id}/email")
def update_user_email(
    user_id: int,
    email_update: user_schemas.UserEmailUpdate,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user)
):
    from sqlalchemy.exc import IntegrityError
    user = db.query(user_models.User).filter(user_models.User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    if current_user.type != user_models.UserRole.MASTER:
       if current_user.company_id != user.company_id or current_user.type != user_models.UserRole.SELLER or user.type in [user_models.UserRole.MASTER, user_models.UserRole.SELLER]:
           raise HTTPException(status_code=403, detail="Sem permissão para alterar este usuário")

    user.email = email_update.email
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Este e-mail já está em uso por outro usuário deste tipo/empresa.")
    return {"message": "E-mail atualizado com sucesso"}

@app.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user)
):
    from sqlalchemy.exc import IntegrityError
    user = db.query(user_models.User).filter(user_models.User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    # Only MASTER or SELLER can delete. SELLER can't delete MASTER or users from another company
    if current_user.type != user_models.UserRole.MASTER:
        if current_user.company_id != user.company_id or current_user.type != user_models.UserRole.SELLER or user.type in [user_models.UserRole.MASTER, user_models.UserRole.SELLER]:
           raise HTTPException(status_code=403, detail="Sem permissão para excluir este usuário")

    # Prevent deleting yourself
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Você não pode excluir a si mesmo.")

    try:
        db.delete(user)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Não é possível excluir este usuário pois ele possui histórico vinculados (ex: Pedidos, Interações). Desative-o em vez disso.")
    return {"message": "Usuário excluído com sucesso."}

@app.get("/companies/{company_id}", response_model=schemas.Company)
def read_company(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user)
):
    company = db.query(company_models.Company).filter(company_models.Company.id == company_id).first()
    if company is None:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    return company

@app.put("/companies/{company_id}", response_model=schemas.Company)
def update_company(
    company_id: int,
    company_update: schemas.CompanyUpdate,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user)
):
    company = db.query(company_models.Company).filter(company_models.Company.id == company_id).first()
    if company is None:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
        
    if current_user.type != user_models.UserRole.MASTER and current_user.company_id != company_id:
        raise HTTPException(status_code=403, detail="Não autorizado")
        
    update_data = company_update.model_dump(exclude_unset=True)
    
    # Handle empty strings to avoid Postgres UNIQUE constraint errors
    for field in ["custom_domain", "login_background_url", "logo", "zip_code", "street", "number", "complement", "neighborhood", "city", "state"]:
        if field in update_data and update_data[field] == "":
            update_data[field] = None
            
    for key, value in update_data.items():
        setattr(company, key, value)
        
    db.commit()
    db.refresh(company)
    return company

# FastAPI can auto-infer simple parameters from query if not specified, but let's use generic Pydantic or Request body.

@app.patch("/companies/{company_id}/status", response_model=schemas.Company)
def update_company_status(
    company_id: int,
    status_update: StatusUpdate,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.require_master_user)
):
    company = db.query(company_models.Company).filter(company_models.Company.id == company_id).first()
    if company is None:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    company.active = status_update.active
    db.commit()
    db.refresh(company)
    return company

@app.patch("/companies/{company_id}/modules", response_model=schemas.Company)
def update_company_modules(
    company_id: int,
    module_update: ModuleUpdate,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user)
):
    if current_user.type != user_models.UserRole.MASTER and current_user.company_id != company_id:
        raise HTTPException(status_code=403, detail="Sem permissão para alterar os módulos desta empresa")
        
    company = db.query(company_models.Company).filter(company_models.Company.id == company_id).first()
    if company is None:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    
    company.module_b2b_native = module_update.module_b2b_native
    company.module_horus_erp = module_update.module_horus_erp
    company.module_products = module_update.module_products
    company.module_customers = module_update.module_customers
    company.module_marketing = module_update.module_marketing
    company.module_subscriptions = module_update.module_subscriptions
    company.module_pdv = module_update.module_pdv
    company.module_agents = module_update.module_agents
    
    db.commit()
    db.refresh(company)
    return company

@app.get("/companies/{company_id}/users", response_model=list[user_schemas.User])
def read_company_users(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user)
):
    users = db.query(user_models.User).filter(user_models.User.company_id == company_id).all()
    return users

@app.get("/companies/{company_id}/agents", response_model=list[user_schemas.User])
def read_company_agents(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user)
):
    if current_user.type not in [user_models.UserRole.MASTER, user_models.UserRole.SELLER]:
        raise HTTPException(status_code=403, detail="Acesso restrito")
    if current_user.type == user_models.UserRole.SELLER and current_user.company_id != company_id:
        raise HTTPException(status_code=403, detail="Acesso restrito a esta empresa")
        
    agents = db.query(user_models.User).filter(
        user_models.User.company_id == company_id,
        user_models.User.type == user_models.UserRole.AGENT
    ).all()
    return agents

@app.get("/companies/{company_id}/settings", response_model=settings_schemas.CompanySettings)
def read_company_settings(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user)
):
    if current_user.type != user_models.UserRole.MASTER and current_user.company_id != company_id:
        raise HTTPException(status_code=403, detail="Sem permissão para ler as configurações desta empresa")
        
    settings = db.query(settings_models.CompanySettings).filter(settings_models.CompanySettings.company_id == company_id).first()
    if not settings:
        # Auto-create if not exists
        settings = settings_models.CompanySettings(company_id=company_id)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings

@app.put("/companies/{company_id}/settings", response_model=settings_schemas.CompanySettings)
def update_company_settings(
    company_id: int,
    settings_update: settings_schemas.CompanySettingsUpdate,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user)
):
    if current_user.type != user_models.UserRole.MASTER and current_user.company_id != company_id:
        raise HTTPException(status_code=403, detail="Sem permissão para alterar as configurações desta empresa")

    settings = db.query(settings_models.CompanySettings).filter(settings_models.CompanySettings.company_id == company_id).first()
    if not settings:
         settings = settings_models.CompanySettings(company_id=company_id)
         db.add(settings)
    
    # Update fields
    update_data = settings_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(settings, key, value)
        
    db.commit()
    db.refresh(settings)
    return settings

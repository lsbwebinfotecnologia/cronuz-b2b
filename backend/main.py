from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from app.db.session import engine, get_db, SessionLocal
from app.models import company as company_models
from app.models import user as user_models
from app.schemas import company as schemas
from app.schemas import user as user_schemas
from app.api import horus
from app.api import auth
from app.core import security
from app.core import dependencies
from pydantic import BaseModel

# Create tables for both company and user
company_models.Base.metadata.create_all(bind=engine)
user_models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Cronuz B2B API", version="0.1.0")

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, tags=["authentication"])
app.include_router(horus.router, tags=["inventory"])

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
    db_company = company_models.Company(**company.model_dump())
    db.add(db_company)
    db.commit()
    db.refresh(db_company)
    return db_company

@app.get("/companies", response_model=list[schemas.Company])
def read_companies(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user)
):
    companies = db.query(company_models.Company).offset(skip).limit(limit).all()
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

    # Hash password properly
    user_data = user.model_dump()
    password = user_data.pop("password")
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
    users = db.query(user_models.User).offset(skip).limit(limit).all()
    return users

# User password and status update schemas
class UserPasswordUpdate(BaseModel):
    password: str

class StatusUpdate(BaseModel):
    active: bool

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
       if current_user.company_id != user.company_id or current_user.type != user_models.UserRole.SELLER or user.type == user_models.UserRole.MASTER:
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
       if current_user.company_id != user.company_id or current_user.type != user_models.UserRole.SELLER or user.type == user_models.UserRole.MASTER:
           raise HTTPException(status_code=403, detail="Sem permissão para alterar este usuário")

    user.password_hash = security.get_password_hash(password_update.password)
    db.commit()
    return {"message": "Senha atualizada com sucesso"}

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

@app.get("/companies/{company_id}/users", response_model=list[user_schemas.User])
def read_company_users(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user)
):
    users = db.query(user_models.User).filter(user_models.User.company_id == company_id).all()
    return users

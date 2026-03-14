from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from app.db.session import engine, get_db
from app.models import company as company_models
from app.models import user as user_models
from app.schemas import company as schemas
from app.schemas import user as user_schemas
from app.api import horus

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

app.include_router(horus.router, tags=["inventory"])

@app.get("/")
def read_root():
    return {"message": "Cronuz B2B API is running."}

@app.post("/companies", response_model=schemas.Company)
def create_company(company: schemas.CompanyCreate, db: Session = Depends(get_db)):
    db_company = company_models.Company(**company.model_dump())
    db.add(db_company)
    db.commit()
    db.refresh(db_company)
    return db_company

@app.get("/companies", response_model=list[schemas.Company])
def read_companies(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    companies = db.query(company_models.Company).offset(skip).limit(limit).all()
    return companies

@app.post("/users", response_model=user_schemas.User)
def create_user(user: user_schemas.UserCreate, db: Session = Depends(get_db)):
    # Master can't be linked to a company
    if user.type == user_models.UserRole.MASTER and user.company_id is not None:
         raise HTTPException(status_code=400, detail="MASTER users cannot belong to a company")
         
    # Sellers, Customers, Agents MUST be linked to a company
    if user.type in [user_models.UserRole.SELLER, user_models.UserRole.CUSTOMER, user_models.UserRole.AGENT] and user.company_id is None:
         raise HTTPException(status_code=400, detail="This user type must belong to a company")

    # TODO: Hash password properly in the future
    user_data = user.model_dump()
    password = user_data.pop("password")
    db_user = user_models.User(**user_data, password_hash=f"hashed_{password}")
    
    try:
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="Constraint failed: Unique email or document by type and company")

@app.get("/users", response_model=list[user_schemas.User])
def read_users(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    users = db.query(user_models.User).offset(skip).limit(limit).all()
    return users

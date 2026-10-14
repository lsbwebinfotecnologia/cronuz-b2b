from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import Optional, List
from pydantic import BaseModel

from app.db.session import get_db
from app.models import user as user_models
from app.schemas import user as user_schemas
from app.core import security
from app.core import dependencies

router = APIRouter(tags=["users"])

class UserPasswordUpdate(BaseModel):
    password: str

class StatusUpdate(BaseModel):
    active: bool


@router.post("/users", response_model=user_schemas.User)
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


@router.get("/users", response_model=List[user_schemas.User])
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


@router.get("/users/{user_id}", response_model=user_schemas.User)
def get_user_by_id(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user)
):
    user = db.query(user_models.User).filter(user_models.User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if current_user.type != user_models.UserRole.MASTER and current_user.company_id != user.company_id:
        raise HTTPException(status_code=403, detail="Sem permissão para acessar este usuário")
    return user


@router.put("/users/{user_id}", response_model=user_schemas.User)
def update_user_details(
    user_id: int,
    user_update: user_schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user)
):
    user = db.query(user_models.User).filter(user_models.User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    if current_user.type != user_models.UserRole.MASTER:
        if current_user.company_id != user.company_id or current_user.type != user_models.UserRole.SELLER:
            raise HTTPException(status_code=403, detail="Sem permissão para alterar este usuário")

    update_data = user_update.model_dump(exclude_unset=True)
    password = update_data.pop("password", None)
    if password:
        user.password_hash = security.get_password_hash(password)

    for field, value in update_data.items():
        setattr(user, field, value)

    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}/status", response_model=user_schemas.User)
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


@router.patch("/users/{user_id}/password")
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


@router.patch("/users/{user_id}/email")
def update_user_email(
    user_id: int,
    email_update: user_schemas.UserEmailUpdate,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user)
):
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


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user)
):
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


@router.get("/companies/{company_id}/users")
def read_company_users(
    company_id: int,
    skip: int = 0,
    limit: int = 100,
    role: str = None,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user)
):
    query = db.query(user_models.User).filter(user_models.User.company_id == company_id)
    if role:
        query = query.filter(user_models.User.type == role)
        
    total = query.count()
    users = query.offset(skip).limit(limit).all()
    
    # Manually serialize to avoid password hash leakage since we removed response_model
    items = [user_schemas.User.model_validate(u).model_dump() for u in users]
    
    return {"items": items, "total": total}


@router.get("/companies/{company_id}/agents", response_model=List[user_schemas.User])
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

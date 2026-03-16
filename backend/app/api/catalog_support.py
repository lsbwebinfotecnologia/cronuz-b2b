from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List

from app.db.session import get_db
from app.models.catalog_support import Category, Brand, Characteristic
from app.schemas.catalog_support import (
    CategoryCreate, CategoryUpdate, CategoryResponse,
    BrandCreate, BrandUpdate, BrandResponse,
    CharacteristicCreate, CharacteristicUpdate, CharacteristicResponse
)
from app.core.dependencies import get_current_user
from app.models.user import User

router = APIRouter(tags=["catalog-metadata"])

# --- Categories ---

@router.post("/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(
    item_in: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="User without company")
        
    db_item = Category(**item_in.dict(), company_id=current_user.company_id)
    db.add(db_item)
    try:
        db.commit()
        db.refresh(db_item)
        return db_item
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Categoria com este nome já existe nesta empresa.")

@router.get("/categories", response_model=List[CategoryResponse])
def get_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.company_id:
        return []
    return db.query(Category).filter(Category.company_id == current_user.company_id).order_by(Category.name.asc()).all()

@router.patch("/categories/{item_id}", response_model=CategoryResponse)
def update_category(
    item_id: int,
    item_in: CategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="User without company")
        
    db_item = db.query(Category).filter(Category.id == item_id, Category.company_id == current_user.company_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Category not found")
        
    update_data = item_in.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_item, field, value)
        
    try:
        db.commit()
        db.refresh(db_item)
        return db_item
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Categoria com este nome já existe nesta empresa.")

# --- Brands ---

@router.post("/brands", response_model=BrandResponse, status_code=status.HTTP_201_CREATED)
def create_brand(
    item_in: BrandCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="User without company")
        
    db_item = Brand(**item_in.dict(), company_id=current_user.company_id)
    db.add(db_item)
    try:
        db.commit()
        db.refresh(db_item)
        return db_item
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Marca com este nome já existe nesta empresa.")

@router.get("/brands", response_model=List[BrandResponse])
def get_brands(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.company_id:
        return []
    return db.query(Brand).filter(Brand.company_id == current_user.company_id).order_by(Brand.name.asc()).all()

@router.patch("/brands/{item_id}", response_model=BrandResponse)
def update_brand(
    item_id: int,
    item_in: BrandUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="User without company")
        
    db_item = db.query(Brand).filter(Brand.id == item_id, Brand.company_id == current_user.company_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Brand not found")
        
    update_data = item_in.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_item, field, value)
        
    try:
        db.commit()
        db.refresh(db_item)
        return db_item
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Marca com este nome já existe nesta empresa.")

# --- Characteristics ---

@router.post("/characteristics", response_model=CharacteristicResponse, status_code=status.HTTP_201_CREATED)
def create_characteristic(
    item_in: CharacteristicCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="User without company")
        
    db_item = Characteristic(**item_in.dict(), company_id=current_user.company_id)
    db.add(db_item)
    try:
        db.commit()
        db.refresh(db_item)
        return db_item
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Característica com este nome já existe nesta empresa.")

@router.get("/characteristics", response_model=List[CharacteristicResponse])
def get_characteristics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.company_id:
        return []
    return db.query(Characteristic).filter(Characteristic.company_id == current_user.company_id).order_by(Characteristic.name.asc()).all()

@router.patch("/characteristics/{item_id}", response_model=CharacteristicResponse)
def update_characteristic(
    item_id: int,
    item_in: CharacteristicUpdate, # We will import it from schemas later, wait I need to import it at the top
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="User without company")
        
    db_item = db.query(Characteristic).filter(Characteristic.id == item_id, Characteristic.company_id == current_user.company_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Characteristic not found")
        
    update_data = item_in.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_item, field, value)
        
    try:
        db.commit()
        db.refresh(db_item)
        return db_item
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Característica com este nome já existe nesta empresa.")

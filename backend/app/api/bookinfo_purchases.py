from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.models.user import User
from app.core.dependencies import get_current_user
from app.models.bookinfo_supplier import BookinfoSupplier
from app.schemas.bookinfo_supplier import SupplierCreate, SupplierUpdate, SupplierResponse

router = APIRouter(prefix="/bookinfo-purchases/suppliers", tags=["bookinfo_purchases"])

@router.get("", response_model=List[SupplierResponse])
def get_suppliers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in ["MASTER", "SELLER"]:
        raise HTTPException(status_code=403, detail="Acesso não autorizado")
    
    suppliers = db.query(BookinfoSupplier).filter(BookinfoSupplier.company_id == current_user.company_id).all()
    return suppliers

@router.post("", response_model=SupplierResponse)
def create_supplier(
    supplier_in: SupplierCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in ["MASTER", "SELLER"]:
        raise HTTPException(status_code=403, detail="Acesso não autorizado")

    new_supplier = BookinfoSupplier(
        company_id=current_user.company_id,
        supplier_name=supplier_in.supplier_name,
        document_origin=supplier_in.document_origin,
        document_destination=supplier_in.document_destination,
        start_date=supplier_in.start_date
    )
    db.add(new_supplier)
    db.commit()
    db.refresh(new_supplier)
    return new_supplier

@router.put("/{supplier_id}", response_model=SupplierResponse)
def update_supplier(
    supplier_id: int,
    supplier_in: SupplierUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in ["MASTER", "SELLER"]:
        raise HTTPException(status_code=403, detail="Acesso não autorizado")

    supplier = db.query(BookinfoSupplier).filter(
        BookinfoSupplier.id == supplier_id,
        BookinfoSupplier.company_id == current_user.company_id
    ).first()

    if not supplier:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado.")

    if supplier_in.supplier_name is not None:
        supplier.supplier_name = supplier_in.supplier_name
    if supplier_in.document_origin is not None:
        supplier.document_origin = supplier_in.document_origin
    if supplier_in.document_destination is not None:
        supplier.document_destination = supplier_in.document_destination
    if supplier_in.start_date is not None:
        supplier.start_date = supplier_in.start_date

    db.commit()
    db.refresh(supplier)
    return supplier

@router.delete("/{supplier_id}", response_model=dict)
def delete_supplier(
    supplier_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in ["MASTER", "SELLER"]:
        raise HTTPException(status_code=403, detail="Acesso não autorizado")

    supplier = db.query(BookinfoSupplier).filter(
        BookinfoSupplier.id == supplier_id,
        BookinfoSupplier.company_id == current_user.company_id
    ).first()

    if not supplier:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado.")

    db.delete(supplier)
    db.commit()
    return {"status": "success", "message": "Fornecedor deletado."}

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.print_point import PrintPoint, DocumentType
from app.models.company import Company
from app.schemas.print_point import PrintPointCreate, PrintPointUpdate, PrintPointResponse

router = APIRouter()

@router.get("", response_model=List[PrintPointResponse])
def get_print_points(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    points = db.query(PrintPoint).filter(PrintPoint.company_id == current_user.company_id).all()
    return points

@router.post("", response_model=PrintPointResponse)
def create_print_point(
    point_in: PrintPointCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        # Validate ENUM roughly to avoid SQL errors
        _ = DocumentType(point_in.document_type)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid Document Type")

    new_point = PrintPoint(
        company_id=current_user.company_id,
        name=point_in.name,
        document_type=point_in.document_type,
        is_service=point_in.is_service,
        is_electronic=point_in.is_electronic,
        current_number=point_in.current_number,
        is_active=point_in.is_active
    )
    db.add(new_point)
    db.commit()
    db.refresh(new_point)
    return new_point

@router.put("/{point_id}", response_model=PrintPointResponse)
def update_print_point(
    point_id: int,
    point_in: PrintPointUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    point = db.query(PrintPoint).filter(
        PrintPoint.id == point_id,
        PrintPoint.company_id == current_user.company_id
    ).first()
    
    if not point:
        raise HTTPException(status_code=404, detail="Ponto não encontrado")

    update_data = point_in.dict(exclude_unset=True)
    if "document_type" in update_data:
        try:
             _ = DocumentType(update_data["document_type"])
        except ValueError:
             raise HTTPException(status_code=400, detail="Invalid Document Type")
             
    for field, value in update_data.items():
        setattr(point, field, value)

    db.commit()
    db.refresh(point)
    return point

@router.delete("/{point_id}")
def delete_print_point(
    point_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    point = db.query(PrintPoint).filter(
        PrintPoint.id == point_id,
        PrintPoint.company_id == current_user.company_id
    ).first()
    
    if not point:
        raise HTTPException(status_code=404, detail="Ponto não encontrado")

    # Rather than hard delete, we could set is_active=False, but let's allow hard delete if no relations exist.
    # To be safer with FKs:
    point.is_active = False
    db.commit()
    return {"status": "success", "message": "Ponto de Impressão desativado."}

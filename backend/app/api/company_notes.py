from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.models.company_note import CompanyNote
from app.models.user import User
from app.schemas.company_note import CompanyNoteCreate, CompanyNoteResponse, CompanyNoteUpdate
from app.core.dependencies import get_current_user

router = APIRouter()

@router.get("/{company_id}", response_model=List[CompanyNoteResponse])
def get_company_notes(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    notes = db.query(CompanyNote).filter(CompanyNote.company_id == company_id).order_by(CompanyNote.created_at.desc()).all()
    return notes

@router.post("/", response_model=CompanyNoteResponse)
def create_company_note(
    note_in: CompanyNoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    new_note = CompanyNote(
        company_id=note_in.company_id,
        author_id=current_user.id,
        content=note_in.content
    )
    db.add(new_note)
    db.commit()
    db.refresh(new_note)
    return new_note

@router.put("/{note_id}", response_model=CompanyNoteResponse)
def update_company_note(
    note_id: int,
    note_in: CompanyNoteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    note = db.query(CompanyNote).filter(CompanyNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Nota não encontrada.")
    
    # Only master or the author can edit
    if current_user.type != "MASTER" and note.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Você não tem permissão para editar esta nota.")
        
    note.content = note_in.content
    db.commit()
    db.refresh(note)
    return note

@router.delete("/{note_id}")
def delete_company_note(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    note = db.query(CompanyNote).filter(CompanyNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Nota não encontrada.")
    
    # Only master or the author can delete
    if current_user.type != "MASTER" and note.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Você não tem permissão para excluir esta nota.")
        
    db.delete(note)
    db.commit()
    return {"message": "Nota excluída com sucesso."}

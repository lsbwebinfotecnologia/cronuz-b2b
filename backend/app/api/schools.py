from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import List, Optional
import logging

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.core.utils import assert_company_ownership
from app.models.user import User
from app.models.customer import Customer, Address
from app.models.school import SchoolDetail, SchoolClass, SchoolEvent
from app.models.order import Order
from app.schemas.school import (
    SchoolCreate, SchoolUpdate, SchoolListItem, SchoolClassCreate, SchoolClassUpdate, 
    SchoolClassResponse, SchoolDetailBase, SchoolDetailUpdate
)

_logger = logging.getLogger("cronuz.schools")

router = APIRouter(prefix="/companies/{company_id}/schools", tags=["schools"])

@router.get("", response_model=List[SchoolListItem])
def list_schools(
    company_id: int,
    search: Optional[str] = Query(None, description="Busca por nome, documento ou cidade"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)

    # Buscar customers que são do tipo 'ESCOLA' ou possuem registro em sch_school_detail
    query = (
        db.query(
            Customer.id,
            Customer.name,
            Customer.corporate_name,
            Customer.document,
            Customer.email,
            Customer.phone,
            SchoolDetail.coordinator_name,
            SchoolDetail.reference_code
        )
        .outerjoin(SchoolDetail, (SchoolDetail.customer_id == Customer.id) & (SchoolDetail.company_id == company_id))
        .filter(Customer.company_id == company_id)
        .filter(or_(Customer.customer_type == "ESCOLA", SchoolDetail.id != None))
    )

    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Customer.name.ilike(s),
                Customer.corporate_name.ilike(s),
                Customer.document.ilike(s),
                SchoolDetail.reference_code.ilike(s)
            )
        )

    rows = query.order_by(Customer.name.asc()).all()
    if not rows:
        return []

    customer_ids = [r.id for r in rows]

    # Agregação única para contagem de turmas (evita N+1)
    classes_counts = dict(
        db.query(SchoolClass.school_customer_id, func.count(SchoolClass.id))
        .filter(SchoolClass.company_id == company_id, SchoolClass.school_customer_id.in_(customer_ids), SchoolClass.active == True)
        .group_by(SchoolClass.school_customer_id)
        .all()
    )

    # Agregação única para contagem de eventos ativos (evita N+1)
    events_counts = dict(
        db.query(SchoolEvent.school_customer_id, func.count(SchoolEvent.id))
        .filter(SchoolEvent.company_id == company_id, SchoolEvent.school_customer_id.in_(customer_ids))
        .group_by(SchoolEvent.school_customer_id)
        .all()
    )

    # Buscar endereços principais
    addresses = dict(
        db.query(Address.customer_id, Address.city, Address.state)
        .filter(Address.customer_id.in_(customer_ids))
        .all()
    )

    result = []
    for r in rows:
        addr = addresses.get(r.id)
        city = addr[0] if addr else None
        state = addr[1] if addr else None

        result.append(SchoolListItem(
            id=r.id,
            name=r.name,
            corporate_name=r.corporate_name,
            document=r.document,
            reference_code=r.reference_code,
            email=r.email,
            phone=r.phone,
            city=city,
            state=state,
            classes_count=classes_counts.get(r.id, 0),
            active_events_count=events_counts.get(r.id, 0),
            coordinator_name=r.coordinator_name
        ))

    return result


@router.post("", status_code=status.HTTP_201_CREATED)
def create_school(
    company_id: int,
    payload: SchoolCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)

    # 1. Checar se já existe customer com mesmo documento na empresa
    clean_doc = payload.document.replace(".", "").replace("-", "").replace("/", "").strip()
    existing_customer = db.query(Customer).filter(
        Customer.company_id == company_id,
        Customer.document == clean_doc
    ).first()

    if existing_customer:
        customer = existing_customer
        customer.customer_type = "ESCOLA"
        if payload.name:
            customer.name = payload.name
        if payload.corporate_name:
            customer.corporate_name = payload.corporate_name
    else:
        customer = Customer(
            company_id=company_id,
            name=payload.name,
            corporate_name=payload.corporate_name or payload.name,
            document=clean_doc,
            customer_type="ESCOLA",
            email=payload.email,
            phone=payload.phone
        )
        db.add(customer)
        db.flush()

    # 2. Endereço
    if payload.street or payload.city:
        existing_addr = db.query(Address).filter(Address.customer_id == customer.id).first()
        if not existing_addr:
            address = Address(
                customer_id=customer.id,
                street=payload.street or "",
                number=payload.number or "S/N",
                complement=payload.complement,
                neighborhood=payload.neighborhood or "",
                city=payload.city or "",
                state=payload.state or "SP",
                zip_code=payload.zip_code or ""
            )
            db.add(address)
        else:
            if payload.street: existing_addr.street = payload.street
            if payload.number: existing_addr.number = payload.number
            if payload.complement is not None: existing_addr.complement = payload.complement
            if payload.neighborhood: existing_addr.neighborhood = payload.neighborhood
            if payload.city: existing_addr.city = payload.city
            if payload.state: existing_addr.state = payload.state
            if payload.zip_code: existing_addr.zip_code = payload.zip_code

    # 3. Detalhes pedagógicos da escola
    school_detail = db.query(SchoolDetail).filter(
        SchoolDetail.company_id == company_id,
        SchoolDetail.customer_id == customer.id
    ).first()

    if not school_detail:
        school_detail = SchoolDetail(
            company_id=company_id,
            customer_id=customer.id,
            inep_code=payload.inep_code,
            reference_code=payload.reference_code.strip() if payload.reference_code else None,
            principal_name=payload.principal_name,
            coordinator_name=payload.coordinator_name,
            pedagogical_contact_phone=payload.pedagogical_contact_phone,
            pedagogical_contact_email=payload.pedagogical_contact_email,
            notes=payload.notes
        )
        db.add(school_detail)
    else:
        school_detail.inep_code = payload.inep_code
        school_detail.reference_code = payload.reference_code.strip() if payload.reference_code else None
        school_detail.principal_name = payload.principal_name
        school_detail.coordinator_name = payload.coordinator_name
        school_detail.pedagogical_contact_phone = payload.pedagogical_contact_phone
        school_detail.pedagogical_contact_email = payload.pedagogical_contact_email
        school_detail.notes = payload.notes

    # 4. Turmas iniciais se enviadas
    if payload.initial_classes:
        for class_name in payload.initial_classes:
            name_clean = class_name.strip()
            if name_clean:
                exists_cls = db.query(SchoolClass).filter(
                    SchoolClass.company_id == company_id,
                    SchoolClass.school_customer_id == customer.id,
                    SchoolClass.name == name_clean
                ).first()
                if not exists_cls:
                    new_cls = SchoolClass(
                        company_id=company_id,
                        school_customer_id=customer.id,
                        name=name_clean,
                        shift="MANHA",
                        active=True
                    )
                    db.add(new_cls)

    db.commit()
    db.refresh(customer)

    return {"message": "Escola cadastrada com sucesso", "school_id": customer.id}


@router.get("/{school_id}")
def get_school_details(
    company_id: int,
    school_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)

    customer = db.query(Customer).filter(
        Customer.id == school_id,
        Customer.company_id == company_id
    ).first()

    if not customer:
        raise HTTPException(status_code=404, detail="Escola não encontrada.")

    detail = db.query(SchoolDetail).filter(
        SchoolDetail.customer_id == school_id,
        SchoolDetail.company_id == company_id
    ).first()

    address = db.query(Address).filter(Address.customer_id == school_id).first()

    classes = db.query(SchoolClass).filter(
        SchoolClass.school_customer_id == school_id,
        SchoolClass.company_id == company_id,
        SchoolClass.active == True
    ).order_by(SchoolClass.name.asc()).all()

    return {
        "id": customer.id,
        "name": customer.name,
        "corporate_name": customer.corporate_name,
        "document": customer.document,
        "email": customer.email,
        "phone": customer.phone,
        "address": {
            "street": address.street if address else None,
            "number": address.number if address else None,
            "complement": address.complement if address else None,
            "neighborhood": address.neighborhood if address else None,
            "city": address.city if address else None,
            "state": address.state if address else None,
            "zip_code": address.zip_code if address else None,
        } if address else None,
        "detail": {
            "inep_code": detail.inep_code if detail else None,
            "reference_code": detail.reference_code if detail else None,
            "principal_name": detail.principal_name if detail else None,
            "coordinator_name": detail.coordinator_name if detail else None,
            "pedagogical_contact_phone": detail.pedagogical_contact_phone if detail else None,
            "pedagogical_contact_email": detail.pedagogical_contact_email if detail else None,
            "notes": detail.notes if detail else None,
        } if detail else None,
        "classes": [
            {
                "id": c.id,
                "name": c.name,
                "grade": c.grade,
                "shift": c.shift,
                "academic_year": c.academic_year,
                "active": c.active
            }
            for c in classes
        ]
    }


@router.put("/{school_id}")
def update_school(
    company_id: int,
    school_id: int,
    payload: SchoolUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)

    customer = db.query(Customer).filter(
        Customer.id == school_id,
        Customer.company_id == company_id
    ).first()

    if not customer:
        raise HTTPException(status_code=404, detail="Escola não encontrada.")

    # 1. Atualizar dados gerais do cliente
    if payload.name is not None:
        customer.name = payload.name.strip()
    if payload.corporate_name is not None:
        customer.corporate_name = payload.corporate_name.strip()
    if payload.email is not None:
        customer.email = payload.email.strip() if payload.email else None
    if payload.phone is not None:
        customer.phone = payload.phone.strip() if payload.phone else None

    # 2. Atualizar endereço se enviado
    if any(k is not None for k in [payload.street, payload.number, payload.complement, payload.neighborhood, payload.city, payload.state, payload.zip_code]):
        address = db.query(Address).filter(Address.customer_id == school_id).first()
        if not address:
            address = Address(
                customer_id=school_id,
                street=payload.street or "",
                number=payload.number or "S/N",
                complement=payload.complement,
                neighborhood=payload.neighborhood or "",
                city=payload.city or "",
                state=payload.state or "SP",
                zip_code=payload.zip_code or ""
            )
            db.add(address)
        else:
            if payload.street is not None: address.street = payload.street
            if payload.number is not None: address.number = payload.number
            if payload.complement is not None: address.complement = payload.complement
            if payload.neighborhood is not None: address.neighborhood = payload.neighborhood
            if payload.city is not None: address.city = payload.city
            if payload.state is not None: address.state = payload.state
            if payload.zip_code is not None: address.zip_code = payload.zip_code

    # 3. Atualizar detalhes pedagógicos
    detail = db.query(SchoolDetail).filter(
        SchoolDetail.customer_id == school_id,
        SchoolDetail.company_id == company_id
    ).first()

    if not detail:
        detail = SchoolDetail(
            company_id=company_id,
            customer_id=school_id,
            inep_code=payload.inep_code,
            reference_code=payload.reference_code.strip() if payload.reference_code else None,
            principal_name=payload.principal_name,
            coordinator_name=payload.coordinator_name,
            pedagogical_contact_phone=payload.pedagogical_contact_phone,
            pedagogical_contact_email=payload.pedagogical_contact_email,
            notes=payload.notes
        )
        db.add(detail)
    else:
        if payload.inep_code is not None: detail.inep_code = payload.inep_code
        if payload.reference_code is not None: detail.reference_code = payload.reference_code.strip() if payload.reference_code else None
        if payload.principal_name is not None: detail.principal_name = payload.principal_name
        if payload.coordinator_name is not None: detail.coordinator_name = payload.coordinator_name
        if payload.pedagogical_contact_phone is not None: detail.pedagogical_contact_phone = payload.pedagogical_contact_phone
        if payload.pedagogical_contact_email is not None: detail.pedagogical_contact_email = payload.pedagogical_contact_email
        if payload.notes is not None: detail.notes = payload.notes

    db.commit()
    return {"message": "Escola e dados pedagógicos atualizados com sucesso."}


@router.delete("/{school_id}")
def delete_school(
    company_id: int,
    school_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)

    customer = db.query(Customer).filter(
        Customer.id == school_id,
        Customer.company_id == company_id
    ).first()

    if not customer:
        raise HTTPException(status_code=404, detail="Escola não encontrada.")

    # Validação de vínculos impeditivos:
    # 1. Checar se tem pedidos/movimentação comercial vinculada
    has_orders = db.query(Order).filter(
        (Order.customer_id == school_id) | (Order.school_customer_id == school_id),
        Order.company_id == company_id
    ).first()
    if has_orders:
        raise HTTPException(
            status_code=400,
            detail="Não é possível excluir esta escola pois existem pedidos e movimentações financeiras associadas a ela."
        )

    # 2. Checar se tem eventos vinculados
    has_events = db.query(SchoolEvent).filter(
        SchoolEvent.school_customer_id == school_id,
        SchoolEvent.company_id == company_id
    ).first()
    if has_events:
        raise HTTPException(
            status_code=400,
            detail=f"Não é possível excluir esta escola pois ela possui o evento '{has_events.title}' vinculado. Remova ou desvincule o evento primeiro."
        )

    # 3. Remover turmas (se existirem, sem alunos/pedidos vinculados)
    db.query(SchoolClass).filter(
        SchoolClass.school_customer_id == school_id,
        SchoolClass.company_id == company_id
    ).delete(synchronize_session=False)

    # 4. Remover detalhes pedagógicos
    db.query(SchoolDetail).filter(
        SchoolDetail.customer_id == school_id,
        SchoolDetail.company_id == company_id
    ).delete(synchronize_session=False)

    # 5. Remover endereço
    db.query(Address).filter(Address.customer_id == school_id).delete(synchronize_session=False)

    # 6. Remover registro do cliente (Escola)
    db.delete(customer)
    db.commit()

    return {"message": "Escola removida com sucesso."}


# ── GESTÃO DE TURMAS ──
@router.get("/{school_id}/classes", response_model=List[SchoolClassResponse])
def list_school_classes(
    company_id: int,
    school_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)

    classes = db.query(SchoolClass).filter(
        SchoolClass.school_customer_id == school_id,
        SchoolClass.company_id == company_id,
        SchoolClass.active == True
    ).order_by(SchoolClass.name.asc()).all()

    return classes


@router.post("/{school_id}/classes", response_model=SchoolClassResponse, status_code=status.HTTP_201_CREATED)
def create_school_class(
    company_id: int,
    school_id: int,
    payload: SchoolClassCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)

    # Validar que a escola existe e pertence à empresa
    school = db.query(Customer).filter(
        Customer.id == school_id,
        Customer.company_id == company_id
    ).first()
    if not school:
        raise HTTPException(status_code=404, detail="Escola não encontrada.")

    new_class = SchoolClass(
        company_id=company_id,
        school_customer_id=school_id,
        name=payload.name.strip(),
        grade=payload.grade,
        shift=payload.shift or "MANHA",
        academic_year=payload.academic_year or 2026,
        active=payload.active if payload.active is not None else True
    )
    db.add(new_class)
    db.commit()
    db.refresh(new_class)

    return new_class


@router.put("/{school_id}/classes/{class_id}", response_model=SchoolClassResponse)
def update_school_class(
    company_id: int,
    school_id: int,
    class_id: int,
    payload: SchoolClassUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)

    school_cls = db.query(SchoolClass).filter(
        SchoolClass.id == class_id,
        SchoolClass.school_customer_id == school_id,
        SchoolClass.company_id == company_id
    ).first()

    if not school_cls:
        raise HTTPException(status_code=404, detail="Turma não encontrada.")

    if payload.name is not None: school_cls.name = payload.name.strip()
    if payload.grade is not None: school_cls.grade = payload.grade
    if payload.shift is not None: school_cls.shift = payload.shift
    if payload.academic_year is not None: school_cls.academic_year = payload.academic_year
    if payload.active is not None: school_cls.active = payload.active

    db.commit()
    db.refresh(school_cls)
    return school_cls

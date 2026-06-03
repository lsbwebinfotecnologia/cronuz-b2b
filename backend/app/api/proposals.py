from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import Optional, List
from datetime import datetime, date

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.proposal import Proposal, ProposalItem
from app.models.customer import Customer, Address
from app.models.order import Order, OrderItem
from app.models.service import ServiceOrder
from app.models.lead import Lead

from app.schemas.proposal import (
    ProposalCreate,
    ProposalUpdate,
    ProposalResponse,
    ProposalConvertRequest,
    ProposalSignRequest,
    ProposalListResponse
)

router = APIRouter(prefix="/proposals", tags=["proposals"])

def check_proposals_enabled(current_user: User = Depends(get_current_user)):
    if not getattr(current_user.company, "module_proposals", False):
        raise HTTPException(status_code=403, detail="Módulo de Propostas desativado para esta empresa.")
    return current_user

@router.post("", response_model=ProposalResponse)
def create_proposal(
    payload: ProposalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(check_proposals_enabled)
):
    # Calculate sequential local_id per company
    max_local_id = db.query(func.max(Proposal.local_id)).filter(
        Proposal.company_id == current_user.company_id
    ).scalar() or 0
    local_id = max_local_id + 1

    # Validation
    if payload.relation_type == "CUSTOMER" and not payload.customer_id:
        raise HTTPException(status_code=400, detail="customer_id é obrigatório para relação do tipo CUSTOMER.")
    if payload.relation_type == "LEAD" and not payload.lead_id:
        raise HTTPException(status_code=400, detail="lead_id é obrigatório para relação do tipo LEAD.")
    if payload.relation_type == "MANUAL" and not payload.manual_name:
        raise HTTPException(status_code=400, detail="manual_name é obrigatório para relação do tipo MANUAL.")

    # Calculate subtotals
    subtotal = 0.0
    for item in payload.items:
        if item.item_type not in ["PRODUCT", "SERVICE"]:
            raise HTTPException(status_code=400, detail=f"item_type inválido: {item.item_type}")
        if item.item_type == "PRODUCT" and not item.product_id:
            raise HTTPException(status_code=400, detail="product_id é obrigatório para linhas de produto.")
        if item.item_type == "SERVICE" and not item.service_id:
            raise HTTPException(status_code=400, detail="service_id é obrigatório para linhas de serviço.")
        
        # Calculate item total
        item.total_price = round((item.quantity * item.unit_price) - item.discount, 2)
        subtotal += item.total_price

    total = round(subtotal - payload.discount + payload.shipping_cost, 2)

    # Create Proposal
    db_proposal = Proposal(
        company_id=current_user.company_id,
        local_id=local_id,
        title=payload.title,
        status="DRAFT",
        valid_from=payload.valid_from,
        valid_until=payload.valid_until,
        relation_type=payload.relation_type,
        customer_id=payload.customer_id,
        lead_id=payload.lead_id,
        manual_name=payload.manual_name,
        manual_document=payload.manual_document,
        manual_email=payload.manual_email,
        manual_phone=payload.manual_phone,
        subtotal=subtotal,
        discount=payload.discount,
        shipping_cost=payload.shipping_cost,
        total=total,
        payment_method=payload.payment_method,
        payment_condition=payload.payment_condition,
        notes=payload.notes
    )

    db.add(db_proposal)
    db.flush()

    # Create Items
    for item in payload.items:
        db_item = ProposalItem(
            proposal_id=db_proposal.id,
            item_type=item.item_type,
            product_id=item.product_id,
            service_id=item.service_id,
            quantity=item.quantity,
            unit_price=item.unit_price,
            discount=item.discount,
            total_price=item.total_price,
            custom_description=item.custom_description
        )
        db.add(db_item)

    db.commit()
    return db.query(Proposal).options(
        joinedload(Proposal.items).joinedload(ProposalItem.product),
        joinedload(Proposal.items).joinedload(ProposalItem.service),
        joinedload(Proposal.company)
    ).filter(Proposal.id == db_proposal.id).first()


@router.get("", response_model=ProposalListResponse)
def list_proposals(
    status: Optional[str] = None,
    relation_type: Optional[str] = None,
    customer_id: Optional[int] = None,
    lead_id: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(check_proposals_enabled)
):
    query = db.query(Proposal).filter(Proposal.company_id == current_user.company_id)

    if status:
        query = query.filter(Proposal.status == status)
    if relation_type:
        query = query.filter(Proposal.relation_type == relation_type)
    if customer_id:
        query = query.filter(Proposal.customer_id == customer_id)
    if lead_id:
        query = query.filter(Proposal.lead_id == lead_id)
    if search:
        query = query.filter(
            Proposal.title.ilike(f"%{search}%") |
            Proposal.manual_name.ilike(f"%{search}%")
        )

    total = query.count()
    proposals = query.order_by(Proposal.local_id.desc()).offset(skip).limit(limit).all()

    return {"items": proposals, "total": total}


@router.get("/{proposal_id}", response_model=ProposalResponse)
def get_proposal(
    proposal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(check_proposals_enabled)
):
    proposal = db.query(Proposal).options(
        joinedload(Proposal.items).joinedload(ProposalItem.product),
        joinedload(Proposal.items).joinedload(ProposalItem.service),
        joinedload(Proposal.company)
    ).filter(
        Proposal.id == proposal_id,
        Proposal.company_id == current_user.company_id
    ).first()
    
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposta não encontrada.")
    return proposal


@router.put("/{proposal_id}", response_model=ProposalResponse)
def update_proposal(
    proposal_id: int,
    payload: ProposalUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(check_proposals_enabled)
):
    proposal = db.query(Proposal).filter(
        Proposal.id == proposal_id,
        Proposal.company_id == current_user.company_id
    ).first()

    if not proposal:
        raise HTTPException(status_code=404, detail="Proposta não encontrada.")
    if proposal.status == "CONVERTED":
        raise HTTPException(status_code=400, detail="Uma proposta convertida não pode ser editada.")

    # Validation
    if payload.relation_type == "CUSTOMER" and not payload.customer_id:
        raise HTTPException(status_code=400, detail="customer_id é obrigatório para tipo CUSTOMER.")
    if payload.relation_type == "LEAD" and not payload.lead_id:
        raise HTTPException(status_code=400, detail="lead_id é obrigatório para tipo LEAD.")
    if payload.relation_type == "MANUAL" and not payload.manual_name:
        raise HTTPException(status_code=400, detail="manual_name é obrigatório para tipo MANUAL.")

    # Calculate subtotals
    subtotal = 0.0
    for item in payload.items:
        if item.item_type not in ["PRODUCT", "SERVICE"]:
            raise HTTPException(status_code=400, detail=f"item_type inválido: {item.item_type}")
        if item.item_type == "PRODUCT" and not item.product_id:
            raise HTTPException(status_code=400, detail="product_id é obrigatório para produtos.")
        if item.item_type == "SERVICE" and not item.service_id:
            raise HTTPException(status_code=400, detail="service_id é obrigatório para serviços.")
        
        item.total_price = round((item.quantity * item.unit_price) - item.discount, 2)
        subtotal += item.total_price

    total = round(subtotal - payload.discount + payload.shipping_cost, 2)

    # Update fields
    proposal.title = payload.title
    proposal.valid_from = payload.valid_from
    proposal.valid_until = payload.valid_until
    proposal.relation_type = payload.relation_type
    proposal.customer_id = payload.customer_id
    proposal.lead_id = payload.lead_id
    proposal.manual_name = payload.manual_name
    proposal.manual_document = payload.manual_document
    proposal.manual_email = payload.manual_email
    proposal.manual_phone = payload.manual_phone
    proposal.subtotal = subtotal
    proposal.discount = payload.discount
    proposal.shipping_cost = payload.shipping_cost
    proposal.total = total
    proposal.payment_method = payload.payment_method
    proposal.payment_condition = payload.payment_condition
    proposal.notes = payload.notes

    # Clean up old items
    db.query(ProposalItem).filter(ProposalItem.proposal_id == proposal.id).delete()

    # Recreate items
    for item in payload.items:
        db_item = ProposalItem(
            proposal_id=proposal.id,
            item_type=item.item_type,
            product_id=item.product_id,
            service_id=item.service_id,
            quantity=item.quantity,
            unit_price=item.unit_price,
            discount=item.discount,
            total_price=item.total_price,
            custom_description=item.custom_description
        )
        db.add(db_item)

    db.commit()
    return db.query(Proposal).options(
        joinedload(Proposal.items).joinedload(ProposalItem.product),
        joinedload(Proposal.items).joinedload(ProposalItem.service),
        joinedload(Proposal.company)
    ).filter(Proposal.id == proposal.id).first()


@router.post("/{proposal_id}/status", response_model=ProposalResponse)
def update_proposal_status(
    proposal_id: int,
    status: str = Query(..., description="DRAFT, SENT, ACCEPTED, REJECTED, EXPIRED"),
    db: Session = Depends(get_db),
    current_user: User = Depends(check_proposals_enabled)
):
    proposal = db.query(Proposal).filter(
        Proposal.id == proposal_id,
        Proposal.company_id == current_user.company_id
    ).first()

    if not proposal:
        raise HTTPException(status_code=404, detail="Proposta não encontrada.")
    if proposal.status == "CONVERTED":
        raise HTTPException(status_code=400, detail="Não é possível alterar o status de uma proposta já convertida.")

    if status not in ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"]:
        raise HTTPException(status_code=400, detail="Status inválido.")

    proposal.status = status
    db.commit()
    db.refresh(proposal)
    return proposal


@router.post("/{proposal_id}/convert")
def convert_proposal(
    proposal_id: int,
    convert_req: ProposalConvertRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(check_proposals_enabled)
):
    proposal = db.query(Proposal).options(joinedload(Proposal.items)).filter(
        Proposal.id == proposal_id,
        Proposal.company_id == current_user.company_id
    ).first()

    if not proposal:
        raise HTTPException(status_code=404, detail="Proposta não encontrada.")
    if proposal.status == "CONVERTED":
        raise HTTPException(status_code=400, detail="Esta proposta já foi convertida anteriormente.")

    customer = None

    # Handle Promotion from Lead/Manual to Customer
    if proposal.relation_type == "CUSTOMER":
        customer = db.query(Customer).filter(
            Customer.id == proposal.customer_id,
            Customer.company_id == current_user.company_id
        ).first()
        if not customer:
            raise HTTPException(status_code=400, detail="Cliente original não foi encontrado.")
            
    else: # LEAD or MANUAL
        # Validate input for new Customer creation
        if not convert_req.customer_name or not convert_req.customer_document:
            raise HTTPException(
                status_code=400,
                detail="Nome e Documento (CNPJ/CPF) são obrigatórios para promover a Cliente."
            )
            
        doc_clean = "".join(filter(str.isdigit, convert_req.customer_document))
        if not doc_clean:
            raise HTTPException(status_code=400, detail="Documento inválido.")

        # Check if Customer already exists with this document
        customer = db.query(Customer).filter(
            Customer.document == convert_req.customer_document,
            Customer.company_id == current_user.company_id
        ).first()

        if not customer:
            # Create new customer
            customer = Customer(
                company_id=current_user.company_id,
                name=convert_req.customer_name,
                document=convert_req.customer_document,
                email=convert_req.customer_email,
                phone=convert_req.customer_phone,
                customer_type=convert_req.customer_type or "PJ",
                crm_status="ACTIVE"
            )
            db.add(customer)
            db.flush()

            # Create Address if details are provided
            if convert_req.address_street and convert_req.address_number and convert_req.address_zip_code:
                db_address = Address(
                    customer_id=customer.id,
                    street=convert_req.address_street,
                    number=convert_req.address_number,
                    complement=convert_req.address_complement,
                    neighborhood=convert_req.address_neighborhood or "Centro",
                    city=convert_req.address_city or "Nao Informado",
                    state=convert_req.address_state or "SP",
                    zip_code=convert_req.address_zip_code,
                    ibge_code=convert_req.address_ibge_code,
                    type="MAIN"
                )
                db.add(db_address)
                db.flush()

        # Update proposal relation
        proposal.customer_id = customer.id
        proposal.relation_type = "CUSTOMER"
        db.flush()

    # Separate items
    product_items = [item for item in proposal.items if item.item_type == "PRODUCT"]
    service_items = [item for item in proposal.items if item.item_type == "SERVICE"]

    generated_order_id = None
    generated_service_order_ids = []

    # 1. Create Sales Order if there are products
    if product_items:
        # Sum total of product items
        subtotal_products = sum(item.total_price for item in product_items)
        # Proportionate discount and shipping (simple assignment here)
        total_products = round(subtotal_products - proposal.discount + proposal.shipping_cost, 2)

        db_order = Order(
            company_id=current_user.company_id,
            customer_id=customer.id,
            agent_id=current_user.id,
            status="NEW",
            type_order="V",
            origin="store",
            subtotal=subtotal_products,
            discount=proposal.discount,
            total=total_products,
            payment_condition=proposal.payment_condition,
            proposal_id=proposal.id
        )
        db.add(db_order)
        db.flush()
        generated_order_id = db_order.id

        # Create Order Items
        for p_item in product_items:
            db_order_item = OrderItem(
                order_id=db_order.id,
                product_id=p_item.product_id,
                quantity=int(p_item.quantity),
                quantity_requested=int(p_item.quantity),
                unit_price=p_item.unit_price,
                total_price=p_item.total_price
            )
            db.add(db_order_item)
            
        db.flush()

    # 2. Create Service Orders if there are services
    if service_items:
        for s_item in service_items:
            # Max local_id per company
            max_so_local_id = db.query(func.max(ServiceOrder.local_id)).filter(
                ServiceOrder.company_id == current_user.company_id
            ).scalar() or 0
            so_local_id = max_so_local_id + 1

            db_so = ServiceOrder(
                local_id=so_local_id,
                company_id=current_user.company_id,
                customer_id=customer.id,
                service_id=s_item.service_id,
                negotiated_value=s_item.total_price,
                custom_description=s_item.custom_description or proposal.notes,
                execution_date=date.today(),
                status="Pendente",
                status_nfse="Nao Emitida",
                proposal_id=proposal.id
            )
            db.add(db_so)
            db.flush()
            generated_service_order_ids.append(db_so.id)

    # 3. Finalize Proposal Conversion
    proposal.status = "CONVERTED"
    proposal.converted_at = datetime.utcnow()
    proposal.converted_by_user_id = current_user.id
    
    db.commit()

    return {
        "status": "success",
        "message": "Proposta convertida com sucesso.",
        "order_id": generated_order_id,
        "service_order_ids": generated_service_order_ids
    }


@router.get("/public/{proposal_id}", response_model=ProposalResponse)
def get_public_proposal(proposal_id: int, db: Session = Depends(get_db)):
    proposal = db.query(Proposal).options(
        joinedload(Proposal.items).joinedload(ProposalItem.product),
        joinedload(Proposal.items).joinedload(ProposalItem.service),
        joinedload(Proposal.company)
    ).filter(Proposal.id == proposal_id).first()
    
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposta não encontrada.")
    if not proposal.company.module_proposals:
        raise HTTPException(status_code=403, detail="Módulo de Propostas desativado para esta empresa.")
    return proposal


@router.post("/public/{proposal_id}/accept", response_model=ProposalResponse)
def accept_and_sign_proposal(
    proposal_id: int,
    payload: ProposalSignRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    proposal = db.query(Proposal).options(
        joinedload(Proposal.company)
    ).filter(Proposal.id == proposal_id).first()
    
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposta não encontrada.")
    if not proposal.company.module_proposals:
        raise HTTPException(status_code=403, detail="Módulo de Propostas desativado.")
    if proposal.status == "CONVERTED":
        raise HTTPException(status_code=400, detail="Esta proposta já foi convertida e não pode ser alterada.")
    
    # Capture IP and User Agent
    client_ip = request.client.host if request.client else "unknown"
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        client_ip = forwarded_for.split(",")[0].strip()
        
    user_agent = request.headers.get("user-agent", "unknown")
    
    # Save signature info and change status to ACCEPTED
    proposal.status = "ACCEPTED"
    proposal.signature_name = payload.name
    proposal.signature_document = payload.document
    proposal.signature_email = payload.email
    proposal.signature_ip = client_ip
    proposal.signature_user_agent = user_agent
    proposal.signature_at = datetime.utcnow()
    
    db.commit()
    
    # Re-fetch with joins to return
    return db.query(Proposal).options(
        joinedload(Proposal.items).joinedload(ProposalItem.product),
        joinedload(Proposal.items).joinedload(ProposalItem.service)
    ).filter(Proposal.id == proposal_id).first()

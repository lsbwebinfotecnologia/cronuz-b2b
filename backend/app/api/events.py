from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import List, Optional, Dict, Any
from datetime import datetime
from pathlib import Path
import logging
import random
import re
import uuid
import io
from PIL import Image

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.core.utils import assert_company_ownership
from app.core.upload_security import validate_file_size_and_extension, sanitize_filename, read_file_safely
from app.models.user import User
from app.models.customer import Customer
from app.models.marketing_showcase import MarketingShowcase
from app.models.school import SchoolEvent, SchoolEventParticipant, SchoolClass
from app.models.order import Order, OrderItem
from app.schemas.school import (
    SchoolEventCreate, SchoolEventUpdate, SchoolEventResponse,
    EventParticipantResponse
)
from app.api.school_storefront import invalidate_event_cache


_logger = logging.getLogger("cronuz.events")

router = APIRouter(prefix="/companies/{company_id}/events", tags=["events"])

def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_-]+', '-', text)
    return re.sub(r'^-+|-+$', '', text)


@router.post("/upload")
async def upload_event_asset(
    company_id: int,
    file: UploadFile = File(...),
    asset_type: str = Form("banner"),  # "logo" ou "banner"
    current_user: User = Depends(get_current_user)
):
    """
    Upload seguro de arquivos visuais de eventos (Logo ou Banner).
    Armazena em: uploads/<company_id>/events/
    Limites e Dimensões Máximas:
      - Logo: máx 2 MB, dimensões máximas 1200x1200px.
      - Banner: máx 5 MB, dimensões máximas 2560x1440px.
    """
    assert_company_ownership(current_user, company_id)

    clean_type = "logo" if asset_type.lower() == "logo" else "banner"
    max_file_size = 2 * 1024 * 1024 if clean_type == "logo" else 5 * 1024 * 1024
    max_width = 1200 if clean_type == "logo" else 2560
    max_height = 1200 if clean_type == "logo" else 1440

    # 1. Validação mandatória de extensão e teto de imagem
    clean_filename = validate_file_size_and_extension(file, category="image")

    # 2. Leitura com teto estrito por tipo de asset
    try:
        content = await read_file_safely(file, max_size_bytes=max_file_size)
    except HTTPException:
        size_mb = 2 if clean_type == "logo" else 5
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"O arquivo excede o limite máximo permitido de {size_mb} MB para {clean_type}."
        )

    # 3. Validação real de dimensões via Pillow
    try:
        img = Image.open(io.BytesIO(content))
        width, height = img.size
    except Exception as e:
        _logger.warning(f"Erro ao inspecionar imagem de evento: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Arquivo inválido ou corrompido. Certifique-se de enviar uma imagem JPG, PNG ou WEBP válida."
        )

    if width > max_width or height > max_height:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A imagem enviada ({width}x{height}px) ultrapassa as dimensões máximas permitidas de {max_width}x{max_height}px para {clean_type}."
        )

    # 4. Diretório isolado por seller / empresa
    target_dir = Path("uploads") / str(company_id) / "events"
    target_dir.mkdir(parents=True, exist_ok=True)

    # 5. Nome único para evitar sobrescrita acidental
    extension = Path(clean_filename).suffix.lower() if clean_filename else ".jpg"
    unique_filename = f"{clean_type}_{uuid.uuid4().hex[:12]}{extension}"
    file_path = target_dir / unique_filename

    # 6. Gravação segura em disco
    try:
        with file_path.open("wb") as buffer:
            buffer.write(content)
    except Exception as e:
        _logger.error(f"Erro ao salvar asset de evento: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao persistir o arquivo em disco: {str(e)}"
        )

    # 7. URL relativa pública atendida pelo StaticFiles
    relative_url = f"/uploads/{company_id}/events/{unique_filename}"
    return {
        "message": f"{clean_type.capitalize()} enviado com sucesso.",
        "url": relative_url,
        "filename": unique_filename,
        "width": width,
        "height": height,
        "size_bytes": len(content)
    }


@router.get("", response_model=List[SchoolEventResponse])
def list_events(
    company_id: int,
    school_id: Optional[int] = Query(None, description="Filtrar por escola"),
    event_type: Optional[str] = Query(None, description="PASSEIO, AMIGO_SECRETO, etc"),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None, description="Busca por título, local ou escola"),
    order_by: Optional[str] = Query(None, description="upcoming, school_name, created_desc, start_date_asc, etc"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)

    query = (
        db.query(
            SchoolEvent,
            Customer.name.label("school_name")
        )
        .outerjoin(Customer, Customer.id == SchoolEvent.school_customer_id)
        .filter(SchoolEvent.company_id == company_id)
    )

    if school_id:
        query = query.filter(SchoolEvent.school_customer_id == school_id)
    if event_type:
        query = query.filter(SchoolEvent.event_type == event_type)
    if status_filter:
        query = query.filter(SchoolEvent.status == status_filter)
    if search:
        search_term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                SchoolEvent.title.ilike(search_term),
                SchoolEvent.location_destination.ilike(search_term),
                Customer.name.ilike(search_term)
            )
        )

    now = datetime.utcnow()
    if order_by == "school_name":
        query = query.order_by(Customer.name.asc().nullslast(), SchoolEvent.title.asc())
    elif order_by == "school_name_desc":
        query = query.order_by(Customer.name.desc().nullslast(), SchoolEvent.title.desc())
    elif order_by == "start_date_asc":
        query = query.order_by(SchoolEvent.start_date.asc().nullslast())
    elif order_by == "start_date_desc":
        query = query.order_by(SchoolEvent.start_date.desc().nullslast())
    elif order_by == "created_asc":
        query = query.order_by(SchoolEvent.created_at.asc())
    elif order_by == "created_desc":
        query = query.order_by(SchoolEvent.created_at.desc())
    else:
        # Padrão: mais próximos primeiro (não expirados primeiro ordenados por início), depois expirados
        query = query.order_by(
            func.coalesce(SchoolEvent.end_date, SchoolEvent.start_date) < now,
            SchoolEvent.start_date.asc().nullslast(),
            SchoolEvent.created_at.desc()
        )

    rows = query.all()
    if not rows:
        return []

    event_ids = [e.SchoolEvent.id for e in rows]

    # Contagem de participantes por evento (agregação única)
    participants_counts = dict(
        db.query(SchoolEventParticipant.event_id, func.count(SchoolEventParticipant.id))
        .filter(SchoolEventParticipant.event_id.in_(event_ids))
        .group_by(SchoolEventParticipant.event_id)
        .all()
    )

    # Contagem de presentes já comprados
    gifts_counts = dict(
        db.query(SchoolEventParticipant.event_id, func.count(SchoolEventParticipant.id))
        .filter(
            SchoolEventParticipant.event_id.in_(event_ids),
            SchoolEventParticipant.gift_status.in_(["PURCHASED", "PACKED_READY", "DELIVERED_TO_SCHOOL"])
        )
        .group_by(SchoolEventParticipant.event_id)
        .all()
    )

    result = []
    for r in rows:
        evt = r.SchoolEvent
        result.append(SchoolEventResponse(
            id=evt.id,
            company_id=evt.company_id,
            school_customer_id=evt.school_customer_id,
            school_name=r.school_name,
            title=evt.title,
            slug=evt.slug,
            event_type=evt.event_type,
            description=evt.description,
            location_destination=evt.location_destination,
            start_date=evt.start_date,
            end_date=evt.end_date,
            status=evt.status,
            price=evt.price,
            max_capacity=evt.max_capacity,
            showcase_id=evt.showcase_id,
            banner_url=evt.banner_url,
            logo_url=evt.logo_url,
            content_html=evt.content_html,
            is_template=evt.is_template,
            parent_event_id=evt.parent_event_id,
            rules_config=evt.rules_config or {},
            draw_performed_at=evt.draw_performed_at,
            participants_count=participants_counts.get(evt.id, 0),
            gifts_purchased_count=gifts_counts.get(evt.id, 0),
            created_at=evt.created_at
        ))

    return result


@router.post("", response_model=SchoolEventResponse, status_code=status.HTTP_201_CREATED)
def create_event(
    company_id: int,
    payload: SchoolEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)

    # Validar se a escola pertence à empresa caso enviada
    school_name = None
    if payload.school_customer_id:
        sch = db.query(Customer).filter(
            Customer.id == payload.school_customer_id,
            Customer.company_id == company_id
        ).first()
        if not sch:
            raise HTTPException(status_code=404, detail="Escola selecionada não existe.")
        school_name = sch.name

    # Se estiver derivando de um evento modelo/template
    parent_evt = None
    if payload.parent_event_id:
        parent_evt = db.query(SchoolEvent).filter(
            SchoolEvent.id == payload.parent_event_id,
            SchoolEvent.company_id == company_id
        ).first()

    # Herdar do pai valores ausentes
    content_html = payload.content_html or (parent_evt.content_html if parent_evt else None)
    logo_url = payload.logo_url or (parent_evt.logo_url if parent_evt else None)
    banner_url = payload.banner_url or (parent_evt.banner_url if parent_evt else None)
    banner_mobile_url = payload.banner_mobile_url or (parent_evt.banner_mobile_url if parent_evt else None)
    showcase_id = payload.showcase_id or (parent_evt.showcase_id if parent_evt else None)
    description = payload.description or (parent_evt.description if parent_evt else None)
    location_destination = payload.location_destination or (parent_evt.location_destination if parent_evt else None)
    event_type = payload.event_type or (parent_evt.event_type if parent_evt else "PASSEIO")
    price = payload.price if payload.price is not None else (parent_evt.price if parent_evt else 0.0)

    # Gerar slug único amarrado à escola se vinculada
    base_text = payload.slug or payload.title
    if school_name and slugify(school_name) not in slugify(base_text):
        base_slug = slugify(f"{base_text} {school_name}")
    else:
        base_slug = slugify(base_text)

    unique_slug = base_slug
    counter = 1
    while db.query(SchoolEvent).filter(SchoolEvent.company_id == company_id, SchoolEvent.slug == unique_slug).first():
        unique_slug = f"{base_slug}-{counter}"
        counter += 1

    new_event = SchoolEvent(
        company_id=company_id,
        school_customer_id=payload.school_customer_id,
        title=payload.title,
        slug=unique_slug,
        event_type=event_type,
        description=description,
        location_destination=location_destination,
        start_date=payload.start_date,
        end_date=payload.end_date,
        status=payload.status or "OPEN",
        price=price,
        max_capacity=payload.max_capacity,
        showcase_id=showcase_id,
        banner_url=banner_url,
        banner_mobile_url=banner_mobile_url,
        logo_url=logo_url,
        content_html=content_html,
        is_template=payload.is_template or False,
        parent_event_id=payload.parent_event_id,
        rules_config=payload.rules_config or (parent_evt.rules_config if parent_evt else {})
    )
    db.add(new_event)
    db.commit()
    db.refresh(new_event)

    return SchoolEventResponse(
        id=new_event.id,
        company_id=new_event.company_id,
        school_customer_id=new_event.school_customer_id,
        school_name=school_name,
        title=new_event.title,
        slug=new_event.slug,
        event_type=new_event.event_type,
        description=new_event.description,
        location_destination=new_event.location_destination,
        start_date=new_event.start_date,
        end_date=new_event.end_date,
        status=new_event.status,
        price=new_event.price,
        max_capacity=new_event.max_capacity,
        showcase_id=new_event.showcase_id,
        banner_url=new_event.banner_url,
        banner_mobile_url=new_event.banner_mobile_url,
        logo_url=new_event.logo_url,
        content_html=new_event.content_html,
        is_template=new_event.is_template,
        parent_event_id=new_event.parent_event_id,
        rules_config=new_event.rules_config or {},
        draw_performed_at=new_event.draw_performed_at,
        participants_count=0,
        gifts_purchased_count=0,
        created_at=new_event.created_at
    )


@router.get("/{event_id}", response_model=SchoolEventResponse)
def get_event_detail(
    company_id: int,
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)

    evt = db.query(SchoolEvent).filter(
        SchoolEvent.id == event_id,
        SchoolEvent.company_id == company_id
    ).first()

    if not evt:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")

    school_name = None
    if evt.school_customer_id:
        sch = db.query(Customer).filter(Customer.id == evt.school_customer_id).first()
        school_name = sch.name if sch else None

    part_count = db.query(func.count(SchoolEventParticipant.id)).filter(SchoolEventParticipant.event_id == event_id).scalar() or 0
    gift_count = db.query(func.count(SchoolEventParticipant.id)).filter(
        SchoolEventParticipant.event_id == event_id,
        SchoolEventParticipant.gift_status.in_(["PURCHASED", "PACKED_READY", "DELIVERED_TO_SCHOOL"])
    ).scalar() or 0

    return SchoolEventResponse(
        id=evt.id,
        company_id=evt.company_id,
        school_customer_id=evt.school_customer_id,
        school_name=school_name,
        title=evt.title,
        slug=evt.slug,
        event_type=evt.event_type,
        description=evt.description,
        location_destination=evt.location_destination,
        start_date=evt.start_date,
        end_date=evt.end_date,
        status=evt.status,
        price=evt.price,
        max_capacity=evt.max_capacity,
        showcase_id=evt.showcase_id,
        banner_url=evt.banner_url,
        banner_mobile_url=evt.banner_mobile_url,
        logo_url=evt.logo_url,
        content_html=evt.content_html,
        is_template=evt.is_template,
        parent_event_id=evt.parent_event_id,
        rules_config=evt.rules_config or {},
        draw_performed_at=evt.draw_performed_at,
        participants_count=part_count,
        gifts_purchased_count=gift_count,
        created_at=evt.created_at
    )


@router.put("/{event_id}", response_model=SchoolEventResponse)
def update_event(
    company_id: int,
    event_id: int,
    payload: SchoolEventUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)

    evt = db.query(SchoolEvent).filter(
        SchoolEvent.id == event_id,
        SchoolEvent.company_id == company_id
    ).first()

    if not evt:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")

    if payload.title is not None: evt.title = payload.title
    if payload.slug is not None: evt.slug = slugify(payload.slug)
    if payload.event_type is not None: evt.event_type = payload.event_type
    if payload.description is not None: evt.description = payload.description
    if payload.location_destination is not None: evt.location_destination = payload.location_destination
    if payload.start_date is not None: evt.start_date = payload.start_date
    if payload.end_date is not None: evt.end_date = payload.end_date
    if payload.status is not None: evt.status = payload.status
    if payload.price is not None: evt.price = payload.price
    if payload.max_capacity is not None: evt.max_capacity = payload.max_capacity
    if payload.showcase_id is not None: evt.showcase_id = payload.showcase_id
    if payload.banner_url is not None: evt.banner_url = payload.banner_url
    if payload.banner_mobile_url is not None: evt.banner_mobile_url = payload.banner_mobile_url
    if payload.logo_url is not None: evt.logo_url = payload.logo_url
    if payload.content_html is not None: evt.content_html = payload.content_html
    if payload.is_template is not None: evt.is_template = payload.is_template
    if payload.parent_event_id is not None: evt.parent_event_id = payload.parent_event_id
    if payload.rules_config is not None: evt.rules_config = payload.rules_config
    if payload.school_customer_id is not None: evt.school_customer_id = payload.school_customer_id

    db.commit()
    db.refresh(evt)

    school_name = None
    if evt.school_customer_id:
        sch = db.query(Customer).filter(Customer.id == evt.school_customer_id).first()
        school_name = sch.name if sch else None

    part_count = db.query(func.count(SchoolEventParticipant.id)).filter(SchoolEventParticipant.event_id == event_id).scalar() or 0
    gift_count = db.query(func.count(SchoolEventParticipant.id)).filter(
        SchoolEventParticipant.event_id == event_id,
        SchoolEventParticipant.gift_status.in_(["PURCHASED", "PACKED_READY", "DELIVERED_TO_SCHOOL"])
    ).scalar() or 0

    return SchoolEventResponse(
        id=evt.id,
        company_id=evt.company_id,
        school_customer_id=evt.school_customer_id,
        school_name=school_name,
        title=evt.title,
        slug=evt.slug,
        event_type=evt.event_type,
        description=evt.description,
        location_destination=evt.location_destination,
        start_date=evt.start_date,
        end_date=evt.end_date,
        status=evt.status,
        price=evt.price,
        max_capacity=evt.max_capacity,
        showcase_id=evt.showcase_id,
        banner_url=evt.banner_url,
        banner_mobile_url=evt.banner_mobile_url,
        logo_url=evt.logo_url,
        content_html=evt.content_html,
        is_template=evt.is_template,
        parent_event_id=evt.parent_event_id,
        rules_config=evt.rules_config or {},
        draw_performed_at=evt.draw_performed_at,
        participants_count=part_count,
        gifts_purchased_count=gift_count,
        created_at=evt.created_at
    )


@router.delete("/{event_id}")
def delete_event(
    company_id: int,
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)

    evt = db.query(SchoolEvent).filter(
        SchoolEvent.id == event_id,
        SchoolEvent.company_id == company_id
    ).first()

    if not evt:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")

    # 1. Validar se há pedidos vinculados a este evento
    has_orders = db.query(Order).filter(
        Order.event_id == event_id,
        Order.company_id == company_id
    ).first()
    if has_orders:
        raise HTTPException(
            status_code=400,
            detail="Não é possível excluir este evento pois existem pedidos e compras de livros vinculados a ele."
        )

    # 2. Validar se há presentes já comprados por participantes
    has_gifts = db.query(SchoolEventParticipant).filter(
        SchoolEventParticipant.event_id == event_id,
        SchoolEventParticipant.company_id == company_id,
        SchoolEventParticipant.gift_status.in_(["PURCHASED", "PACKED_READY", "DELIVERED_TO_SCHOOL"])
    ).first()
    if has_gifts:
        raise HTTPException(
            status_code=400,
            detail="Não é possível excluir este evento pois já existem presentes e transações registradas para os alunos."
        )

    # 3. Remover participantes vinculados sem compras
    db.query(SchoolEventParticipant).filter(
        SchoolEventParticipant.event_id == event_id,
        SchoolEventParticipant.company_id == company_id
    ).delete(synchronize_session=False)

    # 4. Remover o evento
    db.delete(evt)
    db.commit()

    return {"message": "Evento removido com sucesso."}


# ── MOTOR DE SORTEIO DE AMIGO SECRETO (CÍCLICO / DERANGEMENT) ──
@router.post("/{event_id}/draw")
def perform_secret_friend_draw(
    company_id: int,
    event_id: int,
    by_class: bool = Query(True, description="Se verdadeiro, sorteia alunos dentro da mesma turma"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)

    evt = db.query(SchoolEvent).filter(
        SchoolEvent.id == event_id,
        SchoolEvent.company_id == company_id
    ).first()

    if not evt:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")

    if evt.event_type != "AMIGO_SECRETO":
        raise HTTPException(status_code=400, detail="Este evento não é do tipo Amigo Secreto.")

    participants = db.query(SchoolEventParticipant).filter(
        SchoolEventParticipant.event_id == event_id,
        SchoolEventParticipant.company_id == company_id
    ).all()

    if len(participants) < 2:
        raise HTTPException(status_code=400, detail="É necessário ter ao menos 2 participantes inscritos para realizar o sorteio.")

    # Agrupar por turma se solicitado
    groups: Dict[Optional[int], List[SchoolEventParticipant]] = {}
    if by_class:
        for p in participants:
            groups.setdefault(p.class_id, []).append(p)
    else:
        groups[None] = participants

    total_drawn = 0
    # Algoritmo de permutação cíclica: para cada grupo com >= 2 pessoas,
    # embaralha e faz cada pessoa i dar o presente para i+1 (o último dá para o primeiro).
    # Isso garante matematicamente um ciclo perfeito (ninguém tira a si mesmo e não há nós soltos).
    for group_key, members in groups.items():
        if len(members) < 2:
            class_name = "Sem Turma"
            if group_key:
                c = db.query(SchoolClass).filter(SchoolClass.id == group_key).first()
                if c: class_name = c.name
            raise HTTPException(
                status_code=400, 
                detail=f"A turma '{class_name}' possui menos de 2 participantes ({len(members)}). Inscreva mais alunos ou sorteie sem divisão por turma."
            )

        shuffled = list(members)
        random.shuffle(shuffled)

        n = len(shuffled)
        for i in range(n):
            giver = shuffled[i]
            receiver = shuffled[(i + 1) % n]
            giver.assigned_to_participant_id = receiver.id
            giver.gift_status = "WAITING_PURCHASE"
            total_drawn += 1

    evt.draw_performed_at = datetime.utcnow()
    evt.status = "IN_PROGRESS"
    db.commit()

    # Invalidar cache da loja pública para refletir encerramento de cadastros e início de compras imediatamente
    invalidate_event_cache(evt.slug)
    invalidate_event_cache(str(evt.id))


    return {
        "message": "Sorteio do Amigo Secreto realizado com sucesso!",
        "participants_drawn": total_drawn,
        "draw_performed_at": evt.draw_performed_at
    }


# ── LISTAGEM DE PARTICIPANTES ──
@router.get("/{event_id}/participants", response_model=List[EventParticipantResponse])
def list_event_participants(
    company_id: int,
    event_id: int,
    class_id: Optional[int] = Query(None),
    gift_status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)

    query = (
        db.query(
            SchoolEventParticipant,
            SchoolClass.name.label("class_name")
        )
        .outerjoin(SchoolClass, SchoolClass.id == SchoolEventParticipant.class_id)
        .filter(
            SchoolEventParticipant.event_id == event_id,
            SchoolEventParticipant.company_id == company_id
        )
    )

    if class_id:
        query = query.filter(SchoolEventParticipant.class_id == class_id)
    if gift_status:
        query = query.filter(SchoolEventParticipant.gift_status == gift_status)

    rows = query.order_by(SchoolEventParticipant.student_name.asc()).all()
    if not rows:
        return []

    # Mapa de nomes sorteados para exibição ao gestor
    assigned_ids = [r.SchoolEventParticipant.assigned_to_participant_id for r in rows if r.SchoolEventParticipant.assigned_to_participant_id]
    assigned_map = {}
    assigned_char_map = {}
    if assigned_ids:
        assigned_tuples = (
            db.query(
                SchoolEventParticipant.id,
                SchoolEventParticipant.student_name,
                SchoolEventParticipant.character_name
            )
            .filter(SchoolEventParticipant.id.in_(assigned_ids))
            .all()
        )
        assigned_map = {t[0]: t[1] for t in assigned_tuples}
        assigned_char_map = {t[0]: t[2] for t in assigned_tuples}

    result = []
    for r in rows:
        p = r.SchoolEventParticipant
        result.append(EventParticipantResponse(
            id=p.id,
            company_id=p.company_id,
            event_id=p.event_id,
            class_id=p.class_id,
            class_name=r.class_name,
            student_name=p.student_name,
            student_birth_date=p.student_birth_date,
            character_name=p.character_name,
            parent_name=p.parent_name,
            parent_cpf=p.parent_cpf,
            parent_phone=p.parent_phone,
            parent_email=p.parent_email,
            wishlist_preferences=p.wishlist_preferences or {},
            access_token=p.access_token,
            assigned_to_participant_id=p.assigned_to_participant_id,
            assigned_student_name=assigned_map.get(p.assigned_to_participant_id),
            assigned_character_name=assigned_char_map.get(p.assigned_to_participant_id),
            draw_revealed_at=p.draw_revealed_at,
            gift_status=p.gift_status,
            checkin_status=p.checkin_status,
            created_at=p.created_at
        ))

    return result


# ── VISÃO DE EXPEDIÇÃO (MONTAGEM DE PRESENTES & ETIQUETAS) ──
@router.get("/{event_id}/expedition")
def get_expedition_sheet(
    company_id: int,
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)

    evt = db.query(SchoolEvent).filter(
        SchoolEvent.id == event_id,
        SchoolEvent.company_id == company_id
    ).first()

    if not evt:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")

    school = db.query(Customer).filter(Customer.id == evt.school_customer_id).first() if evt.school_customer_id else None

    # Buscar todos os participantes do evento
    participants = (
        db.query(
            SchoolEventParticipant,
            SchoolClass.name.label("class_name")
        )
        .outerjoin(SchoolClass, SchoolClass.id == SchoolEventParticipant.class_id)
        .filter(
            SchoolEventParticipant.event_id == event_id,
            SchoolEventParticipant.company_id == company_id
        )
        .all()
    )

    # Buscar itens dos pedidos vinculados
    order_ids = [p.SchoolEventParticipant.gift_order_id for p in participants if p.SchoolEventParticipant.gift_order_id]
    order_items_map = {}
    if order_ids:
        items = db.query(OrderItem).filter(OrderItem.order_id.in_(order_ids)).all()
        for item in items:
            order_items_map.setdefault(item.order_id, []).append({
                "sku": item.sku,
                "name": item.name,
                "quantity": item.quantity,
                "brand": item.brand
            })

    # Mapa quem tirou quem
    part_map = {p.SchoolEventParticipant.id: p.SchoolEventParticipant for p in participants}

    expedition_items = []
    for row in participants:
        p = row.SchoolEventParticipant
        # O presente que foi comprado PARA este aluno (ele é o receiver)
        # Quem deu o presente é quem tem assigned_to_participant_id == p.id
        giver = next((other.SchoolEventParticipant for other in participants if other.SchoolEventParticipant.assigned_to_participant_id == p.id), None)
        
        gift_info = []
        order_ref = None
        gift_status = "WAITING_PURCHASE"
        if giver and giver.gift_order_id:
            gift_info = order_items_map.get(giver.gift_order_id, [])
            order_ref = giver.gift_order_id
            gift_status = giver.gift_status

        expedition_items.append({
            "participant_id": p.id,
            "student_name": p.student_name,
            "class_name": row.class_name or "Geral",
            "school_name": school.name if school else "Escola",
            "giver_student_name": giver.student_name if giver else "Não identificado",
            "giver_parent_name": giver.parent_name if giver else None,
            "order_id": order_ref,
            "gift_status": gift_status,
            "items": gift_info
        })

    return {
        "event_id": evt.id,
        "event_title": evt.title,
        "school_name": school.name if school else None,
        "total_participants": len(participants),
        "total_purchased": sum(1 for it in expedition_items if it["order_id"] is not None),
        "items": expedition_items
    }


# ── ATUALIZAR STATUS DO PRESENTE / EXPEDIÇÃO ──
@router.put("/{event_id}/participants/{participant_id}/status")
def update_participant_status(
    company_id: int,
    event_id: int,
    participant_id: int,
    gift_status: Optional[str] = Query(None),
    checkin_status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    assert_company_ownership(current_user, company_id)

    p = db.query(SchoolEventParticipant).filter(
        SchoolEventParticipant.id == participant_id,
        SchoolEventParticipant.event_id == event_id,
        SchoolEventParticipant.company_id == company_id
    ).first()

    if not p:
        raise HTTPException(status_code=404, detail="Participante não encontrado.")

    if gift_status:
        p.gift_status = gift_status
    if checkin_status:
        p.checkin_status = checkin_status

    db.commit()
    return {"message": "Status atualizado com sucesso", "gift_status": p.gift_status, "checkin_status": p.checkin_status}

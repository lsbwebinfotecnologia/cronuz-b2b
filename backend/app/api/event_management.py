import csv
import hashlib
import io
import logging
import os
import random
import re
import secrets
import uuid
import zipfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import openpyxl
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from PIL import Image
from pydantic import BaseModel, Field
from pypdf import PdfReader, PdfWriter
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.dependencies import get_current_user
from app.core.upload_security import (
    MAX_ABSOLUTE_SIZE_BYTES,
    MAX_DOCUMENT_SIZE_BYTES,
    MAX_IMAGE_SIZE_BYTES,
    MAX_SHEET_SIZE_BYTES,
    read_file_safely,
    sanitize_filename,
    validate_file_size_and_extension,
)
from app.db.session import get_db
from app.integrators.whatsapp_events_client import (
    BRT_TZ,
    WhatsAppEventsGateway,
    extract_contacts_from_free_text,
    generate_native_qr_vip_card,
    normalize_br_phone,
    parse_vcard_block,
    render_invite_message,
)
from app.models.company import Company
from app.models.event_management import (
    EventAuditLog,
    EventContact,
    EventDispatchQueue,
    EventGuest,
    EventInviteTemplate,
    EventTicket,
    EventVenue,
    EventWhatsAppConfig,
    ManagedEvent,
)
from app.models.user import User, UserRole

logger = logging.getLogger("cronuz.event_management")

router = APIRouter(prefix="/event-management", tags=["event-management"])

BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent


def _fmt_dt(dt_val: Optional[datetime]) -> Optional[str]:
    if not dt_val:
        return None
    if dt_val.tzinfo is None:
        dt_val = dt_val.replace(tzinfo=BRT_TZ)
    return dt_val.astimezone(BRT_TZ).isoformat()


def _resolve_company(
    db: Session,
    current_user: User,
    company_id_override: Optional[int] = None,
) -> Company:
    is_master = str(getattr(current_user, "type", "")) == "MASTER" or current_user.type == UserRole.MASTER
    target_id = company_id_override if (is_master and company_id_override) else current_user.company_id

    if not target_id and is_master:
        comp = (
            db.query(Company)
            .filter(Company.module_event_management.is_(True))
            .order_by(Company.id.asc())
            .first()
        ) or db.query(Company).order_by(Company.id.asc()).first()
        if not comp:
            raise HTTPException(status_code=404, detail="Nenhuma empresa cadastrada no sistema.")
        return comp

    if not target_id:
        raise HTTPException(status_code=403, detail="Usuário sem empresa vinculada para operar o módulo de Eventos.")

    comp = db.query(Company).filter(Company.id == target_id).first()
    if not comp:
        raise HTTPException(status_code=404, detail=f"Empresa #{target_id} não encontrada.")

    if not is_master and not getattr(comp, "module_event_management", False):
        raise HTTPException(
            status_code=403,
            detail="O módulo Gerenciamento de Eventos não está habilitado para esta empresa. Solicite a liberação ao administrador Master.",
        )
    return comp


def _log_audit(
    db: Session,
    company_id: int,
    entity_type: str,
    action: str,
    summary: str,
    user: Optional[User] = None,
    actor_name_override: Optional[str] = None,
    source_channel: str = "WEB_DESKTOP",
    event_id: Optional[int] = None,
    contact_id: Optional[int] = None,
    guest_id: Optional[int] = None,
    ticket_id: Optional[int] = None,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    db.add(
        EventAuditLog(
            company_id=company_id,
            event_id=event_id,
            contact_id=contact_id,
            guest_id=guest_id,
            ticket_id=ticket_id,
            entity_type=entity_type,
            action=action,
            actor_user_id=user.id if user else None,
            actor_name=actor_name_override or (user.name if user else "Sistema"),
            source_channel=source_channel,
            summary=summary[:500],
            details_json=details or {},
        )
    )


def _build_maps_url(street: Optional[str], number: Optional[str], neighborhood: Optional[str], city: Optional[str], state: Optional[str]) -> Optional[str]:
    parts = [p.strip() for p in [street, number, neighborhood, city, state] if p and str(p).strip()]
    if not parts:
        return None
    from urllib.parse import quote_plus
    return f"https://www.google.com/maps/search/?api=1&query={quote_plus(', '.join(parts))}"


def _find_duplicate_contact(
    db: Session,
    company_id: int,
    phone_canonical: str,
    phone_base_8: str,
    exclude_id: Optional[int] = None,
) -> Optional[EventContact]:
    q = db.query(EventContact).filter(
        EventContact.company_id == company_id,
        or_(
            EventContact.phone_canonical == phone_canonical,
            EventContact.phone_base_8 == phone_base_8,
        ),
    )
    if exclude_id:
        q = q.filter(EventContact.id != exclude_id)
    return q.first()


def _serialize_venue(v: EventVenue) -> Dict[str, Any]:
    return {
        "id": v.id,
        "company_id": v.company_id,
        "name": v.name,
        "legal_name": v.legal_name,
        "cnpj": v.cnpj,
        "contact_name": v.contact_name,
        "contact_phone": v.contact_phone,
        "contact_email": v.contact_email,
        "zip_code": v.zip_code,
        "street": v.street,
        "number": v.number,
        "complement": v.complement,
        "neighborhood": v.neighborhood,
        "city": v.city,
        "state": v.state,
        "maps_url": v.maps_url or _build_maps_url(v.street, v.number, v.neighborhood, v.city, v.state),
        "total_capacity": v.total_capacity,
        "age_rating": v.age_rating,
        "default_sectors": v.default_sectors_json or [],
        "access_notes": v.access_notes,
        "active": v.active,
        "created_at": _fmt_dt(v.created_at),
    }


def _serialize_contact(c: EventContact) -> Dict[str, Any]:
    invited = c.total_events_invited or 0
    checkins = c.total_checkins or 0
    attendance_rate = round((checkins / invited) * 100, 1) if invited > 0 else None
    return {
        "id": c.id,
        "company_id": c.company_id,
        "full_name": c.full_name,
        "nickname": c.nickname,
        "phone_display": c.phone_display,
        "phone_ddd": c.phone_ddd,
        "phone_canonical": c.phone_canonical,
        "secondary_phone": c.secondary_phone,
        "email": c.email,
        "cpf": c.cpf,
        "rg": c.rg,
        "birth_date": c.birth_date.isoformat() if c.birth_date else None,
        "gender": c.gender,
        "instagram": c.instagram,
        "company_org": c.company_org,
        "job_title": c.job_title,
        "city": c.city,
        "state": c.state,
        "category_tag": c.category_tag,
        "tags": c.tags_json or [],
        "origin_source": c.origin_source,
        "origin_promoter_name": c.origin_promoter_name,
        "whatsapp_valid": c.whatsapp_valid,
        "is_blocked": c.is_blocked,
        "block_reason": c.block_reason,
        "notes": c.notes,
        "total_events_invited": invited,
        "total_events_confirmed": c.total_events_confirmed or 0,
        "total_tickets_sent": c.total_tickets_sent or 0,
        "total_checkins": checkins,
        "total_no_shows": c.total_no_shows or 0,
        "attendance_rate": attendance_rate,
        "last_event_at": _fmt_dt(c.last_event_at),
        "created_at": _fmt_dt(c.created_at),
    }


def _serialize_event(ev: ManagedEvent, stats: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    venue = ev.venue
    loc_name = ev.custom_location_name or (venue.name if venue else "")
    street = ev.street or (venue.street if venue else None)
    number = ev.number or (venue.number if venue else None)
    neighborhood = ev.neighborhood or (venue.neighborhood if venue else None)
    city = ev.city or (venue.city if venue else None)
    state = ev.state or (venue.state if venue else None)
    maps = ev.maps_url or (venue.maps_url if venue else None) or _build_maps_url(street, number, neighborhood, city, state)

    return {
        "id": ev.id,
        "company_id": ev.company_id,
        "code": ev.code,
        "title": ev.title,
        "subtitle": ev.subtitle,
        "description": ev.description,
        "status": ev.status,
        "event_date": ev.event_date.isoformat() if ev.event_date else None,
        "doors_open_time": ev.doors_open_time,
        "start_time": ev.start_time,
        "end_time": ev.end_time,
        "list_cutoff_time": ev.list_cutoff_time,
        "venue_id": ev.venue_id,
        "venue_name": venue.name if venue else None,
        "location_display_name": loc_name,
        "custom_location_name": ev.custom_location_name,
        "zip_code": ev.zip_code or (venue.zip_code if venue else None),
        "street": street,
        "number": number,
        "complement": ev.complement or (venue.complement if venue else None),
        "neighborhood": neighborhood,
        "city": city,
        "state": state,
        "maps_url": maps,
        "age_rating": ev.age_rating,
        "dress_code": ev.dress_code,
        "banner_url": ev.banner_url,
        "flyer_vertical_url": ev.flyer_vertical_url,
        "ticket_mode": ev.ticket_mode,
        "dispatch_flow_mode": ev.dispatch_flow_mode,
        "auto_send_ticket_on_rsvp": ev.auto_send_ticket_on_rsvp,
        "max_guests_limit": ev.max_guests_limit,
        "sectors": ev.sectors_json or [
            {"key": "VIP", "name": "Área VIP", "courtesy_quota": 100, "face_value": 0},
            {"key": "PISTA", "name": "Pista", "courtesy_quota": 200, "face_value": 0},
            {"key": "CAMAROTE", "name": "Camarote", "courtesy_quota": 50, "face_value": 0},
        ],
        "public_rsvp_token": ev.public_rsvp_token,
        "public_rsvp_enabled": ev.public_rsvp_enabled,
        "public_rsvp_max_slots": ev.public_rsvp_max_slots,
        "stats": stats or {},
        "created_at": _fmt_dt(ev.created_at),
    }


def _serialize_guest(g: EventGuest) -> Dict[str, Any]:
    c = g.contact
    ticket_list = getattr(g, "assigned_ticket", None)
    ticket_obj = ticket_list[0] if isinstance(ticket_list, list) and ticket_list else (ticket_list if isinstance(ticket_list, EventTicket) else None)
    return {
        "id": g.id,
        "event_id": g.event_id,
        "contact_id": g.contact_id,
        "contact": _serialize_contact(c) if c else None,
        "sector_key": g.sector_key,
        "access_type": g.access_type,
        "companions_count": g.companions_count,
        "companions_names": g.companions_names,
        "courtesy_value": g.courtesy_value or 0.0,
        "promoter_name": g.promoter_name,
        "added_via": g.added_via,
        "invite_status": g.invite_status,
        "rsvp_token": g.rsvp_token,
        "rsvp_responded_at": _fmt_dt(g.rsvp_responded_at),
        "ticket_delivery_status": g.ticket_delivery_status,
        "ticket_sent_at": _fmt_dt(g.ticket_sent_at),
        "ticket_resend_count": g.ticket_resend_count or 0,
        "checkin_status": g.checkin_status,
        "checked_in_at": _fmt_dt(g.checked_in_at),
        "checked_in_by_name": g.checked_in_by.name if getattr(g, "checked_in_by", None) else None,
        "notes": g.notes,
        "ticket": {
            "id": ticket_obj.id,
            "ticket_number": ticket_obj.ticket_number,
            "original_filename": ticket_obj.original_filename,
            "page_number": ticket_obj.page_number,
            "status": ticket_obj.status,
            "sector_key": ticket_obj.sector_key,
            "sent_at": _fmt_dt(ticket_obj.sent_at),
        } if ticket_obj else None,
        "created_at": _fmt_dt(g.created_at),
    }


# ============================================================================
# SCHEMAS DE REQUEST
# ============================================================================

class VenuePayload(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    legal_name: Optional[str] = None
    cnpj: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    zip_code: Optional[str] = None
    street: Optional[str] = None
    number: Optional[str] = None
    complement: Optional[str] = None
    neighborhood: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    maps_url: Optional[str] = None
    total_capacity: Optional[int] = None
    age_rating: str = "18+"
    default_sectors: List[Dict[str, Any]] = []
    access_notes: Optional[str] = None
    active: bool = True


class ContactPayload(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=255)
    nickname: Optional[str] = None
    phone: str = Field(..., min_length=10, max_length=30)
    secondary_phone: Optional[str] = None
    email: Optional[str] = None
    cpf: Optional[str] = None
    rg: Optional[str] = None
    birth_date: Optional[date] = None
    gender: Optional[str] = None
    instagram: Optional[str] = None
    company_org: Optional[str] = None
    job_title: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    category_tag: str = "CONVIDADO"
    tags: List[str] = []
    origin_source: str = "MANUAL"
    origin_promoter_name: Optional[str] = None
    is_blocked: bool = False
    block_reason: Optional[str] = None
    notes: Optional[str] = None


class EventPayload(BaseModel):
    code: Optional[str] = None
    title: str = Field(..., min_length=2, max_length=255)
    subtitle: Optional[str] = None
    description: Optional[str] = None
    status: str = "OPEN"
    event_date: date
    doors_open_time: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    list_cutoff_time: Optional[str] = None
    venue_id: Optional[int] = None
    custom_location_name: Optional[str] = None
    zip_code: Optional[str] = None
    street: Optional[str] = None
    number: Optional[str] = None
    complement: Optional[str] = None
    neighborhood: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    maps_url: Optional[str] = None
    age_rating: str = "18+"
    dress_code: Optional[str] = None
    banner_url: Optional[str] = None
    flyer_vertical_url: Optional[str] = None
    ticket_mode: str = "HYBRID"
    dispatch_flow_mode: str = "BOTH_ALLOWED"
    auto_send_ticket_on_rsvp: bool = False
    max_guests_limit: Optional[int] = None
    sectors: List[Dict[str, Any]] = []
    public_rsvp_enabled: bool = True
    public_rsvp_max_slots: Optional[int] = None


class AddEventGuestPayload(BaseModel):
    contact_id: Optional[int] = None
    # Caso adicione contato novo direto pela grade/mobile
    full_name: Optional[str] = None
    nickname: Optional[str] = None
    phone: Optional[str] = None
    cpf: Optional[str] = None
    email: Optional[str] = None
    instagram: Optional[str] = None
    company_org: Optional[str] = None
    category_tag: str = "CONVIDADO"

    sector_key: str = "VIP"
    access_type: str = "COURTESY_HYBRID"
    companions_count: int = 0
    companions_names: Optional[str] = None
    courtesy_value: float = 0.0
    promoter_name: Optional[str] = None
    added_via: str = "DESKTOP_GRID"
    invite_status: str = "PENDING"
    notes: Optional[str] = None


class UpdateEventGuestPayload(BaseModel):
    sector_key: Optional[str] = None
    access_type: Optional[str] = None
    companions_count: Optional[int] = None
    companions_names: Optional[str] = None
    courtesy_value: Optional[float] = None
    promoter_name: Optional[str] = None
    invite_status: Optional[str] = None
    checkin_status: Optional[str] = None
    notes: Optional[str] = None


class SmartPasteRequest(BaseModel):
    raw_text: str


class BulkImportContactsRequest(BaseModel):
    event_id: Optional[int] = None
    sector_key: str = "VIP"
    promoter_name: Optional[str] = None
    source_channel: str = "MOBILE_QUICK"
    contacts: List[Dict[str, Any]]


class AssignTicketPayload(BaseModel):
    guest_id: int
    ticket_id: Optional[int] = None  # Se omitido, aloca automaticamente o próximo PDF AVAILABLE do setor


class InvalidateTicketPayload(BaseModel):
    reason: str = Field(..., min_length=3, max_length=255)


class InviteTemplatePayload(BaseModel):
    event_id: Optional[int] = None
    name: str = Field(..., min_length=2, max_length=180)
    template_purpose: str = "INVITE_RSVP"
    image_url: Optional[str] = None
    message_body: str = Field(..., min_length=5)
    spintax_greetings: List[str] = []
    is_default: bool = False


class WhatsAppConfigPayload(BaseModel):
    provider: str = "EVOLUTION"
    enabled: bool = False
    api_base_url: Optional[str] = None
    instance_name: Optional[str] = None
    api_key_token: Optional[str] = None
    client_token: Optional[str] = None
    connected_phone: Optional[str] = None
    min_delay_seconds: int = 25
    max_delay_seconds: int = 55
    batch_size_before_pause: int = 20
    batch_pause_seconds: int = 300
    daily_limit: int = 250
    allowed_start_hour: str = "09:00"
    allowed_end_hour: str = "21:30"
    simulate_typing: bool = True
    verify_whatsapp_before_send: bool = True
    queue_paused: bool = False
    vcard_capture_enabled: bool = True
    authorized_sender_phones: List[str] = []
    default_capture_event_id: Optional[int] = None
    default_capture_sector: str = "VIP"


class EnqueueDispatchPayload(BaseModel):
    guest_ids: List[int]
    dispatch_mode: str = "INVITE_ONLY"  # INVITE_ONLY, TICKET_PDF_ONLY, COMBO_INVITE_AND_PDF, NATIVE_QR_CARD, REMINDER
    template_id: Optional[int] = None
    custom_message: Optional[str] = None
    custom_image_url: Optional[str] = None
    auto_assign_available_pdf: bool = True
    frontend_origin: Optional[str] = None


class CheckinPayload(BaseModel):
    guest_id: Optional[int] = None
    qr_code: Optional[str] = None
    phone_or_cpf: Optional[str] = None
    cpf_confirmed: Optional[str] = None
    verification_method: str = "LIST"
    undo: bool = False


class PublicRsvpConfirmPayload(BaseModel):
    decision: str = Field(..., pattern="^(CONFIRM|DECLINE)$")
    cpf: Optional[str] = None
    email: Optional[str] = None
    instagram: Optional[str] = None
    birth_date: Optional[date] = None


# ============================================================================
# 1. OVERVIEW & INDICADORES GERAIS
# ============================================================================

@router.get("/overview")
def get_events_overview(
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)

    total_events = db.query(func.count(ManagedEvent.id)).filter(ManagedEvent.company_id == comp.id).scalar() or 0
    open_events = (
        db.query(func.count(ManagedEvent.id))
        .filter(ManagedEvent.company_id == comp.id, ManagedEvent.status.in_(["OPEN", "ONGOING"]))
        .scalar()
        or 0
    )
    total_venues = db.query(func.count(EventVenue.id)).filter(EventVenue.company_id == comp.id, EventVenue.active.is_(True)).scalar() or 0
    total_contacts = db.query(func.count(EventContact.id)).filter(EventContact.company_id == comp.id).scalar() or 0
    tickets_available = (
        db.query(func.count(EventTicket.id))
        .filter(EventTicket.company_id == comp.id, EventTicket.status == "AVAILABLE")
        .scalar()
        or 0
    )
    tickets_sent = (
        db.query(func.count(EventTicket.id))
        .filter(EventTicket.company_id == comp.id, EventTicket.status.in_(["SENT", "DELIVERED"]))
        .scalar()
        or 0
    )
    queue_pending = (
        db.query(func.count(EventDispatchQueue.id))
        .filter(EventDispatchQueue.company_id == comp.id, EventDispatchQueue.status == "PENDING")
        .scalar()
        or 0
    )

    wa_cfg = db.query(EventWhatsAppConfig).filter(EventWhatsAppConfig.company_id == comp.id).first()

    return {
        "company_id": comp.id,
        "company_name": comp.name,
        "kpis": {
            "total_events": total_events,
            "open_events": open_events,
            "total_venues": total_venues,
            "total_contacts": total_contacts,
            "tickets_available": tickets_available,
            "tickets_sent": tickets_sent,
            "queue_pending": queue_pending,
            "whatsapp_enabled": bool(wa_cfg and wa_cfg.enabled),
            "whatsapp_paused": bool(wa_cfg and wa_cfg.queue_paused),
        },
    }


# ============================================================================
# 2. CASAS DE SHOW & LOCAIS PRÉ-CADASTRADOS (evm_venue)
# ============================================================================

@router.get("/venues")
def list_venues(
    search: Optional[str] = Query(None),
    active_only: bool = Query(False),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    q = db.query(EventVenue).filter(EventVenue.company_id == comp.id)
    if active_only:
        q = q.filter(EventVenue.active.is_(True))
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(or_(EventVenue.name.ilike(term), EventVenue.city.ilike(term), EventVenue.neighborhood.ilike(term)))
    rows = q.order_by(EventVenue.name.asc()).all()
    return [_serialize_venue(v) for v in rows]


@router.post("/venues")
def create_venue(
    payload: VenuePayload,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    maps = payload.maps_url or _build_maps_url(payload.street, payload.number, payload.neighborhood, payload.city, payload.state)
    venue = EventVenue(
        company_id=comp.id,
        name=payload.name.strip(),
        legal_name=payload.legal_name,
        cnpj=payload.cnpj,
        contact_name=payload.contact_name,
        contact_phone=payload.contact_phone,
        contact_email=payload.contact_email,
        zip_code=payload.zip_code,
        street=payload.street,
        number=payload.number,
        complement=payload.complement,
        neighborhood=payload.neighborhood,
        city=payload.city,
        state=payload.state,
        maps_url=maps,
        total_capacity=payload.total_capacity,
        age_rating=payload.age_rating,
        default_sectors_json=payload.default_sectors or [
            {"key": "PISTA", "name": "Pista", "courtesy_quota": 200, "face_value": 0},
            {"key": "VIP", "name": "Área VIP", "courtesy_quota": 100, "face_value": 0},
            {"key": "CAMAROTE", "name": "Camarote", "courtesy_quota": 50, "face_value": 0},
        ],
        access_notes=payload.access_notes,
        active=payload.active,
    )
    db.add(venue)
    db.flush()
    _log_audit(db, comp.id, "VENUE", "VENUE_CREATED", f"Casa de show '{venue.name}' cadastrada.", user=current_user)
    db.commit()
    db.refresh(venue)
    return _serialize_venue(venue)


@router.put("/venues/{venue_id}")
def update_venue(
    venue_id: int,
    payload: VenuePayload,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    venue = db.query(EventVenue).filter(EventVenue.id == venue_id, EventVenue.company_id == comp.id).first()
    if not venue:
        raise HTTPException(status_code=404, detail="Casa de show não encontrada.")

    venue.name = payload.name.strip()
    venue.legal_name = payload.legal_name
    venue.cnpj = payload.cnpj
    venue.contact_name = payload.contact_name
    venue.contact_phone = payload.contact_phone
    venue.contact_email = payload.contact_email
    venue.zip_code = payload.zip_code
    venue.street = payload.street
    venue.number = payload.number
    venue.complement = payload.complement
    venue.neighborhood = payload.neighborhood
    venue.city = payload.city
    venue.state = payload.state
    venue.maps_url = payload.maps_url or _build_maps_url(payload.street, payload.number, payload.neighborhood, payload.city, payload.state)
    venue.total_capacity = payload.total_capacity
    venue.age_rating = payload.age_rating
    venue.default_sectors_json = payload.default_sectors
    venue.access_notes = payload.access_notes
    venue.active = payload.active

    _log_audit(db, comp.id, "VENUE", "VENUE_UPDATED", f"Casa de show '{venue.name}' atualizada.", user=current_user)
    db.commit()
    db.refresh(venue)
    return _serialize_venue(venue)


# ============================================================================
# 3. UPLOAD SEGURO DE IMAGENS DE EVENTO E CONVITES (LIMITE 5 MB)
# ============================================================================

@router.post("/upload-image")
async def upload_event_management_image(
    file: UploadFile = File(...),
    folder: str = Form("banners"),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    clean_filename = validate_file_size_and_extension(file, category="image", custom_max_size=MAX_IMAGE_SIZE_BYTES)
    content = await read_file_safely(file, max_size_bytes=MAX_IMAGE_SIZE_BYTES)

    try:
        img = Image.open(io.BytesIO(content))
        img.verify()
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Arquivo de imagem inválido ou corrompido. Envie um arquivo JPG, PNG ou WEBP válido de até 5 MB.",
        )

    safe_folder = "templates" if folder == "templates" else "banners"
    target_dir = BACKEND_ROOT / "uploads" / str(comp.id) / "event_management" / safe_folder
    target_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(clean_filename).suffix.lower() or ".jpg"
    unique_name = f"{safe_folder}_{uuid.uuid4().hex[:12]}{ext}"
    abs_file = target_dir / unique_name

    # Reabre e otimiza levemente preservando qualidade para disparo rápido no WhatsApp
    img_opt = Image.open(io.BytesIO(content))
    if img_opt.width > 2000 or img_opt.height > 2000:
        img_opt.thumbnail((2000, 2000), Image.Resampling.LANCZOS)
    if ext in (".jpg", ".jpeg"):
        if img_opt.mode in ("RGBA", "P"):
            img_opt = img_opt.convert("RGB")
        img_opt.save(abs_file, format="JPEG", quality=88, optimize=True)
    else:
        img_opt.save(abs_file, optimize=True)

    rel_url = f"/uploads/{comp.id}/event_management/{safe_folder}/{unique_name}"
    return {"url": rel_url, "filename": unique_name}


# ============================================================================
# 4. EVENTOS (evm_event)
# ============================================================================

def _compute_event_stats_map(db: Session, company_id: int, event_ids: List[int]) -> Dict[int, Dict[str, Any]]:
    if not event_ids:
        return {}
    stats: Dict[int, Dict[str, Any]] = {
        eid: {
            "total_guests": 0,
            "total_companions": 0,
            "total_people": 0,
            "confirmed_guests": 0,
            "checked_in": 0,
            "tickets_available": 0,
            "tickets_reserved": 0,
            "tickets_sent": 0,
        }
        for eid in event_ids
    }

    guest_rows = (
        db.query(
            EventGuest.event_id,
            EventGuest.invite_status,
            EventGuest.checkin_status,
            func.count(EventGuest.id),
            func.coalesce(func.sum(EventGuest.companions_count), 0),
        )
        .filter(EventGuest.company_id == company_id, EventGuest.event_id.in_(event_ids))
        .group_by(EventGuest.event_id, EventGuest.invite_status, EventGuest.checkin_status)
        .all()
    )
    for eid, inv_st, chk_st, cnt, comps in guest_rows:
        s = stats[eid]
        if inv_st != "CANCELLED":
            s["total_guests"] += int(cnt)
            s["total_companions"] += int(comps)
            s["total_people"] += int(cnt) + int(comps)
        if inv_st == "CONFIRMED":
            s["confirmed_guests"] += int(cnt)
        if chk_st == "CHECKED_IN":
            s["checked_in"] += int(cnt)

    ticket_rows = (
        db.query(EventTicket.event_id, EventTicket.status, func.count(EventTicket.id))
        .filter(EventTicket.company_id == company_id, EventTicket.event_id.in_(event_ids))
        .group_by(EventTicket.event_id, EventTicket.status)
        .all()
    )
    for eid, tk_st, cnt in ticket_rows:
        s = stats[eid]
        if tk_st == "AVAILABLE":
            s["tickets_available"] += int(cnt)
        elif tk_st in ("RESERVED", "QUEUED"):
            s["tickets_reserved"] += int(cnt)
        elif tk_st in ("SENT", "DELIVERED"):
            s["tickets_sent"] += int(cnt)

    return stats


@router.get("/events")
def list_managed_events(
    status_filter: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    q = db.query(ManagedEvent).options(joinedload(ManagedEvent.venue)).filter(ManagedEvent.company_id == comp.id)
    if status_filter and status_filter != "ALL":
        q = q.filter(ManagedEvent.status == status_filter)
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                ManagedEvent.title.ilike(term),
                ManagedEvent.code.ilike(term),
                ManagedEvent.custom_location_name.ilike(term),
                ManagedEvent.city.ilike(term),
            )
        )
    events = q.order_by(ManagedEvent.event_date.desc(), ManagedEvent.id.desc()).all()
    stats_map = _compute_event_stats_map(db, comp.id, [e.id for e in events])
    return [_serialize_event(ev, stats_map.get(ev.id)) for ev in events]


@router.get("/events/{event_id}")
def get_single_managed_event(
    event_id: int,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    ev = (
        db.query(ManagedEvent)
        .options(joinedload(ManagedEvent.venue))
        .filter(ManagedEvent.id == event_id, ManagedEvent.company_id == comp.id)
        .first()
    )
    if not ev:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")

    stats_map = _compute_event_stats_map(db, comp.id, [ev.id])
    ev_serialized = _serialize_event(ev, stats_map.get(ev.id))

    # Breakdown detalhado por setor para a ficha dedicada do evento e portaria
    sector_stats: Dict[str, Dict[str, int]] = {}
    for sec in ev_serialized.get("sectors") or []:
        s_key = str(sec.get("key") or "VIP").upper()
        sector_stats[s_key] = {
            "quota": int(sec.get("courtesy_quota") or 0),
            "guests": 0,
            "people": 0,
            "confirmed": 0,
            "checked_in": 0,
            "tickets_available": 0,
            "tickets_sent": 0,
        }

    g_rows = (
        db.query(
            EventGuest.sector_key,
            EventGuest.invite_status,
            EventGuest.checkin_status,
            func.count(EventGuest.id),
            func.coalesce(func.sum(EventGuest.companions_count), 0),
        )
        .filter(EventGuest.company_id == comp.id, EventGuest.event_id == ev.id)
        .group_by(EventGuest.sector_key, EventGuest.invite_status, EventGuest.checkin_status)
        .all()
    )
    for sk, inv_st, chk_st, cnt, comps in g_rows:
        sk_up = (sk or "VIP").upper()
        if sk_up not in sector_stats:
            sector_stats[sk_up] = {
                "quota": 0,
                "guests": 0,
                "people": 0,
                "confirmed": 0,
                "checked_in": 0,
                "tickets_available": 0,
                "tickets_sent": 0,
            }
        if inv_st != "CANCELLED":
            sector_stats[sk_up]["guests"] += int(cnt)
            sector_stats[sk_up]["people"] += int(cnt) + int(comps)
        if inv_st == "CONFIRMED":
            sector_stats[sk_up]["confirmed"] += int(cnt)
        if chk_st == "CHECKED_IN":
            sector_stats[sk_up]["checked_in"] += int(cnt)

    t_rows = (
        db.query(EventTicket.sector_key, EventTicket.status, func.count(EventTicket.id))
        .filter(EventTicket.company_id == comp.id, EventTicket.event_id == ev.id)
        .group_by(EventTicket.sector_key, EventTicket.status)
        .all()
    )
    for sk, tk_st, cnt in t_rows:
        sk_up = (sk or "VIP").upper()
        if sk_up not in sector_stats:
            sector_stats[sk_up] = {
                "quota": 0,
                "guests": 0,
                "people": 0,
                "confirmed": 0,
                "checked_in": 0,
                "tickets_available": 0,
                "tickets_sent": 0,
            }
        if tk_st == "AVAILABLE":
            sector_stats[sk_up]["tickets_available"] += int(cnt)
        elif tk_st in ("SENT", "DELIVERED"):
            sector_stats[sk_up]["tickets_sent"] += int(cnt)

    ev_serialized["sector_stats"] = sector_stats
    return ev_serialized


@router.post("/events")
def create_managed_event(
    payload: EventPayload,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)

    venue = None
    if payload.venue_id:
        venue = db.query(EventVenue).filter(EventVenue.id == payload.venue_id, EventVenue.company_id == comp.id).first()
        if not venue:
            raise HTTPException(status_code=404, detail="Casa de show selecionada não pertence a esta empresa.")

    sectors = payload.sectors
    if not sectors and venue and venue.default_sectors_json:
        sectors = venue.default_sectors_json
    if not sectors:
        sectors = [
            {"key": "VIP", "name": "Área VIP", "courtesy_quota": 100, "face_value": 0},
            {"key": "PISTA", "name": "Pista", "courtesy_quota": 200, "face_value": 0},
            {"key": "CAMAROTE", "name": "Camarote", "courtesy_quota": 50, "face_value": 0},
        ]

    seq_count = (db.query(func.count(ManagedEvent.id)).filter(ManagedEvent.company_id == comp.id).scalar() or 0) + 1
    code = (payload.code or "").strip().upper() or f"EVT-{payload.event_date.year}-{seq_count:03d}"

    ev = ManagedEvent(
        company_id=comp.id,
        code=code,
        title=payload.title.strip(),
        subtitle=payload.subtitle,
        description=payload.description,
        status=payload.status,
        event_date=payload.event_date,
        doors_open_time=payload.doors_open_time,
        start_time=payload.start_time,
        end_time=payload.end_time,
        list_cutoff_time=payload.list_cutoff_time,
        venue_id=venue.id if venue else None,
        custom_location_name=payload.custom_location_name,
        zip_code=payload.zip_code or (venue.zip_code if venue else None),
        street=payload.street or (venue.street if venue else None),
        number=payload.number or (venue.number if venue else None),
        complement=payload.complement or (venue.complement if venue else None),
        neighborhood=payload.neighborhood or (venue.neighborhood if venue else None),
        city=payload.city or (venue.city if venue else None),
        state=payload.state or (venue.state if venue else None),
        maps_url=payload.maps_url or (venue.maps_url if venue else None),
        age_rating=payload.age_rating or (venue.age_rating if venue else "18+"),
        dress_code=payload.dress_code,
        banner_url=payload.banner_url,
        flyer_vertical_url=payload.flyer_vertical_url,
        ticket_mode=payload.ticket_mode,
        dispatch_flow_mode=payload.dispatch_flow_mode,
        auto_send_ticket_on_rsvp=payload.auto_send_ticket_on_rsvp,
        max_guests_limit=payload.max_guests_limit,
        sectors_json=sectors,
        public_rsvp_token=secrets.token_urlsafe(18),
        public_rsvp_enabled=payload.public_rsvp_enabled,
        public_rsvp_max_slots=payload.public_rsvp_max_slots,
        created_by_user_id=current_user.id,
    )
    db.add(ev)
    db.flush()

    _log_audit(
        db,
        comp.id,
        "EVENT",
        "EVENT_CREATED",
        f"Evento '{ev.title}' ({ev.event_date.strftime('%d/%m/%Y')}) criado com código {ev.code}.",
        user=current_user,
        event_id=ev.id,
    )
    db.commit()
    db.refresh(ev)
    return _serialize_event(ev)


@router.put("/events/{event_id}")
def update_managed_event(
    event_id: int,
    payload: EventPayload,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    ev = db.query(ManagedEvent).filter(ManagedEvent.id == event_id, ManagedEvent.company_id == comp.id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")

    changes = {}
    if ev.title != payload.title.strip():
        changes["title"] = [ev.title, payload.title.strip()]
    if ev.event_date != payload.event_date:
        changes["event_date"] = [ev.event_date.isoformat(), payload.event_date.isoformat()]
    if ev.status != payload.status:
        changes["status"] = [ev.status, payload.status]

    ev.title = payload.title.strip()
    if payload.code:
        ev.code = payload.code.strip().upper()
    ev.subtitle = payload.subtitle
    ev.description = payload.description
    ev.status = payload.status
    ev.event_date = payload.event_date
    ev.doors_open_time = payload.doors_open_time
    ev.start_time = payload.start_time
    ev.end_time = payload.end_time
    ev.list_cutoff_time = payload.list_cutoff_time
    ev.venue_id = payload.venue_id
    ev.custom_location_name = payload.custom_location_name
    ev.zip_code = payload.zip_code
    ev.street = payload.street
    ev.number = payload.number
    ev.complement = payload.complement
    ev.neighborhood = payload.neighborhood
    ev.city = payload.city
    ev.state = payload.state
    ev.maps_url = payload.maps_url
    ev.age_rating = payload.age_rating
    ev.dress_code = payload.dress_code
    ev.banner_url = payload.banner_url
    ev.flyer_vertical_url = payload.flyer_vertical_url
    ev.ticket_mode = payload.ticket_mode
    ev.dispatch_flow_mode = payload.dispatch_flow_mode
    ev.auto_send_ticket_on_rsvp = payload.auto_send_ticket_on_rsvp
    ev.max_guests_limit = payload.max_guests_limit
    if payload.sectors is not None:
        ev.sectors_json = payload.sectors
    ev.public_rsvp_enabled = payload.public_rsvp_enabled
    ev.public_rsvp_max_slots = payload.public_rsvp_max_slots

    _log_audit(
        db,
        comp.id,
        "EVENT",
        "EVENT_UPDATED",
        f"Evento '{ev.title}' atualizado.",
        user=current_user,
        event_id=ev.id,
        details={"changes": changes},
    )
    db.commit()
    db.refresh(ev)
    stats_map = _compute_event_stats_map(db, comp.id, [ev.id])
    return _serialize_event(ev, stats_map.get(ev.id))


# ============================================================================
# 5. CRM DE CONVIDADOS ANTI-DUPLICIDADE (evm_contact) & HISTÓRICO 360º
# ============================================================================

@router.get("/contacts/lookup-phone")
def lookup_contact_by_phone(
    phone: str = Query(...),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    try:
        norm = normalize_br_phone(phone)
    except ValueError as exc:
        return {"valid": False, "error": str(exc), "exists": False, "contact": None}

    existing = _find_duplicate_contact(db, comp.id, norm["phone_canonical"], norm["phone_base_8"])
    return {
        "valid": True,
        "error": None,
        "normalized": norm,
        "exists": bool(existing),
        "contact": _serialize_contact(existing) if existing else None,
    }


@router.get("/contacts")
def list_contacts(
    search: Optional[str] = Query(None),
    category_tag: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    q = db.query(EventContact).filter(EventContact.company_id == comp.id)
    if category_tag and category_tag != "ALL":
        q = q.filter(EventContact.category_tag == category_tag)
    if search and search.strip():
        s = search.strip()
        digits = re.sub(r"\D", "", s)
        filters = [
            EventContact.full_name.ilike(f"%{s}%"),
            EventContact.nickname.ilike(f"%{s}%"),
            EventContact.email.ilike(f"%{s}%"),
            EventContact.instagram.ilike(f"%{s}%"),
            EventContact.company_org.ilike(f"%{s}%"),
            EventContact.origin_promoter_name.ilike(f"%{s}%"),
        ]
        if digits:
            filters.append(EventContact.phone_canonical.ilike(f"%{digits}%"))
            filters.append(EventContact.cpf.ilike(f"%{digits}%"))
        q = q.filter(or_(*filters))

    total = q.count()
    rows = q.order_by(EventContact.full_name.asc(), EventContact.id.desc()).offset(offset).limit(limit).all()
    return {"total": total, "items": [_serialize_contact(c) for c in rows]}


@router.get("/contacts/{contact_id}/history")
def get_contact_full_history(
    contact_id: int,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    contact = db.query(EventContact).filter(EventContact.id == contact_id, EventContact.company_id == comp.id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contato não encontrado.")

    participations = (
        db.query(EventGuest)
        .options(joinedload(EventGuest.event), joinedload(EventGuest.assigned_ticket))
        .filter(EventGuest.company_id == comp.id, EventGuest.contact_id == contact.id)
        .order_by(EventGuest.created_at.desc())
        .all()
    )

    events_timeline = []
    for g in participations:
        ev = g.event
        tk_list = getattr(g, "assigned_ticket", None)
        tk = tk_list[0] if isinstance(tk_list, list) and tk_list else (tk_list if isinstance(tk_list, EventTicket) else None)
        events_timeline.append({
            "guest_id": g.id,
            "event_id": g.event_id,
            "event_title": ev.title if ev else f"Evento #{g.event_id}",
            "event_date": ev.event_date.isoformat() if ev and ev.event_date else None,
            "sector_key": g.sector_key,
            "promoter_name": g.promoter_name,
            "added_via": g.added_via,
            "invite_status": g.invite_status,
            "ticket_delivery_status": g.ticket_delivery_status,
            "ticket_number": tk.ticket_number if tk else None,
            "checkin_status": g.checkin_status,
            "checked_in_at": _fmt_dt(g.checked_in_at),
            "created_at": _fmt_dt(g.created_at),
        })

    logs = (
        db.query(EventAuditLog)
        .filter(EventAuditLog.company_id == comp.id, EventAuditLog.contact_id == contact.id)
        .order_by(EventAuditLog.created_at.desc())
        .limit(50)
        .all()
    )

    return {
        "contact": _serialize_contact(contact),
        "participations": events_timeline,
        "audit_logs": [
            {
                "id": l.id,
                "action": l.action,
                "summary": l.summary,
                "actor_name": l.actor_name,
                "source_channel": l.source_channel,
                "created_at": _fmt_dt(l.created_at),
            }
            for l in logs
        ],
    }


@router.post("/contacts")
def create_contact(
    payload: ContactPayload,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    try:
        norm = normalize_br_phone(payload.phone)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    dup = _find_duplicate_contact(db, comp.id, norm["phone_canonical"], norm["phone_base_8"])
    if dup:
        raise HTTPException(
            status_code=409,
            detail=f"Este número já está cadastrado neste Seller em nome de '{dup.full_name}' ({dup.phone_display} — {dup.total_events_invited} evento(s) no histórico). Selecione o contato existente para evitar duplicidade.",
        )

    clean_cpf = re.sub(r"\D", "", payload.cpf or "") or None
    insta = payload.instagram.strip() if payload.instagram else None
    if insta and not insta.startswith("@"):
        insta = f"@{insta}"

    contact = EventContact(
        company_id=comp.id,
        full_name=payload.full_name.strip(),
        nickname=(payload.nickname or "").strip() or payload.full_name.strip().split(" ")[0],
        phone_display=norm["phone_display"],
        phone_ddd=norm["phone_ddd"],
        phone_canonical=norm["phone_canonical"],
        phone_base_8=norm["phone_base_8"],
        secondary_phone=payload.secondary_phone,
        email=payload.email,
        cpf=clean_cpf,
        rg=payload.rg,
        birth_date=payload.birth_date,
        gender=payload.gender,
        instagram=insta,
        company_org=payload.company_org,
        job_title=payload.job_title,
        city=payload.city,
        state=payload.state,
        category_tag=payload.category_tag,
        tags_json=payload.tags or [],
        origin_source=payload.origin_source,
        origin_promoter_name=payload.origin_promoter_name or current_user.name,
        is_blocked=payload.is_blocked,
        block_reason=payload.block_reason,
        notes=payload.notes,
    )
    db.add(contact)
    db.flush()
    _log_audit(
        db,
        comp.id,
        "CONTACT",
        "CONTACT_CREATED",
        f"Contato '{contact.full_name}' ({contact.phone_display}) adicionado ao CRM.",
        user=current_user,
        contact_id=contact.id,
    )
    db.commit()
    db.refresh(contact)
    return _serialize_contact(contact)


@router.put("/contacts/{contact_id}")
def update_contact(
    contact_id: int,
    payload: ContactPayload,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    contact = db.query(EventContact).filter(EventContact.id == contact_id, EventContact.company_id == comp.id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contato não encontrado.")

    try:
        norm = normalize_br_phone(payload.phone)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    dup = _find_duplicate_contact(db, comp.id, norm["phone_canonical"], norm["phone_base_8"], exclude_id=contact.id)
    if dup:
        raise HTTPException(
            status_code=409,
            detail=f"Não é possível alterar para {norm['phone_display']}: este telefone já pertence a '{dup.full_name}'.",
        )

    contact.full_name = payload.full_name.strip()
    contact.nickname = (payload.nickname or "").strip() or payload.full_name.strip().split(" ")[0]
    contact.phone_display = norm["phone_display"]
    contact.phone_ddd = norm["phone_ddd"]
    contact.phone_canonical = norm["phone_canonical"]
    contact.phone_base_8 = norm["phone_base_8"]
    contact.secondary_phone = payload.secondary_phone
    contact.email = payload.email
    contact.cpf = re.sub(r"\D", "", payload.cpf or "") or None
    contact.rg = payload.rg
    contact.birth_date = payload.birth_date
    contact.gender = payload.gender
    insta = payload.instagram.strip() if payload.instagram else None
    contact.instagram = f"@{insta}" if (insta and not insta.startswith("@")) else insta
    contact.company_org = payload.company_org
    contact.job_title = payload.job_title
    contact.city = payload.city
    contact.state = payload.state
    contact.category_tag = payload.category_tag
    contact.tags_json = payload.tags or []
    contact.is_blocked = payload.is_blocked
    contact.block_reason = payload.block_reason
    contact.notes = payload.notes

    _log_audit(
        db,
        comp.id,
        "CONTACT",
        "CONTACT_UPDATED",
        f"Ficha do contato '{contact.full_name}' ({contact.phone_display}) atualizada.",
        user=current_user,
        contact_id=contact.id,
    )
    db.commit()
    db.refresh(contact)
    return _serialize_contact(contact)


@router.post("/contacts/parse-smart-paste")
def parse_smart_paste_contacts(
    payload: SmartPasteRequest,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    parsed = extract_contacts_from_free_text(payload.raw_text)
    seen_in_batch = set()
    enriched = []
    for item in parsed:
        if item.get("valid"):
            canon = item["phone_canonical"]
            if canon in seen_in_batch:
                item["valid"] = False
                item["error"] = "Telefone repetido dentro do próprio texto colado."
            else:
                seen_in_batch.add(canon)
                existing = _find_duplicate_contact(db, comp.id, canon, item["phone_base_8"])
                if existing:
                    item["already_in_crm"] = True
                    item["existing_contact_id"] = existing.id
                    item["existing_name"] = existing.full_name
                    item["past_events_count"] = existing.total_events_invited or 0
                else:
                    item["already_in_crm"] = False
        enriched.append(item)
    return {"items": enriched}


@router.post("/contacts/bulk-import-parsed")
def bulk_import_parsed_contacts(
    payload: BulkImportContactsRequest,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    ev = None
    if payload.event_id:
        ev = db.query(ManagedEvent).filter(ManagedEvent.id == payload.event_id, ManagedEvent.company_id == comp.id).first()
        if not ev:
            raise HTTPException(status_code=404, detail="Evento de destino não encontrado.")

    created_contacts = 0
    reused_contacts = 0
    linked_to_event = 0
    skipped_errors = []

    for row in payload.contacts:
        raw_phone = str(row.get("phone_canonical") or row.get("phone") or row.get("phone_display") or "").strip()
        name = str(row.get("full_name") or "").strip()
        if not raw_phone:
            continue
        try:
            norm = normalize_br_phone(raw_phone)
        except ValueError as exc:
            skipped_errors.append({"name": name, "error": str(exc)})
            continue

        contact = _find_duplicate_contact(db, comp.id, norm["phone_canonical"], norm["phone_base_8"])
        if contact:
            reused_contacts += 1
            if not contact.instagram and row.get("instagram"):
                contact.instagram = row.get("instagram")
            if not contact.email and row.get("email"):
                contact.email = row.get("email")
        else:
            contact = EventContact(
                company_id=comp.id,
                full_name=name or f"Convidado {norm['phone_display']}",
                nickname=(name.split(" ")[0] if name else "Convidado"),
                phone_display=norm["phone_display"],
                phone_ddd=norm["phone_ddd"],
                phone_canonical=norm["phone_canonical"],
                phone_base_8=norm["phone_base_8"],
                email=row.get("email"),
                instagram=row.get("instagram"),
                category_tag=row.get("category_tag") or "CONVIDADO",
                origin_source=payload.source_channel,
                origin_promoter_name=payload.promoter_name or current_user.name,
            )
            db.add(contact)
            db.flush()
            created_contacts += 1

        if ev and not contact.is_blocked:
            already_guest = (
                db.query(EventGuest)
                .filter(EventGuest.event_id == ev.id, EventGuest.contact_id == contact.id)
                .first()
            )
            if not already_guest:
                db.add(
                    EventGuest(
                        company_id=comp.id,
                        event_id=ev.id,
                        contact_id=contact.id,
                        sector_key=payload.sector_key or "VIP",
                        promoter_name=payload.promoter_name or current_user.name,
                        added_via=payload.source_channel,
                        rsvp_token=secrets.token_urlsafe(20),
                        added_by_user_id=current_user.id,
                    )
                )
                contact.total_events_invited = (contact.total_events_invited or 0) + 1
                contact.last_event_at = datetime.now(BRT_TZ)
                linked_to_event += 1

    _log_audit(
        db,
        comp.id,
        "GUEST_LIST" if ev else "CONTACT",
        "BULK_CONTACTS_IMPORTED",
        f"Captação rápida ({payload.source_channel}): {created_contacts} novos no CRM, {reused_contacts} reaproveitados, {linked_to_event} vinculados ao evento.",
        user=current_user,
        source_channel="WEB_MOBILE" if "MOBILE" in payload.source_channel else "WEB_DESKTOP",
        event_id=ev.id if ev else None,
    )
    db.commit()
    return {
        "created_contacts": created_contacts,
        "reused_contacts": reused_contacts,
        "linked_to_event": linked_to_event,
        "errors": skipped_errors,
    }


# ============================================================================
# 6. LISTA DE CONVIDADOS DO EVENTO, PLANILHA EXCEL/CSV E CHECK-IN
# ============================================================================

@router.get("/events/{event_id}/guests")
def list_event_guests(
    event_id: int,
    sector_key: Optional[str] = Query(None),
    invite_status: Optional[str] = Query(None),
    ticket_status: Optional[str] = Query(None),
    checkin_status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    ev = db.query(ManagedEvent).filter(ManagedEvent.id == event_id, ManagedEvent.company_id == comp.id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")

    q = (
        db.query(EventGuest)
        .join(EventContact, EventContact.id == EventGuest.contact_id)
        .options(joinedload(EventGuest.contact), joinedload(EventGuest.assigned_ticket))
        .filter(EventGuest.company_id == comp.id, EventGuest.event_id == ev.id)
    )
    if sector_key and sector_key != "ALL":
        q = q.filter(EventGuest.sector_key == sector_key)
    if invite_status and invite_status != "ALL":
        q = q.filter(EventGuest.invite_status == invite_status)
    if ticket_status and ticket_status != "ALL":
        q = q.filter(EventGuest.ticket_delivery_status == ticket_status)
    if checkin_status and checkin_status != "ALL":
        q = q.filter(EventGuest.checkin_status == checkin_status)
    if search and search.strip():
        s = search.strip()
        digits = re.sub(r"\D", "", s)
        conds = [
            EventContact.full_name.ilike(f"%{s}%"),
            EventContact.nickname.ilike(f"%{s}%"),
            EventGuest.promoter_name.ilike(f"%{s}%"),
            EventContact.instagram.ilike(f"%{s}%"),
        ]
        if digits:
            conds.append(EventContact.phone_canonical.ilike(f"%{digits}%"))
            conds.append(EventContact.cpf.ilike(f"%{digits}%"))
        q = q.filter(or_(*conds))

    rows = q.order_by(EventContact.full_name.asc()).all()
    return [_serialize_guest(g) for g in rows]


@router.post("/events/{event_id}/guests")
def add_guest_to_event(
    event_id: int,
    payload: AddEventGuestPayload,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    ev = db.query(ManagedEvent).filter(ManagedEvent.id == event_id, ManagedEvent.company_id == comp.id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")

    contact: Optional[EventContact] = None
    was_reused = False

    if payload.contact_id:
        contact = db.query(EventContact).filter(EventContact.id == payload.contact_id, EventContact.company_id == comp.id).first()
        if not contact:
            raise HTTPException(status_code=404, detail="Contato selecionado não encontrado no CRM.")
        was_reused = True
    else:
        if not payload.phone or not payload.full_name:
            raise HTTPException(status_code=400, detail="Informe o Nome Completo e o Telefone com DDD para adicionar o convidado.")
        try:
            norm = normalize_br_phone(payload.phone)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        contact = _find_duplicate_contact(db, comp.id, norm["phone_canonical"], norm["phone_base_8"])
        if contact:
            was_reused = True
            # Enriquece campos que estavam em branco no CRM sem sobrescrever o que já tinha
            if not contact.cpf and payload.cpf:
                contact.cpf = re.sub(r"\D", "", payload.cpf)
            if not contact.email and payload.email:
                contact.email = payload.email
            if not contact.instagram and payload.instagram:
                ig = payload.instagram.strip()
                contact.instagram = f"@{ig}" if not ig.startswith("@") else ig
            if not contact.company_org and payload.company_org:
                contact.company_org = payload.company_org
        else:
            ig = payload.instagram.strip() if payload.instagram else None
            contact = EventContact(
                company_id=comp.id,
                full_name=payload.full_name.strip(),
                nickname=(payload.nickname or "").strip() or payload.full_name.strip().split(" ")[0],
                phone_display=norm["phone_display"],
                phone_ddd=norm["phone_ddd"],
                phone_canonical=norm["phone_canonical"],
                phone_base_8=norm["phone_base_8"],
                cpf=re.sub(r"\D", "", payload.cpf or "") or None,
                email=payload.email,
                instagram=f"@{ig}" if (ig and not ig.startswith("@")) else ig,
                company_org=payload.company_org,
                category_tag=payload.category_tag or "CONVIDADO",
                origin_source=payload.added_via,
                origin_promoter_name=payload.promoter_name or current_user.name,
            )
            db.add(contact)
            db.flush()

    if contact.is_blocked:
        raise HTTPException(
            status_code=400,
            detail=f"O contato '{contact.full_name}' possui restrição/bloqueio ativo no CRM: {contact.block_reason or 'Sem motivo detalhado'}.",
        )

    existing_guest = (
        db.query(EventGuest)
        .filter(EventGuest.event_id == ev.id, EventGuest.contact_id == contact.id)
        .first()
    )
    if existing_guest:
        raise HTTPException(
            status_code=409,
            detail=f"'{contact.full_name}' ({contact.phone_display}) já está na lista deste evento (Setor: {existing_guest.sector_key}).",
        )

    guest = EventGuest(
        company_id=comp.id,
        event_id=ev.id,
        contact_id=contact.id,
        sector_key=payload.sector_key,
        access_type=payload.access_type,
        companions_count=max(0, payload.companions_count or 0),
        companions_names=payload.companions_names,
        courtesy_value=max(0.0, payload.courtesy_value or 0.0),
        promoter_name=payload.promoter_name or current_user.name,
        added_via=payload.added_via,
        invite_status=payload.invite_status,
        rsvp_token=secrets.token_urlsafe(20),
        notes=payload.notes,
        added_by_user_id=current_user.id,
    )
    db.add(guest)
    contact.total_events_invited = (contact.total_events_invited or 0) + 1
    if payload.invite_status == "CONFIRMED":
        contact.total_events_confirmed = (contact.total_events_confirmed or 0) + 1
    contact.last_event_at = datetime.now(BRT_TZ)
    db.flush()

    _log_audit(
        db,
        comp.id,
        "GUEST_LIST",
        "GUEST_ADDED",
        f"Convidado '{contact.full_name}' ({contact.phone_display}) incluído no evento '{ev.title}' [Setor: {guest.sector_key}] ({'CRM reaproveitado' if was_reused else 'Novo contato'}).",
        user=current_user,
        source_channel="WEB_MOBILE" if "MOBILE" in payload.added_via else "WEB_DESKTOP",
        event_id=ev.id,
        contact_id=contact.id,
        guest_id=guest.id,
    )
    db.commit()
    db.refresh(guest)
    return {"guest": _serialize_guest(guest), "contact_was_reused": was_reused}


@router.put("/events/{event_id}/guests/{guest_id}")
def update_event_guest(
    event_id: int,
    guest_id: int,
    payload: UpdateEventGuestPayload,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    guest = (
        db.query(EventGuest)
        .options(joinedload(EventGuest.contact), joinedload(EventGuest.assigned_ticket))
        .filter(EventGuest.id == guest_id, EventGuest.event_id == event_id, EventGuest.company_id == comp.id)
        .first()
    )
    if not guest:
        raise HTTPException(status_code=404, detail="Convidado não encontrado nesta lista.")

    diffs = {}
    if payload.sector_key is not None and payload.sector_key != guest.sector_key:
        diffs["sector_key"] = [guest.sector_key, payload.sector_key]
        guest.sector_key = payload.sector_key
    if payload.access_type is not None:
        guest.access_type = payload.access_type
    if payload.companions_count is not None:
        guest.companions_count = max(0, payload.companions_count)
    if payload.companions_names is not None:
        guest.companions_names = payload.companions_names
    if payload.courtesy_value is not None:
        guest.courtesy_value = max(0.0, payload.courtesy_value)
    if payload.promoter_name is not None:
        guest.promoter_name = payload.promoter_name
    if payload.notes is not None:
        guest.notes = payload.notes

    if payload.invite_status is not None and payload.invite_status != guest.invite_status:
        diffs["invite_status"] = [guest.invite_status, payload.invite_status]
        prev_inv = guest.invite_status
        guest.invite_status = payload.invite_status
        if payload.invite_status == "CONFIRMED" and prev_inv != "CONFIRMED" and guest.contact:
            guest.rsvp_responded_at = datetime.now(BRT_TZ)
            guest.contact.total_events_confirmed = (guest.contact.total_events_confirmed or 0) + 1

    if diffs:
        _log_audit(
            db,
            comp.id,
            "GUEST_LIST",
            "GUEST_UPDATED",
            f"Convidado '{guest.contact.full_name if guest.contact else guest.id}' alterado na lista ({', '.join(diffs.keys())}).",
            user=current_user,
            event_id=event_id,
            contact_id=guest.contact_id,
            guest_id=guest.id,
            details={"changes": diffs},
        )
    db.commit()
    db.refresh(guest)
    return _serialize_guest(guest)


@router.delete("/events/{event_id}/guests/{guest_id}")
def remove_event_guest(
    event_id: int,
    guest_id: int,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    guest = (
        db.query(EventGuest)
        .options(joinedload(EventGuest.contact))
        .filter(EventGuest.id == guest_id, EventGuest.event_id == event_id, EventGuest.company_id == comp.id)
        .first()
    )
    if not guest:
        raise HTTPException(status_code=404, detail="Registro não encontrado na lista.")

    assigned_tk = db.query(EventTicket).filter(EventTicket.assigned_guest_id == guest.id).first()
    if assigned_tk and assigned_tk.status in ("SENT", "DELIVERED"):
        raise HTTPException(
            status_code=400,
            detail="Segurança de Ingresso: este convidado já recebeu um ingresso PDF enviado pelo WhatsApp. Altere o status do convidado para CANCELADO em vez de excluí-lo, preservando o rastreio do PDF enviado.",
        )

    if assigned_tk and assigned_tk.status in ("RESERVED", "QUEUED", "SEND_ERROR"):
        assigned_tk.assigned_guest_id = None
        assigned_tk.assigned_at = None
        assigned_tk.status = "AVAILABLE"

    # Cancela itens pendentes na fila de WhatsApp
    db.query(EventDispatchQueue).filter(
        EventDispatchQueue.guest_id == guest.id,
        EventDispatchQueue.status == "PENDING",
    ).update({"status": "CANCELLED"}, synchronize_session=False)

    guest_name = guest.contact.full_name if guest.contact else f"#{guest.id}"
    _log_audit(
        db,
        comp.id,
        "GUEST_LIST",
        "GUEST_REMOVED",
        f"Convidado '{guest_name}' removido da lista do evento #{event_id}.",
        user=current_user,
        event_id=event_id,
        contact_id=guest.contact_id,
    )
    db.delete(guest)
    db.commit()
    return {"ok": True}


@router.post("/events/{event_id}/guests/import-sheet")
async def import_guests_spreadsheet(
    event_id: int,
    file: UploadFile = File(...),
    default_sector: str = Form("VIP"),
    default_promoter: str = Form(""),
    dry_run: bool = Form(False),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    ev = db.query(ManagedEvent).filter(ManagedEvent.id == event_id, ManagedEvent.company_id == comp.id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")

    clean_filename = validate_file_size_and_extension(file, category="sheet", custom_max_size=MAX_SHEET_SIZE_BYTES)
    raw_bytes = await read_file_safely(file, max_size_bytes=MAX_SHEET_SIZE_BYTES)
    ext = Path(clean_filename).suffix.lower()

    raw_rows: List[Dict[str, str]] = []
    if ext == ".csv":
        text = raw_bytes.decode("utf-8-sig", errors="replace")
        sep = ";" if text.count(";") > text.count(",") else ","
        reader = csv.DictReader(io.StringIO(text), delimiter=sep)
        for r in reader:
            raw_rows.append({(k or "").strip().lower(): str(v or "").strip() for k, v in r.items()})
    elif ext in (".xlsx", ".xlsm"):
        wb = openpyxl.load_workbook(io.BytesIO(raw_bytes), read_only=True, data_only=True)
        ws = wb.active
        headers: List[str] = []
        for idx, row in enumerate(ws.iter_rows(values_only=True)):
            if idx == 0:
                headers = [str(c or "").strip().lower() for c in row]
                continue
            if not any(row):
                continue
            row_dict = {}
            for col_i, val in enumerate(row):
                if col_i < len(headers) and headers[col_i]:
                    row_dict[headers[col_i]] = str(val if val is not None else "").strip()
            raw_rows.append(row_dict)
        wb.close()
    else:
        raise HTTPException(status_code=400, detail="Use planilha .XLSX ou .CSV (máx. 10 MB) para importação.")

    def _pick(d: Dict[str, str], keys: List[str]) -> str:
        for k, v in d.items():
            clean_k = re.sub(r"[^a-z0-9]", "", k.lower())
            if clean_k in keys and v:
                return v
        return ""

    new_in_crm = 0
    existing_in_crm = 0
    linked_count = 0
    already_in_event = 0
    invalid_rows = []
    preview_items = []
    seen_phones = set()

    for idx, r in enumerate(raw_rows, start=2):
        name = _pick(r, ["nome", "nomecompleto", "convidado", "name", "fullname", "titular"])
        phone = _pick(r, ["telefone", "whatsapp", "celular", "fone", "phone", "whats", "tel", "dddtelefone"])
        ddd_col = _pick(r, ["ddd"])
        if ddd_col and phone and len(re.sub(r"\D", "", phone)) in (8, 9):
            phone = f"{ddd_col}{phone}"

        sector = _pick(r, ["setor", "area", "pista", "lote", "sector"]) or default_sector
        promoter = _pick(r, ["promoter", "rp", "indicacao", "responsavel", "convidadopor"]) or default_promoter or current_user.name
        cpf = _pick(r, ["cpf", "documento", "doc"])
        email = _pick(r, ["email", "mail"])
        insta = _pick(r, ["instagram", "insta", "arroba"])
        org = _pick(r, ["empresa", "veiculo", "assessoria", "company"])

        if not name and not phone:
            continue

        try:
            norm = normalize_br_phone(phone)
        except ValueError as exc:
            invalid_rows.append({"row": idx, "name": name or "Sem nome", "raw_phone": phone, "reason": str(exc)})
            continue

        if norm["phone_canonical"] in seen_phones:
            invalid_rows.append({"row": idx, "name": name, "raw_phone": phone, "reason": "Telefone repetido dentro da própria planilha."})
            continue
        seen_phones.add(norm["phone_canonical"])

        contact = _find_duplicate_contact(db, comp.id, norm["phone_canonical"], norm["phone_base_8"])
        is_existing = bool(contact)
        if is_existing:
            existing_in_crm += 1
        else:
            new_in_crm += 1

        in_ev = False
        if contact:
            in_ev = (
                db.query(EventGuest.id)
                .filter(EventGuest.event_id == ev.id, EventGuest.contact_id == contact.id)
                .first()
                is not None
            )
            if in_ev:
                already_in_event += 1

        if len(preview_items) < 60:
            preview_items.append({
                "row": idx,
                "full_name": name or (contact.full_name if contact else norm["phone_display"]),
                "phone_display": norm["phone_display"],
                "sector": sector.upper(),
                "status_crm": "JÁ NO CRM" if is_existing else "NOVO CONTATO",
                "past_events": contact.total_events_invited if contact else 0,
                "already_in_event": in_ev,
            })

        if not dry_run:
            if not contact:
                contact = EventContact(
                    company_id=comp.id,
                    full_name=name or f"Convidado {norm['phone_display']}",
                    nickname=(name.split(" ")[0] if name else "Convidado"),
                    phone_display=norm["phone_display"],
                    phone_ddd=norm["phone_ddd"],
                    phone_canonical=norm["phone_canonical"],
                    phone_base_8=norm["phone_base_8"],
                    cpf=re.sub(r"\D", "", cpf) or None,
                    email=email or None,
                    instagram=(f"@{insta}" if insta and not insta.startswith("@") else (insta or None)),
                    company_org=org or None,
                    origin_source="SPREADSHEET",
                    origin_promoter_name=promoter,
                )
                db.add(contact)
                db.flush()
            else:
                if cpf and not contact.cpf:
                    contact.cpf = re.sub(r"\D", "", cpf)
                if email and not contact.email:
                    contact.email = email
                if insta and not contact.instagram:
                    contact.instagram = f"@{insta}" if not insta.startswith("@") else insta

            if not in_ev and not contact.is_blocked:
                db.add(
                    EventGuest(
                        company_id=comp.id,
                        event_id=ev.id,
                        contact_id=contact.id,
                        sector_key=sector.upper(),
                        promoter_name=promoter,
                        added_via="SPREADSHEET",
                        rsvp_token=secrets.token_urlsafe(20),
                        added_by_user_id=current_user.id,
                    )
                )
                contact.total_events_invited = (contact.total_events_invited or 0) + 1
                contact.last_event_at = datetime.now(BRT_TZ)
                linked_count += 1

    if not dry_run:
        _log_audit(
            db,
            comp.id,
            "GUEST_LIST",
            "SPREADSHEET_IMPORTED",
            f"Planilha '{clean_filename}' importada no evento '{ev.title}': {linked_count} vinculados, {new_in_crm} novos no CRM, {len(invalid_rows)} inválidos.",
            user=current_user,
            event_id=ev.id,
        )
        db.commit()

    return {
        "dry_run": dry_run,
        "summary": {
            "total_rows_read": len(raw_rows),
            "new_in_crm": new_in_crm,
            "existing_in_crm": existing_in_crm,
            "already_in_event": already_in_event,
            "linked_count": linked_count if not dry_run else (new_in_crm + existing_in_crm - already_in_event),
            "invalid_count": len(invalid_rows),
        },
        "invalid_rows": invalid_rows[:50],
        "preview": preview_items,
    }


@router.get("/events/{event_id}/guests/export-excel")
def export_event_guests_excel(
    event_id: int,
    filter_mode: str = Query("ALL"),  # ALL, CONFIRMED, CHECKED_IN
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    ev = db.query(ManagedEvent).filter(ManagedEvent.id == event_id, ManagedEvent.company_id == comp.id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")

    q = (
        db.query(EventGuest)
        .join(EventContact, EventContact.id == EventGuest.contact_id)
        .options(joinedload(EventGuest.contact), joinedload(EventGuest.checked_in_by), joinedload(EventGuest.assigned_ticket))
        .filter(EventGuest.company_id == comp.id, EventGuest.event_id == ev.id)
    )
    if filter_mode == "CONFIRMED":
        q = q.filter(EventGuest.invite_status == "CONFIRMED")
    elif filter_mode == "CHECKED_IN":
        q = q.filter(EventGuest.checkin_status == "CHECKED_IN")

    rows = q.order_by(EventGuest.sector_key.asc(), EventContact.full_name.asc()).all()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Lista_Evento"
    ws.append([
        "Nome Completo",
        "Celular / WhatsApp",
        "CPF",
        "Setor",
        "Acompanhantes",
        "Promoter / Origem",
        "Confirmação Presença",
        "Status Ingresso PDF",
        "Portaria (Check-in)",
        "Horário Entrada (BRT)",
        "Liberado Por",
    ])
    for g in rows:
        c = g.contact
        chk_time = g.checked_in_at.astimezone(BRT_TZ).strftime("%d/%m/%Y %H:%M:%S") if g.checked_in_at else ""
        ws.append([
            c.full_name if c else "",
            c.phone_display if c else "",
            c.cpf or "" if c else "",
            g.sector_key,
            g.companions_count or 0,
            g.promoter_name or "",
            g.invite_status,
            g.ticket_delivery_status,
            "ENTROU" if g.checkin_status == "CHECKED_IN" else "PENDENTE",
            chk_time,
            g.checked_in_by.name if getattr(g, "checked_in_by", None) else "",
        ])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    safe_code = re.sub(r"[^a-zA-Z0-9_-]", "_", ev.code or f"evento_{ev.id}")
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="Lista_{safe_code}_{filter_mode}.xlsx"'},
    )


@router.get("/events/{event_id}/portaria/lookup")
def lookup_guest_at_portaria(
    event_id: int,
    q: str = Query(..., min_length=2),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Validador dedicado de Portaria pelo Sistema:
    Localiza se o convidado está na lista daquele evento utilizando Celular (DDD+Número),
    CPF, QR Code ou Nome Completo, apontando se já entrou, se confirmou presença ou se não está na lista.
    """
    comp = _resolve_company(db, current_user, company_id)
    ev = db.query(ManagedEvent).filter(ManagedEvent.id == event_id, ManagedEvent.company_id == comp.id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")

    raw_q = q.strip()
    digits = re.sub(r"\D", "", raw_q)

    base_q = (
        db.query(EventGuest)
        .join(EventContact, EventContact.id == EventGuest.contact_id)
        .options(
            joinedload(EventGuest.contact),
            joinedload(EventGuest.checked_in_by),
            joinedload(EventGuest.assigned_ticket),
        )
        .filter(EventGuest.company_id == comp.id, EventGuest.event_id == ev.id)
    )

    if "EVMQR:" in raw_q:
        token = raw_q.split("EVMQR:", 1)[1].strip()
        matched_guests = base_q.filter(EventGuest.rsvp_token == token).all()
        detected_type = "QR"
    else:
        conds = [
            EventContact.full_name.ilike(f"%{raw_q}%"),
            EventContact.nickname.ilike(f"%{raw_q}%"),
        ]
        detected_type = "NAME"
        if len(digits) >= 3:
            conds.append(EventContact.cpf.ilike(f"%{digits}%"))
            conds.append(EventContact.phone_canonical.ilike(f"%{digits}%"))
            conds.append(EventContact.phone_base_8.ilike(f"%{digits[-8:]}%" if len(digits) >= 8 else f"%{digits}%"))
            if len(digits) == 11 and digits[2] != "9":
                detected_type = "CPF"
            else:
                detected_type = "PHONE_OR_CPF"
        matched_guests = base_q.filter(or_(*conds)).order_by(EventContact.full_name.asc()).limit(25).all()

    results = []
    for g in matched_guests:
        c = g.contact
        if (c and c.is_blocked) or g.invite_status == "CANCELLED":
            verdict = "BLOCKED"
        elif g.checkin_status == "CHECKED_IN":
            verdict = "ALREADY_ENTERED"
        elif g.invite_status == "CONFIRMED":
            verdict = "READY_CONFIRMED"
        elif g.invite_status == "DECLINED":
            verdict = "DECLINED_WARN"
        else:
            verdict = "READY_ON_LIST"

        serialized = _serialize_guest(g)
        serialized["portaria_verdict"] = verdict
        results.append(serialized)

    not_in_list_crm = None
    if not results and len(digits) >= 8:
        crm_cand = (
            db.query(EventContact)
            .filter(
                EventContact.company_id == comp.id,
                or_(
                    EventContact.cpf == digits,
                    EventContact.phone_canonical.ilike(f"%{digits[-8:]}%"),
                    EventContact.phone_base_8.ilike(f"%{digits[-8:]}%"),
                ),
            )
            .first()
        )
        if crm_cand:
            not_in_list_crm = _serialize_contact(crm_cand)

    return {
        "query": raw_q,
        "detected_type": detected_type,
        "in_event_list": len(results) > 0,
        "matches": results,
        "not_in_list_crm_contact": not_in_list_crm,
    }


@router.post("/events/{event_id}/checkin")
def perform_event_checkin(
    event_id: int,
    payload: CheckinPayload,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    q = (
        db.query(EventGuest)
        .join(EventContact, EventContact.id == EventGuest.contact_id)
        .options(joinedload(EventGuest.contact), joinedload(EventGuest.checked_in_by), joinedload(EventGuest.assigned_ticket))
        .filter(
            EventGuest.company_id == comp.id,
            EventGuest.event_id == event_id,
        )
    )
    if payload.qr_code:
        raw_qr = payload.qr_code.strip()
        token = raw_qr.split("EVMQR:", 1)[1].strip() if "EVMQR:" in raw_qr else raw_qr.rsplit("/", 1)[-1].strip()
        guest = q.filter(EventGuest.rsvp_token == token).first()
        if not guest:
            raise HTTPException(status_code=404, detail="QR Code inválido ou convidado não consta na lista deste evento.")
    elif payload.guest_id:
        guest = q.filter(EventGuest.id == payload.guest_id).first()
        if not guest:
            raise HTTPException(status_code=404, detail="Convidado não consta na lista deste evento.")
    elif payload.phone_or_cpf:
        digits = re.sub(r"\D", "", payload.phone_or_cpf)
        if len(digits) < 8:
            raise HTTPException(status_code=400, detail="Informe o Celular com DDD ou o CPF completo para validar na portaria.")
        cands = q.filter(
            or_(
                EventContact.cpf == digits,
                EventContact.phone_canonical.ilike(f"%{digits[-8:]}%"),
                EventContact.phone_base_8 == digits[-10:],
            )
        ).all()
        if not cands:
            raise HTTPException(status_code=404, detail="NÃO CONSTA NA LISTA: nenhum convidado encontrado neste evento com este Celular/CPF.")
        if len(cands) > 1:
            raise HTTPException(status_code=409, detail="Mais de um convidado encontrado para esta busca. Selecione na lista abaixo.")
        guest = cands[0]
    else:
        raise HTTPException(status_code=400, detail="Informe o convidado, Celular/CPF ou QR Code para validar na portaria.")

    if not payload.undo:
        if guest.contact and guest.contact.is_blocked:
            raise HTTPException(
                status_code=403,
                detail=f"ENTRADA BLOQUEADA: '{guest.contact.full_name}' possui restrição ativa no CRM ({guest.contact.block_reason or 'Sem motivo detalhado'}).",
            )
        if guest.invite_status == "CANCELLED":
            raise HTTPException(
                status_code=403,
                detail=f"ENTRADA BLOQUEADA: o convite de '{guest.contact.full_name if guest.contact else guest.id}' consta como CANCELADO.",
            )

    # Se a portaria informou/validou o CPF na entrada, grava/atualiza na ficha do contato no CRM
    if payload.cpf_confirmed and guest.contact:
        clean_cpf = re.sub(r"\D", "", payload.cpf_confirmed)
        if len(clean_cpf) == 11:
            guest.contact.cpf = clean_cpf
        elif clean_cpf:
            raise HTTPException(status_code=400, detail="CPF informado na portaria inválido: digite os 11 dígitos do CPF.")

    now_brt = datetime.now(BRT_TZ)
    if payload.undo:
        if guest.checkin_status == "CHECKED_IN" and guest.contact:
            guest.contact.total_checkins = max(0, (guest.contact.total_checkins or 1) - 1)
        guest.checkin_status = "PENDING"
        guest.checked_in_at = None
        guest.checked_in_by_user_id = None
        action_code = "CHECKIN_UNDONE"
        msg = f"Check-in estornado na portaria para '{guest.contact.full_name if guest.contact else guest.id}'."
    else:
        already = guest.checkin_status == "CHECKED_IN"
        if already:
            hora_prev = guest.checked_in_at.astimezone(BRT_TZ).strftime("%H:%M:%S") if guest.checked_in_at else ""
            op_prev = guest.checked_in_by.name if getattr(guest, "checked_in_by", None) else "Portaria"
            return {
                "already_checked_in": True,
                "message": f"ATENÇÃO — DUPLA ENTRADA BLOQUEADA: '{guest.contact.full_name}' JÁ entrou às {hora_prev} (liberado por {op_prev})!",
                "guest": _serialize_guest(guest),
            }
        guest.checkin_status = "CHECKED_IN"
        guest.checked_in_at = now_brt
        guest.checked_in_by_user_id = current_user.id
        if guest.contact:
            guest.contact.total_checkins = (guest.contact.total_checkins or 0) + 1
        method_lbl = {"PHONE": "Celular", "CPF": "CPF", "QR": "QR Code", "LIST": "Lista"}.get(payload.verification_method, payload.verification_method)
        action_code = "GUEST_CHECKED_IN"
        msg = f"Portaria liberada via {method_lbl} para '{guest.contact.full_name if guest.contact else guest.id}' [Setor: {guest.sector_key}]."

    _log_audit(
        db,
        comp.id,
        "CHECKIN",
        action_code,
        msg,
        user=current_user,
        source_channel="PORTARIA",
        event_id=event_id,
        contact_id=guest.contact_id,
        guest_id=guest.id,
        details={"verification_method": payload.verification_method},
    )
    db.commit()
    db.refresh(guest)
    return {"already_checked_in": False, "message": msg, "guest": _serialize_guest(guest)}


# ============================================================================
# 7. COFRE HÍBRIDO DE INGRESSOS PDF / ZIP BLINDADO CONTRA DUPLICIDADE
# ============================================================================

def _extract_ticket_info_from_pdf_page(page_obj: Any, fallback_idx: int) -> Tuple[str, str]:
    text = ""
    try:
        text = (page_obj.extract_text() or "").strip()
    except Exception:
        text = ""
    clean_snippet = re.sub(r"\s+", " ", text)[:580]

    # Tenta encontrar código de ingresso típico (números longos / códigos alfanuméricos de tiqueteira)
    code_match = (
        re.search(r"(?:ingresso|ticket|pedido|c[oó]digo|voucher|localizador)[\s:#\-]*([A-Z0-9\-]{5,24})", clean_snippet, re.IGNORECASE)
        or re.search(r"\b([A-Z]{2,4}\-\d{5,14}|\d{8,16})\b", clean_snippet)
    )
    ticket_code = code_match.group(1) if code_match else f"PG-{fallback_idx:03d}"
    return ticket_code, clean_snippet


@router.get("/events/{event_id}/tickets")
def list_event_tickets(
    event_id: int,
    sector_key: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    ev = db.query(ManagedEvent).filter(ManagedEvent.id == event_id, ManagedEvent.company_id == comp.id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")

    q = (
        db.query(EventTicket)
        .options(joinedload(EventTicket.assigned_guest).joinedload(EventGuest.contact))
        .filter(EventTicket.company_id == comp.id, EventTicket.event_id == ev.id)
    )
    if sector_key and sector_key != "ALL":
        q = q.filter(EventTicket.sector_key == sector_key)
    if status_filter and status_filter != "ALL":
        q = q.filter(EventTicket.status == status_filter)

    tickets = q.order_by(EventTicket.status.asc(), EventTicket.id.asc()).all()

    counts = {"AVAILABLE": 0, "RESERVED": 0, "QUEUED": 0, "SENT": 0, "SEND_ERROR": 0, "INVALIDATED": 0}
    all_counts = (
        db.query(EventTicket.status, func.count(EventTicket.id))
        .filter(EventTicket.company_id == comp.id, EventTicket.event_id == ev.id)
        .group_by(EventTicket.status)
        .all()
    )
    for st, cnt in all_counts:
        counts[st] = counts.get(st, 0) + int(cnt)

    return {
        "counts": counts,
        "items": [
            {
                "id": t.id,
                "batch_code": t.batch_code,
                "sector_key": t.sector_key,
                "ticket_number": t.ticket_number,
                "original_filename": t.original_filename,
                "page_number": t.page_number,
                "file_size_bytes": t.file_size_bytes,
                "extracted_text_snippet": t.extracted_text_snippet,
                "face_value": t.face_value,
                "status": t.status,
                "assigned_guest_id": t.assigned_guest_id,
                "assigned_guest_name": (
                    t.assigned_guest.contact.full_name
                    if (t.assigned_guest and t.assigned_guest.contact)
                    else None
                ),
                "assigned_guest_phone": (
                    t.assigned_guest.contact.phone_display
                    if (t.assigned_guest and t.assigned_guest.contact)
                    else None
                ),
                "sent_at": _fmt_dt(t.sent_at),
                "sent_to_phone": t.sent_to_phone,
                "whatsapp_message_id": t.whatsapp_message_id,
                "invalidated_reason": t.invalidated_reason,
                "created_at": _fmt_dt(t.created_at),
            }
            for t in tickets
        ],
    }


@router.post("/events/{event_id}/tickets/upload")
async def upload_tickets_pdf_or_zip(
    event_id: int,
    file: UploadFile = File(...),
    sector_key: str = Form("VIP"),
    split_pdf_pages: bool = Form(True),
    face_value: float = Form(0.0),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Recebe arquivo .PDF (até 10 MB, individual ou multipágina fatiado 1 pág = 1 ingresso)
    ou arquivo .ZIP (até 15 MB contendo múltiplos PDFs), calcula SHA-256 individual para
    bloquear duplicidade e persiste isolado em uploads/<company_id>/event_management/events/<event_id>/tickets/.
    """
    comp = _resolve_company(db, current_user, company_id)
    ev = db.query(ManagedEvent).filter(ManagedEvent.id == event_id, ManagedEvent.company_id == comp.id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")

    clean_filename = sanitize_filename(file.filename or "ingressos.pdf")
    ext = Path(clean_filename).suffix.lower()
    if ext not in (".pdf", ".zip"):
        raise HTTPException(
            status_code=400,
            detail="Formato não suportado para o Cofre de Ingressos. Envie um arquivo .PDF (até 10 MB) ou .ZIP contendo PDFs (até 15 MB).",
        )

    max_bytes = MAX_DOCUMENT_SIZE_BYTES if ext == ".pdf" else MAX_ABSOLUTE_SIZE_BYTES
    raw_bytes = await read_file_safely(file, max_size_bytes=max_bytes)

    pdf_entries: List[Tuple[str, bytes]] = []
    if ext == ".pdf":
        pdf_entries.append((clean_filename, raw_bytes))
    else:
        try:
            with zipfile.ZipFile(io.BytesIO(raw_bytes)) as zf:
                total_uncompressed = 0
                for info in zf.infolist():
                    if info.is_dir():
                        continue
                    base = os.path.basename(info.filename)
                    if base.startswith(".") or base.startswith("__MACOSX") or not base.lower().endswith(".pdf"):
                        continue
                    total_uncompressed += info.file_size
                    # Proteção contra Zip Bomb (máx 45 MB descompactado)
                    if total_uncompressed > 45 * 1024 * 1024:
                        raise HTTPException(
                            status_code=413,
                            detail="O conteúdo descompactado do arquivo .ZIP ultrapassa o limite seguro de processamento (45 MB). Divida em lotes menores.",
                        )
                    pdf_entries.append((sanitize_filename(base), zf.read(info.filename)))
        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail="O arquivo .ZIP enviado está corrompido ou é inválido.")

    if not pdf_entries:
        raise HTTPException(status_code=400, detail="Nenhum arquivo .PDF válido foi encontrado no pacote enviado.")

    vault_dir = BACKEND_ROOT / "uploads" / str(comp.id) / "event_management" / "events" / str(ev.id) / "tickets"
    vault_dir.mkdir(parents=True, exist_ok=True)
    batch_code = f"LOTE-{datetime.now(BRT_TZ).strftime('%d%m-%H%M')}-{uuid.uuid4().hex[:4].upper()}"

    existing_hashes = {
        h for (h,) in db.query(EventTicket.file_sha256).filter(EventTicket.event_id == ev.id).all()
    }

    imported_count = 0
    skipped_duplicates = 0
    seq_idx = 0

    for orig_name, pdf_bytes in pdf_entries:
        try:
            reader = PdfReader(io.BytesIO(pdf_bytes))
            num_pages = len(reader.pages)
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail=f"O arquivo PDF '{orig_name}' está protegido por senha ou corrompido ({str(exc)[:120]}).",
            )

        if split_pdf_pages and num_pages > 1:
            for p_idx in range(num_pages):
                seq_idx += 1
                writer = PdfWriter()
                page_obj = reader.pages[p_idx]
                writer.add_page(page_obj)
                buf = io.BytesIO()
                writer.write(buf)
                single_bytes = buf.getvalue()

                sha = hashlib.sha256(single_bytes).hexdigest()
                if sha in existing_hashes:
                    skipped_duplicates += 1
                    continue
                existing_hashes.add(sha)

                tk_code, snippet = _extract_ticket_info_from_pdf_page(page_obj, seq_idx)
                disk_name = f"tk_{ev.id}_{sha[:14]}_p{p_idx + 1}.pdf"
                (vault_dir / disk_name).write_bytes(single_bytes)
                rel_path = f"uploads/{comp.id}/event_management/events/{ev.id}/tickets/{disk_name}"

                db.add(
                    EventTicket(
                        company_id=comp.id,
                        event_id=ev.id,
                        batch_code=batch_code,
                        sector_key=sector_key.strip().upper(),
                        ticket_number=tk_code,
                        original_filename=orig_name,
                        page_number=p_idx + 1,
                        file_rel_path=rel_path,
                        file_size_bytes=len(single_bytes),
                        file_sha256=sha,
                        extracted_text_snippet=snippet,
                        face_value=max(0.0, face_value or 0.0),
                        status="AVAILABLE",
                    )
                )
                imported_count += 1
        else:
            seq_idx += 1
            sha = hashlib.sha256(pdf_bytes).hexdigest()
            if sha in existing_hashes:
                skipped_duplicates += 1
                continue
            existing_hashes.add(sha)

            tk_code, snippet = _extract_ticket_info_from_pdf_page(reader.pages[0], seq_idx) if num_pages > 0 else (f"TK-{seq_idx:03d}", "")
            disk_name = f"tk_{ev.id}_{sha[:14]}.pdf"
            (vault_dir / disk_name).write_bytes(pdf_bytes)
            rel_path = f"uploads/{comp.id}/event_management/events/{ev.id}/tickets/{disk_name}"

            db.add(
                EventTicket(
                    company_id=comp.id,
                    event_id=ev.id,
                    batch_code=batch_code,
                    sector_key=sector_key.strip().upper(),
                    ticket_number=tk_code,
                    original_filename=orig_name,
                    page_number=1,
                    file_rel_path=rel_path,
                    file_size_bytes=len(pdf_bytes),
                    file_sha256=sha,
                    extracted_text_snippet=snippet,
                    face_value=max(0.0, face_value or 0.0),
                    status="AVAILABLE",
                )
            )
            imported_count += 1

    _log_audit(
        db,
        comp.id,
        "TICKET_VAULT",
        "TICKETS_UPLOADED",
        f"Remessa {batch_code} processada no evento '{ev.title}': {imported_count} ingresso(s) disponível(is) adicionado(s) no setor {sector_key.upper()} ({skipped_duplicates} duplicado(s) bloqueado(s)).",
        user=current_user,
        event_id=ev.id,
        details={"batch_code": batch_code, "imported": imported_count, "duplicates_blocked": skipped_duplicates},
    )
    db.commit()

    return {
        "batch_code": batch_code,
        "imported_count": imported_count,
        "skipped_duplicates": skipped_duplicates,
        "sector_key": sector_key.strip().upper(),
    }


@router.get("/tickets/{ticket_id}/download")
def download_or_preview_ticket_pdf(
    ticket_id: int,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    tk = db.query(EventTicket).filter(EventTicket.id == ticket_id, EventTicket.company_id == comp.id).first()
    if not tk:
        raise HTTPException(status_code=404, detail="Ingresso PDF não encontrado.")
    abs_path = BACKEND_ROOT / tk.file_rel_path.lstrip("/")
    if not abs_path.exists():
        raise HTTPException(status_code=404, detail="Arquivo físico do ingresso não encontrado no servidor.")
    return FileResponse(path=str(abs_path), media_type="application/pdf", filename=f"{tk.ticket_number or 'ingresso'}_{tk.original_filename}")


@router.post("/events/{event_id}/tickets/assign")
def assign_ticket_to_guest(
    event_id: int,
    payload: AssignTicketPayload,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    guest = (
        db.query(EventGuest)
        .options(joinedload(EventGuest.contact))
        .filter(EventGuest.id == payload.guest_id, EventGuest.event_id == event_id, EventGuest.company_id == comp.id)
        .with_for_update()
        .first()
    )
    if not guest:
        raise HTTPException(status_code=404, detail="Convidado não encontrado na lista do evento.")

    existing_tk = db.query(EventTicket).filter(EventTicket.assigned_guest_id == guest.id).first()
    if existing_tk:
        raise HTTPException(
            status_code=409,
            detail=f"Este convidado já possui o ingresso '{existing_tk.ticket_number or existing_tk.id}' ({existing_tk.status}) vinculado. Não é permitido vincular dois ingressos titulares ao mesmo registro.",
        )

    tk_query = db.query(EventTicket).filter(
        EventTicket.company_id == comp.id,
        EventTicket.event_id == event_id,
        EventTicket.status == "AVAILABLE",
        EventTicket.assigned_guest_id.is_(None),
    )
    if payload.ticket_id:
        ticket = tk_query.filter(EventTicket.id == payload.ticket_id).with_for_update(skip_locked=True).first()
        if not ticket:
            raise HTTPException(status_code=409, detail="O ingresso selecionado não está mais disponível no cofre.")
    else:
        ticket = (
            tk_query.filter(EventTicket.sector_key == guest.sector_key)
            .order_by(EventTicket.id.asc())
            .with_for_update(skip_locked=True)
            .first()
        )
        if not ticket:
            raise HTTPException(
                status_code=400,
                detail=f"Não há ingressos PDF disponíveis no cofre para o setor '{guest.sector_key}'. Faça upload de novos ingressos na aba Cofre PDF/ZIP.",
            )

    ticket.status = "RESERVED"
    ticket.assigned_guest_id = guest.id
    ticket.assigned_at = datetime.now(BRT_TZ)
    ticket.assigned_by_user_id = current_user.id
    guest.ticket_delivery_status = "RESERVED"

    _log_audit(
        db,
        comp.id,
        "TICKET_VAULT",
        "TICKET_RESERVED",
        f"Ingresso #{ticket.id} ({ticket.ticket_number}) reservado para '{guest.contact.full_name if guest.contact else guest.id}' [Setor: {ticket.sector_key}].",
        user=current_user,
        event_id=event_id,
        contact_id=guest.contact_id,
        guest_id=guest.id,
        ticket_id=ticket.id,
    )
    db.commit()
    return {"ok": True, "ticket_id": ticket.id, "ticket_number": ticket.ticket_number}


@router.post("/tickets/{ticket_id}/unassign")
def unassign_reserved_ticket(
    ticket_id: int,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    ticket = db.query(EventTicket).filter(EventTicket.id == ticket_id, EventTicket.company_id == comp.id).with_for_update().first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ingresso não encontrado.")
    if ticket.status in ("SENT", "DELIVERED"):
        raise HTTPException(
            status_code=400,
            detail="Trava Anti-Duplicidade: este ingresso já foi ENVIADO ao convidado e jamais pode voltar ao estoque disponível.",
        )

    prev_guest_id = ticket.assigned_guest_id
    if prev_guest_id:
        g = db.query(EventGuest).filter(EventGuest.id == prev_guest_id).first()
        if g:
            g.ticket_delivery_status = "NONE"

    ticket.assigned_guest_id = None
    ticket.assigned_at = None
    ticket.status = "AVAILABLE"

    _log_audit(
        db,
        comp.id,
        "TICKET_VAULT",
        "TICKET_UNASSIGNED",
        f"Reserva do ingresso #{ticket.id} ({ticket.ticket_number}) desfeita — retornou para DISPONÍVEL.",
        user=current_user,
        event_id=ticket.event_id,
        guest_id=prev_guest_id,
        ticket_id=ticket.id,
    )
    db.commit()
    return {"ok": True}


@router.post("/tickets/{ticket_id}/invalidate")
def invalidate_ticket(
    ticket_id: int,
    payload: InvalidateTicketPayload,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    ticket = db.query(EventTicket).filter(EventTicket.id == ticket_id, EventTicket.company_id == comp.id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ingresso não encontrado.")
    if ticket.status in ("SENT", "DELIVERED"):
        raise HTTPException(status_code=400, detail="Este ingresso já consta como enviado ao convidado.")

    if ticket.assigned_guest_id:
        g = db.query(EventGuest).filter(EventGuest.id == ticket.assigned_guest_id).first()
        if g:
            g.ticket_delivery_status = "NONE"
        ticket.assigned_guest_id = None

    ticket.status = "INVALIDATED"
    ticket.invalidated_reason = payload.reason.strip()

    _log_audit(
        db,
        comp.id,
        "TICKET_VAULT",
        "TICKET_INVALIDATED",
        f"Ingresso #{ticket.id} ({ticket.ticket_number}) inutilizado. Motivo: {ticket.invalidated_reason}",
        user=current_user,
        event_id=ticket.event_id,
        ticket_id=ticket.id,
    )
    db.commit()
    return {"ok": True}


# ============================================================================
# 8. MODELOS DE CONVITES, CONEXÃO WHATSAPP E FILA DE DISPARO ANTI-BLOQUEIO
# ============================================================================

@router.get("/templates")
def list_invite_templates(
    event_id: Optional[int] = Query(None),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    q = db.query(EventInviteTemplate).filter(EventInviteTemplate.company_id == comp.id)
    if event_id:
        q = q.filter(or_(EventInviteTemplate.event_id == event_id, EventInviteTemplate.event_id.is_(None)))
    rows = q.order_by(EventInviteTemplate.is_default.desc(), EventInviteTemplate.id.desc()).all()
    return [
        {
            "id": t.id,
            "event_id": t.event_id,
            "name": t.name,
            "template_purpose": t.template_purpose,
            "image_url": t.image_url,
            "message_body": t.message_body,
            "spintax_greetings": t.spintax_greetings_json or [],
            "is_default": t.is_default,
            "created_at": _fmt_dt(t.created_at),
        }
        for t in rows
    ]


@router.post("/templates")
def create_invite_template(
    payload: InviteTemplatePayload,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    tpl = EventInviteTemplate(
        company_id=comp.id,
        event_id=payload.event_id,
        name=payload.name.strip(),
        template_purpose=payload.template_purpose,
        image_url=payload.image_url,
        message_body=payload.message_body,
        spintax_greetings_json=payload.spintax_greetings or [
            "Olá {{apelido}}, tudo bem?",
            "Oi {{apelido}}, como vai?",
            "Tudo ótimo por aí, {{apelido}}?",
        ],
        is_default=payload.is_default,
    )
    db.add(tpl)
    _log_audit(db, comp.id, "TEMPLATE", "TEMPLATE_CREATED", f"Modelo de convite '{tpl.name}' criado.", user=current_user, event_id=payload.event_id)
    db.commit()
    db.refresh(tpl)
    return {"id": tpl.id, "name": tpl.name}


@router.put("/templates/{template_id}")
def update_invite_template(
    template_id: int,
    payload: InviteTemplatePayload,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    tpl = db.query(EventInviteTemplate).filter(EventInviteTemplate.id == template_id, EventInviteTemplate.company_id == comp.id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Modelo de convite não encontrado.")
    tpl.event_id = payload.event_id
    tpl.name = payload.name.strip()
    tpl.template_purpose = payload.template_purpose
    tpl.image_url = payload.image_url
    tpl.message_body = payload.message_body
    tpl.spintax_greetings_json = payload.spintax_greetings
    tpl.is_default = payload.is_default
    db.commit()
    return {"ok": True}


@router.delete("/templates/{template_id}")
def delete_invite_template(
    template_id: int,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    tpl = db.query(EventInviteTemplate).filter(EventInviteTemplate.id == template_id, EventInviteTemplate.company_id == comp.id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Modelo não encontrado.")
    db.delete(tpl)
    db.commit()
    return {"ok": True}


def _get_or_create_whatsapp_config(db: Session, company_id: int) -> EventWhatsAppConfig:
    cfg = db.query(EventWhatsAppConfig).filter(EventWhatsAppConfig.company_id == company_id).first()
    if not cfg:
        cfg = EventWhatsAppConfig(
            company_id=company_id,
            provider="EVOLUTION",
            enabled=False,
            webhook_secret=secrets.token_urlsafe(24),
        )
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


@router.get("/whatsapp/config")
def get_whatsapp_config(
    request: Request,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    cfg = _get_or_create_whatsapp_config(db, comp.id)
    base_host = str(request.base_url).rstrip("/")
    webhook_url = f"{base_host}/event-management/public/webhook/whatsapp/{cfg.webhook_secret}"
    return {
        "provider": cfg.provider,
        "enabled": cfg.enabled,
        "api_base_url": cfg.api_base_url or "",
        "instance_name": cfg.instance_name or "",
        "api_key_token": cfg.api_key_token or "",
        "client_token": cfg.client_token or "",
        "connected_phone": cfg.connected_phone or "",
        "connection_status": cfg.connection_status,
        "webhook_url": webhook_url,
        "min_delay_seconds": cfg.min_delay_seconds,
        "max_delay_seconds": cfg.max_delay_seconds,
        "batch_size_before_pause": cfg.batch_size_before_pause,
        "batch_pause_seconds": cfg.batch_pause_seconds,
        "daily_limit": cfg.daily_limit,
        "allowed_start_hour": cfg.allowed_start_hour,
        "allowed_end_hour": cfg.allowed_end_hour,
        "simulate_typing": cfg.simulate_typing,
        "verify_whatsapp_before_send": cfg.verify_whatsapp_before_send,
        "queue_paused": cfg.queue_paused,
        "vcard_capture_enabled": cfg.vcard_capture_enabled,
        "authorized_sender_phones": cfg.authorized_sender_phones_json or [],
        "default_capture_event_id": cfg.default_capture_event_id,
        "default_capture_sector": cfg.default_capture_sector,
    }


@router.put("/whatsapp/config")
def save_whatsapp_config(
    payload: WhatsAppConfigPayload,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    cfg = _get_or_create_whatsapp_config(db, comp.id)

    normalized_auth_phones = []
    for raw_p in payload.authorized_sender_phones or []:
        if not str(raw_p).strip():
            continue
        try:
            n = normalize_br_phone(raw_p)
            normalized_auth_phones.append(n["phone_canonical"])
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"Telefone autorizado para bot inválido: {exc}")

    cfg.provider = payload.provider.upper()
    cfg.enabled = payload.enabled
    cfg.api_base_url = (payload.api_base_url or "").strip()
    cfg.instance_name = (payload.instance_name or "").strip()
    cfg.api_key_token = (payload.api_key_token or "").strip()
    cfg.client_token = (payload.client_token or "").strip()
    cfg.connected_phone = payload.connected_phone
    cfg.min_delay_seconds = max(10, payload.min_delay_seconds)
    cfg.max_delay_seconds = max(cfg.min_delay_seconds + 5, payload.max_delay_seconds)
    cfg.batch_size_before_pause = max(5, payload.batch_size_before_pause)
    cfg.batch_pause_seconds = max(60, payload.batch_pause_seconds)
    cfg.daily_limit = max(10, payload.daily_limit)
    cfg.allowed_start_hour = payload.allowed_start_hour
    cfg.allowed_end_hour = payload.allowed_end_hour
    cfg.simulate_typing = payload.simulate_typing
    cfg.verify_whatsapp_before_send = payload.verify_whatsapp_before_send
    cfg.queue_paused = payload.queue_paused
    cfg.vcard_capture_enabled = payload.vcard_capture_enabled
    cfg.authorized_sender_phones_json = list(dict.fromkeys(normalized_auth_phones))
    cfg.default_capture_event_id = payload.default_capture_event_id
    cfg.default_capture_sector = payload.default_capture_sector

    _log_audit(
        db,
        comp.id,
        "WHATSAPP_DISPATCH",
        "WHATSAPP_CONFIG_UPDATED",
        f"Configuração do motor WhatsApp ({cfg.provider}) atualizada — Cadência {cfg.min_delay_seconds}s..{cfg.max_delay_seconds}s.",
        user=current_user,
    )
    db.commit()
    return {"ok": True}


@router.post("/whatsapp/qrcode")
async def fetch_whatsapp_qrcode_and_status(
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    cfg = _get_or_create_whatsapp_config(db, comp.id)
    gateway = WhatsAppEventsGateway(cfg)
    try:
        res = await gateway.get_status_and_qrcode()
        cfg.connection_status = res.get("status", "UNKNOWN")
        db.commit()
        return res
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/events/{event_id}/dispatch")
def enqueue_safe_whatsapp_dispatch(
    event_id: int,
    payload: EnqueueDispatchPayload,
    request: Request,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    ev = (
        db.query(ManagedEvent)
        .options(joinedload(ManagedEvent.venue))
        .filter(ManagedEvent.id == event_id, ManagedEvent.company_id == comp.id)
        .first()
    )
    if not ev:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")

    wa_cfg = _get_or_create_whatsapp_config(db, comp.id)
    tpl = None
    if payload.template_id:
        tpl = db.query(EventInviteTemplate).filter(EventInviteTemplate.id == payload.template_id, EventInviteTemplate.company_id == comp.id).first()

    default_body_map = {
        "INVITE_ONLY": (
            "Você é nosso convidado(a) especial para *{{evento}}*!\n\n"
            "📅 *Data:* {{data}} às {{hora}}\n"
            "📍 *Local:* {{casa}} — {{endereco}}\n"
            "🎟️ *Setor:* {{setor}}\n\n"
            "👉 *Confirme sua presença clicando no link abaixo para liberar seu acesso:*\n{{link_rsvp}}"
        ),
        "TICKET_PDF_ONLY": (
            "Aqui está o seu *Ingresso Oficial em PDF* para *{{evento}}* ({{setor}})! 🎉\n\n"
            "📅 *Data:* {{data}} às {{hora}}\n"
            "📍 *Local:* {{casa}}\n"
            "🗺️ *Mapa:* {{maps}}\n\n"
            "Apresente o PDF na entrada. Bom evento!"
        ),
        "COMBO_INVITE_AND_PDF": (
            "Você está confirmado(a) para *{{evento}}* no setor *{{setor}}*! 🎉\n\n"
            "📅 *Data:* {{data}} às {{hora}}\n"
            "📍 *Local:* {{casa}} — {{endereco}}\n"
            "🗺️ *Como chegar:* {{maps}}\n\n"
            "Em instantes enviaremos o seu *Ingresso Oficial em PDF* logo abaixo 👇"
        ),
        "NATIVE_QR_CARD": (
            "Sua credencial VIP com *QR Code exclusivo* para *{{evento}}* ({{setor}}) está pronta!\n\n"
            "📅 *Data:* {{data}} às {{hora}}\n"
            "📍 *Local:* {{casa}}\n"
            "🗺️ *Mapa:* {{maps}}"
        ),
    }

    msg_template = payload.custom_message or (tpl.message_body if tpl else default_body_map.get(payload.dispatch_mode, default_body_map["INVITE_ONLY"]))
    spintax = tpl.spintax_greetings_json if tpl else ["Olá {{apelido}}, tudo bem?", "Oi {{apelido}}, como vai?", "Fala {{apelido}}, tudo ótimo?"]
    img_url = payload.custom_image_url or (tpl.image_url if tpl else None) or ev.flyer_vertical_url or ev.banner_url

    front_origin = (payload.frontend_origin or os.environ.get("FRONTEND_PUBLIC_URL") or "http://localhost:3000").rstrip("/")
    ev_info = _serialize_event(ev)

    now_brt = datetime.now(BRT_TZ)
    cursor_time = now_brt
    last_scheduled = (
        db.query(func.max(EventDispatchQueue.scheduled_for))
        .filter(EventDispatchQueue.company_id == comp.id, EventDispatchQueue.status == "PENDING")
        .scalar()
    )
    if last_scheduled and last_scheduled > cursor_time:
        cursor_time = last_scheduled

    enqueued = 0
    skipped = []

    guests = (
        db.query(EventGuest)
        .options(joinedload(EventGuest.contact))
        .filter(EventGuest.company_id == comp.id, EventGuest.event_id == ev.id, EventGuest.id.in_(payload.guest_ids))
        .all()
    )

    for idx, g in enumerate(guests, start=1):
        c = g.contact
        if not c or c.is_blocked:
            skipped.append({"guest_id": g.id, "reason": "Contato bloqueado ou inexistente."})
            continue

        mode = payload.dispatch_mode
        ticket_obj: Optional[EventTicket] = None
        pdf_rel_path = None
        pdf_filename = None

        if mode in ("TICKET_PDF_ONLY", "COMBO_INVITE_AND_PDF"):
            # Trava Anti-Duplicidade: se já recebeu ingresso SENT, bloqueia novo disparo comum!
            if g.ticket_delivery_status in ("SENT", "DELIVERED"):
                skipped.append({
                    "guest_id": g.id,
                    "name": c.full_name,
                    "reason": "Ingresso PDF já enviado anteriormente (proteção anti-duplicidade ativa).",
                })
                continue

            ticket_obj = db.query(EventTicket).filter(EventTicket.assigned_guest_id == g.id).with_for_update().first()
            if not ticket_obj and payload.auto_assign_available_pdf:
                ticket_obj = (
                    db.query(EventTicket)
                    .filter(
                        EventTicket.company_id == comp.id,
                        EventTicket.event_id == ev.id,
                        EventTicket.sector_key == g.sector_key,
                        EventTicket.status == "AVAILABLE",
                        EventTicket.assigned_guest_id.is_(None),
                    )
                    .order_by(EventTicket.id.asc())
                    .with_for_update(skip_locked=True)
                    .first()
                )
                if ticket_obj:
                    ticket_obj.assigned_guest_id = g.id
                    ticket_obj.assigned_at = now_brt
                    ticket_obj.assigned_by_user_id = current_user.id

            if not ticket_obj:
                skipped.append({
                    "guest_id": g.id,
                    "name": c.full_name,
                    "reason": f"Sem ingresso PDF disponível no setor '{g.sector_key}'.",
                })
                continue

            ticket_obj.status = "QUEUED"
            g.ticket_delivery_status = "QUEUED_TICKET"
            pdf_rel_path = ticket_obj.file_rel_path
            safe_guest = re.sub(r"[^a-zA-Z0-9]+", "_", c.full_name).strip("_")[:30]
            safe_ev = re.sub(r"[^a-zA-Z0-9]+", "_", ev.title).strip("_")[:24]
            pdf_filename = f"Ingresso_{g.sector_key}_{safe_guest}_{safe_ev}.pdf"

        idemp_key = f"ev{ev.id}_g{g.id}_{mode}"
        existing_q = (
            db.query(EventDispatchQueue)
            .filter(EventDispatchQueue.company_id == comp.id, EventDispatchQueue.idempotency_key == idemp_key)
            .first()
        )
        if existing_q and existing_q.status in ("PENDING", "PROCESSING", "SENT"):
            skipped.append({"guest_id": g.id, "name": c.full_name, "reason": f"Já consta disparo '{mode}' ({existing_q.status})."})
            continue

        if idx > 1:
            jitter = random.randint(max(10, wa_cfg.min_delay_seconds), max(20, wa_cfg.max_delay_seconds))
            if wa_cfg.batch_size_before_pause and (idx % max(5, wa_cfg.batch_size_before_pause) == 0):
                jitter += wa_cfg.batch_pause_seconds
            cursor_time = cursor_time + timedelta(seconds=jitter)

        rsvp_link = f"{front_origin}/convite/{g.rsvp_token}"
        addr_parts = [p for p in [ev_info.get("street"), ev_info.get("number"), ev_info.get("neighborhood"), ev_info.get("city")] if p]
        vars_dict = {
            "nome": c.full_name,
            "nome_completo": c.full_name,
            "apelido": c.nickname or c.full_name.split(" ")[0],
            "primeiro_nome": c.full_name.split(" ")[0],
            "evento": ev.title,
            "data": ev.event_date.strftime("%d/%m/%Y"),
            "hora": ev.doors_open_time or ev.start_time or "21:00",
            "horario_abertura": ev.doors_open_time or ev.start_time or "21:00",
            "casa": ev_info.get("location_display_name") or "Local Confirmado",
            "casa_de_show": ev_info.get("location_display_name") or "Local Confirmado",
            "endereco": ", ".join(addr_parts) or "Consulte no mapa",
            "maps": ev_info.get("maps_url") or rsvp_link,
            "link_maps": ev_info.get("maps_url") or rsvp_link,
            "setor": g.sector_key,
            "link_rsvp": rsvp_link,
        }
        rendered_text = render_invite_message(msg_template, spintax, vars_dict)

        if existing_q:
            existing_q.status = "PENDING"
            existing_q.rendered_message = rendered_text
            existing_q.media_image_url = img_url
            existing_q.pdf_rel_path = pdf_rel_path
            existing_q.pdf_delivery_filename = pdf_filename
            existing_q.ticket_id = ticket_obj.id if ticket_obj else None
            existing_q.scheduled_for = cursor_time
            existing_q.attempts = 0
            existing_q.error_message = None
        else:
            db.add(
                EventDispatchQueue(
                    company_id=comp.id,
                    event_id=ev.id,
                    guest_id=g.id,
                    ticket_id=ticket_obj.id if ticket_obj else None,
                    template_id=tpl.id if tpl else None,
                    dispatch_mode=mode,
                    idempotency_key=idemp_key,
                    recipient_phone=c.phone_canonical,
                    recipient_name=c.full_name,
                    rendered_message=rendered_text,
                    media_image_url=img_url,
                    pdf_rel_path=pdf_rel_path,
                    pdf_delivery_filename=pdf_filename,
                    status="PENDING",
                    priority=10 if len(guests) == 1 else 20,
                    scheduled_for=cursor_time,
                    created_by_user_id=current_user.id,
                )
            )

        if mode == "INVITE_ONLY" and g.invite_status == "PENDING":
            g.invite_status = "QUEUED_INVITE"

        enqueued += 1

    _log_audit(
        db,
        comp.id,
        "WHATSAPP_DISPATCH",
        "DISPATCH_BATCH_ENQUEUED",
        f"{enqueued} disparo(s) enfileirado(s) no modo '{payload.dispatch_mode}' para o evento '{ev.title}' ({len(skipped)} ignorados por proteção).",
        user=current_user,
        event_id=ev.id,
    )
    db.commit()
    return {
        "enqueued": enqueued,
        "skipped": skipped,
        "whatsapp_enabled": wa_cfg.enabled,
        "queue_paused": wa_cfg.queue_paused,
    }


@router.post("/events/{event_id}/guests/{guest_id}/resend-ticket")
def resend_same_assigned_ticket(
    event_id: int,
    guest_id: int,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Política de 2ª via segura: permite reenviar EXCLUSIVAMENTE o mesmo PDF já atrelado
    ao próprio convidado, para o número canônico dele, sem tocar no estoque AVAILABLE.
    """
    comp = _resolve_company(db, current_user, company_id)
    g = (
        db.query(EventGuest)
        .options(joinedload(EventGuest.contact), joinedload(EventGuest.event))
        .filter(EventGuest.id == guest_id, EventGuest.event_id == event_id, EventGuest.company_id == comp.id)
        .first()
    )
    if not g or not g.contact or not g.event:
        raise HTTPException(status_code=404, detail="Convidado não encontrado.")

    ticket = db.query(EventTicket).filter(EventTicket.assigned_guest_id == g.id).first()
    if not ticket:
        raise HTTPException(
            status_code=400,
            detail="Este convidado ainda não possui nenhum ingresso PDF vinculado para reenvio.",
        )

    safe_guest = re.sub(r"[^a-zA-Z0-9]+", "_", g.contact.full_name).strip("_")[:30]
    idemp_key = f"resend_ev{event_id}_g{g.id}_tk{ticket.id}_{uuid.uuid4().hex[:6]}"
    db.add(
        EventDispatchQueue(
            company_id=comp.id,
            event_id=event_id,
            guest_id=g.id,
            ticket_id=ticket.id,
            dispatch_mode="RESEND_SAME_PDF",
            idempotency_key=idemp_key,
            recipient_phone=g.contact.phone_canonical,
            recipient_name=g.contact.full_name,
            rendered_message=f"Olá {g.contact.nickname or g.contact.full_name.split(' ')[0]}, conforme solicitado, segue a 2ª via do seu ingresso oficial para *{g.event.title}* ({g.sector_key}).",
            pdf_rel_path=ticket.file_rel_path,
            pdf_delivery_filename=f"2aVia_Ingresso_{g.sector_key}_{safe_guest}.pdf",
            status="PENDING",
            priority=10,
            scheduled_for=datetime.now(BRT_TZ),
            created_by_user_id=current_user.id,
        )
    )
    _log_audit(
        db,
        comp.id,
        "TICKET_VAULT",
        "TICKET_RESEND_QUEUED",
        f"2ª via do MESMO ingresso #{ticket.id} ({ticket.ticket_number}) enfileirada para '{g.contact.full_name}' ({g.contact.phone_display}).",
        user=current_user,
        event_id=event_id,
        contact_id=g.contact_id,
        guest_id=g.id,
        ticket_id=ticket.id,
    )
    db.commit()
    return {"ok": True}


@router.get("/dispatch-queue")
def list_dispatch_queue(
    event_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None),
    limit: int = Query(150, ge=1, le=500),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    q = db.query(EventDispatchQueue).filter(EventDispatchQueue.company_id == comp.id)
    if event_id:
        q = q.filter(EventDispatchQueue.event_id == event_id)
    if status_filter and status_filter != "ALL":
        q = q.filter(EventDispatchQueue.status == status_filter)

    rows = q.order_by(EventDispatchQueue.id.desc()).limit(limit).all()
    return [
        {
            "id": r.id,
            "event_id": r.event_id,
            "guest_id": r.guest_id,
            "ticket_id": r.ticket_id,
            "dispatch_mode": r.dispatch_mode,
            "recipient_name": r.recipient_name,
            "recipient_phone": r.recipient_phone,
            "status": r.status,
            "attempts": r.attempts,
            "scheduled_for": _fmt_dt(r.scheduled_for),
            "sent_at": _fmt_dt(r.sent_at),
            "provider_message_id": r.provider_message_id,
            "error_message": r.error_message,
        }
        for r in rows
    ]


@router.post("/dispatch-queue/toggle-pause")
def toggle_dispatch_queue_pause(
    paused: bool = Query(...),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    cfg = _get_or_create_whatsapp_config(db, comp.id)
    cfg.queue_paused = paused
    _log_audit(
        db,
        comp.id,
        "WHATSAPP_DISPATCH",
        "QUEUE_PAUSED" if paused else "QUEUE_RESUMED",
        f"Fila de disparos WhatsApp {'PAUSADA manualmente' if paused else 'RETOMADA'}.",
        user=current_user,
    )
    db.commit()
    return {"queue_paused": cfg.queue_paused}


@router.post("/dispatch-queue/{item_id}/cancel")
def cancel_dispatch_queue_item(
    item_id: int,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    item = db.query(EventDispatchQueue).filter(EventDispatchQueue.id == item_id, EventDispatchQueue.company_id == comp.id).first()
    if not item or item.status != "PENDING":
        raise HTTPException(status_code=400, detail="Apenas itens pendentes na fila podem ser cancelados.")
    item.status = "CANCELLED"
    if item.ticket_id:
        tk = db.query(EventTicket).filter(EventTicket.id == item.ticket_id).first()
        if tk and tk.status == "QUEUED":
            tk.status = "RESERVED"
    if item.guest_id:
        g = db.query(EventGuest).filter(EventGuest.id == item.guest_id).first()
        if g and g.ticket_delivery_status == "QUEUED_TICKET":
            g.ticket_delivery_status = "RESERVED"
    db.commit()
    return {"ok": True}


# ============================================================================
# 9. TRILHA COMPLETA DE AUDITORIA (evm_audit_log)
# ============================================================================

@router.get("/audit-logs")
def list_event_audit_logs(
    event_id: Optional[int] = Query(None),
    entity_type: Optional[str] = Query(None),
    limit: int = Query(150, ge=1, le=500),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = _resolve_company(db, current_user, company_id)
    q = db.query(EventAuditLog).filter(EventAuditLog.company_id == comp.id)
    if event_id:
        q = q.filter(EventAuditLog.event_id == event_id)
    if entity_type and entity_type != "ALL":
        q = q.filter(EventAuditLog.entity_type == entity_type)
    logs = q.order_by(EventAuditLog.created_at.desc()).limit(limit).all()
    return [
        {
            "id": l.id,
            "event_id": l.event_id,
            "entity_type": l.entity_type,
            "action": l.action,
            "actor_name": l.actor_name,
            "source_channel": l.source_channel,
            "summary": l.summary,
            "details": l.details_json or {},
            "created_at": _fmt_dt(l.created_at),
        }
        for l in logs
    ]


# ============================================================================
# 10. ROTAS PÚBLICAS: CONFIRMAÇÃO DE CONVITE RSVP (/convite/[token]) E WEBHOOK vCard
# ============================================================================

@router.get("/public/rsvp/{rsvp_token}")
def get_public_rsvp_invite(
    rsvp_token: str,
    db: Session = Depends(get_db),
):
    guest = (
        db.query(EventGuest)
        .options(joinedload(EventGuest.contact), joinedload(EventGuest.event).joinedload(ManagedEvent.venue))
        .filter(EventGuest.rsvp_token == rsvp_token)
        .first()
    )
    if not guest or not guest.event or not guest.contact:
        raise HTTPException(status_code=404, detail="Este convite não foi encontrado ou expirou.")

    ev = guest.event
    ev_data = _serialize_event(ev)
    c = guest.contact

    return {
        "guest_name": c.full_name,
        "guest_nickname": c.nickname or c.full_name.split(" ")[0],
        "sector_key": guest.sector_key,
        "companions_count": guest.companions_count,
        "invite_status": guest.invite_status,
        "ticket_delivery_status": guest.ticket_delivery_status,
        "qr_payload": f"EVMQR:{guest.rsvp_token}" if (ev.ticket_mode in ("HYBRID", "NATIVE_QR") and guest.invite_status == "CONFIRMED") else None,
        "needs_cpf": not bool(c.cpf),
        "needs_email": not bool(c.email),
        "needs_instagram": not bool(c.instagram),
        "event": {
            "title": ev.title,
            "subtitle": ev.subtitle,
            "description": ev.description,
            "event_date": ev_data["event_date"],
            "doors_open_time": ev.doors_open_time,
            "start_time": ev.start_time,
            "location_name": ev_data["location_display_name"],
            "street": ev_data["street"],
            "number": ev_data["number"],
            "neighborhood": ev_data["neighborhood"],
            "city": ev_data["city"],
            "state": ev_data["state"],
            "maps_url": ev_data["maps_url"],
            "age_rating": ev.age_rating,
            "dress_code": ev.dress_code,
            "banner_url": ev.banner_url or ev.flyer_vertical_url,
            "ticket_mode": ev.ticket_mode,
        },
    }


def _auto_enqueue_ticket_after_rsvp(db: Session, ev: ManagedEvent, guest: EventGuest, contact: EventContact) -> bool:
    """Se auto_send_ticket_on_rsvp estiver ativo no evento, aloca e enfileira o PDF oficial automaticamente."""
    if not ev.auto_send_ticket_on_rsvp or guest.ticket_delivery_status in ("SENT", "DELIVERED", "QUEUED_TICKET"):
        return False

    ticket = db.query(EventTicket).filter(EventTicket.assigned_guest_id == guest.id).with_for_update().first()
    if not ticket:
        ticket = (
            db.query(EventTicket)
            .filter(
                EventTicket.company_id == ev.company_id,
                EventTicket.event_id == ev.id,
                EventTicket.sector_key == guest.sector_key,
                EventTicket.status == "AVAILABLE",
                EventTicket.assigned_guest_id.is_(None),
            )
            .order_by(EventTicket.id.asc())
            .with_for_update(skip_locked=True)
            .first()
        )
        if ticket:
            ticket.assigned_guest_id = guest.id
            ticket.assigned_at = datetime.now(BRT_TZ)

    if not ticket:
        return False

    ticket.status = "QUEUED"
    guest.ticket_delivery_status = "QUEUED_TICKET"
    safe_guest = re.sub(r"[^a-zA-Z0-9]+", "_", contact.full_name).strip("_")[:30]
    idemp_key = f"ev{ev.id}_g{guest.id}_TICKET_PDF_ONLY"
    if not db.query(EventDispatchQueue).filter(EventDispatchQueue.company_id == ev.company_id, EventDispatchQueue.idempotency_key == idemp_key).first():
        db.add(
            EventDispatchQueue(
                company_id=ev.company_id,
                event_id=ev.id,
                guest_id=guest.id,
                ticket_id=ticket.id,
                dispatch_mode="TICKET_PDF_ONLY",
                idempotency_key=idemp_key,
                recipient_phone=contact.phone_canonical,
                recipient_name=contact.full_name,
                rendered_message=f"Presença confirmada, {contact.nickname or contact.full_name.split(' ')[0]}! 🎉\nSegue acima o seu *Ingresso Oficial em PDF* para *{ev.title}* ({guest.sector_key}).",
                pdf_rel_path=ticket.file_rel_path,
                pdf_delivery_filename=f"Ingresso_{guest.sector_key}_{safe_guest}.pdf",
                status="PENDING",
                priority=10,
                scheduled_for=datetime.now(BRT_TZ) + timedelta(seconds=15),
            )
        )
    return True


@router.post("/public/rsvp/{rsvp_token}")
def confirm_or_decline_public_rsvp(
    rsvp_token: str,
    payload: PublicRsvpConfirmPayload,
    db: Session = Depends(get_db),
):
    guest = (
        db.query(EventGuest)
        .options(joinedload(EventGuest.contact), joinedload(EventGuest.event))
        .filter(EventGuest.rsvp_token == rsvp_token)
        .first()
    )
    if not guest or not guest.event or not guest.contact:
        raise HTTPException(status_code=404, detail="Este convite não foi encontrado ou não está mais disponível.")

    ev = guest.event
    c = guest.contact
    if ev.status in ("CANCELLED", "FINISHED"):
        raise HTTPException(status_code=400, detail="A lista deste evento já foi encerrada.")

    # Enriquece o CRM com dados informados voluntariamente pelo próprio convidado
    if payload.cpf and not c.cpf:
        c.cpf = re.sub(r"\D", "", payload.cpf)[:14] or None
    if payload.email and not c.email:
        c.email = payload.email.strip()
    if payload.instagram and not c.instagram:
        ig = payload.instagram.strip()
        c.instagram = f"@{ig}" if not ig.startswith("@") else ig
    if payload.birth_date and not c.birth_date:
        c.birth_date = payload.birth_date

    now_brt = datetime.now(BRT_TZ)
    guest.rsvp_responded_at = now_brt
    ticket_queued_now = False

    if payload.decision == "CONFIRM":
        if guest.invite_status != "CONFIRMED":
            c.total_events_confirmed = (c.total_events_confirmed or 0) + 1
        guest.invite_status = "CONFIRMED"
        ticket_queued_now = _auto_enqueue_ticket_after_rsvp(db, ev, guest, c)
        action = "RSVP_CONFIRMED"
        summary = f"Convidado '{c.full_name}' CONFIRMOU presença pelo link do convite."
    else:
        guest.invite_status = "DECLINED"
        # Se havia um PDF apenas RESERVED (não enviado), libera imediatamente de volta para AVAILABLE!
        reserved_tk = db.query(EventTicket).filter(EventTicket.assigned_guest_id == guest.id, EventTicket.status == "RESERVED").first()
        if reserved_tk:
            reserved_tk.assigned_guest_id = None
            reserved_tk.assigned_at = None
            reserved_tk.status = "AVAILABLE"
            guest.ticket_delivery_status = "NONE"
        action = "RSVP_DECLINED"
        summary = f"Convidado '{c.full_name}' informou que NÃO poderá comparecer (vaga liberada)."

    _log_audit(
        db,
        ev.company_id,
        "GUEST_LIST",
        action,
        summary,
        actor_name_override=c.full_name,
        source_channel="PUBLIC_RSVP",
        event_id=ev.id,
        contact_id=c.id,
        guest_id=guest.id,
    )
    db.commit()

    return {
        "invite_status": guest.invite_status,
        "ticket_queued_automatically": ticket_queued_now,
        "qr_payload": f"EVMQR:{guest.rsvp_token}" if (guest.invite_status == "CONFIRMED" and ev.ticket_mode in ("HYBRID", "NATIVE_QR")) else None,
        "message": (
            "Presença confirmada com sucesso! Seu ingresso será enviado diretamente no seu WhatsApp."
            if (payload.decision == "CONFIRM" and ticket_queued_now)
            else (
                "Presença confirmada com sucesso! Nos vemos no evento."
                if payload.decision == "CONFIRM"
                else "Agradecemos por avisar! Esperamos você nos próximos eventos."
            )
        ),
    }


@router.post("/public/webhook/whatsapp/{webhook_secret}")
async def receive_whatsapp_webhook(
    webhook_secret: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Webhook Receptor Inteligente (Evolution API / Z-API / WAHA):
    1) Captura Cartões de Contato (vCard) encaminhados por admins/promoters autorizados -> salva no CRM sem duplicar
       e responde no próprio WhatsApp perguntando se deseja vincular ao próximo evento (Digite '1', '2'...).
    2) Recebe '1', '2' do promoter -> vincula o contato recém-capturado direto na lista do evento!
    3) Recebe 'SIM' / 'NÃO' de convidados -> atualiza RSVP na lista automaticamente!
    """
    wa_cfg = db.query(EventWhatsAppConfig).filter(EventWhatsAppConfig.webhook_secret == webhook_secret).first()
    if not wa_cfg:
        return {"ok": False, "ignored": "invalid_secret"}

    try:
        body = await request.json()
    except Exception:
        return {"ok": True}

    # Ignora eventos enviados pelo próprio bot (fromMe == True) exceto se o próprio dono encaminhar p/ " Mensagens Salvas "
    data_node = body.get("data") if isinstance(body.get("data"), dict) else body
    key_node = data_node.get("key") if isinstance(data_node.get("key"), dict) else {}
    from_me = bool(key_node.get("fromMe") or data_node.get("fromMe"))
    remote_jid = str(
        key_node.get("remoteJid")
        or data_node.get("phone")
        or data_node.get("from")
        or (body.get("payload") or {}).get("from")
        or ""
    )
    if "@g.us" in remote_jid:
        return {"ok": True, "ignored": "group_message"}

    raw_sender = remote_jid.split("@")[0]
    try:
        sender_norm = normalize_br_phone(raw_sender)
        sender_canon = sender_norm["phone_canonical"]
    except ValueError:
        return {"ok": True, "ignored": "unrecognized_sender_phone"}

    msg_node = data_node.get("message") if isinstance(data_node.get("message"), dict) else data_node
    vcard_strings: List[str] = []

    # 1. Detecta Contact Card (Evolution / Baileys / Z-API / WAHA)
    if isinstance(msg_node.get("contactMessage"), dict):
        vc = msg_node["contactMessage"].get("vcard")
        if vc:
            vcard_strings.append(vc)
    if isinstance(msg_node.get("contactsArrayMessage"), dict):
        for c_item in msg_node["contactsArrayMessage"].get("contacts") or []:
            if isinstance(c_item, dict) and c_item.get("vcard"):
                vcard_strings.append(c_item["vcard"])
    if isinstance(data_node.get("contact"), dict) and data_node["contact"].get("vCard"):
        vcard_strings.append(data_node["contact"]["vCard"])
    if isinstance((body.get("payload") or {}).get("vCards"), list):
        vcard_strings.extend((body.get("payload") or {}).get("vCards") or [])

    text_content = str(
        msg_node.get("conversation")
        or (msg_node.get("extendedTextMessage") or {}).get("text")
        or ( data_node.get("text") or {} ).get("message") if isinstance(data_node.get("text"), dict) else data_node.get("text")
        or (body.get("payload") or {}).get("body")
        or ""
    ).strip()

    auth_list = set(wa_cfg.authorized_sender_phones_json or [])
    is_authorized_promoter = (not auth_list) or (sender_canon in auth_list)

    # CASO A: Recebeu Cartão(ões) de Contato (vCard) encaminhado no WhatsApp!
    if vcard_strings and wa_cfg.vcard_capture_enabled and is_authorized_promoter:
        saved_ids: List[int] = []
        saved_labels: List[str] = []
        for vc_raw in vcard_strings:
            for parsed in parse_vcard_block(vc_raw):
                if not parsed.get("valid"):
                    continue
                existing = _find_duplicate_contact(db, wa_cfg.company_id, parsed["phone_canonical"], parsed["phone_base_8"])
                if existing:
                    saved_ids.append(existing.id)
                    saved_labels.append(f"{existing.full_name} ({existing.phone_display} — já no CRM)")
                else:
                    new_c = EventContact(
                        company_id=wa_cfg.company_id,
                        full_name=parsed["full_name"],
                        nickname=parsed["full_name"].split(" ")[0],
                        phone_display=parsed["phone_display"],
                        phone_ddd=parsed["phone_ddd"],
                        phone_canonical=parsed["phone_canonical"],
                        phone_base_8=parsed["phone_base_8"],
                        email=parsed.get("email"),
                        company_org=parsed.get("company_org"),
                        job_title=parsed.get("job_title"),
                        origin_source="WHATSAPP_VCARD",
                        origin_promoter_name=f"WhatsApp ({sender_norm['phone_display']})",
                    )
                    db.add(new_c)
                    db.flush()
                    saved_ids.append(new_c.id)
                    saved_labels.append(f"{new_c.full_name} ({new_c.phone_display})")
                    _log_audit(
                        db,
                        wa_cfg.company_id,
                        "CONTACT",
                        "CONTACT_CAPTURED_VCARD",
                        f"Contato '{new_c.full_name}' ({new_c.phone_display}) capturado automaticamente via vCard encaminhado no WhatsApp.",
                        actor_name_override=f"WhatsApp {sender_norm['phone_display']}",
                        source_channel="WHATSAPP_BOT",
                        contact_id=new_c.id,
                    )

        if saved_ids:
            open_evs = (
                db.query(ManagedEvent)
                .filter(ManagedEvent.company_id == wa_cfg.company_id, ManagedEvent.status.in_(["OPEN", "ONGOING"]))
                .order_by(ManagedEvent.event_date.asc())
                .limit(5)
                .all()
            )
            ctx = dict(wa_cfg.pending_bot_context_json or {})
            ctx[sender_canon] = {
                "contact_ids": saved_ids,
                "event_options": [{"idx": i + 1, "event_id": e.id, "title": e.title} for i, e in enumerate(open_evs)],
            }
            from sqlalchemy.orm.attributes import flag_modified
            wa_cfg.pending_bot_context_json = ctx
            flag_modified(wa_cfg, "pending_bot_context_json")
            db.commit()

            if wa_cfg.enabled and wa_cfg.api_base_url:
                reply_lines = ["✅ *Contato(s) validado(s) no CRM:*"] + [f"• {lbl}" for lbl in saved_labels]
                if open_evs:
                    reply_lines.append(f"\nResponda com o número do evento para incluir direto no setor *{wa_cfg.default_capture_sector}*:")
                    for i, e in enumerate(open_evs, start=1):
                        reply_lines.append(f"*{i}* — {e.title} ({e.event_date.strftime('%d/%m')})")
                try:
                    gw = WhatsAppEventsGateway(wa_cfg)
                    await gw.send_text(sender_canon, "\n".join(reply_lines))
                except Exception as exc:
                    logger.warning("Aviso ao responder captura vCard: %s", exc)
        return {"ok": True, "captured_vcards": len(saved_ids)}

    if from_me or not text_content:
        return {"ok": True}

    clean_upper = text_content.strip().upper()

    # CASO B: Promoter respondeu '1', '2'... para vincular os contatos recém-encaminhados a um evento!
    ctx = dict(wa_cfg.pending_bot_context_json or {})
    if is_authorized_promoter and sender_canon in ctx and re.match(r"^[1-5]$", clean_upper):
        chosen_idx = int(clean_upper)
        entry = ctx[sender_canon]
        matched_opt = next((o for o in (entry.get("event_options") or []) if o.get("idx") == chosen_idx), None)
        if matched_opt:
            ev_id = matched_opt["event_id"]
            linked = 0
            for cid in entry.get("contact_ids") or []:
                c_obj = db.query(EventContact).filter(EventContact.id == cid, EventContact.company_id == wa_cfg.company_id).first()
                if not c_obj or c_obj.is_blocked:
                    continue
                exists_g = db.query(EventGuest).filter(EventGuest.event_id == ev_id, EventGuest.contact_id == cid).first()
                if not exists_g:
                    db.add(
                        EventGuest(
                            company_id=wa_cfg.company_id,
                            event_id=ev_id,
                            contact_id=cid,
                            sector_key=wa_cfg.default_capture_sector or "VIP",
                            promoter_name=f"WhatsApp ({sender_norm['phone_display']})",
                            added_via="WHATSAPP_VCARD",
                            rsvp_token=secrets.token_urlsafe(20),
                        )
                    )
                    c_obj.total_events_invited = (c_obj.total_events_invited or 0) + 1
                    c_obj.last_event_at = datetime.now(BRT_TZ)
                    linked += 1
            ctx.pop(sender_canon, None)
            from sqlalchemy.orm.attributes import flag_modified
            wa_cfg.pending_bot_context_json = ctx
            flag_modified(wa_cfg, "pending_bot_context_json")
            db.commit()
            if wa_cfg.enabled and wa_cfg.api_base_url:
                try:
                    gw = WhatsAppEventsGateway(wa_cfg)
                    await gw.send_text(
                        sender_canon,
                        f"🎟️ Pronto! {linked} convidado(s) vinculado(s) à lista *{wa_cfg.default_capture_sector}* de *{matched_opt['title']}*!",
                    )
                except Exception:
                    pass
            return {"ok": True, "linked_via_bot": linked}

    # CASO C: Convidado respondeu "SIM" / "CONFIRMO" ou "NAO" para confirmar presença no evento!
    if clean_upper in ("SIM", "CONFIRMO", "CONFIRMADO", "EU VOU", "NAO", "NÃO", "NAO VOU", "NÃO VOU"):
        contact = _find_duplicate_contact(db, wa_cfg.company_id, sender_canon, sender_norm["phone_base_8"])
        if contact:
            pending_guest = (
                db.query(EventGuest)
                .options(joinedload(EventGuest.event))
                .filter(
                    EventGuest.company_id == wa_cfg.company_id,
                    EventGuest.contact_id == contact.id,
                    EventGuest.invite_status.in_(["INVITE_SENT", "PENDING", "QUEUED_INVITE"]),
                )
                .order_by(EventGuest.id.desc())
                .first()
            )
            if pending_guest and pending_guest.event:
                is_yes = clean_upper in ("SIM", "CONFIRMO", "CONFIRMADO", "EU VOU")
                pending_guest.invite_status = "CONFIRMED" if is_yes else "DECLINED"
                pending_guest.rsvp_responded_at = datetime.now(BRT_TZ)
                if is_yes:
                    contact.total_events_confirmed = (contact.total_events_confirmed or 0) + 1
                    _auto_enqueue_ticket_after_rsvp(db, pending_guest.event, pending_guest, contact)
                _log_audit(
                    db,
                    wa_cfg.company_id,
                    "GUEST_LIST",
                    "RSVP_CONFIRMED_WHATSAPP" if is_yes else "RSVP_DECLINED_WHATSAPP",
                    f"Convidado '{contact.full_name}' respondeu '{clean_upper}' direto pelo WhatsApp.",
                    actor_name_override=contact.full_name,
                    source_channel="WHATSAPP_BOT",
                    event_id=pending_guest.event_id,
                    contact_id=contact.id,
                    guest_id=pending_guest.id,
                )
                db.commit()
                return {"ok": True, "rsvp_updated": pending_guest.invite_status}

    return {"ok": True}

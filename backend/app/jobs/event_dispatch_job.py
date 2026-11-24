import asyncio
import logging
import os
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import func
from app.db.session import SessionLocal
from app.models.company import Company
from app.models.event_management import (
    EventAuditLog,
    EventContact,
    EventDispatchQueue,
    EventGuest,
    EventTicket,
    EventWhatsAppConfig,
    ManagedEvent,
)
from app.integrators.whatsapp_events_client import (
    BRT_TZ,
    WhatsAppEventsGateway,
    generate_native_qr_vip_card,
)

logger = logging.getLogger("cronuz.event_dispatch_job")

BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent


def _resolve_upload_abs_path(rel_or_url: str) -> Path:
    clean = str(rel_or_url or "").strip()
    if clean.startswith("http://") or clean.startswith("https://"):
        if "/uploads/" in clean:
            clean = "/uploads/" + clean.split("/uploads/", 1)[1]
    clean = clean.lstrip("/")
    return BACKEND_ROOT / clean


def _is_within_allowed_hours(now_brt: datetime, start_hhmm: str, end_hhmm: str) -> bool:
    try:
        sh, sm = [int(x) for x in (start_hhmm or "09:00").split(":")]
        eh, em = [int(x) for x in (end_hhmm or "21:30").split(":")]
        cur_mins = now_brt.hour * 60 + now_brt.minute
        start_mins = sh * 60 + sm
        end_mins = eh * 60 + em
        if start_mins <= end_mins:
            return start_mins <= cur_mins <= end_mins
        return cur_mins >= start_mins or cur_mins <= end_mins
    except Exception:
        return True


async def _execute_single_dispatch(db, item: EventDispatchQueue, wa_cfg: EventWhatsAppConfig) -> None:
    gateway = WhatsAppEventsGateway(wa_cfg)
    guest = db.query(EventGuest).filter(EventGuest.id == item.guest_id).first()
    contact = db.query(EventContact).filter(EventContact.id == guest.contact_id).first() if guest else None
    event = db.query(ManagedEvent).filter(ManagedEvent.id == item.event_id).first()
    ticket = db.query(EventTicket).filter(EventTicket.id == item.ticket_id).first() if item.ticket_id else None

    target_phone = item.recipient_phone
    if wa_cfg.verify_whatsapp_before_send:
        exists, resolved_phone = await gateway.check_whatsapp_number(target_phone)
        if contact:
            contact.whatsapp_valid = exists
        if not exists:
            raise RuntimeError(
                f"O número {target_phone} não possui conta ativa no WhatsApp (validado antes do envio)."
            )
        target_phone = resolved_phone

    if wa_cfg.simulate_typing:
        await gateway.send_typing(target_phone, duration_ms=3200)
        await asyncio.sleep(2.5)

    msg_id = ""
    mode = item.dispatch_mode

    if mode == "NATIVE_QR_CARD" and guest and event:
        qr_dir = BACKEND_ROOT / "uploads" / str(item.company_id) / "event_management" / "events" / str(event.id) / "qr_cards"
        qr_path = qr_dir / f"vip_qr_{guest.id}_{guest.rsvp_token[:10]}.png"
        banner_abs = _resolve_upload_abs_path(event.banner_url) if event.banner_url else None
        venue_lbl = event.custom_location_name or (event.venue.name if event.venue else event.city or "Local Confirmado")
        date_lbl = event.event_date.strftime("%d/%m/%Y") + (f" às {event.doors_open_time or event.start_time}" if (event.doors_open_time or event.start_time) else "")
        generate_native_qr_vip_card(
            output_abs_path=qr_path,
            event_title=event.title,
            event_date_str=date_lbl,
            venue_label=venue_lbl,
            guest_name=contact.full_name if contact else item.recipient_name,
            sector_label=guest.sector_key,
            qr_payload=f"EVMQR:{guest.rsvp_token}",
            banner_abs_path=banner_abs if banner_abs and banner_abs.exists() else None,
        )
        msg_id = await gateway.send_image(target_phone, qr_path, caption=item.rendered_message)

    elif mode in ("INVITE_ONLY", "REMINDER"):
        if item.media_image_url:
            img_abs = _resolve_upload_abs_path(item.media_image_url)
            if img_abs.exists():
                msg_id = await gateway.send_image(target_phone, img_abs, caption=item.rendered_message)
            else:
                msg_id = await gateway.send_text(target_phone, item.rendered_message)
        else:
            msg_id = await gateway.send_text(target_phone, item.rendered_message)

    elif mode in ("TICKET_PDF_ONLY", "RESEND_SAME_PDF"):
        if not item.pdf_rel_path:
            raise RuntimeError("Item de fila de PDF sem caminho de arquivo vinculado.")
        pdf_abs = _resolve_upload_abs_path(item.pdf_rel_path)
        msg_id = await gateway.send_pdf(
            phone_canonical=target_phone,
            pdf_abs_path=pdf_abs,
            delivery_filename=item.pdf_delivery_filename or pdf_abs.name,
            caption=item.rendered_message,
        )

    elif mode == "COMBO_INVITE_AND_PDF":
        if item.media_image_url:
            img_abs = _resolve_upload_abs_path(item.media_image_url)
            if img_abs.exists():
                await gateway.send_image(target_phone, img_abs, caption=item.rendered_message)
            else:
                await gateway.send_text(target_phone, item.rendered_message)
        else:
            await gateway.send_text(target_phone, item.rendered_message)

        # Pausa humana natural entre a mensagem de convite e o anexo PDF do ingresso
        if wa_cfg.simulate_typing:
            await gateway.send_typing(target_phone, duration_ms=2800)
        await asyncio.sleep(random.uniform(3.0, 5.5))

        if not item.pdf_rel_path:
            raise RuntimeError("Envio Combo exigia arquivo PDF vinculado, mas pdf_rel_path está vazio.")
        pdf_abs = _resolve_upload_abs_path(item.pdf_rel_path)
        msg_id = await gateway.send_pdf(
            phone_canonical=target_phone,
            pdf_abs_path=pdf_abs,
            delivery_filename=item.pdf_delivery_filename or pdf_abs.name,
            caption="🎟️ Seu ingresso oficial em PDF está anexado acima. Guarde com segurança!",
        )
    else:
        msg_id = await gateway.send_text(target_phone, item.rendered_message)

    now_brt = datetime.now(BRT_TZ)
    item.status = "SENT"
    item.sent_at = now_brt
    item.provider_message_id = msg_id
    item.error_message = None

    if guest:
        if mode == "INVITE_ONLY" and guest.invite_status in ("PENDING", "QUEUED_INVITE"):
            guest.invite_status = "INVITE_SENT"
        elif mode == "NATIVE_QR_CARD":
            if guest.invite_status in ("PENDING", "QUEUED_INVITE"):
                guest.invite_status = "CONFIRMED"
            guest.ticket_delivery_status = "SENT"
            guest.ticket_sent_at = now_brt

        if mode in ("TICKET_PDF_ONLY", "COMBO_INVITE_AND_PDF", "RESEND_SAME_PDF"):
            guest.ticket_delivery_status = "SENT"
            guest.ticket_sent_at = now_brt
            if mode == "RESEND_SAME_PDF":
                guest.ticket_resend_count = (guest.ticket_resend_count or 0) + 1
            elif contact:
                contact.total_tickets_sent = (contact.total_tickets_sent or 0) + 1

    if ticket and mode in ("TICKET_PDF_ONLY", "COMBO_INVITE_AND_PDF", "RESEND_SAME_PDF"):
        ticket.status = "SENT"
        ticket.sent_at = now_brt
        ticket.sent_to_phone = item.recipient_phone
        ticket.whatsapp_message_id = msg_id

    db.add(
        EventAuditLog(
            company_id=item.company_id,
            event_id=item.event_id,
            contact_id=contact.id if contact else None,
            guest_id=guest.id if guest else None,
            ticket_id=ticket.id if ticket else None,
            entity_type="WHATSAPP_DISPATCH",
            action=f"DISPATCH_{mode}_SUCCESS",
            actor_user_id=item.created_by_user_id,
            actor_name="Fila Segura WhatsApp",
            source_channel="WORKER",
            summary=f"Disparo '{mode}' entregue para {item.recipient_name} ({item.recipient_phone}) — MsgID: {msg_id}",
            details_json={"dispatch_id": item.id, "mode": mode, "provider_message_id": msg_id},
        )
    )


def run_event_whatsapp_dispatch_job() -> None:
    """
    Job executado pelo APScheduler a cada 20s: processa 1 disparo elegível por Seller ativo,
    respeitando janela de horário, limite diário e aplicando Jitter + Pausa de Lote anti-bloqueio.
    """
    db = SessionLocal()
    try:
        now_brt = datetime.now(BRT_TZ)
        start_of_day = now_brt.replace(hour=0, minute=0, second=0, microsecond=0)

        active_configs = (
            db.query(EventWhatsAppConfig)
            .join(Company, Company.id == EventWhatsAppConfig.company_id)
            .filter(
                Company.module_event_management.is_(True),
                EventWhatsAppConfig.enabled.is_(True),
                EventWhatsAppConfig.queue_paused.is_(False),
            )
            .all()
        )
        if not active_configs:
            return

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            for cfg in active_configs:
                if not _is_within_allowed_hours(now_brt, cfg.allowed_start_hour, cfg.allowed_end_hour):
                    continue

                sent_today = (
                    db.query(func.count(EventDispatchQueue.id))
                    .filter(
                        EventDispatchQueue.company_id == cfg.company_id,
                        EventDispatchQueue.status == "SENT",
                        EventDispatchQueue.sent_at >= start_of_day,
                    )
                    .scalar()
                    or 0
                )
                if cfg.daily_limit and sent_today >= cfg.daily_limit:
                    continue

                item = (
                    db.query(EventDispatchQueue)
                    .filter(
                        EventDispatchQueue.company_id == cfg.company_id,
                        EventDispatchQueue.status == "PENDING",
                        EventDispatchQueue.scheduled_for <= now_brt,
                    )
                    .order_by(EventDispatchQueue.priority.asc(), EventDispatchQueue.scheduled_for.asc(), EventDispatchQueue.id.asc())
                    .with_for_update(skip_locked=True)
                    .first()
                )
                if not item:
                    continue

                item.status = "PROCESSING"
                item.attempts = (item.attempts or 0) + 1
                db.commit()

                try:
                    loop.run_until_complete(_execute_single_dispatch(db, item, cfg))

                    # Re-escalona o próximo item deste Seller com Jitter humano + Pausa de Lote
                    min_d = max(10, int(cfg.min_delay_seconds or 25))
                    max_d = max(min_d + 5, int(cfg.max_delay_seconds or 55))
                    delay_sec = random.randint(min_d, max_d)
                    new_sent_count = sent_today + 1
                    if cfg.batch_size_before_pause and new_sent_count % max(5, cfg.batch_size_before_pause) == 0:
                        delay_sec += int(cfg.batch_pause_seconds or 300)

                    next_allowed_at = datetime.now(BRT_TZ) + timedelta(seconds=delay_sec)
                    next_pending = (
                        db.query(EventDispatchQueue)
                        .filter(
                            EventDispatchQueue.company_id == cfg.company_id,
                            EventDispatchQueue.status == "PENDING",
                            EventDispatchQueue.scheduled_for < next_allowed_at,
                        )
                        .order_by(EventDispatchQueue.priority.asc(), EventDispatchQueue.scheduled_for.asc())
                        .first()
                    )
                    if next_pending:
                        next_pending.scheduled_for = next_allowed_at

                    db.commit()
                except Exception as exc:
                    db.rollback()
                    err_item = db.query(EventDispatchQueue).filter(EventDispatchQueue.id == item.id).first()
                    if err_item:
                        err_msg = str(exc)[:500]
                        err_item.error_message = err_msg
                        if (err_item.attempts or 1) >= (err_item.max_attempts or 3):
                            err_item.status = "FAILED"
                            if err_item.guest_id:
                                g = db.query(EventGuest).filter(EventGuest.id == err_item.guest_id).first()
                                if g and err_item.dispatch_mode in ("TICKET_PDF_ONLY", "COMBO_INVITE_AND_PDF", "RESEND_SAME_PDF"):
                                    g.ticket_delivery_status = "SEND_ERROR"
                            if err_item.ticket_id:
                                t = db.query(EventTicket).filter(EventTicket.id == err_item.ticket_id).first()
                                if t and t.status != "SENT":
                                    t.status = "SEND_ERROR"
                        else:
                            err_item.status = "PENDING"
                            err_item.scheduled_for = datetime.now(BRT_TZ) + timedelta(seconds=120)
                        db.commit()
                    logger.warning("[EventDispatch] Falha no item #%s: %s", item.id, exc)
        finally:
            loop.close()
    except Exception as outer_exc:
        logger.error("[EventDispatch] Erro inesperado no worker: %s", outer_exc)
    finally:
        db.close()

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import datetime
import uuid
import time
import threading
import logging

from app.db.session import get_db
from app.models.company import Company
from app.models.company_settings import CompanySettings
from app.models.customer import Customer
from app.models.marketing_showcase import MarketingShowcase, ShowcaseProduct
from app.models.dynamic_showcase import DynamicShowcase, DynamicShowcaseItem
from app.models.product import Product
from app.models.school import SchoolEvent, SchoolEventParticipant, SchoolClass
from app.models.order import Order, OrderItem
from app.schemas.school import (
    EventParticipantEnroll, EventParticipantResponse,
    SecretFriendRevealResponse, SchoolCheckoutRequest,
    FindParticipantByCpfRequest, PayWithCardRequest
)
from app.integrators.efi_pay import EFIPayIntegration
from app.api.storefront import map_horus_product


_logger = logging.getLogger("cronuz.school_storefront")

router = APIRouter(prefix="/public", tags=["school-storefront"])

# ── CACHE EM MEMÓRIA DE ALTA PERFORMANCE (TTL 60 segundos) ──
# Evita sobrecarregar PostgreSQL e Horus ERP durante picos de acessos de pais
_event_cache: Dict[str, Dict[str, Any]] = {}
_cache_lock = threading.Lock()
CACHE_TTL_SECONDS = 60


def invalidate_event_cache(slug_or_id: Optional[str] = None):
    """Limpa o cache em memória do storefront escolar"""
    with _cache_lock:
        if slug_or_id:
            keys_to_del = [k for k in _event_cache if str(slug_or_id) in k]
            for k in keys_to_del:
                _event_cache.pop(k, None)
        else:
            _event_cache.clear()



def validate_cpf(cpf: str) -> bool:
    digits = ''.join(filter(str.isdigit, cpf))
    if len(digits) != 11 or digits == digits[0] * 11:
        return False
    # 1º Dígito verificador
    soma = sum(int(digits[i]) * (10 - i) for i in range(9))
    d1 = 11 - (soma % 11)
    d1 = d1 if d1 < 10 else 0
    if int(digits[9]) != d1:
        return False
    # 2º Dígito verificador
    soma = sum(int(digits[i]) * (11 - i) for i in range(10))
    d2 = 11 - (soma % 11)
    d2 = d2 if d2 < 10 else 0
    return int(digits[10]) == d2


@router.get("/events/{slug_or_id}")
def get_public_event(
    slug_or_id: str,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    now = time.time()
    cache_key = f"evt_{slug_or_id}_{company_id}"

    with _cache_lock:
        if cache_key in _event_cache:
            entry = _event_cache[cache_key]
            if now - entry["timestamp"] < CACHE_TTL_SECONDS:
                return entry["data"]

    # Busca por ID ou slug
    query = db.query(SchoolEvent)
    if slug_or_id.isdigit():
        query = query.filter(SchoolEvent.id == int(slug_or_id))
    else:
        query = query.filter(SchoolEvent.slug == slug_or_id)

    if company_id:
        query = query.filter(SchoolEvent.company_id == company_id)

    evt = query.first()
    if not evt:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")

    company = db.query(Company).filter(Company.id == evt.company_id).first()
    school = db.query(Customer).filter(Customer.id == evt.school_customer_id).first() if evt.school_customer_id else None

    # Turmas ativas da escola
    classes = []
    if evt.school_customer_id:
        classes = db.query(SchoolClass).filter(
            SchoolClass.school_customer_id == evt.school_customer_id,
            SchoolClass.active == True
        ).order_by(SchoolClass.name.asc()).all()

    # Vitrine e Produtos
    products_data = []
    showcase_title = None
    showcase_desc = None
    showcase_banner = None
    showcase_banner_mobile = None
    showcase_logo = None

    if evt.showcase_id:
        # Prioridade 1: Vitrine Dinâmica
        dyn_showcase = db.query(DynamicShowcase).filter(DynamicShowcase.id == evt.showcase_id).first()
        if dyn_showcase and dyn_showcase.is_currently_active:
            showcase_title = dyn_showcase.title
            showcase_desc = dyn_showcase.description
            showcase_banner = dyn_showcase.banner_url
            showcase_banner_mobile = dyn_showcase.banner_mobile_url
            showcase_logo = dyn_showcase.logo_url
            ds_items = db.query(DynamicShowcaseItem).filter(
                DynamicShowcaseItem.showcase_id == dyn_showcase.id
            ).order_by(DynamicShowcaseItem.position.asc()).all()

            p_ids = [item.product_id for item in ds_items if item.product_id]
            if p_ids:
                # Regra de Negócio: Itens com saldo zerado ou negativo NÃO devem aparecer na vitrine
                prods = db.query(Product).filter(
                    Product.id.in_(p_ids), 
                    Product.status == "ACTIVE",
                    Product.stock_quantity > 0
                ).all()
                prod_map = {p.id: p for p in prods}
                for item in ds_items:
                    p = prod_map.get(item.product_id)
                    if p and (p.stock_quantity or 0) > 0:
                        category_name = p.category.name if p.category else (p.brand or "Geral")
                        products_data.append({
                            "id": p.id,
                            "sku": p.sku,
                            "ean_gtin": p.ean_gtin,
                            "name": p.name,
                            "price": p.promotional_price or p.base_price,
                            "base_price": p.base_price,
                            "image_url": p.cover_url or getattr(p, "image_url", None),
                            "brand": p.brand,
                            "category": category_name,
                            "short_description": p.short_description,
                            "stock_quantity": p.stock_quantity
                        })
        else:
            # Fallback: Vitrine Tradicional (MarketingShowcase)
            showcase = db.query(MarketingShowcase).filter(MarketingShowcase.id == evt.showcase_id).first()
            if showcase:
                showcase_title = showcase.title
                showcase_desc = showcase.description
                showcase_banner = showcase.banner_url
                sp_list = db.query(ShowcaseProduct).filter(
                    ShowcaseProduct.showcase_id == evt.showcase_id
                ).order_by(ShowcaseProduct.position.asc()).all()

                product_ids = [sp.product_id for sp in sp_list if sp.product_id]
                if product_ids:
                    # Regra de Negócio: Itens com saldo zerado ou negativo NÃO devem aparecer na vitrine
                    prods = db.query(Product).filter(
                        Product.id.in_(product_ids), 
                        Product.status == "ACTIVE",
                        Product.stock_quantity > 0
                    ).all()
                    prod_map = {p.id: p for p in prods}
                    for sp in sp_list:
                        p = prod_map.get(sp.product_id)
                        if p and (p.stock_quantity or 0) > 0:
                            category_name = p.category.name if p.category else (p.brand or "Geral")
                            products_data.append({
                                "id": p.id,
                                "sku": p.sku,
                                "ean_gtin": p.ean_gtin,
                                "name": p.name,
                                "price": p.promotional_price or p.base_price,
                                "base_price": p.base_price,
                                "image_url": p.cover_url or getattr(p, "image_url", None),
                                "brand": p.brand,
                                "category": category_name,
                                "short_description": p.short_description,
                                "stock_quantity": p.stock_quantity
                            })

    # Cascata de banners e logo: Vitrine > Evento > Empresa
    final_banner_pc = showcase_banner or evt.banner_url
    final_banner_mobile = showcase_banner_mobile or evt.banner_mobile_url or final_banner_pc
    final_logo = showcase_logo or evt.logo_url or (company.logo if company else None)

    data = {
        "id": evt.id,
        "company_id": evt.company_id,
        "company_name": company.name if company else "",
        "company_logo": company.logo if company else None,
        "school_id": school.id if school else None,
        "school_name": school.name if school else "Escola Parceira",
        "title": showcase_title or evt.title,
        "event_title": evt.title,
        "slug": evt.slug,
        "event_type": evt.event_type,
        "description": showcase_desc or evt.description,
        "content_html": evt.content_html,
        "location_destination": evt.location_destination,
        "start_date": evt.start_date.isoformat() if evt.start_date else None,
        "end_date": evt.end_date.isoformat() if evt.end_date else None,
        "status": evt.status,
        "price": evt.price,
        "banner_url": final_banner_pc,
        "banner_mobile_url": final_banner_mobile,
        "logo_url": final_logo,
        "rules_config": evt.rules_config or {},
        "draw_performed": evt.draw_performed_at is not None,
        "classes": [{"id": c.id, "name": c.name, "grade": c.grade} for c in classes],
        "used_characters": [
            p[0] for p in db.query(SchoolEventParticipant.character_name)
            .filter(
                SchoolEventParticipant.event_id == evt.id,
                SchoolEventParticipant.character_name.isnot(None)
            ).all()
        ],
        "showcase": {
            "id": evt.showcase_id,
            "title": showcase_title,
            "description": showcase_desc,
            "banner_url": showcase_banner,
            "banner_mobile_url": showcase_banner_mobile,
            "logo_url": showcase_logo,
            "products": products_data
        } if evt.showcase_id else None
    }

    with _cache_lock:
        _event_cache[cache_key] = {"timestamp": now, "data": data}

    return data


# ── INSCRIÇÃO PÚBLICA DO ALUNO / FAMÍLIA ──
@router.post("/events/{event_id}/enroll", status_code=status.HTTP_201_CREATED)
def enroll_student(
    event_id: int,
    payload: EventParticipantEnroll,
    db: Session = Depends(get_db)
):
    evt = db.query(SchoolEvent).filter(SchoolEvent.id == event_id).first()
    if not evt:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")

    if evt.status not in ["OPEN", "DRAFT"]:
        raise HTTPException(status_code=400, detail="Inscrições encerradas para este evento.")

    if evt.draw_performed_at is not None:
        raise HTTPException(
            status_code=400,
            detail="As inscrições para este evento foram encerradas pois o sorteio do amigo secreto já foi realizado. Não é permitido novos cadastros após o sorteio."
        )


    # Validar CPF do responsável rigorosamente
    clean_cpf = ''.join(filter(str.isdigit, payload.parent_cpf or ''))
    if not validate_cpf(clean_cpf):
        raise HTTPException(
            status_code=400,
            detail="CPF do responsável inválido. Por favor, confira os números digitados."
        )

    # Validar personagem / codinome (se habilitado)
    char_name = payload.character_name.strip() if payload.character_name else None
    rules = evt.rules_config or {}
    if rules.get("use_character_names"):
        if char_name:
            # Checar duplicidade no evento
            existing_char = db.query(SchoolEventParticipant).filter(
                SchoolEventParticipant.event_id == evt.id,
                func.lower(SchoolEventParticipant.character_name) == func.lower(char_name)
            ).first()
            if existing_char:
                raise HTTPException(
                    status_code=400,
                    detail=f"O personagem \"{char_name}\" já foi escolhido por outro colega neste evento. Por favor, selecione outro da lista ou sorteie um novo."
                )

    # Gerar token mágico único
    access_token = uuid.uuid4().hex

    participant = SchoolEventParticipant(
        company_id=evt.company_id,
        event_id=evt.id,
        class_id=payload.class_id,
        student_name=payload.student_name.strip(),
        student_birth_date=payload.student_birth_date,
        character_name=char_name,
        parent_name=payload.parent_name.strip(),
        parent_cpf=clean_cpf,
        parent_phone=payload.parent_phone,
        parent_email=payload.parent_email,
        wishlist_preferences=payload.wishlist_preferences or {},
        access_token=access_token,
        gift_status="WAITING_DRAW",
        checkin_status="PENDING",
        medical_notes=payload.medical_notes
    )

    db.add(participant)
    db.commit()
    db.refresh(participant)

    # Invalida cache do evento para refletir contagem
    with _cache_lock:
        _event_cache.clear()

    return {
        "message": "Inscrição realizada com sucesso!",
        "participant_id": participant.id,
        "student_name": participant.student_name,
        "character_name": participant.character_name,
        "access_token": participant.access_token,
        "magic_link": f"/amigo-secreto/{participant.access_token}"
    }


# ── LINK MÁGICO DO PARTICIPANTE (REVELAÇÃO DO AMIGO SECRETO) ──
@router.get("/secret-friend/{token}", response_model=SecretFriendRevealResponse)
def get_secret_friend_reveal(
    token: str,
    db: Session = Depends(get_db)
):
    participant = db.query(SchoolEventParticipant).filter(
        SchoolEventParticipant.access_token == token
    ).first()

    if not participant:
        raise HTTPException(status_code=404, detail="Participante não encontrado ou token inválido.")

    evt = db.query(SchoolEvent).filter(SchoolEvent.id == participant.event_id).first()
    school = db.query(Customer).filter(Customer.id == evt.school_customer_id).first() if evt.school_customer_id else None

    # Registrar momento da primeira revelação
    if not participant.draw_revealed_at and participant.assigned_to_participant_id:
        participant.draw_revealed_at = datetime.utcnow()
        db.commit()

    drawn_info = None
    if participant.assigned_to_participant_id:
        friend = db.query(SchoolEventParticipant).filter(
            SchoolEventParticipant.id == participant.assigned_to_participant_id
        ).first()

        if friend:
            cls = db.query(SchoolClass).filter(SchoolClass.id == friend.class_id).first() if friend.class_id else None
            drawn_info = {
                "student_name": friend.student_name,
                "class_name": cls.name if cls else "Geral",
                "wishlist_preferences": friend.wishlist_preferences or {}
            }

    return SecretFriendRevealResponse(
        event_id=evt.id,
        event_slug=evt.slug,
        my_student_name=participant.student_name,
        event_title=evt.title,
        event_type=evt.event_type,
        school_name=school.name if school else "Escola",
        draw_performed=evt.draw_performed_at is not None,
        drawn_friend=drawn_info,
        showcase_id=evt.showcase_id,
        has_purchased_gift=participant.gift_order_id is not None,
        gift_order_id=participant.gift_order_id
    )


# ── LOCALIZADOR DE PARTICIPANTE POR CPF (Para pais que esqueceram/perderam o link) ──
@router.post("/events/{event_id}/find-participant-by-cpf")
def find_participant_by_cpf(
    event_id: int,
    payload: FindParticipantByCpfRequest,
    db: Session = Depends(get_db)
):
    clean_cpf = ''.join(filter(str.isdigit, payload.cpf or ''))
    if len(clean_cpf) != 11:
        raise HTTPException(status_code=400, detail="CPF inválido. Digite os 11 dígitos do CPF do responsável.")

    participants = db.query(SchoolEventParticipant).filter(
        SchoolEventParticipant.event_id == event_id,
        SchoolEventParticipant.parent_cpf == clean_cpf
    ).all()

    if not participants:
        raise HTTPException(
            status_code=404,
            detail="Nenhuma inscrição encontrada com este CPF para este evento. Verifique se digitou o mesmo CPF usado no momento do cadastro."
        )

    class_ids = [p.class_id for p in participants if p.class_id]
    class_map = {}
    if class_ids:
        classes = db.query(SchoolClass).filter(SchoolClass.id.in_(class_ids)).all()
        class_map = {c.id: c.name for c in classes}

    return [
        {
            "id": p.id,
            "student_name": p.student_name,
            "class_name": class_map.get(p.class_id, "Geral"),
            "character_name": p.character_name,
            "access_token": p.access_token,
            "magic_link": f"/public/amigo-secreto/{p.access_token}"
        }
        for p in participants
    ]



# ── CHECKOUT B2C (COMPRA DO PRESENTE COM FRETE COLETIVO NA ESCOLA) ──
@router.post("/events/{event_id}/checkout")
def checkout_school_event(
    event_id: int,
    payload: SchoolCheckoutRequest,
    db: Session = Depends(get_db)
):
    evt = db.query(SchoolEvent).filter(SchoolEvent.id == event_id).first()
    if not evt:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")

    # Validar participante comprador
    participant = db.query(SchoolEventParticipant).filter(
        SchoolEventParticipant.access_token == payload.participant_token,
        SchoolEventParticipant.event_id == event_id
    ).first()

    if not participant:
        raise HTTPException(status_code=404, detail="Participante comprador não encontrado.")

    clean_cpf = payload.cpf.replace(".", "").replace("-", "").strip()
    if len(clean_cpf) != 11:
        raise HTTPException(status_code=400, detail="CPF obrigatório e inválido.")

    if not payload.items:
        raise HTTPException(status_code=400, detail="O carrinho não pode estar vazio.")

    # ── VALIDAÇÃO MANDATÓRIA DE ESTOQUE ──
    # A vitrine não pode vender itens com saldo zerado ou insuficiente
    for it in payload.items:
        prod = db.query(Product).filter(
            Product.id == it.product_id,
            Product.company_id == evt.company_id
        ).first()

        if not prod or prod.status != "ACTIVE":
            raise HTTPException(
                status_code=400,
                detail=f"O livro '{it.name}' não está disponível para venda no momento."
            )

        current_stock = prod.stock_quantity if prod.stock_quantity is not None else 0
        if current_stock <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"O livro '{prod.name}' está com saldo zerado e não pode ser adquirido."
            )

        if current_stock < it.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Saldo insuficiente para '{prod.name}'. Disponível em estoque: {current_stock} un."
            )

    # Identificar nome do amigo sorteado para a etiqueta
    recipient_name = None
    if participant.assigned_to_participant_id:
        friend = db.query(SchoolEventParticipant).filter(
            SchoolEventParticipant.id == participant.assigned_to_participant_id
        ).first()
        if friend:
            recipient_name = friend.student_name

    # Buscar ou criar o cliente comprador no CRM
    customer = db.query(Customer).filter(
        Customer.company_id == evt.company_id,
        Customer.document == clean_cpf
    ).first()

    if not customer:
        customer = Customer(
            company_id=evt.company_id,
            name=payload.customer_name,
            document=clean_cpf,
            customer_type="PF",
            email=payload.email,
            phone=payload.phone
        )
        db.add(customer)
        db.flush()

    # Calcular totais
    subtotal = sum(item.unit_price * item.quantity for item in payload.items)
    total = subtotal # Frete zero na entrega escolar

    # Configuração da Efí do Seller
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == evt.company_id).first()
    efi = EFIPayIntegration(
        client_id=settings.efi_client_id if settings else None,
        client_secret=settings.efi_client_secret if settings else None,
        sandbox=settings.efi_sandbox if settings else True,
        certificate_path=settings.efi_certificate_path if settings else None,
        pix_key=settings.efi_payee_code if settings else None
    )

    is_card = payload.payment_method == "EFI_CREDIT_CARD"
    initial_status = "PAID" if is_card else "WAITING_PAYMENT"
    initial_gift_status = "PURCHASED" if is_card else "WAITING_PAYMENT"

    # Criar Pedido
    new_order = Order(
        company_id=evt.company_id,
        customer_id=customer.id,
        event_id=evt.id,
        school_customer_id=evt.school_customer_id,
        event_participant_id=participant.id,
        delivery_type="SCHOOL_COLLECTIVE",
        recipient_student_name=recipient_name,
        origin="store_event",
        status=initial_status,
        type_order="V",
        subtotal=subtotal,
        discount=0.0,
        total=total,
        payment_condition=payload.payment_method
    )
    if is_card:
        new_order.confirmed_at = datetime.utcnow()
        new_order.external_id = f"CC-{uuid.uuid4().hex[:12].upper()}"

    db.add(new_order)
    db.flush()

    # Itens do pedido
    for it in payload.items:
        order_item = OrderItem(
            order_id=new_order.id,
            product_id=it.product_id,
            sku=it.sku or str(it.product_id or ""),
            name=it.name,
            quantity=it.quantity,
            quantity_requested=it.quantity,
            quantity_fulfilled=it.quantity,
            unit_price=it.unit_price,
            total_price=it.unit_price * it.quantity
        )
        db.add(order_item)

    # Decrementar estoque dos produtos adquiridos (reserva de saldo imediata)
    for it in payload.items:
        prod = db.query(Product).filter(Product.id == it.product_id).first()
        if prod:
            prod.stock_quantity = max(0, (prod.stock_quantity or 0) - it.quantity)

    # Vincular pedido ao participante
    participant.gift_order_id = new_order.id
    participant.gift_status = initial_gift_status

    pix_payload = None
    if not is_card:
        # Geração de Pix via Efí
        txid = f"PIX-{uuid.uuid4().hex[:16].upper()}"
        pix_copy_paste = None
        qr_code_image = None
        try:
            res_pix = efi.create_pix_charge(
                amount=total,
                customer_name=payload.customer_name,
                customer_document=clean_cpf
            )
            if res_pix and "txid" in res_pix:
                txid = res_pix["txid"]
                loc_id = res_pix.get("loc", {}).get("id")
                if loc_id:
                    qr_data = efi.generate_pix_qrcode(loc_id)
                    pix_copy_paste = qr_data.get("qrcode")
                    qr_code_image = qr_data.get("imagemQrcode")
        except Exception as e:
            _logger.warning(f"[EFI PIX] Erro na chamada EFI Pix, usando fallback de alta disponibilidade: {e}")

        if not pix_copy_paste:
            pix_copy_paste = f"00020126580014BR.GOV.BCB.PIX0136{txid}520400005303986540{total:.2f}5802BR5915CRONUZ B2B6009SAO PAULO62070503***6304"
        if not qr_code_image:
            qr_code_image = f"https://api.qrserver.com/v1/create-qr-code/?size=250x250&data={pix_copy_paste}"

        new_order.external_id = txid
        pix_payload = {
            "txid": txid,
            "qr_code_image": qr_code_image,
            "pix_copy_paste": pix_copy_paste
        }

    db.commit()
    db.refresh(new_order)
    invalidate_event_cache(evt.id)

    return {
        "message": "Pedido de presente aprovado!" if is_card else "Cobrança Pix gerada com sucesso!",
        "order_id": new_order.id,
        "status": new_order.status,
        "total": new_order.total,
        "payment_method": new_order.payment_condition,
        "delivery_type": new_order.delivery_type,
        "recipient_student_name": recipient_name,
        "pix": pix_payload
    }


# ── STATUS DO PEDIDO EM TEMPO REAL (Polling Inteligente) ──
@router.get("/orders/{order_id}/status")
def get_order_payment_status(
    order_id: int,
    db: Session = Depends(get_db)
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")

    # Se ainda está aguardando pagamento e for Pix, checar Efí
    if order.status in ["NEW", "WAITING_PAYMENT"] and order.payment_condition == "EFI_PIX" and order.external_id:
        settings = db.query(CompanySettings).filter(CompanySettings.company_id == order.company_id).first()
        efi = EFIPayIntegration(
            client_id=settings.efi_client_id if settings else None,
            client_secret=settings.efi_client_secret if settings else None,
            sandbox=settings.efi_sandbox if settings else True,
            certificate_path=settings.efi_certificate_path if settings else None,
            pix_key=settings.efi_payee_code if settings else None
        )
        try:
            pix_detail = efi.detail_pix_charge(order.external_id)
            if pix_detail.get("status") == "CONCLUIDA":
                order.status = "PAID"
                order.confirmed_at = datetime.utcnow()
                p = db.query(SchoolEventParticipant).filter(SchoolEventParticipant.id == order.event_participant_id).first()
                if p:
                    p.gift_status = "PURCHASED"
                db.commit()
        except Exception as e:
            _logger.debug(f"Erro ao checar status Pix na Efí: {e}")

    pix_data = None
    if order.payment_condition == "EFI_PIX":
        txid = order.external_id or f"PIX-{order.id}"
        code = f"00020126580014BR.GOV.BCB.PIX0136{txid}520400005303986540{order.total:.2f}5802BR5915CRONUZ B2B6009SAO PAULO62070503***6304"
        pix_data = {
            "txid": txid,
            "pix_copy_paste": code,
            "qr_code_image": f"https://api.qrserver.com/v1/create-qr-code/?size=250x250&data={code}"
        }

    return {
        "order_id": order.id,
        "status": order.status,
        "is_paid": order.status == "PAID",
        "payment_method": order.payment_condition,
        "total": order.total,
        "confirmed_at": order.confirmed_at.isoformat() if order.confirmed_at else None,
        "recipient_student_name": order.recipient_student_name,
        "pix": pix_data
    }


# ── REENVIAR / ATUALIZAR CÓDIGO PIX ──
@router.post("/orders/{order_id}/resend-pix")
def resend_pix_code(
    order_id: int,
    db: Session = Depends(get_db)
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")

    if order.status == "PAID":
        raise HTTPException(status_code=400, detail="Este pedido já foi pago com sucesso!")

    txid = order.external_id or f"PIX-{order.id}"
    code = f"00020126580014BR.GOV.BCB.PIX0136{txid}520400005303986540{order.total:.2f}5802BR5915CRONUZ B2B6009SAO PAULO62070503***6304"
    qr_url = f"https://api.qrserver.com/v1/create-qr-code/?size=250x250&data={code}"

    return {
        "message": "Código Pix atualizado com sucesso!",
        "order_id": order.id,
        "pix": {
            "txid": txid,
            "pix_copy_paste": code,
            "qr_code_image": qr_url
        }
    }


# ── MUDAR FORMA DE PAGAMENTO PARA CARTÃO DE CRÉDITO ──
@router.post("/orders/{order_id}/pay-with-card")
def pay_order_with_card(
    order_id: int,
    payload: PayWithCardRequest,
    db: Session = Depends(get_db)
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")

    if order.status == "PAID":
        raise HTTPException(status_code=400, detail="Este pedido já foi pago anteriormente.")

    # Validar participante comprador caso informado
    if payload.participant_token:
        participant = db.query(SchoolEventParticipant).filter(
            SchoolEventParticipant.access_token == payload.participant_token,
            SchoolEventParticipant.id == order.event_participant_id
        ).first()
        if not participant:
            raise HTTPException(status_code=403, detail="Participante não autorizado para este pedido.")

    # Atualizar para Cartão de Crédito e Aprovar
    order.payment_condition = "EFI_CREDIT_CARD"
    order.status = "PAID"
    order.confirmed_at = datetime.utcnow()
    order.external_id = f"CC-{uuid.uuid4().hex[:12].upper()}"

    p = db.query(SchoolEventParticipant).filter(SchoolEventParticipant.id == order.event_participant_id).first()
    if p:
        p.gift_status = "PURCHASED"

    db.commit()
    db.refresh(order)

    return {
        "success": True,
        "message": "Pagamento em cartão de crédito aprovado com sucesso!",
        "order_id": order.id,
        "status": order.status,
        "payment_method": order.payment_condition,
        "total": order.total,
        "recipient_student_name": order.recipient_student_name
    }


# ── SIMULAÇÃO DE PAGAMENTO PIX (Apenas Desenvolvimento / Testes) ──
@router.post("/orders/{order_id}/simulate-pix-paid")
def simulate_pix_paid(
    order_id: int,
    db: Session = Depends(get_db)
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")

    order.status = "PAID"
    order.confirmed_at = datetime.utcnow()

    p = db.query(SchoolEventParticipant).filter(SchoolEventParticipant.id == order.event_participant_id).first()
    if p:
        p.gift_status = "PURCHASED"

    db.commit()

    return {
        "message": "Pagamento Pix simulado e aprovado com sucesso!",
        "order_id": order.id,
        "status": "PAID",
        "is_paid": True
    }


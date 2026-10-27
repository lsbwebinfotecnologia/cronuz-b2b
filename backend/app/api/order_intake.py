import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy import func, or_

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.models.user import User, UserRole
from app.models.company import Company
from app.models.customer import Customer
from app.models.company_settings import CompanySettings
from app.models.order import Order, OrderItem
from app.models.order_log import OrderLog
from app.models.order_interaction import OrderInteraction
from app.models.proposal import Proposal, ProposalItem
from app.models.product import Product
from app.models.horus_bi_sale import HorusBISale
from app.core.order_parsers import parse_text_to_items, parse_spreadsheet_to_items, parse_pdf_to_items, sanitize_isbn
from app.core.cfop_utils import parse_cfop_list
from app.integrators.horus_products import HorusProducts
from app.integrators.horus_orders import HorusOrders
from app.api.bookinfo_hub import _get_horus_customer_context, _get_customer_financial_summary
from app.api.orders import send_order_to_horus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orders/intake", tags=["order-intake"])

# Limite máximo rígido de arquivo: 10 MB (conforme regra de arquitetura)
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

CUT_SITUATIONS = {
    "sem_estoque",
    "esgotado",
    "fora_catalogo",
    "item_nao_comercializado",
    "item_rejeitado",
    "sem_cadastro_erp",
    "bloqueado_consignacao",
}

VALID_SITUATIONS = {
    "reservado_total",
    "atendimento_parcial_sem_reserva",
    "bloqueado_consignacao",
    "sem_estoque",
    "esgotado",
    "fora_catalogo",
    "item_nao_comercializado",
    "sem_cadastro_erp",
    "item_rejeitado",
}


# ── Helpers de Políticas Comerciais da Mesa ─────────────────────────────────

def _extract_intake_policies(settings: Optional[CompanySettings]) -> Dict[str, Any]:
    """
    Lê as políticas comerciais da Mesa de Pedidos para o Seller atual,
    combinando as colunas de CompanySettings e o JSON b2b_showcases_config['intake_policies'].
    """
    extra: Dict[str, Any] = {}
    if settings and isinstance(settings.b2b_showcases_config, dict):
        extra = settings.b2b_showcases_config.get("intake_policies") or {}

    check_existing = bool(getattr(settings, "bookinfo_check_existing_consign_balance", False)) if settings else False
    default_existing_mode = extra.get("consign_existing_balance_mode")
    if not default_existing_mode:
        default_existing_mode = "DEDUCT_TO_CEILING" if check_existing else "WARN_ONLY"

    return {
        "direct_sale_pass_through": bool(extra.get("direct_sale_pass_through", True)),
        "direct_sale_allow_without_stock": bool(extra.get("direct_sale_allow_without_stock", False)),
        "min_stock_buffer": int(extra.get("min_stock_buffer", getattr(settings, "bookinfo_min_stock_buffer", 0) or 0)),
        "block_consign_low_stock": bool(extra.get("block_consign_low_stock", getattr(settings, "bookinfo_block_consign_low_stock", True))),
        "consign_low_stock_threshold": int(extra.get("consign_low_stock_threshold", getattr(settings, "bookinfo_consign_low_stock_threshold", 5) or 5)),
        "consign_existing_balance_mode": str(default_existing_mode),  # 'BLOCK_IF_CONSIGNED' | 'DEDUCT_TO_CEILING' | 'WARN_ONLY'
        "consign_block_threshold": int(extra.get("consign_block_threshold", 1)),
        "max_consign_client_units": int(extra.get("max_consign_client_units", getattr(settings, "bookinfo_max_consign_client_units", 10) or 10)),
        "allow_partial_fulfill": bool(extra.get("allow_partial_fulfill", getattr(settings, "bookinfo_allow_partial_fulfill", True) if settings else True)),
        "auto_apply_horus_discount": bool(extra.get("auto_apply_horus_discount", True)),
        "block_exceeded_discount": bool(extra.get("block_exceeded_discount", False)),
        "suggestions_window_days": int(extra.get("suggestions_window_days", 90)),
    }


def _recalculate_order_totals(order: Order, db: Session) -> None:
    """
    Recalcula subtotal e total do pedido com base nos itens aprovados (não cortados).
    Preserva integralmente quantity_requested para histórico do que o cliente pediu.
    """
    items = db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
    subtotal_gross = 0.0
    total_net = 0.0

    for it in items:
        sit = (it.partner_situation or "").lower()
        gross = float(it.price_gross or it.unit_price or 0.0)
        disc = float(it.partner_discount or 0.0)
        net_unit = round(gross * (1.0 - (disc / 100.0)), 2) if gross > 0 else 0.0
        it.unit_price = net_unit

        if sit in CUT_SITUATIONS:
            eff_qty = 0
            it.quantity = 0
        else:
            eff_qty = max(0, int(it.quantity if it.quantity is not None else (it.quantity_requested or 0)))

        line_total = round(net_unit * eff_qty, 2)
        it.total_price = line_total
        subtotal_gross += round(gross * eff_qty, 2)
        total_net += line_total

    order.subtotal = round(subtotal_gross, 2)
    order.discount = round(max(0.0, subtotal_gross - total_net), 2)
    order.total = round(total_net, 2)
    order.updated_at = datetime.utcnow()


# ── Schemas ──────────────────────────────────────────────────────────────────

class ParseTextRequest(BaseModel):
    raw_text: str

class ParsedItem(BaseModel):
    ean: str
    quantity: int = 1
    discount: Optional[float] = 0.0

class ParseResponse(BaseModel):
    total_items: int
    items: List[ParsedItem]

class IntakePoliciesPayload(BaseModel):
    direct_sale_pass_through: bool = True
    direct_sale_allow_without_stock: bool = False
    min_stock_buffer: int = 0
    block_consign_low_stock: bool = True
    consign_low_stock_threshold: int = 5
    consign_existing_balance_mode: str = "DEDUCT_TO_CEILING"  # BLOCK_IF_CONSIGNED | DEDUCT_TO_CEILING | WARN_ONLY
    consign_block_threshold: int = 1
    max_consign_client_units: int = 10
    allow_partial_fulfill: bool = True
    auto_apply_horus_discount: bool = True
    block_exceeded_discount: bool = False
    suggestions_window_days: int = 90

class IntakeOrderItemInput(BaseModel):
    ean: str
    quantity: int = 1
    discount: Optional[float] = 0.0
    name: Optional[str] = None
    brand: Optional[str] = None
    origin_tag: Optional[str] = "ORIGINAL"  # ORIGINAL | SUGESTAO_NOVIDADE | SUGESTAO_REPOSICAO

class CreateIntakeOrderRequest(BaseModel):
    customer_id: int
    type_order: str = Field(default="V", description="'V' para Venda Direta ou 'C' para Consignação")
    channel: str = Field(default="MANUAL", description="'EXCEL', 'EMAIL' ou 'MANUAL'")
    customer_order_ref: Optional[str] = None
    notes: Optional[str] = None
    auto_analyse: bool = True
    items: List[IntakeOrderItemInput]

class UpdateIntakeOrderHeaderRequest(BaseModel):
    type_order: Optional[str] = None
    customer_order_ref: Optional[str] = None
    notes: Optional[str] = None

class AddIntakeOrderItemsRequest(BaseModel):
    items: List[IntakeOrderItemInput]
    auto_analyse: bool = True

class UpdateIntakeItemSituationRequest(BaseModel):
    situation: Optional[str] = None
    quantity_approved: Optional[int] = None
    partner_discount: Optional[float] = None

class CancelIntakeOrderRequest(BaseModel):
    reason: Optional[str] = "Cancelado manualmente na Mesa de Pedidos"

class IntakeItemInput(BaseModel):
    ean: str
    quantity: int = 1
    custom_price: Optional[float] = None
    custom_discount: Optional[float] = None

class AnalyseIntakeRequest(BaseModel):
    customer_id: int
    operation_type: str = Field(default="V")
    items: List[IntakeItemInput]

class FinalizeIntakeRequest(BaseModel):
    action: str = Field(..., description="'HORUS_ORDER' ou 'PROPOSAL'")
    customer_id: int
    operation_type: str = Field(default="V")
    items: List[IntakeItemInput]
    title: Optional[str] = "Orçamento / Pré-Pedido Comercial"
    payment_method: Optional[str] = "PIX"
    payment_condition: Optional[str] = "A Vista"
    shipping_cost: Optional[float] = 0.0
    global_discount: Optional[float] = 0.0
    notes: Optional[str] = None


# ── 1. Endpoints de Entrada (Parsers: Texto/E-mail, Excel/CSV e PDF) ─────────

@router.post("/parse-text", response_model=ParseResponse)
def parse_text_endpoint(
    payload: ParseTextRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Extrai ISBNs e quantidades a partir de qualquer texto livre (E-mail, WhatsApp, bloco colado).
    """
    items = parse_text_to_items(payload.raw_text)
    return {
        "total_items": len(items),
        "items": items
    }


@router.post("/parse-file", response_model=ParseResponse)
async def parse_file_endpoint(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """
    Recebe um arquivo XLSX, CSV ou PDF de pedido e extrai automaticamente ISBNs, quantidades e descontos.
    Aplica validação rígida de limite de tamanho (10MB).
    """
    content = await file.read()

    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail="O arquivo excede o limite máximo permitido de 10 MB para importação."
        )

    filename = file.filename or ""
    lower_name = filename.lower()

    if lower_name.endswith((".xlsx", ".xls", ".csv")):
        try:
            items = parse_spreadsheet_to_items(content, filename)
        except Exception as e:
            logger.error(f"Erro ao processar planilha: {e}")
            raise HTTPException(status_code=400, detail=f"Falha ao ler planilha: {str(e)}")
    elif lower_name.endswith(".pdf"):
        try:
            items = parse_pdf_to_items(content)
        except Exception as e:
            logger.error(f"Erro ao processar PDF: {e}")
            raise HTTPException(status_code=400, detail=f"Falha ao processar arquivo PDF: {str(e)}")
    else:
        raise HTTPException(
            status_code=400,
            detail="Formato de arquivo não suportado. Por favor, envie uma planilha XLSX/CSV ou um documento PDF."
        )

    return {
        "total_items": len(items),
        "items": items
    }


# ── 2. Endpoints de Políticas Comerciais da Mesa (Configuração In-Screen) ────

@router.get("/policies")
def get_intake_policies(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    settings = db.query(CompanySettings).filter(
        CompanySettings.company_id == current_user.company_id
    ).first()
    return _extract_intake_policies(settings)


@router.put("/policies")
def update_intake_policies(
    payload: IntakePoliciesPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Salva as Políticas Comerciais da Mesa de Pedidos diretamente para o Seller atual.
    Sincroniza tanto com as colunas padrão de CompanySettings quanto com o JSON estruturado.
    """
    settings = db.query(CompanySettings).filter(
        CompanySettings.company_id == current_user.company_id
    ).first()
    if not settings:
        settings = CompanySettings(company_id=current_user.company_id)
        db.add(settings)

    # Atualiza colunas nativas compartilhadas
    settings.bookinfo_min_stock_buffer = max(0, payload.min_stock_buffer)
    settings.bookinfo_block_consign_low_stock = payload.block_consign_low_stock
    settings.bookinfo_consign_low_stock_threshold = max(0, payload.consign_low_stock_threshold)
    settings.bookinfo_check_existing_consign_balance = payload.consign_existing_balance_mode in ("BLOCK_IF_CONSIGNED", "DEDUCT_TO_CEILING")
    settings.bookinfo_max_consign_client_units = max(1, payload.max_consign_client_units)
    settings.bookinfo_allow_partial_fulfill = payload.allow_partial_fulfill

    # Atualiza JSON de políticas avançadas da Mesa
    cfg = dict(settings.b2b_showcases_config) if isinstance(settings.b2b_showcases_config, dict) else {}
    cfg["intake_policies"] = payload.model_dump()
    settings.b2b_showcases_config = cfg
    flag_modified(settings, "b2b_showcases_config")

    db.commit()
    db.refresh(settings)

    return {
        "success": True,
        "message": "Políticas comerciais da Mesa de Pedidos atualizadas com sucesso!",
        "policies": _extract_intake_policies(settings)
    }


# ── 3. Listagem e Criação de Pedidos na Mesa (`/orders/intake/orders`) ───────

@router.get("/orders")
def list_intake_orders(
    pagina: int = 0,
    tamanho: int = 50,
    status: Optional[str] = Query(None, description="ALL, RECEBIDO, ANALISADO, SENT_TO_HORUS, CANCELADO"),
    type_order: Optional[str] = Query(None, description="ALL, V, C"),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Lista todos os pedidos da Mesa de Pedidos (origin == 'intake_desk') do Seller,
    com KPIs consolidados e informações de atendimento e demanda original vs aprovada.
    """
    base_query = db.query(Order).options(
        joinedload(Order.customer),
        joinedload(Order.items)
    ).filter(
        Order.company_id == current_user.company_id,
        Order.origin == "intake_desk"
    )

    all_desk_orders = base_query.all()
    kpi_counts = {
        "total": len(all_desk_orders),
        "recebido": 0,
        "analisado": 0,
        "enviado_horus": 0,
        "cancelado": 0,
        "total_revenue_approved": 0.0,
        "total_units_requested": 0,
        "total_units_approved": 0,
        "total_units_cut": 0,
    }

    for o in all_desk_orders:
        st = (o.status or "RECEBIDO").upper()
        if st in ("CANCELADO", "CANCELLED"):
            kpi_counts["cancelado"] += 1
        elif o.horus_pedido_venda or st in ("SENT_TO_HORUS", "PROCESSADO", "INVOICED", "FATURADO"):
            kpi_counts["enviado_horus"] += 1
            kpi_counts["total_revenue_approved"] += float(o.total or 0.0)
        elif o.validated_items_erp or st in ("ANALISADO", "ANALISANDO", "PROCESSING"):
            kpi_counts["analisado"] += 1
            kpi_counts["total_revenue_approved"] += float(o.total or 0.0)
        else:
            kpi_counts["recebido"] += 1

        if st not in ("CANCELADO", "CANCELLED"):
            for it in (o.items or []):
                req_u = int(it.quantity_requested or 0)
                app_u = 0 if (it.partner_situation or "").lower() in CUT_SITUATIONS else int(it.quantity or 0)
                kpi_counts["total_units_requested"] += req_u
                kpi_counts["total_units_approved"] += app_u
                kpi_counts["total_units_cut"] += max(0, req_u - app_u)

    # Aplica filtros de status
    filtered_query = base_query
    if status and status.upper() != "ALL":
        st_up = status.upper()
        if st_up == "RECEBIDO":
            filtered_query = filtered_query.filter(
                Order.status.in_(["RECEBIDO", "NEW"]),
                Order.validated_items_erp == False,
                Order.horus_pedido_venda.is_(None)
            )
        elif st_up in ("ANALISADO", "ANALISANDO"):
            filtered_query = filtered_query.filter(
                Order.validated_items_erp == True,
                Order.horus_pedido_venda.is_(None),
                ~Order.status.in_(["CANCELADO", "CANCELLED"])
            )
        elif st_up in ("SENT_TO_HORUS", "PROCESSADO"):
            filtered_query = filtered_query.filter(
                Order.horus_pedido_venda.isnot(None),
                ~Order.status.in_(["CANCELADO", "CANCELLED"])
            )
        elif st_up in ("CANCELADO", "CANCELLED"):
            filtered_query = filtered_query.filter(Order.status.in_(["CANCELADO", "CANCELLED"]))

    if type_order and type_order.upper() in ("V", "C"):
        filtered_query = filtered_query.filter(Order.type_order == type_order.upper())

    if search and search.strip():
        q = f"%{search.strip()}%"
        filtered_query = filtered_query.join(Customer, Order.customer_id == Customer.id, isouter=True).filter(
            or_(
                Customer.name.ilike(q),
                Customer.corporate_name.ilike(q),
                Customer.fantasy_name.ilike(q),
                Customer.document.ilike(q),
                Order.customer_order_ref.ilike(q),
                Order.horus_pedido_venda.ilike(q),
                Order.partner_reference.ilike(q),
            )
        )

    total_filtered = filtered_query.count()
    orders_page = filtered_query.order_by(Order.created_at.desc()).offset(pagina * tamanho).limit(tamanho).all()

    items_out = []
    for o in orders_page:
        cust = o.customer
        order_items = o.items or []
        req_units = sum(int(i.quantity_requested or 0) for i in order_items)
        app_units = sum(
            0 if (i.partner_situation or "").lower() in CUT_SITUATIONS else int(i.quantity or 0)
            for i in order_items
        )
        attendance_pct = round((app_units / req_units) * 100) if req_units > 0 else 0

        # Normaliza status de exibição da Mesa
        raw_status = (o.status or "RECEBIDO").upper()
        if raw_status in ("CANCELADO", "CANCELLED"):
            desk_status = "CANCELADO"
        elif o.horus_pedido_venda or raw_status in ("SENT_TO_HORUS", "PROCESSADO", "INVOICED", "FATURADO"):
            desk_status = "SENT_TO_HORUS"
        elif o.validated_items_erp or raw_status in ("ANALISADO", "ANALISANDO"):
            desk_status = "ANALISADO"
        else:
            desk_status = "RECEBIDO"

        items_out.append({
            "id": o.id,
            "status": desk_status,
            "raw_status": o.status,
            "type_order": o.type_order or "V",
            "channel": o.partner_reference or "MANUAL",
            "customer_order_ref": o.customer_order_ref or "",
            "horus_pedido_venda": o.horus_pedido_venda,
            "validated_items_erp": bool(o.validated_items_erp),
            "created_at": o.created_at.isoformat() if o.created_at else None,
            "updated_at": o.updated_at.isoformat() if o.updated_at else None,
            "subtotal": float(o.subtotal or 0.0),
            "discount": float(o.discount or 0.0),
            "total": float(o.total or 0.0),
            "titles_count": len(order_items),
            "units_requested": req_units,
            "units_approved": app_units,
            "units_cut": max(0, req_units - app_units),
            "attendance_rate": attendance_pct,
            "can_delete": desk_status == "RECEBIDO" and not o.validated_items_erp and not o.horus_pedido_venda,
            "can_cancel": desk_status in ("ANALISADO", "SENT_TO_HORUS"),
            "customer": {
                "id": cust.id if cust else o.customer_id,
                "name": (cust.name or cust.corporate_name or cust.fantasy_name) if cust else "Cliente",
                "document": cust.document if cust else "",
                "id_guid": getattr(cust, "id_guid", None) if cust else None,
            }
        })

    return {
        "total": total_filtered,
        "pagina": pagina,
        "tamanho": tamanho,
        "kpis": kpi_counts,
        "itens": items_out
    }


@router.post("/orders")
async def create_intake_order(
    payload: CreateIntakeOrderRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Cria um novo pedido na Mesa de Pedidos vinculando obrigatoriamente o cliente primeiro.
    Permite origem Excel/CSV, E-mail/Texto ou Digitação Manual.
    """
    customer = db.query(Customer).filter(
        Customer.id == payload.customer_id,
        Customer.company_id == current_user.company_id
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Selecione um cliente válido antes de iniciar o pedido na Mesa.")

    if not payload.items:
        raise HTTPException(status_code=400, detail="Informe pelo menos 1 item (ISBN e quantidade) para criar o pedido na Mesa.")

    # Consolida ISBNs repetidos mantendo a soma da quantidade pedida
    merged_items: Dict[str, Dict[str, Any]] = {}
    for raw_it in payload.items:
        isbn_clean = sanitize_isbn(raw_it.ean)
        if not isbn_clean:
            continue
        qty = max(1, int(raw_it.quantity or 1))
        if isbn_clean in merged_items:
            merged_items[isbn_clean]["quantity"] += qty
            if raw_it.discount and raw_it.discount > 0:
                merged_items[isbn_clean]["discount"] = float(raw_it.discount)
        else:
            merged_items[isbn_clean] = {
                "ean": isbn_clean,
                "quantity": qty,
                "discount": float(raw_it.discount or 0.0),
                "name": raw_it.name,
                "brand": raw_it.brand,
                "origin_tag": raw_it.origin_tag or "ORIGINAL",
            }

    if not merged_items:
        raise HTTPException(status_code=400, detail="Nenhum ISBN/código de barras válido foi identificado.")

    channel_clean = (payload.channel or "MANUAL").upper().strip()
    if channel_clean not in ("EXCEL", "EMAIL", "MANUAL"):
        channel_clean = "MANUAL"

    type_clean = "C" if (payload.type_order or "V").upper() == "C" else "V"

    order = Order(
        company_id=current_user.company_id,
        customer_id=customer.id,
        agent_id=current_user.id,
        status="RECEBIDO",
        type_order=type_clean,
        origin="intake_desk",
        customer_order_ref=(payload.customer_order_ref or "").strip() or None,
        partner_reference=channel_clean,
        validated_items_erp=False,
        validated_items_partner=False,
        subtotal=0.0,
        discount=0.0,
        total=0.0,
        payment_condition="A Vista",
    )
    db.add(order)
    db.flush()

    # Salva observação do pedido se informada
    if payload.notes and payload.notes.strip():
        note_inter = OrderInteraction(
            order_id=order.id,
            user_type="ORDER_NOTE",
            user_id=current_user.id,
            customer_id=customer.id,
            message=payload.notes.strip()
        )
        db.add(note_inter)

    for isbn, it_data in merged_items.items():
        # Tenta enriquecer preliminarmente com o catálogo local se existir
        loc_prod = db.query(Product).filter(
            Product.company_id == current_user.company_id,
            or_(Product.ean_gtin == isbn, Product.sku == isbn)
        ).first()

        title = it_data["name"] or (loc_prod.name if loc_prod else f"ISBN {isbn}")
        brand = it_data["brand"] or (loc_prod.brand if loc_prod and loc_prod.brand else "Aguardando Análise Hórus")
        gross = float(loc_prod.promotional_price or loc_prod.base_price or 0.0) if loc_prod else 0.0
        disc = float(it_data["discount"] or 0.0)
        net = round(gross * (1.0 - disc / 100.0), 2) if gross > 0 else 0.0
        qty = it_data["quantity"]

        o_item = OrderItem(
            order_id=order.id,
            product_id=loc_prod.id if loc_prod else None,
            ean_isbn=isbn,
            sku=loc_prod.sku if loc_prod else isbn,
            name=title,
            brand=brand,
            quantity=qty,
            quantity_requested=qty,
            quantity_fulfilled=0,
            unit_price=net,
            total_price=round(net * qty, 2),
            price_gross=gross,
            partner_discount=disc,
            discount_allowed=float(customer.discount or 0.0),
            partner_item_id=it_data["origin_tag"],
            partner_situation=None,
            situation_detail=None,
            sit_manual_change=False,
            has_erp_registration=True,
        )
        db.add(o_item)

    log_entry = OrderLog(
        order_id=order.id,
        old_status=None,
        new_status="RECEBIDO",
        note=f"Pedido criado na Mesa via {channel_clean} com {len(merged_items)} título(s) ({'Consignação' if type_clean == 'C' else 'Venda Direta'})."
    )
    db.add(log_entry)
    db.commit()
    db.refresh(order)

    # Se auto_analyse estiver ativo, já roda a análise Hórus ao criar
    analysis_error = None
    if payload.auto_analyse:
        try:
            await _run_intake_order_analysis(order, db, current_user)
        except Exception as e:
            analysis_error = str(e)
            logger.warning(f"[CreateIntakeOrder] Pedido #{order.id} criado como RECEBIDO (análise automática falhou: {e})")

    return {
        "success": True,
        "order_id": order.id,
        "status": order.status,
        "analysis_warning": analysis_error,
        "message": f"Pedido #{order.id} registrado na Mesa de Pedidos com sucesso!"
    }


# ── 4. Detalhes, Edição, Exclusão e Cancelamento do Pedido na Mesa ───────────

@router.get("/orders/{order_id}")
async def get_intake_order_detail(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retorna os detalhes do pedido na Mesa de Pedidos na mesma estrutura da tela
    de validação de pedidos da Bookinfo, consultando status em tempo real no Hórus
    e resumo financeiro/consignação do cliente.
    """
    local_order = db.query(Order).filter(
        Order.id == order_id,
        Order.company_id == current_user.company_id,
        Order.origin == "intake_desk"
    ).first()

    if not local_order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado na Mesa de Pedidos.")

    customer = db.query(Customer).filter(Customer.id == local_order.customer_id).first()
    company = db.query(Company).filter(Company.id == local_order.company_id).first()
    cmp_settings = db.query(CompanySettings).filter(
        CompanySettings.company_id == local_order.company_id
    ).first()

    # Consulta status no Hórus em tempo real se já tiver sido enviado ao ERP
    horus_status = None
    horus_invoice = None
    if local_order.horus_pedido_venda:
        try:
            horus_client = HorusOrders(db, current_user.company_id)
            cnpj_dest = (company.document if company and company.document else None) or (cmp_settings.horus_branch if cmp_settings else None)
            h_order = await horus_client.get_order(
                id_doc=customer.document if customer else None,
                id_guid=customer.id_guid if customer else None,
                cnpj_destino=cnpj_dest,
                cod_pedido_origem=None,
                cod_ped_venda=local_order.horus_pedido_venda,
                ignore_customer_context=True
            )
            await horus_client.close()
            if h_order:
                h_data = h_order[0] if isinstance(h_order, list) else h_order
                if isinstance(h_data, dict):
                    horus_status = (h_data.get("STATUS_PEDIDO_VENDA") or h_data.get("STATUS_PEDIDO") or "").strip().upper()
                    horus_invoice = h_data.get("NOTA_FISCAL") or None
        except Exception as e:
            logger.warning(f"[get_intake_order_detail] Aviso ao consultar status Hórus #{local_order.horus_pedido_venda}: {e}")

    all_items_db = db.query(OrderItem).filter(OrderItem.order_id == local_order.id).order_by(OrderItem.id.asc()).all()

    analysed_items_list = []
    original_items_list = []

    for it in all_items_db:
        gross = float(it.price_gross or it.unit_price or 0.0)
        disc_prop = float(it.partner_discount or 0.0)
        disc_auth = float(it.discount_allowed or 0.0)
        net_unit = round(gross * (1.0 - disc_prop / 100.0), 2) if gross > 0 else float(it.unit_price or 0.0)
        qty_req = int(it.quantity_requested or 0)
        sit = it.partner_situation
        qty_app = 0 if (sit or "").lower() in CUT_SITUATIONS else int(it.quantity if it.quantity is not None else qty_req)

        item_dict = {
            "id": it.id,
            "ean_isbn": it.ean_isbn,
            "isbn13": it.ean_isbn,
            "name": it.name,
            "brand": it.brand,
            "qty_requested": qty_req,
            "quantity_requested": qty_req,
            "quantity": qty_app,
            "quantity_fulfilled": int(it.quantity_fulfilled or 0),
            "available_qty": int(it.available_qty or 0),
            "price_gross": gross,
            "unit_price": net_unit,
            "total_price": round(net_unit * qty_app, 2),
            "discount_allowed": disc_auth,
            "partner_discount": disc_prop,
            "partner_situation": sit,
            "situation_detail": it.situation_detail,
            "sit_manual_change": bool(it.sit_manual_change),
            "partner_item_id": it.partner_item_id or "ORIGINAL",
            "consigned_balance": int(getattr(it, "consigned_balance", 0) or 0),
            "has_erp_registration": bool(getattr(it, "has_erp_registration", True)),
            "analysed_at": it.analysed_at.isoformat() if it.analysed_at else None,
        }

        if sit is not None:
            analysed_items_list.append(item_dict)

        original_items_list.append({
            "id": it.id,
            "isbn13": it.ean_isbn,
            "titulo": it.name,
            "editora": it.brand,
            "quantidade": qty_req,
            "quantidadeAprovada": qty_app,
            "descontoProposto": disc_prop,
            "descontoAutorizado": disc_auth,
            "precoCapa": gross,
            "precoLiquido": net_unit,
            "totalLiquidoOriginal": round(net_unit * qty_req, 2),
            "totalLiquidoAprovado": round(net_unit * qty_app, 2),
            "origemItem": it.partner_item_id or "ORIGINAL",
            "situacaoAnalise": sit,
            "detalheAnalise": it.situation_detail,
        })

    # Observações do pedido
    notes_list = db.query(OrderInteraction).filter(
        OrderInteraction.order_id == local_order.id,
        OrderInteraction.user_type == "ORDER_NOTE"
    ).order_by(OrderInteraction.created_at.desc()).all()
    order_notes = "\n".join(n.message for n in notes_list if n.message)

    customer_data = await _get_customer_financial_summary(db, current_user.company_id, customer, cmp_settings) if customer else {}
    company_data = {
        "name": company.name if company else "Editora / Distribuidora",
        "document": company.document if company else ""
    }

    logs_q = db.query(OrderLog).filter(OrderLog.order_id == local_order.id).order_by(OrderLog.created_at.desc()).all()
    timeline = [
        {
            "id": l.id,
            "old_status": l.old_status,
            "new_status": l.new_status,
            "note": l.note,
            "created_at": l.created_at.isoformat() if l.created_at else None
        }
        for l in logs_q
    ]

    raw_status = (local_order.status or "RECEBIDO").upper()
    if raw_status in ("CANCELADO", "CANCELLED"):
        desk_status = "CANCELADO"
    elif local_order.horus_pedido_venda or raw_status in ("SENT_TO_HORUS", "PROCESSADO", "INVOICED", "FATURADO"):
        desk_status = "SENT_TO_HORUS"
    elif local_order.validated_items_erp or raw_status in ("ANALISADO", "ANALISANDO"):
        desk_status = "ANALISADO"
    else:
        desk_status = "RECEBIDO"

    policies = _extract_intake_policies(cmp_settings)

    return {
        "order_internal": {
            "id": local_order.id,
            "status": desk_status,
            "raw_status": local_order.status,
            "type_order": local_order.type_order or "V",
            "channel": local_order.partner_reference or "MANUAL",
            "customer_order_ref": local_order.customer_order_ref or "",
            "notes": order_notes,
            "horus_pedido_venda": local_order.horus_pedido_venda,
            "horus_status": horus_status,
            "horus_invoice": horus_invoice,
            "created_at": local_order.created_at.isoformat() if local_order.created_at else None,
            "updated_at": local_order.updated_at.isoformat() if local_order.updated_at else None,
            "validated_items_erp": bool(local_order.validated_items_erp),
            "subtotal": float(local_order.subtotal or 0.0),
            "discount": float(local_order.discount or 0.0),
            "total": float(local_order.total or 0.0),
            "can_delete": desk_status == "RECEBIDO" and not local_order.validated_items_erp and not local_order.horus_pedido_venda,
            "can_cancel": desk_status in ("ANALISADO", "SENT_TO_HORUS"),
            "analysed_items": analysed_items_list,
            "original_items": original_items_list,
        },
        "customer": customer_data,
        "company": company_data,
        "policies": policies,
        "timeline": timeline,
    }


@router.patch("/orders/{order_id}")
def update_intake_order_header(
    order_id: int,
    payload: UpdateIntakeOrderHeaderRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Permite atualizar o Tipo de Operação (Venda Direta vs Consignação), Referência do Cliente
    ou Observações do pedido enquanto ele ainda não foi enviado ao Hórus.
    """
    order = db.query(Order).filter(
        Order.id == order_id,
        Order.company_id == current_user.company_id,
        Order.origin == "intake_desk"
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")

    if order.horus_pedido_venda or order.status in ("CANCELADO", "CANCELLED"):
        raise HTTPException(status_code=400, detail="Não é permitido alterar cabeçalho de pedido já enviado ao Hórus ou cancelado.")

    if payload.type_order and payload.type_order.upper() in ("V", "C"):
        order.type_order = payload.type_order.upper()
    if payload.customer_order_ref is not None:
        order.customer_order_ref = payload.customer_order_ref.strip() or None

    if payload.notes is not None:
        db.query(OrderInteraction).filter(
            OrderInteraction.order_id == order.id,
            OrderInteraction.user_type == "ORDER_NOTE"
        ).delete()
        if payload.notes.strip():
            db.add(OrderInteraction(
                order_id=order.id,
                user_type="ORDER_NOTE",
                user_id=current_user.id,
                customer_id=order.customer_id,
                message=payload.notes.strip()
            ))

    order.updated_at = datetime.utcnow()
    db.commit()
    return {"success": True, "message": "Dados do pedido atualizados com sucesso!"}


@router.post("/orders/{order_id}/items")
async def add_items_to_intake_order(
    order_id: int,
    payload: AddIntakeOrderItemsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Adiciona novos itens ao pedido na Mesa (seja por nova importação, digitação manual
    ou inclusão de Sugestão Comercial de Novidade/Reposição).
    """
    order = db.query(Order).filter(
        Order.id == order_id,
        Order.company_id == current_user.company_id,
        Order.origin == "intake_desk"
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")

    if order.horus_pedido_venda or order.status in ("CANCELADO", "CANCELLED"):
        raise HTTPException(status_code=400, detail="O pedido já foi enviado ao Hórus ou está cancelado. Não é possível adicionar itens.")

    added_count = 0
    for raw_it in payload.items:
        isbn = sanitize_isbn(raw_it.ean)
        if not isbn:
            continue
        qty = max(1, int(raw_it.quantity or 1))
        existing = db.query(OrderItem).filter(
            OrderItem.order_id == order.id,
            OrderItem.ean_isbn == isbn
        ).first()
        if existing:
            existing.quantity_requested = int(existing.quantity_requested or 0) + qty
            existing.quantity = int(existing.quantity or 0) + qty
            existing.sit_manual_change = False
        else:
            loc_prod = db.query(Product).filter(
                Product.company_id == current_user.company_id,
                or_(Product.ean_gtin == isbn, Product.sku == isbn)
            ).first()
            o_item = OrderItem(
                order_id=order.id,
                product_id=loc_prod.id if loc_prod else None,
                ean_isbn=isbn,
                sku=loc_prod.sku if loc_prod else isbn,
                name=raw_it.name or (loc_prod.name if loc_prod else f"ISBN {isbn}"),
                brand=raw_it.brand or (loc_prod.brand if loc_prod and loc_prod.brand else "Editora"),
                quantity=qty,
                quantity_requested=qty,
                quantity_fulfilled=0,
                unit_price=0.0,
                total_price=0.0,
                price_gross=float(loc_prod.promotional_price or loc_prod.base_price or 0.0) if loc_prod else 0.0,
                partner_discount=float(raw_it.discount or 0.0),
                partner_item_id=raw_it.origin_tag or "ORIGINAL",
                sit_manual_change=False,
            )
            db.add(o_item)
        added_count += 1

    db.commit()

    if payload.auto_analyse and order.validated_items_erp:
        try:
            await _run_intake_order_analysis(order, db, current_user)
        except Exception as e:
            logger.warning(f"[add_items_to_intake_order] Falha ao reanalisar automaticamente: {e}")

    return {
        "success": True,
        "added": added_count,
        "message": f"{added_count} item(ns) incluído(s) no pedido #{order.id}!"
    }


@router.delete("/orders/{order_id}/items/{item_id}")
def delete_intake_order_item(
    order_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    order = db.query(Order).filter(
        Order.id == order_id,
        Order.company_id == current_user.company_id,
        Order.origin == "intake_desk"
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")

    if order.horus_pedido_venda or order.status in ("CANCELADO", "CANCELLED"):
        raise HTTPException(status_code=400, detail="Não é permitido excluir itens de um pedido já enviado ao Hórus ou cancelado.")

    item = db.query(OrderItem).filter(
        OrderItem.id == item_id,
        OrderItem.order_id == order.id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado.")

    db.delete(item)
    db.flush()
    _recalculate_order_totals(order, db)
    db.commit()
    return {"success": True, "message": "Item removido do pedido."}


@router.delete("/orders/{order_id}")
def delete_intake_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Exclui fisicamente um pedido da Mesa SOMENTE se ele ainda estiver em status RECEBIDO
    (não tiver iniciado análise no Hórus nem tiver sido enviado ao ERP).
    """
    order = db.query(Order).filter(
        Order.id == order_id,
        Order.company_id == current_user.company_id,
        Order.origin == "intake_desk"
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado na Mesa.")

    if order.validated_items_erp or order.horus_pedido_venda or order.status not in ("RECEBIDO", "NEW"):
        raise HTTPException(
            status_code=400,
            detail="Este pedido já iniciou análise ou já foi enviado ao Hórus. Utilize a opção 'Cancelar Pedido' para manter o histórico."
        )

    db.delete(order)
    db.commit()
    return {
        "success": True,
        "message": f"Pedido #{order_id} excluído da Mesa de Pedidos com sucesso."
    }


@router.post("/orders/{order_id}/cancel")
def cancel_intake_order(
    order_id: int,
    payload: CancelIntakeOrderRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Cancela um pedido na Mesa de Pedidos que já tenha iniciado análise ou sido enviado ao Hórus,
    mantendo todo o histórico de itens solicitados e analisados para auditoria.
    """
    order = db.query(Order).filter(
        Order.id == order_id,
        Order.company_id == current_user.company_id,
        Order.origin == "intake_desk"
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado na Mesa.")

    if order.status in ("CANCELADO", "CANCELLED"):
        return {"success": True, "message": "Este pedido já se encontra cancelado."}

    old_st = order.status
    order.status = "CANCELADO"
    order.updated_at = datetime.utcnow()

    reason_text = (payload.reason or "Cancelado manualmente na Mesa de Pedidos").strip()
    horus_note = f" (Pedido Hórus vinculado: #{order.horus_pedido_venda})" if order.horus_pedido_venda else ""
    db.add(OrderLog(
        order_id=order.id,
        old_status=old_st,
        new_status="CANCELADO",
        note=f"{reason_text}{horus_note}"
    ))
    db.commit()

    return {
        "success": True,
        "status": "CANCELADO",
        "message": f"Pedido #{order.id} cancelado com sucesso."
    }


# ── 5. Motor de Análise Comercial Hórus (Políticas Comerciais da Mesa) ───────

async def _run_intake_order_analysis(order: Order, db: Session, current_user: User) -> Dict[str, Any]:
    """
    Executa a análise em bloco no ERP Hórus (Busca_AcervoB2B) aplicando as Políticas Comerciais da Mesa:
    - Venda Direta vs Consignação
    - Estoque Mínimo para Consignação
    - Checagem de Saldo Já Consignado no Cliente (REMESSA): Bloquear, Abater até o Teto ou Alertar
    - Buffer de segurança e Atendimento Parcial
    - Desconto Autorizado Hórus (VLR_DESC_CLI) vs Desconto Solicitado
    """
    if order.status in ("CANCELADO", "CANCELLED"):
        raise HTTPException(status_code=400, detail="Pedido cancelado. Não é possível analisar itens.")

    if order.horus_pedido_venda:
        raise HTTPException(
            status_code=400,
            detail=f"Pedido já enviado ao Hórus ERP (#{order.horus_pedido_venda}). Para confrontar com a separação física, utilize 'Confrontar Conferência Hórus'."
        )

    settings = db.query(CompanySettings).filter(
        CompanySettings.company_id == order.company_id
    ).first()
    if not settings or not settings.horus_url:
        raise HTTPException(status_code=400, detail="Integração Hórus ERP não configurada para esta empresa.")

    customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente do pedido não encontrado.")

    items = db.query(OrderItem).filter(OrderItem.order_id == order.id).order_by(OrderItem.id.asc()).all()
    if not items:
        raise HTTPException(status_code=400, detail="O pedido não possui itens para analisar.")

    policies = _extract_intake_policies(settings)

    # 1. Consulta em bloco no Hórus (Busca_AcervoB2B)
    horus_client = HorusProducts(db=db, company_id=order.company_id)
    cnpj = customer.document or "0"
    id_doc, id_guid = await _get_horus_customer_context(db, order.company_id, cnpj, settings)

    if not id_guid:
        raise HTTPException(
            status_code=400,
            detail="Cliente não possui ID GUID vinculado no Hórus ERP. Verifique ou sincronize o cadastro do cliente no Hórus antes de analisar."
        )

    isbns_payload = [{"BARRAS_ISBN": it.ean_isbn} for it in items if it.ean_isbn]
    try:
        horus_res = await horus_client.busca_acervo_b2b(
            id_doc=id_doc,
            id_guid=id_guid,
            isbns=isbns_payload,
            limit=5000
        )
        horus_items = horus_res if isinstance(horus_res, list) else []
        if isinstance(horus_res, dict):
            if "itens" in horus_res:
                horus_items = horus_res["itens"]
            elif "COD_ITEM" in horus_res:
                horus_items = [horus_res]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Falha ao consultar Hórus ERP: {str(e)}")

    horus_map: Dict[str, dict] = {}
    for hi in horus_items:
        isbn_key = str(hi.get("COD_BARRA_ITEM") or hi.get("BARRAS_ISBN") or "").strip()
        if isbn_key:
            horus_map[isbn_key] = hi

    now = datetime.utcnow()
    is_consign = (order.type_order == "C")
    min_buffer = policies["min_stock_buffer"]
    allow_partial = policies["allow_partial_fulfill"]
    direct_pass = policies["direct_sale_pass_through"]
    direct_allow_no_stock = policies["direct_sale_allow_without_stock"]
    block_consign_low = policies["block_consign_low_stock"]
    consign_low_threshold = policies["consign_low_stock_threshold"]
    existing_consign_mode = policies["consign_existing_balance_mode"]  # BLOCK_IF_CONSIGNED | DEDUCT_TO_CEILING | WARN_ONLY
    consign_block_threshold = policies["consign_block_threshold"]
    max_consign_units = policies["max_consign_client_units"]
    auto_apply_disc = policies["auto_apply_horus_discount"]
    block_exceeded_disc = policies["block_exceeded_discount"]

    results = []
    analysed_count = 0

    for item in items:
        isbn = (item.ean_isbn or "").strip()
        req_qty = int(item.quantity_requested or item.quantity or 1)
        hr = horus_map.get(isbn)

        # Saldo consignado atual do cliente no Hórus (REMESSA)
        try:
            remessa_raw = hr.get("REMESSA") if hr else None
            consigned_bal = int(float(str(remessa_raw).replace(",", "."))) if remessa_raw else 0
        except (ValueError, TypeError):
            consigned_bal = 0

        if hr is None:
            auto_situation = "sem_cadastro_erp"
            detail = "Item não localizado no catálogo do ERP Hórus"
            avail_qty = 0
            price_gross = float(item.price_gross or 0.0)
            disc_allowed = float(customer.discount or 0.0)
            has_erp_reg = False
            approved_qty = 0
        else:
            has_erp_reg = True
            avail_qty = int(hr.get("SALDO_DISPONIVEL", 0) or 0)
            price_gross = float(str(hr.get("VLR_CAPA", 0) or 0).replace(",", "."))
            disc_allowed = float(str(hr.get("VLR_DESC_CLI", 0) or 0).replace(",", "."))
            if disc_allowed <= 0 and customer.discount:
                disc_allowed = float(customer.discount)
            sit_item = str(hr.get("SITUACAO_ITEM") or "").strip().upper()

            # Atualiza título e editora reais vindos do Hórus
            item.name = hr.get("NOM_ITEM") or item.name
            item.brand = hr.get("NOM_EDITORA") or item.brand

            # Se auto_apply_horus_discount estiver ativo e o item estiver com desconto 0, aplica o desconto autorizado
            if auto_apply_disc and (not item.partner_discount or float(item.partner_discount) <= 0) and not item.sit_manual_change:
                item.partner_discount = disc_allowed

            prop_disc = float(item.partner_discount or 0.0)

            if sit_item == "FE":
                auto_situation = "esgotado"
                detail = "Livro esgotado no catálogo Hórus (FE)"
                approved_qty = 0
            elif sit_item == "FC":
                auto_situation = "fora_catalogo"
                detail = "Livro fora de catálogo no Hórus (FC)"
                approved_qty = 0
            else:
                details_list = []

                # 1. Validação de Desconto
                if prop_disc > disc_allowed and disc_allowed > 0:
                    details_list.append(f"desconto acima da alçada ({prop_disc:.1f}% > {disc_allowed:.1f}%)")
                    if block_exceeded_disc:
                        auto_situation = "item_rejeitado"
                        approved_qty = 0
                        detail = "; ".join(details_list)
                        # Vai direto para persistência
                        item.available_qty = avail_qty
                        item.price_gross = price_gross
                        item.discount_allowed = disc_allowed
                        item.consigned_balance = consigned_bal
                        item.has_erp_registration = has_erp_reg
                        if not item.sit_manual_change:
                            item.partner_situation = auto_situation
                            item.situation_detail = detail
                            item.quantity = approved_qty
                        item.analysed_at = now
                        analysed_count += 1
                        continue

                # 2. Regras para VENDA DIRETA (type_order == 'V')
                if not is_consign:
                    eff_stock = avail_qty if direct_pass else max(0, avail_qty - min_buffer)
                    if not direct_pass and min_buffer > 0:
                        details_list.append(f"buffer mín {min_buffer}")

                    if direct_pass and direct_allow_no_stock:
                        auto_situation = "reservado_total"
                        approved_qty = req_qty
                        details_list.append("venda direta liberada (passa direto)")
                    elif eff_stock >= req_qty:
                        auto_situation = "reservado_total"
                        approved_qty = req_qty
                        details_list.append("venda direta disponível")
                    elif eff_stock > 0 and allow_partial:
                        auto_situation = "atendimento_parcial_sem_reserva"
                        approved_qty = eff_stock
                        details_list.append(f"venda parcial ({eff_stock}/{req_qty} un)")
                    else:
                        auto_situation = "sem_estoque"
                        approved_qty = 0
                        details_list.append("sem estoque livre")

                # 3. Regras para CONSIGNAÇÃO (type_order == 'C')
                else:
                    eff_stock = max(0, avail_qty - min_buffer)
                    if min_buffer > 0:
                        details_list.append(f"buffer mín {min_buffer}")

                    # 3a. Checa Estoque Mínimo na Editora para Consignar
                    if block_consign_low and avail_qty <= consign_low_threshold:
                        auto_situation = "bloqueado_consignacao"
                        approved_qty = 0
                        details_list.append(
                            f"estoque mínimo consignação: saldo Hórus ({avail_qty} un) <= mínimo ({consign_low_threshold} un)"
                        )
                    # 3b. Checa se o Cliente JÁ TEM o livro consignado (consigned_balance > 0)
                    elif consigned_bal > 0 and existing_consign_mode == "BLOCK_IF_CONSIGNED" and consigned_bal >= consign_block_threshold:
                        auto_situation = "bloqueado_consignacao"
                        approved_qty = 0
                        details_list.append(
                            f"bloqueado: cliente já possui {consigned_bal} un consignadas deste título"
                        )
                    elif consigned_bal > 0 and existing_consign_mode == "DEDUCT_TO_CEILING":
                        allowed_by_ceiling = max(0, max_consign_units - consigned_bal)
                        if allowed_by_ceiling <= 0:
                            auto_situation = "bloqueado_consignacao"
                            approved_qty = 0
                            details_list.append(
                                f"teto atingido: cliente já tem {consigned_bal} un consignadas (teto máx {max_consign_units} un)"
                            )
                        else:
                            target_qty = min(req_qty, allowed_by_ceiling)
                            if eff_stock <= 0:
                                auto_situation = "sem_estoque"
                                approved_qty = 0
                                details_list.append("sem estoque disponível")
                            elif eff_stock >= target_qty:
                                if target_qty < req_qty:
                                    auto_situation = "atendimento_parcial_sem_reserva"
                                    approved_qty = target_qty
                                    details_list.append(
                                        f"abatido p/ {target_qty} un (cliente já possui {consigned_bal} un consignadas; teto {max_consign_units} un)"
                                    )
                                else:
                                    auto_situation = "reservado_total"
                                    approved_qty = target_qty
                                    details_list.append(
                                        f"disponível (cliente já possui {consigned_bal} un consignadas)"
                                    )
                            elif allow_partial:
                                auto_situation = "atendimento_parcial_sem_reserva"
                                approved_qty = min(eff_stock, target_qty)
                                details_list.append(
                                    f"parcial {approved_qty}/{req_qty} un (consignado atual: {consigned_bal} un)"
                                )
                            else:
                                auto_situation = "sem_estoque"
                                approved_qty = 0
                                details_list.append("estoque insuficiente p/ atendimento integral")
                    else:
                        # Modo WARN_ONLY ou consigned_bal == 0
                        if consigned_bal > 0:
                            details_list.append(f"atenção: cliente já possui {consigned_bal} un consignadas")

                        if eff_stock >= req_qty:
                            auto_situation = "reservado_total"
                            approved_qty = req_qty
                            details_list.append("disponível")
                        elif eff_stock > 0 and allow_partial:
                            auto_situation = "atendimento_parcial_sem_reserva"
                            approved_qty = eff_stock
                            details_list.append(f"atendimento parcial ({eff_stock}/{req_qty} un)")
                        else:
                            auto_situation = "sem_estoque"
                            approved_qty = 0
                            details_list.append("sem estoque livre")

                detail = "; ".join(details_list)

        item.available_qty = avail_qty
        item.price_gross = price_gross
        item.discount_allowed = disc_allowed
        item.consigned_balance = consigned_bal
        item.has_erp_registration = has_erp_reg
        item.analysed_at = now

        if not item.sit_manual_change:
            item.partner_situation = auto_situation
            item.situation_detail = detail
            item.quantity = approved_qty
        else:
            # Se teve ajuste manual prévio, respeita a situação manual
            if (item.partner_situation or "").lower() in CUT_SITUATIONS:
                item.quantity = 0

        analysed_count += 1
        results.append({
            "id": item.id,
            "isbn13": isbn,
            "ean_isbn": isbn,
            "name": item.name,
            "brand": item.brand,
            "qty_requested": req_qty,
            "quantity_requested": req_qty,
            "quantity": int(item.quantity or 0),
            "available_qty": avail_qty,
            "consigned_balance": consigned_bal,
            "price_gross": float(price_gross),
            "discount_allowed": float(disc_allowed),
            "partner_discount": float(item.partner_discount or 0.0),
            "partner_situation": item.partner_situation,
            "situation_detail": item.situation_detail,
            "sit_manual_change": bool(item.sit_manual_change),
            "has_erp_registration": has_erp_reg,
            "partner_item_id": item.partner_item_id or "ORIGINAL",
            "analysed_at": now.isoformat(),
        })

    old_st = order.status
    order.validated_items_erp = True
    if order.status in ("RECEBIDO", "NEW"):
        order.status = "ANALISADO"

    _recalculate_order_totals(order, db)

    db.add(OrderLog(
        order_id=order.id,
        old_status=old_st,
        new_status=order.status,
        note=f"Análise comercial Hórus executada na Mesa: {analysed_count} item(ns) avaliado(s) ({'Consignação' if is_consign else 'Venda Direta'})."
    ))
    db.commit()

    summary: Dict[str, int] = {}
    for r in results:
        sit = r["partner_situation"] or "sem_estoque"
        summary[sit] = summary.get(sit, 0) + 1

    return {
        "error": False,
        "analysed": analysed_count,
        "summary": summary,
        "items": results
    }


@router.post("/orders/{order_id}/analyse")
async def analyse_intake_order_endpoint(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    order = db.query(Order).filter(
        Order.id == order_id,
        Order.company_id == current_user.company_id,
        Order.origin == "intake_desk"
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado na Mesa.")

    return await _run_intake_order_analysis(order, db, current_user)


@router.patch("/orders/{order_id}/items/{item_id}/situation")
def update_intake_item_situation(
    order_id: int,
    item_id: int,
    payload: UpdateIntakeItemSituationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Permite ao analista comercial alterar manualmente a Situação, a Quantidade Atendida
    e/ou o Desconto Comercial (%) de um item diretamente na tela de validação da Mesa.
    """
    order = db.query(Order).filter(
        Order.id == order_id,
        Order.company_id == current_user.company_id,
        Order.origin == "intake_desk"
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado na Mesa.")

    if order.horus_pedido_venda or order.status in ("CANCELADO", "CANCELLED"):
        raise HTTPException(status_code=400, detail="Pedido já integrado ao Hórus ou cancelado. Alterações manuais bloqueadas.")

    item = db.query(OrderItem).filter(
        OrderItem.id == item_id,
        OrderItem.order_id == order.id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado.")

    if payload.situation is not None:
        if payload.situation not in VALID_SITUATIONS:
            raise HTTPException(status_code=400, detail=f"Situação inválida: {payload.situation}")
        old_sit = item.partner_situation
        item.partner_situation = payload.situation
        item.sit_manual_change = True

        # Ajusta quantidade aprovada automaticamente conforme a situação escolhida se não foi enviada junto
        if payload.quantity_approved is None:
            if payload.situation in CUT_SITUATIONS:
                item.quantity = 0
            elif payload.situation == "reservado_total":
                item.quantity = int(item.quantity_requested or 1)
            elif payload.situation == "atendimento_parcial_sem_reserva":
                avail = int(item.available_qty or 0)
                req = int(item.quantity_requested or 1)
                item.quantity = min(req, avail) if avail > 0 else max(1, req - 1)

        item.situation_detail = f"Ajuste manual ({old_sit or 'novo'} -> {payload.situation})"

    if payload.quantity_approved is not None:
        new_q = max(0, int(payload.quantity_approved))
        item.quantity = new_q
        item.sit_manual_change = True
        if new_q == 0 and (item.partner_situation or "") not in CUT_SITUATIONS:
            item.partner_situation = "item_rejeitado"
            item.situation_detail = "Quantidade zerada manualmente na Mesa"
        elif new_q > 0 and (item.partner_situation or "") in CUT_SITUATIONS:
            req = int(item.quantity_requested or 1)
            item.partner_situation = "reservado_total" if new_q >= req else "atendimento_parcial_sem_reserva"
            item.situation_detail = f"Liberado manualmente na Mesa ({new_q} un)"
        elif new_q > 0:
            req = int(item.quantity_requested or 1)
            item.partner_situation = "reservado_total" if new_q >= req else "atendimento_parcial_sem_reserva"

    if payload.partner_discount is not None:
        disc = min(100.0, max(0.0, float(payload.partner_discount)))
        item.partner_discount = disc
        item.sit_manual_change = True

    _recalculate_order_totals(order, db)
    db.commit()
    db.refresh(item)

    return {
        "error": False,
        "message": "Item atualizado com sucesso.",
        "item": {
            "id": item.id,
            "partner_situation": item.partner_situation,
            "situation_detail": item.situation_detail,
            "quantity": int(item.quantity or 0),
            "quantity_requested": int(item.quantity_requested or 0),
            "partner_discount": float(item.partner_discount or 0.0),
            "unit_price": float(item.unit_price or 0.0),
            "total_price": float(item.total_price or 0.0),
            "sit_manual_change": bool(item.sit_manual_change),
        },
        "order_totals": {
            "subtotal": float(order.subtotal or 0.0),
            "discount": float(order.discount or 0.0),
            "total": float(order.total or 0.0),
        }
    }


# ── 6. Envio ao Hórus ERP & Pós-Conferência ─────────────────────────────────

@router.post("/orders/{order_id}/send-horus")
async def send_intake_order_to_horus(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Envia para o ERP Hórus APENAS os itens pertinentes (aprovados na análise com quantidade > 0).
    Mantém todos os itens originais e cortados no banco do Cronuz para histórico de demanda reprimida.
    """
    order = db.query(Order).filter(
        Order.id == order_id,
        Order.company_id == current_user.company_id,
        Order.origin == "intake_desk"
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado na Mesa.")

    if order.status in ("CANCELADO", "CANCELLED"):
        raise HTTPException(status_code=400, detail="Pedido cancelado não pode ser enviado ao Hórus.")

    if order.horus_pedido_venda:
        return {
            "success": True,
            "horus_pedido_venda": order.horus_pedido_venda,
            "message": f"Pedido já integrado ao Hórus (#{order.horus_pedido_venda})."
        }

    if not order.validated_items_erp:
        raise HTTPException(
            status_code=400,
            detail="Execute primeiro a etapa '1. Analisar Itens do Pedido' antes de enviar ao Hórus."
        )

    _recalculate_order_totals(order, db)
    db.commit()

    res = await send_order_to_horus(order, db)
    if not res.get("success"):
        raise HTTPException(
            status_code=400,
            detail=res.get("detail") or "Falha ao transmitir pedido para o Hórus ERP."
        )

    return {
        "success": True,
        "horus_pedido_venda": order.horus_pedido_venda,
        "message": f"Pedido enviado ao Hórus com sucesso (#{order.horus_pedido_venda})! Apenas os itens aprovados foram transmitidos."
    }


@router.post("/orders/{order_id}/analyse-post-conference")
async def analyse_intake_order_post_conference(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Confronta o pedido da Mesa já integrado ao Hórus com a conferência física / faturamento (LFT/FAT).
    """
    order = db.query(Order).filter(
        Order.id == order_id,
        Order.company_id == current_user.company_id,
        Order.origin == "intake_desk"
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado na Mesa.")

    if not order.horus_pedido_venda:
        raise HTTPException(status_code=400, detail="Este pedido ainda não foi enviado ao Hórus ERP.")

    horus_orders = HorusOrders(db=db, company_id=current_user.company_id)
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    customer = db.query(Customer).filter(Customer.id == order.customer_id).first()

    horus_status = ""
    try:
        raw_h_order = await horus_orders.get_order(
            id_doc=customer.document if customer else None,
            id_guid=customer.id_guid if customer else None,
            cnpj_destino=company.document if company else None,
            cod_pedido_origem=None,
            cod_ped_venda=order.horus_pedido_venda,
            ignore_customer_context=True
        )
        if raw_h_order:
            h_data = raw_h_order[0] if isinstance(raw_h_order, list) else raw_h_order
            if isinstance(h_data, dict):
                horus_status = (h_data.get("STATUS_PEDIDO_VENDA") or h_data.get("STATUS_PEDIDO") or "").strip().upper()
    except Exception as e:
        logger.warning(f"[analyse-post-conference] Aviso ao consultar status Hórus: {e}")

    raw_items = await horus_orders.get_order_items(order.horus_pedido_venda, limit=5000)
    await horus_orders.close()
    horus_items_list = raw_items if isinstance(raw_items, list) else []

    horus_items_map: Dict[str, dict] = {}
    for h_it in horus_items_list:
        isbn_key = str(h_it.get("BARRAS_ISBN") or h_it.get("COD_BARRA_ITEM") or "").strip()
        if isbn_key:
            horus_items_map[isbn_key] = h_it

    now = datetime.utcnow()
    results = []
    summary: Dict[str, int] = {}

    for item in order.items:
        isbn = (item.ean_isbn or item.sku or "").strip()
        h_match = horus_items_map.get(isbn)
        if h_match:
            fulfilled_qty = int(h_match.get("QTD_ATENDIDA") or h_match.get("QTD_FATURADA") or h_match.get("QTD_PEDIDA") or 0)
            item.quantity_fulfilled = fulfilled_qty
            if fulfilled_qty >= item.quantity_requested:
                item.partner_situation = "reservado_total"
                item.situation_detail = f"Conferido integralmente no Hórus ({fulfilled_qty} un)"
            elif fulfilled_qty > 0:
                item.partner_situation = "atendimento_parcial_sem_reserva"
                item.situation_detail = f"Conferido parcialmente no Hórus ({fulfilled_qty}/{item.quantity_requested} un)"
            else:
                item.partner_situation = "sem_estoque"
                item.situation_detail = "Cortado na conferência física do Hórus"
        item.analysed_at = now
        sit = item.partner_situation or "sem_estoque"
        summary[sit] = summary.get(sit, 0) + 1
        results.append({
            "id": item.id,
            "isbn13": item.ean_isbn,
            "name": item.name,
            "brand": item.brand,
            "qty_requested": item.quantity_requested,
            "qty_fulfilled": item.quantity_fulfilled,
            "partner_situation": item.partner_situation,
            "situation_detail": item.situation_detail,
        })

    db.add(OrderLog(
        order_id=order.id,
        old_status=order.status,
        new_status=order.status,
        note=f"Conferência Hórus confrontada (Status ERP: {horus_status or 'ND'})."
    ))
    db.commit()

    return {
        "error": False,
        "horus_status": horus_status,
        "summary": summary,
        "items": results
    }


# ── 7. Sugestões Comerciais da Mesa (Novidades Hórus + Reposição por Giro) ───

@router.get("/orders/{order_id}/suggestions")
async def get_intake_order_suggestions(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Motor Comercial de Sugestões Inteligentes para o pedido na Mesa:
    1. REPOSIÇÃO (Baseada em Movimentação / Giro em HorusBISale do cliente e curva A da editora)
    2. NOVIDADES (Lançamentos e destaques recentes do acervo Hórus / Cronuz com saldo disponível)
    Valida saldo real em lote no Hórus (Busca_AcervoB2B) respeitando a configuração de paginação/local do Seller.
    """
    order = db.query(Order).filter(
        Order.id == order_id,
        Order.company_id == current_user.company_id,
        Order.origin == "intake_desk"
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado na Mesa.")

    customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
    settings = db.query(CompanySettings).filter(
        CompanySettings.company_id == current_user.company_id
    ).first()
    policies = _extract_intake_policies(settings)

    existing_isbns = {(i.ean_isbn or "").strip() for i in order.items if i.ean_isbn}
    window_days = max(15, int(policies.get("suggestions_window_days", 90)))
    since_date = datetime.utcnow() - timedelta(days=window_days)
    sales_cfops_set = parse_cfop_list(settings.sales_cfops if settings else None)

    candidates_map: Dict[str, Dict[str, Any]] = {}

    # A) Reposição específica do Cliente (histórico de compras em HorusBISale)
    customer_horus_code = (getattr(customer, "horus_cod_cli", None) or getattr(customer, "horus_id", None)) if customer else None
    if customer_horus_code:
        q_cli = db.query(
            HorusBISale.ean,
            HorusBISale.item_name,
            HorusBISale.publisher,
            func.sum(HorusBISale.qty_fulfilled).label("total_sold"),
            func.max(HorusBISale.sale_date).label("last_sold_date")
        ).filter(
            HorusBISale.company_id == current_user.company_id,
            HorusBISale.customer_horus_id == str(customer_horus_code),
            HorusBISale.sale_date >= since_date
        )
        if sales_cfops_set:
            q_cli = q_cli.filter(HorusBISale.cfop.in_(list(sales_cfops_set)))

        cli_rows = q_cli.group_by(
            HorusBISale.ean, HorusBISale.item_name, HorusBISale.publisher
        ).order_by(func.sum(HorusBISale.qty_fulfilled).desc()).limit(25).all()

        for r in cli_rows:
            isbn = sanitize_isbn(r.ean)
            if not isbn or isbn in existing_isbns:
                continue
            sold_qty = int(r.total_sold or 0)
            if sold_qty <= 0:
                continue
            candidates_map[isbn] = {
                "isbn": isbn,
                "title": r.item_name or f"Livro {isbn}",
                "brand": r.publisher or "Editora",
                "category": "REPOSICAO_CLIENTE",
                "sold_qty": sold_qty,
                "suggested_qty": max(2, min(20, round(sold_qty * 0.5))),
                "reason": f"Reposição Cliente: comprou {sold_qty} un nos últimos {window_days} dias",
            }

    # B) Reposição Curva A Geral da Editora (caso o cliente tenha poucos itens em HorusBISale)
    if len(candidates_map) < 12:
        q_gen = db.query(
            HorusBISale.ean,
            HorusBISale.item_name,
            HorusBISale.publisher,
            func.sum(HorusBISale.qty_fulfilled).label("total_sold")
        ).filter(
            HorusBISale.company_id == current_user.company_id,
            HorusBISale.sale_date >= since_date
        )
        if sales_cfops_set:
            q_gen = q_gen.filter(HorusBISale.cfop.in_(list(sales_cfops_set)))

        gen_rows = q_gen.group_by(
            HorusBISale.ean, HorusBISale.item_name, HorusBISale.publisher
        ).order_by(func.sum(HorusBISale.qty_fulfilled).desc()).limit(25).all()

        for r in gen_rows:
            isbn = sanitize_isbn(r.ean)
            if not isbn or isbn in existing_isbns or isbn in candidates_map:
                continue
            sold_qty = int(r.total_sold or 0)
            if sold_qty <= 0:
                continue
            candidates_map[isbn] = {
                "isbn": isbn,
                "title": r.item_name or f"Livro {isbn}",
                "brand": r.publisher or "Editora",
                "category": "REPOSICAO_GIRO",
                "sold_qty": sold_qty,
                "suggested_qty": 3,
                "reason": f"Alto Giro Geral: {sold_qty} un vendidas nos últimos {window_days} dias",
            }
            if len(candidates_map) >= 18:
                break

    # C) Novidades / Lançamentos do Catálogo
    recent_prods = db.query(Product).filter(
        Product.company_id == current_user.company_id
    ).order_by(Product.id.desc()).limit(30).all()

    for p in recent_prods:
        isbn = sanitize_isbn(getattr(p, "ean_gtin", None) or getattr(p, "isbn", None) or getattr(p, "sku", None))
        if not isbn or isbn in existing_isbns or isbn in candidates_map:
            continue
        candidates_map[isbn] = {
            "product_id": p.id,
            "isbn": isbn,
            "title": p.name,
            "brand": p.brand or "Editora",
            "category": "NOVIDADE",
            "sold_qty": 0,
            "suggested_qty": 2,
            "price": float(getattr(p, "promotional_price", None) or getattr(p, "base_price", None) or getattr(p, "price", 0.0) or 0.0),
            "stock_balance": int(getattr(p, "stock_quantity", None) or getattr(p, "stock_balance", 0) or 0),
            "reason": "Novidade / Lançamento recente do catálogo",
        }
        if len(candidates_map) >= 32:
            break

    # Valida saldo e preço em tempo real no Hórus (Busca_AcervoB2B) se Hórus estiver ativo
    horus_map: Dict[str, dict] = {}
    if settings and settings.horus_enabled and settings.horus_url and candidates_map:
        try:
            horus_client = HorusProducts(db=db, company_id=current_user.company_id)
            id_doc, id_guid = await _get_horus_customer_context(
                db, current_user.company_id, customer.document if customer and customer.document else "0", settings
            )
            if id_guid:
                isbns_payload = [{"BARRAS_ISBN": k} for k in list(candidates_map.keys())[:40]]
                h_res = await horus_client.busca_acervo_b2b(
                    id_doc=id_doc,
                    id_guid=id_guid,
                    isbns=isbns_payload,
                    limit=100
                )
                h_list = h_res if isinstance(h_res, list) else (h_res.get("itens", []) if isinstance(h_res, dict) else [])
                for hi in h_list:
                    key = str(hi.get("COD_BARRA_ITEM") or hi.get("BARRAS_ISBN") or "").strip()
                    if key:
                        horus_map[key] = hi
        except Exception as e:
            logger.warning(f"[get_intake_order_suggestions] Aviso ao consultar saldo Hórus p/ sugestões: {e}")

    final_suggestions = []
    min_consign = policies["consign_low_stock_threshold"] if order.type_order == "C" and policies["block_consign_low_stock"] else 0

    for isbn, cand in candidates_map.items():
        hr = horus_map.get(isbn)
        if hr:
            avail = int(hr.get("SALDO_DISPONIVEL", 0) or 0)
            price = float(str(hr.get("VLR_CAPA", 0) or 0).replace(",", "."))
            disc = float(str(hr.get("VLR_DESC_CLI", 0) or 0).replace(",", "."))
            try:
                remessa_raw = hr.get("REMESSA")
                consig_bal = int(float(str(remessa_raw).replace(",", "."))) if remessa_raw else 0
            except Exception:
                consig_bal = 0
            title = hr.get("NOM_ITEM") or cand["title"]
            brand = hr.get("NOM_EDITORA") or cand["brand"]
        else:
            avail = int(cand.get("stock_balance", 0) or 0)
            price = float(cand.get("price", 0.0) or 0.0)
            disc = float(customer.discount or 0.0) if customer else 0.0
            consig_bal = 0
            title = cand["title"]
            brand = cand["brand"]

        # Só sugere livros que realmente possuem saldo disponível acima do mínimo da operação
        if avail <= min_consign or avail <= 0:
            continue

        # Se for consignação e o cliente já tiver saldo consignado bloqueado pela política, pula
        if order.type_order == "C" and consig_bal > 0 and policies["consign_existing_balance_mode"] == "BLOCK_IF_CONSIGNED":
            continue

        final_suggestions.append({
            "product_id": cand.get("product_id"),
            "isbn": isbn,
            "title": title,
            "brand": brand,
            "category": cand["category"],
            "price": price,
            "discount_allowed": disc,
            "stock_balance": avail,
            "consigned_balance": consig_bal,
            "sold_qty": cand.get("sold_qty", 0),
            "suggested_qty": min(avail, int(cand.get("suggested_qty", 2) or 2)),
            "reason": cand["reason"],
        })

    return {
        "error": False,
        "order_id": order.id,
        "total_suggestions": len(final_suggestions),
        "suggestions": final_suggestions[:18]
    }


# ── 8. Compatibilidade com Endpoints Stateless Legados ───────────────────────

@router.post("/analyse")
async def analyse_intake_items(
    payload: AnalyseIntakeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Endpoint stateless de análise rápida."""
    create_req = CreateIntakeOrderRequest(
        customer_id=payload.customer_id,
        type_order=payload.operation_type,
        channel="MANUAL",
        auto_analyse=True,
        items=[
            IntakeOrderItemInput(ean=i.ean, quantity=i.quantity, discount=i.custom_discount or 0.0)
            for i in payload.items
        ]
    )
    res = await create_intake_order(create_req, db, current_user)
    detail = await get_intake_order_detail(res["order_id"], db, current_user)
    return detail


@router.get("/suggestions")
async def get_intake_suggestions(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return {"replacement_suggestions": [], "new_releases": []}

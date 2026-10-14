import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.models.user import User, UserRole
from app.models.customer import Customer
from app.models.company_settings import CompanySettings
from app.models.order import Order, OrderItem
from app.models.proposal import Proposal, ProposalItem
from app.models.product import Product
from app.models.horus_bi_sale import HorusBISale
from app.core.order_parsers import parse_text_to_items, parse_spreadsheet_to_items, parse_pdf_to_items
from app.core.cfop_utils import parse_cfop_list
from app.integrators.horus_products import HorusProducts
from app.api.bookinfo_hub import _get_horus_customer_context

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orders/intake", tags=["order-intake"])

# Limite máximo rígido de arquivo: 10 MB (conforme regra de arquitetura)
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024


# ── Schemas ──────────────────────────────────────────────────────────────────

class ParseTextRequest(BaseModel):
    raw_text: str

class ParsedItem(BaseModel):
    ean: str
    quantity: int = 1

class ParseResponse(BaseModel):
    total_items: int
    items: List[ParsedItem]

class IntakeItemInput(BaseModel):
    ean: str
    quantity: int = 1
    custom_price: Optional[float] = None
    custom_discount: Optional[float] = None

class AnalyseIntakeRequest(BaseModel):
    customer_id: int
    operation_type: str = Field(default="V", description="'V' para Venda Direta ou 'C' para Consignação")
    items: List[IntakeItemInput]

class FinalizeIntakeRequest(BaseModel):
    action: str = Field(..., description="'HORUS_ORDER' ou 'PROPOSAL'")
    customer_id: int
    operation_type: str = Field(default="V", description="'V' ou 'C'")
    items: List[IntakeItemInput]
    title: Optional[str] = "Orçamento / Pré-Pedido Comercial"
    payment_method: Optional[str] = "PIX"
    payment_condition: Optional[str] = "A Vista"
    shipping_cost: Optional[float] = 0.0
    global_discount: Optional[float] = 0.0
    notes: Optional[str] = None


# ── Endpoints de Entrada (Parsers) ───────────────────────────────────────────

@router.post("/parse-text", response_model=ParseResponse)
def parse_text_endpoint(
    payload: ParseTextRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Extrai ISBNs e quantidades a partir de qualquer texto livre (WhatsApp, E-mail, bloco colado).
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
    Recebe um arquivo XLSX, CSV ou PDF de pedido e extrai automaticamente ISBNs e quantidades.
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


# ── Mesa de Análise Comercial ────────────────────────────────────────────────

@router.post("/analyse")
async def analyse_intake_items(
    payload: AnalyseIntakeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Mesa de análise comercial de itens pré-pedidos:
    - Consulta saldo de estoque atual no Horus ERP em lote
    - Consulta histórico de giro/vendas do cliente no PostgreSQL (horus_bi_sales)
      filtrando estritamente pelas CFOPs de venda configuradas no seller.
    - Classifica a situação comercial de cada item.
    """
    customer = db.query(Customer).filter(
        Customer.id == payload.customer_id,
        Customer.company_id == current_user.company_id
    ).first()

    if not customer:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    settings = db.query(CompanySettings).filter(
        CompanySettings.company_id == current_user.company_id
    ).first()

    if not settings:
        raise HTTPException(status_code=400, detail="Configurações da empresa não encontradas.")

    if not payload.items:
        raise HTTPException(status_code=400, detail="Nenhum item informado para análise.")

    # 1. Consulta em lote no Hórus se habilitado
    horus_map: Dict[str, Any] = {}
    if settings.horus_enabled and settings.horus_url:
        try:
            horus_client = HorusProducts(db=db, company_id=current_user.company_id)
            id_doc, id_guid = await _get_horus_customer_context(db, current_user.company_id, customer.document or "0", settings)
            
            isbns_payload = [{"BARRAS_ISBN": item.ean} for item in payload.items if item.ean]
            if isbns_payload and id_guid:
                horus_res = await horus_client.busca_acervo_b2b(
                    id_doc=id_doc,
                    id_guid=id_guid,
                    isbns=isbns_payload,
                    limit=5000
                )
                items_list = horus_res if isinstance(horus_res, list) else []
                if isinstance(horus_res, dict) and "itens" in horus_res:
                    items_list = horus_res["itens"]

                for hi in items_list:
                    key = str(hi.get("COD_BARRA_ITEM") or hi.get("BARRAS_ISBN") or "").strip()
                    if key:
                        horus_map[key] = hi
        except Exception as e:
            logger.warning(f"[Intake Analyse] Falha ao consultar Horus: {e}")

    # 2. Consulta histórico de vendas do cliente no PostgreSQL (horus_bi_sales)
    sales_cfops_set = parse_cfop_list(settings.sales_cfops)
    sixty_days_ago = datetime.utcnow() - timedelta(days=60)
    
    # Busca compras do cliente no período
    all_eans = [i.ean for i in payload.items]
    customer_bi_query = db.query(
        HorusBISale.ean,
        func.sum(HorusBISale.qty_fulfilled).label("total_bought"),
        func.sum(HorusBISale.qty_returned).label("total_returned"),
        func.max(HorusBISale.sale_date).label("last_sale_date")
    ).filter(
        HorusBISale.company_id == current_user.company_id,
        HorusBISale.ean.in_(all_eans),
        HorusBISale.sale_date >= sixty_days_ago
    )

    # Filtra por CFOPs de venda configuradas se houver
    if sales_cfops_set:
        customer_bi_query = customer_bi_query.filter(HorusBISale.cfop.in_(list(sales_cfops_set)))

    # Se o cliente tiver vínculo de código Hórus
    customer_horus_code = getattr(customer, "horus_cod_cli", None) or getattr(customer, "horus_id", None)
    if customer_horus_code:
        customer_bi_query = customer_bi_query.filter(HorusBISale.customer_horus_id == customer_horus_code)

    customer_bi_records = customer_bi_query.group_by(HorusBISale.ean).all()
    history_map = {
        r.ean: {
            "total_bought": int(r.total_bought or 0),
            "total_returned": int(r.total_returned or 0),
            "last_sale_date": r.last_sale_date.strftime("%d/%m/%Y") if r.last_sale_date else None
        } for r in customer_bi_records
    }

    # 3. Processamento linha por linha
    analysed_items = []
    total_requested_units = 0
    total_fulfilled_units = 0
    subtotal_estimated = 0.0

    for item in payload.items:
        ean = item.ean
        req_qty = item.quantity
        total_requested_units += req_qty

        hr = horus_map.get(ean)
        hist = history_map.get(ean, {"total_bought": 0, "total_returned": 0, "last_sale_date": None})

        # Preço e estoque
        if hr:
            title = hr.get("NOM_ITEM") or "Título não informado"
            publisher = hr.get("NOM_EDITORA") or "Editora"
            unit_price = float(hr.get("VLR_CAPA") or hr.get("PRECO") or 0.0)
            avail_stock = int(hr.get("QTD_ESTOQUE") or hr.get("SALDO_DISPONIVEL") or 0)
            has_erp_reg = True
        else:
            # Fallback para produto do catálogo Cronuz local
            loc_prod = db.query(Product).filter(
                Product.company_id == current_user.company_id,
                (Product.ean_gtin == ean) | (Product.sku == ean)
            ).first()
            if loc_prod:
                title = loc_prod.name
                publisher = loc_prod.brand or "Editora"
                unit_price = float(loc_prod.promotional_price or loc_prod.base_price or 0.0)
                avail_stock = int(loc_prod.stock_quantity or 0)
                has_erp_reg = True
            else:
                title = f"Item {ean}"
                publisher = "Desconhecida"
                unit_price = item.custom_price or 0.0
                avail_stock = 0
                has_erp_reg = False

        if item.custom_price is not None:
            unit_price = item.custom_price

        # Diagnóstico de situação
        # Frontend AnalysedItem situation enum: 'OK' | 'PARTIAL' | 'OUT_OF_STOCK' | 'CONSIGN_BLOCKED' | 'NOT_FOUND'
        is_consign = (payload.operation_type == "C")
        consign_warning = False
        notes = ""

        if not has_erp_reg:
            situation = "NOT_FOUND"
            situation_label = "Sem Cadastro ERP"
            approved_qty = 0
            notes = "ISBN não cadastrado no catálogo local nem no ERP."
        elif avail_stock <= 0:
            situation = "OUT_OF_STOCK"
            situation_label = "Sem Estoque"
            approved_qty = 0
            notes = "Item sem saldo disponível em estoque."
        elif is_consign and avail_stock > 0 and avail_stock <= 5 and settings.bookinfo_block_consign_low_stock:
            situation = "CONSIGN_BLOCKED"
            situation_label = "Bloqueado p/ Consignação"
            approved_qty = 0
            consign_warning = True
            notes = f"Estoque crítico ({avail_stock} un). Consignação bloqueada pelas regras."
        elif avail_stock < req_qty:
            situation = "PARTIAL"
            situation_label = "Atendimento Parcial"
            approved_qty = avail_stock
            notes = f"Atendido parcialmente ({avail_stock}/{req_qty})."
        else:
            situation = "OK"
            situation_label = "Reservado Total"
            approved_qty = req_qty
            notes = "Atendimento integral aprovado."

        if is_consign and avail_stock > 0 and avail_stock <= 5:
            consign_warning = True

        total_fulfilled_units += approved_qty
        item_total = round(approved_qty * unit_price, 2)
        subtotal_estimated += item_total

        analysed_items.append({
            "ean": ean,
            "title": title,
            "publisher": publisher,
            "requested_qty": req_qty,
            "approved_qty": approved_qty,
            "requested_quantity": req_qty,
            "approved_quantity": approved_qty,
            "unit_price": unit_price,
            "discount_percent": 0.0,
            "final_unit_price": unit_price,
            "total_price": item_total,
            "available_stock": avail_stock,
            "consigned_balance": 0,
            "situation": situation,
            "situation_label": situation_label,
            "consign_warning": consign_warning,
            "notes": notes,
            "customer_last_60d_sold": hist["total_bought"],
            "customer_last_60d_returned": hist["total_returned"],
            "customer_last_sale_date": hist["last_sale_date"],
            "history_60d": {
                "total_bought": hist["total_bought"],
                "total_returned": hist["total_returned"],
                "last_sale_date": hist["last_sale_date"]
            }
        })

    fill_rate_percent = round((total_fulfilled_units / total_requested_units) * 100) if total_requested_units > 0 else 100
    consign_blocked_count = sum(1 for it in analysed_items if it.get("situation") == "CONSIGN_BLOCKED")

    return {
        "customer": {
            "id": customer.id,
            "name": customer.name,
            "document": customer.document,
            "credit_limit": float(customer.credit_limit or 0.0),
            "open_debts": float(customer.open_debts or 0.0),
            "available_credit": float((customer.credit_limit or 0.0) - (customer.open_debts or 0.0)),
            "discount_percent": float(customer.discount or 0.0)
        },
        "summary": {
            "total_lines": len(analysed_items),
            "total_requested_units": total_requested_units,
            "total_fulfilled_units": total_fulfilled_units,
            "subtotal_estimated": round(subtotal_estimated, 2),
            "fill_rate_percent": fill_rate_percent,
            "has_unfulfilled_items": total_fulfilled_units < total_requested_units,
            "consign_blocked_count": consign_blocked_count
        },
        "items": analysed_items
    }


# ── Motor de Sugestão Preditiva ──────────────────────────────────────────────

@router.get("/suggestions")
async def get_intake_suggestions(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retorna sugestões inteligentes baseadas em vendas reais do Horus BI:
    1. Livros com alto giro recente daquele cliente que NÃO estão no pedido atual.
    2. Lançamentos recentes com estoque positivo.
    """
    settings = db.query(CompanySettings).filter(
        CompanySettings.company_id == current_user.company_id
    ).first()

    sales_cfops_set = parse_cfop_list(settings.sales_cfops if settings else None)
    sixty_days_ago = datetime.utcnow() - timedelta(days=60)

    # Busca os livros mais vendidos deste cliente no período
    query = db.query(
        HorusBISale.ean,
        HorusBISale.item_name,
        HorusBISale.publisher,
        HorusBISale.genre,
        func.sum(HorusBISale.qty_fulfilled).label("total_sold"),
        func.max(HorusBISale.sale_date).label("last_sold_date")
    ).filter(
        HorusBISale.company_id == current_user.company_id,
        HorusBISale.sale_date >= sixty_days_ago
    )

    if sales_cfops_set:
        query = query.filter(HorusBISale.cfop.in_(list(sales_cfops_set)))

    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    customer_horus_code = (getattr(customer, "horus_cod_cli", None) or getattr(customer, "horus_id", None)) if customer else None
    if customer_horus_code:
        query = query.filter(HorusBISale.customer_horus_id == customer_horus_code)

    top_sold = query.group_by(
        HorusBISale.ean,
        HorusBISale.item_name,
        HorusBISale.publisher,
        HorusBISale.genre
    ).order_by(func.sum(HorusBISale.qty_fulfilled).desc()).limit(15).all()

    suggestions = []
    for r in top_sold:
        # Busca estoque no catálogo local Cronuz
        prod = db.query(Product).filter(
            Product.company_id == current_user.company_id,
            (Product.ean_gtin == r.ean) | (Product.sku == r.ean)
        ).first()

        stock_bal = int(prod.stock_quantity or 0) if prod else 10
        price = float(prod.promotional_price or prod.base_price or 0.0) if prod else 0.0

        suggestions.append({
            "ean": r.ean,
            "title": r.item_name or (prod.name if prod else f"Livro {r.ean}"),
            "publisher": r.publisher or (prod.brand if prod else "Editora"),
            "genre": r.genre or "Geral",
            "price": price,
            "available_stock": stock_bal,
            "sold_last_60d": int(r.total_sold or 0),
            "last_sold_date": r.last_sold_date.strftime("%d/%m/%Y") if r.last_sold_date else None,
            "reason": f"Cliente vendeu {int(r.total_sold or 0)} unidades nos últimos 60 dias"
        })

    # Lançamentos recentes com estoque
    featured_products = db.query(Product).filter(
        Product.company_id == current_user.company_id,
        Product.status == "ACTIVE",
        Product.stock_quantity > 0
    ).order_by(Product.id.desc()).limit(6).all()

    releases = []
    for fp in featured_products:
        isbn = fp.ean_gtin or fp.sku or ""
        releases.append({
            "ean": isbn,
            "title": fp.name,
            "publisher": fp.brand or "Editora",
            "price": float(fp.promotional_price or fp.base_price or 0.0),
            "available_stock": int(fp.stock_quantity or 0),
            "reason": "Lançamento recente com estoque no catálogo"
        })

    return {
        "replacement_suggestions": suggestions,
        "new_releases": releases
    }


# ── Finalização (Injetar no Hórus ou Gerar Proposta) ─────────────────────────

@router.post("/finalize")
def finalize_intake(
    payload: FinalizeIntakeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Finaliza a mesa de análise:
    - Se action == 'HORUS_ORDER': cria o pedido de venda ou consignação no Cronuz e injeta no Hórus ERP.
    - Se action == 'PROPOSAL': converte em Proposta Comercial com link público para colher assinatura digital do cliente.
    """
    customer = db.query(Customer).filter(
        Customer.id == payload.customer_id,
        Customer.company_id == current_user.company_id
    ).first()

    if not customer:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    if not payload.items:
        raise HTTPException(status_code=400, detail="Adicione pelo menos 1 item para finalizar.")

    # 1. Fluxo de Criação de Proposta Comercial
    if payload.action == "PROPOSAL":
        # Calcula sequential local_id por empresa
        max_local_id = db.query(func.max(Proposal.local_id)).filter(
            Proposal.company_id == current_user.company_id
        ).scalar() or 0
        local_id = max_local_id + 1

        today = datetime.utcnow().date()
        valid_until = today + timedelta(days=15)

        # Monta itens da proposta
        subtotal = 0.0
        proposal_items = []
        for it in payload.items:
            # Encontra produto local ou cria linha
            prod = db.query(Product).filter(
                Product.company_id == current_user.company_id,
                (Product.ean_gtin == it.ean) | (Product.sku == it.ean)
            ).first()

            price = it.custom_price if it.custom_price is not None else (float(prod.promotional_price or prod.base_price or 0.0) if prod else 0.0)
            disc = it.custom_discount or 0.0
            line_total = round((price * it.quantity) - disc, 2)
            subtotal += line_total

            p_item = ProposalItem(
                item_type="PRODUCT",
                product_id=prod.id if prod else None,
                quantity=it.quantity,
                unit_price=price,
                discount=disc,
                total_price=line_total,
                custom_description=f"ISBN: {it.ean}"
            )
            proposal_items.append(p_item)

        total = max(0.0, round(subtotal - (payload.global_discount or 0.0) + (payload.shipping_cost or 0.0), 2))

        proposal = Proposal(
            company_id=current_user.company_id,
            local_id=local_id,
            title=payload.title or "Orçamento Comercial",
            status="DRAFT",
            valid_from=today,
            valid_until=valid_until,
            relation_type="CUSTOMER",
            customer_id=customer.id,
            subtotal=subtotal,
            discount=payload.global_discount or 0.0,
            shipping_cost=payload.shipping_cost or 0.0,
            total=total,
            payment_method=payload.payment_method or "PIX",
            payment_condition=payload.payment_condition or "A Vista",
            notes=payload.notes,
            items=proposal_items
        )

        db.add(proposal)
        db.commit()
        db.refresh(proposal)

        return {
            "status": "success",
            "type": "PROPOSAL",
            "proposal_id": proposal.id,
            "proposal_local_id": proposal.local_id,
            "message": f"Proposta Comercial #{proposal.local_id} criada com sucesso!"
        }

    # 2. Fluxo de Criação de Pedido (Order)
    elif payload.action == "HORUS_ORDER":
        subtotal = 0.0
        order_items = []
        for it in payload.items:
            prod = db.query(Product).filter(
                Product.company_id == current_user.company_id,
                (Product.ean_gtin == it.ean) | (Product.sku == it.ean)
            ).first()

            price = it.custom_price if it.custom_price is not None else (float(prod.promotional_price or prod.base_price or 0.0) if prod else 0.0)
            disc = it.custom_discount or 0.0
            line_total = round((price * it.quantity) - disc, 2)
            subtotal += line_total

            if prod:
                o_item = OrderItem(
                    product_id=prod.id,
                    quantity=it.quantity,
                    quantity_requested=it.quantity,
                    unit_price=price,
                    total_price=line_total,
                    ean_isbn=it.ean
                )
                order_items.append(o_item)

        total = max(0.0, round(subtotal - (payload.global_discount or 0.0) + (payload.shipping_cost or 0.0), 2))

        order = Order(
            company_id=current_user.company_id,
            customer_id=customer.id,
            agent_id=current_user.id,
            status="NEW",
            type_order=payload.operation_type or "V",
            origin="intake_desk",
            subtotal=subtotal,
            discount=payload.global_discount or 0.0,
            total=total,
            payment_condition=payload.payment_condition or "A Vista",
            items=order_items
        )

        db.add(order)
        db.commit()
        db.refresh(order)

        return {
            "status": "success",
            "type": "ORDER",
            "order_id": order.id,
            "message": f"Pedido #{order.id} gerado com sucesso na Mesa de Análise!"
        }

    else:
        raise HTTPException(status_code=400, detail=f"Ação inválida: {payload.action}")

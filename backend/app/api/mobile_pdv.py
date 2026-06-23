"""
mobile_pdv.py
Endpoints dedicados ao app mobile — PDV e Dashboard.
Prefixo: /mobile
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from datetime import datetime, timedelta
from typing import List, Optional
from pydantic import BaseModel

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.order import Order
from app.models.customer import Customer
from app.models.company_settings import CompanySettings

router = APIRouter(prefix="/mobile", tags=["mobile-pdv"])


# ─────────────────────────────────────────────────────────────────────────────
# DASHBOARD MOBILE
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/dashboard")
def mobile_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    KPIs de vendas simplificados para o app mobile.
    Retorna: kpis (hoje e mês) + últimos 10 pedidos.
    """
    company_id = current_user.company_id
    if not company_id:
        raise HTTPException(status_code=400, detail="Usuário sem empresa vinculada")

    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    base = db.query(Order).filter(
        Order.company_id == company_id,
        Order.status.notin_(["CANCELLED"]),
    )

    # Hoje
    today_orders = base.filter(Order.confirmed_at >= today_start).count()
    today_revenue = db.query(func.sum(Order.total)).filter(
        Order.company_id == company_id,
        Order.status.notin_(["CANCELLED"]),
        Order.confirmed_at >= today_start,
    ).scalar() or 0.0

    # Mês
    month_orders = base.filter(Order.confirmed_at >= month_start).count()
    month_revenue = db.query(func.sum(Order.total)).filter(
        Order.company_id == company_id,
        Order.status.notin_(["CANCELLED"]),
        Order.confirmed_at >= month_start,
    ).scalar() or 0.0

    pending_orders = base.filter(
        Order.status.in_(["PROCESSING", "NEW", "PENDING"])
    ).count()

    total_customers = db.query(Customer).filter(
        Customer.company_id == company_id
    ).count()

    # Pedidos recentes
    recent = (
        db.query(Order, Customer.name, Customer.corporate_name)
        .join(Customer, Customer.id == Order.customer_id, isouter=True)
        .filter(Order.company_id == company_id)
        .order_by(desc(Order.confirmed_at))
        .limit(10)
        .all()
    )

    recent_orders = []
    for order, cust_name, cust_corp in recent:
        status_val = order.status
        if hasattr(status_val, 'value'):
            status_val = status_val.value
        recent_orders.append({
            "id": order.id,
            "order_number": f"#{order.id}",
            "customer_name": cust_name or cust_corp or "Cliente",
            "total": float(order.total or 0),
            "status": str(status_val),
            "created_at": order.confirmed_at.isoformat() if order.confirmed_at else (
                order.created_at.isoformat() if order.created_at else ""
            ),
        })

    return {
        "kpis": {
            "orders_today": today_orders,
            "revenue_today": float(today_revenue),
            "orders_month": month_orders,
            "revenue_month": float(month_revenue),
            "pending_orders": pending_orders,
            "total_customers": total_customers,
        },
        "recent_orders": recent_orders,
    }


# ─────────────────────────────────────────────────────────────────────────────
# CLIENTES — busca simplificada para PDV
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/pdv/customers")
def pdv_customers(
    q: str = Query(default="", description="Busca por nome, CPF ou CNPJ"),
    limit: int = Query(default=20, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    company_id = current_user.company_id
    query = db.query(Customer).filter(Customer.company_id == company_id)

    if q:
        search_term = f"%{q}%"
        query = query.filter(
            (Customer.name.ilike(search_term)) |
            (Customer.corporate_name.ilike(search_term)) |
            (Customer.document.ilike(search_term))
        )

    customers = query.order_by(Customer.name).limit(limit).all()

    result = []
    for c in customers:
        pol = None
        if getattr(c, 'commercial_policy_id', None) and getattr(c, 'commercial_policy', None):
            p = c.commercial_policy
            pol = {
                "discount_sale_percent": float(getattr(p, 'discount_sale_percent', 0) or 0),
                "discount_consignment_percent": float(getattr(p, 'discount_consignment_percent', 0) or 0),
                "allow_consignment": bool(getattr(p, 'allow_consignment', False)),
                "max_installments": int(getattr(p, 'max_installments', 1) or 1),
            }

        result.append({
            "id": c.id,
            "name": c.name or c.corporate_name or "Sem nome",
            "document": c.document,
            "email": c.email,
            "phone": c.phone,
            "id_guid": getattr(c, "id_guid", None),
            "consignment_status": getattr(c, "consignment_status", "INACTIVE"),
            "discount": float(getattr(c, "discount", 0) or 0),
            "commercial_policy": pol,
        })

    return result


# ─────────────────────────────────────────────────────────────────────────────
# PRODUTOS — busca para PDV (Horus ou Cronuz automaticamente)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/pdv/products")
def pdv_products(
    q: str = Query(default="", description="Busca por nome ou código"),
    customer_id: Optional[int] = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Busca produtos para o PDV.
    Delega ao endpoint /products que já implementa Horus B2B vs Cronuz.
    """
    from app.api.products import list_products

    skip = (page - 1) * limit
    result = list_products(
        skip=skip,
        limit=limit,
        search=q or None,
        customer_id=customer_id,
        source=None,
        category_id=None,
        order_by="name",
        db=db,
        current_user=current_user,
    )

    items = result.get("items", [])
    return {
        "items": items,
        "total": result.get("total", len(items)),
        "page": page,
        "limit": limit,
    }


# ─────────────────────────────────────────────────────────────────────────────
# CONDIÇÕES DE PAGAMENTO
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/pdv/payment-terms")
def pdv_payment_terms(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retorna condições de pagamento da empresa para seleção no PDV."""
    try:
        from app.models.commercial_policy import PaymentCondition
        terms = db.query(PaymentCondition).filter(
            PaymentCondition.company_id == current_user.company_id,
            PaymentCondition.active == True,
        ).order_by(PaymentCondition.name).all()

        return [
            {"id": t.id, "name": t.name, "description": getattr(t, "description", "")}
            for t in terms
        ]
    except Exception:
        # Fallback: condições padrão se modelo não existir
        return [
            {"id": "AVISTA", "name": "À Vista", "description": "Pagamento imediato"},
            {"id": "30", "name": "30 dias", "description": ""},
            {"id": "30/60", "name": "30/60 dias", "description": ""},
            {"id": "30/60/90", "name": "30/60/90 dias", "description": ""},
        ]


# ─────────────────────────────────────────────────────────────────────────────
# CRIAR PEDIDO — PDV Mobile
# ─────────────────────────────────────────────────────────────────────────────

class PDVOrderItem(BaseModel):
    product_id: Optional[int] = None
    ean_isbn: Optional[str] = None
    sku: Optional[str] = None
    name: Optional[str] = None
    quantity: float
    unit_price: float

class PDVOrderCreate(BaseModel):
    customer_id: int
    items: List[PDVOrderItem]
    payment_condition: Optional[str] = None
    payment_term_id: Optional[int] = None
    total_amount: float
    external_order_number: Optional[str] = None   # "Meu Pedido"
    notes: Optional[str] = None
    source: str = "pdv_mobile"
    type_order: str = "V"   # V=Venda B=Bonificação A=Amostra T=Troca

@router.post("/pdv/orders")
def pdv_create_order(
    payload: PDVOrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Cria um pedido a partir do PDV mobile.
    - Não aplica desconto manual (política comercial já está nos preços)
    - Suporta campo 'Meu Pedido' (external_order_number)
    - Suporta tipo de venda: V/B/A/T
    - Integra com Horus se empresa usar Horus ERP
    """
    from app.models.order import Order, OrderItem
    from app.models.product import Product
    import uuid

    company_id = current_user.company_id
    if not company_id:
        raise HTTPException(status_code=400, detail="Usuário sem empresa vinculada")

    if not payload.items:
        raise HTTPException(status_code=400, detail="Pedido deve ter pelo menos 1 item")

    # Valida cliente
    customer = db.query(Customer).filter(
        Customer.id == payload.customer_id,
        Customer.company_id == company_id,
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    # Calcula total real a partir dos itens (ignora desconto manual)
    total_calculado = sum(
        float(item.unit_price) * float(item.quantity)
        for item in payload.items
    )

    # Cria o pedido
    order = Order(
        company_id=company_id,
        customer_id=payload.customer_id,
        agent_id=current_user.id,
        status="PROCESSING",
        total=total_calculado,
        subtotal=total_calculado,
        discount=0.0,
        notes=payload.notes,
        origin=payload.source,
        type_order=payload.type_order,
        payment_condition=payload.payment_condition,
        customer_order_ref=payload.external_order_number,
        confirmed_at=datetime.utcnow(),
    )
    db.add(order)
    db.flush()  # gera order.id sem commit

    # Cria os itens do pedido
    for item_data in payload.items:
        # Tenta buscar produto pelo id
        product = None
        if item_data.product_id:
            product = db.query(Product).filter(
                Product.id == item_data.product_id,
                Product.company_id == company_id,
            ).first()

        order_item = OrderItem(
            order_id=order.id,
            product_id=item_data.product_id,
            name=item_data.name or (product.name if product else "Produto"),
            sku=item_data.sku or (product.sku if product else None),
            ean_isbn=item_data.ean_isbn,
            quantity=int(item_data.quantity),
            quantity_requested=int(item_data.quantity),
            unit_price=float(item_data.unit_price),
            total_price=float(item_data.unit_price) * float(item_data.quantity),
        )
        db.add(order_item)


    db.commit()
    db.refresh(order)

    # Tenta enviar ao Horus se empresa tiver integração
    horus_pedido = None
    try:
        from app.models.company import Company
        company = db.query(Company).filter(Company.id == company_id).first()
        if company and getattr(company, 'module_horus_erp', False):
            from app.api.horus import send_order_to_horus
            horus_result = send_order_to_horus(order.id, db)
            horus_pedido = horus_result.get("pedido_venda") if horus_result else None
            if horus_pedido:
                order.status = "SENT_TO_HORUS"
                db.commit()
    except Exception:
        pass  # Falha silenciosa — pedido criado mas não enviado ao Horus

    return {
        "id": order.id,
        "order_number": payload.external_order_number or f"#{order.id}",
        "status": order.status,
        "total": float(total_calculado),
        "horus_pedido_venda": horus_pedido,
    }


from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from app.db.session import get_db
from app.models.user import User
from app.core.dependencies import get_current_user
from app.models.order import Order
from app.schemas.order import OrderResponse, PDVOrderCreate

router = APIRouter(tags=["orders"])

@router.post("/orders", response_model=dict)
async def create_pdv_order(
    payload: PDVOrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.company_settings import CompanySettings
    from app.models.company import Company
    from app.models.customer import Customer
    from app.models.product import Product
    from app.models.order import OrderItem
    from app.models.order_log import OrderLog
    
    if current_user.type not in ["MASTER", "SELLER", "AGENT"]:
        raise HTTPException(status_code=403, detail="Acesso não autorizado")

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == current_user.company_id).first()
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    customer = db.query(Customer).filter(Customer.id == payload.customer_id).first()
    
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
        
    if customer.crm_status == 'BLOCKED':
        raise HTTPException(status_code=403, detail="Cliente encontra-se pendente/bloqueado em nosso CRM. Criação de pedido negada.")

    # Local Order Creation
    order = Order(
        company_id=current_user.company_id,
        customer_id=payload.customer_id,
        agent_id=current_user.id,
        status="PROCESSING",
        origin=payload.source,
        type_order=payload.type_order or "V",
        subtotal=sum([i.quantity * i.unit_price for i in payload.items]),
        discount=payload.discount_amount,
        total=payload.total_amount
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    # Initial Log
    log_new = OrderLog(order_id=order.id, old_status=None, new_status="NEW")
    db.add(log_new)
    db.commit()

    # Generate Financial Transactions for ALL orders
    from app.core.financial_service import generate_financial_for_order
    generate_financial_for_order(
        db=db, 
        company_id=current_user.company_id, 
        customer=customer, 
        order=order, 
        provided_payment_condition=payload.payment_condition
    )

    # Add Items
    for item in payload.items:
        prod_ref = None
        if item.product_id:
            prod_ref = db.query(Product).filter(Product.id == item.product_id).first()
            
        ean_isbn = item.ean_isbn or (prod_ref.ean_gtin if prod_ref else None)
        sku = item.sku or (prod_ref.sku if prod_ref else None)
        name = item.name or (prod_ref.name if prod_ref else f"Produto Horus" if item.ean_isbn else f"Produto Desconhecido")
        brand = prod_ref.brand if prod_ref else None

        new_item = OrderItem(
            order_id=order.id,
            product_id=item.product_id,
            ean_isbn=ean_isbn,
            sku=sku,
            name=name,
            brand=brand,
            quantity=item.quantity,
            quantity_requested=item.quantity,
            unit_price=item.unit_price,
            total_price=item.quantity * item.unit_price
        )
        db.add(new_item)
    db.commit()

    # Horus Integration (B2B Mode)
    if settings and settings.horus_enabled and getattr(settings, "horus_api_mode", "B2B") == "B2B":
        if customer.id_guid:
            from app.integrators.horus_orders import HorusOrders
            horus_client = HorusOrders(db, current_user.company_id)
            
            try:
                order_res = await horus_client.send_order(
                    id_doc=customer.document,
                    id_guid=customer.id_guid,
                    cnpj_destino=company.document,
                    cod_pedido_origem=order.id,
                    type_order=order.type_order,
                    obs=f"PDV VENDA {order.id}"
                )
                
                if order_res and not order_res.get("error"):
                    horus_ped_venda = order_res.get("COD_PED_VENDA")
                    
                    for item in payload.items:
                        prod_ref = None
                        if item.product_id:
                            prod_ref = db.query(Product).filter(Product.id == item.product_id).first()
                        
                        isbn_or_sku = item.ean_isbn or item.sku or (prod_ref.ean_gtin if prod_ref and prod_ref.ean_gtin else (prod_ref.sku if prod_ref else None))
                        
                        await horus_client.send_order_item(
                            id_doc=customer.document,
                            id_guid=customer.id_guid,
                            cnpj_destino=company.document,
                            cod_pedido_origem=order.id,
                            isbn=isbn_or_sku,
                            qty=item.quantity,
                            price=item.unit_price
                        )
                            
                    order.horus_pedido_venda = str(horus_ped_venda).strip() if horus_ped_venda else None
                    order.status = "SENT_TO_HORUS"
                    log_horus = OrderLog(order_id=order.id, old_status="NEW", new_status="SENT_TO_HORUS")
                    db.add(log_horus)
                    db.commit()
            except Exception as e:
                print(f"Error syncing PDV order to Horus: {e}")
            finally:
                await horus_client.close()

    return {"status": "success", "order_id": order.id, "horus_id": order.horus_pedido_venda}


@router.get("/orders", response_model=dict)
def get_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    search: Optional[str] = None,
    customer_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in ["MASTER", "SELLER", "AGENT"]:
        raise HTTPException(status_code=403, detail="Acesso não autorizado")
        
    from app.models.customer import Customer
    query = db.query(Order).options(joinedload(Order.customer))
    
    if current_user.type == "SELLER":
        query = query.filter(Order.company_id == current_user.company_id)
    elif current_user.type == "AGENT":
        query = query.filter(Order.company_id == current_user.company_id, Order.agent_id == current_user.id)
    elif current_user.type == "MASTER" and current_user.tenant_id and current_user.tenant_id != "cronuz":
        from app.models.company import Company
        query = query.join(Company, Order.company_id == Company.id)
        if False:
            query = query.filter(Company.module_horus_erp == True)
        else:
            query = query.filter(Company.tenant_id == current_user.tenant_id)
            
    if customer_id:
        query = query.filter(Order.customer_id == customer_id)
        
    if status:
        status_list = [s.strip() for s in status.split(',')]
        if len(status_list) > 1:
            query = query.filter(Order.status.in_(status_list))
        else:
            query = query.filter(Order.status == status)
    else:
        query = query.filter(Order.status != "NEW")
    
    if search:
        search_filter = f"%{search}%"
        query = query.join(Customer).filter(
            (Order.horus_pedido_venda.ilike(search_filter)) |
            (Customer.document.ilike(search_filter)) |
            (Customer.corporate_name.ilike(search_filter)) |
            (Customer.name.ilike(search_filter))
        )
        
    total = query.count()
    orders = query.order_by(Order.created_at.desc()).offset(skip).limit(limit).all()
    
    result_items = []
    for o in orders:
        order_dict = OrderResponse.model_validate(o).model_dump()
        if o.customer:
            order_dict["customer"] = {
                "id": o.customer.id,
                "corporate_name": o.customer.corporate_name,
                "fantasy_name": o.customer.name,
                "document": o.customer.document
            }
        result_items.append(order_dict)
    
    return {
        "items": result_items,
        "total": total,
        "page": (skip // limit) + 1,
        "pages": (total + limit - 1) // limit
    }

@router.delete("/orders/{order_id}")
def delete_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in ["MASTER", "SELLER", "AGENT"]:
        raise HTTPException(status_code=403, detail="Acesso não autorizado")
        
    query = db.query(Order).filter(Order.id == order_id)
    if current_user.type == "SELLER":
        query = query.filter(Order.company_id == current_user.company_id)
    elif current_user.type == "AGENT":
        query = query.filter(Order.company_id == current_user.company_id, Order.agent_id == current_user.id)
    
    order = query.first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")
    
    if order.status != "NEW":
        raise HTTPException(status_code=400, detail="Somente pedidos novos (carrinhos) podem ser excluídos diretamente.")
        
    db.delete(order)
    db.commit()
    return {"status": "success", "message": "Carrinho removido com sucesso"}

@router.get("/orders/{order_id}", response_model=dict)
async def get_order_detail(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.customer import Customer
    from app.models.company_settings import CompanySettings
    from app.models.company import Company
    
    if current_user.type not in ["MASTER", "SELLER", "AGENT"]:
        raise HTTPException(status_code=403, detail="Acesso não autorizado")
        
    query = db.query(Order).filter(Order.id == order_id)
    if current_user.type == "SELLER":
        query = query.filter(Order.company_id == current_user.company_id)
    elif current_user.type == "AGENT":
        query = query.filter(Order.company_id == current_user.company_id, Order.agent_id == current_user.id)
    
    order = query.first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")
        
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == current_user.company_id).first()
    
    skip_sync = order.origin == "bookinfo" or order.status in ["INVOICED", "COMPLETED", "DELIVERED", "CANCELLED"]
    
    if settings and settings.horus_enabled and order.horus_pedido_venda and not skip_sync:
        company = db.query(Company).filter(Company.id == current_user.company_id).first()
        customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
        
        if company and customer and customer.id_guid:
            from app.integrators.horus_orders import HorusOrders
            horus_client = HorusOrders(db, current_user.company_id)
            try:
                horus_data = await horus_client.get_order(
                    id_doc=customer.document,
                    id_guid=customer.id_guid,
                    cnpj_destino=company.document,
                    cod_pedido_origem=order.partner_reference if order.origin == "bookinfo" else order.id,
                    cod_ped_venda=None
                )
                
                if horus_data and isinstance(horus_data, list) and len(horus_data) > 0:
                    horus_data = horus_data[0]
                    
                print(f"DEBUG HORUS SYNC SELLER (order {order.id}): {horus_data}")

                if not horus_data:
                    # Se não encontrou o pedido na Horus (pode ter sido excluído lá), marca como cancelado se for B2B.
                    # Mantém o status original se for bookinfo para não dar falso positivo imediato.
                    new_status = "CANCELLED" if order.origin != "bookinfo" else order.status
                elif isinstance(horus_data, dict) and horus_data.get("Falha"):
                    new_status = order.status
                elif horus_data and isinstance(horus_data, dict):
                    status_api = horus_data.get("STATUS_PEDIDO_VENDA", "")
                    
                    status_mapping = {
                        "LEX": "DISPATCH",
                        "IMP": "DISPATCH",
                        "CON": "DISPATCH",
                        "LFT": "DISPATCH",
                        "NOV": "SENT_TO_HORUS",
                        "LAP": "SENT_TO_HORUS",
                        "FAT": "INVOICED",
                        "CAN": "CANCELLED"
                    }
                    
                    new_status = status_mapping.get(status_api, order.status)
                else:
                    new_status = order.status
                    
                changed = False
                if new_status != order.status:
                    from app.models.order_log import OrderLog
                    
                    log_entry = OrderLog(
                        order_id=order.id,
                        old_status=order.status,
                        new_status=new_status
                    )
                    db.add(log_entry)
                    order.status = new_status
                    changed = True
                    
                if horus_data and isinstance(horus_data, dict):
                    nf = horus_data.get("NOTA_FISCAL")
                    if nf and isinstance(nf, dict):
                        xml_base64 = nf.get("XML_Base64")
                        if xml_base64 and order.invoice_xml != xml_base64:
                            order.invoice_xml = xml_base64
                            changed = True
                            
                if changed:
                    db.commit()
                    db.refresh(order)
                        
                # Sync Items strictly with Horus (Add, Update, Remove)
                horus_items = await horus_client.get_order_items(order.horus_pedido_venda)
                if horus_items and isinstance(horus_items, list):
                    items_changed = False
                    
                    # Track what we saw from Horus
                    h_seen_identifiers = set()
                    
                    for h_item in horus_items:
                        h_isbn = h_item.get("COD_BARRA_ITEM") or h_item.get("COD_BARRA_ITEM_ALT") or h_item.get("COD_ISBN_ITEM")
                        h_sku = str(h_item.get("COD_ITEM", ""))
                        
                        try:
                            # Horus numbers
                            h_qty_req_raw = h_item.get("QTD_PEDIDA") if h_item.get("QTD_PEDIDA") is not None else h_item.get("QT_PEDIDA", 0)
                            h_qty_req = int(float(h_qty_req_raw))
                            h_qty_f = int(float(h_item.get("QTD_ATENDIDA", 0)))
                            
                            from app.core.utils import parse_horus_price
                            h_unit_price = parse_horus_price(h_item.get("VLR_LIQUIDO", "0"))
                        except (ValueError, TypeError):
                            continue
                            
                        # Identify local item
                        local_match = None
                        for local_item in order.items:
                            if (h_isbn and local_item.ean_isbn == h_isbn) or (h_sku and local_item.sku == h_sku):
                                local_match = local_item
                                break
                                
                        if local_match:
                            identifier = h_isbn or h_sku
                            h_seen_identifiers.add(identifier)
                            
                            # Update existing
                            if local_match.quantity != h_qty_req or \
                               local_match.quantity_requested != h_qty_req or \
                               local_match.quantity_fulfilled != h_qty_f or \
                               abs(local_match.unit_price - h_unit_price) > 0.01:
                                
                                local_match.quantity = h_qty_req
                                local_match.quantity_requested = h_qty_req 
                                local_match.quantity_fulfilled = h_qty_f
                                local_match.unit_price = h_unit_price
                                local_match.total_price = h_qty_req * h_unit_price
                                items_changed = True
                        else:
                            # Item exists in Horus but not locally. Add it.
                            from app.models.order import OrderItem
                            identifier = h_isbn or h_sku
                            h_seen_identifiers.add(identifier)
                            
                            new_item = OrderItem(
                                order_id=order.id,
                                ean_isbn=h_isbn,
                                sku=h_sku,
                                name=h_item.get("NOM_ITEM", "Produto Horus"),
                                quantity=h_qty_req,
                                quantity_requested=h_qty_req,
                                quantity_fulfilled=h_qty_f,
                                unit_price=h_unit_price,
                                total_price=h_qty_req * h_unit_price
                            )
                            db.add(new_item)
                            items_changed = True
                            
                    # Remove local items not returned by Horus anymore
                    for local_item in list(order.items):
                        identifier = local_item.ean_isbn or local_item.sku
                        if identifier not in h_seen_identifiers:
                            db.delete(local_item)
                            items_changed = True
                            
                    if items_changed:
                        order.sync_status = "SYNCED"
                        # Recalculate totals
                        db.commit() # commit once so order.items is refreshed if we added/removed
                        db.refresh(order)
                        
                        db.expire(order, ['items'])
                        
                        new_subtotal = sum(i.total_price for i in order.items)
                        order.subtotal = new_subtotal
                        order.total = new_subtotal - (order.discount or 0)
                        
                        db.commit()
                        db.refresh(order)
                        db.expire(order, ['items'])
            except Exception as e:
                print(f"Error syncing order {order.id} with Horus: {e}")
            finally:
                await horus_client.close()

    order_dict = OrderResponse.model_validate(order).model_dump()
    order_dict["invoice_xml_available"] = bool(order.invoice_xml)
    order_dict["tracking_code"] = order.tracking_code
    order_dict["external_id"] = order.external_id
    
    # Also fetch full customer details to display in the CRM
    if order.customer:
        order_dict["customer"] = {
            "id": order.customer.id,
            "corporate_name": order.customer.corporate_name,
            "fantasy_name": order.customer.name,
            "document": order.customer.document,
            "email": order.customer.email,
            "phone": order.customer.phone
        }

    # Fetch company settings for product images
    from app.models.company_settings import CompanySettings
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == order.company_id).first()
    order_dict["cover_image_base_url"] = settings.cover_image_base_url if settings else None

    return order_dict

from app.schemas.order import OrderInteractionCreate, OrderInteractionResponse
from app.models.order_interaction import OrderInteraction
from app.models.order_log import OrderLog

@router.post("/orders/{order_id}/interactions", response_model=OrderInteractionResponse)
def add_interaction(
    order_id: int,
    interaction_in: OrderInteractionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in ["MASTER", "SELLER", "AGENT"]:
        raise HTTPException(status_code=403, detail="Acesso não autorizado")
        
    query = db.query(Order).filter(Order.id == order_id)
    if current_user.type == "SELLER":
        query = query.filter(Order.company_id == current_user.company_id)
    elif current_user.type == "AGENT":
        query = query.filter(Order.company_id == current_user.company_id, Order.agent_id == current_user.id)
    order = query.first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")
        
    if order.status in ["INVOICED", "CANCELLED"]:
        raise HTTPException(status_code=400, detail="Não é possível interagir com pedido faturado ou cancelado.")
        
    interaction = OrderInteraction(
        order_id=order.id,
        user_type="SELLER",
        user_id=current_user.id,
        message=interaction_in.message
    )
    
    db.add(interaction)
    db.commit()
    db.refresh(interaction)
    
    return interaction

@router.put("/orders/{order_id}/interactions/{interaction_id}/read", response_model=OrderInteractionResponse)
def mark_interaction_read(
    order_id: int,
    interaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in ["MASTER", "SELLER", "AGENT"]:
        raise HTTPException(status_code=403, detail="Acesso não autorizado")
        
    query = db.query(Order).filter(Order.id == order_id)
    if current_user.type == "SELLER":
        query = query.filter(Order.company_id == current_user.company_id)
    elif current_user.type == "AGENT":
        query = query.filter(Order.company_id == current_user.company_id, Order.agent_id == current_user.id)
    order = query.first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")
        
    interaction = db.query(OrderInteraction).filter(
        OrderInteraction.id == interaction_id,
        OrderInteraction.order_id == order.id
    ).first()
    
    if not interaction:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada.")
        
    from datetime import datetime, timezone
    interaction.read_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(interaction)
    
    return interaction


@router.get("/orders/{order_id}/horus-debug-preview", response_model=dict)
async def get_horus_debug_preview(
    order_id: int,
    search_type: str = Query("venda", description="Tipo de busca: 'venda' ou 'origem'"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.customer import Customer
    from app.models.company_settings import CompanySettings
    from app.models.company import Company
    
    if current_user.type not in ["MASTER", "SELLER", "AGENT"]:
        raise HTTPException(status_code=403, detail="Acesso não autorizado")
        
    query = db.query(Order).filter(Order.id == order_id)
    if current_user.type == "SELLER":
        query = query.filter(Order.company_id == current_user.company_id)
    elif current_user.type == "AGENT":
        query = query.filter(Order.company_id == current_user.company_id, Order.agent_id == current_user.id)
    order = query.first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")
    
    if search_type == "venda" and not order.horus_pedido_venda:
        raise HTTPException(status_code=400, detail="Pedido não possui vínculo de venda com Horus (COD_PED_VENDA vazio).")
        
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == order.company_id).first()
    if not settings or not settings.horus_enabled:
        raise HTTPException(status_code=400, detail="Integração Horus desativada para a empresa.")
        
    company = db.query(Company).filter(Company.id == order.company_id).first()
    customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
    
    horus_data = None
    horus_items_data = None
    request_params = {}
    
    if company and customer:
        from app.integrators.horus_orders import HorusOrders
        horus_client = HorusOrders(db, order.company_id)
        try:
            raw_horus_data = await horus_client.get_order(
                id_doc=customer.document,
                id_guid=customer.id_guid,
                cnpj_destino=company.document,
                cod_pedido_origem=order.partner_reference if order.origin == "bookinfo" else order.id,
                cod_ped_venda=None,
                ignore_customer_context=False
            )
            if raw_horus_data and isinstance(raw_horus_data, list) and len(raw_horus_data) > 0:
                horus_data = raw_horus_data[0]
            else:
                horus_data = raw_horus_data
                
            if order.horus_pedido_venda:
                # Optionally also fetch items if COD_PED_VENDA is available
                horus_items_data = await horus_client.get_order_items(order.horus_pedido_venda)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Erro retornado ao consultar Horus API: {str(e)}")
        finally:
            await horus_client.close()
            
            request_params = {
                "COD_EMPRESA": getattr(horus_client._settings, 'horus_company', None),
                "COD_FILIAL": getattr(horus_client._settings, 'horus_branch', None),
                "API_URL": getattr(horus_client._settings, 'horus_url', None),
                "API_USUARIO": getattr(horus_client._settings, 'horus_username', None),
                "API_SENHA_MASCARADA": "***" if getattr(horus_client._settings, 'horus_password', None) else None,
                "SELLER_COMPANY_ID": order.company_id,
                "ID_DOC": customer.document,
                "ID_GUID": customer.id_guid,
                "CNPJ_DESTINO": company.document,
                "COD_PEDIDO_ORIGEM": order.partner_reference if order.origin == "bookinfo" else order.id
            }
            
    return {
        "params_enviados": request_params,
        "order_details": horus_data,
        "order_items": horus_items_data
    }


@router.post("/orders/{order_id}/sync-horus", response_model=dict)
async def manual_sync_horus(
    order_id: int,
    search_type: str = "venda",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.customer import Customer
    from app.models.company_settings import CompanySettings
    from app.models.company import Company
    
    if current_user.type not in ["MASTER", "SELLER", "AGENT"]:
        raise HTTPException(status_code=403, detail="Acesso não autorizado")
        
    query = db.query(Order).filter(Order.id == order_id)
    if current_user.type == "SELLER":
        query = query.filter(Order.company_id == current_user.company_id)
    elif current_user.type == "AGENT":
        query = query.filter(Order.company_id == current_user.company_id, Order.agent_id == current_user.id)
    order = query.first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")
        
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == order.company_id).first()
    if not settings or not getattr(settings, 'horus_enabled', False):
        raise HTTPException(status_code=400, detail="Integração Horus desativada para a empresa.")
        
    company = db.query(Company).filter(Company.id == order.company_id).first()
    customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
    
    if company and customer:
        from app.integrators.horus_orders import HorusOrders
        horus_client = HorusOrders(db, order.company_id)
        try:
            search_origem = order.partner_reference if order.origin == "bookinfo" else order.id
            
            raw_horus_data = await horus_client.get_order(
                id_doc=customer.document,
                id_guid=customer.id_guid,
                cnpj_destino=company.document,
                cod_pedido_origem=search_origem,
                cod_ped_venda=None,
                ignore_customer_context=False
            )
            
            horus_data = None
            if raw_horus_data and isinstance(raw_horus_data, list) and len(raw_horus_data) > 0:
                horus_data = raw_horus_data[0]
            elif raw_horus_data and isinstance(raw_horus_data, dict):
                horus_data = raw_horus_data
                
            changed = False
            
            if horus_data and isinstance(horus_data, dict):
                new_horus_id = str(horus_data.get("COD_PED_VENDA", "")).strip()
                if new_horus_id and new_horus_id != str(order.horus_pedido_venda).strip():
                    order.horus_pedido_venda = new_horus_id
                    changed = True
                    
            if not horus_data:
                new_status = "CANCELLED"
            elif isinstance(horus_data, dict) and horus_data.get("Falha"):
                new_status = order.status
            elif horus_data and isinstance(horus_data, dict):
                status_api = horus_data.get("STATUS_PEDIDO_VENDA", "")
                status_mapping = {
                    "LEX": "DISPATCH",
                    "IMP": "DISPATCH",
                    "CON": "DISPATCH",
                    "LFT": "DISPATCH",
                    "NOV": "SENT_TO_HORUS",
                    "LAP": "SENT_TO_HORUS",
                    "FAT": "INVOICED",
                    "CAN": "CANCELLED"
                }
                new_status = status_mapping.get(status_api, order.status)
            else:
                new_status = order.status
                
            if new_status != order.status:
                from app.models.order_log import OrderLog
                log_entry = OrderLog(order_id=order.id, old_status=order.status, new_status=new_status)
                db.add(log_entry)
                order.status = new_status
                changed = True
                
            if horus_data and isinstance(horus_data, dict):
                nf = horus_data.get("NOTA_FISCAL")
                if nf and isinstance(nf, dict):
                    xml_base64 = nf.get("XML_Base64")
                    if xml_base64 and order.invoice_xml != xml_base64:
                        order.invoice_xml = xml_base64
                        changed = True
                        
            if changed:
                db.commit()
                db.refresh(order)
                    
            if not order.horus_pedido_venda:
                raise Exception("Pedido não localizado no Horus mesmo consultando pela origem. Atualize o pedido com CSV.")
                
            horus_items = await horus_client.get_order_items(order.horus_pedido_venda)
            if horus_items and isinstance(horus_items, list):
                items_changed = False
                h_seen_identifiers = set()
                
                for h_item in horus_items:
                    h_isbn = h_item.get("COD_BARRA_ITEM") or h_item.get("COD_BARRA_ITEM_ALT") or h_item.get("COD_ISBN_ITEM")
                    h_sku = str(h_item.get("COD_ITEM", ""))
                    
                    try:
                        h_qty_req_raw = h_item.get("QTD_PEDIDA") if h_item.get("QTD_PEDIDA") is not None else h_item.get("QT_PEDIDA", 0)
                        h_qty_req = int(float(h_qty_req_raw))
                        h_qty_f = int(float(h_item.get("QTD_ATENDIDA", 0)))
                        raw_price = h_item.get("VLR_LIQUIDO", 0)
                        from app.core.utils import parse_horus_price
                        h_unit_price = parse_horus_price(raw_price)
                    except (ValueError, TypeError):
                        continue
                        
                    local_match = None
                    for local_item in order.items:
                        if (h_isbn and local_item.ean_isbn == h_isbn) or (h_sku and local_item.sku == h_sku):
                            local_match = local_item
                            break
                            
                    if local_match:
                        identifier = h_isbn or h_sku
                        h_seen_identifiers.add(identifier)
                        
                        # Fix floating point comparison using precise rounding (2 decimal places)
                        local_price_rnd = round(local_match.unit_price, 2)
                        h_price_rnd = round(h_unit_price, 2)
                        
                        if local_match.quantity != h_qty_req or local_match.quantity_requested != h_qty_req or local_match.quantity_fulfilled != h_qty_f or local_price_rnd != h_price_rnd:
                            local_match.quantity = h_qty_req
                            local_match.quantity_requested = h_qty_req 
                            local_match.quantity_fulfilled = h_qty_f
                            local_match.unit_price = h_unit_price
                            local_match.total_price = h_qty_req * h_unit_price
                            items_changed = True
                    else:
                        from app.models.order import OrderItem
                        identifier = h_isbn or h_sku
                        h_seen_identifiers.add(identifier)
                        
                        new_item = OrderItem(
                            order_id=order.id,
                            ean_isbn=h_isbn,
                            sku=h_sku,
                            name=h_item.get("NOM_ITEM", "Produto Horus"),
                            quantity=h_qty_req,
                            quantity_requested=h_qty_req,
                            quantity_fulfilled=h_qty_f,
                            unit_price=h_unit_price,
                            total_price=h_qty_req * h_unit_price
                        )
                        db.add(new_item)
                        items_changed = True
                        
                for local_item in list(order.items):
                    identifier = local_item.ean_isbn or local_item.sku
                    if identifier not in h_seen_identifiers:
                        db.delete(local_item)
                        items_changed = True
                        
                if items_changed:
                    order.sync_status = "SYNCED"
                    db.commit()
                    db.refresh(order)
                    
                    db.expire(order, ['items'])
                    
                    new_subtotal = sum(i.total_price for i in order.items)
                    order.subtotal = new_subtotal
                    order.total = new_subtotal - (order.discount or 0)
                    db.commit()
                    db.refresh(order)
                    db.expire(order, ['items'])
                    
            return {"status": "success", "message": "Sincronizado com sucesso."}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Erro ao consultar Horus: {str(e)}")
        finally:
            await horus_client.close()

    raise HTTPException(status_code=400, detail="Configurações Horus ou dados do cliente/empresa inválidos.")

@router.get("/metrics")
def get_orders_metrics(
    days: int = Query(7, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from sqlalchemy import func
    from datetime import datetime, timedelta
    from app.models.order import Order, OrderItem
    from app.models.customer import Customer
    from app.models.product import Product

    if current_user.type not in ["MASTER", "SELLER", "AGENT"]:
        raise HTTPException(status_code=403, detail="Acesso não autorizado")

    cutoff_date = datetime.utcnow() - timedelta(days=days)

    query = db.query(Order).filter(Order.created_at >= cutoff_date)
    
    if current_user.type == "SELLER":
        query = query.filter(Order.company_id == current_user.company_id)
    elif current_user.type == "AGENT":
        query = query.filter(Order.company_id == current_user.company_id, Order.agent_id == current_user.id)

    # Filter out completely cancelled or cart (NEW) to avoid polluting revenue
    query = query.filter(Order.status.notin_(["NEW", "CANCELLED"]))

    orders_in_period = query.all()

    total_revenue = sum(o.total for o in orders_in_period)
    
    # Extract order IDs for aggregations
    order_ids = [o.id for o in orders_in_period]
    
    # 1. Top 5 Clients
    top_clients = []
    if order_ids:
        clients_agg = db.query(
            Order.customer_id,
            Customer.corporate_name,
            Customer.name,
            func.sum(Order.total).label('total_spent')
        ).join(Customer, Order.customer_id == Customer.id)\
         .filter(Order.id.in_(order_ids))\
         .group_by(Order.customer_id, Customer.corporate_name, Customer.name)\
         .order_by(func.sum(Order.total).desc())\
         .limit(5).all()

        top_clients = [{
            "id": c.customer_id,
            "corporate_name": c.corporate_name,
            "fantasy_name": c.name,
            "total_spent": float(c.total_spent or 0)
        } for c in clients_agg]

    # 2. Top 5 Items
    top_items = []
    if order_ids:
        items_agg = db.query(
            OrderItem.name,
            func.sum(OrderItem.quantity).label('qty_sold'),
            func.sum(OrderItem.total_price).label('revenue generated')
        ).filter(OrderItem.order_id.in_(order_ids))\
         .group_by(OrderItem.name)\
         .order_by(func.sum(OrderItem.quantity).desc())\
         .limit(5).all()

        top_items = [{
            "name": i.name,
            "qty_sold": int(i.qty_sold or 0)
        } for i in items_agg]

    # 3. Status Grouping
    status_counts = {}
    
    status_query = db.query(Order.status, func.count(Order.id).label('count')).filter(Order.created_at >= cutoff_date)
    
    if current_user.type == "SELLER":
        status_query = status_query.filter(Order.company_id == current_user.company_id)
    elif current_user.type == "AGENT":
        status_query = status_query.filter(Order.company_id == current_user.company_id, Order.agent_id == current_user.id)
        
    status_agg = status_query.group_by(Order.status).all()
    for st, count in status_agg:
        status_counts[st] = count
            
    return {
        "period_days": days,
        "total_revenue": total_revenue,
        "top_clients": top_clients,
        "top_items": top_items,
        "status_counts": status_counts
    }

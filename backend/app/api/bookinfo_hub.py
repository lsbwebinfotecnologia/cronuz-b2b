from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any
import httpx
from datetime import datetime
from pydantic import BaseModel

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.models.user import User, UserRole
from app.models.company_settings import CompanySettings

from app.models.order import Order, OrderItem
from app.models.customer import Customer
from app.integrators.horus_products import HorusProducts
from app.integrators.horus_clients import HorusClients
from app.core.security import get_password_hash

router = APIRouter(prefix="/bookinfo", tags=["bookinfo"])

def get_bookinfo_client(company_id: int, db: Session):
    # Fetch integration configs configured in SystemIntegrators
    from app.models.integrator import Integrator
    import json
    
    config = db.query(Integrator).filter(
        Integrator.company_id == company_id,
        Integrator.platform == "BOOKINFO",
        Integrator.active == True
    ).first()
    
    if not config or not config.credentials:
        raise HTTPException(status_code=400, detail="Integração Bookinfo não configurada para essa empresa.")
        
    try:
        creds = json.loads(config.credentials) if isinstance(config.credentials, str) else config.credentials
    except Exception:
        creds = {}
        
    env = creds.get("Ambiente", "PROD")
    token = creds.get("Token", "")
    
    base_url = "https://bookhub-api.bookinfo.com.br" if env == "PROD" else "https://bookhub-api-hml.bookinfo.com.br"
    
    if not token:
        raise HTTPException(status_code=400, detail="Token Bookinfo ausente nas configurações.")
        
    return httpx.AsyncClient(
        base_url=base_url, 
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        timeout=15.0,
        verify=False
    )

@router.get("/logs")
async def get_background_logs(
    limit: int = 100,
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in [UserRole.MASTER]:
        raise HTTPException(status_code=403, detail="Acesso restrito.")
        
    import os
    log_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "jobs.log")
    
    if not os.path.exists(log_file):
        return {"logs": ["Nenhum log encontrado. Os jobs ainda não rodaram."]}
        
    try:
        with open(log_file, "r") as f:
            lines = f.readlines()
            # Return last N lines
            return {"logs": [line.strip() for line in lines[-limit:]]}
    except Exception as e:
        return {"logs": [f"Erro ao ler log: {str(e)}"]}

@router.get("/orders")
async def get_orders(
    pagina: int = 0,
    tamanho: int = 25,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Lista pedidos na Bookinfo e verifica se os CNPJs existem na base de clientes Horus (B2B local).
    """
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER]:
        raise HTTPException(status_code=403, detail="Acesso restrito.")
        
    async with get_bookinfo_client(current_user.company_id, db) as client:
        params = {"pagina": pagina, "tamanho": tamanho}
        if status:
            params["status"] = status
            
        try:
            response = await client.get("/pedido", params=params)
            response.raise_for_status()
            data = response.json()
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Erro ao consultar Bookinfo: {str(e)}")
            
        orders = data.get("itens", [])
        
        # Collect CNPJs
        cnpjs_in_orders = set()
        for order in orders:
            if order.get("cnpjComprador"):
                cnpjs_in_orders.add("".join(filter(str.isdigit, str(order.get("cnpjComprador")))))
                
        # Batch fetch real Customer profiles (to satisfy ord_order foreign key)
        mapped_customers = {}
        if cnpjs_in_orders:
            db_customers = db.query(Customer).filter(
                Customer.company_id == current_user.company_id,
                Customer.document.in_(cnpjs_in_orders)
            ).all()
            mapped_customers = {c.document: c.id for c in db_customers if c.document}
            
        # Validate CNPJs
        for order in orders:
            cnpj = order.get("cnpjComprador")
            if cnpj:
                cnpj_clean = "".join(filter(str.isdigit, str(cnpj)))
                c_id = mapped_customers.get(cnpj_clean)
                order["enable"] = bool(c_id)
                order["idCustomer"] = c_id
            else:
                order["enable"] = False
                
            # Add ui badge logic equivalent to PHP badgeStatus
            s = order.get("status", "")
            if s == "RECEBIDO":
                order["badge"] = {"slug": "emerald", "label": "Recebido"}
            elif s == "PROCESSADO":
                order["badge"] = {"slug": "blue", "label": "Processado"}
            elif s == "RECUSADO":
                order["badge"] = {"slug": "rose", "label": "Recusado"}
            elif s == "AGUARDANDO_PROCESSAMENTO":
                order["badge"] = {"slug": "amber", "label": "Aguardando"}
            elif s == "FATURADO":
                order["badge"] = {"slug": "indigo", "label": "Faturado"}
            elif s == "CONCLUIDO":
                order["badge"] = {"slug": "slate", "label": "Concluído"}
            else:
                order["badge"] = {"slug": "slate", "label": s.replace("_", " ").title()}
                
            # If order is already processed in Bookinfo and customer exists, ensure it's mirrored locally
            if order["enable"] and s in ["RECEBIDO", "PROCESSADO", "FATURADO", "CONCLUIDO"]:
                try:
                    __upsert_bookinfo_order_local(db, current_user.company_id, order["idCustomer"], order)
                except Exception as e:
                    print(f"Warning: failed to auto-sync processed order {order['id']}: {e}")
                
        data["itens"] = orders
        return data

def __upsert_bookinfo_order_local(db: Session, company_id: int, customer_id: int, bookinfo_order: dict) -> Order:
    order_id = bookinfo_order["id"]
    existing_order = db.query(Order).filter(
        Order.company_id == company_id,
        Order.external_id == order_id,
        Order.origin == "bookinfo"
    ).first()
    
    status_mapped = bookinfo_order.get("status", "RECEBIDO")
    nro_erp = bookinfo_order.get("numeroPedidoERP") or bookinfo_order.get("nroPedido") or ""
    
    if existing_order:
        updated = False
        if existing_order.status != status_mapped:
            existing_order.status = status_mapped
            updated = True
        if nro_erp and existing_order.horus_pedido_venda != nro_erp:
            existing_order.horus_pedido_venda = nro_erp
            updated = True
        if updated:
            db.commit()
        return existing_order

    items_payload = bookinfo_order.get("itens", [])
    total_price = 0.0
    for dt_item in items_payload:
        qty = int(dt_item.get("quantidade", 1))
        unit = float(dt_item.get("precoVenda") or dt_item.get("valorOriginal") or 0.0)
        total_price += (qty * unit)
        
    new_order = Order(
        company_id=company_id,
        customer_id=customer_id,
        status=status_mapped,
        type_order="C" if bookinfo_order.get("compraConsignacao") == "S" else "V",
        origin="bookinfo",
        horus_pedido_venda=nro_erp,
        external_id=order_id,
        subtotal=total_price, discount=0.0, total=total_price
    )
    db.add(new_order)
    db.commit()
    db.refresh(new_order)
    
    for dt_item in items_payload:
        qty = int(dt_item.get("quantidade", 1))
        unit = float(dt_item.get("precoVenda") or dt_item.get("valorOriginal") or 0.0)
        isbn = str(dt_item.get("isbn13") or "")
        t_name = dt_item.get("titulo") or dt_item.get("nome") or "Livro Genérico"
        # Extract situation from item if it exists (e.g., from a previous validation)
        sit = dt_item.get("observacao") or dt_item.get("SITUACAO_ITEM") or ""
        
        oi = OrderItem(
            order_id=new_order.id,
            ean_isbn=isbn,
            name=t_name,
            quantity=qty,
            quantity_requested=qty,
            unit_price=unit,
            total_price=(qty * unit),
            observation=sit
        )
        db.add(oi)
        
    db.commit()
    return new_order

@router.get("/orders/{order_id}")
async def get_order_detail(
    order_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER]:
        raise HTTPException(status_code=403, detail="Acesso restrito.")
        
    async with get_bookinfo_client(current_user.company_id, db) as client:
        try:
            response = await client.get(f"/pedido/{order_id}")
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail="Pedido não encontrado na Bookinfo")
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Erro ao consultar Bookinfo: {str(e)}")

@router.post("/orders/{order_id}/acknowledge")
async def acknowledge_order(
    order_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Confirma recebimento de um pedido da Bookinfo, salva espelho local e notifica API parceira.
    """
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER]:
        raise HTTPException(status_code=403, detail="Acesso restrito.")
        
    # Prevent duplicate
    existing_order = db.query(Order).filter(
        Order.company_id == current_user.company_id,
        Order.external_id == order_id, # external_id represents the remote Bookinfo platform ID
        Order.origin == "bookinfo"
    ).first()
    
    if existing_order:
        return {"error": False, "message": "Pedido já foi espelhado localmente e recebido.", "id": existing_order.id}
    
    async with get_bookinfo_client(current_user.company_id, db) as client:
        # Fetch the order from bookinfo
        try:
            response = await client.get(f"/pedido/{order_id}")
            response.raise_for_status()
            bookinfo_order = response.json()
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Erro ao resgatar detalhes do pedido na Bookinfo: {str(e)}")
            
        cnpj = bookinfo_order.get("cnpjComprador")
        if not cnpj:
            raise HTTPException(status_code=400, detail="CNPJ Comprador não fornecido no payload da parceira")
            
        cnpj_clean = "".join(filter(str.isdigit, str(cnpj)))
        customer = db.query(User).filter(
            User.company_id == current_user.company_id,
            User.document == cnpj_clean,
            User.type == UserRole.CUSTOMER
        ).first()
        
        if not customer:
             raise HTTPException(status_code=400, detail="Cliente não existe ou não está sincronizado no dashboard B2B")
             
        # Save local mirror using helper
        new_order = __upsert_bookinfo_order_local(db, current_user.company_id, customer.id, bookinfo_order)
        
        # Notify Bookhub
        try:
            put_resp = await client.put(f"/pedido/{order_id}/avaliacao/RECEBIDO", json={})
            put_resp.raise_for_status()
        except Exception as e:
            # We saved locally but failed to tell bookinfo. Might be a transient error.
            # In a robust system, we would enqueue a retry. For now just bubble up warning.
            pass
            
        return {"error": False, "message": "Pedido recebido com sucesso!", "id": new_order.id}

class CustomerSyncRequest(BaseModel):
    cnpj: str
    fallback_name: Optional[str] = None

@router.post("/customers/sync")
async def sync_customer_from_horus(
    payload: CustomerSyncRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Cadastra o cliente consultando o Horus (Puxa do legado ou ERP online).
    """
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER]:
        raise HTTPException(status_code=403, detail="Acesso restrito.")
        
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == current_user.company_id).first()
    if not settings or not settings.horus_url:
        raise HTTPException(status_code=400, detail="ERP Horus não configurado para busca de clientes.")
        
    cnpj_clean = "".join(filter(str.isdigit, str(payload.cnpj)))
    if not cnpj_clean:
         raise HTTPException(status_code=400, detail="CNPJ inválido")

    # Verifica se já existe
    existing_user = db.query(User).filter(
        User.company_id == current_user.company_id,
        User.document == cnpj_clean,
        User.type == UserRole.CUSTOMER
    ).first()
    
    if existing_user:
         return {"error": False, "message": "Cliente já está sincronizado no painel B2B!"}
         
    try:
        h_client = HorusClients(db, current_user.company_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    try:
        from app.models.company import Company
        company = db.query(Company).filter(Company.id == current_user.company_id).first()
        cnpj_destino = company.document if company else (settings.horus_branch or "1")
        res = await h_client.get_client(cnpj_destino=cnpj_destino, cnpj_cliente=cnpj_clean)
    except Exception as e:
        raise HTTPException(status_code=504, detail=f"Erro de comunicação/timeout com a API do Horus: {str(e)}")
    
    if res.get("error"):
         raise HTTPException(status_code=404, detail=res.get("msg", "Cliente não encontrado no Horus."))
         
    # Sucesso, extract
    h_data = res.get("data", {})
    name = h_data.get("NOME_FANTASIA") or h_data.get("RAZAO_SOCIAL") or h_data.get("DESCRICAO") or payload.fallback_name or f"Cliente {cnpj_clean}"
    razao = h_data.get("RAZAO_SOCIAL") or name
    email = h_data.get("EMAIL", f"{cnpj_clean}@placeholder.com")
    
    # Criar User (Autenticação / B2B Login)
    new_user = User(
        company_id=current_user.company_id,
        type=UserRole.CUSTOMER,
        name=name,
        document=cnpj_clean,
        email=email,
        password_hash=get_password_hash(cnpj_clean), # Senha padrão B2B é o CNPJ
        active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Criar Perfil CRM
    new_customer = Customer(
        company_id=current_user.company_id,
        name=name,
        corporate_name=razao,
        document=cnpj_clean,
        email=email,
        id_doc=h_data.get("ID_CLIENTE") or "",
        id_guid=h_data.get("ID_GUID") or ""
    )
    db.add(new_customer)
    db.commit()
    
    return {"error": False, "message": f"Cliente '{name}' sincronizado com sucesso!"}

@router.get("/orders/{order_id}/evaluate-preview")
async def evaluate_preview(
    order_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Executa a régua de negócio De/Para do legado PHP contra o Horus ERP.
    """
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER]:
        raise HTTPException(status_code=403, detail="Acesso restrito.")
        
    # Get horus settings
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == current_user.company_id).first()
    if not settings or not settings.horus_url:
        raise HTTPException(status_code=400, detail="ERP Horus não configurado nesta empresa.")
    
    # 1. Fetch Order from Bookinfo to get requested Items
    async with get_bookinfo_client(current_user.company_id, db) as client:
        try:
            response = await client.get(f"/pedido/{order_id}")
            response.raise_for_status()
            bookinfo_order = response.json()
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Erro ao resgatar detalhes do pedido na Bookinfo: {str(e)}")
            
    items = bookinfo_order.get("itens", [])
    if not items:
        return []
        
    horus_client = HorusProducts(settings)
    
    # Customer ID Doc for Horus Context (if required)
    # Bookinfo passes cnpjComprador. Let's send that as id_doc to horus if possible, or leave default.
    horus_customer_doc = "0"
    cnpj = bookinfo_order.get("cnpjComprador")
    if cnpj:
         horus_customer_doc = "".join(filter(str.isdigit, str(cnpj)))
         
    evaluation = []
    
    # In a fully optimized flow, we'd batch-request ISBNs. `busca_acervo_padrao` allows `isbns=[{"BARRAS_ISBN": "..."}]`
    # Let's use batch query for speed!
    isbns_payload = [{"BARRAS_ISBN": item.get("isbn13")} for item in items if item.get("isbn13")]
    
    try:
         # Uses POST searchInList equivalent to retrieve multiple items
         horus_res = await horus_client.busca_acervo_padrao(
              id_doc=horus_customer_doc,
              isbns=isbns_payload
         )
         # Format returned payload into a easily searchable dict by ISBN
         # Note: Depending on horus version, response might be a LIST or standard Dict
         horus_items = horus_res if isinstance(horus_res, list) else []
         if isinstance(horus_res, dict) and "itens" in horus_res:
             horus_items = horus_res["itens"]
         elif isinstance(horus_res, dict) and "Falha" not in horus_res:
             # sometimes it returns a dict with single item or array nested differently
             if "COD_ITEM" in horus_res:
                 horus_items = [horus_res]
                 
    except Exception as e:
         horus_items = []
         print("Horus fetch failed:", str(e))
         
    # Create dict for fast lookup
    horus_map = {str(i.get("BARRAS_ISBN", "")): i for i in horus_items if "BARRAS_ISBN" in i}
    
    for req_item in items:
        isbn = str(req_item.get("isbn13", ""))
        hr_product = horus_map.get(isbn)
        
        # PHP Trait `processSituation`
        status = ""
        details = ""
        
        allow_qty = 0
        req_qty = int(req_item.get("quantidade", 0))
        allow_discount = 0.0
        req_discount = float(req_item.get("descontoProposto", 0.0))
        
        if hr_product is None:
            status = "item_nao_comercializado"
            details = "Não comercializado"
        else:
            allow_qty = int(hr_product.get("SALDO_DISPONIVEL", 0))
            allow_discount = float(hr_product.get("VLR_DESC_CLI", 0.0))
            situacao_item = hr_product.get("SITUACAO_ITEM", "")
            
            if situacao_item == "FE":
                status = "esgotado"
                details = "Esgotado"
            elif situacao_item == "FC":
                status = "fora_catalogo"
                details = "Fora de catálogo"
            else:
                details_list = []
                if req_discount > allow_discount:
                    details_list.append("Divergência de desconto")
                    
                if allow_qty >= req_qty:
                    status = "reservado_total"
                    details_list.append("Disponível")
                elif allow_qty > 0:
                    status = "atendimento_parcial_sem_reserva"
                    details_list.append("Atendimento parcial")
                else:
                    status = "sem_estoque"
                    details_list.append("Sem estoque")
                    
                details = "; ".join(details_list)
        
        evaluation.append({
            "isbn13": isbn,
            "bookinfo_item": req_item,
            "horus_item": hr_product,
            "analysis": {
                "status": status,
                "details": details,
                "allowed_qty": allow_qty,
                "allowed_discount": allow_discount,
                "requested_qty": req_qty,
                "requested_discount": req_discount
            }
        })
        
    return evaluation

class EvaluateSubmitRequest(BaseModel):
    items: List[Dict[str, Any]]

@router.post("/orders/{order_id}/evaluate-submit")
async def evaluate_submit(
    order_id: str,
    payload: EvaluateSubmitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Submete a avaliação de De/Para curada pelo lojista devolta pra Bookinfo.
    """
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER]:
        raise HTTPException(status_code=403, detail="Acesso restrito.")
        
    async with get_bookinfo_client(current_user.company_id, db) as client:
        try:
            # POST /pedido/{idOrder}/avaliacao
            put_resp = await client.post(f"/pedido/{order_id}/avaliacao", json=payload.items)
            put_resp.raise_for_status()
            return {"error": False, "message": "Avaliação sincronizada com sucesso!"}
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"Erro na plataforma Bookinfo: {e.response.text}")
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Falha ao contatar servidor Bookinfo: {str(e)}")

import os
from fastapi import Header

@router.post("/jobs/sync-new-orders")
async def job_sync_new_orders(
    authorization: str = Header(None),
    db: Session = Depends(get_db)
):
    """
    Called periodically by a CRON daemon (e.g. VPS Crontab).
    Fetches all active Bookinfo integrations, gets NEW orders, and acknowledges them as RECEBIDO.
    """
    CRON_SECRET = os.getenv("CRON_JOB_SECRET", "cronuz_secure_job_trigger_123")
    
    if not authorization or authorization != f"Bearer {CRON_SECRET}":
        raise HTTPException(status_code=401, detail="Unauthorized Job Trigger")
        
    from app.models.integrator import Integrator
    import json
    
    # 1. Get all active Bookinfo configs
    configs = db.query(Integrator).filter(
        Integrator.platform == "BOOKINFO",
        Integrator.active == True
    ).all()
    
    results = []
    
    for config in configs:
        company_id = config.company_id
        
        try:
            creds = json.loads(config.credentials) if isinstance(config.credentials, str) else (config.credentials or {})
        except Exception:
            creds = {}
            
        env = creds.get("Ambiente", "PROD")
        token = creds.get("Token", "")
        
        if not token:
            continue
            
        base_url = "https://bookhub-api.bookinfo.com.br" if env == "PROD" else "https://bookhub-api-hml.bookinfo.com.br"
        
        async with httpx.AsyncClient(
            base_url=base_url, 
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            timeout=15.0,
            verify=False
        ) as client:
            try:
                # 2. Fetch new orders
                resp = await client.get("/pedido?status=NOVO&tamanho=50")
                resp.raise_for_status()
                data = resp.json()
                new_orders = data.get("itens", [])
                
                processed_count = 0
                for order in new_orders:
                    order_id = order.get("id")
                    cnpj = order.get("cnpjComprador")
                    
                    if not order_id or not cnpj:
                        continue
                        
                    # 3. Check Customer existence
                    cnpj_clean = "".join(filter(str.isdigit, str(cnpj)))
                    customer = db.query(User).filter(
                        User.company_id == company_id,
                        User.document == cnpj_clean,
                        User.type == UserRole.CUSTOMER
                    ).first()
                    
                    if not customer:
                        continue # Skip silently, user will see it not enabled in panel
                        
                    # 4. Prevent duplicate local mirroring
                    existing_order = db.query(Order).filter(
                        Order.company_id == company_id,
                        Order.external_id == order_id,
                        Order.origin == "bookinfo"
                    ).first()
                    
                    if existing_order:
                        continue
                        
                    items_payload = order.get("itens", [])
                    total_price = 0.0
                    for dt_item in items_payload:
                        qty = int(dt_item.get("quantidade", 1))
                        unit = float(dt_item.get("precoVenda") or dt_item.get("valorOriginal") or 0.0)
                        total_price += (qty * unit)

                    # 5. Mirror locally as RECEIVED
                    new_order = Order(
                        company_id=company_id,
                        customer_id=customer.id,
                        status="RECEBIDO",
                        type_order="C" if order.get("compraConsignacao") == "S" else "V",
                        origin="bookinfo",
                        horus_pedido_venda=order.get("numeroPedidoERP") or order.get("nroPedido") or "",
                        external_id=order_id,
                        subtotal=total_price, discount=0, total=total_price
                    )
                    db.add(new_order)
                    db.commit()
                    db.refresh(new_order)
                    
                    # Persist physical Items
                    for dt_item in items_payload:
                        qty = int(dt_item.get("quantidade", 1))
                        unit = float(dt_item.get("precoVenda") or dt_item.get("valorOriginal") or 0.0)
                        isbn = str(dt_item.get("isbn13") or "")
                        t_name = dt_item.get("titulo") or dt_item.get("nome") or "Livro Genérico"
                        
                        oi = OrderItem(
                            order_id=new_order.id,
                            ean_isbn=isbn,
                            name=t_name,
                            quantity=qty,
                            quantity_requested=qty,
                            unit_price=unit,
                            total_price=(qty * unit)
                        )
                        db.add(oi)
                        
                    db.commit()
                    
                    # 6. Notify Bookinfo it was received
                    try:
                        put_resp = await client.put(f"/pedido/{order_id}/avaliacao/RECEBIDO", json={})
                        put_resp.raise_for_status()
                    except Exception as e:
                        pass # Ignore remote failure, retry logic could be added later
                        
                    processed_count += 1
                
                results.append({"company_id": company_id, "processed": processed_count, "status": "success"})
            except Exception as e:
                results.append({"company_id": company_id, "error": str(e), "status": "failed"})
                
    return {"status": "ok", "executions": results}

class ImportedOrderMapping(BaseModel):
    bookinfo_id: str
    reference: Optional[str] = None
    horus_id: str

class ImportSpreadsheetRequest(BaseModel):
    company_id: Optional[int] = None
    mappings: List[ImportedOrderMapping]

@router.post("/validate-horus-orders")
async def validate_horus_orders(
    payload: ImportSpreadsheetRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Realiza validação (preview) dos mapeamentos do Bookinfo antes de importar.
    Retorna a lista enriquecida com a flag 'found'.
    """
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER]:
        raise HTTPException(status_code=403, detail="Acesso restrito.")
        
    bookinfo_ids = [str(m.bookinfo_id).strip() for m in payload.mappings if str(m.bookinfo_id).strip()]
    
    if not bookinfo_ids:
        return {"updated": 0, "not_found": 0, "results": []}
        
    from sqlalchemy import func

    # Definição do company_id alvo (MASTER pode escolher outra empresa, SELLER usa a sua própria)
    target_company_id = payload.company_id if payload.company_id and current_user.type == "MASTER" else current_user.company_id

    orders = db.query(Order).filter(
        Order.company_id == target_company_id,
        func.lower(Order.origin) == "bookinfo",
        func.lower(Order.external_id).in_([bid.lower() for bid in bookinfo_ids])
    ).all()
    
    order_dict = {str(o.external_id).strip().lower(): o for o in orders if o.external_id}
    
    results = []
    found_count = 0
    not_found_count = 0
    
    for mapping in payload.mappings:
        b_id = str(mapping.bookinfo_id).strip()
        h_id = str(mapping.horus_id).strip()
        
        if not b_id or not h_id:
            continue
            
        found = b_id.lower() in order_dict
        if found:
            found_count += 1
        else:
            not_found_count += 1
            # DEBUG log to see if it missed something obvious:
            print(f"DEBUG: Not found in DB -> '{b_id}'")
            
        results.append({
            "bookinfo_id": b_id,
            "horus_id": h_id,
            "reference": mapping.reference,
            "found": found
        })
            
    return {
        "updated": found_count, 
        "not_found": not_found_count, 
        "results": results
    }

@router.post("/import-horus-orders")
async def import_horus_orders(
    payload: ImportSpreadsheetRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Importa um de/para de pedidos Bookinfo para alimentar o número de pedido Horus localmente.
    """
    if current_user.type not in [UserRole.MASTER, UserRole.SELLER]:
        raise HTTPException(status_code=403, detail="Acesso restrito.")
        
    updated_count = 0
    not_found = 0
    
    bookinfo_ids = [str(m.bookinfo_id).strip() for m in payload.mappings if str(m.bookinfo_id).strip()]
    
    if not bookinfo_ids:
        return {"updated": 0, "not_found": 0, "message": "Nenhum ID Bookinfo fornecido na planilha."}
        
    from sqlalchemy import func

    target_company_id = payload.company_id if payload.company_id and current_user.type == "MASTER" else current_user.company_id

    # Batch query pra melhor performance
    orders = db.query(Order).filter(
        Order.company_id == target_company_id,
        func.lower(Order.origin) == "bookinfo",
        func.lower(Order.external_id).in_([bid.lower() for bid in bookinfo_ids])
    ).all()
    
    order_dict = {str(o.external_id).strip().lower(): o for o in orders if o.external_id}
    
    for mapping in payload.mappings:
        b_id = str(mapping.bookinfo_id).strip()
        h_id = str(mapping.horus_id).strip()
        
        if not b_id or not h_id:
            continue
            
        order = order_dict.get(b_id.lower())
        if order:
            if order.horus_pedido_venda != h_id or order.partner_reference != mapping.reference:
                order.horus_pedido_venda = h_id
                order.partner_reference = mapping.reference
                updated_count += 1
        else:
            not_found += 1
            
    if updated_count > 0:
        db.commit()
        
    return {
        "updated": updated_count, 
        "not_found": not_found, 
        "message": f"{updated_count} pedidos identificados e atualizados."
    }

# -----------------------------------------------------------------------------
# QUEUE MANAGEMENT ENDPOINTS (MASTER ONLY)
# -----------------------------------------------------------------------------

@router.get("/queue")
async def get_bookinfo_queue(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type != UserRole.MASTER:
        raise HTTPException(status_code=403, detail="Acesso restrito.")
        
    from sqlalchemy.orm import joinedload
    
    orders = db.query(Order).options(joinedload(Order.customer)).filter(
        Order.company_id == company_id,
        Order.origin == "bookinfo"
    ).order_by(Order.id.desc()).all()
    
    results = []
    for o in orders:
        results.append({
            "id": o.id,
            "tracking_code": o.tracking_code,
            "external_id": o.external_id,
            "horus_pedido_venda": o.horus_pedido_venda,
            "partner_reference": getattr(o, 'partner_reference', None),
            "status": o.status,
            "total": float(o.total),
            "created_at": o.created_at,
            "customer_name": o.customer.name if o.customer else o.customer.corporate_name if o.customer else "Desconhecido",
            "invoice_key": o.invoice_key,
            "bookinfo_nfe_sent": o.bookinfo_nfe_sent
        })
        
    return {"items": results}

@router.delete("/queue/{order_id}")
async def delete_bookinfo_queue_item(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type != UserRole.MASTER:
        raise HTTPException(status_code=403, detail="Acesso restrito.")
        
    order = db.query(Order).filter(Order.id == order_id, Order.origin == "bookinfo").first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado ou não tem origem Bookinfo.")
        
    db.delete(order)
    db.commit()
    return {"status": "success", "message": "Pedido excluído da fila permanentemente."}

@router.post("/queue/{order_id}/sync")
async def sync_bookinfo_queue_item(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type != UserRole.MASTER:
        raise HTTPException(status_code=403, detail="Acesso restrito.")
        
    from app.models.customer import Customer
    from app.models.company_settings import CompanySettings
    from app.models.company import Company
    
    order = db.query(Order).filter(Order.id == order_id, Order.origin == "bookinfo").first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")
        
    if not order.horus_pedido_venda:
        raise HTTPException(status_code=400, detail="Pedido não tem o número do Horus vinculado. Atualize o pedido com CSV.")
        
    customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
    company = db.query(Company).filter(Company.id == order.company_id).first()
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == order.company_id).first()
    
    if not settings or not getattr(settings, 'horus_enabled', False):
        raise HTTPException(status_code=400, detail="Integração Horus desativada para a empresa do pedido.")
        
    # 1. Fetch from Horus
    from app.integrators.horus_orders import HorusOrders
    horus_client = HorusOrders(db, order.company_id)
    
    horus_data = None
    try:
        raw_horus_data = await horus_client.get_order(
            id_doc=customer.document if customer else None,
            id_guid=customer.id_guid if customer else None,
            cnpj_destino=company.document if company else None,
            cod_pedido_origem=None,
            cod_ped_venda=order.horus_pedido_venda,
            ignore_customer_context=True
        )
        if raw_horus_data and isinstance(raw_horus_data, list) and len(raw_horus_data) > 0:
            horus_data = raw_horus_data[0]
        else:
            horus_data = raw_horus_data
    except Exception as e:
        await horus_client.close()
        raise HTTPException(status_code=500, detail=f"Erro ao consultar Horus: {str(e)}")
    finally:
        await horus_client.close()
        
    if not horus_data:
        raise HTTPException(status_code=404, detail=f"Pedido {order.horus_pedido_venda} não encontrado na API do Horus.")
        
    status_venda = horus_data.get("STATUS_PEDIDO_VENDA", "") if isinstance(horus_data, dict) else ""
    if status_venda != "FAT":
        return {"status": "pending", "message": f"Pedido ainda não está faturado no Horus. (Status atual: {status_venda})"}
        
    nf = horus_data.get("NOTA_FISCAL")
    if not nf or not isinstance(nf, dict):
        return {"status": "pending", "message": "Pedido está FAT, porém a tag NOTA_FISCAL não foi retornada pelo Horus."}
        
    xml_base64 = nf.get("XML_Base64")
    nro_nf = nf.get("NRO_NOTA_FISCAL")
    chave_nfe = nf.get("CHAVE_ACESSO_NFE")
    
    if not xml_base64:
        raise HTTPException(status_code=400, detail="XML da NF não disponível no retorno do Horus.")
        
    # Update localized Cronuz record
    order.invoice_xml = xml_base64
    order.invoice_number = nro_nf
    order.invoice_key = chave_nfe
    order.status = "INVOICED"
    db.commit()
    db.refresh(order)
    
    # 2. Push to Bookinfo
    import httpx, json
    from app.models.integrator import Integrator
    
    config = db.query(Integrator).filter(
        Integrator.company_id == order.company_id,
        Integrator.platform == "BOOKINFO",
        Integrator.active == True
    ).first()
    
    if not config or not config.credentials:
        # Mark as invoiced locally, but bookinfo push failed. Let user know so they can re-trigger.
        return {"status": "partial", "message": "Faturado localmente, porém Bookinfo não configurado para essa empresa."}
        
    try:
        creds = json.loads(config.credentials) if isinstance(config.credentials, str) else config.credentials
    except Exception:
        return {"status": "partial", "message": "Faturado localmente. Erro ao ler credenciais Bookinfo."}
        
    env = creds.get("Ambiente", "PROD")
    token = creds.get("Token", "")
    
    if not token:
        return {"status": "partial", "message": "Faturado localmente. Token da Bookinfo ausente."}
        
    base_url = "https://bookhub-api.bookinfo.com.br" if env == "PROD" else "https://bookhub-api-hml.bookinfo.com.br"
    bookinfo_pedido_id = order.tracking_code or order.external_id
    
    payload = {
        "base64": order.invoice_xml,
        "tipo_arquivo": "application/xml",
        "nome_arquivo": f"NFe_{order.invoice_number or 'Autorizada'}.xml"
    }
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    endpoint = f"{base_url}/pedido/{bookinfo_pedido_id}/nota-fiscal/base64"
    
    try:
        async with httpx.AsyncClient(verify=False) as client:
            response = await client.post(endpoint, headers=headers, json=payload, timeout=20.0)
            if response.status_code in [200, 201, 204]:
                order.bookinfo_nfe_sent = True
                db.commit()
                return {"status": "success", "message": f"Faturado! NFe {nro_nf} enviada para Bookinfo com sucesso."}
            else:
                return {"status": "partial", "message": f"Faturado local. Erro ao enviar NF p/ Bookinfo: {response.text}"}
    except Exception as e:
        return {"status": "partial", "message": f"Faturado local. Erro de requisição para Bookinfo: {str(e)}"}

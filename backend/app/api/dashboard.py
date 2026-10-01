from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from app.db.session import get_db
from app.core.dependencies import get_current_user_optional
from app.models.user import User
from app.models.product import Product
from app.models.customer import Customer
from app.models.company import Company
from app.models.company_settings import CompanySettings
from app.models.integrator import Integrator

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/metrics")
def get_dashboard_metrics(
    start_date: str = Query(None, description="ISO YYYY-MM-DD"),
    end_date: str = Query(None, description="ISO YYYY-MM-DD"),
    include_personal: bool = Query(False, description="Incluir contas pessoais e despesas desconsideradas"),
    history_months: int = Query(6, description="Quantidade de meses para o histórico de faturamento"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_optional)
):
    # Determine the company context
    company_id = None
    if current_user and getattr(current_user, "type", None) == "SELLER":
         company_id = current_user.company_id
    elif current_user and getattr(current_user, "type", None) == "MASTER":
         company_id = None
    else:
         company_id = 1

    settings = db.query(CompanySettings)
    if company_id:
        settings = settings.filter(CompanySettings.company_id == company_id)
    settings = settings.first()

    # Check Integrations
    integrations = []
    if company_id:
        integrations = db.query(Integrator.platform).filter(
            Integrator.company_id == company_id,
            Integrator.active == True
        ).all()
    active_integrations = [i[0] for i in integrations]

    # Get Company and Modules Upfront
    company = None
    if company_id:
        company = db.query(Company).filter(Company.id == company_id).first()

    is_master_global = bool(current_user and getattr(current_user, "type", None) == "MASTER" and not company_id)

    module_b2b_native = True if is_master_global else (company.module_b2b_native if company else False)
    module_horus_erp = company.module_horus_erp if company else False
    module_products = True if is_master_global else (company.module_products if company else False)
    module_orders = True if is_master_global else (company.module_orders if company else False)
    module_customers = True if is_master_global else (company.module_customers if company else False)
    module_marketing = True if is_master_global else (company.module_marketing if company else False)
    module_subscriptions = True if is_master_global else (company.module_subscriptions if company else False)
    module_pdv = True if is_master_global else (company.module_pdv if company else False)
    module_agents = True if is_master_global else (company.module_agents if company else False)
    module_financial = True if is_master_global else (company.module_financial if company else False)
    module_services = True if is_master_global else (company.module_services if company else False)
    module_commercial = True if is_master_global else (company.module_commercial if company else False)
    module_crm = True if is_master_global else (getattr(company, "module_crm", False) if company else False)
    module_proposals = True if is_master_global else (company.module_proposals if company else False)
    module_logistica_horus = company.module_logistica_horus if company else False
    module_dropship = getattr(company, "module_dropship", False) if company else False
    module_notifications = getattr(company, "module_notifications", False) if company else False
    module_busca_preco = getattr(company, "module_busca_preco", False) if company else False
    module_horus_sql = bool(getattr(company, "module_horus_sql", False) or (settings and getattr(settings, "horus_sql_enabled", False)))
    modulo_autores_ativo = getattr(company, "modulo_autores_ativo", False) if company else False
    has_inventory_module = getattr(company, "has_inventory_module", False) if company else False
    module_editorial = getattr(company, "module_editorial", False) if company else False
    horus_sql_feature_vindi_baixa = getattr(settings, "horus_sql_feature_vindi_baixa", False) if settings else False
    horus_sql_feature_pedidos = getattr(settings, "horus_sql_feature_pedidos", False) if settings else False
    horus_sql_feature_dbm = getattr(settings, "horus_sql_feature_dbm", False) if settings else False
    company_logo = getattr(company, "logo", None) if company else None

    # Uses horus is derived from integration / module flag
    if current_user and current_user.type == "MASTER" and getattr(current_user, "tenant_id", None) == "horus":
        uses_horus = True
    else:
        uses_horus = module_horus_erp or ("HORUS" in active_integrations) or (settings.horus_enabled if settings else False)

    uses_bookinfo = "BOOKINFO" in active_integrations

    # 1. Total active products (only if module_products)
    active_products = 0
    if module_products:
        prod_query = db.query(Product).filter(Product.status == "ACTIVE")
        if company_id:
            prod_query = prod_query.filter(Product.company_id == company_id)
        elif current_user and current_user.type == "MASTER" and current_user.tenant_id and current_user.tenant_id != "cronuz":
            prod_query = prod_query.join(Company, Product.company_id == Company.id).filter(Company.tenant_id == current_user.tenant_id)
        active_products = prod_query.count()

    # 2. Total customers (empresas clientes - only if module_customers)
    total_customers = 0
    if module_customers:
        cust_query = db.query(Customer)
        if company_id:
            cust_query = cust_query.filter(Customer.company_id == company_id)
        elif current_user and current_user.type == "MASTER" and current_user.tenant_id and current_user.tenant_id != "cronuz":
            cust_query = cust_query.join(Company, Customer.company_id == Company.id).filter(Company.tenant_id == current_user.tenant_id)
        total_customers = cust_query.count()

    # Setup Date Filter for dynamically calculated metrics (Orders, Financial, Services)
    if start_date and end_date:
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            end_dt = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
        except ValueError:
            raise HTTPException(status_code=400, detail="Datas inválidas")
    else:
        now = datetime.now()
        start_dt = datetime(now.year, now.month, 1)
        if now.month == 12:
            end_dt = datetime(now.year + 1, 1, 1)
        else:
            end_dt = datetime(now.year, now.month + 1, 1)

    # 3. Orders By Status & Revenue (only if module_orders)
    orders_by_status = {}
    active_orders = 0
    invoiced_revenue = 0.0
    pending_revenue = 0.0

    if module_orders:
        from app.models.order import Order
        order_query = db.query(Order.status, func.count(Order.id).label('count')).filter(Order.created_at >= start_dt, Order.created_at < end_dt)
        if company_id:
            order_query = order_query.filter(Order.company_id == company_id)
        elif current_user and current_user.type == "MASTER" and current_user.tenant_id and current_user.tenant_id != "cronuz":
            order_query = order_query.join(Company, Order.company_id == Company.id).filter(Company.tenant_id == current_user.tenant_id)
            
        orders_grouped = order_query.group_by(Order.status).all()
        orders_by_status = {st: count for st, count in orders_grouped}
        active_orders = sum(orders_by_status.get(st, 0) for st in ["NEW", "PROCESSING", "SENT_TO_HORUS", "DISPATCH"])

        revenue_query = db.query(Order.status, func.sum(Order.total).label('rev')).filter(
            Order.created_at >= start_dt, Order.created_at < end_dt
        )
        if company_id:
            revenue_query = revenue_query.filter(Order.company_id == company_id)
        elif current_user and current_user.type == "MASTER" and current_user.tenant_id and current_user.tenant_id != "cronuz":
            revenue_query = revenue_query.join(Company, Order.company_id == Company.id).filter(Company.tenant_id == current_user.tenant_id)
            
        revenue_grouped = revenue_query.group_by(Order.status).all()
        for st, rev in revenue_grouped:
            st_val = str(getattr(st, 'value', st)).upper().strip()
            if st_val in ["INVOICED", "FATURADO"]:
                invoiced_revenue += float(rev or 0)
            elif st_val in ["NEW", "NOVO", "PROCESSING", "EM PROCESSAMENTO", "SENT_TO_HORUS", "DISPATCH", "AGUARDANDO"]:
                pending_revenue += float(rev or 0)

    # 4. Financial Metrics (if module enabled)
    financial_metrics = {
        "payable": {"paid": 0.0, "pending": 0.0},
        "receivable": {"paid": 0.0, "pending": 0.0}
    }
    if module_financial:
        from app.models.financial import FinancialInstallment, FinancialTransaction, FinancialAccount
        fin_query = db.query(FinancialTransaction.type, FinancialInstallment.status, func.sum(FinancialInstallment.amount).label('total'))\
            .join(FinancialInstallment, FinancialInstallment.transaction_id == FinancialTransaction.id)\
            .filter(FinancialInstallment.due_date >= start_dt.date(), FinancialInstallment.due_date < end_dt.date(), FinancialInstallment.status != "CANCELLED")
        
        if not include_personal:
            fin_query = fin_query.outerjoin(FinancialAccount, FinancialInstallment.account_id == FinancialAccount.id)\
                .filter(
                    (FinancialAccount.id == None) | (FinancialAccount.is_personal == False),
                    FinancialTransaction.exclude_from_reports == False,
                    FinancialInstallment.exclude_from_reports == False
                )

        if company_id:
            fin_query = fin_query.filter(FinancialTransaction.company_id == company_id)
        elif current_user and current_user.type == "MASTER" and getattr(current_user, "tenant_id", None) and current_user.tenant_id != "cronuz":
            fin_query = fin_query.join(Company, FinancialTransaction.company_id == Company.id).filter(Company.tenant_id == current_user.tenant_id)
            
        fin_agg = fin_query.group_by(FinancialTransaction.type, FinancialInstallment.status).all()
        for t_type, i_status, t_sum in fin_agg:
            val = float(t_sum or 0)
            t_type_str = str(getattr(t_type, 'value', t_type)).upper().strip()
            i_status_str = str(getattr(i_status, 'value', i_status)).upper().strip()
            
            if t_type_str == "PAYABLE":
                if i_status_str in ["PAID", "PAGO"]:
                    financial_metrics["payable"]["paid"] += val
                elif i_status_str in ["PENDING", "OVERDUE", "PENDENTE", "VENCIDO"]:
                    financial_metrics["payable"]["pending"] += val
            elif t_type_str == "RECEIVABLE":
                if i_status_str in ["PAID", "PAGO"]:
                    financial_metrics["receivable"]["paid"] += val
                elif i_status_str in ["PENDING", "OVERDUE", "PENDENTE", "VENCIDO"]:
                    financial_metrics["receivable"]["pending"] += val

    # 5. Service Metrics (if module enabled)
    service_metrics = {
        "pending": {"count": 0, "value": 0.0},
        "completed": {"count": 0, "value": 0.0}
    }
    if module_services:
        from app.models.service import ServiceOrder
        svc_query = db.query(ServiceOrder.status, func.count(ServiceOrder.id).label('count'), func.sum(ServiceOrder.negotiated_value).label('val'))\
            .filter(ServiceOrder.execution_date >= start_dt.date(), ServiceOrder.execution_date < end_dt.date())
            
        if company_id:
            svc_query = svc_query.filter(ServiceOrder.company_id == company_id)
        elif current_user and current_user.type == "MASTER" and getattr(current_user, "tenant_id", None) and current_user.tenant_id != "cronuz":
            svc_query = svc_query.join(Company, ServiceOrder.company_id == Company.id).filter(Company.tenant_id == current_user.tenant_id)
            
        svc_agg = svc_query.group_by(ServiceOrder.status).all()
        for s_status, cnt, val in svc_agg:
            v = float(val or 0)
            s_status_str = str(getattr(s_status, 'value', s_status)).upper().strip()
            
            if s_status_str in ["CONCLUIDO", "COMPLETED"]:
                service_metrics["completed"]["count"] += cnt
                service_metrics["completed"]["value"] += v
            elif s_status_str in ["PENDENTE", "PENDING", "EM EXECUCAO", "EM EXECUSAO", "IN_PROGRESS"]:
                service_metrics["pending"]["count"] += cnt
                service_metrics["pending"]["value"] += v

    # 6. Consolidated Revenue History (Months leading up to filtered period)
    revenue_history = []
    from dateutil.relativedelta import relativedelta
    valid_months = max(1, min(int(history_months or 6), 24))
    anchor_date = datetime(start_dt.year, start_dt.month, 1)
    hist_start = anchor_date - relativedelta(months=valid_months - 1)
    hist_end = anchor_date + relativedelta(months=1)

    pt_months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    month_series = []
    for i in range(valid_months):
        m_dt = hist_start + relativedelta(months=i)
        ym = m_dt.strftime("%Y-%m")
        lbl = f"{pt_months[m_dt.month - 1]}/{str(m_dt.year)[2:]}"
        month_series.append({"ym": ym, "label": lbl})

    orders_hist_map = {}
    if module_orders:
        from app.models.order import Order
        ord_hist_q = db.query(
            func.to_char(Order.created_at, 'YYYY-MM').label('ym'),
            func.sum(Order.total).label('rev'),
            func.count(Order.id).label('cnt')
        ).filter(
            Order.created_at >= hist_start,
            Order.created_at < hist_end,
            func.upper(Order.status).in_(["INVOICED", "FATURADO"])
        )
        if company_id:
            ord_hist_q = ord_hist_q.filter(Order.company_id == company_id)
        elif current_user and current_user.type == "MASTER" and getattr(current_user, "tenant_id", None) and current_user.tenant_id != "cronuz":
            ord_hist_q = ord_hist_q.join(Company, Order.company_id == Company.id).filter(Company.tenant_id == current_user.tenant_id)
        
        for ym_val, rev_val, cnt_val in ord_hist_q.group_by(func.to_char(Order.created_at, 'YYYY-MM')).all():
            orders_hist_map[str(ym_val)] = {"rev": float(rev_val or 0.0), "cnt": int(cnt_val or 0)}

    services_hist_map = {}
    if module_services:
        from app.models.service import ServiceOrder, ServiceOrderStatus
        from sqlalchemy import cast, String
        svc_hist_q = db.query(
            func.to_char(ServiceOrder.execution_date, 'YYYY-MM').label('ym'),
            func.sum(ServiceOrder.negotiated_value).label('rev'),
            func.count(ServiceOrder.id).label('cnt')
        ).filter(
            ServiceOrder.execution_date >= hist_start.date(),
            ServiceOrder.execution_date < hist_end.date(),
            func.upper(cast(ServiceOrder.status, String)).in_(["COMPLETED", "CONCLUIDO"])
        )
        if company_id:
            svc_hist_q = svc_hist_q.filter(ServiceOrder.company_id == company_id)
        elif current_user and current_user.type == "MASTER" and getattr(current_user, "tenant_id", None) and current_user.tenant_id != "cronuz":
            svc_hist_q = svc_hist_q.join(Company, ServiceOrder.company_id == Company.id).filter(Company.tenant_id == current_user.tenant_id)
        
        for ym_val, rev_val, cnt_val in svc_hist_q.group_by(func.to_char(ServiceOrder.execution_date, 'YYYY-MM')).all():
            services_hist_map[str(ym_val)] = {"rev": float(rev_val or 0.0), "cnt": int(cnt_val or 0)}

    for item in month_series:
        ym = item["ym"]
        ord_info = orders_hist_map.get(ym, {"rev": 0.0, "cnt": 0}) if module_orders else {"rev": 0.0, "cnt": 0}
        svc_info = services_hist_map.get(ym, {"rev": 0.0, "cnt": 0}) if module_services else {"rev": 0.0, "cnt": 0}
        tot_rev = ord_info["rev"] + svc_info["rev"]
        revenue_history.append({
            "year_month": ym,
            "month": ym,
            "label": item["label"],
            "month_label": item["label"],
            "orders_revenue": ord_info["rev"],
            "orders": ord_info["rev"],
            "orders_count": ord_info["cnt"],
            "services_revenue": svc_info["rev"],
            "services": svc_info["rev"],
            "services_count": svc_info["cnt"],
            "total_revenue": tot_rev,
            "total": tot_rev
        })

    consolidated_orders = invoiced_revenue if module_orders else 0.0
    consolidated_services = service_metrics["completed"]["value"] if module_services else 0.0
    consolidated_invoiced = consolidated_orders + consolidated_services

    return {
        "active_products": active_products,
        "total_customers": total_customers,
        "active_orders": active_orders,
        "orders_by_status": orders_by_status,
        "orders_revenue": {
            "invoiced": invoiced_revenue if module_orders else 0.0,
            "pending": pending_revenue if module_orders else 0.0
        },
        "consolidated_revenue": {
            "total": consolidated_invoiced,
            "orders": consolidated_orders,
            "services": consolidated_services
        },
        "revenue_history": revenue_history,
        "financial_metrics": financial_metrics,
        "service_metrics": service_metrics,
        "include_personal": include_personal,
        "uses_horus": uses_horus,
        "horus_api_mode": settings.horus_api_mode if settings else 'B2B',
        "uses_bookinfo": uses_bookinfo,
        "module_b2b_native": module_b2b_native,
        "module_horus_erp": module_horus_erp,
        "module_products": module_products,
        "module_orders": module_orders,
        "module_customers": module_customers,
        "module_marketing": module_marketing,
        "module_subscriptions": module_subscriptions,
        "module_pdv": module_pdv,
        "module_agents": module_agents,
        "module_financial": module_financial,
        "module_services": module_services,
        "module_commercial": module_commercial,
        "module_crm": module_crm,
        "module_proposals": module_proposals,
        "module_logistica_horus": module_logistica_horus,
        "module_dropship": module_dropship,
        "module_notifications": module_notifications,
        "module_busca_preco": module_busca_preco,
        "module_horus_sql": module_horus_sql,
        "modulo_autores_ativo": modulo_autores_ativo,
        "has_inventory_module": has_inventory_module,
        "module_editorial": module_editorial,
        "horus_sql_feature_vindi_baixa": horus_sql_feature_vindi_baixa,
        "horus_sql_feature_pedidos": horus_sql_feature_pedidos,
        "horus_sql_feature_dbm": horus_sql_feature_dbm,
        "company_logo": company_logo,
    }

@router.get("/crm-tasks")
def get_dashboard_crm_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_optional)
):
    if not current_user:
        return []
        
    company_id = None
    if getattr(current_user, "type", None) == "SELLER":
         company_id = current_user.company_id
    elif getattr(current_user, "type", None) == "MASTER":
         company_id = None
    else:
         company_id = 1
         
    from app.models.customer import Interaction, Customer
    
    query = db.query(Interaction, Customer.name, Customer.corporate_name).join(Customer, Customer.id == Interaction.customer_id).filter(
        Interaction.status == "PENDING"
    )
    
    if company_id:
        query = query.filter(Customer.company_id == company_id)
    
    # Sort by due_date ascending, limit to top 15 incoming tasks
    results = query.order_by(Interaction.due_date.asc()).limit(15).all()
    
    output = []
    for inter, cust_name, cust_corp_name in results:
         output.append({
             "id": inter.id,
             "customer_id": inter.customer_id,
             "customer_name": cust_name or cust_corp_name,
             "type": inter.type,
             "content": inter.content,
             "due_date": inter.due_date,
             "status": inter.status
         })
         
    return output

from pydantic import BaseModel
class SmtpTestRequest(BaseModel):
    to_email: str

@router.post("/smtp-test")
def test_smtp_settings(
    payload: SmtpTestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_optional)
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Não autorizado")
        
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == current_user.company_id).first()
    if not settings or not settings.smtp_host or not settings.smtp_username or not settings.smtp_password:
        raise HTTPException(status_code=400, detail="Configurações de SMTP incompletas no painel.")
        
    from app.core.email import send_smtp_email
    try:
        html_content = f"""
        <html>
            <body style="font-family: sans-serif; line-height: 1.6; color: #333;">
                <h2 style="color: #0f172a;">Teste de Conexão SMTP</h2>
                <p>Olá,</p>
                <p>Se você está recebendo este e-mail, significa que as configurações de SMTP do sistema Cronuz B2B estão funcionando corretamente!</p>
                <hr style="border: 1px solid #eee; my-4" />
                <p style="font-size: 12px; color: #888;">Enviado a partir de {settings.smtp_host}</p>
            </body>
        </html>
        """
        send_smtp_email(
            smtp_host=settings.smtp_host,
            smtp_port=settings.smtp_port or 587,
            smtp_username=settings.smtp_username,
            smtp_password=settings.smtp_password,
            smtp_from=settings.smtp_from_email or settings.smtp_username,
            to_email=payload.to_email,
            subject="Cronuz B2B - Teste de Conexão SMTP",
            html_content=html_content,
            use_ssl=settings.smtp_use_ssl or False
        )
        return {"message": "E-mail de teste enviado com sucesso!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Falha ao enviar e-mail: {str(e)}")

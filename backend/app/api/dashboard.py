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

    # 1. Total active products (unless Horus is used)
    settings = db.query(CompanySettings)
    if company_id:
        settings = settings.filter(CompanySettings.company_id == company_id)
    settings = settings.first()
        
    uses_horus = settings.horus_enabled if settings else False
    
    active_products = 0
    prod_query = db.query(Product).filter(Product.status == "ACTIVE")
    if company_id:
        prod_query = prod_query.filter(Product.company_id == company_id)
    elif current_user and current_user.type == "MASTER" and current_user.tenant_id and current_user.tenant_id != "cronuz":
        prod_query = prod_query.join(Company, Product.company_id == Company.id)
        if False:
            prod_query = prod_query.filter(Company.module_horus_erp == True)
        else:
            prod_query = prod_query.filter(Company.tenant_id == current_user.tenant_id)
            
    active_products = prod_query.count()

    # 2. Total customers (empresas clientes)
    cust_query = db.query(Customer)
    if company_id:
        cust_query = cust_query.filter(Customer.company_id == company_id)
    elif current_user and current_user.type == "MASTER" and current_user.tenant_id and current_user.tenant_id != "cronuz":
        cust_query = cust_query.join(Company, Customer.company_id == Company.id)
        if False:
            cust_query = cust_query.filter(Company.module_horus_erp == True)
        else:
            cust_query = cust_query.filter(Company.tenant_id == current_user.tenant_id)
    total_customers = cust_query.count()

    # Setup Date Filter for dynamically calculated metrics (Orders, Financial, Services)
    if start_date and end_date:
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            end_dt = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
        except ValueError:
            raise HTTPException(status_code=400, detail="Datas inválidas")
    else:
        # Default current month
        now = datetime.now()
        start_dt = datetime(now.year, now.month, 1)
        if now.month == 12:
            end_dt = datetime(now.year + 1, 1, 1)
        else:
            end_dt = datetime(now.year, now.month + 1, 1)

    # 3. Orders By Status
    from app.models.order import Order
    order_query = db.query(Order.status, func.count(Order.id).label('count')).filter(Order.created_at >= start_dt, Order.created_at < end_dt)
    
    if company_id:
        order_query = order_query.filter(Order.company_id == company_id)
    elif current_user and current_user.type == "MASTER" and current_user.tenant_id and current_user.tenant_id != "cronuz":
        order_query = order_query.join(Company, Order.company_id == Company.id).filter(Company.tenant_id == current_user.tenant_id)
        
    orders_grouped = order_query.group_by(Order.status).all()
    orders_by_status = {st: count for st, count in orders_grouped}
    
    active_orders = sum(orders_by_status.get(st, 0) for st in ["NEW", "PROCESSING", "SENT_TO_HORUS", "DISPATCH"])
    
    invoiced_revenue = 0.0
    pending_revenue = 0.0
    
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
    
    # Check Integrations
    integrations = []
    if company_id: # Only query integrations if company_id is available
        integrations = db.query(Integrator.platform).filter(
            Integrator.company_id == company_id,
            Integrator.active == True
        ).all()
    
    active_integrations = [i[0] for i in integrations]

    uses_horus = "HORUS" in active_integrations
    uses_bookinfo = "BOOKINFO" in active_integrations

    # Get Company Modules
    company = None
    if company_id:
        company = db.query(Company).filter(Company.id == company_id).first()
        
    module_b2b_native = company.module_b2b_native if company else False
    module_horus_erp = company.module_horus_erp if company else False
    module_products = company.module_products if company else False
    module_orders = company.module_orders if company else False
    module_customers = company.module_customers if company else False
    module_marketing = company.module_marketing if company else False
    module_subscriptions = company.module_subscriptions if company else False
    module_pdv = company.module_pdv if company else False
    module_agents = company.module_agents if company else False
    module_financial = company.module_financial if company else False
    module_services = company.module_services if company else False
    module_commercial = company.module_commercial if company else False
    module_crm = getattr(company, "module_crm", False) if company else False

    # Uses horus is now strongly derived from the company flag
    if current_user and current_user.type == "MASTER" and current_user.tenant_id == "horus":
        uses_horus = True
    else:
        uses_horus = module_horus_erp

    # 4. Financial Metrics (if module enabled)
    financial_metrics = {
        "payable": {"paid": 0.0, "pending": 0.0},
        "receivable": {"paid": 0.0, "pending": 0.0}
    }
    if module_financial:
        from app.models.financial import FinancialInstallment, FinancialTransaction
        fin_query = db.query(FinancialTransaction.type, FinancialInstallment.status, func.sum(FinancialInstallment.amount).label('total'))\
            .join(FinancialInstallment, FinancialInstallment.transaction_id == FinancialTransaction.id)\
            .filter(FinancialInstallment.due_date >= start_dt.date(), FinancialInstallment.due_date < end_dt.date(), FinancialInstallment.status != "CANCELLED")
        
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

    return {
        "active_products": active_products,
        "total_customers": total_customers,
        "active_orders": active_orders,
        "orders_by_status": orders_by_status,
        "orders_revenue": {
            "invoiced": invoiced_revenue,
            "pending": pending_revenue
        },
        "financial_metrics": financial_metrics,
        "service_metrics": service_metrics,
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
        "module_crm": module_crm
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

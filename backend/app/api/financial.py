from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime, date, timedelta

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.order_installment import OrderInstallment
from app.schemas.financial import (
    OrderInstallmentResponse, InstallmentPayRequest,
    FinancialCategoryCreate, FinancialCategoryUpdate, FinancialCategory as FinancialCategorySchema,
    FinancialTransactionCreate, FinancialTransaction as FinancialTransactionSchema,
    FinancialInstallmentUpdate, FinancialInstallment as FinancialInstallmentSchema,
    FinancialAccount as FinancialAccountSchema, FinancialAccountCreate, FinancialAccountUpdate,
    FinancialCashFlowLogSchema, FinancialBulkConciliate,
    FinancialTransactionUpdate, FinancialInstallmentEdit,
    BankTransferRequest, FinancialBulkUpdateDateRequest,
    FinancialInstallmentsGroupRequest
)
from fastapi.responses import Response, StreamingResponse
from app.models.financial import FinancialCategory, FinancialTransaction, FinancialInstallment, FinancialAccount, FinancialCashFlowLog
from app.models.company import Company
from app.models.customer import Customer
from app.models.company_settings import CompanySettings
from datetime import timedelta
from pydantic import BaseModel

class SendEmailRequest(BaseModel):
    subject: str
    body: str
    to_emails: str
    attach_invoice: bool = False
    attach_boletos: bool = False

router = APIRouter()

@router.get("/financial/installments", response_model=List[OrderInstallmentResponse])
def get_installments(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    customer_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in ["MASTER", "SELLER", "FINANCIAL"]:
        raise HTTPException(status_code=403, detail="Acesso não autorizado")
        
    query = db.query(OrderInstallment).options(
        joinedload(OrderInstallment.customer),
        joinedload(OrderInstallment.order)
    ).filter(OrderInstallment.company_id == current_user.company_id)
    
    if customer_id:
        query = query.filter(OrderInstallment.customer_id == customer_id)
    if status:
        query = query.filter(OrderInstallment.status == status)
        
    installments = query.order_by(OrderInstallment.due_date.asc(), OrderInstallment.id.asc())\
                        .offset(skip).limit(limit).all()
    
    # Attach nested names for frontend convenience
    for inst in installments:
        if getattr(inst, "customer", None):
            inst.customer_name = inst.customer.name
        if getattr(inst, "order", None):
            inst.order_status = inst.order.status
            
    return installments

@router.post("/financial/installments/{installment_id}/pay", response_model=OrderInstallmentResponse)
def pay_installment(
    installment_id: int,
    payload: InstallmentPayRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in ["MASTER", "SELLER", "FINANCIAL"]:
        raise HTTPException(status_code=403, detail="Acesso não autorizado")
        
    installment = db.query(OrderInstallment).filter(
        OrderInstallment.id == installment_id,
        OrderInstallment.company_id == current_user.company_id
    ).first()
    
    if not installment:
        raise HTTPException(status_code=404, detail="Parcela não encontrada ou não pertence a esta empresa")
        
    if installment.status == "PAID":
        raise HTTPException(status_code=400, detail="Esta parcela já está paga")
        
    if payload.amount_paid < installment.amount:
        # Simplification: fully paid on any value > 0 for MVP
        pass

    installment.status = "PAID"
    installment.payment_date = payload.payment_date
    installment.amount_paid = payload.amount_paid
    
    db.commit()
    
    return {"message": "Parcela quitada com sucesso", "status": "PAID", "installment_id": installment.id}

@router.get("/financial/summary", response_model=dict)
def get_financial_summary(
    include_personal: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in ["MASTER", "SELLER", "FINANCIAL"]:
        raise HTTPException(status_code=403, detail="Acesso não autorizado")
        
    cid = current_user.company_id
    
    # Agregação direta no PostgreSQL via SUM/GROUP BY (alta performance, zero desperdício de RAM)
    q = db.query(
        FinancialInstallment.status,
        func.sum(FinancialInstallment.amount).label("total")
    ).join(FinancialTransaction, FinancialInstallment.transaction_id == FinancialTransaction.id)

    if not include_personal:
        q = q.outerjoin(FinancialAccount, FinancialInstallment.account_id == FinancialAccount.id)\
             .filter(
                 (FinancialAccount.id == None) | (FinancialAccount.is_personal == False),
                 FinancialTransaction.exclude_from_reports == False,
                 FinancialInstallment.exclude_from_reports == False
             )

    sums_by_status = q.filter(
        FinancialTransaction.company_id == cid
    ).group_by(FinancialInstallment.status).all()

    totals_map = {st: float(tot or 0.0) for st, tot in sums_by_status}

    return {
        "total_open": totals_map.get("PENDING", 0.0),
        "total_paid": totals_map.get("PAID", 0.0),
        "total_overdue": totals_map.get("OVERDUE", 0.0)
    }

def get_company_id(user: User):
    if user.type == "MASTER":
        pass
    if not user.company_id and user.type != "MASTER":
        raise HTTPException(status_code=400, detail="Usuário sem empresa vinculada.")
    return user.company_id

@router.get("/financial/categories", response_model=List[FinancialCategorySchema])
def list_categories(
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user),
    type: Optional[str] = None
):
    cid = get_company_id(current_user)
    query = db.query(FinancialCategory)
    if cid: query = query.filter(FinancialCategory.company_id == cid)
    if type: query = query.filter(FinancialCategory.type == type)
    return query.all()

@router.post("/financial/categories", response_model=FinancialCategorySchema)
def create_category(category: FinancialCategoryCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cid = get_company_id(current_user)
    if not cid: raise HTTPException(status_code=400, detail="Company ID required")
    db_cat = FinancialCategory(
        company_id=cid, 
        name=category.name, 
        type=category.type, 
        active=category.active, 
        dre_group=category.dre_group,
        is_system=False,
        parent_id=category.parent_id
    )
    db.add(db_cat)
    db.commit()
    db.refresh(db_cat)
    return db_cat

@router.patch("/financial/categories/{cat_id}")
def update_category(cat_id: int, category_update: FinancialCategoryUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cid = get_company_id(current_user)
    db_cat = db.query(FinancialCategory).filter(FinancialCategory.id == cat_id, FinancialCategory.company_id == cid).first()
    if not db_cat: raise HTTPException(status_code=404, detail="Categoria não encontrada.")
    if category_update.name is not None: db_cat.name = category_update.name
    if category_update.active is not None: db_cat.active = category_update.active
    if category_update.dre_group is not None: db_cat.dre_group = category_update.dre_group
    if hasattr(category_update, 'parent_id') and category_update.parent_id is not None:
        db_cat.parent_id = category_update.parent_id if category_update.parent_id > 0 else None
    
    db.commit()
    return {"message": "Atualizada."}

@router.delete("/financial/categories/{cat_id}")
def delete_category(cat_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cid = get_company_id(current_user)
    cat = db.query(FinancialCategory).filter(FinancialCategory.id == cat_id, FinancialCategory.company_id == cid).first()
    if not cat: raise HTTPException(status_code=404)
    if cat.is_system: raise HTTPException(status_code=400, detail="Categorias do sistema não podem ser apagadas, apenas desativadas.")
    
    has_tx = db.query(FinancialTransaction).filter(FinancialTransaction.category_id == cat_id).first()
    if has_tx:
        raise HTTPException(status_code=400, detail="Não é possível excluir esta categoria pois já existem lançamentos vinculados a ela.")
        
    db.delete(cat)
    db.commit()
    return {"message": "Deleted"}

@router.post("/financial/transactions", response_model=FinancialTransactionSchema)
def create_transaction(
    transaction: FinancialTransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    cid = get_company_id(current_user)
    if not cid: raise HTTPException(status_code=400, detail="Company required")
    
    cat = db.query(FinancialCategory).filter(FinancialCategory.id == transaction.category_id, FinancialCategory.company_id == cid).first()
    if not cat: raise HTTPException(status_code=404, detail="Categoria não existe.")
    
    db_trans = FinancialTransaction(
        company_id=cid,
        category_id=transaction.category_id,
        description=transaction.description,
        type=transaction.type,
        transaction_status=transaction.transaction_status,
        is_fixed=transaction.is_fixed,
        keep_fixed_day=transaction.keep_fixed_day,
        total_amount=transaction.total_amount,
        issue_date=transaction.issue_date,
        first_due_date=transaction.first_due_date,
        customer_id=transaction.customer_id,
        order_id=transaction.order_id,
        exclude_from_reports=getattr(transaction, 'exclude_from_reports', False)
    )
    db.add(db_trans)
    db.flush()
    
    qnt = max(1, transaction.installments_count)
    base_amount = round(transaction.total_amount / qnt, 2)
    last_amount = round(transaction.total_amount - (base_amount * (qnt - 1)), 2)
    
    from dateutil.relativedelta import relativedelta

    # Se merge_mode == "DISTRIBUTE_MONTHLY", busca parcelas pendentes do cliente nos mesmos meses e soma nelas
    if transaction.merge_mode == "DISTRIBUTE_MONTHLY" and transaction.customer_id:
        # Busca parcelas pendentes não conciliadas do mesmo cliente e tipo
        query_pending = db.query(FinancialInstallment).join(
            FinancialTransaction, FinancialInstallment.transaction_id == FinancialTransaction.id
        ).filter(
            FinancialTransaction.company_id == cid,
            FinancialTransaction.customer_id == transaction.customer_id,
            FinancialTransaction.type == transaction.type,
            FinancialInstallment.status.in_(["PENDING", "OVERDUE"]),
            FinancialInstallment.is_conciliated == False
        )
        if transaction.target_installment_ids:
            query_pending = query_pending.filter(FinancialInstallment.id.in_(transaction.target_installment_ids))
        
        pending_list = query_pending.order_by(FinancialInstallment.due_date.asc(), FinancialInstallment.id.asc()).all()

        pending_by_month = {}
        for p_inst in pending_list:
            if p_inst.due_date:
                k = (p_inst.due_date.year, p_inst.due_date.month)
                if k not in pending_by_month:
                    pending_by_month[k] = p_inst

        created_installments = []
        for i in range(qnt):
            if transaction.keep_fixed_day:
                due = transaction.first_due_date + relativedelta(months=i)
            else:
                due = transaction.first_due_date + timedelta(days=30 * i)
            part_amount = last_amount if i == qnt - 1 else base_amount
            k = (due.year, due.month)

            if k in pending_by_month:
                # Soma na parcela existente
                existing_inst = pending_by_month.pop(k)
                existing_inst.amount = round(existing_inst.amount + part_amount, 2)
                
                # Incrementa observação / histórico da transação existente
                if existing_inst.transaction:
                    existing_inst.transaction.total_amount = round(existing_inst.transaction.total_amount + part_amount, 2)
                    tag = f"+ {transaction.description} (R$ {part_amount:,.2f})"
                    if existing_inst.transaction.description:
                        existing_inst.transaction.description = f"{existing_inst.transaction.description}\n• {tag}"
                    else:
                        existing_inst.transaction.description = tag
            else:
                # Cria nova parcela sob a transação atual
                inst = FinancialInstallment(
                    transaction_id=db_trans.id,
                    number=len(created_installments) + 1,
                    due_date=due,
                    amount=part_amount,
                    status="PENDING",
                    account_id=transaction.account_id,
                    exclude_from_reports=getattr(transaction, 'exclude_from_reports', False)
                )
                db.add(inst)
                created_installments.append(inst)

        # Se todas as parcelas foram somadas nas já existentes e nenhuma nova foi gerada sob db_trans, remove db_trans para não ficar órfã vazia
        if not created_installments:
            db.delete(db_trans)
            db.commit()
            # Retorna a primeira parcela existente afetada
            first_affected = pending_list[0].transaction if pending_list else None
            return first_affected
        else:
            db_trans.total_amount = round(sum(ci.amount for ci in created_installments), 2)
            db.commit()
            db.refresh(db_trans)
            return db_trans

    # Modo padrão (sem distribuição / soma mensal)
    for i in range(qnt):
        if transaction.keep_fixed_day:
            due = transaction.first_due_date + relativedelta(months=i)
        else:
            due = transaction.first_due_date + timedelta(days=30 * i)
        amount = last_amount if i == qnt - 1 else base_amount
        inst = FinancialInstallment(
            transaction_id=db_trans.id, 
            number=i + 1, 
            due_date=due, 
            amount=amount, 
            status="PENDING", 
            account_id=transaction.account_id,
            exclude_from_reports=getattr(transaction, 'exclude_from_reports', False)
        )
        db.add(inst)
    
    db.commit()
    db.refresh(db_trans)
    return db_trans

@router.get("/financial/generic_installments")
def list_generic_installments(
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user), 
    status: Optional[str] = None, 
    customer_id: Optional[int] = None,
    start_due_date: Optional[str] = None,
    end_due_date: Optional[str] = None,
    start_payment_date: Optional[str] = None,
    end_payment_date: Optional[str] = None,
    installment_id: Optional[int] = None,
    transaction_id: Optional[int] = None,
    type: Optional[str] = None,
    types: Optional[str] = None,
    account_id: Optional[int] = None,
    order_id: Optional[int] = None,
    search: Optional[str] = None,
    management_only: bool = Query(False, description="Filtrar apenas movimentações da empresa (ocultando contas pessoais e despesas desconsideradas)"),
    personal_only: bool = Query(False, description="Filtrar apenas movimentações pessoais/desconsideradas"),
    page: int = 1,
    page_size: int = 50
):
    cid = get_company_id(current_user)
    str_types = types.split(',') if types else []
    
    query = db.query(FinancialInstallment, FinancialTransaction, FinancialCategory, Customer, CompanySettings.inter_enabled, FinancialAccount).join(
        FinancialTransaction, FinancialInstallment.transaction_id == FinancialTransaction.id
    ).join(FinancialCategory, FinancialTransaction.category_id == FinancialCategory.id).outerjoin(
        Customer, FinancialTransaction.customer_id == Customer.id
    ).outerjoin(
        CompanySettings, FinancialTransaction.company_id == CompanySettings.company_id
    ).outerjoin(
        FinancialAccount, FinancialInstallment.account_id == FinancialAccount.id
    )
    if cid: query = query.filter(FinancialTransaction.company_id == cid)

    if management_only:
        query = query.filter(
            (FinancialAccount.id == None) | (FinancialAccount.is_personal == False),
            FinancialTransaction.exclude_from_reports == False,
            FinancialInstallment.exclude_from_reports == False
        )
    elif personal_only:
        query = query.filter(
            (FinancialAccount.is_personal == True) | (FinancialTransaction.exclude_from_reports == True) | (FinancialInstallment.exclude_from_reports == True)
        )

    if status and status != 'ALL': 
        if status == 'OVERDUE':
            from datetime import date
            query = query.filter(FinancialInstallment.status == 'PENDING', FinancialInstallment.due_date < date.today())
        elif status == 'PENDING':
            from datetime import date
            query = query.filter(FinancialInstallment.status == 'PENDING', FinancialInstallment.due_date >= date.today())
        else:
            query = query.filter(FinancialInstallment.status == status)
    elif not status:
        if not (search or order_id or installment_id or transaction_id):
            query = query.filter(FinancialInstallment.status.notin_(['PAID', 'CANCELLED']))
        
    if customer_id: query = query.filter(FinancialTransaction.customer_id == customer_id)
    if start_due_date: query = query.filter(FinancialInstallment.due_date >= start_due_date)
    if end_due_date: query = query.filter(FinancialInstallment.due_date <= end_due_date)
    if start_payment_date: query = query.filter(FinancialInstallment.payment_date >= start_payment_date)
    if end_payment_date: query = query.filter(FinancialInstallment.payment_date <= end_payment_date)
    if installment_id: query = query.filter(FinancialInstallment.id == installment_id)
    if transaction_id: query = query.filter(FinancialTransaction.id == transaction_id)
    if type: query = query.filter(FinancialTransaction.type == type)
    if account_id: query = query.filter(FinancialInstallment.account_id == account_id)
    if order_id: query = query.filter(FinancialTransaction.order_id == order_id)
    if search: query = query.filter(FinancialTransaction.description.ilike(f"%{search}%"))
        
    from sqlalchemy import func
    total = query.count()
    results = query.order_by(FinancialInstallment.due_date.asc()).offset((page - 1) * page_size).limit(page_size).all()
    
    # Previne N+1 coletando a contagem de parcelas em batch por transaction_id
    trans_ids = list({trans.id for _, trans, _, _, _, _ in results})
    counts_map = {}
    if trans_ids:
        counts = db.query(
            FinancialInstallment.transaction_id,
            func.count(FinancialInstallment.id)
        ).filter(FinancialInstallment.transaction_id.in_(trans_ids)).group_by(FinancialInstallment.transaction_id).all()
        counts_map = {tid: c for tid, c in counts}

    items = []
    for inst, trans, cat, cust, inter_enabled, acc in results:
        acc_is_personal = bool(acc.is_personal) if acc else False
        is_excluded = bool(inst.exclude_from_reports or trans.exclude_from_reports or acc_is_personal)

        items.append({
            "id": inst.id, "number": inst.number, "due_date": inst.due_date, "amount": inst.amount, "status": inst.status,
            "payment_date": inst.payment_date, "transaction_id": trans.id, "description": trans.description, "order_id": trans.order_id,
            "total_installments": counts_map.get(trans.id, 1),
            "category_name": cat.name, "category_id": cat.id, "type": trans.type, "account_id": inst.account_id,
            "account_name": acc.name if acc else None,
            "account_is_personal": acc_is_personal,
            "exclude_from_reports": is_excluded,
            "inst_exclude_from_reports": bool(inst.exclude_from_reports),
            "trans_exclude_from_reports": bool(trans.exclude_from_reports),
            "customer_name": cust.name if cust else None,
            "customer_id": cust.id if cust else None,
            "is_conciliated": inst.is_conciliated,
            "is_fixed": trans.is_fixed,
            "keep_fixed_day": trans.keep_fixed_day,
            "bank_slip_pdf": inst.bank_slip_pdf_url,
            "bank_slip_nosso_numero": inst.bank_slip_nosso_numero,
            "inter_enabled": inter_enabled or False,
            "email_sent_at": trans.email_sent_at
        })
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size
    }

@router.patch("/financial/generic_installments/{inst_id}/toggle_exclude")
def toggle_installment_exclude(
    inst_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    cid = get_company_id(current_user)
    inst = db.query(FinancialInstallment).join(
        FinancialTransaction, FinancialInstallment.transaction_id == FinancialTransaction.id
    ).filter(
        FinancialInstallment.id == inst_id,
        FinancialTransaction.company_id == cid
    ).first()
    if not inst:
        raise HTTPException(status_code=404, detail="Parcela não encontrada.")
    
    inst.exclude_from_reports = not inst.exclude_from_reports
    db.commit()
    db.refresh(inst)
    return {
        "id": inst.id,
        "exclude_from_reports": inst.exclude_from_reports,
        "message": "Lançamento desconsiderado de relatórios gerenciais." if inst.exclude_from_reports else "Lançamento reativado para relatórios gerenciais."
    }

@router.get("/financial/reports/by-category")
def reports_by_category(db: Session = Depends(get_db), current_user: User = Depends(get_current_user), account_id: Optional[int] = None):
    cid = get_company_id(current_user)
    from sqlalchemy import func
    
    query = db.query(
        FinancialCategory.name,
        FinancialCategory.type,
        FinancialInstallment.status,
        func.sum(FinancialInstallment.amount).label("total")
    ).join(
        FinancialTransaction, FinancialTransaction.category_id == FinancialCategory.id
    ).join(
        FinancialInstallment, FinancialInstallment.transaction_id == FinancialTransaction.id
    ).filter(
        FinancialTransaction.company_id == cid
    )

    if account_id:
        query = query.filter(FinancialInstallment.account_id == account_id)

    results = query.group_by(
        FinancialCategory.name, FinancialCategory.type, FinancialInstallment.status
    ).all()
    
    return [{"category": c_name, "type": c_type, "status": stat, "total": float(tot)} for c_name, c_type, stat, tot in results]

@router.get("/financial/reports/dre")
def reports_dre(month_year: str, regime: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user), account_id: Optional[int] = None):
    cid = get_company_id(current_user)
    from sqlalchemy import func, extract
    
    y, m = month_year.split('-')
    
    query = db.query(
        FinancialCategory.name,
        FinancialCategory.dre_group,
        func.sum(FinancialInstallment.amount).label("total")
    ).join(
        FinancialTransaction, FinancialTransaction.category_id == FinancialCategory.id
    ).join(
        FinancialInstallment, FinancialInstallment.transaction_id == FinancialTransaction.id
    ).filter(
        FinancialTransaction.company_id == cid,
        FinancialCategory.dre_group != None,
        FinancialCategory.dre_group != ''
    )

    if account_id:
        query = query.filter(FinancialInstallment.account_id == account_id)

    if regime == 'CAIXA':
        query = query.filter(
            extract('year', FinancialInstallment.payment_date) == int(y),
            extract('month', FinancialInstallment.payment_date) == int(m),
            FinancialInstallment.status == 'PAID'
        )
    else: # COMPETENCIA
        query = query.filter(
            extract('year', FinancialInstallment.due_date) == int(y),
            extract('month', FinancialInstallment.due_date) == int(m)
        )

    results = query.group_by(
        FinancialCategory.name, FinancialCategory.dre_group
    ).all()
    
    return [{"category": c_name, "dre_group": c_group, "total": float(tot)} for c_name, c_group, tot in results]

@router.get("/financial/transactions/{trans_id}/details")
def transaction_details(trans_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cid = get_company_id(current_user)
    from app.models.customer import Customer
    trans = db.query(FinancialTransaction).filter(FinancialTransaction.id == trans_id, FinancialTransaction.company_id == cid).first()
    if not trans: raise HTTPException(status_code=404)
    
    customer_obj = db.query(Customer).filter(Customer.id == trans.customer_id).first() if trans.customer_id else None
    customer_name = customer_obj.name if customer_obj else None
    customer_data = None
    if customer_obj:
        customer_data = {
            "name": customer_obj.name,
            "email": getattr(customer_obj, "email", None),
            "billing_emails": getattr(customer_obj, "billing_emails", None)
        }
    category_name = db.query(FinancialCategory.name).filter(FinancialCategory.id == trans.category_id).scalar()
    installments = db.query(FinancialInstallment).filter(FinancialInstallment.transaction_id == trans.id).order_by(FinancialInstallment.number.asc()).all()
    nfse_url = None
    nfse_number = None
    if trans.description and "OS #" in trans.description:
        import re
        match = re.search(r'OS #(\d+)', trans.description)
        if match:
            order_id = int(match.group(1))
            from app.models.service import ServiceOrder
            from app.models.nfse import NFSeQueue
            so = db.query(ServiceOrder).filter(ServiceOrder.id == order_id, ServiceOrder.company_id == cid).first()
            if so:
                if so.invoice_pdf_url:
                    nfse_url = so.invoice_pdf_url
                nfse_q = db.query(NFSeQueue).filter(NFSeQueue.service_order_id == so.id).order_by(NFSeQueue.created_at.desc()).first()
                if nfse_q and nfse_q.xml_protocol_id:
                    nfse_number = nfse_q.xml_protocol_id

    return {
        "id": trans.id, "description": trans.description, "type": trans.type, "total_amount": trans.total_amount,
        "is_fixed": trans.is_fixed, "keep_fixed_day": trans.keep_fixed_day, "created_at": trans.created_at, "customer_name": customer_name,
        "category_name": category_name, "installments": installments,
        "customer_id": trans.customer_id, "category_id": trans.category_id, "order_id": trans.order_id,
        "nfse_url": nfse_url, "nfse_number": nfse_number,
        "customer": customer_data
    }

@router.post("/financial/transactions/{trans_id}/send-email", response_model=dict)
def send_financial_transaction_email(
    trans_id: int,
    payload: SendEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.core.email import send_smtp_email
    import os
    import base64
    
    cid = get_company_id(current_user)
    trans = db.query(FinancialTransaction).filter(
        FinancialTransaction.id == trans_id, 
        FinancialTransaction.company_id == cid
    ).first()
    
    if not trans:
        raise HTTPException(status_code=404, detail="Transação não encontrada.")
        
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == cid).first()
    if not settings or not settings.smtp_host or not settings.smtp_username:
        raise HTTPException(status_code=400, detail="Configurações de SMTP não definidas para esta empresa.")
        
    if not payload.to_emails:
        raise HTTPException(status_code=400, detail="Nenhum destinatário informado para o e-mail.")
        
    attachments = []
    
    if payload.attach_invoice:
        # Check if tied to ServiceOrder to get PDF
        order = None
        if trans.description and "OS #" in trans.description:
            import re
            match = re.search(r'OS #(\d+)', trans.description)
            if match:
                order_id = int(match.group(1))
                from app.models.service import ServiceOrder
                order = db.query(ServiceOrder).filter(
                    ServiceOrder.id == order_id,
                    ServiceOrder.company_id == cid
                ).first()
                
        if order and order.invoice_pdf_url:
            local_path_suffix = order.invoice_pdf_url.replace("/uploads/", "", 1)
            from app.api.upload import UPLOADS_DIR
            local_pdf_path = UPLOADS_DIR / local_path_suffix
            
            if local_pdf_path.exists():
                with open(local_pdf_path, "rb") as f:
                    pdf_content = f.read()
                attachments.append({
                    "filename": f"Nota_Fiscal_OS_{order.local_id}.pdf",
                    "content": pdf_content,
                    "maintype": "application",
                    "subtype": "pdf"
                })
                
    if payload.attach_boletos:
        from app.integrators.inter_client import BancoInterClient
        inter_client = None
        if settings.inter_enabled and ((settings.inter_cert_path and settings.inter_key_path) or (settings.inter_cert_content and settings.inter_key_content)):
            inter_client = BancoInterClient(
                client_id=settings.inter_client_id,
                client_secret=settings.inter_client_secret,
                cert_path=settings.inter_cert_path,
                key_path=settings.inter_key_path,
                cert_content=settings.inter_cert_content,
                key_content=settings.inter_key_content,
                sandbox=settings.inter_sandbox,
                api_version=settings.inter_api_version
            )
            
        for inst in trans.installments:
            if inst.bank_slip_nosso_numero and inter_client:
                try:
                    nosso_numero = inst.bank_slip_nosso_numero
                    if nosso_numero.startswith("V3_REQ|"):
                        _, codigo_solicitacao, _ = nosso_numero.split("|")
                        target_id = codigo_solicitacao
                    else:
                        target_id = nosso_numero
                        
                    pdf_base64 = inter_client.get_boleto_pdf(target_id)
                    if pdf_base64:
                        pdf_bytes = base64.b64decode(pdf_base64)
                        attachments.append({
                            "filename": f"Boleto_Parc_{inst.number}.pdf",
                            "content": pdf_bytes,
                            "maintype": "application",
                            "subtype": "pdf"
                        })
                except Exception as e:
                    print(f"Erro ao baixar boleto da parcela {inst.id}: {str(e)}")
                    pass
                    
    try:
        html_body = payload.body.replace('\n', '<br>')
        send_smtp_email(
            smtp_host=settings.smtp_host,
            smtp_port=settings.smtp_port,
            smtp_username=settings.smtp_username,
            smtp_password=settings.smtp_password,
            smtp_from=settings.smtp_from_email or settings.smtp_username,
            to_email=payload.to_emails,
            subject=payload.subject,
            html_content=html_body,
            use_ssl=settings.smtp_use_ssl,
            bcc_email=settings.smtp_bcc_email,
            attachments=attachments
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro no envio de e-mail: {str(e)}")
        
    from datetime import datetime
    import copy
    
    now = datetime.utcnow()
    trans.email_sent_at = now
    
    current_logs = copy.deepcopy(trans.email_logs) if trans.email_logs else []
    current_logs.append({
        "sent_at": now.isoformat(),
        "to": payload.to_emails,
        "subject": payload.subject,
        "user": current_user.name
    })
    trans.email_logs = current_logs
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        # We don't fail the request if just the DB update fails, since the email was sent successfully.
        
    return {"message": "E-mail enviado com sucesso", "attachments_count": len(attachments)}

@router.patch("/financial/generic_installments/{inst_id}/pay")
def pay_generic_installment(
    inst_id: int, 
    pay_data: FinancialInstallmentUpdate,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    cid = get_company_id(current_user)
    
    inst = db.query(FinancialInstallment).join(FinancialTransaction).filter(
        FinancialInstallment.id == inst_id,
        FinancialTransaction.company_id == cid
    ).first()
    
    if not inst: raise HTTPException(status_code=404, detail="Parcela não encontrada.")
    trans = inst.transaction
    
    if inst.status == "PAID": raise HTTPException(status_code=400, detail="Esta parcela já está baixada.")
    if not pay_data.account_id: raise HTTPException(status_code=400, detail="Selecione conta bancária para baixa.")

    account = db.query(FinancialAccount).filter(FinancialAccount.id == pay_data.account_id, FinancialAccount.company_id == cid).first()
    if not account: raise HTTPException(status_code=404, detail="Conta não encontrada")

    inst.status = "PAID"
    inst.account_id = account.id
    inst.payment_date = pay_data.payment_date or inst.payment_date
    if pay_data.amount is not None:
        inst.amount = pay_data.amount
        
    inst.is_conciliated = False
    
    if pay_data.category_id:
        trans.category_id = pay_data.category_id
    
    if trans.transaction_status == "PROSPECCAO": trans.transaction_status = "CONFIRMADO"
    db.commit()
    return {"message": "Baixa realizada (Aguardando Conciliação)!"}

@router.patch("/financial/generic_installments/{inst_id}/conciliate")
def conciliate_generic_installment(
    inst_id: int, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    cid = get_company_id(current_user)
    inst = db.query(FinancialInstallment).join(FinancialTransaction).filter(
        FinancialInstallment.id == inst_id,
        FinancialTransaction.company_id == cid
    ).first()
    
    if not inst: raise HTTPException(status_code=404)
    if inst.status != "PAID": raise HTTPException(status_code=400, detail="A parcela precisa estar baixada (PAID).")
    if inst.is_conciliated: raise HTTPException(status_code=400, detail="Parcela já está conciliada.")
    if not inst.account_id: raise HTTPException(status_code=400, detail="Parcela sem conta destino.")

    trans = inst.transaction
    account = db.query(FinancialAccount).filter(FinancialAccount.id == inst.account_id).first()
    amount = inst.amount
    move_type = "+" if trans.type == "RECEIVABLE" else "-"
    desc = f"Baixa de: {trans.description} (Parc {inst.number})"
    
    if account.type == "CREDIT_CARD" and move_type == "-":
        account.current_balance -= amount
        inv_dt = inst.payment_date or datetime.now()
        cur_day = inv_dt.day
        if cur_day <= (account.closing_day or 10):
            target_month = inv_dt.month
            target_year = inv_dt.year
        else:
            target_month = inv_dt.month + 1 if inv_dt.month < 12 else 1
            target_year = inv_dt.year if inv_dt.month < 12 else inv_dt.year + 1
            
        import calendar
        due_day = account.due_day or 20
        max_day = calendar.monthrange(target_year, target_month)[1]
        t_due_date = datetime(target_year, target_month, min(due_day, max_day)).date()
        
        fatura_name = f"Fatura {account.name} - {target_month:02d}/{target_year}"
        
        ex_trans = db.query(FinancialTransaction).filter(
            FinancialTransaction.company_id == cid,
            FinancialTransaction.description == fatura_name,
            FinancialTransaction.type == "PAYABLE"
        ).first()
        
        if ex_trans:
            fat_inst = db.query(FinancialInstallment).filter(FinancialInstallment.transaction_id == ex_trans.id).first()
            if fat_inst:
                fat_inst.amount += amount
                ex_trans.total_amount += amount
        else:
            cat_id = trans.category_id
            new_fat = FinancialTransaction(
                company_id=cid, description=fatura_name, category_id=cat_id,
                type="PAYABLE", transaction_status="CONFIRMADO", is_fixed=False,
                total_amount=amount, issue_date=inv_dt.date(), first_due_date=t_due_date,
                customer_id=trans.customer_id, account_id=account.id
            )
            db.add(new_fat)
            db.flush()
            
            fat_inst = FinancialInstallment(transaction_id=new_fat.id, number=1, due_date=t_due_date, amount=amount, status="PENDING")
            db.add(fat_inst)
    else:
        if move_type == "+": account.current_balance += amount
        else: account.current_balance -= amount
            
    m_date = inst.payment_date.date() if inst.payment_date else datetime.now().date()
            
    log = FinancialCashFlowLog(
        account_id=account.id,
        installment_id=inst.id,
        description=desc,
        movement_type=move_type,
        amount=amount,
        progressive_balance=account.current_balance,
        movement_date=m_date
    )
    db.add(log)
    
    inst.is_conciliated = True
    inst.conciliated_at = datetime.now()
    db.commit()
    return {"message": "Parcela fechada e conciliada oficial!"}

@router.post("/financial/generic_installments/bulk_conciliate")
def bulk_conciliate_generic_installments(
    data: FinancialBulkConciliate,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    cid = get_company_id(current_user)
    installments = db.query(FinancialInstallment).join(FinancialTransaction).filter(
        FinancialInstallment.id.in_(data.installment_ids),
        FinancialTransaction.company_id == cid,
        FinancialInstallment.status == "PAID",
        FinancialInstallment.is_conciliated == False,
        FinancialInstallment.account_id.isnot(None)
    ).all()
    
    if not installments:
        raise HTTPException(status_code=400, detail="Nenhuma parcela válida encontrada para conciliação.")

    for inst in installments:
        trans = inst.transaction
        account = db.query(FinancialAccount).filter(FinancialAccount.id == inst.account_id).first()
        if not account: continue
        
        amount = inst.amount
        move_type = "+" if trans.type == "RECEIVABLE" else "-"
        desc = f"Baixa de: {trans.description} (Parc {inst.number})"
        
        if account.type == "CREDIT_CARD" and move_type == "-":
            account.current_balance -= amount
            inv_dt = inst.payment_date or datetime.now()
            cur_day = inv_dt.day
            if cur_day <= (account.closing_day or 10):
                target_month = inv_dt.month
                target_year = inv_dt.year
            else:
                target_month = inv_dt.month + 1 if inv_dt.month < 12 else 1
                target_year = inv_dt.year if inv_dt.month < 12 else inv_dt.year + 1
                
            import calendar
            due_day = account.due_day or 20
            max_day = calendar.monthrange(target_year, target_month)[1]
            t_due_date = datetime(target_year, target_month, min(due_day, max_day)).date()
            
            fatura_name = f"Fatura {account.name} - {target_month:02d}/{target_year}"
            
            ex_trans = db.query(FinancialTransaction).filter(
                FinancialTransaction.company_id == cid,
                FinancialTransaction.description == fatura_name,
                FinancialTransaction.type == "PAYABLE"
            ).first()
            
            if ex_trans:
                fat_inst = db.query(FinancialInstallment).filter(FinancialInstallment.transaction_id == ex_trans.id).first()
                if fat_inst:
                    fat_inst.amount += amount
                    ex_trans.total_amount += amount
            else:
                cat_id = trans.category_id
                new_fat = FinancialTransaction(
                    company_id=cid, description=fatura_name, category_id=cat_id,
                    type="PAYABLE", transaction_status="CONFIRMADO", is_fixed=False,
                    total_amount=amount, issue_date=inv_dt.date(), first_due_date=t_due_date,
                    customer_id=trans.customer_id, account_id=account.id
                )
                db.add(new_fat)
                db.flush()
                
                fat_inst = FinancialInstallment(transaction_id=new_fat.id, number=1, due_date=t_due_date, amount=amount, status="PENDING")
                db.add(fat_inst)
        else:
            if move_type == "+": account.current_balance += amount
            else: account.current_balance -= amount
                
        m_date = inst.payment_date.date() if inst.payment_date else datetime.now().date()
        log = FinancialCashFlowLog(
            account_id=account.id, installment_id=inst.id, description=desc,
            movement_type=move_type, amount=amount, progressive_balance=account.current_balance,
            movement_date=m_date
        )
        db.add(log)
        
        inst.is_conciliated = True
        inst.conciliated_at = datetime.now()

    db.commit()
    return {"message": f"{len(installments)} parcelas conciliadas em lote com sucesso!"}

@router.patch("/financial/generic_installments/{inst_id}/revert_conciliation")
def revert_conciliation_generic_installment(
    inst_id: int, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    cid = get_company_id(current_user)
    inst = db.query(FinancialInstallment).join(FinancialTransaction).filter(
        FinancialInstallment.id == inst_id,
        FinancialTransaction.company_id == cid
    ).first()
    
    if not inst: raise HTTPException(status_code=404)
    if not inst.is_conciliated: raise HTTPException(status_code=400, detail="Parcela não está conciliada!")
    
    trans = inst.transaction
    account = db.query(FinancialAccount).filter(FinancialAccount.id == inst.account_id).first()
    amount = inst.amount
    move_type = "+" if trans.type == "RECEIVABLE" else "-"
    
    if account.type == "CREDIT_CARD" and move_type == "-":
        account.current_balance += amount
    else:
        if move_type == "+": account.current_balance -= amount
        else: account.current_balance += amount
        
    log = db.query(FinancialCashFlowLog).filter(FinancialCashFlowLog.installment_id == inst.id).first()
    if log: db.delete(log)
    
    inst.is_conciliated = False
    inst.conciliated_at = None
    inst.status = "PENDING"
    inst.payment_date = None
    inst.account_id = None
    db.commit()
    return {"message": "Conciliação desfeita! A parcela foi estornada e voltou para o Contas a Pagar/Receber original."}

@router.patch("/financial/generic_installments/{inst_id}/edit_payment")
def edit_payment_generic_installment(
    inst_id: int, 
    pay_data: FinancialInstallmentUpdate,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    cid = get_company_id(current_user)
    inst = db.query(FinancialInstallment).join(FinancialTransaction).filter(
        FinancialInstallment.id == inst_id,
        FinancialTransaction.company_id == cid
    ).first()
    
    if not inst: raise HTTPException(status_code=404)
    if inst.is_conciliated: raise HTTPException(status_code=400, detail="Impossível editar. A parcela já foi conciliada.")
    
    fields = pay_data.model_fields_set
    
    if "status" in fields:
        inst.status = pay_data.status
        if pay_data.status == "PENDING":
            inst.payment_date = None
            inst.account_id = None
            
    if "account_id" in fields:
        inst.account_id = pay_data.account_id
        
    if "payment_date" in fields:
        inst.payment_date = pay_data.payment_date
        
    if "category_id" in fields:
        trans = inst.transaction
        trans.category_id = pay_data.category_id

    if "exclude_from_reports" in fields:
        inst.exclude_from_reports = bool(pay_data.exclude_from_reports)

    db.commit()
    return {"message": "Lançamento editado com sucesso!"}

@router.get("/financial/cashflow")
def get_cashflow_projection(
    include_personal: bool = Query(False),
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    cid = get_company_id(current_user)
    from dateutil.relativedelta import relativedelta
    import calendar
    
    today = datetime.now().date()
    start_date = today.replace(day=1)
    end_date = start_date + relativedelta(months=6)
    
    q = db.query(FinancialInstallment, FinancialTransaction).join(
        FinancialTransaction, FinancialInstallment.transaction_id == FinancialTransaction.id
    )

    if not include_personal:
        q = q.outerjoin(FinancialAccount, FinancialInstallment.account_id == FinancialAccount.id)\
             .filter(
                 (FinancialAccount.id == None) | (FinancialAccount.is_personal == False),
                 FinancialTransaction.exclude_from_reports == False,
                 FinancialInstallment.exclude_from_reports == False
             )

    query = q.filter(
        FinancialTransaction.company_id == cid,
        FinancialInstallment.due_date >= start_date, FinancialInstallment.due_date < end_date,
        FinancialTransaction.transaction_status != 'CANCELADO'
    ).all()
    
    months_map = {}
    for i in range(6):
        m = start_date + relativedelta(months=i)
        key = m.strftime("%Y-%m")
        label = f"{calendar.month_abbr[m.month].capitalize()}/{m.strftime('%y')}"
        months_map[key] = {"name": label, "Receitas": 0.0, "Despesas": 0.0, "Prospeccoes": 0.0}
        
    for inst, trans in query:
        m_key = inst.due_date.strftime("%Y-%m")
        if m_key in months_map:
            if trans.type == "RECEIVABLE": months_map[m_key]["Receitas"] += inst.amount
            elif trans.type == "PAYABLE":
                if trans.transaction_status == "PROSPECCAO": months_map[m_key]["Prospeccoes"] += inst.amount
                else: months_map[m_key]["Despesas"] += inst.amount
                    
    result = list(months_map.values())
    for metric in result:
        metric["Saldo"] = metric["Receitas"] - metric["Despesas"]
        metric["Saldo com Prosp."] = metric["Saldo"] - metric["Prospeccoes"]
        
    return result

# --- ACCOUNTS API ---
@router.get("/financial/accounts", response_model=List[FinancialAccountSchema])
def list_accounts(
    active_only: bool = Query(False),
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    cid = get_company_id(current_user)
    query = db.query(FinancialAccount).filter(FinancialAccount.company_id == cid)
    if active_only:
        query = query.filter(FinancialAccount.active == True)
    return query.all()

@router.post("/financial/accounts", response_model=FinancialAccountSchema)
def create_account(account: FinancialAccountCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cid = get_company_id(current_user)
    db_acc = FinancialAccount(
        company_id=cid, name=account.name, type=account.type, 
        initial_balance=account.initial_balance, current_balance=account.initial_balance,
        closing_day=account.closing_day, due_day=account.due_day,
        is_personal=getattr(account, 'is_personal', False),
        active=account.active
    )
    db.add(db_acc)
    db.commit()
    db.refresh(db_acc)
    return db_acc

@router.get("/financial/accounts/{acc_id}/previous_balance")
def get_previous_balance(
    acc_id: int, 
    date: str, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    cid = get_company_id(current_user)
    acc = db.query(FinancialAccount).filter(FinancialAccount.id == acc_id, FinancialAccount.company_id == cid).first()
    if not acc: raise HTTPException(status_code=404, detail="Conta não existe")
    
    try:
        target_date = datetime.strptime(date, "%Y-%m-%d").date()
    except:
        return {"previous_balance": acc.initial_balance}
        
    # Retroactive Tally Algorithm:
    # Saldo Inicial = Current Balance - SUM(all conciliated movements ON or AFTER target_date)
    # This guarantees the progressive math in the frontend extrato will ALWAYS end perfectly on the current_balance.
    future_installments = db.query(FinancialInstallment).filter(
        FinancialInstallment.account_id == acc_id,
        FinancialInstallment.is_conciliated == True,
        FinancialInstallment.payment_date >= target_date
    ).all()
    
    future_sum = sum(
        (inst.amount if inst.type == 'RECEIVABLE' else -inst.amount) 
        for inst in future_installments
    )
    
    calc_previous_balance = acc.current_balance - future_sum
    
    return {"previous_balance": round(calc_previous_balance, 2)}

@router.get("/financial/accounts/{acc_id}/statement", response_model=List[FinancialCashFlowLogSchema])
def get_statement(
    acc_id: int, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    cid = get_company_id(current_user)
    acc = db.query(FinancialAccount).filter(FinancialAccount.id == acc_id, FinancialAccount.company_id == cid).first()
    if not acc: raise HTTPException(status_code=404, detail="Conta não existe")
    
    query = db.query(FinancialCashFlowLog).filter(FinancialCashFlowLog.account_id == acc_id)
    if start_date:
        try:
            query = query.filter(FinancialCashFlowLog.movement_date >= datetime.strptime(start_date, "%Y-%m-%d").date())
        except: pass
    if end_date:
        try:
            query = query.filter(FinancialCashFlowLog.movement_date <= datetime.strptime(end_date, "%Y-%m-%d").date())
        except: pass
        
    return query.order_by(FinancialCashFlowLog.movement_date.desc(), FinancialCashFlowLog.id.desc()).limit(300).all()

@router.patch("/financial/accounts/{acc_id}")
def update_account(acc_id: int, account: FinancialAccountUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cid = get_company_id(current_user)
    acc = db.query(FinancialAccount).filter(FinancialAccount.id == acc_id, FinancialAccount.company_id == cid).first()
    if not acc: raise HTTPException(status_code=404, detail="Conta não existe")
    
    if account.name is not None:
        acc.name = account.name
    if account.closing_day is not None:
        acc.closing_day = account.closing_day
    if account.due_day is not None:
        acc.due_day = account.due_day
    if account.is_personal is not None:
        acc.is_personal = account.is_personal
    if account.active is not None:
        acc.active = account.active
        
    if account.current_balance is not None and account.current_balance != acc.current_balance:
        difference = account.current_balance - acc.current_balance
        move_type = "+" if difference > 0 else "-"
        abs_diff = abs(difference)
        desc = account.adjustment_description or "Ajuste manual de saldo"
        
        # Create category if missing
        cat = db.query(FinancialCategory).filter(FinancialCategory.company_id == cid, FinancialCategory.name == "Ajuste de Saldo Manual").first()
        if not cat:
            cat = FinancialCategory(company_id=cid, name="Ajuste de Saldo Manual", type="RECEIVABLE" if move_type == "+" else "PAYABLE", is_system=True)
            db.add(cat)
            db.flush()
            
        acc.current_balance = account.current_balance
        
        log = FinancialCashFlowLog(
            account_id=acc.id, description=desc, movement_type=move_type,
            amount=abs_diff, progressive_balance=acc.current_balance
        )
        db.add(log)
        
    db.commit()
    return {"message": "Account updated"}

@router.delete("/financial/accounts/{acc_id}")
def delete_account(acc_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cid = get_company_id(current_user)
    acc = db.query(FinancialAccount).filter(FinancialAccount.id == acc_id, FinancialAccount.company_id == cid).first()
    if not acc: raise HTTPException(status_code=404)
    
    has_logs = db.query(FinancialCashFlowLog).filter(FinancialCashFlowLog.account_id == acc_id).first()
    has_installments = db.query(FinancialInstallment).filter(FinancialInstallment.account_id == acc_id).first()
    
    if has_logs or has_installments:
        raise HTTPException(status_code=400, detail="Não é possível excluir a conta pois já existem históricos ou parcelas vinculadas a ela.")
        
    db.delete(acc)
    db.commit()
    return {"message": "Deleted"}

@router.post("/financial/accounts/transfer")
def transfer_account(data: BankTransferRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cid = get_company_id(current_user)
    if data.amount <= 0: raise HTTPException(status_code=400, detail="Valor deve ser maior que zero.")
    if data.source_account_id == data.destination_account_id: raise HTTPException(status_code=400, detail="As contas de origem e destino devem ser diferentes.")
    
    src = db.query(FinancialAccount).filter(FinancialAccount.id == data.source_account_id, FinancialAccount.company_id == cid).first()
    dst = db.query(FinancialAccount).filter(FinancialAccount.id == data.destination_account_id, FinancialAccount.company_id == cid).first()
    
    if not src or not dst: raise HTTPException(status_code=404, detail="Conta(s) não encontrada(s).")
    
    # Create or find "Transferência entre Contas" categories
    cat_out = db.query(FinancialCategory).filter(FinancialCategory.company_id == cid, FinancialCategory.name == "Transferência entre Contas", FinancialCategory.type == "PAYABLE").first()
    if not cat_out:
        cat_out = FinancialCategory(company_id=cid, name="Transferência entre Contas", type="PAYABLE", is_system=True)
        db.add(cat_out)
    
    cat_in = db.query(FinancialCategory).filter(FinancialCategory.company_id == cid, FinancialCategory.name == "Transferência entre Contas", FinancialCategory.type == "RECEIVABLE").first()
    if not cat_in:
        cat_in = FinancialCategory(company_id=cid, name="Transferência entre Contas", type="RECEIVABLE", is_system=True)
        db.add(cat_in)
    
    db.flush()
    
    # Source Transaction (PAYABLE)
    t_out = FinancialTransaction(
        company_id=cid, description=data.description, category_id=cat_out.id, type="PAYABLE",
        transaction_status="CONFIRMADO", is_fixed=False, total_amount=data.amount, issue_date=data.transfer_date,
        first_due_date=data.transfer_date
    )
    db.add(t_out)
    db.flush()
    
    i_out = FinancialInstallment(
        transaction_id=t_out.id, number=1, due_date=data.transfer_date, amount=data.amount, status="PAID",
        account_id=src.id, payment_date=datetime.now(), is_conciliated=True, conciliated_at=datetime.now()
    )
    db.add(i_out)
    
    src.current_balance -= data.amount
    log_out = FinancialCashFlowLog(
        account_id=src.id, installment_id=i_out.id, description=f"Transf. p/ {dst.name}",
        movement_type="-", amount=data.amount, progressive_balance=src.current_balance,
        movement_date=datetime.now().date()
    )
    db.add(log_out)
    
    # Destination Transaction (RECEIVABLE)
    t_in = FinancialTransaction(
        company_id=cid, description=data.description, category_id=cat_in.id, type="RECEIVABLE",
        transaction_status="CONFIRMADO", is_fixed=False, total_amount=data.amount, issue_date=data.transfer_date,
        first_due_date=data.transfer_date
    )
    db.add(t_in)
    db.flush()
    
    i_in = FinancialInstallment(
        transaction_id=t_in.id, number=1, due_date=data.transfer_date, amount=data.amount, status="PAID",
        account_id=dst.id, payment_date=datetime.now(), is_conciliated=True, conciliated_at=datetime.now()
    )
    db.add(i_in)
    
    dst.current_balance += data.amount
    log_in = FinancialCashFlowLog(
        account_id=dst.id, installment_id=i_in.id, description=f"Transf. de {src.name}",
        movement_type="+", amount=data.amount, progressive_balance=dst.current_balance,
        movement_date=datetime.now().date()
    )
    db.add(log_in)
    
    db.commit()
    return {"message": "Transferência realizada com sucesso!"}

@router.delete("/financial/installments/{inst_id}")
def delete_installment(
    inst_id: int, 
    delete_future: bool = Query(False),
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    cid = get_company_id(current_user)
    
    inst = db.query(FinancialInstallment).join(FinancialTransaction).filter(
        FinancialInstallment.id == inst_id,
        FinancialTransaction.company_id == cid
    ).first()
    
    if not inst:
        raise HTTPException(status_code=404, detail="Parcela não encontrada.")
        
    if inst.is_conciliated or inst.status == 'PAID':
        raise HTTPException(status_code=400, detail="Não é possível excluir parcelas pagas ou conciliadas. Estorne o pagamento primeiro.")
        
    trans_id = inst.transaction_id
    
    if delete_future:
        # Deleta a parcela atual e todas as futuras associadas à mesma transação que ainda estão pendentes
        db.query(FinancialInstallment).filter(
            FinancialInstallment.transaction_id == trans_id,
            FinancialInstallment.due_date >= inst.due_date,
            FinancialInstallment.status == 'PENDING'
        ).delete()
    else:
        db.delete(inst)
        
    # Se a transação ficar sem parcelas, apagar a transação também
    remaining = db.query(FinancialInstallment).filter(FinancialInstallment.transaction_id == trans_id).count()
    if remaining == 0:
        trans = db.query(FinancialTransaction).filter(FinancialTransaction.id == trans_id).first()
        if trans: db.delete(trans)
        
    db.commit()
    return {"message": "Deletado com sucesso"}

@router.patch("/financial/transactions/{transaction_id}")
def edit_financial_transaction(
    transaction_id: int,
    data: FinancialTransactionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    cid = get_company_id(current_user)
    trans = db.query(FinancialTransaction).filter(
        FinancialTransaction.id == transaction_id,
        FinancialTransaction.company_id == cid
    ).first()
    if not trans:
        raise HTTPException(status_code=404, detail="Transação não encontrada")
        
    if data.description is not None: trans.description = data.description
    if data.category_id is not None: trans.category_id = data.category_id
    if data.customer_id is not None: trans.customer_id = data.customer_id
    
    db.commit()
    return {"message": "Transação atualizada"}

@router.patch("/financial/installments/bulk-update-date")
def bulk_update_installment_dates(
    payload: FinancialBulkUpdateDateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    cid = get_company_id(current_user)
    installments = db.query(FinancialInstallment).join(FinancialTransaction).filter(
        FinancialInstallment.id.in_(payload.installment_ids),
        FinancialTransaction.company_id == cid,
        FinancialInstallment.status.notin_(["PAID", "CANCELLED"])
    ).all()
    
    if not installments:
        raise HTTPException(status_code=400, detail="Nenhuma parcela pendente encontrada para atualização.")
        
    # Validar se alguma parcela possui boleto ativo
    installments_with_slips = [
        inst for inst in installments 
        if inst.bank_slip_nosso_numero and inst.bank_slip_nosso_numero.strip()
    ]
    if installments_with_slips:
        ids_str = ", ".join([f"#{inst.id}" for inst in installments_with_slips])
        raise HTTPException(
            status_code=400, 
            detail=f"Não é possível alterar o vencimento das parcelas {ids_str} porque elas possuem boleto emitido ativo. Cancele os boletos antes de prosseguir."
        )
        
    for inst in installments:
        inst.due_date = payload.due_date
        
    db.commit()
    return {"message": f"Data de {len(installments)} parcelas atualizada com sucesso."}

@router.patch("/financial/installments/{installment_id}/edit")
def edit_financial_installment(
    installment_id: int,
    data: FinancialInstallmentEdit,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    cid = get_company_id(current_user)
    inst = db.query(FinancialInstallment).join(FinancialTransaction).filter(
        FinancialInstallment.id == installment_id,
        FinancialTransaction.company_id == cid
    ).first()
    if not inst:
        raise HTTPException(status_code=404, detail="Parcela não encontrada")
    
    if inst.status == 'PAID':
        raise HTTPException(status_code=400, detail="Não é possível editar uma parcela paga")
        
    if data.due_date is not None:
        if inst.bank_slip_nosso_numero and inst.bank_slip_nosso_numero.strip():
            raise HTTPException(
                status_code=400, 
                detail="Não é possível alterar o vencimento desta parcela pois ela possui boleto emitido ativo. Cancele o boleto primeiro."
            )
        inst.due_date = data.due_date
        
    if data.amount is not None:
        if inst.bank_slip_nosso_numero and inst.bank_slip_nosso_numero.strip():
            raise HTTPException(
                status_code=400, 
                detail="Não é possível alterar o valor desta parcela pois ela possui boleto emitido ativo. Cancele o boleto primeiro."
            )
        inst.amount = data.amount
    
    # Recalculate transaction total
    total = sum([i.amount for i in inst.transaction.installments])
    inst.transaction.total_amount = total
    
    db.commit()
    return {"message": "Parcela atualizada"}

@router.post("/financial/installments/{inst_id}/issue-inter-slip")
def issue_inter_slip(
    inst_id: int, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    cid = get_company_id(current_user)
    
    from app.models.financial import FinancialInstallment, FinancialTransaction
    from app.models.company_settings import CompanySettings
    from app.models.customer import Customer, Address
    from app.models.company import Company
    from app.integrators.inter_client import BancoInterClient
    
    installment = db.query(FinancialInstallment).join(FinancialTransaction).filter(
        FinancialInstallment.id == inst_id,
        FinancialTransaction.company_id == cid
    ).first()
    
    if not installment:
        raise HTTPException(status_code=404, detail="Parcela não encontrada.")
        
    if installment.bank_slip_nosso_numero or installment.bank_slip_pdf_url:
        raise HTTPException(status_code=400, detail="Boleto já emitido para esta parcela.")
    
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == cid).first()
    if not settings or not settings.inter_enabled:
        raise HTTPException(status_code=400, detail="Banco Inter não está ativado ou configurado para esta empresa.")
        
    if not settings.inter_client_id or not settings.inter_client_secret or not ((settings.inter_cert_path and settings.inter_key_path) or (settings.inter_cert_content and settings.inter_key_content)):
        raise HTTPException(status_code=400, detail="Credenciais ou certificados do Banco Inter ausentes.")

    customer = db.query(Customer).filter(Customer.id == installment.transaction.customer_id).first()
    if not customer:
        raise HTTPException(status_code=400, detail="Esta parcela não possui um cliente atrelado (Necessário para emissão do boleto Inter).")
        
    inter_client = BancoInterClient(
        client_id=settings.inter_client_id,
        client_secret=settings.inter_client_secret,
        cert_path=settings.inter_cert_path,
        key_path=settings.inter_key_path,
        cert_content=settings.inter_cert_content,
        key_content=settings.inter_key_content,
        sandbox=settings.inter_sandbox,
        account_number=settings.inter_account_number,
        api_version=settings.inter_api_version
    )
    
    inst_data = {
        "id": installment.id,
        "amount": float(installment.amount),
        "due_date": installment.due_date
    }
    
    if installment.transaction.description and "OS #" in installment.transaction.description:
        import re
        match = re.search(r'OS #(\d+)', installment.transaction.description)
        if match:
            order_id = int(match.group(1))
            from app.models.service import ServiceOrder
            from app.models.nfse import NFSeQueue
            order = db.query(ServiceOrder).filter(ServiceOrder.id == order_id, ServiceOrder.company_id == cid).first()
            if order:
                nfse_q = db.query(NFSeQueue).filter(NFSeQueue.service_order_id == order.id).order_by(NFSeQueue.created_at.desc()).first()
                if nfse_q and nfse_q.xml_protocol_id:
                    inst_data["mensagem"] = {
                        "linha1": f"Referente a O.S #{order.id}",
                        "linha2": f"NFS-e Nº {nfse_q.xml_protocol_id}"
                    }
    
    addr = customer.addresses[0] if customer.addresses else None
    customer_data = {
        "name": customer.name,
        "document": customer.document,
        "address": addr.street if addr else "Nao Informado",
        "number": addr.number if addr else "S/N",
        "neighborhood": addr.neighborhood if addr else "Nao Informado",
        "city": addr.city if addr else "Cidade",
        "uf": addr.state if addr else "SP",
        "zipcode": addr.zip_code if addr else "00000000"
    }
    
    if not customer_data["document"]:
        raise HTTPException(status_code=400, detail="O Cliente da transação não possui CPF/CNPJ cadastrado.")
    
    try:
        boleto_data = inter_client.emit_boleto(installment_data=inst_data, customer_data=customer_data)
        
        installment.bank_slip_provider = "INTER"
        
        if settings.inter_api_version == "V3":
            codigo_solicitacao = boleto_data.get("codigoSolicitacao")
            nosso_numero = inter_client.find_nosso_numero_v3(codigo_solicitacao=codigo_solicitacao, timeout=4)
            if nosso_numero:
                installment.bank_slip_nosso_numero = f"V3_REQ|{codigo_solicitacao}|{nosso_numero}"
                # Puxar boleto dnv para pegar linha digitavel? Na V3 teríamos q pegar via webhook ou webhook_polling, mas vamos seguir a vida com NossoNumero
            else:
                # Still processing
                installment.status = "PROCESSING"
                # Keep tracking ID just in case
                installment.bank_slip_nosso_numero = f"V3_REQ|{codigo_solicitacao}"
        else:
            installment.bank_slip_nosso_numero = boleto_data.get("nossoNumero")
            installment.bank_slip_codigo_barras = boleto_data.get("codigoBarras")
            installment.bank_slip_linha_digitavel = boleto_data.get("linhaDigitavel")
            
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao emitir boleto no Inter: {str(e)}")
        
    return {"message": "Boleto emitido com sucesso!", "boleto": boleto_data}


@router.post("/orders/{order_id}/issue-inter-slip")
def issue_inter_slip_for_order(
    order_id: int, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    cid = get_company_id(current_user)
    
    from app.models.order import Order
    from app.models.financial import FinancialTransaction, FinancialInstallment
    
    order = db.query(Order).filter(Order.id == order_id, Order.company_id == cid).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
        
    transaction = db.query(FinancialTransaction).filter(FinancialTransaction.order_id == order.id).first()
    if not transaction:
        from datetime import datetime, timedelta, timezone
        transaction = FinancialTransaction(
            company_id=cid,
            order_id=order.id,
            customer_id=order.customer_id,
            type="RECEIVABLE",
            description=f"Faturamento Receita Pedido #{order.id}",
            total_amount=order.total,
            status="CONFIRMADO",
            created_at=datetime.now(timezone.utc)
        )
        db.add(transaction)
        db.flush()
        
        installment = FinancialInstallment(
            transaction_id=transaction.id,
            number=1,
            amount=order.total,
            due_date=datetime.now(timezone.utc).date() + timedelta(days=3),
            status="PENDING",
            provider="BANCO_INTER"
        )
        db.add(installment)
        db.commit()
    else:
        installment = db.query(FinancialInstallment).filter(FinancialInstallment.transaction_id == transaction.id, FinancialInstallment.status == "PENDING").first()
        if not installment:
            raise HTTPException(status_code=400, detail="Todas as parcelas deste pedido já estão pagas ou canceladas.")
    
    # We call the existing logic
    return issue_inter_slip(inst_id=installment.id, db=db, current_user=current_user)


@router.post("/service-orders/{order_id}/issue-inter-slip")
def issue_inter_slip_for_service_order(
    order_id: int, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    cid = get_company_id(current_user)
    
    from app.models.service_order import ServiceOrder
    from app.models.financial import FinancialTransaction, FinancialInstallment
    
    order = db.query(ServiceOrder).filter(ServiceOrder.id == order_id, ServiceOrder.company_id == cid).first()
    if not order:
        raise HTTPException(status_code=404, detail="OS não encontrada")
        
    transaction = db.query(FinancialTransaction).filter(FinancialTransaction.service_order_id == order.id).first()
    if not transaction:
        from datetime import datetime, timedelta, timezone
        transaction = FinancialTransaction(
            company_id=cid,
            service_order_id=order.id,
            customer_id=order.customer_id,
            type="RECEIVABLE",
            description=f"Faturamento OS #{order.id}",
            total_amount=order.total,
            status="CONFIRMADO",
            created_at=datetime.now(timezone.utc)
        )
        db.add(transaction)
        db.flush()
        
        installment = FinancialInstallment(
            transaction_id=transaction.id,
            number=1,
            amount=order.total,
            due_date=datetime.now(timezone.utc).date() + timedelta(days=3),
            status="PENDING",
            provider="BANCO_INTER"
        )
        db.add(installment)
        db.commit()
    else:
        installment = db.query(FinancialInstallment).filter(FinancialInstallment.transaction_id == transaction.id, FinancialInstallment.status == "PENDING").first()
        if not installment:
            raise HTTPException(status_code=400, detail="Todas as parcelas desta O.S já estão pagas ou canceladas.")
    
    return issue_inter_slip(inst_id=installment.id, db=db, current_user=current_user)


from fastapi.responses import Response

@router.get("/financial/installments/{inst_id}/bank-slip-pdf")
def get_installment_bank_slip_pdf(inst_id: int, db: Session = Depends(get_db)):
    from app.models.financial import FinancialInstallment, FinancialTransaction
    from app.models.company_settings import CompanySettings
    from app.integrators.inter_client import BancoInterClient
    import base64
    
    installment = db.query(FinancialInstallment).join(FinancialTransaction).filter(
        FinancialInstallment.id == inst_id
    ).first()
    
    if not installment or not installment.bank_slip_nosso_numero:
        raise HTTPException(status_code=404, detail="Boleto não encontrado")
        
    cid = installment.transaction.company_id
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == cid).first()
    
    if not settings or not settings.inter_enabled:
        raise HTTPException(status_code=400, detail="Banco Inter inativo")
        
    inter_client = BancoInterClient(
        client_id=settings.inter_client_id,
        client_secret=settings.inter_client_secret,
        cert_path=settings.inter_cert_path,
        key_path=settings.inter_key_path,
        cert_content=settings.inter_cert_content,
        key_content=settings.inter_key_content,
        sandbox=settings.inter_sandbox,
        account_number=settings.inter_account_number,
        api_version=settings.inter_api_version
    )
    
    try:
        nosso_numero_final = installment.bank_slip_nosso_numero
        if nosso_numero_final.startswith("V3_REQ|"):
            parts = nosso_numero_final.split("|")
            codigo_solicitacao = parts[1]
            
            # If it doesn't have the nosso_numero resolved yet (length == 2)
            if len(parts) == 2:
                novo_nosso_numero = inter_client.find_nosso_numero_v3(codigo_solicitacao=codigo_solicitacao, timeout=2)
                if novo_nosso_numero:
                    nosso_numero_final = f"V3_REQ|{codigo_solicitacao}|{novo_nosso_numero}"
                    installment.bank_slip_nosso_numero = nosso_numero_final
                    if installment.status == "PROCESSING":
                        installment.status = "OPEN"
                    db.commit()
                else:
                    raise HTTPException(status_code=400, detail="Boleto ainda em processamento no Banco Inter (V3 BolePix). Tente novamente em alguns instantes.")
                    
            # Set target identifier for get_boleto_pdf depending on API Version
            target_id_for_pdf = codigo_solicitacao # V3 uses codigoSolicitacao
        else:
            target_id_for_pdf = nosso_numero_final # V2 uses nosso_numero
            
        base64_pdf = inter_client.get_boleto_pdf(target_id_for_pdf)
        if not base64_pdf:
            raise HTTPException(status_code=404, detail="PDF vazio retornado pelo Banco Inter")
            
        pdf_bytes = base64.b64decode(base64_pdf)
        return Response(content=pdf_bytes, media_type="application/pdf")
        
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Erro ao obter PDF do Inter: {str(e)}")


@router.post("/financial/installments/group")
def group_financial_installments(
    payload: FinancialInstallmentsGroupRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Agrupa múltiplos lançamentos / parcelas previstos do mesmo cliente/contato e mesmo tipo (RECEIVABLE ou PAYABLE).
    Consolida valores e unifica observações garantindo rastreabilidade contábil (audit trail).
    """
    if len(payload.installment_ids) < 2:
        raise HTTPException(
            status_code=400,
            detail="É necessário selecionar pelo menos duas parcelas para agrupar."
        )

    installments = db.query(FinancialInstallment).options(
        joinedload(FinancialInstallment.transaction).joinedload(FinancialTransaction.category),
        joinedload(FinancialInstallment.transaction).joinedload(FinancialTransaction.installments)
    ).join(
        FinancialTransaction, FinancialInstallment.transaction_id == FinancialTransaction.id
    ).filter(
        FinancialInstallment.id.in_(payload.installment_ids),
        FinancialTransaction.company_id == current_user.company_id
    ).all()

    if len(installments) != len(payload.installment_ids):
        raise HTTPException(status_code=404, detail="Uma ou mais parcelas não foram encontradas.")

    # 1. Validações de integridade financeira
    types = {i.transaction.type for i in installments if i.transaction}
    if len(types) > 1:
        raise HTTPException(
            status_code=400,
            detail="Não é possível agrupar receitas com despesas. Selecione apenas lançamentos do mesmo tipo."
        )

    customer_ids = {i.transaction.customer_id for i in installments if i.transaction}
    if len(customer_ids) > 1:
        raise HTTPException(
            status_code=400,
            detail="Não é possível agrupar lançamentos de clientes/fornecedores diferentes."
        )

    for inst in installments:
        if inst.status == "PAID":
            raise HTTPException(
                status_code=400,
                detail=f"A parcela #{inst.id} já está PAGA e não pode ser agrupada."
            )
        if inst.is_conciliated:
            raise HTTPException(
                status_code=400,
                detail=f"A parcela #{inst.id} já está CONCILIADA bancariamente e não pode ser agrupada."
            )
        if inst.status == "CANCELLED":
            raise HTTPException(
                status_code=400,
                detail=f"A parcela #{inst.id} já está Cancelada e não pode ser agrupada."
            )

    # 2. Determina parcela mestre
    target_inst = None
    if payload.target_installment_id:
        target_inst = next((i for i in installments if i.id == payload.target_installment_id), None)
    if not target_inst:
        sorted_inst = sorted(installments, key=lambda x: (x.due_date, x.id))
        target_inst = sorted_inst[0]

    other_inst = [i for i in installments if i.id != target_inst.id]

    # 3. Consolidação de valores
    total_amount = sum(i.amount for i in installments)

    # 4. Composição da descrição/observação
    if payload.description and payload.description.strip():
        new_description = payload.description.strip()
    else:
        desc_parts = []
        for i in installments:
            orig_desc = i.transaction.description if i.transaction else "Lançamento"
            desc_parts.append(f"Parc #{i.id} (R$ {i.amount:,.2f} - {orig_desc})")
        new_description = "Lançamento Agrupado: " + " + ".join(desc_parts)

    target_inst.amount = round(total_amount, 2)
    target_inst.due_date = payload.due_date
    if payload.account_id:
        target_inst.account_id = payload.account_id

    # Atualiza a transação mestre
    if target_inst.transaction:
        target_inst.transaction.total_amount = round(total_amount, 2)
        target_inst.transaction.first_due_date = payload.due_date
        target_inst.transaction.description = new_description
        if payload.category_id:
            target_inst.transaction.category_id = payload.category_id

    # 5. Cancela com rastreabilidade as parcelas absorvidas
    for i in other_inst:
        i.status = "CANCELLED"
        i.grouped_in_id = target_inst.id
        if i.transaction:
            tag = f"[AGRUPADO NA PARCELA #{target_inst.id}]"
            if tag not in (i.transaction.description or ""):
                i.transaction.description = f"{tag} {i.transaction.description or ''}".strip()

    db.commit()
    db.refresh(target_inst)

    return {
        "status": "success",
        "message": f"{len(installments)} lançamentos agrupados com sucesso na parcela #{target_inst.id}.",
        "target_installment_id": target_inst.id,
        "total_amount": target_inst.amount,
        "due_date": str(target_inst.due_date),
        "description": new_description
    }


def _build_cashflow_forecast_data(
    company_id: int,
    start_date: Optional[date],
    end_date: Optional[date],
    customer_id: Optional[int],
    type_filter: Optional[str],
    include_personal: bool = False,
    db: Session = None
):
    """Helper que agrupa o fluxo de caixa previsto por cliente/fornecedor com rastreabilidade."""
    from app.models.customer import Customer
    from app.models.financial import FinancialTransaction, FinancialInstallment, FinancialCategory, FinancialAccount
    from datetime import date as dt_date

    query = db.query(FinancialInstallment).options(
        joinedload(FinancialInstallment.transaction).joinedload(FinancialTransaction.category),
        joinedload(FinancialInstallment.transaction).joinedload(FinancialTransaction.customer),
        joinedload(FinancialInstallment.account)
    ).join(
        FinancialTransaction, FinancialInstallment.transaction_id == FinancialTransaction.id
    ).filter(
        FinancialTransaction.company_id == company_id,
        FinancialInstallment.status.in_(["PENDING", "OVERDUE"]),
        FinancialTransaction.transaction_status != "CANCELADO"
    )

    if not include_personal:
        query = query.outerjoin(FinancialAccount, FinancialInstallment.account_id == FinancialAccount.id)\
            .filter(
                (FinancialAccount.id == None) | (FinancialAccount.is_personal == False),
                FinancialTransaction.exclude_from_reports == False,
                FinancialInstallment.exclude_from_reports == False
            )

    if customer_id:
        query = query.filter(FinancialTransaction.customer_id == customer_id)
    if type_filter:
        query = query.filter(FinancialTransaction.type == type_filter)
    if start_date:
        query = query.filter(FinancialInstallment.due_date >= start_date)
    if end_date:
        query = query.filter(FinancialInstallment.due_date <= end_date)

    installments = query.order_by(FinancialTransaction.customer_id, FinancialInstallment.due_date.asc(), FinancialInstallment.id.asc()).all()

    customer_dict = {}
    for inst in installments:
        trans = inst.transaction
        c_id = trans.customer_id if trans else None
        key = c_id if c_id else 0

        if key not in customer_dict:
            c_name = trans.customer.name if (trans and trans.customer) else "Geral / Sem Cliente Definido"
            c_doc = trans.customer.document if (trans and trans.customer) else ""
            customer_dict[key] = {
                "customer_id": c_id,
                "customer_name": c_name,
                "customer_document": c_doc,
                "total_entradas": 0.0,
                "total_saidas": 0.0,
                "saldo_cliente": 0.0,
                "items": []
            }

        t_type = trans.type if trans else "RECEIVABLE"
        val = float(inst.amount or 0.0)

        if t_type == "RECEIVABLE":
            customer_dict[key]["total_entradas"] += val
            customer_dict[key]["saldo_cliente"] += val
        else:
            customer_dict[key]["total_saidas"] += val
            customer_dict[key]["saldo_cliente"] -= val

        cat_name = trans.category.name if (trans and trans.category) else "Sem Categoria"
        acc_name = inst.account.name if inst.account else "Padrão"
        due_str = inst.due_date.strftime("%d/%m/%Y") if inst.due_date else "-"
        desc_str = trans.description if trans else f"Parcela #{inst.id}"

        customer_dict[key]["items"].append({
            "id": inst.id,
            "type": t_type,
            "category_name": cat_name,
            "account_name": acc_name,
            "due_date": due_str,
            "amount": val,
            "status": inst.status,
            "description": desc_str
        })

    return list(customer_dict.values())


@router.get("/financial/reports/cashflow-forecast")
def get_cashflow_forecast_report(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    customer_id: Optional[int] = None,
    type_filter: Optional[str] = Query(None, alias="type"),
    include_personal: bool = Query(False, description="Incluir contas pessoais e movimentações desconsideradas"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retorna o fluxo de caixa previsto agrupado por cliente/contato para visualização em tela."""
    groups = _build_cashflow_forecast_data(
        company_id=current_user.company_id,
        start_date=start_date,
        end_date=end_date,
        customer_id=customer_id,
        type_filter=type_filter,
        include_personal=include_personal,
        db=db
    )

    grand_total_entradas = sum(g["total_entradas"] for g in groups)
    grand_total_saidas = sum(g["total_saidas"] for g in groups)
    grand_saldo_liquido = grand_total_entradas - grand_total_saidas

    return {
        "groups": groups,
        "grand_total_entradas": grand_total_entradas,
        "grand_total_saidas": grand_total_saidas,
        "grand_saldo_liquido": grand_saldo_liquido,
        "total_contacts": len(groups)
    }


@router.get("/financial/reports/cashflow-forecast/export")
def export_cashflow_forecast_report(
    format: str = Query("excel", pattern="^(excel|pdf)$"),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    customer_id: Optional[int] = None,
    type_filter: Optional[str] = Query(None, alias="type"),
    include_personal: bool = Query(False, description="Incluir contas pessoais e movimentações desconsideradas"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Exporta a projeção de fluxo de caixa por cliente em Excel (.xlsx) ou PDF (.pdf)."""
    from app.services.financial_exports import export_cashflow_forecast_excel, export_cashflow_forecast_pdf
    from app.models.company import Company

    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    company_name = company.name if company else "Cronuz"

    groups = _build_cashflow_forecast_data(
        company_id=current_user.company_id,
        start_date=start_date,
        end_date=end_date,
        customer_id=customer_id,
        type_filter=type_filter,
        include_personal=include_personal,
        db=db
    )

    period_parts = []
    if start_date:
        period_parts.append(f"De {start_date.strftime('%d/%m/%Y')}")
    if end_date:
        period_parts.append(f"Até {end_date.strftime('%d/%m/%Y')}")
    period_label = " - ".join(period_parts) if period_parts else "Todos os Lançamentos Previstos"

    now_str = datetime.now().strftime("%Y%m%d_%H%M")
    if format == "excel":
        buffer = export_cashflow_forecast_excel(
            customer_groups=groups,
            company_name=company_name,
            period_label=period_label
        )
        filename = f"Fluxo_Caixa_Previsto_Por_Cliente_{now_str}.xlsx"
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        buffer = export_cashflow_forecast_pdf(
            customer_groups=groups,
            company_name=company_name,
            period_label=period_label
        )
        filename = f"Fluxo_Caixa_Previsto_Por_Cliente_{now_str}.pdf"
        media_type = "application/pdf"

    return StreamingResponse(
        buffer,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


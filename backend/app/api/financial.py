from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime

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
    FinancialCashFlowLog as FinancialCashFlowLogSchema,
    FinancialBulkConciliate,
    FinancialTransactionUpdate, FinancialInstallmentEdit
)
from app.models.financial import FinancialCategory, FinancialTransaction, FinancialInstallment, FinancialAccount, FinancialCashFlowLog
from datetime import timedelta

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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in ["MASTER", "SELLER", "FINANCIAL"]:
        raise HTTPException(status_code=403, detail="Acesso não autorizado")
        
    cid = current_user.company_id
    
    installments = db.query(FinancialInstallment).join(FinancialTransaction).filter(
        FinancialTransaction.company_id == cid
    ).all()
    
    total_open = sum(i.amount for i in installments if i.status == "PENDING")
    total_paid = sum(i.amount for i in installments if i.status == "PAID")
    total_overdue = sum(i.amount for i in installments if i.status == "OVERDUE")
    
    return {
        "total_open": total_open,
        "total_paid": total_paid,
        "total_overdue": total_overdue
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
        total_amount=transaction.total_amount,
        issue_date=transaction.issue_date,
        first_due_date=transaction.first_due_date,
        customer_id=transaction.customer_id,
        order_id=transaction.order_id
    )
    db.add(db_trans)
    db.flush()
    
    qnt = max(1, transaction.installments_count)
    base_amount = round(transaction.total_amount / qnt, 2)
    last_amount = round(transaction.total_amount - (base_amount * (qnt - 1)), 2)
    
    for i in range(qnt):
        due = transaction.first_due_date + timedelta(days=30 * i)
        amount = last_amount if i == qnt - 1 else base_amount
        inst = FinancialInstallment(transaction_id=db_trans.id, number=i + 1, due_date=due, amount=amount, status="PENDING", account_id=transaction.account_id)
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
    account_id: Optional[int] = None,
    order_id: Optional[int] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 50
):
    cid = get_company_id(current_user)
    from app.models.customer import Customer
    query = db.query(FinancialInstallment, FinancialTransaction, FinancialCategory, Customer).join(
        FinancialTransaction, FinancialInstallment.transaction_id == FinancialTransaction.id
    ).join(FinancialCategory, FinancialTransaction.category_id == FinancialCategory.id).outerjoin(
        Customer, FinancialTransaction.customer_id == Customer.id
    )
    if cid: query = query.filter(FinancialTransaction.company_id == cid)
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
    
    items = []
    for inst, trans, cat, cust in results:
        items.append({
            "id": inst.id, "number": inst.number, "due_date": inst.due_date, "amount": inst.amount, "status": inst.status,
            "payment_date": inst.payment_date, "transaction_id": trans.id, "description": trans.description, "order_id": trans.order_id,
            "total_installments": db.query(func.count(FinancialInstallment.id)).filter(FinancialInstallment.transaction_id == trans.id).scalar(),
            "category_name": cat.name, "category_id": cat.id, "type": trans.type, "account_id": inst.account_id,
            "customer_name": cust.name if cust else None,
            "is_conciliated": inst.is_conciliated,
            "is_fixed": trans.is_fixed
        })
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size
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
    
    customer_name = db.query(Customer.name).filter(Customer.id == trans.customer_id).scalar() if trans.customer_id else None
    category_name = db.query(FinancialCategory.name).filter(FinancialCategory.id == trans.category_id).scalar()
    installments = db.query(FinancialInstallment).filter(FinancialInstallment.transaction_id == trans.id).order_by(FinancialInstallment.number.asc()).all()
    
    return {
        "id": trans.id, "description": trans.description, "type": trans.type, "total_amount": trans.total_amount,
        "is_fixed": trans.is_fixed, "created_at": trans.created_at, "customer_name": customer_name,
        "category_name": category_name, "installments": installments,
        "customer_id": trans.customer_id, "category_id": trans.category_id, "order_id": trans.order_id
    }

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
    inst.payment_date = pay_data.payment_date or datetime.now()
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
            
    log = FinancialCashFlowLog(
        account_id=account.id, installment_id=inst.id, description=desc,
        movement_type=move_type, amount=amount, progressive_balance=account.current_balance
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
                
        log = FinancialCashFlowLog(
            account_id=account.id, installment_id=inst.id, description=desc,
            movement_type=move_type, amount=amount, progressive_balance=account.current_balance
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
    
    if pay_data.account_id: inst.account_id = pay_data.account_id
    if hasattr(pay_data, 'payment_date') and pay_data.payment_date is not None: inst.payment_date = pay_data.payment_date
    if pay_data.status: inst.status = pay_data.status
    if pay_data.category_id: 
        trans = inst.transaction
        trans.category_id = pay_data.category_id

    db.commit()
    return {"message": "Lançamento editado com sucesso!"}

@router.get("/financial/cashflow")
def get_cashflow_projection(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cid = get_company_id(current_user)
    from dateutil.relativedelta import relativedelta
    import calendar
    
    today = datetime.now().date()
    start_date = today.replace(day=1)
    end_date = start_date + relativedelta(months=6)
    
    query = db.query(FinancialInstallment, FinancialTransaction).join(
        FinancialTransaction, FinancialInstallment.transaction_id == FinancialTransaction.id
    ).filter(
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
def list_accounts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cid = get_company_id(current_user)
    return db.query(FinancialAccount).filter(FinancialAccount.company_id == cid).all()

@router.post("/financial/accounts", response_model=FinancialAccountSchema)
def create_account(account: FinancialAccountCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cid = get_company_id(current_user)
    db_acc = FinancialAccount(
        company_id=cid, name=account.name, type=account.type, 
        initial_balance=account.initial_balance, current_balance=account.initial_balance,
        closing_day=account.closing_day, due_day=account.due_day
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
            query = query.filter(FinancialCashFlowLog.created_at >= datetime.strptime(start_date, "%Y-%m-%d"))
        except: pass
    if end_date:
        try:
            # Append 23:59:59 to include the whole end day
            end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
            query = query.filter(FinancialCashFlowLog.created_at <= end_dt)
        except: pass
        
    return query.order_by(FinancialCashFlowLog.created_at.desc()).limit(300).all()

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
        
    if data.due_date is not None: inst.due_date = data.due_date
    if data.amount is not None: inst.amount = data.amount
    
    # Recalculate transaction total
    total = sum([i.amount for i in inst.transaction.installments])
    inst.transaction.total_amount = total
    
    db.commit()
    return {"message": "Parcela atualizada"}

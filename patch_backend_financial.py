import re

path = "backend/app/api/financial.py"
with open(path, "r") as f:
    content = f.read()

endpoint = """

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
"""

if "issue_inter_slip_for_order" not in content:
    content += endpoint
    with open(path, "w") as f:
        f.write(content)

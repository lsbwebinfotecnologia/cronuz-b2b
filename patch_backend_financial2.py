import re

path = "backend/app/api/financial.py"
with open(path, "r") as f:
    content = f.read()

endpoint = """

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
"""

if "issue_inter_slip_for_service_order" not in content:
    content += endpoint
    with open(path, "w") as f:
        f.write(content)

print("Backend API patched with POST /service-orders/{order_id}/issue-inter-slip endpoint stub.")

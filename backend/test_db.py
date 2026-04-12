from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.financial import FinancialAccount, FinancialCashFlowLog

db = SessionLocal()
acc = db.query(FinancialAccount).first()
if acc:
    print(f"Account: {acc.id} - {acc.name} - Initial: {acc.initial_balance} - Current: {acc.current_balance}")
    logs = db.query(FinancialCashFlowLog).filter_by(account_id=acc.id).all()
    for l in logs:
        print(f"  Log: {l.id} - {l.created_at} - Amt: {l.amount} - ProgBal: {l.progressive_balance}")
else:
    print("No accounts")

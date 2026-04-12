from app.db.session import SessionLocal
from app.models.financial import FinancialAccount, FinancialCashFlowLog

db = SessionLocal()
accs = db.query(FinancialAccount).all()
for a in accs:
    print(f"Acct {a.id}: name={a.name}, initial={a.initial_balance}, current={a.current_balance}")
    logs = db.query(FinancialCashFlowLog).filter_by(account_id=a.id).all()
    for l in logs:
        print(f"  Log {l.id}: created_at={l.created_at}, amt={l.amount}, p_bal={l.progressive_balance}")

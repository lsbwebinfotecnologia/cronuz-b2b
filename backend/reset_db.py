from sqlalchemy import text
from app.db.session import SessionLocal

db = SessionLocal()
try:
    db.execute(text("DELETE FROM fin_cashflow_log;"))
    db.execute(text("DELETE FROM fin_installment;"))
    db.execute(text("DELETE FROM fin_transaction;"))
    db.execute(text("UPDATE fin_account SET current_balance = initial_balance;"))
    db.commit()
    print("Sucesso! Banco de Dados e Saldos foram resetados e expurgados via RAW SQL.")
except Exception as e:
    db.rollback()
    print(f"Erro: {e}")
finally:
    db.close()

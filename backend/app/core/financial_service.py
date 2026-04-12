from sqlalchemy.orm import Session
from app.models.financial import FinancialTransaction, FinancialInstallment, FinancialCategory
from datetime import date, timedelta
from app.models.order import Order
from app.models.customer import Customer

def generate_financial_for_order(
    db: Session,
    company_id: int,
    customer: Customer,
    order: Order,
    provided_payment_condition: str = None
):
    # Determine payment condition
    pay_cond_str = provided_payment_condition or customer.payment_condition or ""
    pay_cond_parts = []
    if pay_cond_str:
        parts = pay_cond_str.replace(",", "/").split("/")
        try:
            for p in parts:
                clean_p = p.strip().lower()
                if clean_p.isdigit():
                    pay_cond_parts.append(int(clean_p))
        except ValueError:
            pass
            
    if not pay_cond_parts:
        # Fallback to day 0 (today) if parsing fails or À Vista
        pay_cond_parts = [0]
        
    num_installments = len(pay_cond_parts)
    if num_installments < 1:
        num_installments = 1
        
    # Get or create Financial Category for Sales
    category = db.query(FinancialCategory).filter(
        FinancialCategory.company_id == company_id,
        FinancialCategory.name.ilike("Venda de Produtos%"),
        FinancialCategory.type == "RECEIVABLE"
    ).first()
    
    if not category:
        category = FinancialCategory(
            company_id=company_id,
            name="Venda de Produtos",
            type="RECEIVABLE",
            is_system=True,
            dre_group="1_Receita_Bruta"
        )
        db.add(category)
        db.commit()
        db.refresh(category)
        
    # Record the condition used on the order
    order.payment_condition = pay_cond_str
    db.commit()
        
    # Create Transaction
    transaction = FinancialTransaction(
        company_id=company_id,
        customer_id=customer.id,
        order_id=order.id,
        category_id=category.id,
        description=f"Pedido de Venda: #{order.id}",
        type="RECEIVABLE",
        transaction_status="CONFIRMADO",
        total_amount=order.total,
        issue_date=date.today(),
        first_due_date=date.today() + timedelta(days=pay_cond_parts[0]) if pay_cond_parts else date.today()
    )
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
        
    amount_per_installment = round(order.total / num_installments, 2)
    last_installment_amount = order.total - (amount_per_installment * (num_installments - 1))
    today = date.today()
    
    for i, days in enumerate(pay_cond_parts):
        due_date = today + timedelta(days=days)
        val = amount_per_installment if i < (num_installments - 1) else last_installment_amount
        
        inst = FinancialInstallment(
            transaction_id=transaction.id,
            number=i+1,
            due_date=due_date,
            amount=val,
            status="OPEN"
        )
        db.add(inst)
    db.commit()

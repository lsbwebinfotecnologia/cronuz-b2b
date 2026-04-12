from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime

class OrderInstallmentBase(BaseModel):
    number: int
    due_date: date
    amount: float
    status: str
    payment_date: Optional[datetime] = None
    amount_paid: float = 0.0
    classification_type: str = "RECEIVABLE"

class OrderInstallmentResponse(OrderInstallmentBase):
    id: int
    order_id: int
    customer_id: int
    company_id: int
    created_at: datetime
    
    # Optional nested data for the frontend tables
    customer_name: Optional[str] = None
    order_status: Optional[str] = None
    
    class Config:
        from_attributes = True

class InstallmentPayRequest(BaseModel):
    payment_date: datetime
    amount_paid: float

class FinancialCategoryBase(BaseModel):
    name: str
    type: str # RECEIVABLE, PAYABLE
    active: bool = True
    dre_group: Optional[str] = None

class FinancialCategoryCreate(FinancialCategoryBase):
    pass

class FinancialCategoryUpdate(BaseModel):
    name: Optional[str] = None
    active: Optional[bool] = None
    dre_group: Optional[str] = None

class FinancialCategory(FinancialCategoryBase):
    id: int
    company_id: int
    is_system: bool
    
    class Config:
        from_attributes = True

class FinancialInstallmentBase(BaseModel):
    number: int
    due_date: date
    amount: float
    status: str

class FinancialInstallmentEdit(BaseModel):
    due_date: Optional[date] = None
    amount: Optional[float] = None

class FinancialInstallmentUpdate(BaseModel):
    status: Optional[str] = None
    payment_date: Optional[datetime] = None
    account_id: Optional[int] = None
    category_id: Optional[int] = None

class FinancialBulkConciliate(BaseModel):
    installment_ids: List[int]

class FinancialInstallment(FinancialInstallmentBase):
    id: int
    status: str
    payment_date: Optional[datetime] = None
    account_id: Optional[int] = None
    is_conciliated: bool = False
    conciliated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# --- ACCOUNTS AND AUDIT ---
class FinancialAccountBase(BaseModel):
    name: str
    type: str # CURRENT, SAVINGS, WALLET, CREDIT_CARD
    initial_balance: float = 0.0
    closing_day: Optional[int] = None
    due_day: Optional[int] = None

class FinancialAccountCreate(FinancialAccountBase):
    pass

class FinancialAccountUpdate(BaseModel):
    name: Optional[str] = None
    closing_day: Optional[int] = None
    due_day: Optional[int] = None

class FinancialAccount(FinancialAccountBase):
    id: int
    company_id: int
    current_balance: float
    
    class Config:
        from_attributes = True

class FinancialCashFlowLog(BaseModel):
    id: int
    account_id: int
    installment_id: Optional[int] = None
    description: str
    movement_type: str
    amount: float
    progressive_balance: float
    created_at: datetime
    
    class Config:
        from_attributes = True

class FinancialTransactionBase(BaseModel):
    description: str
    category_id: int
    type: str
    transaction_status: str = "CONFIRMADO"
    is_fixed: bool = False
    total_amount: float
    issue_date: date
    first_due_date: date
    customer_id: Optional[int] = None
    order_id: Optional[int] = None

class FinancialTransactionCreate(FinancialTransactionBase):
    installments_count: int = 1
    account_id: Optional[int] = None

class FinancialTransactionUpdate(BaseModel):
    description: Optional[str] = None
    category_id: Optional[int] = None
    customer_id: Optional[int] = None

class FinancialTransaction(FinancialTransactionBase):
    id: int
    company_id: int
    created_at: datetime
    
    category: Optional[FinancialCategory] = None
    installments: List[FinancialInstallment] = []
    
    class Config:
        from_attributes = True

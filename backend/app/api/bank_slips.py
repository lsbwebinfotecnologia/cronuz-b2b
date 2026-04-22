from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.financial import FinancialInstallment, FinancialTransaction
from app.models.customer import Customer
from app.models.company import Company
from app.models.print_point import PrintPoint

router = APIRouter()

def get_company_id(user: User):
    if hasattr(user, "company_id") and user.company_id:
        return user.company_id
    return user.id

@router.get("/financial/bank-slips")
def list_bank_slips(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cid = get_company_id(current_user)
    
    query = db.query(FinancialInstallment, FinancialTransaction, Customer).join(
        FinancialTransaction, FinancialInstallment.transaction_id == FinancialTransaction.id
    ).outerjoin(
        Customer, FinancialTransaction.customer_id == Customer.id
    ).filter(
        FinancialTransaction.company_id == cid,
        FinancialInstallment.bank_slip_provider.isnot(None)
    ).order_by(FinancialInstallment.id.desc()).limit(100)
    
    results = query.all()
    
    slips = []
    for inst, trans, cust in results:
        slips.append({
            "id": inst.id,
            "nosso_numero": inst.bank_slip_nosso_numero,
            "provider": inst.bank_slip_provider,
            "amount": float(inst.amount),
            "due_date": inst.due_date,
            "status": inst.status,
            "transaction_id": trans.id,
            "order_id": trans.order_id,
            "service_order_id": getattr(trans, "service_order_id", None),
            "customer_name": cust.name if cust else "Cliente Removido",
            "pdf_url": inst.bank_slip_pdf_url
        })
        
    return {"items": slips}

@router.patch("/financial/bank-slips/{inst_id}/sync-status")
def sync_bank_slip_status(inst_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from app.models.company_settings import CompanySettings
    from app.integrators.inter_client import BancoInterClient
    from datetime import datetime
    
    cid = get_company_id(current_user)
    
    inst = db.query(FinancialInstallment).join(FinancialTransaction).filter(
        FinancialInstallment.id == inst_id,
        FinancialTransaction.company_id == cid
    ).first()
    
    if not inst:
        raise HTTPException(status_code=404, detail="Boleto não encontrado")
        
    if not inst.bank_slip_provider == "INTER":
        raise HTTPException(status_code=400, detail="Este boleto não é do provedor Banco Inter")
        
    if inst.status in ["PAID", "CANCELLED"]:
        return {"status": inst.status, "message": "O status do boleto já é o final e não pode ser mais sincronizado."}
        
    if not inst.bank_slip_nosso_numero or not inst.bank_slip_nosso_numero.startswith("V3_REQ|"):
        raise HTTPException(status_code=400, detail="O sincronismo automático da situação do boleto suporta apenas o padrão V3 BolePix.")
        
    settings = db.query(CompanySettings).filter_by(company_id=cid).first()
    client = BancoInterClient(
        client_id=settings.inter_client_id,
        client_secret=settings.inter_client_secret,
        cert_path=settings.inter_cert_path,
        key_path=settings.inter_key_path,
        sandbox=settings.inter_sandbox,
        account_number=settings.inter_account_number,
        api_version=settings.inter_api_version
    )
    
    parts = inst.bank_slip_nosso_numero.split("|")
    codigo_solicitacao = parts[1]
    
    try:
        inter_status = client.get_cobranca_v3_status(codigo_solicitacao=codigo_solicitacao)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    situacao = inter_status.get("status")
    cobranca_data = inter_status.get("cobranca", {})
    boleto_data = inter_status.get("boleto", {})
    
    if len(parts) == 2 and boleto_data.get("nossoNumero"):
        # We finally got the final NossoNumero from the API
        inst.bank_slip_nosso_numero = f"V3_REQ|{codigo_solicitacao}|{boleto_data.get('nossoNumero')}"
        
    if not situacao and cobranca_data.get("situacao"):
        situacao = cobranca_data.get("situacao")
        
    if situacao in ["RECEBIDO", "MARCADO_RECEBIDO"]:
        inst.status = "PAID"
        if inst.transaction.transaction_status == "PROSPECCAO":
            inst.transaction.transaction_status = "CONFIRMADO"
            
        dt_pgto_str = inter_status.get("dataHoraPagamento") or inter_status.get("dataSituacao")
        if dt_pgto_str:
            try:
                # Inter format commonly ISO8601 or YYYY-MM-DD
                if "T" in dt_pgto_str:
                    inst.payment_date = datetime.fromisoformat(dt_pgto_str.replace("Z", "+00:00"))
                else:
                    inst.payment_date = datetime.strptime(dt_pgto_str, "%Y-%m-%d")
            except:
                inst.payment_date = datetime.now()
        else:
            inst.payment_date = datetime.now()
            
        valor_pago = inter_status.get("valorPago")
        if valor_pago:
            inst.amount_paid = float(valor_pago)
            
    elif situacao in ["CANCELADO", "EXPIRADO"]:
        inst.status = "CANCELLED"
        
    elif situacao == "ATRASADO":
        if inst.status != "OVERDUE":
            inst.status = "OVERDUE"
            
    elif situacao == "A_RECEBER":
        inst.status = "OPEN"
        
    else:
        inst.status = "OPEN"
        
    db.commit()
    
    return {"status": inst.status, "situacao_inter": situacao}

from fastapi import Request, BackgroundTasks

@router.post("/financial/webhooks/inter/{company_id}")
async def inter_webhook_callback(company_id: int, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Receives Inter Webhook payloads.
    Since Inter requires 200 OK immediately and sends multiple instances, we parse the body
    and queue internal re-validation of each codigoSolicitacao.
    """
    try:
        payload = await request.json()
    except:
        return {"status": "ignored"}
        
    # Payload format is usually an array of cobrancas or a root object
    cobrancas = []
    if isinstance(payload, list):
        cobrancas = payload
    elif isinstance(payload, dict):
        if "cobranca" in payload:
            cobrancas = payload.get("cobranca", [])
            if isinstance(cobrancas, dict):
                cobrancas = [cobrancas]
        elif "cobrancas" in payload:
            cobrancas = payload.get("cobrancas", [])
        else:
            cobrancas = [payload]
            
    # We only care about objects with codigoSolicitacao (the unique V3 ID)
    for cobranca in cobrancas:
        codigo = cobranca.get("codigoSolicitacao")
        if codigo:
            # We add it to background tasks to re-validate securely
            background_tasks.add_task(process_inter_webhook_item, company_id, codigo)

    return {"status": "received"}

from pydantic import BaseModel
from app.core.dependencies import get_current_user

class SetupWebhookSchema(BaseModel):
    public_base_url: str

@router.post("/financial/inter/setup-webhook")
def setup_inter_webhook(
    data: SetupWebhookSchema,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    from app.models.company_settings import CompanySettings
    from app.integrators.inter_client import BancoInterClient
    
    settings = db.query(CompanySettings).filter_by(company_id=current_user["company_id"]).first()
    if not settings or not settings.inter_client_id:
        raise HTTPException(status_code=400, detail="Credenciais do Banco Inter não configuradas")
        
    client = BancoInterClient(
        client_id=settings.inter_client_id,
        client_secret=settings.inter_client_secret,
        cert_path=settings.inter_cert_path,
        key_path=settings.inter_key_path,
        sandbox=settings.inter_sandbox,
        account_number=settings.inter_account_number,
        api_version=settings.inter_api_version
    )
    
    # Strip trailing slash from base url
    base = data.public_base_url.rstrip("/")
    webhook_url = f"{base}/financial/webhooks/inter/{current_user['company_id']}"
    
    try:
        res = client.configure_webhook(webhook_url)
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

def process_inter_webhook_item(company_id: int, codigo_solicitacao: str):
    from app.db.session import SessionLocal
    from app.models.company_settings import CompanySettings
    from app.integrators.inter_client import BancoInterClient
    from datetime import datetime
    
    db = SessionLocal()
    try:
        # Find exactly which installment represents this codigo_solicitacao
        search_pattern = f"V3_REQ|{codigo_solicitacao}%"
        inst = db.query(FinancialInstallment).join(FinancialTransaction).filter(
            FinancialTransaction.company_id == company_id,
            FinancialInstallment.bank_slip_nosso_numero.like(search_pattern)
        ).first()
        
        if not inst:
            return
            
        settings = db.query(CompanySettings).filter_by(company_id=company_id).first()
        if not settings or not settings.inter_client_id:
            return
            
        client = BancoInterClient(
            client_id=settings.inter_client_id,
            client_secret=settings.inter_client_secret,
            cert_path=settings.inter_cert_path,
            key_path=settings.inter_key_path,
            sandbox=settings.inter_sandbox,
            account_number=settings.inter_account_number,
            api_version=settings.inter_api_version
        )
        
        # Security: Pull actual status from API directly
        inter_status = client.get_cobranca_v3_status(codigo_solicitacao=codigo_solicitacao)
        situacao = inter_status.get("status")
        
        if situacao in ["RECEBIDO", "MARCADO_RECEBIDO"]:
            inst.status = "PAID"
            if inst.transaction.transaction_status == "PROSPECCAO":
                inst.transaction.transaction_status = "CONFIRMADO"
            
            dt_pgto = inter_status.get("dataHoraPagamento") or inter_status.get("dataSituacao")
            if dt_pgto:
                try:
                    if "T" in dt_pgto:
                        inst.payment_date = datetime.fromisoformat(dt_pgto.replace("Z", "+00:00"))
                    else:
                        inst.payment_date = datetime.strptime(dt_pgto, "%Y-%m-%d")
                except:
                    inst.payment_date = datetime.now()
            else:
                inst.payment_date = datetime.now()
                
            valor = inter_status.get("valorPago")
            if valor:
                inst.amount_paid = float(valor)
                
        elif situacao in ["CANCELADO", "EXPIRADO"]:
            inst.status = "CANCELLED"
            
        elif situacao == "ATRASADO" and inst.status != "OVERDUE":
            inst.status = "OVERDUE"
            
        elif situacao == "A_RECEBER":
            inst.status = "OPEN"
            
        db.commit()
    except Exception as e:
        print(f"[Webhook Inter] Error processing {codigo_solicitacao}: {e}")
    finally:
        db.close()

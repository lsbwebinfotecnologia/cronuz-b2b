import re

path = "backend/app/api/financial.py"
with open(path, "r") as f:
    content = f.read()

new_route = """

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
        sandbox=settings.inter_sandbox,
        account_number=settings.inter_account_number
    )
    
    try:
        base64_pdf = inter_client.get_boleto_pdf(installment.bank_slip_nosso_numero)
        if not base64_pdf:
            raise HTTPException(status_code=404, detail="PDF vazio retornado pelo Banco Inter")
            
        pdf_bytes = base64.b64decode(base64_pdf)
        return Response(content=pdf_bytes, media_type="application/pdf")
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao obter PDF do Inter: {str(e)}")
"""

if "get_installment_bank_slip_pdf" not in content:
    with open(path, "a") as f:
        f.write(new_route)
    print("Added PDF Route!")
else:
    print("Already exists")


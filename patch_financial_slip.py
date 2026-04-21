import re

path = "backend/app/api/financial.py"
with open(path, "r") as f:
    content = f.read()

new_endpoint = """
@router.post("/financial/installments/{inst_id}/issue-inter-slip")
def issue_inter_slip(
    inst_id: int, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    cid = get_company_id(current_user)
    
    from app.models.financial import FinancialInstallment, FinancialTransaction
    from app.models.company_settings import CompanySettings
    from app.models.customer import Customer
    from app.integrators.inter_client import BancoInterClient
    
    installment = db.query(FinancialInstallment).join(FinancialTransaction).filter(
        FinancialInstallment.id == inst_id,
        FinancialTransaction.company_id == cid
    ).first()
    
    if not installment:
        raise HTTPException(status_code=404, detail="Parcela não encontrada.")
    
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == cid).first()
    if not settings or not settings.inter_enabled:
        raise HTTPException(status_code=400, detail="Banco Inter não está ativado ou configurado para esta empresa.")
        
    if not settings.inter_client_id or not settings.inter_client_secret or not settings.inter_cert_path or not settings.inter_key_path:
        raise HTTPException(status_code=400, detail="Credenciais ou certificados do Banco Inter ausentes.")

    # In a real implementation we would fetch customer details (Name, CPF/CNPJ, Address)
    # For now we use the Integrator stub to create the boleto.
    
    inter_client = BancoInterClient(
        client_id=settings.inter_client_id,
        client_secret=settings.inter_client_secret,
        cert_path=settings.inter_cert_path,
        key_path=settings.inter_key_path,
        sandbox=settings.inter_sandbox
    )
    
    try:
        # Stub call
        boleto_data = inter_client.emit_boleto(installment_data=installment, customer_data=None)
        
        installment.bank_slip_provider = "INTER"
        installment.bank_slip_nosso_numero = boleto_data.get("nossoNumero")
        installment.bank_slip_codigo_barras = boleto_data.get("codigoBarras")
        installment.bank_slip_linha_digitavel = boleto_data.get("linhaDigitavel")
        # PDF URL will be fetched dynamically or stubbed
        
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao emitir boleto no Inter: {str(e)}")
        
    return {"message": "Boleto emitido com sucesso!", "boleto": boleto_data}
"""

if "issue_inter_slip" not in content:
    with open(path, "a") as f:
        f.write(new_endpoint)
    print("Endpoint added")
else:
    print("Endpoint already exists")

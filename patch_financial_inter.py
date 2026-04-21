import re

path = "backend/app/api/financial.py"
with open(path, "r") as f:
    content = f.read()

issue_old = """    # In a real implementation we would fetch customer details (Name, CPF/CNPJ, Address)
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
        
    return {"message": "Boleto emitido com sucesso!", "boleto": boleto_data}"""


issue_new = """    customer = db.query(Customer).filter(Customer.id == installment.transaction.customer_id).first()
    if not customer:
        raise HTTPException(status_code=400, detail="Esta parcela não possui um cliente atrelado (Necessário para emissão do boleto Inter).")
        
    inter_client = BancoInterClient(
        client_id=settings.inter_client_id,
        client_secret=settings.inter_client_secret,
        cert_path=settings.inter_cert_path,
        key_path=settings.inter_key_path,
        sandbox=settings.inter_sandbox
    )
    
    inst_data = {
        "id": installment.id,
        "amount": float(installment.amount),
        "due_date": installment.due_date
    }
    customer_data = {
        "name": customer.name,
        "document": customer.cpf_cnpj or customer.cpf or customer.cnpj,
        "address": customer.address_street,
        "number": customer.address_number,
        "neighborhood": customer.address_neighborhood,
        "city": customer.address_city,
        "uf": customer.address_state,
        "zipcode": customer.address_zipcode
    }
    
    if not customer_data["document"]:
        raise HTTPException(status_code=400, detail="O Cliente da transação não possui CPF/CNPJ cadastrado.")
    
    try:
        boleto_data = inter_client.emit_boleto(installment_data=inst_data, customer_data=customer_data)
        
        installment.bank_slip_provider = "INTER"
        installment.bank_slip_nosso_numero = boleto_data.get("nossoNumero")
        installment.bank_slip_codigo_barras = boleto_data.get("codigoBarras")
        installment.bank_slip_linha_digitavel = boleto_data.get("linhaDigitavel")
        
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao emitir boleto no Inter: {str(e)}")
        
    return {"message": "Boleto emitido com sucesso!", "boleto": boleto_data}"""

if issue_old in content:
    content = content.replace(issue_old, issue_new)
    with open(path, "w") as f:
        f.write(content)
    print("Patched financial.py!")
else:
    print("Could not find the block in financial.py to patch.")


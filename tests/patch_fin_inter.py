path = "backend/app/api/financial.py"
with open(path, "r") as f:
    content = f.read()

old_inst = """    inter_client = BancoInterClient(
        client_id=settings.inter_client_id,
        client_secret=settings.inter_client_secret,
        cert_path=settings.inter_cert_path,
        key_path=settings.inter_key_path,
        sandbox=settings.inter_sandbox,
        account_number=settings.inter_account_number
    )"""

new_inst = """    inter_client = BancoInterClient(
        client_id=settings.inter_client_id,
        client_secret=settings.inter_client_secret,
        cert_path=settings.inter_cert_path,
        key_path=settings.inter_key_path,
        sandbox=settings.inter_sandbox,
        account_number=settings.inter_account_number,
        api_version=settings.inter_api_version
    )"""

content = content.replace(old_inst, new_inst)

old_logic = """    try:
        boleto_data = inter_client.emit_boleto(installment_data=inst_data, customer_data=customer_data)
        
        installment.bank_slip_provider = "INTER"
        installment.bank_slip_nosso_numero = boleto_data.get("nossoNumero")
        installment.bank_slip_codigo_barras = boleto_data.get("codigoBarras")
        installment.bank_slip_linha_digitavel = boleto_data.get("linhaDigitavel")
        
        db.commit()
    except Exception as e:"""

new_logic = """    try:
        boleto_data = inter_client.emit_boleto(installment_data=inst_data, customer_data=customer_data)
        
        installment.bank_slip_provider = "INTER"
        
        if settings.inter_api_version == "V3":
            codigo_solicitacao = boleto_data.get("codigoSolicitacao")
            nosso_numero = inter_client.find_nosso_numero_v3(seu_numero=f"CRONUZ_{inst_data['id']}", timeout=4)
            if nosso_numero:
                installment.bank_slip_nosso_numero = nosso_numero
                # Puxar boleto dnv para pegar linha digitavel? Na V3 teríamos q pegar via webhook ou webhook_polling, mas vamos seguir a vida com NossoNumero
            else:
                # Still processing
                installment.status = "PROCESSING"
                # Keep tracking ID just in case
                installment.bank_slip_nosso_numero = f"V3_REQ|{codigo_solicitacao}"
        else:
            installment.bank_slip_nosso_numero = boleto_data.get("nossoNumero")
            installment.bank_slip_codigo_barras = boleto_data.get("codigoBarras")
            installment.bank_slip_linha_digitavel = boleto_data.get("linhaDigitavel")
            
        db.commit()
    except Exception as e:"""

if old_logic in content:
    content = content.replace(old_logic, new_logic)
    with open(path, "w") as f:
        f.write(content)
    print("Patched financial logic successfully!")
else:
    print("Logic not found!")


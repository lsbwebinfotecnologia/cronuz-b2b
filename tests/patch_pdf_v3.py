path = "backend/app/api/financial.py"
with open(path, "r") as f:
    content = f.read()

old_pdf = """    inter_client = BancoInterClient(
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
            raise HTTPException(status_code=404, detail="PDF vazio retornado pelo Banco Inter")"""

new_pdf = """    inter_client = BancoInterClient(
        client_id=settings.inter_client_id,
        client_secret=settings.inter_client_secret,
        cert_path=settings.inter_cert_path,
        key_path=settings.inter_key_path,
        sandbox=settings.inter_sandbox,
        account_number=settings.inter_account_number,
        api_version=settings.inter_api_version
    )
    
    try:
        nosso_numero_final = installment.bank_slip_nosso_numero
        if nosso_numero_final.startswith("V3_REQ|"):
            codigo_solicitacao = nosso_numero_final.split("|")[1]
            novo_nosso_numero = inter_client.find_nosso_numero_v3(seu_numero=f"CRONUZ_{inst_id}", timeout=2)
            if novo_nosso_numero:
                installment.bank_slip_nosso_numero = novo_nosso_numero
                if installment.status == "PROCESSING":
                    installment.status = "OPEN"
                db.commit()
                nosso_numero_final = novo_nosso_numero
            else:
                raise HTTPException(status_code=400, detail="Boleto ainda em processamento no Banco Inter (V3 BolePix). Tente novamente em alguns instantes.")
        
        base64_pdf = inter_client.get_boleto_pdf(nosso_numero_final)
        if not base64_pdf:
            raise HTTPException(status_code=404, detail="PDF vazio retornado pelo Banco Inter")"""

if old_pdf in content:
    content = content.replace(old_pdf, new_pdf)
    with open(path, "w") as f:
        f.write(content)
    print("Patched PDF route V3 handling!")
else:
    print("Logic not found!")

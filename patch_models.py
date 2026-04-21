import os

def patch_settings():
    path = "backend/app/models/company_settings.py"
    with open(path, "r") as f:
        content = f.read()
    
    if "inter_enabled" not in content:
        target = "    efi_certificate_path = Column(String(500), nullable=True)"
        replacement = """    efi_certificate_path = Column(String(500), nullable=True)

    # Banco Inter Integracao
    inter_enabled = Column(Boolean, default=False, nullable=False)
    inter_sandbox = Column(Boolean, default=True, nullable=False)
    inter_client_id = Column(String(255), nullable=True)
    inter_client_secret = Column(String(255), nullable=True)
    inter_cert_path = Column(String(500), nullable=True)
    inter_key_path = Column(String(500), nullable=True)
    inter_account_number = Column(String(50), nullable=True)"""
        
        new_content = content.replace(target, replacement)
        with open(path, "w") as f:
            f.write(new_content)
        print("Updated company_settings.py")

def patch_financial():
    path = "backend/app/models/financial.py"
    with open(path, "r") as f:
        content = f.read()
    
    if "bank_slip_provider" not in content:
        target = "    conciliated_at = Column(DateTime(timezone=True), nullable=True)"
        replacement = """    conciliated_at = Column(DateTime(timezone=True), nullable=True)

    # Boleto Internals
    bank_slip_provider = Column(String(50), nullable=True)
    bank_slip_nosso_numero = Column(String(255), nullable=True)
    bank_slip_linha_digitavel = Column(String(255), nullable=True)
    bank_slip_codigo_barras = Column(String(255), nullable=True)
    bank_slip_pdf_url = Column(String(500), nullable=True)"""
        
        new_content = content.replace(target, replacement)
        with open(path, "w") as f:
            f.write(new_content)
        print("Updated financial.py")

patch_settings()
patch_financial()

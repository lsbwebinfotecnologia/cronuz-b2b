import re

def insert_debug(filepath):
    content = open(filepath).read()
    if "@router.get(\"/consignment/debug\")" in content:
        return
        
    debug_code_customer = '''
@router.get("/consignment/debug")
async def get_my_consignment_debug(
    cod_ctr: Optional[str] = None,
    customer: Customer = Depends(get_current_customer),
    db: Session = Depends(get_db)
):
    try:
        from app.models.company import Company
        company = db.query(Company).filter(Company.id == customer.company_id).first()
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")
            
        cnpj_destino = company.document
        cnpj_cliente = customer.document        
        id_guid = customer.id_guid if customer.id_guid else ""
        if not id_guid:
            from app.models.company_settings import CompanySettings
            settings = db.query(CompanySettings).filter(CompanySettings.company_id == customer.company_id).first()
            id_guid = settings.horus_default_b2b_guid if settings and settings.horus_default_b2b_guid else ""

        import re
        debug_payload = {
            "ID_GUID": id_guid,
            "CNPJ_DESTINO": re.sub(r'\\D', '', cnpj_destino),
            "ID_DOC": re.sub(r'\\D', '', cnpj_cliente)
        }
        
        try:
            horus_client = HorusClients(db, company.id)
            result = await horus_client.get_consignment_summary(
                cnpj_destino=cnpj_destino,
                cnpj_cliente=cnpj_cliente,
                id_guid=id_guid,
                cod_ctr=cod_ctr
            )
            await horus_client.close()
        except Exception as e:
            result = str(e)

        return {"params": debug_payload, "response": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
'''

    debug_code_master = '''
@router.get("/companies/{company_id}/horus/customers/{cnpj_cliente:path}/consignment/debug")
async def get_consignment_debug(
    company_id: int, 
    cnpj_cliente: str, 
    cod_ctr: Optional[str] = None,
    db: Session = Depends(get_db), 
    current_user: dict = Depends(get_current_user)
):
    try:
        from app.models.company import Company
        company = db.query(Company).filter(Company.id == company_id).first()
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")
            
        cnpj_destino = company.document        
        from app.models.customer import Customer
        customer = db.query(Customer).filter(Customer.document == cnpj_cliente, Customer.company_id == company_id).first()
        id_guid = customer.id_guid if customer and customer.id_guid else ""
        if not id_guid:
            from app.models.company_settings import CompanySettings
            settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
            id_guid = settings.horus_default_b2b_guid if settings and settings.horus_default_b2b_guid else ""

        import re
        debug_payload = {
            "ID_GUID": id_guid,
            "CNPJ_DESTINO": re.sub(r'\\D', '', cnpj_destino),
            "ID_DOC": re.sub(r'\\D', '', cnpj_cliente)
        }
        
        try:
            horus_client = HorusClients(db, company_id)
            result = await horus_client.get_consignment_summary(
                cnpj_destino=cnpj_destino,
                cnpj_cliente=cnpj_cliente,
                id_guid=id_guid,
                cod_ctr=cod_ctr
            )
            await horus_client.close()
        except Exception as e:
            result = str(e)

        return {"params": debug_payload, "response": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
'''

    if "customer_portal.py" in filepath:
        content = content.replace("router = APIRouter()", "router = APIRouter()\n" + debug_code_customer)
    else:
        content = content.replace("router = APIRouter()", "router = APIRouter()\n" + debug_code_master)
        
    open(filepath, 'w').write(content)

insert_debug("backend/app/api/customer_portal.py")
insert_debug("backend/app/api/horus.py")


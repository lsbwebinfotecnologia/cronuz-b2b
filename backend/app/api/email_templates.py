from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.models.user import User, UserRole
from app.core.dependencies import get_current_user
from app.models.email_template import SysEmailTemplate
from app.schemas.email_template import SysEmailTemplateSchema, SysEmailTemplateUpdate

router = APIRouter()

DEFAULT_TEMPLATES = [
    {
        "type": "FINANCIAL_INVOICE",
        "name": "Faturamento Padrão",
        "subject": "Faturamento [{month}] | {description}",
        "body_template": "Olá,\n\nInformamos que o faturamento relativo aos serviços prestados referente ao mês de\n[{month}] já está disponível.\n\nAnexamos a este e-mail os seguintes documentos:\n\nNFS-e (Nota Fiscal de Serviços Eletrônica);\nBoleto Bancário para pagamento.\n\nAgradecemos a parceria de sempre.\n\nAtenciosamente,\nFinanceiro | {company_name}",
        "variables_schema": ["{month}", "{description}", "{company_name}", "{total_amount}", "{due_date}", "{customer_name}"]
    },
    {
        "type": "FINANCIAL_LATE",
        "name": "Cobrança de Atraso",
        "subject": "Aviso de Atraso: Faturamento [{month}] | {description}",
        "body_template": "Olá {customer_name},\n\nConsta em nosso sistema que o boleto referente ao mês de [{month}], no valor de {total_amount}, encontra-se em aberto após a data de vencimento ({due_date}).\n\nCaso o pagamento já tenha sido realizado, por favor desconsidere este aviso.\n\nAtenciosamente,\nFinanceiro | {company_name}",
        "variables_schema": ["{month}", "{description}", "{company_name}", "{total_amount}", "{due_date}", "{customer_name}"]
    },
    {
        "type": "SERVICE_ORDER",
        "name": "Abertura de O.S",
        "subject": "Ordem de Serviço #{service_id} - {status}",
        "body_template": "Olá {customer_name},\n\nSua ordem de serviço #{service_id} foi registrada e atualmente encontra-se com o status: {status}.\n\nFaremos o acompanhamento e avisaremos sobre novidades.\n\nAtenciosamente,\n{company_name}",
        "variables_schema": ["{service_id}", "{status}", "{company_name}", "{customer_name}"]
    },
    {
        "type": "STOREFRONT_ORDER",
        "name": "Confirmação de Pedido B2B",
        "subject": "Pedido #{order_id} Confirmado!",
        "body_template": "Olá {customer_name},\n\nRecebemos seu pedido #{order_id} no valor de {total_amount}.\n\nVocê pode acompanhar o status pelo nosso portal.\n\nObrigado por comprar conosco!\n{company_name}",
        "variables_schema": ["{order_id}", "{total_amount}", "{company_name}", "{customer_name}"]
    },
    {
        "type": "CUSTOMER_WELCOME",
        "name": "Boas-vindas ao Portal",
        "subject": "Bem-vindo ao Portal de Clientes - {company_name}",
        "body_template": "Olá {customer_name},\n\nSua conta foi criada com sucesso! Você já pode acessar nosso portal para consultar suas compras, faturas e abrir chamados.\n\nAcesso: {login_url}\nE-mail: {email}\nSenha provisória: {password}\n\nRecomendamos alterar a senha no primeiro acesso.\n\nEquipe {company_name}",
        "variables_schema": ["{customer_name}", "{company_name}", "{login_url}", "{email}", "{password}"]
    }
]

def ensure_default_templates(db: Session, company_id: int):
    existing = db.query(SysEmailTemplate).filter(SysEmailTemplate.company_id == company_id).all()
    existing_types = [t.type for t in existing]
    
    added = False
    for tpl in DEFAULT_TEMPLATES:
        if tpl["type"] not in existing_types:
            new_tpl = SysEmailTemplate(
                company_id=company_id,
                type=tpl["type"],
                name=tpl["name"],
                subject=tpl["subject"],
                body_template=tpl["body_template"],
                variables_schema=tpl["variables_schema"],
                is_default=True,
                is_active=True
            )
            db.add(new_tpl)
            added = True
            
    if added:
        db.commit()

@router.get("", response_model=List[SysEmailTemplateSchema])
def list_email_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.company_id:
        return []
        
    # Auto-seed the templates if missing
    ensure_default_templates(db, current_user.company_id)
    
    templates = db.query(SysEmailTemplate).filter(
        SysEmailTemplate.company_id == current_user.company_id
    ).order_by(SysEmailTemplate.id.asc()).all()
    
    return templates

@router.put("/{template_id}", response_model=SysEmailTemplateSchema)
def update_email_template(
    template_id: int,
    payload: SysEmailTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.company_id:
        raise HTTPException(status_code=403, detail="Não autorizado.")
        
    template = db.query(SysEmailTemplate).filter(
        SysEmailTemplate.id == template_id,
        SysEmailTemplate.company_id == current_user.company_id
    ).first()
    
    if not template:
        raise HTTPException(status_code=404, detail="Template não encontrado.")
        
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(template, key, value)
        
    db.commit()
    db.refresh(template)
    return template

@router.post("/{template_id}/restore", response_model=SysEmailTemplateSchema)
def restore_email_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.company_id:
        raise HTTPException(status_code=403, detail="Não autorizado.")
        
    template = db.query(SysEmailTemplate).filter(
        SysEmailTemplate.id == template_id,
        SysEmailTemplate.company_id == current_user.company_id
    ).first()
    
    if not template:
        raise HTTPException(status_code=404, detail="Template não encontrado.")
        
    default_tpl = next((t for t in DEFAULT_TEMPLATES if t["type"] == template.type), None)
    if default_tpl:
        template.subject = default_tpl["subject"]
        template.body_template = default_tpl["body_template"]
        db.commit()
        db.refresh(template)
        
    return template

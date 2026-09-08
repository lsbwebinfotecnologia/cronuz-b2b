from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
import logging

from app.db.session import get_db
from app.models.author import Author
from app.models.company import Company
from app.models.company_settings import CompanySettings
from app.models.user import User
from app.core.dependencies import get_current_user
from app.schemas.author import (
    AuthorCreate, AuthorUpdate, AuthorResponse, AuthorListResponse,
    HorusAuthorSearchItem
)
from app.integrators.horus_authors import HorusAuthors
from app.core.email import send_smtp_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/authors", tags=["authors-admin"])

def _get_seller_slug(company: Company) -> str:
    """Extrai o slug do seller a partir do domain ou custom_domain."""
    raw = company.domain or company.custom_domain or f"seller{company.id}"
    slug = raw.split(".")[0].strip()
    return slug

def _generate_activation_token(author: Author, db: Session) -> str:
    """Gera token criptográfico único, salva hash e validade de 24h."""
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    
    author.activation_token_hash = token_hash
    author.activation_token_expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    db.commit()
    db.refresh(author)
    return raw_token

def _send_activation_email(author: Author, company: Company, settings: Optional[CompanySettings], raw_token: str) -> str:
    """Dispara e-mail transacional com o link de primeiro acesso."""
    slug = _get_seller_slug(company)
    
    # URL de primeiro acesso
    # Suporta produção e desenvolvimento local
    app_env = getattr(settings, 'environment', 'production') if settings else 'production'
    is_local = "localhost" in (company.domain or "") or "127.0.0.1" in (company.domain or "")
    
    if is_local:
        activation_url = f"http://autores.{slug}.localhost:3000/primeiro-acesso?token={raw_token}"
    else:
        activation_url = f"https://autores.{slug}.cronuzb2b.com.br/primeiro-acesso?token={raw_token}"

    company_name = company.name or "Editora"
    company_logo = company.logo or ""

    html_content = f"""
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Convite para o Portal do Autor</title>
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #1e293b; }}
        .container {{ max-width: 580px; margin: 30px auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }}
        .header {{ padding: 32px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); text-align: center; color: #ffffff; }}
        .logo {{ max-height: 48px; max-width: 180px; margin-bottom: 12px; }}
        .content {{ padding: 32px; font-size: 15px; line-height: 1.6; }}
        .btn {{ display: inline-block; background-color: #0284c7; color: #ffffff !important; font-weight: 600; text-decoration: none; padding: 14px 28px; border-radius: 8px; margin: 24px 0; text-align: center; }}
        .footer {{ padding: 20px 32px; background-color: #f1f5f9; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }}
        .alert {{ background: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px 16px; margin: 16px 0; font-size: 13px; color: #1e40af; border-radius: 4px; }}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          {f'<img src="{company_logo}" alt="{company_name}" class="logo" />' if company_logo else ''}
          <h2 style="margin: 0; font-size: 20px;">Portal do Autor — {company_name}</h2>
        </div>
        <div class="content">
          <p>Olá, <strong>{author.nome}</strong>!</p>
          <p>Você foi cadastrado como autor(a) parceiro(a) na <strong>{company_name}</strong>. Através do seu Portal exclusivo, você poderá acompanhar relatórios de vendas, tiragens e informações das suas obras.</p>
          
          <div class="alert">
            <strong>Importante:</strong> Este convite é pessoal e expira em 24 horas.
          </div>

          <div style="text-align: center;">
            <a href="{activation_url}" class="btn" target="_blank">Definir Minha Senha de Acesso</a>
          </div>

          <p style="font-size: 13px; color: #64748b;">Se o botão acima não funcionar, copie e cole o link abaixo no seu navegador:</p>
          <p style="font-size: 12px; word-break: break-all; color: #0284c7;">{activation_url}</p>
        </div>
        <div class="footer">
          <p>Esta é uma mensagem automática enviada por {company_name} através da plataforma Cronuz B2B.<br>Não responda a este e-mail.</p>
        </div>
      </div>
    </body>
    </html>
    """

    if settings and settings.smtp_host and settings.smtp_username and settings.smtp_password:
        try:
            send_smtp_email(
                smtp_host=settings.smtp_host,
                smtp_port=int(settings.smtp_port or 587),
                smtp_username=settings.smtp_username,
                smtp_password=settings.smtp_password,
                smtp_from=settings.smtp_from_email or f"noreply@{slug}.cronuzb2b.com.br",
                to_email=author.emailb2b,
                subject=f"Convite: Acesso ao Portal do Autor — {company_name}",
                html_content=html_content,
                use_ssl=(settings.smtp_security == "SSL")
            )
            logger.info(f"E-mail de ativação enviado para {author.emailb2b}")
        except Exception as e:
            logger.warning(f"Falha ao enviar e-mail via SMTP ({e}). URL gerada: {activation_url}")
    else:
        logger.info(f"SMTP não configurado para a empresa {company.id}. Link de ativação: {activation_url}")

    return activation_url


# --- ENDPOINTS ADMINISTRATIVOS ---

@router.get("/horus/search")
async def search_horus_authors(
    nom_fornecedor: Optional[str] = Query(None, description="Filtro por nome do fornecedor/autor"),
    cpf: Optional[str] = Query(None, description="CPF sem pontuação"),
    cnpj: Optional[str] = Query(None, description="CNPJ sem pontuação"),
    data_ini: Optional[str] = Query("01/01/1899", description="Data inicial dd/mm/yyyy"),
    data_fim: Optional[str] = Query("31/12/2026", description="Data final dd/mm/yyyy"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Pesquisa autores/fornecedores disponíveis no Horus ERP para pré-cadastro.
    Endpoint: Busca_AutoresB2B
    """
    company_id = current_user.company_id
    if not company_id and current_user.type == "MASTER":
        raise HTTPException(status_code=400, detail="Usuário Master precisa selecionar uma empresa.")

    try:
        horus_client = HorusAuthors(db=db, company_id=company_id)
        results = await horus_client.busca_autores_b2b(
            nom_fornecedor=nom_fornecedor,
            nome=nom_fornecedor,
            cpf=cpf,
            cnpj=cnpj,
            data_ini=data_ini,
            data_fim=data_fim,
            offset=offset,
            limit=limit
        )
        return results
    except Exception as e:
        logger.error(f"Erro ao buscar autores no Horus: {e}")
        raise HTTPException(status_code=400, detail=f"Erro ao consultar Horus ERP: {str(e)}")


@router.get("", response_model=AuthorListResponse)
def list_authors(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None, description="Busca por nome, e-mail ou documento"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista autores vinculados à empresa do seller."""
    company_id = current_user.company_id
    if not company_id and current_user.type == "MASTER":
        raise HTTPException(status_code=400, detail="Usuário Master precisa selecionar uma empresa.")

    query = db.query(Author).filter(Author.company_id == company_id)

    if status_filter:
        query = query.filter(Author.status == status_filter.upper())

    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            (Author.nome.ilike(term)) |
            (Author.emailb2b.ilike(term)) |
            (Author.cpf.ilike(term)) |
            (Author.cnpj.ilike(term)) |
            (Author.id_doc.ilike(term))
        )

    total = query.count()
    items = query.order_by(Author.nome.asc()).offset(skip).limit(limit).all()

    return {
        "items": items,
        "total": total,
        "page": (skip // limit) + 1,
        "limit": limit
    }


@router.post("", response_model=AuthorResponse, status_code=status.HTTP_201_CREATED)
def link_author(
    author_in: AuthorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Vincula um autor do Horus ERP à empresa do seller com status 'PENDENTE_ATIVACAO'."""
    company_id = current_user.company_id
    if not company_id and current_user.type == "MASTER":
        raise HTTPException(status_code=400, detail="Usuário Master precisa selecionar uma empresa.")

    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    # Valida se o e-mail B2B já está vinculado nesta empresa
    existing_email = db.query(Author).filter(
        Author.company_id == company_id,
        Author.emailb2b == author_in.emailb2b.lower().strip()
    ).first()
    if existing_email:
        raise HTTPException(status_code=400, detail="Já existe um autor cadastrado com este e-mail B2B nesta empresa.")

    # Valida se o ID_GUID já foi vinculado
    existing_guid = db.query(Author).filter(
        Author.company_id == company_id,
        Author.id_guid == author_in.id_guid.strip()
    ).first()
    if existing_guid:
        raise HTTPException(status_code=400, detail="Este autor já está vinculado a esta organização.")

    author_data = author_in.model_dump(exclude={"send_activation_email"})
    author_data["company_id"] = company_id
    author_data["emailb2b"] = author_data["emailb2b"].lower().strip()
    author_data["status"] = "PENDENTE_ATIVACAO"

    author = Author(**author_data)
    db.add(author)
    db.commit()
    db.refresh(author)

    if author_in.send_activation_email:
        settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
        token = _generate_activation_token(author, db)
        _send_activation_email(author, company, settings, token)

    return author


@router.get("/{author_id}", response_model=AuthorResponse)
def get_author(
    author_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Detalhes de um autor vinculado."""
    company_id = current_user.company_id
    query = db.query(Author).filter(Author.id == author_id)
    if current_user.type != "MASTER":
        query = query.filter(Author.company_id == company_id)

    author = query.first()
    if not author:
        raise HTTPException(status_code=404, detail="Autor não encontrado.")
    return author


@router.patch("/{author_id}", response_model=AuthorResponse)
def update_author(
    author_id: int,
    author_in: AuthorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Atualiza classificação, e-mail ou status do autor."""
    company_id = current_user.company_id
    query = db.query(Author).filter(Author.id == author_id)
    if current_user.type != "MASTER":
        query = query.filter(Author.company_id == company_id)

    author = query.first()
    if not author:
        raise HTTPException(status_code=404, detail="Autor não encontrado.")

    update_data = author_in.model_dump(exclude_unset=True)
    if "emailb2b" in update_data and update_data["emailb2b"]:
        new_email = update_data["emailb2b"].lower().strip()
        conflict = db.query(Author).filter(
            Author.company_id == author.company_id,
            Author.emailb2b == new_email,
            Author.id != author.id
        ).first()
        if conflict:
            raise HTTPException(status_code=400, detail="Este e-mail B2B já está em uso por outro autor.")
        update_data["emailb2b"] = new_email

    for key, val in update_data.items():
        setattr(author, key, val)

    db.commit()
    db.refresh(author)
    return author


@router.post("/{author_id}/send-activation")
def trigger_activation_email(
    author_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Gera token seguro e dispara o e-mail de primeiro acesso/ativação."""
    company_id = current_user.company_id
    query = db.query(Author).filter(Author.id == author_id)
    if current_user.type != "MASTER":
        query = query.filter(Author.company_id == company_id)

    author = query.first()
    if not author:
        raise HTTPException(status_code=404, detail="Autor não encontrado.")

    company = db.query(Company).filter(Company.id == author.company_id).first()
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == author.company_id).first()

    raw_token = _generate_activation_token(author, db)
    activation_url = _send_activation_email(author, company, settings, raw_token)

    return {
        "message": f"E-mail de ativação disparado com sucesso para {author.emailb2b}.",
        "activation_url": activation_url,
        "expires_in_hours": 24
    }


@router.patch("/companies/{company_id}/modulo-autores")
def toggle_modulo_autores(
    company_id: int,
    status_in: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Ativa ou desativa o módulo de autores para a empresa."""
    if current_user.type != "MASTER" and current_user.company_id != company_id:
        raise HTTPException(status_code=403, detail="Sem permissão para alterar configurações desta empresa.")

    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    new_status = bool(status_in.get("modulo_autores_ativo", False))
    company.modulo_autores_ativo = new_status
    db.commit()
    db.refresh(company)

    return {
        "company_id": company.id,
        "modulo_autores_ativo": company.modulo_autores_ativo,
        "message": "Status do Módulo Portal do Autor atualizado com sucesso."
    }

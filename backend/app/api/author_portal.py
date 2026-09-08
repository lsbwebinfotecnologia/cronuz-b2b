from fastapi import APIRouter, Depends, HTTPException, status, Header, Query
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any
import hashlib
import re
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
import logging

from app.db.session import get_db
from app.models.author import Author
from app.models.company import Company
from app.core import security
from app.core.security import SECRET_KEY, ALGORITHM
from app.schemas.author import (
    VerifyTokenRequest, VerifyTokenResponse, SetPasswordRequest,
    AuthorLoginRequest, AuthorLoginResponse
)
from app.integrators.horus_authors import HorusAuthors

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/portal-autor", tags=["author-portal"])

# Requisitos fortes de senha: 8+ chars, maiúscula, minúscula, número e símbolo
PASSWORD_REGEX = re.compile(r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^_\-+=])[A-Za-z\d@$!%*?&#^_\-+=]{8,}$')

def _find_company_by_slug(db: Session, seller_slug: str) -> Optional[Company]:
    """Localiza a empresa a partir do slug do subdomínio."""
    slug = seller_slug.strip().lower()
    
    # 1. Busca exata ou prefixada por domain
    company = db.query(Company).filter(
        (Company.domain.ilike(f"{slug}.%")) |
        (Company.domain == slug) |
        (Company.custom_domain.ilike(f"{slug}.%")) |
        (Company.custom_domain == slug)
    ).first()

    # 2. Se não encontrar, tenta busca por id caso slug seja numérico
    if not company and slug.isdigit():
        company = db.query(Company).filter(Company.id == int(slug)).first()

    return company

def _create_author_token(author: Author, company: Company) -> str:
    """Gera token JWT exclusivo para sessão do Autor."""
    expires = datetime.now(timezone.utc) + timedelta(days=7)
    payload = {
        "sub": str(author.id),
        "author_id": author.id,
        "company_id": company.id,
        "role": "AUTHOR",
        "id_guid": author.id_guid,
        "id_doc": author.id_doc,
        "email": author.emailb2b,
        "name": author.nome,
        "b2b_mostrar_vendas": author.b2b_mostrar_vendas,
        "b2b_mostrar_da": author.b2b_mostrar_da,
        "exp": expires
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def get_current_author(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> Author:
    """Dependência para proteger rotas autenticadas do Portal do Autor."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Credenciais de autor não fornecidas.")

    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        author_id = payload.get("author_id")
        role = payload.get("role")
        if not author_id or role != "AUTHOR":
            raise HTTPException(status_code=401, detail="Token inválido para acesso ao Portal do Autor.")
    except JWTError:
        raise HTTPException(status_code=401, detail="Sessão expirada. Faça login novamente.")

    author = db.query(Author).filter(Author.id == author_id).first()
    if not author or author.status != "ATIVO":
        raise HTTPException(status_code=403, detail="Autor inativo ou não cadastrado.")

    return author


# --- ROTAS PÚBLICAS / AUTH ---

@router.get("/info/{seller_slug}")
def get_portal_info(seller_slug: str, db: Session = Depends(get_db)):
    """Retorna metadados visuais do Seller e status de ativação do módulo."""
    company = _find_company_by_slug(db, seller_slug)
    if not company:
        raise HTTPException(status_code=404, detail="Editora não encontrada.")

    return {
        "company_id": company.id,
        "name": company.name,
        "logo": company.logo,
        "login_background_url": company.login_background_url,
        "favicon_url": company.favicon_url,
        "seo_title": company.seo_title or f"Portal do Autor — {company.name}",
        "seo_description": company.seo_description,
        "modulo_autores_ativo": getattr(company, "modulo_autores_ativo", False),
        "seller_slug": seller_slug
    }


@router.post("/auth/verify-token", response_model=VerifyTokenResponse)
def verify_activation_token(data: VerifyTokenRequest, db: Session = Depends(get_db)):
    """Valida se o token de ativação/primeiro acesso é válido e não expirou."""
    token_hash = hashlib.sha256(data.token.strip().encode()).hexdigest()
    now = datetime.now(timezone.utc)

    author = db.query(Author).filter(
        Author.activation_token_hash == token_hash,
        Author.activation_token_expires_at > now
    ).first()

    if not author:
        return VerifyTokenResponse(
            valid=False,
            detail="Token inválido ou expirado. Solicite um novo convite à sua editora."
        )

    company = db.query(Company).filter(Company.id == author.company_id).first()

    return VerifyTokenResponse(
        valid=True,
        author_id=author.id,
        author_name=author.nome,
        emailb2b=author.emailb2b,
        company_name=company.name if company else "Editora"
    )


@router.post("/auth/set-password")
def set_first_access_password(data: SetPasswordRequest, db: Session = Depends(get_db)):
    """Define a senha forte do autor, ativa a conta e revoga o token de ativação."""
    token_hash = hashlib.sha256(data.token.strip().encode()).hexdigest()
    now = datetime.now(timezone.utc)

    author = db.query(Author).filter(
        Author.activation_token_hash == token_hash,
        Author.activation_token_expires_at > now
    ).first()

    if not author:
        raise HTTPException(
            status_code=400,
            detail="O link de primeiro acesso expirou ou já foi utilizado. Solicite um novo à editora."
        )

    # Validação de força de senha
    password = data.password
    if not PASSWORD_REGEX.match(password):
        raise HTTPException(
            status_code=422,
            detail="A senha deve ter no mínimo 8 caracteres, incluindo pelo menos uma letra maiúscula, uma minúscula, um número e um caractere especial."
        )

    author.password_hash = security.get_password_hash(password)
    author.status = "ATIVO"
    author.activation_token_hash = None
    author.activation_token_expires_at = None
    author.updated_at = now

    db.commit()
    return {"success": True, "message": "Senha definida com sucesso! Agora você já pode acessar o Portal do Autor."}


@router.post("/auth/login", response_model=AuthorLoginResponse)
def author_login(data: AuthorLoginRequest, db: Session = Depends(get_db)):
    """Autenticação de autor no subdomínio da editora."""
    company = _find_company_by_slug(db, data.seller_slug)
    if not company:
        raise HTTPException(status_code=404, detail="Editora parceira não encontrada.")

    if not getattr(company, "modulo_autores_ativo", False):
        raise HTTPException(
            status_code=403,
            detail="O Portal do Autor está temporariamente indisponível para esta editora."
        )

    clean_email = data.email.lower().strip()
    author = db.query(Author).filter(
        Author.company_id == company.id,
        Author.emailb2b == clean_email
    ).first()

    if not author:
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos.")

    if author.status != "ATIVO":
        if author.status == "PENDENTE_ATIVACAO":
            raise HTTPException(
                status_code=403,
                detail="Sua conta ainda não foi ativada. Verifique o link de primeiro acesso enviado para seu e-mail."
            )
        raise HTTPException(status_code=403, detail="Sua conta está desativada. Entre em contato com a editora.")

    if not author.password_hash or not security.verify_password(data.password, author.password_hash):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos.")

    author.last_login_at = datetime.now(timezone.utc)
    db.commit()

    token = _create_author_token(author, company)

    return AuthorLoginResponse(
        access_token=token,
        token_type="bearer",
        author={
            "id": author.id,
            "nome": author.nome,
            "emailb2b": author.emailb2b,
            "id_doc": author.id_doc,
            "id_guid": author.id_guid,
            "b2b_mostrar_vendas": author.b2b_mostrar_vendas,
            "b2b_mostrar_da": author.b2b_mostrar_da,
            "classificacao_autor": author.classificacao_autor,
            "company_name": company.name,
            "company_logo": company.logo
        }
    )


# --- ROTAS AUTENTICADAS DO AUTOR ---

@router.get("/me")
def get_author_profile(
    current_author: Author = Depends(get_current_author),
    db: Session = Depends(get_db)
):
    """Retorna dados do autor autenticado e da editora."""
    company = db.query(Company).filter(Company.id == current_author.company_id).first()
    return {
        "id": current_author.id,
        "nome": current_author.nome,
        "nome_fantasia": current_author.nome_fantasia,
        "emailb2b": current_author.emailb2b,
        "id_doc": current_author.id_doc,
        "id_guid": current_author.id_guid,
        "classificacao_autor": current_author.classificacao_autor,
        "b2b_mostrar_vendas": current_author.b2b_mostrar_vendas,
        "b2b_mostrar_da": current_author.b2b_mostrar_da,
        "company": {
            "id": company.id if company else None,
            "name": company.name if company else "Editora",
            "logo": company.logo if company else None
        }
    }


@router.get("/fornecedores")
async def get_author_fornecedores(
    current_author: Author = Depends(get_current_author),
    db: Session = Depends(get_db)
):
    """
    Lista autores vinculados ao fornecedor do autor autenticado.
    Endpoint Horus: Busca_Autores_FornecedoresB2B
    """
    try:
        client = HorusAuthors(db=db, company_id=current_author.company_id)
        res = await client.busca_autores_fornecedores_b2b(
            id_guid=current_author.id_guid,
            id_doc=current_author.id_doc
        )
        return res
    except Exception as e:
        logger.error(f"Erro ao buscar autores do fornecedor no Horus: {e}")
        # Fallback gracioso: retorna pelo menos o próprio autor cadastrado
        return [{
            "COD_AUTOR": current_author.cod_fornecedor,
            "NOM_AUTOR": current_author.nome,
            "COD_TIPO": 1,
            "NOM_TIPO": current_author.classificacao_autor or "Autor"
        }]


@router.get("/itens")
async def get_author_items(
    current_author: Author = Depends(get_current_author),
    db: Session = Depends(get_db)
):
    """
    Lista todos os livros/itens pertencentes ao autor no Horus.
    Endpoint Horus: Busca_Itens_AutoresB2B
    """
    try:
        client = HorusAuthors(db=db, company_id=current_author.company_id)
        res = await client.busca_itens_autores_b2b(
            id_guid=current_author.id_guid,
            id_doc=current_author.id_doc
        )
        return res
    except Exception as e:
        logger.error(f"Erro ao buscar itens do autor no Horus: {e}")
        raise HTTPException(status_code=400, detail=f"Erro ao consultar acervo no ERP: {str(e)}")


@router.get("/vendas")
async def get_author_sales(
    cod_autor: Optional[int] = Query(None, description="Código do Autor selecionado"),
    cod_item: Optional[int] = Query(None, description="Código do Livro/Item"),
    periodo: str = Query("30d", description="Período fixo: 5d, 10d, 15d, 30d, 6m"),
    data_ini: Optional[str] = Query(None, description="Data inicial dd/mm/yyyy"),
    data_fim: Optional[str] = Query(None, description="Data final dd/mm/yyyy"),
    current_author: Author = Depends(get_current_author),
    db: Session = Depends(get_db)
):
    """
    Consulta vendas do autor por livro com período fechado/fixo para proteção de performance do Horus.
    Endpoint Horus: Busca_Vendas_AutoreB2B
    """
    if current_author.b2b_mostrar_vendas != "S":
        raise HTTPException(
            status_code=403,
            detail="Acesso aos relatórios de vendas não habilitado para este autor. Entre em contato com a editora."
        )

    # Cálculo do período fechado garantido (limite máximo de 6 meses)
    now = datetime.now()
    periodo_map = {
        "5d": 5,
        "10d": 10,
        "15d": 15,
        "30d": 30,
        "6m": 180
    }

    if periodo in periodo_map:
        days = periodo_map[periodo]
        dt_ini = now - timedelta(days=days)
        dt_fim = now
        calc_data_ini = dt_ini.strftime("%d/%m/%Y")
        calc_data_fim = dt_fim.strftime("%d/%m/%Y")
    elif data_ini and data_fim:
        # Se fornecido customizado, valida formato e trava em no máximo 180 dias
        try:
            p_ini = datetime.strptime(data_ini, "%d/%m/%Y")
            p_fim = datetime.strptime(data_fim, "%d/%m/%Y")
            if (p_fim - p_ini).days > 180:
                raise HTTPException(status_code=400, detail="O período máximo de consulta permitido é de 6 meses (180 dias).")
            calc_data_ini = data_ini
            calc_data_fim = data_fim
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato de data inválido. Use dd/mm/yyyy.")
    else:
        # Padrão seguro: 30 dias
        dt_ini = now - timedelta(days=30)
        calc_data_ini = dt_ini.strftime("%d/%m/%Y")
        calc_data_fim = now.strftime("%d/%m/%Y")

    try:
        client = HorusAuthors(db=db, company_id=current_author.company_id)
        vendas = await client.busca_vendas_autores_b2b(
            id_guid=current_author.id_guid,
            id_doc=current_author.id_doc,
            cod_autor=cod_autor,
            cod_item=cod_item,
            data_ini=calc_data_ini,
            data_fim=calc_data_fim
        )

        # Agrega KPIs no backend
        total_vendida = 0
        total_doada = 0
        total_devolvida = 0

        for item in vendas:
            total_vendida += int(item.get("QTD_VENDIDA", 0) or 0)
            total_doada += int(item.get("QTD_DOADA", 0) or 0)
            total_devolvida += int(item.get("QTD_DEVOLVIDA", 0) or 0)

        return {
            "periodo": {
                "data_ini": calc_data_ini,
                "data_fim": calc_data_fim,
                "tipo": periodo
            },
            "kpis": {
                "total_vendida": total_vendida,
                "total_doada": total_doada,
                "total_devolvida": total_devolvida,
                "saldo_liquido": total_vendida - total_devolvida
            },
            "itens": vendas
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao buscar vendas do autor no Horus: {e}")
        raise HTTPException(status_code=400, detail=f"Erro ao consultar vendas no ERP: {str(e)}")

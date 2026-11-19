"""
backend/app/api/dbm.py
----------------------
Endpoints especializados para o módulo DBM (Painel Operacional & CRM):
- Cadastro e consulta de empresas integradas à base Cronuz e Horus ERP.
- Validação e vínculo em tempo real de clientes (tabela CLIENTES) e fornecedores (tabela FORNECEDORES) do Horus.
- Armazenamento puro de códigos numéricos (sem prefixo 'H').
"""

import io
import csv
import os
import unicodedata
from pathlib import Path
from datetime import datetime, timezone
import logging
import re
from typing import Optional, List, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File, Form
from fastapi.responses import StreamingResponse
import openpyxl
from sqlalchemy.orm import Session
from sqlalchemy import or_, func, cast, String
from pydantic import BaseModel

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.core.upload_security import validate_file_size_and_extension, read_file_safely, sanitize_filename
from app.models.user import User, UserRole
from app.models.customer import Customer
from app.models.company_settings import CompanySettings
from app.integrators.horus_sql_client import HorusSQLClient, HorusSQLConfigError

router = APIRouter(prefix="/dbm", tags=["dbm"])
log = logging.getLogger(__name__)
logger = log


def _resolve_seller_id(current_user: User, company_id: Optional[int] = None) -> int:
    is_master = False
    if hasattr(current_user, "type"):
        user_type = current_user.type
        type_str = user_type.value if hasattr(user_type, "value") else str(user_type or "")
        is_master = type_str.upper() == "MASTER"
    elif isinstance(current_user, dict):
        is_master = str(current_user.get("type", "")).upper() == "MASTER"

    if is_master and company_id and company_id > 0:
        return company_id

    seller_id = None
    if hasattr(current_user, "company_id"):
        seller_id = current_user.company_id
    elif isinstance(current_user, dict):
        seller_id = current_user.get("company_id")

    if not seller_id and company_id and company_id > 0:
        seller_id = company_id

    if not seller_id:
        raise HTTPException(
            status_code=400,
            detail="Seller não identificado. É necessário estar vinculado a uma empresa para gerenciar empresas no DBM."
        )
    return seller_id


def _resolve_horus_empresa_filial(
    settings: Optional[CompanySettings] = None,
    sql_client: Optional[HorusSQLClient] = None,
) -> tuple[int, int]:
    """
    Resolve COD_EMPRESA e COD_FILIAL configurados para o seller no Horus ERP / SQL Direct.
    Garante isolamento estrito por filial em todas as consultas do DBM (estoque, consignado e notas fiscais).
    """
    emp_str = ""
    fil_str = ""
    if settings:
        emp_str = str(getattr(settings, "horus_sql_cod_empresa", None) or getattr(settings, "horus_company", None) or "").strip()
        fil_str = str(getattr(settings, "horus_sql_cod_filial", None) or getattr(settings, "horus_branch", None) or "").strip()
    if not emp_str and sql_client:
        emp_str = str(getattr(sql_client, "cod_empresa", None) or "").strip()
    if not fil_str and sql_client:
        fil_str = str(getattr(sql_client, "cod_filial", None) or "").strip()

    cod_emp = int(emp_str) if (emp_str and emp_str.isdigit()) else 1
    cod_fil = int(fil_str) if (fil_str and fil_str.isdigit()) else 2
    return cod_emp, cod_fil


def _get_or_create_customer_group(
    db: Session,
    seller_id: int,
    raw_group_name: Optional[str],
) -> tuple[Optional[int], bool]:
    """
    Busca ou cria automaticamente o grupo de cliente na tabela crm_customer_group do seller.
    Retorna (group_id, created_new).
    """
    g_name = (raw_group_name or "").strip()
    if not g_name:
        return None, False
    from app.models.customer_group import CustomerGroup

    existing_grp = db.query(CustomerGroup).filter(
        CustomerGroup.company_id == seller_id,
        func.lower(CustomerGroup.name) == g_name.lower()
    ).first()
    if existing_grp:
        return existing_grp.id, False

    new_grp = CustomerGroup(
        company_id=seller_id,
        name=g_name[:100],
        color="#4f46e5",
    )
    db.add(new_grp)
    db.flush()
    return new_grp.id, True



def _sanitize_doc(doc: str) -> str:
    """Remove pontuação e espaços de CPF/CNPJ."""
    return re.sub(r"\D", "", doc or "")


def _normalize_header(h: str) -> str:
    if not h:
        return ""
    nfkd = unicodedata.normalize('NFKD', str(h).strip().lower())
    clean = re.sub(r'[^a-z0-9]', '', nfkd)
    return clean


def _map_columns(headers: List[str]) -> dict:
    col_map = {}
    for idx, raw_h in enumerate(headers):
        norm = _normalize_header(raw_h)
        if not norm:
            continue
        
        # codigo_horus (suporta cod_cli, cod_horus ou cod_fornecedor)
        if any(k in norm for k in ['codigohorus', 'codhorus', 'codcli', 'codigocliente', 'clientehorus', 'horus', 'codclient', 'codforn', 'codfornecedor', 'codigofornecedor', 'fornecedorhorus', 'fornecedor']) or norm in ['codigo', 'cod']:
            if 'codigo_horus' not in col_map:
                col_map['codigo_horus'] = idx
        # apelido / fantasia
        elif any(k in norm for k in ['apelido', 'fantasia', 'nomefantasia', 'nomereduzido', 'nomreduzido']) or norm in ['nome', 'empresa', 'cliente']:
            if 'apelido' not in col_map:
                col_map['apelido'] = idx
        # grupo
        elif any(k in norm for k in ['grupo', 'group']):
            if 'grupo' not in col_map:
                col_map['grupo'] = idx
        # segmento
        elif any(k in norm for k in ['segmento', 'segment', 'categoria']):
            if 'segmento' not in col_map:
                col_map['segmento'] = idx
        # obs da empresa
        elif any(k in norm for k in ['obs', 'observa', 'mensagem', 'msg', 'nota']):
            if 'obs_empresa' not in col_map:
                col_map['obs_empresa'] = idx
        # detalhes fechamento roy
        elif any(k in norm for k in ['royalt', 'fechamento']):
            if 'fechamento_roy' not in col_map:
                col_map['fechamento_roy'] = idx
        # customer account
        elif any(k in norm for k in ['account', 'conta', 'custummer']):
            if 'account' not in col_map:
                col_map['account'] = idx

    # Se a planilha tiver apenas 2 colunas e a primeira for codigo_horus, garante que a segunda seja mapeada como apelido
    if 'codigo_horus' in col_map and 'apelido' not in col_map and len(headers) >= 2:
        used_indices = set(col_map.values())
        for idx in range(len(headers)):
            if idx not in used_indices and str(headers[idx] or '').strip():
                col_map['apelido'] = idx
                break

    return col_map


# ── Schemas ───────────────────────────────────────────────────────────────────

class DbmImportItemPayload(BaseModel):
    row_index: int
    codigo_horus: int
    apelido: Optional[str] = None
    grupo: Optional[str] = None
    segmento: Optional[str] = None
    obs_empresa: Optional[str] = None
    fechamento_roy: Optional[str] = None
    account: Optional[str] = None


class DbmImportBatchPayload(BaseModel):
    company_id: Optional[int] = None
    seller_company_id: Optional[int] = None
    import_mode: Optional[str] = "cliente"  # "cliente" | "fornecedor"
    items: List[DbmImportItemPayload]

class DbmCompanySavePayload(BaseModel):
    id: Optional[int] = None
    seller_company_id: Optional[int] = None
    document: str
    name: str  # Apelido
    razao_social: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    group_name: Optional[str] = None
    segment: Optional[str] = None
    notes_message: Optional[str] = None
    customer_account: Optional[str] = None
    royalties_data: Optional[str] = None
    min_order_total: Optional[float] = 0.0
    is_cliente: bool = True
    is_fornecedor: bool = False
    horus_cod_cli: Optional[int] = None
    horus_cod_fornecedor: Optional[int] = None


class DbmCompanyItem(BaseModel):
    id: int
    document: str
    name: str
    razao_social: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    group_name: Optional[str] = None
    segment: Optional[str] = None
    notes_message: Optional[str] = None
    customer_account: Optional[str] = None
    royalties_data: Optional[str] = None
    min_order_total: Optional[float] = 0.0
    is_cliente: bool = True
    is_fornecedor: bool = False
    horus_cod_cli: Optional[int] = None
    horus_cod_fornecedor: Optional[int] = None
    created_at: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/companies/horus-lookup")
def lookup_horus_company(
    company_id: Optional[int] = Query(None, description="ID do seller para conexão Horus SQL"),
    document: str = Query(..., description="CNPJ ou CPF da empresa a pesquisar"),
    check_cliente: bool = Query(True, description="Consultar tabela CLIENTES do Horus"),
    check_fornecedor: bool = Query(True, description="Consultar tabela FORNECEDORES do Horus"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Pesquisa no banco SQL Server do Horus ERP por CPF/CNPJ:
    - Busca na tabela geral CLIENTES por COD_CLI, Razao Social, Apelido, Cidade e UF.
    - Busca na tabela FORNECEDORES amarrada ao cod_filial configurado nos dados da API (horus_branch).
    - Retorna dados completos para autopreenchimento imediato no formulário.
    """
    clean_doc = _sanitize_doc(document)
    if not clean_doc:
        raise HTTPException(status_code=400, detail="CNPJ/CPF inválido ou vazio para consulta no Horus.")

    # Identifica o seller / empresa ativo
    target_company_id = _resolve_seller_id(current_user, company_id)

    # Identificar CompanySettings correspondente
    settings = None
    if target_company_id:
        settings = db.query(CompanySettings).filter(CompanySettings.company_id == target_company_id).first()

    # Empresa para a conexão física Horus SQL:
    sql_company_id = target_company_id
    if not (settings and settings.horus_sql_enabled):
        active_sql = db.query(CompanySettings).filter(CompanySettings.horus_sql_enabled == True).first()
        if active_sql:
            sql_company_id = active_sql.company_id
            if not settings:
                settings = active_sql

    if not sql_company_id:
        raise HTTPException(status_code=400, detail="Nenhuma conexão Horus SQL configurada.")

    try:
        sql_client = HorusSQLClient(db, sql_company_id)
    except HorusSQLConfigError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"[DBM Horus Lookup] Falha ao inicializar client SQL: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao conectar ao banco Horus: {str(e)}")

    # ── Código de filial configurado nos dados da API (horus_branch) ──────────
    api_filial = None
    if settings:
        if settings.horus_branch and str(settings.horus_branch).strip():
            api_filial = str(settings.horus_branch).strip()
        elif settings.horus_sql_cod_filial and str(settings.horus_sql_cod_filial).strip():
            api_filial = str(settings.horus_sql_cod_filial).strip()

    cod_filial = int(api_filial) if (api_filial and api_filial.isdigit()) else (int(sql_client.cod_filial) if str(sql_client.cod_filial).isdigit() else 2)

    result = {
        "success": True,
        "clean_document": clean_doc,
        "filial_used": cod_filial,
        "cliente": {
            "found": False,
            "cod_cli": None,
            "nome_cli": None,
            "nome_reduzido": None,
            "cnpj_cpf": None,
            "cidade": None,
            "uf": None,
        },
        "fornecedor": {
            "found": False,
            "cod_fornecedor": None,
            "nom_fornecedor": None,
            "nom_fantasia": None,
            "cnpj_cpf": None,
            "cidade": None,
            "uf": None,
        },
    }

    # 1. Consulta em CLIENTES (Tabela geral) com Cidade e UF
    if check_cliente:
        try:
            sql_cli = """
                SELECT TOP 1 
                    c.COD_CLI, 
                    c.NOM_CLI, 
                    c.NOM_REDUZIDO, 
                    c.CNPJ, 
                    c.CPF,
                    u.SIGLA_UF,
                    cep.LOC_CIDADE
                FROM CLIENTES c WITH (NOLOCK)
                LEFT JOIN ENDERECOS_CLIENTE ec WITH (NOLOCK) 
                    ON ec.COD_CLI = c.COD_CLI
                LEFT JOIN TABELA_UF u WITH (NOLOCK) 
                    ON u.COD_UF = ec.COD_UF
                LEFT JOIN TABELA_CEP_IBGE cep WITH (NOLOCK) 
                    ON cep.COD_IBGE = ec.COD_IBGE
                WHERE REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(c.CNPJ, ''), '.', ''), '/', ''), '-', ''), ' ', '') = %s
                   OR REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(c.CPF, ''), '.', ''), '/', ''), '-', ''), ' ', '') = %s
                   OR c.CNPJ = %s
                   OR c.CPF = %s
                ORDER BY CASE WHEN ec.STA_DEFAULT = 'S' THEN 0 ELSE 1 END, ec.COD_END ASC
            """
            rows = sql_client.query(sql_cli, (clean_doc, clean_doc, clean_doc, clean_doc), max_rows=1)
            if rows and len(rows) > 0:
                row = rows[0]
                raw_cod = row.get("COD_CLI")
                cod_int = int(raw_cod) if str(raw_cod).isdigit() else None
                result["cliente"] = {
                    "found": True,
                    "cod_cli": cod_int,
                    "nome_cli": str(row.get("NOM_CLI") or "").strip(),
                    "nome_reduzido": str(row.get("NOM_REDUZIDO") or "").strip(),
                    "cnpj_cpf": str(row.get("CNPJ") or row.get("CPF") or "").strip(),
                    "cidade": str(row.get("LOC_CIDADE") or "").strip(),
                    "uf": str(row.get("SIGLA_UF") or "").strip().upper(),
                }
        except Exception as e:
            log.warning(f"[DBM Horus Lookup] Erro ao consultar CLIENTES: {e}")

    # 2. Consulta em FORNECEDORES (Tabela amarrada a COD_FILIAL da API)
    if check_fornecedor:
        try:
            sql_forn = f"""
                SELECT TOP 1 
                    f.COD_FORNECEDOR, 
                    f.NOM_FORNECEDOR, 
                    f.NOM_FANTASIA, 
                    f.CNPF_CNPJ, 
                    f.CPF,
                    u.SIGLA_UF,
                    cep.LOC_CIDADE
                FROM FORNECEDORES f WITH (NOLOCK)
                LEFT JOIN TABELA_UF u WITH (NOLOCK) 
                    ON u.COD_UF = f.UF
                LEFT JOIN TABELA_CEP_IBGE cep WITH (NOLOCK) 
                    ON cep.COD_IBGE = f.COD_IBGE
                WHERE f.COD_FILIAL = {cod_filial}
                  AND (
                    REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(f.CNPF_CNPJ, ''), '.', ''), '/', ''), '-', ''), ' ', '') = %s
                    OR REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(f.CPF, ''), '.', ''), '/', ''), '-', ''), ' ', '') = %s
                    OR f.CNPF_CNPJ = %s
                    OR f.CPF = %s
                  )
            """
            rows_forn = sql_client.query(sql_forn, (clean_doc, clean_doc, clean_doc, clean_doc), max_rows=1)
            if rows_forn and len(rows_forn) > 0:
                r_forn = rows_forn[0]
                raw_cod_forn = r_forn.get("COD_FORNECEDOR")
                cod_forn_int = int(raw_cod_forn) if str(raw_cod_forn).isdigit() else None
                result["fornecedor"] = {
                    "found": True,
                    "cod_fornecedor": cod_forn_int,
                    "nom_fornecedor": str(r_forn.get("NOM_FORNECEDOR") or "").strip(),
                    "nom_fantasia": str(r_forn.get("NOM_FANTASIA") or "").strip(),
                    "cnpj_cpf": str(r_forn.get("CNPF_CNPJ") or r_forn.get("CPF") or "").strip(),
                    "cidade": str(r_forn.get("LOC_CIDADE") or "").strip(),
                    "uf": str(r_forn.get("SIGLA_UF") or "").strip().upper(),
                }
            elif result["cliente"]["found"] and result["cliente"]["nome_cli"]:
                # Caso a linha do fornecedor esteja cadastrada na filial sem o CNPF_CNPJ preenchido,
                # localiza pelo nome do fornecedor/fantasia da filial
                cli_nome = result["cliente"]["nome_cli"]
                sql_forn_by_name = f"""
                    SELECT TOP 1 
                        f.COD_FORNECEDOR, 
                        f.NOM_FORNECEDOR, 
                        f.NOM_FANTASIA, 
                        f.CNPF_CNPJ, 
                        f.CPF,
                        u.SIGLA_UF,
                        cep.LOC_CIDADE
                    FROM FORNECEDORES f WITH (NOLOCK)
                    LEFT JOIN TABELA_UF u WITH (NOLOCK) 
                        ON u.COD_UF = f.UF
                    LEFT JOIN TABELA_CEP_IBGE cep WITH (NOLOCK) 
                        ON cep.COD_IBGE = f.COD_IBGE
                    WHERE f.COD_FILIAL = {cod_filial}
                      AND (
                        f.NOM_FORNECEDOR LIKE %s
                        OR %s LIKE f.NOM_FORNECEDOR + '%%'
                        OR f.NOM_FANTASIA LIKE %s
                      )
                """
                nome_param = f"%{cli_nome[:10]}%"
                rows_forn_name = sql_client.query(sql_forn_by_name, (nome_param, cli_nome, nome_param), max_rows=1)
                if rows_forn_name and len(rows_forn_name) > 0:
                    r_forn = rows_forn_name[0]
                    raw_cod_forn = r_forn.get("COD_FORNECEDOR")
                    cod_forn_int = int(raw_cod_forn) if str(raw_cod_forn).isdigit() else None
                    result["fornecedor"] = {
                        "found": True,
                        "cod_fornecedor": cod_forn_int,
                        "nom_fornecedor": str(r_forn.get("NOM_FORNECEDOR") or "").strip(),
                        "nom_fantasia": str(r_forn.get("NOM_FANTASIA") or "").strip(),
                        "cnpj_cpf": str(r_forn.get("CNPF_CNPJ") or r_forn.get("CPF") or "").strip(),
                        "cidade": str(r_forn.get("LOC_CIDADE") or "").strip(),
                        "uf": str(r_forn.get("SIGLA_UF") or "").strip().upper(),
                    }
        except Exception as e:
            log.warning(f"[DBM Horus Lookup] Erro ao consultar FORNECEDORES: {e}")

    return result


@router.get("/companies", response_model=dict)
def list_dbm_companies(
    company_id: Optional[int] = Query(None, description="Seller ativo para filtro contextual"),
    search: Optional[str] = Query(None, description="Busca por Fantasia (apelido), Razão Social, CNPJ ou Códigos Horus"),
    uf: Optional[str] = Query(None, description="Filtro por UF"),
    limit: int = Query(100, ge=1, le=500),
    skip: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Lista e busca empresas do Seller (tabela crm_customer) para a tela DBM.
    Garante isolamento absoluto por seller_company_id (sem expor outras empresas/tenants do sistema).
    """
    seller_id = _resolve_seller_id(current_user, company_id)

    query = db.query(Customer).filter(Customer.company_id == seller_id)

    if uf and uf.strip():
        query = query.filter(func.upper(Customer.state) == uf.strip().upper())

    if search and search.strip():
        term = f"%{search.strip()}%"
        clean_term = _sanitize_doc(search.strip())

        filters = [
            Customer.name.ilike(term),
            Customer.corporate_name.ilike(term),
            Customer.document.ilike(term),
        ]
        if clean_term:
            filters.append(func.regexp_replace(Customer.document, r"\D", "", "g").ilike(f"%{clean_term}%"))
            if clean_term.isdigit():
                clean_num = int(clean_term)
                filters.append(Customer.id == clean_num)
                filters.append(Customer.horus_cod_cli == clean_num)
                filters.append(Customer.horus_cod_fornecedor == clean_num)

        query = query.filter(or_(*filters))

    total = query.count()
    customers = query.order_by(Customer.id.desc()).offset(skip).limit(limit).all()

    items = []
    for c in customers:
        items.append({
            "id": c.id,
            "document": c.document or "",
            "name": c.name or "",
            "razao_social": c.corporate_name or c.name or "",
            "city": c.city or "",
            "state": c.state or "",
            "group_name": c.group_name or "",
            "segment": c.segment or "",
            "notes_message": c.notes_message or "",
            "customer_account": c.customer_account or "",
            "royalties_data": c.royalties_data or "",
            "min_order_total": round(float(c.min_order_total or 0.0), 2),
            "is_cliente": c.is_cliente if c.is_cliente is not None else True,
            "is_fornecedor": c.is_fornecedor if c.is_fornecedor is not None else False,
            "horus_cod_cli": c.horus_cod_cli,
            "horus_cod_fornecedor": c.horus_cod_fornecedor,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        })

    return {
        "items": items,
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/companies/{id}")
def get_dbm_company(
    id: int,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retorna os dados completos da empresa do seller pelo Código (Customer ID).
    """
    seller_id = _resolve_seller_id(current_user, company_id)
    cust = db.query(Customer).filter(
        Customer.id == id,
        Customer.company_id == seller_id
    ).first()
    if not cust:
        raise HTTPException(status_code=404, detail="Empresa não encontrada para este seller.")

    return {
        "id": cust.id,
        "document": cust.document or "",
        "name": cust.name or "",
        "razao_social": cust.corporate_name or cust.name or "",
        "city": cust.city or "",
        "state": cust.state or "",
        "group_name": cust.group_name or "",
        "segment": cust.segment or "",
        "notes_message": cust.notes_message or "",
        "customer_account": cust.customer_account or "",
        "royalties_data": cust.royalties_data or "",
        "min_order_total": round(float(cust.min_order_total or 0.0), 2),
        "is_cliente": cust.is_cliente if cust.is_cliente is not None else True,
        "is_fornecedor": cust.is_fornecedor if cust.is_fornecedor is not None else False,
        "horus_cod_cli": cust.horus_cod_cli,
        "horus_cod_fornecedor": cust.horus_cod_fornecedor,
        "created_at": cust.created_at.isoformat() if cust.created_at else None,
    }


@router.post("/companies")
def save_dbm_company(
    payload: DbmCompanySavePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Cadastra ou atualiza uma empresa do seller (crm_customer):
    - Valida se já existe na tabela crm_customer do seller (por ID ou por CNPJ/CPF).
    - Se já existir, atualiza os dados e vínculos com Horus.
    - Se não existir, cadastra isolado na conta deste seller.
    - NUNCA altera ou polui a tabela cmp_company (SaaS tenants).
    """
    seller_id = _resolve_seller_id(current_user, payload.seller_company_id)

    clean_doc = _sanitize_doc(payload.document)
    if not clean_doc:
        raise HTTPException(status_code=400, detail="CNPJ / CPF é obrigatório para cadastrar a empresa.")

    apelido = (payload.name or "").strip()
    if not apelido:
        raise HTTPException(status_code=400, detail="Fantasia (apelido) é obrigatório.")

    razao_social = (payload.razao_social or apelido).strip()

    # Validação de existência no escopo do seller
    existing_cust = None
    if payload.id and payload.id > 0:
        existing_cust = db.query(Customer).filter(
            Customer.id == payload.id,
            Customer.company_id == seller_id
        ).first()

    if not existing_cust:
        existing_cust = db.query(Customer).filter(
            Customer.company_id == seller_id,
            or_(
                func.regexp_replace(Customer.document, r"\D", "", "g") == clean_doc,
                Customer.document == payload.document.strip()
            )
        ).first()

    status_action = "updated" if existing_cust else "created"
    min_order_val = round(max(0.0, float(payload.min_order_total or 0.0)), 2)
    clean_group_name = (payload.group_name or "").strip() or None
    grp_id, _ = _get_or_create_customer_group(db, seller_id, clean_group_name) if clean_group_name else (None, False)

    if existing_cust:
        existing_cust.name = apelido
        existing_cust.corporate_name = razao_social
        existing_cust.document = clean_doc
        existing_cust.city = (payload.city or "").strip() or None
        existing_cust.state = (payload.state or "").strip().upper() or None
        existing_cust.group_name = clean_group_name
        if grp_id:
            existing_cust.default_group_id = grp_id
        existing_cust.segment = (payload.segment or "").strip() or None
        existing_cust.notes_message = (payload.notes_message or "").strip() or None
        existing_cust.customer_account = (payload.customer_account or "").strip() or None
        existing_cust.royalties_data = (payload.royalties_data or "").strip() or None
        existing_cust.min_order_total = min_order_val
        existing_cust.is_cliente = payload.is_cliente
        existing_cust.is_fornecedor = payload.is_fornecedor
        existing_cust.horus_cod_cli = payload.horus_cod_cli
        existing_cust.horus_cod_fornecedor = payload.horus_cod_fornecedor
        target_cust = existing_cust
    else:
        new_cust = Customer(
            company_id=seller_id,
            name=apelido,
            corporate_name=razao_social,
            document=clean_doc,
            city=(payload.city or "").strip() or None,
            state=(payload.state or "").strip().upper() or None,
            group_name=clean_group_name,
            default_group_id=grp_id,
            segment=(payload.segment or "").strip() or None,
            notes_message=(payload.notes_message or "").strip() or None,
            customer_account=(payload.customer_account or "").strip() or None,
            royalties_data=(payload.royalties_data or "").strip() or None,
            min_order_total=min_order_val,
            is_cliente=payload.is_cliente,
            is_fornecedor=payload.is_fornecedor,
            horus_cod_cli=payload.horus_cod_cli,
            horus_cod_fornecedor=payload.horus_cod_fornecedor,
            customer_type="PJ" if len(clean_doc) > 11 else "PF",
        )
        db.add(new_cust)
        db.flush()
        target_cust = new_cust

    db.commit()
    db.refresh(target_cust)

    return {
        "success": True,
        "action": status_action,
        "message": f"Empresa {status_action} com sucesso no Cronuz!",
        "company": {
            "id": target_cust.id,
            "document": target_cust.document,
            "name": target_cust.name,
            "razao_social": target_cust.corporate_name,
            "city": target_cust.city,
            "state": target_cust.state,
            "group_name": target_cust.group_name,
            "segment": target_cust.segment,
            "notes_message": target_cust.notes_message,
            "customer_account": target_cust.customer_account,
            "royalties_data": target_cust.royalties_data,
            "min_order_total": round(float(target_cust.min_order_total or 0.0), 2),
            "is_cliente": target_cust.is_cliente,
            "is_fornecedor": target_cust.is_fornecedor,
            "horus_cod_cli": target_cust.horus_cod_cli,
            "horus_cod_fornecedor": target_cust.horus_cod_fornecedor,
            "created_at": target_cust.created_at.isoformat() if target_cust.created_at else None,
        }
    }


# ── Importação Inteligente de Planilha Excel / CSV ────────────────────────────

@router.get("/companies/import/template")
def download_dbm_import_template(
    mode: Optional[str] = Query(None, description="Modo da planilha modelo: cliente, fornecedor ou apelido_only")
):
    """
    Gera e entrega modelo Excel (.xlsx) para importação de empresas no DBM.
    """
    wb = openpyxl.Workbook()
    ws = wb.active

    mode_clean = (mode or "").strip().lower()
    if mode_clean in ("apelido_only", "atualizar_apelido"):
        ws.title = "Atualizar Apelido"
        headers = [
            "codigo_horus",
            "apelido",
        ]
        ws.append(headers)
        sample_rows = [
            [19, "WMF Paulista"],
            [11740, "EO EDITORA"],
            [2, "Livraria Cultura"],
        ]
        for r in sample_rows:
            ws.append(r)
        filename = "modelo_atualizar_apelido_horus.xlsx"
    elif mode_clean in ("grupo_segmento", "atualizar_grupo_segmento"):
        ws.title = "Grupo e Segmento"
        headers = [
            "codigo_horus",
            "grupo",
            "segmento",
        ]
        ws.append(headers)
        sample_rows = [
            [19, "Grupo Martins Fontes", "Livrarias"],
            [11740, "Grupo Editorial", "Editoras"],
            [2, "Rede Cultura", "Livrarias"],
        ]
        for r in sample_rows:
            ws.append(r)
        filename = "modelo_atualizar_grupo_segmento_horus.xlsx"
    else:
        ws.title = "Importacao DBM"
        headers = [
            "codigo_horus",
            "apelido",
            "grupo",
            "segmento",
            "obs da empresa",
            "detalhes fechamento roy",
            "account"
        ]
        ws.append(headers)

        sample_rows = [
            [11740, "EO EDITORA", "Grupo Editorial", "Editoras", "Instruções de faturamento e notas", "Banco do Brasil Ag 1234 CC 5678", "ACC-1001"],
            [2, "Livraria Cultura", "Varejo", "Livrarias", "Entregar somente em horário comercial", "", "ACC-2002"]
        ]
        for r in sample_rows:
            ws.append(r)
        filename = "modelo_importacao_empresas_dbm.xlsx"

    # Ajusta largura das colunas
    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 18)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.post("/companies/import/parse")
async def parse_dbm_companies_sheet(
    file: UploadFile = File(...),
    company_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Recebe planilha (.xlsx ou .csv), valida integridade e tamanho (máx 10 MB),
    faz parsing flexível das colunas e retorna as linhas com código Horus.
    """
    clean_filename = validate_file_size_and_extension(file, category="sheet")
    file_bytes = await read_file_safely(file, max_size_bytes=10 * 1024 * 1024)

    # Identificar seller / isolamento de pastas
    target_seller_id = _resolve_seller_id(current_user, company_id)

    # Salva na pasta isolada de uploads do seller (uploads/<company_id>/sheets/)
    upload_dir = Path("uploads") / str(target_seller_id) / "sheets"
    upload_dir.mkdir(parents=True, exist_ok=True)
    timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    dest_path = upload_dir / f"dbm_import_{timestamp_str}_{clean_filename}"
    try:
        with open(dest_path, "wb") as f:
            f.write(file_bytes)
    except Exception as e:
        log.warning(f"[DBM Import] Não foi possível persistir cópia da planilha em disco: {e}")

    # Leitura das linhas
    ext = Path(clean_filename).suffix.lower()
    raw_rows = []

    if ext in [".xlsx", ".ods"]:
        try:
            wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
            sheet = wb.active
            for row in sheet.iter_rows(values_only=True):
                cleaned_row = ["" if v is None else str(v).strip() for v in row]
                if any(cleaned_row):
                    raw_rows.append(cleaned_row)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Erro ao ler arquivo Excel (.xlsx): {str(e)}")
    elif ext == ".csv":
        try:
            text_content = None
            for encoding in ["utf-8-sig", "utf-8", "latin-1", "cp1252"]:
                try:
                    text_content = file_bytes.decode(encoding)
                    break
                except UnicodeDecodeError:
                    continue
            if not text_content:
                raise HTTPException(status_code=400, detail="Não foi possível decodificar o arquivo CSV.")
            
            sample = text_content[:2048]
            delimiter = ";" if sample.count(";") > sample.count(",") else ","
            reader = csv.reader(io.StringIO(text_content), delimiter=delimiter)
            for r in reader:
                cleaned_row = [str(c).strip() for c in r]
                if any(cleaned_row):
                    raw_rows.append(cleaned_row)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Erro ao ler arquivo CSV: {str(e)}")

    if not raw_rows or len(raw_rows) < 2:
        raise HTTPException(status_code=400, detail="A planilha está vazia ou não contém cabeçalhos e registros válidos.")

    headers = raw_rows[0]
    col_map = _map_columns(headers)

    if "codigo_horus" not in col_map:
        raise HTTPException(
            status_code=400, 
            detail="Não foi possível identificar a coluna com o Código do Horus. Verifique se o cabeçalho contém 'codigo_horus', 'cod_horus', 'cod_cli' ou 'cod_fornecedor'."
        )

    parsed_items = []
    idx_cod = col_map["codigo_horus"]
    idx_apelido = col_map.get("apelido")
    idx_grupo = col_map.get("grupo")
    idx_seg = col_map.get("segmento")
    idx_obs = col_map.get("obs_empresa")
    idx_roy = col_map.get("fechamento_roy")
    idx_acc = col_map.get("account")

    for row_idx, r in enumerate(raw_rows[1:], start=2):
        if idx_cod >= len(r):
            continue
        raw_val = r[idx_cod].strip()
        raw_val_clean = re.sub(r"[^\d]", "", raw_val)
        if not raw_val_clean.isdigit():
            continue
        
        cod_horus_int = int(raw_val_clean)
        if cod_horus_int <= 0:
            continue

        apelido = r[idx_apelido].strip() if idx_apelido is not None and idx_apelido < len(r) else ""
        grupo = r[idx_grupo].strip() if idx_grupo is not None and idx_grupo < len(r) else ""
        segmento = r[idx_seg].strip() if idx_seg is not None and idx_seg < len(r) else ""
        obs_empresa = r[idx_obs].strip() if idx_obs is not None and idx_obs < len(r) else ""
        fechamento_roy = r[idx_roy].strip() if idx_roy is not None and idx_roy < len(r) else ""
        account = r[idx_acc].strip() if idx_acc is not None and idx_acc < len(r) else ""

        parsed_items.append({
            "row_index": row_idx,
            "codigo_horus": cod_horus_int,
            "apelido": apelido or None,
            "grupo": grupo or None,
            "segmento": segmento or None,
            "obs_empresa": obs_empresa or None,
            "fechamento_roy": fechamento_roy or None,
            "account": account or None,
        })

    if not parsed_items:
        raise HTTPException(
            status_code=400,
            detail="Nenhuma linha com código de cliente Horus válido foi encontrada na planilha."
        )

    return {
        "success": True,
        "filename": clean_filename,
        "total_rows": len(parsed_items),
        "columns_detected": list(col_map.keys()),
        "preview": parsed_items[:5],
        "rows": parsed_items
    }


@router.post("/companies/import/process-batch")
def process_dbm_companies_import_batch(
    payload: DbmImportBatchPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Processa um lote de empresas parseadas da planilha para o Seller (crm_customer):
    1. Para cada empresa, busca dados no Horus pelo codigo_horus (tabela CLIENTES + FORNECEDORES).
    2. Preserva os dados informados na planilha (apelido, grupo, segmento, obs, royalties, account).
    3. Cadastra ou atualiza na tabela crm_customer do Seller.
    4. NUNCA toca na tabela cmp_company (SaaS tenants).
    """
    seller_id = _resolve_seller_id(current_user, payload.seller_company_id or payload.company_id)

    import_mode = (payload.import_mode or "cliente").strip().lower()
    is_fornecedor_mode = (import_mode == "fornecedor")
    is_apelido_only_mode = import_mode in ("apelido_only", "atualizar_apelido")
    is_grupo_segmento_mode = import_mode in ("grupo_segmento", "atualizar_grupo_segmento")
    is_partial_local_mode = is_apelido_only_mode or is_grupo_segmento_mode

    # Identificar CompanySettings correspondente
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == seller_id).first()

    # Empresa de conexão Horus SQL
    sql_company_id = seller_id
    if not (settings and settings.horus_sql_enabled):
        active_sql = db.query(CompanySettings).filter(CompanySettings.horus_sql_enabled == True).first()
        if active_sql:
            sql_company_id = active_sql.company_id
            if not settings:
                settings = active_sql

    sql_client = None
    if sql_company_id:
        try:
            sql_client = HorusSQLClient(db, sql_company_id)
        except Exception as e:
            if not is_partial_local_mode:
                raise HTTPException(status_code=500, detail=f"Erro ao conectar ao banco Horus: {str(e)}")
            log.warning(f"[DBM Batch Import] Conexão SQL indisponível em modo parcial (seguindo com base local): {e}")
    elif not is_partial_local_mode:
        raise HTTPException(status_code=400, detail="Nenhuma conexão Horus SQL configurada no sistema.")

    # Filial configurada nos dados da API (horus_branch)
    api_filial = None
    if settings:
        if settings.horus_branch and str(settings.horus_branch).strip():
            api_filial = str(settings.horus_branch).strip()
        elif settings.horus_sql_cod_filial and str(settings.horus_sql_cod_filial).strip():
            api_filial = str(settings.horus_sql_cod_filial).strip()

    cod_filial = int(api_filial) if (api_filial and api_filial.isdigit()) else (int(sql_client.cod_filial) if (sql_client and str(sql_client.cod_filial).isdigit()) else 2)

    results = []
    
    for item in payload.items:
        cod_horus = item.codigo_horus
        row_idx = item.row_index

        try:
            if is_apelido_only_mode:
                # ── MODO ATUALIZAR APENAS APELIDO (CÓD. HORUS + APELIDO) ──
                novo_apelido = (item.apelido or "").strip()
                if not novo_apelido:
                    results.append({
                        "row_index": row_idx,
                        "codigo_horus": cod_horus,
                        "apelido": "",
                        "status": "WARNING",
                        "action": "SKIPPED",
                        "message": f"Cód. Horus #{cod_horus}: coluna 'apelido' está vazia na planilha (registro ignorado)."
                    })
                    continue

                # 1. Busca direta na base do Seller pelo Cód. Cliente Horus ou Cód. Fornecedor Horus
                existing_cust = db.query(Customer).filter(
                    Customer.company_id == seller_id,
                    Customer.horus_cod_cli == cod_horus
                ).first()

                if not existing_cust:
                    existing_cust = db.query(Customer).filter(
                        Customer.company_id == seller_id,
                        Customer.horus_cod_fornecedor == cod_horus
                    ).first()

                # 2. Caso o cliente exista na base pelo CNPJ mas ainda não esteja com horus_cod_cli gravado,
                # consulta rapidamente o CNPJ no Horus SQL para amarrar e atualizar só o apelido
                if not existing_cust and sql_client:
                    try:
                        rows_doc = sql_client.query(
                            "SELECT TOP 1 CNPJ, CPF FROM CLIENTES WITH (NOLOCK) WHERE COD_CLI = %s",
                            (cod_horus,),
                            max_rows=1
                        )
                        if rows_doc and len(rows_doc) > 0:
                            raw_doc = str(rows_doc[0].get("CNPJ") or rows_doc[0].get("CPF") or "").strip()
                            clean_doc = _sanitize_doc(raw_doc)
                            if clean_doc:
                                existing_cust = db.query(Customer).filter(
                                    Customer.company_id == seller_id,
                                    or_(
                                        func.regexp_replace(Customer.document, r"\D", "", "g") == clean_doc,
                                        Customer.document == clean_doc
                                    )
                                ).first()
                                if existing_cust and not existing_cust.horus_cod_cli:
                                    existing_cust.horus_cod_cli = cod_horus
                    except Exception as e_lookup:
                        log.debug(f"[DBM Batch Apelido] Aviso ao consultar CNPJ no Horus para #{cod_horus}: {e_lookup}")

                if not existing_cust:
                    results.append({
                        "row_index": row_idx,
                        "codigo_horus": cod_horus,
                        "apelido": novo_apelido,
                        "status": "WARNING",
                        "action": "SKIPPED",
                        "message": f"Empresa com Cód. Horus #{cod_horus} não encontrada na base para atualizar o apelido '{novo_apelido}'."
                    })
                    continue

                old_name = existing_cust.name
                existing_cust.name = novo_apelido
                db.commit()

                results.append({
                    "row_index": row_idx,
                    "codigo_horus": cod_horus,
                    "apelido": novo_apelido,
                    "razao_social": existing_cust.corporate_name,
                    "document": existing_cust.document,
                    "company_id": existing_cust.id,
                    "action": "UPDATED",
                    "status": "SUCCESS",
                    "message": f"Cód. Horus #{cod_horus}: Apelido atualizado de '{old_name}' para '{novo_apelido}'."
                })

            elif is_grupo_segmento_mode:
                # ── MODO ATUALIZAR APENAS GRUPO E SEGMENTO (CÓD. HORUS + GRUPO + SEGMENTO) ──
                novo_grupo = (item.grupo or "").strip()
                novo_segmento = (item.segmento or "").strip()
                if not novo_grupo and not novo_segmento:
                    results.append({
                        "row_index": row_idx,
                        "codigo_horus": cod_horus,
                        "apelido": "",
                        "status": "WARNING",
                        "action": "SKIPPED",
                        "message": f"Cód. Horus #{cod_horus}: colunas 'grupo' e 'segmento' estão vazias na planilha (registro ignorado)."
                    })
                    continue

                # 1. Busca direta na base do Seller pelo Cód. Cliente Horus ou Cód. Fornecedor Horus
                existing_cust = db.query(Customer).filter(
                    Customer.company_id == seller_id,
                    Customer.horus_cod_cli == cod_horus
                ).first()

                if not existing_cust:
                    existing_cust = db.query(Customer).filter(
                        Customer.company_id == seller_id,
                        Customer.horus_cod_fornecedor == cod_horus
                    ).first()

                # 2. Caso o cliente exista na base pelo CNPJ mas ainda não esteja com horus_cod_cli gravado,
                # consulta rapidamente o CNPJ no Horus SQL para amarrar e atualizar só grupo/segmento
                if not existing_cust and sql_client:
                    try:
                        rows_doc = sql_client.query(
                            "SELECT TOP 1 CNPJ, CPF FROM CLIENTES WITH (NOLOCK) WHERE COD_CLI = %s",
                            (cod_horus,),
                            max_rows=1
                        )
                        if rows_doc and len(rows_doc) > 0:
                            raw_doc = str(rows_doc[0].get("CNPJ") or rows_doc[0].get("CPF") or "").strip()
                            clean_doc = _sanitize_doc(raw_doc)
                            if clean_doc:
                                existing_cust = db.query(Customer).filter(
                                    Customer.company_id == seller_id,
                                    or_(
                                        func.regexp_replace(Customer.document, r"\D", "", "g") == clean_doc,
                                        Customer.document == clean_doc
                                    )
                                ).first()
                                if existing_cust and not existing_cust.horus_cod_cli:
                                    existing_cust.horus_cod_cli = cod_horus
                    except Exception as e_lookup:
                        log.debug(f"[DBM Batch Grupo/Segmento] Aviso ao consultar CNPJ no Horus para #{cod_horus}: {e_lookup}")

                if not existing_cust:
                    results.append({
                        "row_index": row_idx,
                        "codigo_horus": cod_horus,
                        "apelido": f"Horus #{cod_horus}",
                        "status": "WARNING",
                        "action": "SKIPPED",
                        "message": f"Empresa com Cód. Horus #{cod_horus} não encontrada na base para atualizar Grupo/Segmento."
                    })
                    continue

                changes_desc = []
                if novo_grupo:
                    grp_id, grp_created = _get_or_create_customer_group(db, seller_id, novo_grupo)
                    existing_cust.group_name = novo_grupo
                    if grp_id:
                        existing_cust.default_group_id = grp_id
                    if grp_created:
                        changes_desc.append(f"Grupo='{novo_grupo}' (novo grupo criado no Cronuz)")
                    else:
                        changes_desc.append(f"Grupo='{novo_grupo}'")

                if novo_segmento:
                    existing_cust.segment = novo_segmento
                    changes_desc.append(f"Segmento='{novo_segmento}'")

                db.commit()

                results.append({
                    "row_index": row_idx,
                    "codigo_horus": cod_horus,
                    "apelido": existing_cust.name,
                    "razao_social": existing_cust.corporate_name,
                    "document": existing_cust.document,
                    "company_id": existing_cust.id,
                    "action": "UPDATED",
                    "status": "SUCCESS",
                    "message": f"Cód. Horus #{cod_horus} ({existing_cust.name}): {', '.join(changes_desc)}."
                })

            elif is_fornecedor_mode:
                # ── MODO FORNECEDOR: Consulta na tabela FORNECEDORES (Filial configurada) ──
                sql_forn = f"""
                    SELECT TOP 1 
                        f.COD_FORNECEDOR, 
                        f.NOM_FORNECEDOR, 
                        f.NOM_FANTASIA, 
                        f.CNPF_CNPJ, 
                        f.CPF,
                        u.SIGLA_UF, 
                        cep.LOC_CIDADE
                    FROM FORNECEDORES f WITH (NOLOCK)
                    LEFT JOIN TABELA_UF u WITH (NOLOCK) ON u.COD_UF = f.UF
                    LEFT JOIN TABELA_CEP_IBGE cep WITH (NOLOCK) ON cep.COD_IBGE = f.COD_IBGE
                    WHERE f.COD_FORNECEDOR = %s AND f.COD_FILIAL = {cod_filial}
                """
                rows = sql_client.query(sql_forn, (cod_horus,), max_rows=1)
                
                if not rows or len(rows) == 0:
                    results.append({
                        "row_index": row_idx,
                        "codigo_horus": cod_horus,
                        "apelido": item.apelido or f"Fornecedor #{cod_horus}",
                        "status": "WARNING",
                        "action": "SKIPPED",
                        "message": f"Fornecedor #{cod_horus} não localizado na tabela FORNECEDORES (Filial {cod_filial}) do Horus ERP."
                    })
                    continue

                r_forn = rows[0]
                nom_forn = str(r_forn.get("NOM_FORNECEDOR") or "").strip()
                nom_fantasia = str(r_forn.get("NOM_FANTASIA") or "").strip()
                raw_doc = str(r_forn.get("CNPF_CNPJ") or r_forn.get("CPF") or "").strip()
                clean_doc = _sanitize_doc(raw_doc)
                city_horus = str(r_forn.get("LOC_CIDADE") or "").strip() or None
                uf_horus = str(r_forn.get("SIGLA_UF") or "").strip().upper() or None

                # Fallback se não tiver CNPJ nem CPF no Horus
                if not clean_doc:
                    clean_doc = f"FORN{cod_horus:08d}"

                # Consulta cruzada em CLIENTES no Horus para descobrir COD_CLI caso exista
                horus_cod_cli = None
                is_cliente = False
                try:
                    sql_cli_link = """
                        SELECT TOP 1 c.COD_CLI
                        FROM CLIENTES c WITH (NOLOCK)
                        WHERE (
                            REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(c.CNPJ, ''), '.', ''), '/', ''), '-', ''), ' ', '') = %s
                            OR REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(c.CPF, ''), '.', ''), '/', ''), '-', ''), ' ', '') = %s
                            OR c.NOM_CLI = %s
                            OR c.NOM_REDUZIDO = %s
                        )
                    """
                    rows_cli_link = sql_client.query(
                        sql_cli_link, 
                        (clean_doc, clean_doc, nom_forn, nom_fantasia or nom_forn), 
                        max_rows=1
                    )
                    if rows_cli_link and len(rows_cli_link) > 0:
                        raw_cli = rows_cli_link[0].get("COD_CLI")
                        if str(raw_cli).isdigit():
                            horus_cod_cli = int(raw_cli)
                            is_cliente = True
                except Exception as ecl:
                    log.warning(f"[DBM Batch Import] Erro ao buscar vínculo CLIENTES para fornecedor #{cod_horus}: {ecl}")

                # Mesclagem de dados (Planilha tem prioridade para campos descritivos)
                apelido = (item.apelido or "").strip()
                if not apelido:
                    apelido = nom_fantasia or nom_forn or f"Fornecedor {cod_horus}"

                razao_social = nom_forn or apelido
                grupo = (item.grupo or "").strip() or None
                grp_id, _ = _get_or_create_customer_group(db, seller_id, grupo) if grupo else (None, False)
                segmento = (item.segmento or "").strip() or "Editoras"
                obs = (item.obs_empresa or "").strip() or None
                fechamento_roy = (item.fechamento_roy or "").strip() or None
                account = (item.account or "").strip() or None

                # Localização / Atualização / Criação no crm_customer DO SELLER
                existing_cust = db.query(Customer).filter(
                    Customer.company_id == seller_id,
                    or_(
                        Customer.horus_cod_fornecedor == cod_horus,
                        func.regexp_replace(Customer.document, r"\D", "", "g") == clean_doc,
                        Customer.document == clean_doc
                    )
                ).first()

                action = "UPDATED" if existing_cust else "CREATED"

                if existing_cust:
                    existing_cust.name = apelido
                    if nom_forn:
                        existing_cust.corporate_name = nom_forn
                    if clean_doc:
                        existing_cust.document = clean_doc
                    if city_horus:
                        existing_cust.city = city_horus
                    if uf_horus:
                        existing_cust.state = uf_horus
                    if grupo:
                        existing_cust.group_name = grupo
                    if grp_id:
                        existing_cust.default_group_id = grp_id
                    if segmento:
                        existing_cust.segment = segmento
                    if obs:
                        existing_cust.notes_message = obs
                    if account:
                        existing_cust.customer_account = account
                    if fechamento_roy:
                        existing_cust.royalties_data = fechamento_roy

                    existing_cust.is_fornecedor = True
                    existing_cust.horus_cod_fornecedor = cod_horus
                    if is_cliente and horus_cod_cli:
                        existing_cust.is_cliente = True
                        existing_cust.horus_cod_cli = horus_cod_cli

                    target_cust = existing_cust
                else:
                    new_cust = Customer(
                        company_id=seller_id,
                        document=clean_doc,
                        name=apelido,
                        corporate_name=razao_social,
                        city=city_horus,
                        state=uf_horus,
                        group_name=grupo,
                        default_group_id=grp_id,
                        segment=segmento,
                        notes_message=obs,
                        customer_account=account,
                        royalties_data=fechamento_roy,
                        is_cliente=is_cliente,
                        is_fornecedor=True,
                        horus_cod_cli=horus_cod_cli,
                        horus_cod_fornecedor=cod_horus,
                        customer_type="PJ" if len(clean_doc) > 11 else "PF",
                    )
                    db.add(new_cust)
                    db.flush()
                    target_cust = new_cust

                db.commit()

                results.append({
                    "row_index": row_idx,
                    "codigo_horus": cod_horus,
                    "apelido": apelido,
                    "razao_social": razao_social,
                    "document": clean_doc,
                    "company_id": target_cust.id,
                    "action": action,
                    "status": "SUCCESS",
                    "message": f"Fornecedor '{apelido}' ({action.lower()}) vinculado ao Horus Fornecedor #{cod_horus} (Filial {cod_filial})"
                })

            else:
                # ── MODO CLIENTE: Consulta na tabela CLIENTES ────────
                # 1. Consulta no Horus CLIENTES
                sql_cli = """
                    SELECT TOP 1 
                        c.COD_CLI, c.NOM_CLI, c.NOM_REDUZIDO, c.CNPJ, c.CPF,
                        u.SIGLA_UF, cep.LOC_CIDADE
                    FROM CLIENTES c WITH (NOLOCK)
                    LEFT JOIN ENDERECOS_CLIENTE ec WITH (NOLOCK) ON ec.COD_CLI = c.COD_CLI
                    LEFT JOIN TABELA_UF u WITH (NOLOCK) ON u.COD_UF = ec.COD_UF
                    LEFT JOIN TABELA_CEP_IBGE cep WITH (NOLOCK) ON cep.COD_IBGE = ec.COD_IBGE
                    WHERE c.COD_CLI = %s
                    ORDER BY CASE WHEN ec.STA_DEFAULT = 'S' THEN 0 ELSE 1 END, ec.COD_END ASC
                """
                rows = sql_client.query(sql_cli, (cod_horus,), max_rows=1)
                
                if not rows or len(rows) == 0:
                    results.append({
                        "row_index": row_idx,
                        "codigo_horus": cod_horus,
                        "apelido": item.apelido or f"Horus #{cod_horus}",
                        "status": "WARNING",
                        "action": "SKIPPED",
                        "message": f"Cliente #{cod_horus} não localizado na tabela CLIENTES do Horus ERP."
                    })
                    continue

                r_cli = rows[0]
                nom_cli = str(r_cli.get("NOM_CLI") or "").strip()
                nom_reduzido = str(r_cli.get("NOM_REDUZIDO") or "").strip()
                raw_doc = str(r_cli.get("CNPJ") or r_cli.get("CPF") or "").strip()
                clean_doc = _sanitize_doc(raw_doc)
                city_horus = str(r_cli.get("LOC_CIDADE") or "").strip() or None
                uf_horus = str(r_cli.get("SIGLA_UF") or "").strip().upper() or None

                # Fallback se não tiver CNPJ nem CPF no Horus
                if not clean_doc:
                    clean_doc = f"HORUS{cod_horus:08d}"

                # 2. Consulta no Horus FORNECEDORES na filial da API
                horus_cod_fornecedor = None
                is_fornecedor = False
                try:
                    sql_forn = f"""
                        SELECT TOP 1 f.COD_FORNECEDOR
                        FROM FORNECEDORES f WITH (NOLOCK)
                        WHERE f.COD_FILIAL = {cod_filial}
                          AND (
                            REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(f.CNPF_CNPJ, ''), '.', ''), '/', ''), '-', ''), ' ', '') = %s
                            OR REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(f.CPF, ''), '.', ''), '/', ''), '-', ''), ' ', '') = %s
                            OR f.NOM_FORNECEDOR = %s
                            OR f.NOM_FANTASIA = %s
                          )
                    """
                    rows_forn = sql_client.query(sql_forn, (clean_doc, clean_doc, nom_cli, nom_reduzido or nom_cli), max_rows=1)
                    if rows_forn and len(rows_forn) > 0:
                        raw_forn = rows_forn[0].get("COD_FORNECEDOR")
                        if str(raw_forn).isdigit():
                            horus_cod_fornecedor = int(raw_forn)
                            is_fornecedor = True
                except Exception as ef:
                    log.warning(f"[DBM Batch Import] Erro ao buscar fornecedor #{cod_horus}: {ef}")

                # 3. Mesclagem inteligente de dados
                # A planilha tem PRIORIDADE para: apelido, grupo, segmento, obs, royalties, account
                apelido = (item.apelido or "").strip()
                if not apelido:
                    apelido = nom_reduzido or nom_cli or f"Cliente {cod_horus}"

                razao_social = nom_cli or apelido
                grupo = (item.grupo or "").strip() or None
                grp_id, _ = _get_or_create_customer_group(db, seller_id, grupo) if grupo else (None, False)
                segmento = (item.segmento or "").strip() or "Editoras"
                obs = (item.obs_empresa or "").strip() or None
                fechamento_roy = (item.fechamento_roy or "").strip() or None
                account = (item.account or "").strip() or None

                # 4. Localização / Atualização / Criação no crm_customer DO SELLER
                existing_cust = db.query(Customer).filter(
                    Customer.company_id == seller_id,
                    or_(
                        Customer.horus_cod_cli == cod_horus,
                        func.regexp_replace(Customer.document, r"\D", "", "g") == clean_doc,
                        Customer.document == clean_doc
                    )
                ).first()

                action = "UPDATED" if existing_cust else "CREATED"

                if existing_cust:
                    existing_cust.name = apelido
                    if nom_cli:
                        existing_cust.corporate_name = nom_cli
                    if clean_doc:
                        existing_cust.document = clean_doc
                    if city_horus:
                        existing_cust.city = city_horus
                    if uf_horus:
                        existing_cust.state = uf_horus
                    if grupo:
                        existing_cust.group_name = grupo
                    if grp_id:
                        existing_cust.default_group_id = grp_id
                    if segmento:
                        existing_cust.segment = segmento
                    if obs:
                        existing_cust.notes_message = obs
                    if account:
                        existing_cust.customer_account = account
                    if fechamento_roy:
                        existing_cust.royalties_data = fechamento_roy

                    existing_cust.is_cliente = True
                    existing_cust.horus_cod_cli = cod_horus
                    if is_fornecedor and horus_cod_fornecedor:
                        existing_cust.is_fornecedor = True
                        existing_cust.horus_cod_fornecedor = horus_cod_fornecedor

                    target_cust = existing_cust
                else:
                    new_cust = Customer(
                        company_id=seller_id,
                        document=clean_doc,
                        name=apelido,
                        corporate_name=razao_social,
                        city=city_horus,
                        state=uf_horus,
                        group_name=grupo,
                        default_group_id=grp_id,
                        segment=segmento,
                        notes_message=obs,
                        customer_account=account,
                        royalties_data=fechamento_roy,
                        is_cliente=True,
                        is_fornecedor=is_fornecedor,
                        horus_cod_cli=cod_horus,
                        horus_cod_fornecedor=horus_cod_fornecedor,
                        customer_type="PJ" if len(clean_doc) > 11 else "PF",
                    )
                    db.add(new_cust)
                    db.flush()
                    target_cust = new_cust

                db.commit()

                results.append({
                    "row_index": row_idx,
                    "codigo_horus": cod_horus,
                    "apelido": apelido,
                    "razao_social": razao_social,
                    "document": clean_doc,
                    "company_id": target_cust.id,
                    "action": action,
                    "status": "SUCCESS",
                    "message": f"Empresa '{apelido}' ({action.lower()}) vinculada ao Horus Cliente #{cod_horus}"
                })

        except Exception as e:
            db.rollback()
            log.error(f"[DBM Batch Import] Erro no item linha {row_idx} (Horus #{cod_horus}): {e}")
            results.append({
                "row_index": row_idx,
                "codigo_horus": cod_horus,
                "apelido": item.apelido or f"Horus #{cod_horus}",
                "status": "ERROR",
                "action": "FAILED",
                "message": f"Erro interno ao processar linha {row_idx}: {str(e)}"
            })

    return {
        "success": True,
        "seller_company_id": seller_id,
        "import_mode": import_mode,
        "total_processed": len(results),
        "results": results
    }


# ══════════════════════════════════════════════════════════════════════════════
# MESA COMERCIAL / ORÇAMENTOS DBM (HÍBRIDO: HORUS SQL + HORUS API + CRONUZ DB)
# ══════════════════════════════════════════════════════════════════════════════

CFOP_ACERTO_LIST = ("5113", "5114", "6113", "6114")
CFOP_VENDA_LIST = ("5101", "5102", "5108", "6101", "6102", "6108", "5403", "6403", "5405", "6405")
CFOP_REMESSA_LIST = ("5917", "6917")
CFOP_DEVOLUCAO_LIST = ("1918", "2918", "1201", "1202", "2201", "2202", "1410", "1411", "2410", "2411")

# Cache em memória de curta duração (TTL 45s) para acelerar re-consultas de Reposição sem sobrecarregar o SQL Server
import time as _time
import threading as _threading
_REPLENISHMENT_CACHE: Dict[tuple, Dict[str, Any]] = {}
_REPLENISHMENT_CACHE_LOCK = _threading.Lock()
_REPLENISHMENT_CACHE_TTL = 45.0


def _build_sargable_cfop_in_sql(cfops: Any) -> str:
    """
    Gera lista SQL IN (...) 100% SARGable (compatível com índices do SQL Server sem precisar de REPLACE/LTRIM linha a linha).
    Inclui variações sem pontuação ('5917') e com ponto/vírgula ('5.917', '5,917').
    No SQL Server, comparações '=' e 'IN' em CHAR/VARCHAR ignoram espaços à direita nativamente (ANSI padding).
    """
    variants: list[str] = []
    for raw in cfops:
        c = re.sub(r"\D", "", str(raw or ""))
        if not c:
            continue
        variants.append(f"'{c}'")
        if len(c) == 4:
            variants.append(f"'{c[0]}.{c[1:]}'")
            variants.append(f"'{c[0]},{c[1:]}'")
    return ", ".join(dict.fromkeys(variants))


def _format_br_date(val) -> str:
    if not val:
        return "—"
    if hasattr(val, "strftime"):
        return val.strftime("%d/%m/%Y")
    s = str(val).strip()
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return f"{s[8:10]}/{s[5:7]}/{s[0:4]}"
    return s[:10]


def _parse_any_datetime(val) -> Optional[datetime]:
    if not val:
        return None
    if isinstance(val, datetime):
        return val.replace(tzinfo=None)
    s = str(val).strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            slice_len = 19 if ("T" in fmt or ":" in fmt) else 10
            return datetime.strptime(s[:slice_len], fmt)
        except Exception:
            continue
    return None


def _compute_launch_metadata(launch_dt: Optional[datetime], now_dt: datetime) -> dict:
    """
    Calcula metadados da regra de Novidades:
    - Exibir produtos de 9 meses para trás (270 dias) e 6 meses para frente (180 dias).
    - Indica se é PRÉ-LANÇAMENTO, VIGENTE ou EXPIRANDO (faltando <= 30 dias para sair da janela de 9 meses).
    """
    if not launch_dt:
        return {
            "launchDate": None,
            "launchMonthYear": None,
            "daysToExpire": None,
            "launchStatus": None,
            "launchLabel": None,
        }
    dt_naive = launch_dt.replace(tzinfo=None) if hasattr(launch_dt, "tzinfo") and launch_dt.tzinfo else launch_dt
    days_since_launch = (now_dt - dt_naive).days
    days_to_expire = 270 - days_since_launch  # 9 meses = 270 dias
    date_br = dt_naive.strftime("%d/%m/%Y")
    month_year = dt_naive.strftime("%m/%Y")

    if dt_naive > now_dt:
        days_until = (dt_naive - now_dt).days
        return {
            "launchDate": date_br,
            "launchMonthYear": month_year,
            "daysToExpire": days_to_expire,
            "launchStatus": "PRE_LANCAMENTO",
            "launchLabel": f"Pré-lanç. ({date_br} • em {days_until}d)",
        }
    elif 0 <= days_to_expire <= 30:
        return {
            "launchDate": date_br,
            "launchMonthYear": month_year,
            "daysToExpire": days_to_expire,
            "launchStatus": "EXPIRANDO",
            "launchLabel": f"Lanç: {month_year} • Expira em {max(1, days_to_expire)}d",
        }
    elif days_to_expire < 0:
        return {
            "launchDate": date_br,
            "launchMonthYear": month_year,
            "daysToExpire": days_to_expire,
            "launchStatus": "EXPIRADO",
            "launchLabel": f"Lanç: {month_year}",
        }
    else:
        return {
            "launchDate": date_br,
            "launchMonthYear": month_year,
            "daysToExpire": days_to_expire,
            "launchStatus": "VIGENTE",
            "launchLabel": f"Lanç: {month_year} ({days_to_expire}d rest.)",
        }


def _detect_horus_launch_col(sql_client: HorusSQLClient) -> str:
    """Detecta a coluna de data de lançamento em ITENS_ESTOQUE_GERAL de forma resiliente."""
    try:
        cols_res = sql_client.query(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ITENS_ESTOQUE_GERAL' AND COLUMN_NAME IN ('DAT_LANCAMENTO', 'DAT_EXP_LANCTO', 'DAT_EDICAO', 'DAT_CADASTRO', 'DAT_VAL_ESTGRUPO')",
            max_rows=10
        )
        avail_cols = {str(c.get("COLUMN_NAME") or "").upper() for c in (cols_res or [])}
        ordered = [f"I.{c}" for c in ("DAT_LANCAMENTO", "DAT_EXP_LANCTO", "DAT_EDICAO", "DAT_CADASTRO", "DAT_VAL_ESTGRUPO") if c in avail_cols]
        if ordered:
            return f"COALESCE({', '.join(ordered)})" if len(ordered) > 1 else ordered[0]
    except Exception:
        pass
    return "I.DAT_VAL_ESTGRUPO"


def _resolve_customer_horus_cod_cli(
    db: Session,
    customer: Customer,
    sql_client: Optional[HorusSQLClient]
) -> Optional[int]:
    """Garante o COD_CLI do cliente no Horus (via coluna local, SQL CLIENTES ou HorusBISale) sem alterar o banco."""
    if customer.horus_cod_cli:
        return int(customer.horus_cod_cli)

    clean_doc = _sanitize_doc(customer.document or "")
    if sql_client and clean_doc:
        try:
            rows = sql_client.query(
                """
                SELECT TOP 1 COD_CLI
                FROM CLIENTES WITH (NOLOCK)
                WHERE REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(CNPJ, ''), '.', ''), '/', ''), '-', ''), ' ', '') = %s
                   OR REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(CPF, ''), '.', ''), '/', ''), '-', ''), ' ', '') = %s
                """,
                (clean_doc, clean_doc),
                max_rows=1
            )
            if rows and rows[0].get("COD_CLI"):
                return int(rows[0]["COD_CLI"])
        except Exception as e:
            log.warning(f"[DBM Desk] Aviso ao resolver COD_CLI via SQL: {e}")

    try:
        from app.models.horus_bi_sale import HorusBISale
        bi_row = db.query(HorusBISale.customer_horus_id).filter(
            HorusBISale.company_id == customer.company_id,
            HorusBISale.customer_id == customer.id
        ).first()
        if bi_row and bi_row.customer_horus_id:
            return int(bi_row.customer_horus_id)
    except Exception:
        pass

    return None


@router.get("/proposals-desk/customer-context/{customer_id}")
async def get_proposals_desk_customer_context(
    customer_id: int,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Carrega os dados cadastrais, financeiros e os 4 cards operacionais do cliente
    (Última Remessa, Última Venda, Último Acerto, Última Devolução) de forma HÍBRIDA:
    1. Horus SQL Server (NF_MESTRE + NF_ITENS + NF_ENTRADA + VW_ITENS_CONSIGNACAO + LANCTOS_CRECEBER)
    2. Horus B2B REST API (Busca_ClienteB2B + Busca_Contrato_Cliente_Sintetico)
    3. Base local Cronuz (crm_customer + horus_bi_sales)
    """
    from datetime import timedelta
    from app.models.company import Company
    from app.models.horus_bi_sale import HorusBISale
    from app.integrators.horus_clients import HorusClients

    seller_id = _resolve_seller_id(current_user, company_id)
    customer = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.company_id == seller_id
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == seller_id).first()
    company = db.query(Company).filter(Company.id == seller_id).first()

    sql_client = None
    try:
        sql_client = HorusSQLClient(db, seller_id)
    except Exception:
        sql_client = None

    cod_cli = _resolve_customer_horus_cod_cli(db, customer, sql_client)
    cod_empresa, cod_filial = _resolve_horus_empresa_filial(settings, sql_client)
    branch_cnpj = sql_client.get_branch_cnpj() if sql_client else None
    effective_cnpj_destino = branch_cnpj or _sanitize_doc(company.document or "") if company else ""

    credit_limit = float(customer.credit_limit or 0.0)
    used_credit = float(customer.open_debts or 0.0)
    overdue_debt = 0.0
    consigned_units = 0
    consigned_value = 0.0
    default_discount = float(customer.discount or 35.0)
    max_discount = max(default_discount, 45.0)
    api_customer_info: dict = {}

    # 1. Enriquecimento via API Horus (Financeiro e Contrato Consignação)
    if settings and getattr(settings, "horus_enabled", False) and getattr(settings, "horus_url", None) and effective_cnpj_destino and customer.document:
        try:
            h_client = HorusClients(db, seller_id)
            fin_res = await h_client.get_customer_financials(
                cnpj_destino=effective_cnpj_destino,
                cnpj_cliente=_sanitize_doc(customer.document or "")
            )
            if fin_res:
                api_customer_info = fin_res.get("raw") if isinstance(fin_res.get("raw"), dict) else {}
                if not cod_cli and fin_res.get("cod_cli"):
                    cod_cli = int(fin_res["cod_cli"])
                if float(fin_res.get("credit_limit") or 0) > 0:
                    credit_limit = float(fin_res["credit_limit"])
                if float(fin_res.get("debt_balance") or 0) > 0:
                    used_credit = float(fin_res["debt_balance"])
                if float(fin_res.get("discount") or 0) > 0:
                    default_discount = float(fin_res["discount"])
                    max_discount = max(default_discount, 50.0)
                if float(fin_res.get("remessa_balance") or 0) > 0:
                    consigned_value = float(fin_res["remessa_balance"])

            id_guid = (
                customer.id_guid
                or (fin_res.get("id_guid") if fin_res else "")
                or getattr(settings, "horus_default_b2b_guid", "")
                or ""
            )
            if id_guid:
                consig_res = await h_client.get_consignment_summary(
                    cnpj_destino=effective_cnpj_destino,
                    cnpj_cliente=_sanitize_doc(customer.document or ""),
                    id_guid=id_guid,
                    limit=50
                )
                if isinstance(consig_res, list):
                    for ctr in consig_res:
                        if isinstance(ctr, dict) and not ctr.get("Falha"):
                            consigned_units += int(float(str(ctr.get("SALDO_ITENS", 0) or 0).replace(",", ".")))
                            val_liq = float(str(ctr.get("VLR_TOTAL_LIQUIDO", 0) or 0).replace(",", "."))
                            if val_liq > 0:
                                consigned_value += val_liq
                elif isinstance(consig_res, dict) and not consig_res.get("Falha"):
                    consigned_units = int(float(str(consig_res.get("SALDO_ITENS", 0) or 0).replace(",", ".")))
                    val_liq = float(str(consig_res.get("VLR_TOTAL_LIQUIDO", 0) or 0).replace(",", "."))
                    if val_liq > 0:
                        consigned_value = val_liq
            await h_client.close()
        except Exception as e:
            log.warning(f"[DBM Desk] Aviso ao consultar API Horus p/ cliente {customer.id}: {e}")

    # 2. Enriquecimento Financeiro e Consignação via Horus SQL (LANCTOS_CRECEBER + VW_ITENS_CONSIGNACAO)
    if sql_client and cod_cli:
        try:
            fin_rows = sql_client.query(
                """
                SELECT
                    ISNULL(SUM(LR.VLR_SALDO_CRECEBER), 0) AS vlr_aberto,
                    ISNULL(SUM(CASE WHEN LR.DAT_VENCIMENTO < CAST(GETDATE() AS DATE) THEN LR.VLR_SALDO_CRECEBER ELSE 0 END), 0) AS vlr_vencido
                FROM LANCTOS_CRECEBER LR WITH (NOLOCK)
                WHERE LR.COD_CLI = %s
                  AND LR.STA_LANCTO_CRECEBER = 'AB'
                """,
                (cod_cli,),
                max_rows=1
            )
            if fin_rows:
                sql_aberto = float(fin_rows[0].get("vlr_aberto") or 0.0)
                sql_vencido = float(fin_rows[0].get("vlr_vencido") or 0.0)
                if sql_aberto > 0:
                    used_credit = sql_aberto
                overdue_debt = sql_vencido
        except Exception as e:
            log.warning(f"[DBM Desk] Aviso ao consultar LANCTOS_CRECEBER cliente #{cod_cli}: {e}")

        if consigned_units == 0:
            try:
                consig_sql_rows = sql_client.query(
                    f"""
                    SELECT
                        ISNULL(SUM(V.SALDO), 0) AS total_pecas,
                        ISNULL(SUM(V.SALDO * ISNULL(V.VLR_VENDIDO, V.VLR_PRECO * (1.0 - ISNULL(V.VLR_DESCONTO, 0) / 100.0))), 0) AS total_valor
                    FROM VW_ITENS_CONSIGNACAO V WITH (NOLOCK)
                    WHERE V.COD_CLI = %s
                      AND V.COD_EMPRESA = {cod_empresa}
                      AND V.COD_FILIAL = {cod_filial}
                      AND ISNULL(V.SALDO, 0) > 0
                    """,
                    (cod_cli,),
                    max_rows=1
                )
                if consig_sql_rows:
                    sql_pecas = int(float(consig_sql_rows[0].get("total_pecas") or 0))
                    sql_vlr = float(consig_sql_rows[0].get("total_valor") or 0.0)
                    if sql_pecas > 0:
                        consigned_units = sql_pecas
                    if consigned_value == 0 and sql_vlr > 0:
                        consigned_value = sql_vlr
            except Exception as e:
                log.warning(f"[DBM Desk] Aviso ao consultar VW_ITENS_CONSIGNACAO cliente #{cod_cli}: {e}")

    # 3. Cards de Últimas Operações (Remessa, Venda, Acerto, Devolução)
    ops_metrics = {
        "remessa": {"totalValue": 0.0, "totalUnits": 0, "date": "—", "doc": "—"},
        "venda": {"totalValue": 0.0, "totalUnits": 0, "date": "—", "doc": "—"},
        "acerto": {"totalValue": 0.0, "totalUnits": 0, "date": "—", "doc": "—"},
        "devolucao": {"totalValue": 0.0, "totalUnits": 0, "date": "—", "doc": "—"},
    }

    cfop_groups = {
        "remessa": CFOP_REMESSA_LIST,
        "venda": CFOP_VENDA_LIST,
        "acerto": CFOP_ACERTO_LIST,
        "devolucao": CFOP_DEVOLUCAO_LIST,
    }

    legacy_pagination = getattr(settings, "horus_legacy_pagination", False) if settings else False

    # 3A. Busca via Horus SQL (NF_MESTRE + NF_ITENS olhando apenas números no CFOP)
    if sql_client and cod_cli:
        for op_key, cfops in cfop_groups.items():
            cfop_in = ", ".join(f"'{c}'" for c in cfops)
            clean_cfop_expr = "REPLACE(REPLACE(REPLACE(RTRIM(LTRIM(ISNULL(NFI.COD_NATUREZA, NF.COD_NATUREZA))), '.', ''), ',', ''), ' ', '')"
            top_clause = "TOP 1" if legacy_pagination else ""
            offset_clause = "" if legacy_pagination else "OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY"

            sql_op = f"""
                SELECT {top_clause}
                    NF.COD_NF AS cod_nf,
                    ISNULL(NF.NRO_NOTA_FISCAL, CAST(NF.COD_NF AS VARCHAR)) AS nro_nf,
                    NF.DAT_EMISSAO_NF AS dat_emissao,
                    ISNULL(SUM(NFI.QTD_ITENS), 0) AS total_units,
                    ISNULL(SUM(NFI.VLR_LIQUIDO_ITEM), ISNULL(MAX(NF.VLR_LIQUIDO_NF), 0)) AS total_value
                FROM NF_MESTRE NF WITH (NOLOCK)
                INNER JOIN NF_ITENS NFI WITH (NOLOCK)
                    ON NFI.COD_NF = NF.COD_NF
                    AND NFI.COD_FILIAL = NF.COD_FILIAL
                    AND NFI.COD_EMPRESA = NF.COD_EMPRESA
                WHERE NF.COD_CLI = %s
                  AND NF.COD_EMPRESA = {cod_empresa}
                  AND NF.COD_FILIAL = {cod_filial}
                  AND ISNULL(NF.SIT_NF, '') NOT IN ('C', 'CAN')
                  AND {clean_cfop_expr} IN ({cfop_in})
                GROUP BY NF.COD_NF, NF.NRO_NOTA_FISCAL, NF.DAT_EMISSAO_NF
                ORDER BY NF.DAT_EMISSAO_NF DESC, NF.COD_NF DESC
                {offset_clause}
            """
            try:
                rows_op = sql_client.query(sql_op, (cod_cli,), max_rows=1)
                if rows_op and len(rows_op) > 0:
                    r_op = rows_op[0]
                    nro = str(r_op.get("nro_nf") or r_op.get("cod_nf") or "").strip()
                    ops_metrics[op_key] = {
                        "totalValue": round(float(r_op.get("total_value") or 0.0), 2),
                        "totalUnits": int(float(r_op.get("total_units") or 0)),
                        "date": _format_br_date(r_op.get("dat_emissao")),
                        "doc": f"NF #{nro}" if nro else "—",
                        "_rawDate": r_op.get("dat_emissao"),
                    }
            except Exception as e:
                log.warning(f"[DBM Desk] Aviso ao consultar card {op_key} via SQL p/ cliente #{cod_cli}: {e}")

        # Verifica também NF_ENTRADA + ITENS_NOTAS_FISCAIS para Devolução de Consignação (CFOP 1918/2918/etc)
        try:
            dev_cfop_in = ", ".join(f"'{c}'" for c in CFOP_DEVOLUCAO_LIST)
            clean_ne_cfop = "REPLACE(REPLACE(REPLACE(RTRIM(LTRIM(ISNULL(INF.COD_NATUREZA, NE.COD_NATUREZA))), '.', ''), ',', ''), ' ', '')"
            top_clause = "TOP 1" if legacy_pagination else ""
            offset_clause = "" if legacy_pagination else "OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY"
            sql_dev_ent = f"""
                SELECT {top_clause}
                    NE.COD_NF_ENTRADA AS cod_nf,
                    ISNULL(NE.NRO_NOTA_FISCAL, CAST(NE.COD_NF_ENTRADA AS VARCHAR)) AS nro_nf,
                    NE.DAT_EMISSAO_NF AS dat_emissao,
                    ISNULL(SUM(INF.QTD_ITENS), 0) AS total_units,
                    ISNULL(MAX(NE.VLR_LIQUIDO_NF), ISNULL(SUM(INF.VLR_LIQUIDO_ITEM), 0)) AS total_value
                FROM NF_ENTRADA NE WITH (NOLOCK)
                LEFT JOIN ITENS_NOTAS_FISCAIS INF WITH (NOLOCK)
                    ON INF.COD_NF_ENTRADA = NE.COD_NF_ENTRADA
                    AND INF.COD_FILIAL = NE.COD_FILIAL
                    AND INF.COD_EMPRESA = NE.COD_EMPRESA
                WHERE NE.COD_CLI = %s
                  AND NE.COD_EMPRESA = {cod_empresa}
                  AND NE.COD_FILIAL = {cod_filial}
                  AND ISNULL(NE.SIT_NF, '') NOT IN ('C', 'CAN')
                  AND {clean_ne_cfop} IN ({dev_cfop_in})
                GROUP BY NE.COD_NF_ENTRADA, NE.NRO_NOTA_FISCAL, NE.DAT_EMISSAO_NF
                ORDER BY NE.DAT_EMISSAO_NF DESC, NE.COD_NF_ENTRADA DESC
                {offset_clause}
            """
            rows_dev_ent = sql_client.query(sql_dev_ent, (cod_cli,), max_rows=1)
            if rows_dev_ent and len(rows_dev_ent) > 0:
                r_de = rows_dev_ent[0]
                dt_de = _parse_any_datetime(r_de.get("dat_emissao"))
                dt_cur = _parse_any_datetime(ops_metrics["devolucao"].get("_rawDate"))
                if not dt_cur or (dt_de and dt_de >= dt_cur):
                    nro_de = str(r_de.get("nro_nf") or r_de.get("cod_nf") or "").strip()
                    ops_metrics["devolucao"] = {
                        "totalValue": round(float(r_de.get("total_value") or 0.0), 2),
                        "totalUnits": int(float(r_de.get("total_units") or 0)),
                        "date": _format_br_date(r_de.get("dat_emissao")),
                        "doc": f"NF #{nro_de}" if nro_de else "—",
                    }
        except Exception as e:
            log.warning(f"[DBM Desk] Aviso ao consultar NF_ENTRADA devolução cliente #{cod_cli}: {e}")

        for k_op in ops_metrics:
            ops_metrics[k_op].pop("_rawDate", None)

    # 3B. Fallback / Complemento Híbrido via HorusBISale local (se algum card ainda estiver zerado)
    for op_key, cfops in cfop_groups.items():
        if ops_metrics[op_key]["totalUnits"] == 0 and ops_metrics[op_key]["totalValue"] == 0:
            try:
                q_bi = db.query(
                    HorusBISale.invoice_number,
                    func.max(HorusBISale.sale_date).label("last_date"),
                    func.sum(HorusBISale.qty_fulfilled + HorusBISale.qty_returned).label("units"),
                    func.sum(HorusBISale.net_value).label("val")
                ).filter(
                    HorusBISale.company_id == seller_id,
                    HorusBISale.cfop.in_(list(cfops))
                )
                if cod_cli:
                    q_bi = q_bi.filter(
                        or_(
                            HorusBISale.customer_id == customer.id,
                            HorusBISale.customer_horus_id == cod_cli
                        )
                    )
                else:
                    q_bi = q_bi.filter(HorusBISale.customer_id == customer.id)

                bi_last = q_bi.group_by(HorusBISale.invoice_number).order_by(
                    func.max(HorusBISale.sale_date).desc()
                ).first()

                if bi_last and (bi_last.units or bi_last.val):
                    ops_metrics[op_key] = {
                        "totalValue": round(float(bi_last.val or 0.0), 2),
                        "totalUnits": int(bi_last.units or 0),
                        "date": _format_br_date(bi_last.last_date),
                        "doc": f"NF #{bi_last.invoice_number}" if bi_last.invoice_number else "Histórico BI",
                    }
            except Exception as e:
                log.warning(f"[DBM Desk] Aviso ao consultar fallback BI para {op_key}: {e}")

    # 3C. Se consignado total não veio da API mas temos remessa/acerto, garante valor coerente
    if consigned_units == 0 and ops_metrics["remessa"]["totalUnits"] > 0:
        consigned_units = ops_metrics["remessa"]["totalUnits"]
        if consigned_value == 0:
            consigned_value = ops_metrics["remessa"]["totalValue"]

    min_order_val = float(getattr(customer, "min_order_total", 0.0) or 0.0)
    if min_order_val <= 0 and getattr(customer, "commercial_policy", None):
        min_order_val = float(getattr(customer.commercial_policy, "min_order_total", 0.0) or 0.0)

    return {
        "customer": {
            "id": str(customer.id),
            "code": f"CLI-{cod_cli}" if cod_cli else f"ID-{customer.id}",
            "horus_cod_cli": cod_cli,
            "name": customer.name or customer.corporate_name or f"Cliente #{customer.id}",
            "corporate_name": customer.corporate_name or customer.name,
            "document": customer.document or "",
            "group": customer.group_name or "Sem Grupo",
            "canal": customer.segment or "Livrarias",
            "city": customer.city or "—",
            "uf": customer.state or "—",
            "minOrderValue": round(min_order_val, 2),
            "creditLimit": round(credit_limit, 2),
            "usedCredit": round(used_credit, 2),
            "overdueDebt": round(overdue_debt, 2),
            "consignedTotalUnits": int(consigned_units),
            "consignedTotalValue": round(consigned_value, 2),
            "maxDiscountAllowed": round(max_discount, 2),
            "defaultDiscount": round(default_discount, 2),
            "observations": customer.notes_message or customer.nfse_notes or "Nenhuma observação comercial registrada para este cliente.",
            "b2bAcceptsConsignment": api_customer_info.get("B2B_ACEITA_PED_CONSIG"),
            "b2bAcceptsSale": api_customer_info.get("B2B_ACEITA_PED_VENDA"),
        },
        "operationsMetrics": ops_metrics,
        "apiCustomerB2B": api_customer_info,
    }


def _enrich_items_with_bi_metrics(
    db: Session,
    seller_id: int,
    customer: Optional[Customer],
    cod_cli: Optional[int],
    items_list: list[dict],
    client_sales_days: int = 30,
    general_sales_days: int = 90,
    sql_client: Optional[HorusSQLClient] = None,
) -> list[dict]:
    """
    Cruza uma lista de itens com o Horus SQL (NF_ITENS / NF_MESTRE / VW_ITENS_CONSIGNACAO)
    e com HorusBISale para preencher giro do cliente (Xd e 365d), giro geral da distribuidora (Yd)
    e saldo consignado no cliente em lote (batch query).
    """
    if not items_list:
        return items_list

    from datetime import timedelta
    from app.models.horus_bi_sale import HorusBISale

    isbns = list({
        str(it.get("isbn") or it.get("sku") or "").strip().replace("-", "").replace(" ", "")
        for it in items_list
        if (it.get("isbn") or it.get("sku"))
    })
    if not isbns:
        return items_list

    now_dt = datetime.utcnow()
    dt_cli_window = now_dt - timedelta(days=max(1, client_sales_days))
    dt_365 = now_dt - timedelta(days=365)
    dt_gen_window = now_dt - timedelta(days=max(1, general_sales_days))

    cli_period_map: dict[str, int] = {}
    cli_365_map: dict[str, int] = {}
    gen_period_map: dict[str, int] = {}
    consig_map: dict[str, int] = {}

    def _clean_key(val: Any) -> str:
        return str(val or "").strip().replace("-", "").replace(" ", "")

    # 1. Enriquecimento direto via Horus SQL Server (alta precisão em tempo real com predicados SARGable)
    if sql_client:
        cod_empresa, cod_filial = _resolve_horus_empresa_filial(None, sql_client)
        try:
            sargable_sales_cfops = _build_sargable_cfop_in_sql(list(CFOP_VENDA_LIST) + list(CFOP_ACERTO_LIST))
            needs_consig_query = any("_consig_loaded" not in it for it in items_list)

            for c_start in range(0, len(isbns), 120):
                chunk = isbns[c_start:c_start + 120]
                ph = ", ".join(["%s"] * len(chunk))
                int_cods = [int(x) for x in chunk if x.isdigit() and len(x) < 10]
                int_clause = f" OR I.COD_ITEM IN ({', '.join(str(ic) for ic in int_cods)})" if int_cods else ""

                # Giro Geral (Yd) + Giro Cliente (Xd e 365d) em uma única passada por lote
                if cod_cli:
                    sql_batch_giro = f"""
                        SELECT
                            RTRIM(LTRIM(ISNULL(I.COD_BARRA_ITEM, ''))) AS cod_barra,
                            RTRIM(LTRIM(ISNULL(I.COD_ISBN_ITEM, ''))) AS cod_isbn,
                            CAST(NFI.COD_ITEM AS VARCHAR) AS cod_item,
                            SUM(CASE WHEN NF.DAT_EMISSAO_NF >= DATEADD(day, -%s, GETDATE()) THEN ISNULL(NFI.QTD_ITENS, 0) ELSE 0 END) AS gen_qty,
                            SUM(CASE WHEN NF.COD_CLI = %s AND NF.DAT_EMISSAO_NF >= DATEADD(day, -365, GETDATE()) THEN ISNULL(NFI.QTD_ITENS, 0) ELSE 0 END) AS cli_365,
                            SUM(CASE WHEN NF.COD_CLI = %s AND NF.DAT_EMISSAO_NF >= DATEADD(day, -%s, GETDATE()) THEN ISNULL(NFI.QTD_ITENS, 0) ELSE 0 END) AS cli_win
                        FROM ITENS_ESTOQUE_GERAL I WITH (NOLOCK)
                        INNER JOIN NF_ITENS NFI WITH (NOLOCK)
                            ON NFI.COD_ITEM = I.COD_ITEM
                            AND NFI.COD_EMPRESA = {cod_empresa}
                            AND NFI.COD_FILIAL = {cod_filial}
                        INNER JOIN NF_MESTRE NF WITH (NOLOCK)
                            ON NF.COD_NF = NFI.COD_NF
                            AND NF.COD_FILIAL = NFI.COD_FILIAL
                            AND NF.COD_EMPRESA = NFI.COD_EMPRESA
                        WHERE (I.COD_BARRA_ITEM IN ({ph}) OR I.COD_ISBN_ITEM IN ({ph}){int_clause})
                          AND NF.DAT_EMISSAO_NF >= DATEADD(day, -370, GETDATE())
                          AND ISNULL(NF.SIT_NF, '') NOT IN ('C', 'CAN')
                          AND NFI.COD_NATUREZA IN ({sargable_sales_cfops})
                        GROUP BY I.COD_BARRA_ITEM, I.COD_ISBN_ITEM, NFI.COD_ITEM
                    """
                    params = (general_sales_days, cod_cli, cod_cli, client_sales_days) + tuple(chunk) + tuple(chunk)
                    g_rows = sql_client.query(sql_batch_giro, params, max_rows=400)
                    for gr in (g_rows or []):
                        gen_v = int(float(gr.get("gen_qty") or 0))
                        c365_v = int(float(gr.get("cli_365") or 0))
                        cwin_v = int(float(gr.get("cli_win") or 0))
                        for raw_k in (gr.get("cod_barra"), gr.get("cod_isbn"), gr.get("cod_item")):
                            k = _clean_key(raw_k)
                            if k:
                                gen_period_map[k] = max(gen_period_map.get(k, 0), gen_v)
                                cli_365_map[k] = max(cli_365_map.get(k, 0), c365_v)
                                cli_period_map[k] = max(cli_period_map.get(k, 0), cwin_v)

                    # Saldo consignado ativo por item na VW_ITENS_CONSIGNACAO (apenas se ainda não carregado)
                    if needs_consig_query:
                        sql_batch_consig = f"""
                            SELECT
                                RTRIM(LTRIM(ISNULL(I.COD_BARRA_ITEM, ''))) AS cod_barra,
                                RTRIM(LTRIM(ISNULL(I.COD_ISBN_ITEM, ''))) AS cod_isbn,
                                CAST(V.COD_ITEM AS VARCHAR) AS cod_item,
                                SUM(ISNULL(V.SALDO, 0)) AS saldo_consig
                            FROM VW_ITENS_CONSIGNACAO V WITH (NOLOCK)
                            INNER JOIN ITENS_ESTOQUE_GERAL I WITH (NOLOCK) ON I.COD_ITEM = V.COD_ITEM
                            WHERE V.COD_CLI = %s
                              AND V.COD_EMPRESA = {cod_empresa}
                              AND V.COD_FILIAL = {cod_filial}
                              AND ISNULL(V.SALDO, 0) > 0
                              AND (I.COD_BARRA_ITEM IN ({ph}) OR I.COD_ISBN_ITEM IN ({ph}){int_clause})
                            GROUP BY I.COD_BARRA_ITEM, I.COD_ISBN_ITEM, V.COD_ITEM
                        """
                        c_rows = sql_client.query(sql_batch_consig, (cod_cli,) + tuple(chunk) + tuple(chunk), max_rows=400)
                        for cr in (c_rows or []):
                            cs_v = int(float(cr.get("saldo_consig") or 0))
                            for raw_k in (cr.get("cod_barra"), cr.get("cod_isbn"), cr.get("cod_item")):
                                k = _clean_key(raw_k)
                                if k:
                                    consig_map[k] = max(consig_map.get(k, 0), cs_v)
                else:
                    sql_batch_gen_only = f"""
                        SELECT
                            RTRIM(LTRIM(ISNULL(I.COD_BARRA_ITEM, ''))) AS cod_barra,
                            RTRIM(LTRIM(ISNULL(I.COD_ISBN_ITEM, ''))) AS cod_isbn,
                            CAST(NFI.COD_ITEM AS VARCHAR) AS cod_item,
                            SUM(CASE WHEN NF.DAT_EMISSAO_NF >= DATEADD(day, -%s, GETDATE()) THEN ISNULL(NFI.QTD_ITENS, 0) ELSE 0 END) AS gen_qty
                        FROM ITENS_ESTOQUE_GERAL I WITH (NOLOCK)
                        INNER JOIN NF_ITENS NFI WITH (NOLOCK)
                            ON NFI.COD_ITEM = I.COD_ITEM
                            AND NFI.COD_EMPRESA = {cod_empresa}
                            AND NFI.COD_FILIAL = {cod_filial}
                        INNER JOIN NF_MESTRE NF WITH (NOLOCK)
                            ON NF.COD_NF = NFI.COD_NF
                            AND NF.COD_FILIAL = NFI.COD_FILIAL
                            AND NF.COD_EMPRESA = NFI.COD_EMPRESA
                        WHERE (I.COD_BARRA_ITEM IN ({ph}) OR I.COD_ISBN_ITEM IN ({ph}){int_clause})
                          AND NF.DAT_EMISSAO_NF >= DATEADD(day, -%s, GETDATE())
                          AND ISNULL(NF.SIT_NF, '') NOT IN ('C', 'CAN')
                          AND NFI.COD_NATUREZA IN ({sargable_sales_cfops})
                        GROUP BY I.COD_BARRA_ITEM, I.COD_ISBN_ITEM, NFI.COD_ITEM
                    """
                    params_gen = (general_sales_days, general_sales_days) + tuple(chunk) + tuple(chunk)
                    g_rows = sql_client.query(sql_batch_gen_only, params_gen, max_rows=400)
                    for gr in (g_rows or []):
                        gen_v = int(float(gr.get("gen_qty") or 0))
                        for raw_k in (gr.get("cod_barra"), gr.get("cod_isbn"), gr.get("cod_item")):
                            k = _clean_key(raw_k)
                            if k:
                                gen_period_map[k] = max(gen_period_map.get(k, 0), gen_v)
        except Exception as e:
            log.warning(f"[DBM Desk] Aviso ao enriquecer giro via Horus SQL em lote: {e}")

    # 2. Complemento via HorusBISale local (quando SQL não retornou para algum ISBN)
    try:
        gen_rows = db.query(
            HorusBISale.ean,
            func.sum(HorusBISale.qty_fulfilled).label("qty")
        ).filter(
            HorusBISale.company_id == seller_id,
            HorusBISale.ean.in_(isbns),
            HorusBISale.sale_date >= dt_gen_window,
            HorusBISale.cfop.in_(list(CFOP_VENDA_LIST) + list(CFOP_ACERTO_LIST))
        ).group_by(HorusBISale.ean).all()
        for r in gen_rows:
            k = _clean_key(r.ean)
            if k not in gen_period_map:
                gen_period_map[k] = int(r.qty or 0)

        if customer or cod_cli:
            cust_filter = (
                or_(HorusBISale.customer_id == customer.id, HorusBISale.customer_horus_id == cod_cli)
                if (customer and cod_cli)
                else (HorusBISale.customer_id == customer.id if customer else HorusBISale.customer_horus_id == cod_cli)
            )
            cli_365_rows = db.query(
                HorusBISale.ean,
                func.sum(HorusBISale.qty_fulfilled).label("qty")
            ).filter(
                HorusBISale.company_id == seller_id,
                cust_filter,
                HorusBISale.ean.in_(isbns),
                HorusBISale.sale_date >= dt_365,
                HorusBISale.cfop.in_(list(CFOP_VENDA_LIST) + list(CFOP_ACERTO_LIST))
            ).group_by(HorusBISale.ean).all()
            for r in cli_365_rows:
                k = _clean_key(r.ean)
                if k not in cli_365_map:
                    cli_365_map[k] = int(r.qty or 0)

            cli_win_rows = db.query(
                HorusBISale.ean,
                func.sum(HorusBISale.qty_fulfilled).label("qty")
            ).filter(
                HorusBISale.company_id == seller_id,
                cust_filter,
                HorusBISale.ean.in_(isbns),
                HorusBISale.sale_date >= dt_cli_window,
                HorusBISale.cfop.in_(list(CFOP_VENDA_LIST) + list(CFOP_ACERTO_LIST))
            ).group_by(HorusBISale.ean).all()
            for r in cli_win_rows:
                k = _clean_key(r.ean)
                if k not in cli_period_map:
                    cli_period_map[k] = int(r.qty or 0)
    except Exception as e:
        log.warning(f"[DBM Desk] Aviso ao enriquecer giro BI em lote: {e}")

    for it in items_list:
        isbn = _clean_key(it.get("isbn"))
        sku = _clean_key(it.get("sku"))
        c_per = cli_period_map.get(isbn, cli_period_map.get(sku, 0))
        c_365 = cli_365_map.get(isbn, cli_365_map.get(sku, 0))
        g_per = gen_period_map.get(isbn, gen_period_map.get(sku, 0))
        cs_bal = consig_map.get(isbn, consig_map.get(sku, 0))

        if not it.get("clientSalesPeriod"):
            it["clientSalesPeriod"] = c_per
        if not it.get("clientSalesX"):
            it["clientSalesX"] = c_per
        if not it.get("clientSales365d"):
            it["clientSales365d"] = c_365
        if not it.get("generalSales365"):
            it["generalSales365"] = c_365
        if not it.get("generalSalesPeriod"):
            it["generalSalesPeriod"] = g_per
        if not it.get("generalSalesX"):
            it["generalSalesX"] = g_per
        if not it.get("consignedBalance") and cs_bal > 0:
            it["consignedBalance"] = cs_bal
        if not it.get("consignedQty") and cs_bal > 0:
            it["consignedQty"] = cs_bal

    _apply_cronuz_units_per_box(db, seller_id, items_list)

    return items_list


def _apply_cronuz_units_per_box(
    db: Session,
    seller_id: int,
    items_list: list[dict],
) -> list[dict]:
    """
    Cruza os itens da grade com o cadastro do produto no Cronuz (prd_product.units_per_box)
    pelo ISBN, SKU, Código Horus ou Título, garantindo que a coluna CX sempre exiba a
    quantidade real por caixa salva no item no Cronuz.
    """
    if not items_list:
        return items_list

    from app.models.product import Product

    def _norm_code(val: Any) -> str:
        return str(val or "").strip().replace("-", "").replace(" ", "").lstrip("0") or str(val or "").strip()

    def _norm_title(val: Any) -> str:
        return " ".join(str(val or "").strip().lower().split())

    try:
        rows = db.query(
            Product.ean_gtin,
            Product.barcode,
            Product.sku,
            Product.horus_cod_item,
            Product.additional_isbns,
            Product.name,
            Product.units_per_box,
        ).filter(
            Product.company_id == seller_id,
            Product.units_per_box.isnot(None),
        ).all()

        box_by_code: dict[str, int] = {}
        box_by_title: dict[str, int] = {}

        for ean_gtin, barcode, sku, horus_cod_item, additional_isbns, name, units_per_box in rows:
            u_val = int(units_per_box or 0)
            if u_val <= 0:
                continue
            for raw_k in (ean_gtin, barcode, sku, horus_cod_item):
                if raw_k is not None and str(raw_k).strip():
                    c_raw = str(raw_k).strip().replace("-", "").replace(" ", "")
                    c_norm = _norm_code(c_raw)
                    if c_raw:
                        box_by_code[c_raw] = u_val
                    if c_norm:
                        box_by_code[c_norm] = u_val
            if additional_isbns:
                for sub in str(additional_isbns).replace(";", ",").split(","):
                    c_sub = sub.strip().replace("-", "").replace(" ", "")
                    if c_sub:
                        box_by_code[c_sub] = u_val
                        box_by_code[_norm_code(c_sub)] = u_val
            t_key = _norm_title(name)
            if t_key:
                box_by_title[t_key] = u_val

        for it in items_list:
            if not isinstance(it, dict):
                continue
            matched_box: Optional[int] = None
            for field in ("isbn", "sku", "cod_item", "horusCode"):
                raw_v = it.get(field)
                if raw_v is not None and str(raw_v).strip():
                    c_raw = str(raw_v).strip().replace("-", "").replace(" ", "")
                    c_norm = _norm_code(c_raw)
                    matched_box = box_by_code.get(c_raw) or box_by_code.get(c_norm)
                    if matched_box:
                        break
            if not matched_box and it.get("title"):
                matched_box = box_by_title.get(_norm_title(it.get("title")))

            if matched_box and matched_box > 0:
                it["boxQty"] = matched_box
                it["boxUnits"] = matched_box
                it["units_per_box"] = matched_box
            else:
                # Se estava com o fallback legado fixo 12 sem ter caixa cadastrada no Cronuz, zera para exibir '-'
                cur_box = int(it.get("boxUnits") or it.get("boxQty") or 0)
                if cur_box == 12 and box_by_code:
                    it["boxQty"] = 0
                    it["boxUnits"] = 0
    except Exception as exc:
        log.warning(f"[DBM Desk] Aviso ao enriquecer CX (units_per_box) do Cronuz: {exc}")

    return items_list


def _load_seller_product_exclusion_sets(
    db: Session,
    seller_id: int,
    hide_ebooks: bool = True,
    hide_out_of_print: bool = True,
) -> set[str]:
    """
    Retorna conjunto de chaves (ISBN primário, ISBN de e-book, SKU/Cód Horus) de produtos
    marcados como E-book e/ou Obra Esgotada no cadastro do Cronuz DBM para filtragem nas pesquisas.
    """
    from app.models.product import Product
    excluded_keys: set[str] = set()
    if not hide_ebooks and not hide_out_of_print:
        return excluded_keys
    try:
        rows = db.query(
            Product.ean_gtin,
            Product.sku,
            Product.horus_cod_item,
            Product.additional_isbns,
            Product.name,
            Product.binding_finish,
            Product.is_ebook,
            Product.is_out_of_print,
        ).filter(Product.company_id == seller_id).all()
        for ean_gtin, sku, horus_cod_item, additional_isbns, name, binding_finish, is_eb, is_oop in rows:
            eb_flag = bool(is_eb) or str(binding_finish or "").strip().lower() in ("e-book", "ebook", "digital")
            oop_flag = bool(is_oop)
            if (hide_ebooks and eb_flag) or (hide_out_of_print and oop_flag):
                for raw_val in (ean_gtin, sku, horus_cod_item):
                    if raw_val is not None and str(raw_val).strip():
                        cl = str(raw_val).strip().replace("-", "").replace(" ", "")
                        if cl:
                            excluded_keys.add(cl)
            # Se esconder e-books estiver ativo, nunca retornar ISBNs secundários de e-book
            if hide_ebooks and additional_isbns:
                for sub in str(additional_isbns).replace(";", ",").split(","):
                    cl = sub.strip().replace("-", "").replace(" ", "")
                    if cl:
                        excluded_keys.add(cl)
    except Exception as exc:
        try:
            db.rollback()
        except Exception:
            pass
        log.warning(f"[DBM] Aviso ao carregar filtro de e-books/esgotados (tentando fallback sem coluna is_ebook): {exc}")
        try:
            rows_fb = db.query(
                Product.ean_gtin,
                Product.sku,
                Product.horus_cod_item,
                Product.additional_isbns,
                Product.name,
                Product.binding_finish,
                Product.is_out_of_print,
            ).filter(Product.company_id == seller_id).all()
            for ean_gtin, sku, horus_cod_item, additional_isbns, name, binding_finish, is_oop in rows_fb:
                eb_flag = str(binding_finish or "").strip().lower() in ("e-book", "ebook", "digital")
                oop_flag = bool(is_oop)
                if (hide_ebooks and eb_flag) or (hide_out_of_print and oop_flag):
                    for raw_val in (ean_gtin, sku, horus_cod_item):
                        if raw_val is not None and str(raw_val).strip():
                            cl = str(raw_val).strip().replace("-", "").replace(" ", "")
                            if cl:
                                excluded_keys.add(cl)
                if hide_ebooks and additional_isbns:
                    for sub in str(additional_isbns).replace(";", ",").split(","):
                        cl = sub.strip().replace("-", "").replace(" ", "")
                        if cl:
                            excluded_keys.add(cl)
        except Exception as fb_exc:
            try:
                db.rollback()
            except Exception:
                pass
            log.warning(f"[DBM] Falha no fallback de filtro de e-books/esgotados: {fb_exc}")
    return excluded_keys


def _is_item_excluded_by_dbm_flags(
    isbn: str,
    cod_item: Optional[object],
    title: str,
    subject: str,
    excluded_keys: set[str],
    hide_ebooks: bool = True,
) -> bool:
    clean_isbn = str(isbn or "").strip().replace("-", "").replace(" ", "")
    clean_cod = str(cod_item or "").strip()
    if clean_isbn and clean_isbn in excluded_keys:
        return True
    if clean_cod and clean_cod in excluded_keys:
        return True
    if hide_ebooks:
        t_up = f"{title or ''} {subject or ''}".upper()
        if "E-BOOK" in t_up or "EBOOK" in t_up or "LIVRO DIGITAL" in t_up:
            return True
    return False


@router.get("/proposals-desk/catalog-tabs")
async def get_proposals_desk_catalog_tabs(
    customer_id: Optional[int] = Query(None, description="ID do cliente selecionado (opcional)"),
    company_id: Optional[int] = Query(None),
    client_sales_days: int = Query(30, ge=1, le=730),
    general_sales_days: int = Query(90, ge=1, le=730),
    limit: int = Query(80, ge=1, le=500),
    exclude_isbns: Optional[str] = Query(None, description="ISBNs separados por vírgula já presentes no pedido ou nas abas anteriores"),
    hide_ebooks: bool = Query(True, description="Ocultar e-books nas buscas"),
    hide_out_of_print: bool = Query(True, description="Ocultar obras esgotadas nas buscas"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retorna os itens das abas de catálogo para o seller (e cliente selecionado, quando informado):
    - NOVIDADES: produtos com data de lançamento entre 9 meses para trás (-270d) e 6 meses para frente (+180d),
      indicando status de lançamento e dias para expirar da vitrine de novidades.
    - REPOSIÇÃO: produtos de maior giro no cliente / curva A com saldo disponível.
    - FUNDO DE CATÁLOGO: obras de catálogo (> 9 meses de lançamento ou clássicos) com estoque disponível.
    Respeita horus_legacy_pagination (OFFSET/LIMIT vs TOP).
    """
    from datetime import timedelta
    from app.models.product import Product
    from app.models.catalog_support import Brand, Category
    from app.models.horus_bi_sale import HorusBISale

    seller_id = _resolve_seller_id(current_user, company_id)
    customer = None
    if customer_id:
        customer = db.query(Customer).filter(
            Customer.id == customer_id,
            Customer.company_id == seller_id
        ).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == seller_id).first()
    legacy_pagination = getattr(settings, "horus_legacy_pagination", False) if settings else False
    default_disc = float(customer.discount or 35.0) if customer else 35.0

    sql_client = None
    try:
        sql_client = HorusSQLClient(db, seller_id)
    except Exception:
        sql_client = None

    cod_cli = _resolve_customer_horus_cod_cli(db, customer, sql_client) if customer else None
    cod_filial = int(sql_client.cod_filial) if (sql_client and str(sql_client.cod_filial).isdigit()) else 2

    now_dt = datetime.utcnow()
    win_start = now_dt - timedelta(days=270)  # 9 meses para trás
    win_end = now_dt + timedelta(days=180)    # 6 meses para frente

    novidades_items: list[dict] = []
    reposicao_items: list[dict] = []
    fundo_items: list[dict] = []
    seen_isbns: set[str] = set()
    excluded_keys = _load_seller_product_exclusion_sets(db, seller_id, hide_ebooks=hide_ebooks, hide_out_of_print=hide_out_of_print)
    if exclude_isbns:
        for raw_ex in exclude_isbns.split(","):
            cl = raw_ex.strip().replace("-", "").replace(" ", "")
            if cl:
                excluded_keys.add(cl)
                seen_isbns.add(cl)

    # ── 1. ABA NOVIDADES (-9 meses até +6 meses, APENAS COM SALDO > 0) ────────
    if sql_client:
        launch_expr = _detect_horus_launch_col(sql_client)
        top_clause = f"TOP ({limit})" if legacy_pagination else ""
        offset_clause = "" if legacy_pagination else f"OFFSET 0 ROWS FETCH NEXT {limit} ROWS ONLY"
        sql_nov = f"""
            SELECT {top_clause}
                I.COD_ITEM AS cod_item,
                RTRIM(LTRIM(ISNULL(I.COD_BARRA_ITEM, ISNULL(I.COD_ISBN_ITEM, '')))) AS isbn,
                RTRIM(LTRIM(ISNULL(I.NOM_ITEM, ''))) AS nome_item,
                RTRIM(LTRIM(ISNULL(ED.NOM_FANTASIA, ISNULL(ED.NOM_EDITORA, 'Editora')))) AS editora,
                RTRIM(LTRIM(ISNULL(G.NOM_GENERO, 'Geral'))) AS assunto,
                ISNULL(PA.VLR_CAPA, ISNULL(I.VLR_CAPA, 0.0)) AS preco,
                ISNULL(S.saldo_disponivel, 0) AS estoque,
                ISNULL(I.QTD_ITENS_CAIXA, 12) AS qtd_caixa,
                {launch_expr} AS data_lancamento
            FROM ITENS_ESTOQUE_GERAL I WITH (NOLOCK)
            LEFT JOIN EDITORA ED WITH (NOLOCK) ON ED.COD_EDITORA = I.COD_EDITORA
            LEFT JOIN TABELA_GENERO G WITH (NOLOCK) ON G.COD_GENERO = I.COD_GENERO
            LEFT JOIN ITENS_ESTPRECO_ATUAL PA WITH (NOLOCK) ON PA.COD_ITEM = I.COD_ITEM
            LEFT JOIN VW_SALDO_ITENS S WITH (NOLOCK) ON S.cod_item = I.COD_ITEM AND S.cod_filial = {cod_filial}
            WHERE ISNULL(I.STA_ATIVO, 'S') <> 'N'
              AND ISNULL(S.saldo_disponivel, 0) > 0
              AND {launch_expr} >= DATEADD(month, -9, GETDATE())
              AND {launch_expr} <= DATEADD(month, 6, GETDATE())
            ORDER BY {launch_expr} DESC, I.COD_ITEM DESC
            {offset_clause}
        """
        try:
            rows_nov = sql_client.query(sql_nov, max_rows=limit)
            for r in (rows_nov or []):
                est = int(float(r.get("estoque") or 0))
                if est <= 0:
                    continue
                isbn = str(r.get("isbn") or r.get("cod_item") or "").strip()
                if not isbn or isbn in seen_isbns:
                    continue
                if _is_item_excluded_by_dbm_flags(
                    isbn=isbn,
                    cod_item=r.get("cod_item"),
                    title=str(r.get("nome_item") or ""),
                    subject=str(r.get("assunto") or ""),
                    excluded_keys=excluded_keys,
                    hide_ebooks=hide_ebooks,
                ):
                    continue
                seen_isbns.add(isbn)
                l_dt = _parse_any_datetime(r.get("data_lancamento"))
                meta = _compute_launch_metadata(l_dt, now_dt)
                novidades_items.append({
                    "id": f"nov-sql-{r.get('cod_item') or isbn}",
                    "isbn": isbn,
                    "sku": str(r.get("cod_item") or isbn),
                    "title": str(r.get("nome_item") or f"Item #{isbn}"),
                    "publisher": str(r.get("editora") or "Editora"),
                    "subject": str(r.get("assunto") or "Geral"),
                    "coverPrice": float(r.get("preco") or 0.0),
                    "discountPct": default_disc,
                    "requestedQty": 0,
                    "consignedBalance": 0,
                    "clientSalesPeriod": 0,
                    "stockAvailable": est,
                    "boxQty": max(1, int(r.get("qtd_caixa") or 12)),
                    "clientSales365d": 0,
                    "generalSalesPeriod": 0,
                    "sourceTab": "NOVIDADES",
                    "addedOrigin": None,
                    "manualStatus": None,
                    **meta,
                })
        except Exception as e:
            log.warning(f"[DBM Desk] Aviso ao buscar Novidades no Horus SQL: {e}")

    # Complementa Novidades com base local prd_product (launch_date entre -9m e +6m, APENAS COM SALDO > 0)
    if len(novidades_items) < limit:
        rem = limit - len(novidades_items)
        q_local_nov = db.query(Product, Brand.name.label("brand_name"), Category.name.label("cat_name")).outerjoin(
            Brand, Brand.id == Product.brand_id
        ).outerjoin(
            Category, Category.id == Product.category_id
        ).filter(
            Product.company_id == seller_id,
            Product.status == "ACTIVE",
            Product.stock_quantity > 0,
            or_(
                Product.launch_date.between(win_start, win_end),
                (Product.launch_date.is_(None) & Product.created_at.between(win_start, win_end))
            )
        ).order_by(
            func.coalesce(Product.launch_date, Product.created_at).desc(),
            Product.id.desc()
        ).limit(rem).all()

        for p, b_name, c_name in q_local_nov:
            est_loc = int(p.stock_quantity or 0)
            if est_loc <= 0:
                continue
            if hide_out_of_print and getattr(p, "is_out_of_print", False):
                continue
            if hide_ebooks and (getattr(p, "is_ebook", False) or (p.binding_finish and "e-book" in p.binding_finish.lower())):
                continue
            isbn = str(p.ean_gtin or p.sku or p.id).strip()
            if not isbn or isbn in seen_isbns:
                continue
            if _is_item_excluded_by_dbm_flags(isbn, p.horus_cod_item, p.name, p.subject or c_name or "", excluded_keys, hide_ebooks):
                continue
            seen_isbns.add(isbn)
            eff_dt = _parse_any_datetime(p.launch_date or p.created_at)
            meta = _compute_launch_metadata(eff_dt, now_dt)
            novidades_items.append({
                "id": f"nov-loc-{p.id}",
                "isbn": isbn,
                "sku": str(p.sku or p.id),
                "title": p.name,
                "publisher": b_name or p.brand or "Editora",
                "subject": p.subject or c_name or "Catálogo",
                "coverPrice": float(p.promotional_price or p.base_price or 0.0),
                "discountPct": default_disc,
                "requestedQty": 0,
                "consignedBalance": 0,
                "clientSalesPeriod": 0,
                "stockAvailable": est_loc,
                "boxQty": int(p.units_per_box or 0),
                "clientSales365d": 0,
                "generalSalesPeriod": 0,
                "sourceTab": "NOVIDADES",
                "addedOrigin": None,
                "manualStatus": None,
                **meta,
            })

    # ── 2. ABA FUNDO DE CATÁLOGO (Obras > 9m de lançamento com saldo > 0, sem repetir Novidades) ─
    if sql_client:
        launch_expr = _detect_horus_launch_col(sql_client)
        top_clause = f"TOP ({limit * 2})" if legacy_pagination else ""
        offset_clause = "" if legacy_pagination else f"OFFSET 0 ROWS FETCH NEXT {limit * 2} ROWS ONLY"
        sql_fnd = f"""
            SELECT {top_clause}
                I.COD_ITEM AS cod_item,
                RTRIM(LTRIM(ISNULL(I.COD_BARRA_ITEM, ISNULL(I.COD_ISBN_ITEM, '')))) AS isbn,
                RTRIM(LTRIM(ISNULL(I.NOM_ITEM, ''))) AS nome_item,
                RTRIM(LTRIM(ISNULL(ED.NOM_FANTASIA, ISNULL(ED.NOM_EDITORA, 'Editora')))) AS editora,
                RTRIM(LTRIM(ISNULL(G.NOM_GENERO, 'Geral'))) AS assunto,
                ISNULL(PA.VLR_CAPA, ISNULL(I.VLR_CAPA, 0.0)) AS preco,
                ISNULL(S.saldo_disponivel, 0) AS estoque,
                ISNULL(I.QTD_ITENS_CAIXA, 12) AS qtd_caixa,
                {launch_expr} AS data_lancamento
            FROM ITENS_ESTOQUE_GERAL I WITH (NOLOCK)
            LEFT JOIN EDITORA ED WITH (NOLOCK) ON ED.COD_EDITORA = I.COD_EDITORA
            LEFT JOIN TABELA_GENERO G WITH (NOLOCK) ON G.COD_GENERO = I.COD_GENERO
            LEFT JOIN ITENS_ESTPRECO_ATUAL PA WITH (NOLOCK) ON PA.COD_ITEM = I.COD_ITEM
            LEFT JOIN VW_SALDO_ITENS S WITH (NOLOCK) ON S.cod_item = I.COD_ITEM AND S.cod_filial = {cod_filial}
            WHERE ISNULL(I.STA_ATIVO, 'S') <> 'N'
              AND ISNULL(S.saldo_disponivel, 0) > 0
              AND ({launch_expr} IS NULL OR {launch_expr} < DATEADD(month, -9, GETDATE()))
            ORDER BY ISNULL(S.saldo_disponivel, 0) DESC, I.COD_ITEM DESC
            {offset_clause}
        """
        try:
            rows_fnd = sql_client.query(sql_fnd, max_rows=limit * 2)
            for r in (rows_fnd or []):
                est = int(float(r.get("estoque") or 0))
                if est <= 0:
                    continue
                isbn = str(r.get("isbn") or r.get("cod_item") or "").strip()
                if not isbn or isbn in seen_isbns:
                    continue
                if _is_item_excluded_by_dbm_flags(
                    isbn=isbn,
                    cod_item=r.get("cod_item"),
                    title=str(r.get("nome_item") or ""),
                    subject=str(r.get("assunto") or ""),
                    excluded_keys=excluded_keys,
                    hide_ebooks=hide_ebooks,
                ):
                    continue
                seen_isbns.add(isbn)
                l_dt = _parse_any_datetime(r.get("data_lancamento"))
                meta = _compute_launch_metadata(l_dt, now_dt) if l_dt else {}
                fundo_items.append({
                    "id": f"fnd-sql-{r.get('cod_item') or isbn}",
                    "isbn": isbn,
                    "sku": str(r.get("cod_item") or isbn),
                    "title": str(r.get("nome_item") or f"Item #{isbn}"),
                    "publisher": str(r.get("editora") or "Editora"),
                    "subject": str(r.get("assunto") or "Geral"),
                    "coverPrice": float(r.get("preco") or 0.0),
                    "discountPct": default_disc,
                    "requestedQty": 0,
                    "consignedBalance": 0,
                    "clientSalesPeriod": 0,
                    "stockAvailable": est,
                    "boxQty": max(1, int(r.get("qtd_caixa") or 12)),
                    "clientSales365d": 0,
                    "generalSalesPeriod": 0,
                    "sourceTab": "FUNDO_CATALOGO",
                    "addedOrigin": None,
                    "manualStatus": None,
                    **meta,
                })
                if len(fundo_items) >= limit:
                    break
        except Exception as e:
            log.warning(f"[DBM Desk] Aviso ao buscar Fundo de Catálogo no Horus SQL: {e}")

    if len(fundo_items) < limit:
        try:
            q_fundo = db.query(Product, Brand.name.label("brand_name"), Category.name.label("cat_name")).outerjoin(
                Brand, Brand.id == Product.brand_id
            ).outerjoin(
                Category, Category.id == Product.category_id
            ).filter(
                Product.company_id == seller_id,
                Product.status == "ACTIVE",
                Product.stock_quantity > 0
            ).order_by(Product.stock_quantity.desc(), Product.id.asc()).limit(limit * 2).all()

            for p, b_name, c_name in q_fundo:
                est_loc = int(p.stock_quantity or 0)
                if est_loc <= 0:
                    continue
                if hide_out_of_print and getattr(p, "is_out_of_print", False):
                    continue
                if hide_ebooks and (getattr(p, "is_ebook", False) or (p.binding_finish and "e-book" in p.binding_finish.lower())):
                    continue
                isbn = str(p.ean_gtin or p.sku or p.id).strip()
                if not isbn or isbn in seen_isbns:
                    continue
                if _is_item_excluded_by_dbm_flags(isbn, p.horus_cod_item, p.name, p.subject or c_name or "", excluded_keys, hide_ebooks):
                    continue
                seen_isbns.add(isbn)
                eff_dt = _parse_any_datetime(p.launch_date)
                meta = _compute_launch_metadata(eff_dt, now_dt) if eff_dt else {}
                fundo_items.append({
                    "id": f"fnd-{p.id}",
                    "isbn": isbn,
                    "sku": str(p.sku or p.id),
                    "title": p.name,
                    "publisher": b_name or p.brand or "Editora",
                    "subject": p.subject or c_name or "Fundo de Catálogo",
                    "coverPrice": float(p.promotional_price or p.base_price or 0.0),
                    "discountPct": default_disc,
                    "requestedQty": 0,
                    "consignedBalance": 0,
                    "clientSalesPeriod": 0,
                    "stockAvailable": est_loc,
                    "boxQty": int(p.units_per_box or 0),
                    "clientSales365d": 0,
                    "generalSalesPeriod": 0,
                    "sourceTab": "FUNDO_CATALOGO",
                    "addedOrigin": None,
                    "manualStatus": None,
                    **meta,
                })
                if len(fundo_items) >= limit:
                    break
        except Exception as e:
            log.warning(f"[DBM Desk] Aviso ao montar aba Fundo de Catálogo local: {e}")

    # Enriquecimento em lote de métricas BI/SQL (30d, 365d, 90d, consignado)
    all_cat_items = novidades_items + reposicao_items + fundo_items
    _enrich_items_with_bi_metrics(
        db=db,
        seller_id=seller_id,
        customer=customer,
        cod_cli=cod_cli,
        items_list=all_cat_items,
        client_sales_days=client_sales_days,
        general_sales_days=general_sales_days,
        sql_client=sql_client,
    )

    return {
        "novidades": novidades_items,
        "reposicao": reposicao_items,
        "fundo": fundo_items,
        "window_rule": {
            "months_back": 9,
            "months_forward": 6,
            "start_date": win_start.strftime("%d/%m/%Y"),
            "end_date": win_end.strftime("%d/%m/%Y"),
        }
    }


@router.get("/proposals-desk/replenishment-items")
async def get_proposals_desk_replenishment_items(
    customer_id: int = Query(..., description="ID do cliente selecionado"),
    replenishment_mode: str = Query("REMESSA", description="Modo de histórico para reposição: REMESSA, VENDA_ACERTO ou AMBOS"),
    replenishment_sales_days: int = Query(90, ge=1, le=3650, description="Parâmetro legado mantido por compatibilidade"),
    client_sales_days: int = Query(30, ge=1, le=730),
    general_sales_days: int = Query(90, ge=1, le=730),
    exclude_isbns: Optional[str] = Query(None, description="Lista de ISBNs separados por vírgula já presentes em Pedido ou Novidades"),
    hide_ebooks: bool = Query(True, description="Ocultar e-books na busca de reposição"),
    hide_out_of_print: bool = Query(True, description="Ocultar esgotados na busca de reposição"),
    company_id: Optional[int] = Query(None),
    limit: int = Query(250, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Busca sob demanda para a aba REPOSIÇÃO (sem limite de dias):
    - Consulta NF_ITENS + NF_MESTRE pelo COD_CLI do cliente (e filial configurada) de acordo com o modo configurado:
      * REMESSA: Tudo que foi enviado em consignação para o cliente (CFOP 5917, 6917) + saldo consignado ativo.
      * VENDA_ACERTO: Tudo que foi vendido ou acertado para o cliente (CFOP 5102, 5108, 6102, 6108, 5114, 5113, 6114, 6113).
      * AMBOS: União de Remessas em Consignação + Vendas e Acertos.
    - Exclui tudo que já está no Pedido ou em Novidades (exclude_isbns) e filtra apenas itens com saldo disponível > 0.
    """
    from app.models.company import Company
    from app.models.product import Product
    from app.models.catalog_support import Brand, Category
    from app.models.horus_bi_sale import HorusBISale
    from app.integrators.horus_clients import HorusClients

    seller_id = _resolve_seller_id(current_user, company_id)
    customer = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.company_id == seller_id
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == seller_id).first()
    company = db.query(Company).filter(Company.id == seller_id).first()
    legacy_pagination = getattr(settings, "horus_legacy_pagination", False) if settings else False
    default_disc = float(customer.discount or 35.0)

    mode_up = (replenishment_mode or "REMESSA").strip().upper()
    if mode_up not in ("REMESSA", "VENDA_ACERTO", "AMBOS"):
        mode_up = "REMESSA"

    cfop_remessa_tuple = ("5917", "6917")
    cfop_venda_acerto_tuple = ("5102", "5108", "6102", "6108", "5114", "5113", "6114", "6113")
    if mode_up == "VENDA_ACERTO":
        target_cfops_tuple = cfop_venda_acerto_tuple
    elif mode_up == "AMBOS":
        target_cfops_tuple = cfop_remessa_tuple + cfop_venda_acerto_tuple
    else:
        target_cfops_tuple = cfop_remessa_tuple

    include_active_consigned_views = mode_up in ("REMESSA", "AMBOS")

    excluded_set: set[str] = _load_seller_product_exclusion_sets(
        db, seller_id, hide_ebooks=hide_ebooks, hide_out_of_print=hide_out_of_print
    )
    if exclude_isbns:
        for raw_c in exclude_isbns.split(","):
            cl = raw_c.strip().replace("-", "").replace(" ", "")
            if cl:
                excluded_set.add(cl)

    sql_client = None
    sql_init_error = None
    try:
        sql_client = HorusSQLClient(db, seller_id)
    except Exception as sql_exc:
        sql_client = None
        sql_init_error = f"{type(sql_exc).__name__}: {str(sql_exc)}"

    cod_cli = _resolve_customer_horus_cod_cli(db, customer, sql_client)
    cod_empresa, cod_filial = _resolve_horus_empresa_filial(settings, sql_client)
    branch_cnpj = sql_client.get_branch_cnpj() if sql_client else None
    effective_cnpj_destino = branch_cnpj or (_sanitize_doc(company.document or "") if company else "")
    clean_cli_doc = _sanitize_doc(customer.document or "")

    # Mapa de itens candidatos indexado por ISBN/código limpo
    candidates_by_key: dict[str, dict] = {}
    consigned_from_api_count = 0
    consigned_from_sql_count = 0
    nf_itens_skus_count = 0
    nf_itens_total_units = 0
    sql_errors: list[str] = []
    if sql_init_error:
        sql_errors.append(f"Conexão SQL Horus: {sql_init_error}")
    if not cod_cli:
        sql_errors.append(
            f"Cliente #{customer.id} ({customer.name}) não possui COD_CLI do Horus vinculado (CNPJ: {clean_cli_doc or 'não informado'})."
        )

    api_diagnostic: dict = {
        "endpoint": "Busca_Contrato_Cliente_Analitico",
        "status": "NOT_CALLED",
        "message": "",
        "params": {},
        "itemsReturned": 0,
        "rawResponse": None,
        "customerB2BInfo": None,
    }
    sql_diagnostic: dict = {
        "codCli": cod_cli,
        "codFilial": cod_filial,
        "replenishmentMode": mode_up,
        "consignmentSource": "NF_ITENS",
        "consignedSkusFound": 0,
        "salesCfops": list(target_cfops_tuple),
        "salesSkusFound": 0,
        "salesTotalUnits": 0,
        "sqlErrors": sql_errors,
    }

    # ── PASSO 1: Consultar NF_ITENS diretamente pelo COD_CLI (100% SARGable, sem limite de dias) ──
    # Verifica cache em memória (45s) para evitar re-consultas pesadas em cliques seguidos
    cache_key = (seller_id, customer.id, cod_cli, cod_empresa, cod_filial, mode_up, client_sales_days, general_sales_days)
    now_ts = _time.time()
    with _REPLENISHMENT_CACHE_LOCK:
        cached_entry = _REPLENISHMENT_CACHE.get(cache_key)
        if cached_entry and (now_ts - cached_entry["ts"] <= _REPLENISHMENT_CACHE_TTL):
            cached_items = [
                dict(it)
                for it in cached_entry["items"]
                if not _is_item_excluded_by_dbm_flags(
                    isbn=it["isbn"],
                    cod_item=it.get("sku"),
                    title=it.get("title", ""),
                    subject=it.get("subject", ""),
                    excluded_keys=excluded_set,
                    hide_ebooks=hide_ebooks,
                )
            ][:limit]
            return {
                "replenishmentMode": mode_up,
                "consignedItemsCount": sum(1 for x in cached_items if x.get("consignedBalance", 0) > 0),
                "consignedFromApiCount": 0,
                "consignedFromSqlCount": cached_entry["consignedFromSqlCount"],
                "soldInWindowCount": len(cached_items),
                "apiDiagnostic": api_diagnostic,
                "sqlDiagnostic": cached_entry["sqlDiagnostic"],
                "items": cached_items,
            }

    if sql_client and cod_cli:
        sargable_cfops_in = _build_sargable_cfop_in_sql(target_cfops_tuple)
        qty_by_cod_item: dict[int, int] = {}
        consig_by_cod_item: dict[int, int] = {}

        # 1A. Coleta rápida e SARGable direto em NF_ITENS por COD_CLI, COD_EMPRESA, COD_FILIAL e COD_NATUREZA
        sql_fast_nf_itens = f"""
            SELECT
                NFI.COD_ITEM AS cod_item,
                SUM(ISNULL(NFI.QTD_ITENS, 0)) AS qtd_movimentada
            FROM NF_ITENS NFI WITH (NOLOCK)
            WHERE NFI.COD_CLI = %s
              AND NFI.COD_EMPRESA = {cod_empresa}
              AND NFI.COD_FILIAL = {cod_filial}
              AND NFI.COD_NATUREZA IN ({sargable_cfops_in})
            GROUP BY NFI.COD_ITEM
        """
        try:
            nf_rows = sql_client.query(sql_fast_nf_itens, (cod_cli,), max_rows=2000)
            for r in (nf_rows or []):
                raw_c = r.get("cod_item")
                if raw_c is not None and str(raw_c).isdigit():
                    c_int = int(raw_c)
                    q_mov = int(float(r.get("qtd_movimentada") or 0))
                    if q_mov > 0:
                        qty_by_cod_item[c_int] = q_mov
                        nf_itens_skus_count += 1
                        nf_itens_total_units += q_mov
        except Exception as e:
            err_detail = f"Erro SQL em NF_ITENS: {type(e).__name__}: {str(e)}"
            sql_errors.append(err_detail)
            log.warning(f"[DBM Desk] Aviso ao consultar NF_ITENS na reposição: {e}")

        # 1B. Coleta rápida do Saldo Consignado atual deste cliente na filial (VW_ITENS_CONSIGNACAO)
        try:
            sql_fast_consig = f"""
                SELECT
                    COD_ITEM AS cod_item,
                    SUM(ISNULL(SALDO, 0)) AS saldo_consig
                FROM VW_ITENS_CONSIGNACAO WITH (NOLOCK)
                WHERE COD_CLI = %s
                  AND COD_EMPRESA = {cod_empresa}
                  AND COD_FILIAL = {cod_filial}
                  AND ISNULL(SALDO, 0) > 0
                GROUP BY COD_ITEM
            """
            c_rows = sql_client.query(sql_fast_consig, (cod_cli,), max_rows=2000)
            for cr in (c_rows or []):
                raw_c = cr.get("cod_item")
                if raw_c is not None and str(raw_c).isdigit():
                    c_int = int(raw_c)
                    s_val = int(float(cr.get("saldo_consig") or 0))
                    if s_val > 0:
                        consig_by_cod_item[c_int] = s_val
                        consigned_from_sql_count += 1
        except Exception as e:
            log.warning(f"[DBM Desk] Aviso ao consultar VW_ITENS_CONSIGNACAO na reposição: {e}")

        # Define conjunto de COD_ITEM candidatos conforme o modo ativo
        if include_active_consigned_views:
            candidate_cod_items = sorted(set(qty_by_cod_item.keys()) | set(consig_by_cod_item.keys()))
        else:
            candidate_cod_items = sorted(set(qty_by_cod_item.keys()))

        sql_diagnostic["consignedSkusFound"] = consigned_from_sql_count
        sql_diagnostic["salesSkusFound"] = nf_itens_skus_count
        sql_diagnostic["salesTotalUnits"] = nf_itens_total_units

        # 1C. Busca indexada por COD_ITEM IN (...) em VW_SALDO_ITENS (apenas com saldo_disponivel > 0) + Metadados do Item
        if candidate_cod_items:
            try:
                for idx_start in range(0, len(candidate_cod_items), 250):
                    chunk_cods = candidate_cod_items[idx_start:idx_start + 250]
                    cods_in_sql = ", ".join(str(c) for c in chunk_cods)
                    sql_meta_stock = f"""
                        SELECT
                            I.COD_ITEM AS cod_item,
                            RTRIM(LTRIM(ISNULL(I.COD_BARRA_ITEM, ISNULL(I.COD_ISBN_ITEM, CAST(I.COD_ITEM AS VARCHAR))))) AS isbn,
                            RTRIM(LTRIM(ISNULL(I.NOM_ITEM, CONCAT('Item #', I.COD_ITEM)))) AS nome_item,
                            RTRIM(LTRIM(ISNULL(ED.NOM_FANTASIA, ISNULL(ED.NOM_EDITORA, 'Editora')))) AS editora,
                            RTRIM(LTRIM(ISNULL(G.NOM_GENERO, 'Geral'))) AS assunto,
                            ISNULL(PA.VLR_CAPA, ISNULL(I.VLR_CAPA, 0.0)) AS preco_capa,
                            S.saldo_disponivel AS estoque_atual,
                            ISNULL(I.QTD_ITENS_CAIXA, 12) AS qtd_caixa
                        FROM (
                            SELECT cod_item, SUM(ISNULL(saldo_disponivel, 0)) AS saldo_disponivel
                            FROM VW_SALDO_ITENS WITH (NOLOCK)
                            WHERE cod_empresa = {cod_empresa}
                              AND cod_filial = {cod_filial}
                              AND cod_item IN ({cods_in_sql})
                            GROUP BY cod_item
                            HAVING SUM(ISNULL(saldo_disponivel, 0)) > 0
                        ) S
                        INNER JOIN ITENS_ESTOQUE_GERAL I WITH (NOLOCK) ON I.COD_ITEM = S.cod_item
                        LEFT JOIN EDITORA ED WITH (NOLOCK) ON ED.COD_EDITORA = I.COD_EDITORA
                        LEFT JOIN TABELA_GENERO G WITH (NOLOCK) ON G.COD_GENERO = I.COD_GENERO
                        LEFT JOIN (
                            SELECT COD_ITEM, MAX(VLR_CAPA) AS VLR_CAPA
                            FROM ITENS_ESTPRECO_ATUAL WITH (NOLOCK)
                            WHERE COD_ITEM IN ({cods_in_sql})
                            GROUP BY COD_ITEM
                        ) PA ON PA.COD_ITEM = I.COD_ITEM
                        WHERE ISNULL(I.STA_ATIVO, 'S') <> 'N'
                    """
                    m_rows = sql_client.query(sql_meta_stock, max_rows=300)
                    for mr in (m_rows or []):
                        c_int = int(mr["cod_item"])
                        est_atual = int(float(mr.get("estoque_atual") or 0))
                        if est_atual <= 0:
                            continue
                        isbn = str(mr.get("isbn") or c_int).strip().replace("-", "").replace(" ", "")
                        if not isbn:
                            continue
                        candidates_by_key[isbn] = {
                            "isbn": isbn,
                            "sku": str(c_int),
                            "cod_item": c_int,
                            "title": str(mr.get("nome_item") or f"Item #{isbn}").strip(),
                            "publisher": str(mr.get("editora") or "Editora").strip(),
                            "subject": str(mr.get("assunto") or "Geral").strip(),
                            "coverPrice": round(float(mr.get("preco_capa") or 0.0), 2),
                            "discountPct": default_disc,
                            "consignedBalance": consig_by_cod_item.get(c_int, 0),
                            "soldInReplenishmentWindow": qty_by_cod_item.get(c_int, 0),
                            "stockAvailable": est_atual,
                            "boxQty": max(1, int(mr.get("qtd_caixa") or 12)),
                            "_consig_loaded": True,
                        }
            except Exception as e:
                err_msg = f"Erro SQL ao enriquecer saldo/metadados por COD_ITEM: {type(e).__name__}: {str(e)}"
                sql_errors.append(err_msg)
                log.warning(f"[DBM Desk] Aviso ao enriquecer estoque SQL da reposição: {e}")

    # Fallback via HorusBISale local caso o banco SQL não tenha retornado itens
    if not candidates_by_key:
        try:
            q_bi_rep = db.query(
                HorusBISale.ean,
                HorusBISale.item_code,
                HorusBISale.item_name,
                HorusBISale.publisher,
                HorusBISale.genre,
                func.sum(HorusBISale.qty_fulfilled).label("sold_x"),
                func.max(HorusBISale.gross_value).label("max_gross")
            ).filter(
                HorusBISale.company_id == seller_id,
                HorusBISale.cfop.in_(list(target_cfops_tuple))
            )
            if cod_cli:
                q_bi_rep = q_bi_rep.filter(
                    or_(HorusBISale.customer_id == customer.id, HorusBISale.customer_horus_id == cod_cli)
                )
            else:
                q_bi_rep = q_bi_rep.filter(HorusBISale.customer_id == customer.id)

            bi_rows = q_bi_rep.group_by(
                HorusBISale.ean, HorusBISale.item_code, HorusBISale.item_name, HorusBISale.publisher, HorusBISale.genre
            ).order_by(func.sum(HorusBISale.qty_fulfilled).desc()).limit(limit).all()

            for r in bi_rows:
                isbn = str(r.ean or "").strip().replace("-", "").replace(" ", "")
                if not isbn:
                    continue
                qty_x = int(r.sold_x or 0)
                nf_itens_skus_count += 1
                candidates_by_key[isbn] = {
                    "isbn": isbn,
                    "sku": str(r.item_code or isbn),
                    "cod_item": int(r.item_code) if str(r.item_code).isdigit() else None,
                    "title": str(r.item_name or f"Livro {isbn}").strip(),
                    "publisher": str(r.publisher or "Editora").strip(),
                    "subject": str(r.genre or "Reposição").strip(),
                    "coverPrice": round(float(r.max_gross or 0.0), 2),
                    "discountPct": default_disc,
                    "consignedBalance": 0,
                    "soldInReplenishmentWindow": qty_x,
                }
        except Exception as e:
            log.warning(f"[DBM Desk] Aviso ao complementar reposição via HorusBISale: {e}")

    # Complementa estoque/preço com base local prd_product apenas se necessário (fallback sem SQL)
    all_keys = [k for k, v in candidates_by_key.items() if "stockAvailable" not in v]
    if all_keys:
        try:
            l_prods = db.query(Product, Brand.name.label("brand_name"), Category.name.label("cat_name")).outerjoin(
                Brand, Brand.id == Product.brand_id
            ).outerjoin(
                Category, Category.id == Product.category_id
            ).filter(
                Product.company_id == seller_id,
                Product.ean_gtin.in_(all_keys)
            ).all()
            for lp, b_name, c_name in l_prods:
                k = str(lp.ean_gtin or "").strip().replace("-", "").replace(" ", "")
                if k in candidates_by_key:
                    c_obj = candidates_by_key[k]
                    if "stockAvailable" not in c_obj:
                        c_obj["stockAvailable"] = int(lp.stock_quantity or 0)
                    if not c_obj.get("coverPrice"):
                        c_obj["coverPrice"] = round(float(lp.promotional_price or lp.base_price or 0.0), 2)
                    if not c_obj.get("subject") or c_obj["subject"] in ("Consignado", "Reposição"):
                        c_obj["subject"] = lp.subject or c_name or "Geral"
                    if not c_obj.get("publisher") or c_obj["publisher"] == "Editora":
                        c_obj["publisher"] = b_name or lp.brand or "Editora"
                    c_obj["boxQty"] = max(1, int(lp.units_per_box or 12))
        except Exception as e:
            db.rollback()
            log.warning(f"[DBM Desk] Aviso ao cruzar prd_product na reposição: {e}")

    # Monta todos os itens com estoque > 0, ordena e enriquece giro uma única vez
    all_valid_items: list[dict] = []
    for k, c_obj in candidates_by_key.items():
        stock_val = int(c_obj.get("stockAvailable") or 0)
        if stock_val <= 0:
            continue
        sold_x = int(c_obj.get("soldInReplenishmentWindow") or 0)
        all_valid_items.append({
            "id": f"rep-{k}",
            "isbn": k,
            "sku": str(c_obj.get("sku") or k),
            "title": c_obj.get("title") or f"Livro {k}",
            "publisher": c_obj.get("publisher") or "Editora",
            "subject": c_obj.get("subject") or "Geral",
            "coverPrice": float(c_obj.get("coverPrice") or 0.0),
            "discountPct": float(c_obj.get("discountPct") or default_disc),
            "requestedQty": 0,
            "consignedBalance": int(c_obj.get("consignedBalance") or 0),
            "consignedQty": int(c_obj.get("consignedBalance") or 0),
            "historyQty": sold_x,
            "clientSalesPeriod": 0,
            "stockAvailable": stock_val,
            "boxQty": int(c_obj.get("boxQty") or 12),
            "clientSales365d": 0,
            "generalSalesPeriod": 0,
            "sourceTab": "REPOSICAO",
            "addedOrigin": None,
            "manualStatus": None,
            "_consig_loaded": True,
        })

    all_valid_items.sort(
        key=lambda x: (x.get("consignedBalance", 0), x.get("historyQty", 0), x.get("stockAvailable", 0)),
        reverse=True
    )

    _enrich_items_with_bi_metrics(
        db=db,
        seller_id=seller_id,
        customer=customer,
        cod_cli=cod_cli,
        items_list=all_valid_items,
        client_sales_days=client_sales_days,
        general_sales_days=general_sales_days,
        sql_client=sql_client,
    )

    for it in all_valid_items:
        it.pop("_consig_loaded", None)

    # Salva no cache de 45s antes de aplicar exclude_isbns (para que re-cliques apliquem exclude_isbns atualizado instantaneamente)
    with _REPLENISHMENT_CACHE_LOCK:
        _REPLENISHMENT_CACHE[cache_key] = {
            "ts": _time.time(),
            "items": [dict(x) for x in all_valid_items],
            "consignedFromSqlCount": consigned_from_sql_count,
            "sqlDiagnostic": sql_diagnostic,
        }

    final_items = [
        it
        for it in all_valid_items
        if not _is_item_excluded_by_dbm_flags(
            isbn=it["isbn"],
            cod_item=it.get("sku"),
            title=it.get("title", ""),
            subject=it.get("subject", ""),
            excluded_keys=excluded_set,
            hide_ebooks=hide_ebooks,
        )
    ][:limit]

    return {
        "replenishmentMode": mode_up,
        "consignedItemsCount": sum(1 for x in final_items if x.get("consignedBalance", 0) > 0),
        "consignedFromApiCount": consigned_from_api_count,
        "consignedFromSqlCount": consigned_from_sql_count,
        "soldInWindowCount": len(final_items),
        "apiDiagnostic": api_diagnostic,
        "sqlDiagnostic": sql_diagnostic,
        "items": final_items,
    }


@router.get("/proposals-desk/last-operation-items")
async def get_proposals_desk_last_operation_items(
    customer_id: int = Query(..., description="ID do cliente selecionado"),
    operation_type: str = Query("ACERTO", description="ACERTO (CFOP 5113/5114/6113/6114) ou VENDA"),
    exclude_isbns: Optional[str] = Query(None, description="ISBNs separados por vírgula já presentes em outras abas"),
    hide_ebooks: bool = Query(True, description="Ocultar e-books"),
    hide_out_of_print: bool = Query(True, description="Ocultar esgotados"),
    company_id: Optional[int] = Query(None),
    client_sales_days: int = Query(30, ge=1, le=730),
    general_sales_days: int = Query(90, ge=1, le=730),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Busca os itens da Última Venda ou Último Acerto do cliente sob demanda:
    - Consulta NF_ITENS pelo COD_CLI e COD_NF, cruzando com NF_MESTRE pelo COD_NF.
    - Higieniza o CFOP (COD_NATUREZA) olhando apenas números:
      * ACERTO: 5113, 5114, 6113, 6114
      * VENDA: 5101, 5102, 6101, 6102, 5403, 6403, 5405, 6405
    - Filtra apenas itens com saldo de estoque > 0 e sem duplicar itens já em outras abas.
    """
    from app.models.product import Product
    from app.models.horus_bi_sale import HorusBISale

    seller_id = _resolve_seller_id(current_user, company_id)
    customer = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.company_id == seller_id
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == seller_id).first()
    legacy_pagination = getattr(settings, "horus_legacy_pagination", False) if settings else False
    default_disc = float(customer.discount or 35.0)

    excluded_set: set[str] = _load_seller_product_exclusion_sets(
        db, seller_id, hide_ebooks=hide_ebooks, hide_out_of_print=hide_out_of_print
    )
    if exclude_isbns:
        for raw_c in exclude_isbns.split(","):
            cl = raw_c.strip().replace("-", "").replace(" ", "")
            if cl:
                excluded_set.add(cl)

    op_mode = (operation_type or "ACERTO").strip().upper()
    target_cfops = CFOP_ACERTO_LIST if op_mode == "ACERTO" else CFOP_VENDA_LIST

    sql_client = None
    try:
        sql_client = HorusSQLClient(db, seller_id)
    except Exception:
        sql_client = None

    cod_cli = _resolve_customer_horus_cod_cli(db, customer, sql_client)
    cod_empresa, cod_filial = _resolve_horus_empresa_filial(settings, sql_client)

    items_out: list[dict] = []
    invoice_meta = {
        "operationType": op_mode,
        "cfopsFilter": list(target_cfops),
        "doc": "—",
        "codNf": None,
        "date": "—",
        "cfop": "—",
        "totalUnits": 0,
        "totalValue": 0.0,
        "source": "NONE",
    }

    # 1. Consulta direta no Horus SQL (NF_MESTRE + NF_ITENS + ITENS_ESTOQUE_GERAL + VW_SALDO_ITENS)
    if sql_client and cod_cli:
        cfop_in = ", ".join(f"'{c}'" for c in target_cfops)
        clean_cfop_expr = "REPLACE(REPLACE(REPLACE(RTRIM(LTRIM(ISNULL(NFI.COD_NATUREZA, NF.COD_NATUREZA))), '.', ''), ',', ''), ' ', '')"
        top_clause = "TOP 1" if legacy_pagination else ""
        offset_clause = "" if legacy_pagination else "OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY"

        sql_find_nf = f"""
            SELECT {top_clause}
                NF.COD_NF AS cod_nf,
                NF.COD_EMPRESA AS cod_empresa,
                NF.COD_FILIAL AS cod_filial,
                ISNULL(NF.NRO_NOTA_FISCAL, CAST(NF.COD_NF AS VARCHAR)) AS nro_nf,
                NF.DAT_EMISSAO_NF AS dat_emissao,
                MAX({clean_cfop_expr}) AS cfop_clean
            FROM NF_MESTRE NF WITH (NOLOCK)
            INNER JOIN NF_ITENS NFI WITH (NOLOCK)
                ON NFI.COD_NF = NF.COD_NF
                AND NFI.COD_FILIAL = NF.COD_FILIAL
                AND NFI.COD_EMPRESA = NF.COD_EMPRESA
            WHERE NF.COD_CLI = %s
              AND NF.COD_EMPRESA = {cod_empresa}
              AND NF.COD_FILIAL = {cod_filial}
              AND ISNULL(NF.SIT_NF, '') NOT IN ('C', 'CAN')
              AND {clean_cfop_expr} IN ({cfop_in})
            GROUP BY NF.COD_NF, NF.COD_EMPRESA, NF.COD_FILIAL, NF.NRO_NOTA_FISCAL, NF.DAT_EMISSAO_NF
            ORDER BY NF.DAT_EMISSAO_NF DESC, NF.COD_NF DESC
            {offset_clause}
        """
        try:
            nf_rows = sql_client.query(sql_find_nf, (cod_cli,), max_rows=1)
            if nf_rows and len(nf_rows) > 0:
                nf_head = nf_rows[0]
                target_cod_nf = int(nf_head["cod_nf"])
                target_emp = int(nf_head.get("cod_empresa") or 1)
                target_fil = int(nf_head.get("cod_filial") or cod_filial)

                sql_items = f"""
                    SELECT
                        NFI.COD_ITEM AS cod_item,
                        RTRIM(LTRIM(ISNULL(I.COD_BARRA_ITEM, ISNULL(I.COD_ISBN_ITEM, CAST(NFI.COD_ITEM AS VARCHAR))))) AS isbn,
                        RTRIM(LTRIM(ISNULL(I.NOM_ITEM, CONCAT('Item #', NFI.COD_ITEM)))) AS nome_item,
                        RTRIM(LTRIM(ISNULL(ED.NOM_FANTASIA, ISNULL(ED.NOM_EDITORA, 'Editora')))) AS editora,
                        RTRIM(LTRIM(ISNULL(G.NOM_GENERO, 'Geral'))) AS assunto,
                        ISNULL(NFI.QTD_ITENS, 0) AS qtd_nf,
                        ISNULL(NFI.VLR_BRUTO_ITEM, ISNULL(PA.VLR_CAPA, 0.0)) AS vlr_bruto,
                        ISNULL(NFI.VLR_LIQUIDO_ITEM, 0.0) AS vlr_liquido,
                        ISNULL(NFI.VLR_DESCONTO_ITEM, 0.0) AS vlr_desconto,
                        ISNULL(S.saldo_disponivel, 0) AS estoque_atual,
                        ISNULL(I.QTD_ITENS_CAIXA, 12) AS qtd_caixa,
                        {clean_cfop_expr} AS cfop_item
                    FROM NF_ITENS NFI WITH (NOLOCK)
                    INNER JOIN NF_MESTRE NF WITH (NOLOCK)
                        ON NF.COD_NF = NFI.COD_NF
                        AND NF.COD_FILIAL = NFI.COD_FILIAL
                        AND NF.COD_EMPRESA = NFI.COD_EMPRESA
                    LEFT JOIN ITENS_ESTOQUE_GERAL I WITH (NOLOCK) ON I.COD_ITEM = NFI.COD_ITEM
                    LEFT JOIN EDITORA ED WITH (NOLOCK) ON ED.COD_EDITORA = I.COD_EDITORA
                    LEFT JOIN TABELA_GENERO G WITH (NOLOCK) ON G.COD_GENERO = I.COD_GENERO
                    LEFT JOIN ITENS_ESTPRECO_ATUAL PA WITH (NOLOCK) ON PA.COD_ITEM = NFI.COD_ITEM
                    LEFT JOIN VW_SALDO_ITENS S WITH (NOLOCK) ON S.cod_item = NFI.COD_ITEM AND S.cod_filial = {target_fil}
                    WHERE NFI.COD_CLI = %s
                      AND NFI.COD_NF = %s
                      AND NFI.COD_EMPRESA = %s
                      AND NFI.COD_FILIAL = %s
                      AND {clean_cfop_expr} IN ({cfop_in})
                    ORDER BY NFI.COD_ITEM ASC
                """
                raw_nf_items = sql_client.query(
                    sql_items,
                    (cod_cli, target_cod_nf, target_emp, target_fil),
                    max_rows=500
                )

                tot_u = 0
                tot_v = 0.0
                for idx, r in enumerate(raw_nf_items or []):
                    est_atual = max(0, int(float(r.get("estoque_atual") or 0)))
                    if est_atual <= 0:
                        continue
                    isbn = str(r.get("isbn") or r.get("cod_item") or "").strip()
                    clean_isbn = isbn.replace("-", "").replace(" ", "")
                    if clean_isbn in excluded_set or _is_item_excluded_by_dbm_flags(
                        isbn=isbn,
                        cod_item=r.get("cod_item"),
                        title=str(r.get("nome_item") or ""),
                        subject=str(r.get("assunto") or ""),
                        excluded_keys=excluded_set,
                        hide_ebooks=hide_ebooks,
                    ):
                        continue
                    excluded_set.add(clean_isbn)

                    qty_nf = max(1, int(float(r.get("qtd_nf") or 1)))
                    gross = float(r.get("vlr_bruto") or 0.0)
                    net = float(r.get("vlr_liquido") or 0.0)
                    unit_gross = gross if gross > 0 else 49.90
                    if net > 0 and gross > 0 and net <= gross:
                        disc_pct = round(max(0.0, min(90.0, (1.0 - (net / gross)) * 100.0)), 2)
                    else:
                        disc_pct = default_disc
                    unit_net = round(unit_gross * (1.0 - disc_pct / 100.0), 2)
                    tot_u += qty_nf
                    tot_v += round(unit_net * qty_nf, 2)

                    items_out.append({
                        "id": f"ult-sql-{target_cod_nf}-{idx}",
                        "isbn": isbn,
                        "sku": str(r.get("cod_item") or isbn),
                        "title": str(r.get("nome_item") or f"Item #{isbn}"),
                        "publisher": str(r.get("editora") or "Editora"),
                        "subject": str(r.get("assunto") or "Geral"),
                        "coverPrice": round(unit_gross, 2),
                        "discountPct": disc_pct,
                        "requestedQty": 0,
                        "lastOperationQty": qty_nf,
                        "consignedBalance": 0,
                        "clientSalesPeriod": 0,
                        "stockAvailable": est_atual,
                        "boxQty": max(1, int(r.get("qtd_caixa") or 12)),
                        "clientSales365d": qty_nf,
                        "generalSalesPeriod": 0,
                        "sourceTab": "ULTIMO_ACERTO",
                        "addedOrigin": None,
                        "manualStatus": None,
                    })

                nro_str = str(nf_head.get("nro_nf") or target_cod_nf).strip()
                invoice_meta = {
                    "operationType": op_mode,
                    "cfopsFilter": list(target_cfops),
                    "doc": f"NF #{nro_str}",
                    "codNf": target_cod_nf,
                    "date": _format_br_date(nf_head.get("dat_emissao")),
                    "cfop": str(nf_head.get("cfop_clean") or target_cfops[0]),
                    "totalUnits": tot_u,
                    "totalValue": round(tot_v, 2),
                    "source": "HORUS_SQL",
                }
        except Exception as e:
            log.warning(f"[DBM Desk] Aviso ao buscar itens de {op_mode} via SQL: {e}")

    # 2. Fallback Híbrido via HorusBISale (caso SQL Server esteja offline ou sem nota)
    if not items_out:
        try:
            q_bi = db.query(HorusBISale).filter(
                HorusBISale.company_id == seller_id,
                HorusBISale.cfop.in_(list(target_cfops))
            )
            if cod_cli:
                q_bi = q_bi.filter(
                    or_(HorusBISale.customer_id == customer.id, HorusBISale.customer_horus_id == cod_cli)
                )
            else:
                q_bi = q_bi.filter(HorusBISale.customer_id == customer.id)

            latest_sale = q_bi.order_by(HorusBISale.sale_date.desc(), HorusBISale.id.desc()).first()
            if latest_sale:
                if latest_sale.invoice_number:
                    nf_sales = q_bi.filter(HorusBISale.invoice_number == latest_sale.invoice_number).all()
                else:
                    nf_sales = q_bi.filter(HorusBISale.sale_date == latest_sale.sale_date).limit(100).all()

                eans = [str(s.ean).strip() for s in nf_sales if s.ean]
                l_prods = db.query(Product).filter(
                    Product.company_id == seller_id,
                    Product.ean_gtin.in_(eans)
                ).all() if eans else []
                l_map = {str(p.ean_gtin).strip(): p for p in l_prods}

                tot_u = 0
                tot_v = 0.0
                for idx, s in enumerate(nf_sales):
                    isbn = str(s.ean or "").strip()
                    clean_isbn = isbn.replace("-", "").replace(" ", "")
                    if not clean_isbn or clean_isbn in excluded_set:
                        continue
                    lp = l_map.get(isbn)
                    est_loc = max(0, int(lp.stock_quantity or 0)) if lp else 15
                    if est_loc <= 0:
                        continue
                    excluded_set.add(clean_isbn)

                    qty_nf = max(1, int(s.qty_fulfilled or s.qty_ordered or 1))
                    gross = float(lp.promotional_price or lp.base_price or 0.0) if lp else float(s.gross_value or 49.90)
                    disc = float(s.discount_percent or default_disc)
                    net_val = float(s.net_value or round(gross * (1.0 - disc / 100.0) * qty_nf, 2))
                    tot_u += qty_nf
                    tot_v += net_val

                    items_out.append({
                        "id": f"ult-bi-{s.id}-{idx}",
                        "isbn": isbn,
                        "sku": str(s.item_code or (lp.sku if lp else isbn)),
                        "title": (lp.name if lp else s.item_name) or f"Livro {isbn}",
                        "publisher": s.publisher or (lp.brand if lp else "Editora"),
                        "subject": s.genre or "Catálogo",
                        "coverPrice": round(gross, 2),
                        "discountPct": round(disc, 2),
                        "requestedQty": 0,
                        "lastOperationQty": qty_nf,
                        "consignedBalance": 0,
                        "clientSalesPeriod": 0,
                        "stockAvailable": est_loc,
                        "boxQty": 12,
                        "clientSales365d": qty_nf,
                        "generalSalesPeriod": 0,
                        "sourceTab": "ULTIMO_ACERTO",
                        "addedOrigin": None,
                        "manualStatus": None,
                    })

                invoice_meta = {
                    "operationType": op_mode,
                    "cfopsFilter": list(target_cfops),
                    "doc": f"NF #{latest_sale.invoice_number}" if latest_sale.invoice_number else "Histórico BI",
                    "codNf": latest_sale.invoice_number,
                    "date": _format_br_date(latest_sale.sale_date),
                    "cfop": str(latest_sale.cfop or target_cfops[0]),
                    "totalUnits": tot_u,
                    "totalValue": round(tot_v, 2),
                    "source": "CRONUZ_BI",
                }
        except Exception as e:
            log.warning(f"[DBM Desk] Aviso no fallback BI de {op_mode}: {e}")

    _enrich_items_with_bi_metrics(
        db=db,
        seller_id=seller_id,
        customer=customer,
        cod_cli=cod_cli,
        items_list=items_out,
        client_sales_days=client_sales_days,
        general_sales_days=general_sales_days,
        sql_client=sql_client,
    )

    return {
        "invoice": invoice_meta,
        "items": items_out,
    }


@router.get("/proposals-desk/product-lookup")
async def lookup_proposals_desk_product(
    q: str = Query(..., min_length=2, description="ISBN, Código Horus, SKU ou Título"),
    customer_id: Optional[int] = Query(None),
    company_id: Optional[int] = Query(None),
    client_sales_days: int = Query(30, ge=1, le=730),
    general_sales_days: int = Query(90, ge=1, le=730),
    hide_ebooks: bool = Query(True, description="Ocultar e-books na pesquisa de produtos"),
    hide_out_of_print: bool = Query(False, description="Ocultar obras esgotadas na pesquisa de produtos"),
    limit: int = Query(15, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Busca rápida híbrida de produtos para a barra de Digitação Manual por Teclado na aba Pedido:
    1. Consulta Horus SQL (ITENS_ESTOQUE_GERAL + VW_SALDO_ITENS) respeitando OFFSET/LIMIT.
    2. Consulta base local prd_product.
    3. Enriquece com giro de vendas (30d, 365d, 90d) do cliente selecionado.
    """
    from app.models.product import Product
    from app.models.catalog_support import Brand, Category

    seller_id = _resolve_seller_id(current_user, company_id)
    customer = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.company_id == seller_id
    ).first() if customer_id else None

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == seller_id).first()
    legacy_pagination = getattr(settings, "horus_legacy_pagination", False) if settings else False
    default_disc = float(customer.discount or 35.0) if customer else 35.0

    sql_client = None
    try:
        sql_client = HorusSQLClient(db, seller_id)
    except Exception:
        sql_client = None

    cod_cli = _resolve_customer_horus_cod_cli(db, customer, sql_client) if customer else None
    cod_filial = int(sql_client.cod_filial) if (sql_client and str(sql_client.cod_filial).isdigit()) else 2

    term = q.strip()
    results: list[dict] = []
    seen_isbns: set[str] = set()
    excluded_keys = _load_seller_product_exclusion_sets(
        db, seller_id, hide_ebooks=hide_ebooks, hide_out_of_print=hide_out_of_print
    )

    # 1. Busca no Horus SQL Server
    if sql_client:
        like_term = f"%{term}%"
        top_clause = f"TOP ({limit})" if legacy_pagination else ""
        offset_clause = "" if legacy_pagination else f"OFFSET 0 ROWS FETCH NEXT {limit} ROWS ONLY"
        sql_q = f"""
            SELECT {top_clause}
                I.COD_ITEM AS cod_item,
                RTRIM(LTRIM(ISNULL(I.COD_BARRA_ITEM, ISNULL(I.COD_ISBN_ITEM, '')))) AS isbn,
                RTRIM(LTRIM(ISNULL(I.NOM_ITEM, ''))) AS nome_item,
                RTRIM(LTRIM(ISNULL(ED.NOM_FANTASIA, ISNULL(ED.NOM_EDITORA, 'Editora')))) AS editora,
                RTRIM(LTRIM(ISNULL(G.NOM_GENERO, 'Geral'))) AS assunto,
                ISNULL(PA.VLR_CAPA, ISNULL(I.VLR_CAPA, 0.0)) AS preco,
                ISNULL(S.saldo_disponivel, 0) AS estoque,
                ISNULL(I.QTD_ITENS_CAIXA, 12) AS qtd_caixa
            FROM ITENS_ESTOQUE_GERAL I WITH (NOLOCK)
            LEFT JOIN EDITORA ED WITH (NOLOCK) ON ED.COD_EDITORA = I.COD_EDITORA
            LEFT JOIN TABELA_GENERO G WITH (NOLOCK) ON G.COD_GENERO = I.COD_GENERO
            LEFT JOIN ITENS_ESTPRECO_ATUAL PA WITH (NOLOCK) ON PA.COD_ITEM = I.COD_ITEM
            LEFT JOIN VW_SALDO_ITENS S WITH (NOLOCK) ON S.cod_item = I.COD_ITEM AND S.cod_filial = {cod_filial}
            WHERE I.COD_BARRA_ITEM = %s
               OR I.COD_ISBN_ITEM = %s
               OR CAST(I.COD_ITEM AS VARCHAR) = %s
               OR I.NOM_ITEM LIKE %s
               OR I.COD_BARRA_ITEM LIKE %s
            ORDER BY
                CASE WHEN I.COD_BARRA_ITEM = %s OR CAST(I.COD_ITEM AS VARCHAR) = %s THEN 0 ELSE 1 END,
                ISNULL(S.saldo_disponivel, 0) DESC,
                I.NOM_ITEM ASC
            {offset_clause}
        """
        try:
            rows = sql_client.query(
                sql_q,
                (term, term, term, like_term, like_term, term, term),
                max_rows=limit
            )
            for r in (rows or []):
                isbn = str(r.get("isbn") or r.get("cod_item") or "").strip()
                if not isbn or isbn in seen_isbns:
                    continue
                if _is_item_excluded_by_dbm_flags(
                    isbn=isbn,
                    cod_item=r.get("cod_item"),
                    title=str(r.get("nome_item") or ""),
                    subject=str(r.get("assunto") or ""),
                    excluded_keys=excluded_keys,
                    hide_ebooks=hide_ebooks,
                ):
                    continue
                seen_isbns.add(isbn)
                results.append({
                    "id": f"lk-sql-{r.get('cod_item') or isbn}",
                    "isbn": isbn,
                    "sku": str(r.get("cod_item") or isbn),
                    "title": str(r.get("nome_item") or f"Item #{isbn}"),
                    "publisher": str(r.get("editora") or "Editora"),
                    "subject": str(r.get("assunto") or "Geral"),
                    "coverPrice": float(r.get("preco") or 0.0),
                    "discountPct": default_disc,
                    "requestedQty": 1,
                    "consignedBalance": 0,
                    "clientSalesPeriod": 0,
                    "stockAvailable": max(0, int(float(r.get("estoque") or 0))),
                    "boxQty": max(1, int(r.get("qtd_caixa") or 12)),
                    "clientSales365d": 0,
                    "generalSalesPeriod": 0,
                    "sourceTab": "PEDIDO",
                    "addedOrigin": "PEDIDO",
                })
        except Exception as e:
            log.warning(f"[DBM Desk] Aviso no product-lookup SQL: {e}")

    # 2. Complementa com base local prd_product
    if len(results) < limit:
        rem = limit - len(results)
        q_loc = db.query(Product, Brand.name.label("brand_name"), Category.name.label("cat_name")).outerjoin(
            Brand, Brand.id == Product.brand_id
        ).outerjoin(
            Category, Category.id == Product.category_id
        ).filter(
            Product.company_id == seller_id,
            Product.status == "ACTIVE",
            or_(
                Product.ean_gtin.ilike(f"%{term}%"),
                Product.sku.ilike(f"%{term}%"),
                Product.name.ilike(f"%{term}%"),
                cast(Product.horus_cod_item, String) == term
            )
        ).order_by(
            Product.stock_quantity.desc(),
            Product.name.asc()
        ).limit(rem).all()

        for p, b_name, c_name in q_loc:
            if hide_out_of_print and getattr(p, "is_out_of_print", False):
                continue
            if hide_ebooks and (getattr(p, "is_ebook", False) or (p.binding_finish and "e-book" in p.binding_finish.lower())):
                continue
            isbn = str(p.ean_gtin or p.sku or p.id).strip()
            if not isbn or isbn in seen_isbns:
                continue
            if _is_item_excluded_by_dbm_flags(isbn, p.horus_cod_item, p.name, p.subject or c_name or "", excluded_keys, hide_ebooks):
                continue
            seen_isbns.add(isbn)
            results.append({
                "id": f"lk-loc-{p.id}",
                "isbn": isbn,
                "sku": str(p.horus_cod_item or p.sku or p.id),
                "title": p.name,
                "publisher": b_name or p.brand or "Editora",
                "subject": c_name or "Catálogo",
                "coverPrice": float(p.promotional_price or p.base_price or 0.0),
                "discountPct": default_disc,
                "requestedQty": 1,
                "consignedBalance": 0,
                "clientSalesPeriod": 0,
                "stockAvailable": max(0, int(p.stock_quantity or 0)),
                "boxQty": int(p.units_per_box or 0),
                "clientSales365d": 0,
                "generalSalesPeriod": 0,
                "sourceTab": "PEDIDO",
                "addedOrigin": "PEDIDO",
            })

    _enrich_items_with_bi_metrics(
        db=db,
        seller_id=seller_id,
        customer=customer,
        cod_cli=cod_cli,
        items_list=results,
        client_sales_days=client_sales_days,
        general_sales_days=general_sales_days,
        sql_client=sql_client,
    )

    return {"items": results}


MAX_PROPOSALS_IMPORT_BYTES = 10 * 1024 * 1024  # 10 MB (Regra mandatória de proteção de upload)


@router.post("/proposals-desk/import-order")
async def import_proposals_desk_order(
    file: Optional[UploadFile] = File(None),
    raw_text: Optional[str] = Form(None),
    customer_id: Optional[int] = Form(None),
    company_id: Optional[int] = Form(None),
    client_sales_days: int = Form(30),
    general_sales_days: int = Form(90),
    default_discount: Optional[float] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Importa itens para a aba 'Pedido' da Mesa Comercial DBM a partir de:
    - Arquivo PDF (.pdf)
    - Planilha Excel/CSV (.xlsx, .xls, .csv)
    - Texto livre colado (E-mail / WhatsApp / Tabela copiada)
    Faz a resolução em lote (batch) no Horus SQL + base local prd_product + BI de vendas.
    """
    from app.core.order_parsers import (
        parse_pdf_to_items,
        parse_spreadsheet_to_items,
        parse_text_to_items,
        sanitize_isbn,
    )
    from app.models.product import Product
    from app.models.catalog_support import Brand, Category

    seller_id = _resolve_seller_id(current_user, company_id)
    customer = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.company_id == seller_id
    ).first() if customer_id else None

    base_disc = (
        float(default_discount)
        if default_discount is not None and default_discount > 0
        else (float(customer.discount or 40.0) if customer else 40.0)
    )

    parsed_entries: list[dict] = []
    source_label = "TEXT"

    if file and file.filename:
        content = await file.read()
        if len(content) > MAX_PROPOSALS_IMPORT_BYTES:
            raise HTTPException(
                status_code=413,
                detail="O arquivo excede o limite máximo permitido de 10 MB para este tipo de envio."
            )
        fname = file.filename.strip()
        lower_fname = fname.lower()
        source_label = fname

        if lower_fname.endswith(".pdf"):
            try:
                parsed_entries = parse_pdf_to_items(content)
            except Exception as e:
                log.error(f"[DBM Desk] Erro ao ler PDF '{fname}': {e}")
                raise HTTPException(status_code=400, detail=f"Falha ao ler arquivo PDF: {str(e)}")
        elif lower_fname.endswith((".xlsx", ".xls", ".csv", ".txt")):
            try:
                parsed_entries = parse_spreadsheet_to_items(content, fname)
                if not parsed_entries and lower_fname.endswith((".csv", ".txt")):
                    txt_dec = content.decode("utf-8-sig", errors="replace")
                    parsed_entries = parse_text_to_items(txt_dec)
            except Exception as e:
                log.error(f"[DBM Desk] Erro ao ler planilha '{fname}': {e}")
                raise HTTPException(status_code=400, detail=f"Falha ao processar planilha ({fname}): {str(e)}")
        else:
            raise HTTPException(
                status_code=400,
                detail="Formato não suportado. Envie um arquivo .PDF, .XLSX, .XLS ou .CSV."
            )
    elif raw_text and raw_text.strip():
        parsed_entries = parse_text_to_items(raw_text)
        # Fallback adicional caso o usuário tenha colado códigos internos ou ISBNs separados por espaço/tab
        if not parsed_entries:
            for line in raw_text.splitlines():
                line_s = line.strip()
                if not line_s:
                    continue
                parts = re.split(r"[\t;,|\s]+", line_s)
                code_cand = sanitize_isbn(parts[0])
                if len(code_cand) >= 4:
                    q_val = 1
                    if len(parts) > 1 and parts[-1].isdigit():
                        q_val = max(1, int(parts[-1]))
                    parsed_entries.append({"ean": code_cand, "quantity": q_val, "discount": 0.0})

    if not parsed_entries:
        return {
            "totalParsed": 0,
            "source": source_label,
            "items": [],
            "message": "Nenhum ISBN de 10 ou 13 dígitos foi encontrado no arquivo/texto enviado."
        }

    # Lista ordenada de EANs únicos preservando a ordem do arquivo/pedido
    ordered_eans: list[str] = []
    qty_by_ean: dict[str, int] = {}
    disc_by_ean: dict[str, float] = {}
    for entry in parsed_entries:
        ean = str(entry.get("ean") or "").strip()
        if not ean:
            continue
        if ean not in qty_by_ean:
            ordered_eans.append(ean)
            qty_by_ean[ean] = 0
        qty_by_ean[ean] += max(1, int(entry.get("quantity") or 1))
        if float(entry.get("discount") or 0.0) > 0:
            disc_by_ean[ean] = float(entry["discount"])

    sql_client = None
    try:
        sql_client = HorusSQLClient(db, seller_id)
    except Exception:
        sql_client = None

    cod_cli = _resolve_customer_horus_cod_cli(db, customer, sql_client) if customer else None
    cod_filial = int(sql_client.cod_filial) if (sql_client and str(sql_client.cod_filial).isdigit()) else 2

    found_by_ean: dict[str, dict] = {}

    # 1. Resolução em lote no Horus SQL Server (em chunks de até 200 ISBNs)
    if sql_client and ordered_eans:
        try:
            for chunk_start in range(0, len(ordered_eans), 200):
                chunk = ordered_eans[chunk_start:chunk_start + 200]
                placeholders = ", ".join(["%s"] * len(chunk))
                sql_batch = f"""
                    SELECT
                        I.COD_ITEM AS cod_item,
                        RTRIM(LTRIM(ISNULL(I.COD_BARRA_ITEM, ''))) AS cod_barra,
                        RTRIM(LTRIM(ISNULL(I.COD_ISBN_ITEM, ''))) AS cod_isbn,
                        RTRIM(LTRIM(ISNULL(I.NOM_ITEM, ''))) AS nome_item,
                        RTRIM(LTRIM(ISNULL(ED.NOM_FANTASIA, ISNULL(ED.NOM_EDITORA, 'Editora')))) AS editora,
                        RTRIM(LTRIM(ISNULL(G.NOM_GENERO, 'Geral'))) AS assunto,
                        ISNULL(PA.VLR_CAPA, ISNULL(I.VLR_CAPA, 0.0)) AS preco,
                        ISNULL(S.saldo_disponivel, 0) AS estoque,
                        ISNULL(I.QTD_ITENS_CAIXA, 12) AS qtd_caixa
                    FROM ITENS_ESTOQUE_GERAL I WITH (NOLOCK)
                    LEFT JOIN EDITORA ED WITH (NOLOCK) ON ED.COD_EDITORA = I.COD_EDITORA
                    LEFT JOIN TABELA_GENERO G WITH (NOLOCK) ON G.COD_GENERO = I.COD_GENERO
                    LEFT JOIN ITENS_ESTPRECO_ATUAL PA WITH (NOLOCK) ON PA.COD_ITEM = I.COD_ITEM
                    LEFT JOIN VW_SALDO_ITENS S WITH (NOLOCK) ON S.cod_item = I.COD_ITEM AND S.cod_filial = {cod_filial}
                    WHERE I.COD_BARRA_ITEM IN ({placeholders})
                       OR I.COD_ISBN_ITEM IN ({placeholders})
                """
                rows = sql_client.query(sql_batch, tuple(chunk + chunk), max_rows=500)
                for r in (rows or []):
                    b1 = sanitize_isbn(r.get("cod_barra"))
                    b2 = sanitize_isbn(r.get("cod_isbn"))
                    item_info = {
                        "sku": str(r.get("cod_item") or b1 or b2),
                        "title": str(r.get("nome_item") or f"Item #{b1 or b2}"),
                        "publisher": str(r.get("editora") or "Editora"),
                        "subject": str(r.get("assunto") or "Geral"),
                        "coverPrice": float(r.get("preco") or 0.0),
                        "stockAvailable": max(0, int(float(r.get("estoque") or 0))),
                        "boxQty": max(1, int(r.get("qtd_caixa") or 12)),
                        "foundInCatalog": True,
                    }
                    if b1:
                        found_by_ean[b1] = item_info
                    if b2 and b2 not in found_by_ean:
                        found_by_ean[b2] = item_info
        except Exception as e:
            log.warning(f"[DBM Desk] Aviso na resolução em lote SQL do import-order: {e}")

    # 2. Complementa com base local PostgreSQL (prd_product) para os EANs ainda não resolvidos
    missing_eans = [e for e in ordered_eans if e not in found_by_ean]
    if missing_eans:
        try:
            q_loc = db.query(Product, Brand.name.label("brand_name"), Category.name.label("cat_name")).outerjoin(
                Brand, Brand.id == Product.brand_id
            ).outerjoin(
                Category, Category.id == Product.category_id
            ).filter(
                Product.company_id == seller_id,
                or_(
                    Product.ean_gtin.in_(missing_eans),
                    Product.sku.in_(missing_eans),
                )
            ).all()

            for p, b_name, c_name in q_loc:
                k_ean = sanitize_isbn(p.ean_gtin)
                k_sku = sanitize_isbn(p.sku)
                info = {
                    "sku": str(p.horus_cod_item or p.sku or p.id),
                    "title": p.name,
                    "publisher": b_name or p.brand or "Editora",
                    "subject": c_name or "Catálogo",
                    "coverPrice": float(p.promotional_price or p.base_price or 0.0),
                    "stockAvailable": max(0, int(p.stock_quantity or 0)),
                    "boxQty": int(p.units_per_box or 0),
                    "foundInCatalog": True,
                }
                if k_ean:
                    found_by_ean[k_ean] = info
                if k_sku and k_sku not in found_by_ean:
                    found_by_ean[k_sku] = info
        except Exception as e:
            log.warning(f"[DBM Desk] Aviso na resolução local prd_product do import-order: {e}")

    # 3. Monta a lista final na ordem exata do pedido importado
    items_out: list[dict] = []
    for idx, ean in enumerate(ordered_eans):
        req_qty = qty_by_ean.get(ean, 1)
        disc_val = disc_by_ean.get(ean) or base_disc
        cat_info = found_by_ean.get(ean)

        if cat_info:
            items_out.append({
                "id": f"imp-{ean}-{idx}",
                "isbn": ean,
                "sku": cat_info["sku"],
                "title": cat_info["title"],
                "publisher": cat_info["publisher"],
                "subject": cat_info["subject"],
                "coverPrice": cat_info["coverPrice"],
                "discountPct": disc_val,
                "requestedQty": req_qty,
                "consignedBalance": 0,
                "clientSalesPeriod": 0,
                "stockAvailable": cat_info["stockAvailable"],
                "boxQty": cat_info["boxQty"],
                "clientSales365d": 0,
                "generalSalesPeriod": 0,
                "sourceTab": "PEDIDO",
                "addedOrigin": "PEDIDO",
                "foundInCatalog": True,
            })
        else:
            # Inclui mesmo quando o ISBN não está no acervo para visibilidade total do operador
            items_out.append({
                "id": f"imp-nf-{ean}-{idx}",
                "isbn": ean,
                "sku": ean,
                "title": f"ISBN {ean} (Não localizado no acervo)",
                "publisher": "Não Cadastrado",
                "subject": f"Importado de {source_label}",
                "coverPrice": 0.0,
                "discountPct": disc_val,
                "requestedQty": req_qty,
                "consignedBalance": 0,
                "clientSalesPeriod": 0,
                "stockAvailable": 0,
                "boxQty": 1,
                "clientSales365d": 0,
                "generalSalesPeriod": 0,
                "sourceTab": "PEDIDO",
                "addedOrigin": "PEDIDO",
                "foundInCatalog": False,
            })

    _enrich_items_with_bi_metrics(
        db=db,
        seller_id=seller_id,
        customer=customer,
        cod_cli=cod_cli,
        items_list=items_out,
        client_sales_days=client_sales_days,
        general_sales_days=general_sales_days,
        sql_client=sql_client,
    )

    return {
        "totalParsed": len(items_out),
        "source": source_label,
        "items": items_out,
    }


class DbmEnrichItemsPayload(BaseModel):
    customer_id: Optional[int] = None
    company_id: Optional[int] = None
    client_sales_days: int = 30
    general_sales_days: int = 90
    items: List[dict] = []


@router.post("/proposals-desk/enrich-items")
def enrich_proposals_desk_items(
    payload: DbmEnrichItemsPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Enriquece em lote uma lista de itens (ex.: itens já importados na aba Pedidos)
    com Estoque Disponível, Saldo Consignado no Cliente (CONSIG), Vendas Cliente X dias (CLI(Xd)),
    Vendas 365 dias (365D) e Vendas Gerais (GER(Yd)).
    """
    seller_id = _resolve_seller_id(current_user, payload.company_id)
    customer = db.query(Customer).filter(
        Customer.id == payload.customer_id,
        Customer.company_id == seller_id
    ).first() if payload.customer_id else None

    sql_client = None
    try:
        sql_client = HorusSQLClient(db, seller_id)
    except Exception:
        sql_client = None

    cod_cli = _resolve_customer_horus_cod_cli(db, customer, sql_client) if customer else None
    cod_filial = int(sql_client.cod_filial) if (sql_client and str(sql_client.cod_filial).isdigit()) else 2

    items_copy = [dict(it) for it in (payload.items or []) if isinstance(it, dict)]
    if not items_copy:
        return {"items": []}

    # Se algum item estiver sem saldo de estoque, enriquece via VW_SALDO_ITENS
    if sql_client:
        try:
            keys_to_check = list({
                str(it.get("isbn") or it.get("sku") or "").strip().replace("-", "").replace(" ", "")
                for it in items_copy
                if (it.get("isbn") or it.get("sku"))
            })
            stock_map: dict[str, int] = {}
            for c_start in range(0, len(keys_to_check), 150):
                chunk = keys_to_check[c_start:c_start + 150]
                ph = ", ".join(["%s"] * len(chunk))
                sql_st = f"""
                    SELECT
                        RTRIM(LTRIM(ISNULL(I.COD_BARRA_ITEM, ''))) AS cod_barra,
                        RTRIM(LTRIM(ISNULL(I.COD_ISBN_ITEM, ''))) AS cod_isbn,
                        CAST(I.COD_ITEM AS VARCHAR) AS cod_item,
                        ISNULL(S.saldo_disponivel, 0) AS estoque
                    FROM ITENS_ESTOQUE_GERAL I WITH (NOLOCK)
                    LEFT JOIN VW_SALDO_ITENS S WITH (NOLOCK) ON S.cod_item = I.COD_ITEM AND S.cod_filial = {cod_filial}
                    WHERE I.COD_BARRA_ITEM IN ({ph})
                       OR I.COD_ISBN_ITEM IN ({ph})
                       OR CAST(I.COD_ITEM AS VARCHAR) IN ({ph})
                """
                s_rows = sql_client.query(sql_st, tuple(chunk + chunk + chunk), max_rows=400)
                for sr in (s_rows or []):
                    est_v = max(0, int(float(sr.get("estoque") or 0)))
                    for raw_k in (sr.get("cod_barra"), sr.get("cod_isbn"), sr.get("cod_item")):
                        k = str(raw_k or "").strip().replace("-", "").replace(" ", "")
                        if k:
                            stock_map[k] = max(stock_map.get(k, 0), est_v)
            for it in items_copy:
                k_isbn = str(it.get("isbn") or "").strip().replace("-", "").replace(" ", "")
                k_sku = str(it.get("sku") or "").strip().replace("-", "").replace(" ", "")
                st_val = stock_map.get(k_isbn, stock_map.get(k_sku))
                if st_val is not None:
                    it["stockAvailable"] = st_val
                    it["horusStock"] = st_val
        except Exception as e:
            log.warning(f"[DBM Desk] Aviso ao enriquecer estoque em enrich-items: {e}")

    # Reseta campos de métricas do cliente antes de recalcular para o cliente selecionado
    for it in items_copy:
        it["clientSalesPeriod"] = 0
        it["clientSalesX"] = 0
        it["clientSales365d"] = 0
        it["generalSales365"] = 0
        it["generalSalesPeriod"] = 0
        it["generalSalesX"] = 0
        it["consignedBalance"] = 0
        it["consignedQty"] = 0

    _enrich_items_with_bi_metrics(
        db=db,
        seller_id=seller_id,
        customer=customer,
        cod_cli=cod_cli,
        items_list=items_copy,
        client_sales_days=payload.client_sales_days,
        general_sales_days=payload.general_sales_days,
        sql_client=sql_client,
    )

    return {"items": items_copy}


# ── DBM Orçamentos & Propostas (Persistência Isolada DBM) ─────────────────────

class DbmProposalSavePayload(BaseModel):
    id: Optional[int] = None
    company_id: Optional[int] = None
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    customer_corporate_name: Optional[str] = None
    customer_document: Optional[str] = None
    customer_horus_cod_cli: Optional[int] = None
    subject: Optional[str] = None
    status_id: str = "st-2"
    status_name: str = "Aguardando Análise Comercial"
    status_phase: str = "EM_ANALISE"
    total_titles: int = 0
    total_requested_qty: int = 0
    total_approved_qty: int = 0
    total_cover_value: float = 0.0
    total_net_value: float = 0.0
    average_discount: float = 0.0
    global_discount: float = 0.0
    min_order_value: float = 0.0
    horus_order_number: Optional[str] = None
    notes: Optional[str] = None
    items: List[dict] = []
    desk_snapshot: Optional[dict] = None


class DbmProposalStatusPatchPayload(BaseModel):
    status_id: str
    status_name: str
    status_phase: str
    horus_order_number: Optional[str] = None


def _compute_proposal_totals_from_items(items_list: Any) -> dict:
    """
    Calcula os totais reais do orçamento (títulos, peças pedidas, peças aprovadas,
    valor de capa, valor líquido e desconto médio) a partir da lista de itens (items_json).
    """
    if not isinstance(items_list, list) or len(items_list) == 0:
        return {
            "total_titles": 0,
            "total_requested_qty": 0,
            "total_approved_qty": 0,
            "total_cover_value": 0.0,
            "total_net_value": 0.0,
            "average_discount": 0.0,
        }

    total_titles = len(items_list)
    total_req = 0
    total_app = 0
    total_cover = 0.0
    total_net = 0.0

    for it in items_list:
        if not isinstance(it, dict):
            continue
        req_q = max(0, int(float(it.get("requestedQty") or it.get("requested_qty") or it.get("quantity") or 0)))
        raw_app = it.get("approvedQty") if it.get("approvedQty") is not None else it.get("approved_qty")
        app_q = max(0, int(float(raw_app))) if raw_app is not None else req_q
        eff_q = app_q if app_q > 0 else req_q

        cover_p = max(0.0, float(it.get("coverPrice") or it.get("cover_price") or it.get("base_price") or 0.0))
        disc_pct = max(0.0, min(100.0, float(it.get("discountPercent") or it.get("discountPct") or it.get("discount_percent") or 0.0)))
        net_unit = cover_p * (1.0 - disc_pct / 100.0)

        total_req += req_q
        total_app += eff_q
        total_cover += cover_p * eff_q
        total_net += net_unit * eff_q

    avg_disc = ((total_cover - total_net) / total_cover * 100.0) if total_cover > 0 else 0.0
    return {
        "total_titles": total_titles,
        "total_requested_qty": total_req,
        "total_approved_qty": total_app,
        "total_cover_value": round(total_cover, 2),
        "total_net_value": round(total_net, 2),
        "average_discount": round(avg_disc, 2),
    }


@router.get("/proposals")
def list_dbm_proposals(
    company_id: Optional[int] = Query(None),
    customer_id: Optional[int] = Query(None),
    status_phase: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Lista orçamentos e propostas do módulo DBM com visão limpa, rápida e isolada por seller.
    """
    from app.models.dbm_proposal import DbmProposal

    seller_id = _resolve_seller_id(current_user, company_id)
    q = db.query(DbmProposal).filter(DbmProposal.company_id == seller_id)

    if customer_id:
        q = q.filter(DbmProposal.customer_id == customer_id)

    if status_phase and status_phase.strip() and status_phase.strip().upper() != "ALL":
        phases = [p.strip().upper() for p in status_phase.split(",") if p.strip()]
        if phases:
            q = q.filter(DbmProposal.status_phase.in_(phases))

    if search and search.strip():
        term = f"%{search.strip()}%"
        clean_num = re.sub(r"\D", "", search.strip())
        filters = [
            DbmProposal.customer_name.ilike(term),
            DbmProposal.customer_corporate_name.ilike(term),
            DbmProposal.customer_document.ilike(term),
            DbmProposal.subject.ilike(term),
            DbmProposal.status_name.ilike(term),
            DbmProposal.horus_order_number.ilike(term),
            DbmProposal.notes.ilike(term),
        ]
        if clean_num and clean_num.isdigit():
            num_val = int(clean_num)
            filters.append(DbmProposal.local_id == num_val)
            filters.append(DbmProposal.id == num_val)
            filters.append(DbmProposal.customer_horus_cod_cli == num_val)
        q = q.filter(or_(*filters))

    total = q.count()
    rows = q.order_by(DbmProposal.updated_at.desc(), DbmProposal.id.desc()).offset(skip).limit(limit).all()

    items_out = []
    for p in rows:
        calc = _compute_proposal_totals_from_items(p.items_json) if (not p.total_titles or not p.total_net_value) and p.items_json else None
        tot_titles = int(p.total_titles or (calc["total_titles"] if calc else 0))
        tot_req = int(p.total_requested_qty or (calc["total_requested_qty"] if calc else 0))
        tot_app = int(p.total_approved_qty or (calc["total_approved_qty"] if calc else 0))
        tot_cov = round(float(p.total_cover_value or (calc["total_cover_value"] if calc else 0.0)), 2)
        tot_net = round(float(p.total_net_value or (calc["total_net_value"] if calc else 0.0)), 2)
        avg_disc = round(float(p.average_discount or (calc["average_discount"] if calc else 0.0)), 2)

        items_out.append({
            "id": p.id,
            "local_id": p.local_id,
            "customer_id": p.customer_id,
            "customer_name": p.customer_name,
            "customer_corporate_name": p.customer_corporate_name or p.customer_name,
            "customer_document": p.customer_document or "",
            "customer_horus_cod_cli": p.customer_horus_cod_cli,
            "subject": getattr(p, "subject", None) or "",
            "status_id": p.status_id,
            "status_name": p.status_name,
            "status_phase": p.status_phase,
            "total_titles": tot_titles,
            "total_requested_qty": tot_req,
            "total_approved_qty": tot_app,
            "total_cover_value": tot_cov,
            "total_net_value": tot_net,
            "average_discount": avg_disc,
            "global_discount": round(float(p.global_discount or 0.0), 2),
            "min_order_value": round(float(p.min_order_value or 0.0), 2),
            "horus_order_number": p.horus_order_number,
            "notes": p.notes,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        })

    return {
        "items": items_out,
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/proposals/{proposal_id}")
def get_dbm_proposal(
    proposal_id: int,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retorna os dados completos de um orçamento/proposta do DBM (incluindo os itens da grade e o snapshot salvo).
    """
    from app.models.dbm_proposal import DbmProposal

    seller_id = _resolve_seller_id(current_user, company_id)
    prop = db.query(DbmProposal).filter(
        DbmProposal.id == proposal_id,
        DbmProposal.company_id == seller_id
    ).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Orçamento não encontrado.")

    saved_items = list(prop.items_json or [])
    saved_snapshot = getattr(prop, "desk_snapshot_json", None)

    # Sempre sincroniza CX (units_per_box) salvo no produto do Cronuz tanto em saved_items quanto no snapshot
    if saved_items:
        _apply_cronuz_units_per_box(db, seller_id, saved_items)
    if isinstance(saved_snapshot, dict) and isinstance(saved_snapshot.get("allItems"), list):
        _apply_cronuz_units_per_box(db, seller_id, saved_snapshot["allItems"])

    # Backfill único para propostas antigas que foram salvas sem consignado/cliXdias
    if saved_items and saved_snapshot is None:
        needs_one_time_enrich = all(
            int(it.get("consignedQty") or it.get("consignedBalance") or 0) == 0
            and int(it.get("clientSalesX") or it.get("clientSalesPeriod") or 0) == 0
            and int(it.get("generalSales365") or it.get("clientSales365d") or 0) == 0
            and int(it.get("generalSalesX") or it.get("generalSalesPeriod") or 0) == 0
            for it in saved_items
            if isinstance(it, dict)
        )
        if needs_one_time_enrich:
            try:
                cust_obj = db.query(Customer).filter(
                    Customer.id == prop.customer_id,
                    Customer.company_id == seller_id
                ).first() if prop.customer_id else None
                sql_client = None
                try:
                    sql_client = HorusSQLClient(db, seller_id)
                except Exception:
                    sql_client = None
                cod_cli = prop.customer_horus_cod_cli or (_resolve_customer_horus_cod_cli(db, cust_obj, sql_client) if cust_obj else None)
                saved_items = _enrich_items_with_bi_metrics(
                    db=db,
                    seller_id=seller_id,
                    customer=cust_obj,
                    cod_cli=cod_cli,
                    items_list=[dict(it) for it in saved_items if isinstance(it, dict)],
                    client_sales_days=30,
                    general_sales_days=90,
                    sql_client=sql_client,
                )
                prop.items_json = saved_items
                db.commit()
            except Exception as e:
                db.rollback()
                log.warning(f"[DBM] Aviso no backfill único de métricas do orçamento #{prop.id}: {e}")

    calc = _compute_proposal_totals_from_items(saved_items) if (not prop.total_titles or not prop.total_net_value) and saved_items else None

    return {
        "id": prop.id,
        "local_id": prop.local_id,
        "customer_id": prop.customer_id,
        "customer_name": prop.customer_name,
        "customer_corporate_name": prop.customer_corporate_name or prop.customer_name,
        "customer_document": prop.customer_document or "",
        "customer_horus_cod_cli": prop.customer_horus_cod_cli,
        "subject": getattr(prop, "subject", None) or "",
        "status_id": prop.status_id,
        "status_name": prop.status_name,
        "status_phase": prop.status_phase,
        "total_titles": int(prop.total_titles or (calc["total_titles"] if calc else 0)),
        "total_requested_qty": int(prop.total_requested_qty or (calc["total_requested_qty"] if calc else 0)),
        "total_approved_qty": int(prop.total_approved_qty or (calc["total_approved_qty"] if calc else 0)),
        "total_cover_value": round(float(prop.total_cover_value or (calc["total_cover_value"] if calc else 0.0)), 2),
        "total_net_value": round(float(prop.total_net_value or (calc["total_net_value"] if calc else 0.0)), 2),
        "average_discount": round(float(prop.average_discount or (calc["average_discount"] if calc else 0.0)), 2),
        "global_discount": round(float(prop.global_discount or 0.0), 2),
        "min_order_value": round(float(prop.min_order_value or 0.0), 2),
        "horus_order_number": prop.horus_order_number,
        "notes": prop.notes,
        "items": saved_items,
        "desk_snapshot": saved_snapshot,
        "created_at": prop.created_at.isoformat() if prop.created_at else None,
        "updated_at": prop.updated_at.isoformat() if prop.updated_at else None,
    }


@router.post("/proposals")
def save_dbm_proposal(
    payload: DbmProposalSavePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Salva ou atualiza um orçamento/proposta da Mesa DBM (incluindo o snapshot completo no Cronuz).
    """
    from app.models.dbm_proposal import DbmProposal

    seller_id = _resolve_seller_id(current_user, payload.company_id)

    cust = None
    if payload.customer_id:
        cust = db.query(Customer).filter(
            Customer.id == payload.customer_id,
            Customer.company_id == seller_id
        ).first()

    cust_name = (payload.customer_name or (cust.name if cust else "") or "Cliente").strip()
    cust_corp = (payload.customer_corporate_name or (cust.corporate_name if cust else "") or cust_name).strip()
    cust_doc = (payload.customer_document or (cust.document if cust else "") or "").strip()
    cust_cod_cli = payload.customer_horus_cod_cli or (cust.horus_cod_cli if cust else None)
    if isinstance(cust_cod_cli, str):
        cust_cod_cli = int(cust_cod_cli) if cust_cod_cli.isdigit() else None

    clean_subject = (payload.subject or "").strip() or None

    existing = None
    if payload.id and payload.id > 0:
        existing = db.query(DbmProposal).filter(
            DbmProposal.id == payload.id,
            DbmProposal.company_id == seller_id
        ).first()

    user_id = getattr(current_user, "id", None) if not isinstance(current_user, dict) else current_user.get("id")
    calc = _compute_proposal_totals_from_items(payload.items)
    eff_titles = int(payload.total_titles or calc["total_titles"])
    eff_req_qty = int(payload.total_requested_qty or calc["total_requested_qty"])
    eff_app_qty = int(payload.total_approved_qty or calc["total_approved_qty"])
    eff_cover_val = round(float(payload.total_cover_value or calc["total_cover_value"]), 2)
    eff_net_val = round(float(payload.total_net_value or calc["total_net_value"]), 2)
    eff_avg_disc = round(float(payload.average_discount or calc["average_discount"]), 2)

    if existing:
        existing.customer_id = cust.id if cust else payload.customer_id
        existing.customer_name = cust_name
        existing.customer_corporate_name = cust_corp
        existing.customer_document = cust_doc
        existing.customer_horus_cod_cli = cust_cod_cli
        if payload.subject is not None:
            existing.subject = clean_subject
        existing.status_id = payload.status_id
        existing.status_name = payload.status_name
        existing.status_phase = payload.status_phase
        existing.total_titles = eff_titles
        existing.total_requested_qty = eff_req_qty
        existing.total_approved_qty = eff_app_qty
        existing.total_cover_value = eff_cover_val
        existing.total_net_value = eff_net_val
        existing.average_discount = eff_avg_disc
        existing.global_discount = round(float(payload.global_discount or 0.0), 2)
        existing.min_order_value = round(float(payload.min_order_value or (cust.min_order_total if cust else 0.0) or 0.0), 2)
        if payload.horus_order_number is not None:
            existing.horus_order_number = payload.horus_order_number
        if payload.notes is not None:
            existing.notes = payload.notes
        existing.items_json = payload.items or []
        if payload.desk_snapshot is not None:
            existing.desk_snapshot_json = payload.desk_snapshot
        existing.updated_at = datetime.now(timezone.utc)
        target = existing
        action = "updated"
    else:
        max_local = db.query(func.max(DbmProposal.local_id)).filter(
            DbmProposal.company_id == seller_id
        ).scalar() or 0
        next_local_id = int(max_local) + 1

        new_prop = DbmProposal(
            company_id=seller_id,
            local_id=next_local_id,
            customer_id=cust.id if cust else payload.customer_id,
            customer_name=cust_name,
            customer_corporate_name=cust_corp,
            customer_document=cust_doc,
            customer_horus_cod_cli=cust_cod_cli,
            subject=clean_subject,
            status_id=payload.status_id,
            status_name=payload.status_name,
            status_phase=payload.status_phase,
            total_titles=eff_titles,
            total_requested_qty=eff_req_qty,
            total_approved_qty=eff_app_qty,
            total_cover_value=eff_cover_val,
            total_net_value=eff_net_val,
            average_discount=eff_avg_disc,
            global_discount=round(float(payload.global_discount or 0.0), 2),
            min_order_value=round(float(payload.min_order_value or (cust.min_order_total if cust else 0.0) or 0.0), 2),
            horus_order_number=payload.horus_order_number,
            notes=payload.notes,
            items_json=payload.items or [],
            desk_snapshot_json=payload.desk_snapshot,
            created_by_user_id=user_id,
        )
        db.add(new_prop)
        db.flush()
        target = new_prop
        action = "created"

    db.commit()
    db.refresh(target)

    return {
        "success": True,
        "action": action,
        "proposal": {
            "id": target.id,
            "local_id": target.local_id,
            "customer_id": target.customer_id,
            "customer_name": target.customer_name,
            "subject": getattr(target, "subject", None) or "",
            "status_id": target.status_id,
            "status_name": target.status_name,
            "status_phase": target.status_phase,
            "total_titles": target.total_titles,
            "total_approved_qty": target.total_approved_qty,
            "total_net_value": target.total_net_value,
            "created_at": target.created_at.isoformat() if target.created_at else None,
            "updated_at": target.updated_at.isoformat() if target.updated_at else None,
        }
    }


@router.patch("/proposals/{proposal_id}/status")
def update_dbm_proposal_status(
    proposal_id: int,
    payload: DbmProposalStatusPatchPayload,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.dbm_proposal import DbmProposal

    seller_id = _resolve_seller_id(current_user, company_id)
    prop = db.query(DbmProposal).filter(
        DbmProposal.id == proposal_id,
        DbmProposal.company_id == seller_id
    ).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Orçamento não encontrado.")

    prop.status_id = payload.status_id
    prop.status_name = payload.status_name
    prop.status_phase = payload.status_phase
    if payload.horus_order_number is not None:
        prop.horus_order_number = payload.horus_order_number
    prop.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"success": True, "id": prop.id, "status_name": prop.status_name, "status_phase": prop.status_phase}


@router.delete("/proposals/{proposal_id}")
def delete_dbm_proposal(
    proposal_id: int,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.dbm_proposal import DbmProposal

    seller_id = _resolve_seller_id(current_user, company_id)
    prop = db.query(DbmProposal).filter(
        DbmProposal.id == proposal_id,
        DbmProposal.company_id == seller_id
    ).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Orçamento não encontrado.")

    db.delete(prop)
    db.commit()
    return {"success": True, "deleted_id": proposal_id}


# ── Enriquecimento Automático de Produto DBM (Horus SQL + API + Capas) ────────

class DbmProductEnrichPayload(BaseModel):
    company_id: Optional[int] = None
    force_overwrite_dimensions: bool = False


@router.post("/products/{product_id}/enrich-from-horus")
async def enrich_dbm_product_from_horus(
    product_id: int,
    payload: Optional[DbmProductEnrichPayload] = None,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Ao selecionar/abrir um item na Ficha de Cadastro do DBM (/dbm/products):
    1. Carrega URLs padrão e secundária de capas das configurações do seller.
    2. Consulta Horus SQL (ITENS_ESTOQUE_GERAL, VW_SALDO_ITENS, VW_ITENS_CONSIGNACAO, NF_ITENS/NF_MESTRE)
       e API REST Horus (Busca_Acervo) para buscar saldo disponível, saldo consignado total, giro 90d/365d,
       peso, largura, altura, páginas, unidades/caixa, sinopse, autor, editora, assunto e preço de capa.
    3. Preenche os campos faltantes (peso, dimensões, capa, sinopse, unid/caixa, etc.) e atualiza os
       indicadores do Horus (saldo disponível, consignado, giro) salvando imediatamente em prd_product.
    """
    from app.models.product import Product
    from app.models.company import Company
    from app.schemas.product import ProductResponse
    from app.integrators.horus_products import HorusProducts, parse_horus_price
    from app.api.upload import STATIC_DIR

    eff_company_id = (payload.company_id if payload and payload.company_id else None) or company_id
    seller_id = _resolve_seller_id(current_user, eff_company_id)

    product = db.query(Product).filter(
        Product.id == product_id,
        Product.company_id == seller_id
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado no cadastro DBM.")

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == seller_id).first()
    company = db.query(Company).filter(Company.id == seller_id).first()

    cover_primary_base = (settings.cover_image_base_url or "").strip().rstrip("/") if settings else ""
    cover_secondary_base = (settings.cover_image_secondary_base_url or "").strip().rstrip("/") if settings else ""

    isbn_clean = re.sub(r"[^0-9Xx]", "", str(product.ean_gtin or product.barcode or "").strip())
    cod_horus = product.horus_cod_item
    if not cod_horus and str(product.sku or "").strip().isdigit() and len(str(product.sku).strip()) < 10:
        cod_horus = int(str(product.sku).strip())

    fields_updated: list[str] = []

    # 1. Consulta Horus SQL Server (Saldo Disponível, Saldo Consignado Total da Obra, Giro 90d/365d e Metadados)
    sql_client = None
    try:
        sql_client = HorusSQLClient(db, seller_id)
    except Exception:
        sql_client = None

    if sql_client and (cod_horus or isbn_clean):
        cod_empresa, cod_filial = _resolve_horus_empresa_filial(settings, sql_client)
        try:
            # Descobre colunas extras existentes em ITENS_ESTOQUE_GERAL (peso, largura, altura, paginas, etc.)
            cols_info = sql_client.query(
                "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ITENS_ESTOQUE_GERAL'",
                max_rows=200
            )
            avail_cols = {str(c.get("COLUMN_NAME") or "").upper() for c in (cols_info or [])}

            def _pick_col(candidates: list[str], default_sql: str = "NULL") -> str:
                present = [f"I.{c}" for c in candidates if c in avail_cols]
                if not present:
                    return default_sql
                return f"COALESCE({', '.join(present)})" if len(present) > 1 else present[0]

            peso_expr = _pick_col(["PESO_ITEM", "PESO_BRUTO", "PESO_LIQ", "PESO", "VLR_PESO"], "0")
            larg_expr = _pick_col(["LARGURA_ITEM", "LARGURA", "VLR_LARGURA"], "0")
            alt_expr = _pick_col(["ALTURA_ITEM", "ALTURA", "VLR_ALTURA"], "0")
            comp_expr = _pick_col(["COMPRIMENTO_ITEM", "COMPRIMENTO", "ESPESSURA", "PROFUNDIDADE"], "0")
            pag_expr = _pick_col(["QTD_PAGINAS", "NRO_PAGINAS", "PAGINAS"], "0")
            ed_num_expr = _pick_col(["NRO_EDICAO", "EDICAO"], "NULL")
            autor_expr = _pick_col(["NOM_AUTOR", "AUTOR"], "NULL")
            launch_expr = _pick_col(["DAT_LANCAMENTO", "DAT_EXP_LANCTO", "DAT_EDICAO", "DAT_CADASTRO", "DAT_VAL_ESTGRUPO"], "NULL")

            where_parts = []
            sql_params = []
            if cod_horus:
                where_parts.append("I.COD_ITEM = %s")
                sql_params.append(int(cod_horus))
            if isbn_clean:
                where_parts.append("I.COD_BARRA_ITEM = %s")
                where_parts.append("I.COD_ISBN_ITEM = %s")
                sql_params.extend([isbn_clean, isbn_clean])

            where_clause = " OR ".join(where_parts)
            sql_item = f"""
                SELECT TOP 1
                    I.COD_ITEM AS cod_item,
                    RTRIM(LTRIM(ISNULL(I.COD_BARRA_ITEM, ISNULL(I.COD_ISBN_ITEM, '')))) AS isbn,
                    RTRIM(LTRIM(ISNULL(I.NOM_ITEM, ''))) AS nome_item,
                    RTRIM(LTRIM(ISNULL(ED.NOM_FANTASIA, ISNULL(ED.NOM_EDITORA, '')))) AS editora,
                    I.COD_EDITORA AS cod_editora,
                    RTRIM(LTRIM(ISNULL(G.NOM_GENERO, ''))) AS assunto,
                    ISNULL(PA.VLR_CAPA, ISNULL(I.VLR_CAPA, 0.0)) AS preco_capa,
                    ISNULL(S.saldo_disponivel, 0) AS saldo_disponivel,
                    ISNULL(I.QTD_ITENS_CAIXA, 0) AS qtd_caixa,
                    ISNULL(I.DESC_SINOPSE, '') AS sinopse,
                    {peso_expr} AS peso_val,
                    {larg_expr} AS largura_val,
                    {alt_expr} AS altura_val,
                    {comp_expr} AS comp_val,
                    {pag_expr} AS paginas_val,
                    {ed_num_expr} AS edicao_val,
                    {autor_expr} AS autor_val,
                    {launch_expr} AS data_lancamento
                FROM ITENS_ESTOQUE_GERAL I WITH (NOLOCK)
                LEFT JOIN EDITORA ED WITH (NOLOCK) ON ED.COD_EDITORA = I.COD_EDITORA
                LEFT JOIN TABELA_GENERO G WITH (NOLOCK) ON G.COD_GENERO = I.COD_GENERO
                LEFT JOIN (
                    SELECT COD_ITEM, MAX(VLR_CAPA) AS VLR_CAPA
                    FROM ITENS_ESTPRECO_ATUAL WITH (NOLOCK)
                    GROUP BY COD_ITEM
                ) PA ON PA.COD_ITEM = I.COD_ITEM
                LEFT JOIN (
                    SELECT cod_item, SUM(ISNULL(saldo_disponivel, 0)) AS saldo_disponivel
                    FROM VW_SALDO_ITENS WITH (NOLOCK)
                    WHERE cod_empresa = {cod_empresa} AND cod_filial = {cod_filial}
                    GROUP BY cod_item
                ) S ON S.cod_item = I.COD_ITEM
                WHERE {where_clause}
                ORDER BY CASE WHEN I.COD_ITEM = %s THEN 0 ELSE 1 END, I.COD_ITEM ASC
            """
            sql_params.append(int(cod_horus) if cod_horus else -1)
            rows_it = sql_client.query(sql_item, tuple(sql_params), max_rows=1)

            if rows_it and len(rows_it) > 0:
                r = rows_it[0]
                found_cod = int(r["cod_item"]) if str(r.get("cod_item") or "").isdigit() else cod_horus
                if found_cod and not product.horus_cod_item:
                    product.horus_cod_item = found_cod
                    cod_horus = found_cod
                    fields_updated.append("horus_cod_item")
                if found_cod and not product.cod_dbm:
                    product.cod_dbm = str(found_cod)
                    fields_updated.append("cod_dbm")

                found_isbn = str(r.get("isbn") or "").strip()
                if found_isbn and not product.ean_gtin:
                    product.ean_gtin = found_isbn
                    isbn_clean = re.sub(r"[^0-9Xx]", "", found_isbn)
                    fields_updated.append("ean_gtin")
                if found_isbn and not product.barcode:
                    product.barcode = found_isbn
                    fields_updated.append("barcode")

                # Saldo disponível sempre atualizado do Horus
                new_stock = max(0, int(float(r.get("saldo_disponivel") or 0)))
                if product.stock_quantity != new_stock:
                    product.stock_quantity = new_stock
                    fields_updated.append("stock_quantity")

                # Preço de capa se zerado
                preco_h = float(r.get("preco_capa") or 0.0)
                if preco_h > 0 and (not product.base_price or product.base_price <= 0):
                    product.base_price = round(preco_h, 2)
                    fields_updated.append("base_price")

                # Editora, código editora, assunto, sinopse, autor, unid/caixa, páginas, edição
                if r.get("editora") and not product.brand:
                    product.brand = str(r["editora"]).strip()[:100]
                    fields_updated.append("brand")
                if r.get("cod_editora") and not product.publisher_code:
                    product.publisher_code = str(r["cod_editora"]).strip()[:100]
                    fields_updated.append("publisher_code")
                if r.get("assunto") and not product.subject:
                    product.subject = str(r["assunto"]).strip()[:150]
                    fields_updated.append("subject")
                if r.get("sinopse") and not product.long_description:
                    product.long_description = str(r["sinopse"]).strip()
                    fields_updated.append("long_description")
                if r.get("autor_val") and not product.short_description:
                    product.short_description = str(r["autor_val"]).strip()[:400]
                    fields_updated.append("short_description")

                qtd_cx = int(float(r.get("qtd_caixa") or 0))
                if qtd_cx > 0 and (not product.units_per_box or product.units_per_box <= 0):
                    product.units_per_box = qtd_cx
                    fields_updated.append("units_per_box")

                pags = int(float(r.get("paginas_val") or 0))
                if pags > 0 and (not product.pages or product.pages <= 0):
                    product.pages = pags
                    fields_updated.append("pages")

                if r.get("edicao_val") and (not product.edition_number or product.edition_number == "0"):
                    product.edition_number = str(r["edicao_val"]).strip()[:50]
                    fields_updated.append("edition_number")

                # Peso e dimensões se faltantes
                peso_raw = float(r.get("peso_val") or 0.0)
                if peso_raw > 0 and (not product.weight_kg or product.weight_kg <= 0):
                    product.weight_kg = round(peso_raw / 1000.0, 3) if peso_raw > 15 else round(peso_raw, 3)
                    fields_updated.append("weight_kg")

                larg_raw = float(r.get("largura_val") or 0.0)
                if larg_raw > 0 and (not product.width_cm or product.width_cm <= 0):
                    product.width_cm = round(larg_raw, 2)
                    fields_updated.append("width_cm")

                alt_raw = float(r.get("altura_val") or 0.0)
                if alt_raw > 0 and (not product.height_cm or product.height_cm <= 0):
                    product.height_cm = round(alt_raw, 2)
                    fields_updated.append("height_cm")

                comp_raw = float(r.get("comp_val") or 0.0)
                if comp_raw > 0 and (not product.length_cm or product.length_cm <= 0):
                    product.length_cm = round(comp_raw, 2)
                    fields_updated.append("length_cm")

                # Data de lançamento se faltante
                if r.get("data_lancamento") and not product.launch_date:
                    l_dt = _parse_any_datetime(r["data_lancamento"])
                    if l_dt:
                        product.launch_date = l_dt
                        if not product.launch_month:
                            product.launch_month = l_dt.month
                        if not product.launch_year:
                            product.launch_year = l_dt.year
                        fields_updated.append("launch_date")

            # Consulta Saldo Consignado Total da Obra (VW_ITENS_CONSIGNACAO) e Giro 90d / 365d na filial configurada
            if cod_horus:
                try:
                    c_rows = sql_client.query(
                        f"""
                        SELECT ISNULL(SUM(SALDO), 0) AS total_consignado
                        FROM VW_ITENS_CONSIGNACAO WITH (NOLOCK)
                        WHERE COD_ITEM = %s
                          AND COD_EMPRESA = {cod_empresa}
                          AND COD_FILIAL = {cod_filial}
                          AND ISNULL(SALDO, 0) > 0
                        """,
                        (int(cod_horus),),
                        max_rows=1
                    )
                    if c_rows and len(c_rows) > 0:
                        total_consig = max(0, int(float(c_rows[0].get("total_consignado") or 0)))
                        if product.consignment_stock != total_consig:
                            product.consignment_stock = total_consig
                            fields_updated.append("consignment_stock")
                except Exception as ce:
                    log.debug(f"[DBM Enrich] Aviso VW_ITENS_CONSIGNACAO item #{cod_horus}: {ce}")

                try:
                    cfop_sales_in = ", ".join(f"'{c}'" for c in (list(CFOP_VENDA_LIST) + list(CFOP_ACERTO_LIST)))
                    clean_cfop_expr = "REPLACE(REPLACE(REPLACE(RTRIM(LTRIM(ISNULL(NFI.COD_NATUREZA, NF.COD_NATUREZA))), '.', ''), ',', ''), ' ', '')"
                    g_rows = sql_client.query(
                        f"""
                        SELECT
                            ISNULL(SUM(CASE WHEN NF.DAT_EMISSAO_NF >= DATEADD(day, -90, GETDATE()) THEN ISNULL(NFI.QTD_ITENS, 0) ELSE 0 END), 0) AS vds_90,
                            ISNULL(SUM(CASE WHEN NF.DAT_EMISSAO_NF >= DATEADD(day, -365, GETDATE()) THEN ISNULL(NFI.QTD_ITENS, 0) ELSE 0 END), 0) AS vds_365
                        FROM NF_ITENS NFI WITH (NOLOCK)
                        INNER JOIN NF_MESTRE NF WITH (NOLOCK)
                            ON NF.COD_NF = NFI.COD_NF
                            AND NF.COD_FILIAL = NFI.COD_FILIAL
                            AND NF.COD_EMPRESA = NFI.COD_EMPRESA
                        WHERE NFI.COD_ITEM = %s
                          AND NF.COD_EMPRESA = {cod_empresa}
                          AND NF.COD_FILIAL = {cod_filial}
                          AND ISNULL(NF.SIT_NF, '') NOT IN ('C', 'CAN')
                          AND NF.DAT_EMISSAO_NF >= DATEADD(day, -370, GETDATE())
                          AND {clean_cfop_expr} IN ({cfop_sales_in})
                        """,
                        (int(cod_horus),),
                        max_rows=1
                    )
                    if g_rows and len(g_rows) > 0:
                        v90 = max(0, int(float(g_rows[0].get("vds_90") or 0)))
                        v365 = max(0, int(float(g_rows[0].get("vds_365") or 0)))
                        if v90 > 0 or not product.sales_90:
                            product.sales_90 = v90
                        if v365 > 0 or not product.sales_365:
                            product.sales_365 = v365
                except Exception as ge:
                    log.debug(f"[DBM Enrich] Aviso giro NF_ITENS item #{cod_horus}: {ge}")
        except Exception as se:
            log.warning(f"[DBM Enrich] Aviso ao enriquecer produto #{product.id} via Horus SQL: {se}")

    # 2. Se ainda faltar peso ou dimensões (Largura / Altura), consulta também a API Horus REST (Busca_Acervo)
    needs_rest_dimensions = (
        not product.weight_kg or product.weight_kg <= 0
        or not product.width_cm or product.width_cm <= 0
        or not product.height_cm or product.height_cm <= 0
        or not product.pages or product.pages <= 0
        or not product.long_description
    )
    if needs_rest_dimensions and company and settings and getattr(settings, "horus_enabled", False):
        search_term = isbn_clean or (str(cod_horus) if cod_horus else "")
        search_opt = "BARRAS_ISBN" if (isbn_clean and len(isbn_clean) >= 10) else "COD_ITEM"
        if search_term:
            horus_client = None
            try:
                horus_client = HorusProducts(db, seller_id)
                h_res = await horus_client.busca_acervo_padrao(
                    id_doc=company.document or "",
                    term=search_term,
                    search_option=search_opt,
                    offset=0,
                    limit=5
                )
                if isinstance(h_res, list) and len(h_res) > 0 and not ("Falha" in h_res[0] or "FALHA" in h_res[0]):
                    matched = h_res[0]
                    for cand in h_res:
                        c_cod = str(cand.get("COD_ITEM") or "").strip()
                        c_isbn = re.sub(r"[^0-9Xx]", "", str(cand.get("BARRAS_ISBN") or cand.get("COD_BARRA_ITEM") or ""))
                        if (cod_horus and c_cod == str(cod_horus)) or (isbn_clean and c_isbn == isbn_clean):
                            matched = cand
                            break

                    raw_peso = parse_horus_price(
                        str(matched.get("PESO") or matched.get("PESO_ITEM") or matched.get("PESO_BRUTO") or matched.get("PESO_LIQ") or "0")
                    )
                    if raw_peso > 0 and (not product.weight_kg or product.weight_kg <= 0):
                        product.weight_kg = round(raw_peso / 1000.0, 3) if raw_peso > 15 else round(raw_peso, 3)
                        fields_updated.append("weight_kg")

                    w_cm = parse_horus_price(str(matched.get("LARGURA") or matched.get("LARGURA_ITEM") or matched.get("VLR_LARGURA") or "0"))
                    if w_cm > 0 and (not product.width_cm or product.width_cm <= 0):
                        product.width_cm = round(w_cm, 2)
                        fields_updated.append("width_cm")

                    h_cm = parse_horus_price(str(matched.get("ALTURA") or matched.get("ALTURA_ITEM") or matched.get("VLR_ALTURA") or "0"))
                    if h_cm > 0 and (not product.height_cm or product.height_cm <= 0):
                        product.height_cm = round(h_cm, 2)
                        fields_updated.append("height_cm")

                    l_cm = parse_horus_price(str(matched.get("COMPRIMENTO") or matched.get("COMPRIMENTO_ITEM") or matched.get("ESPESSURA") or "0"))
                    if l_cm > 0 and (not product.length_cm or product.length_cm <= 0):
                        product.length_cm = round(l_cm, 2)
                        fields_updated.append("length_cm")

                    pags_api = int(parse_horus_price(str(matched.get("QTD_PAGINAS") or matched.get("PAGINAS") or "0")))
                    if pags_api > 0 and (not product.pages or product.pages <= 0):
                        product.pages = pags_api
                        fields_updated.append("pages")

                    syn_api = str(matched.get("DESC_SINOPSE") or matched.get("SINOPSE") or matched.get("INFO_COMP_ITEM") or "").strip()
                    if syn_api and not product.long_description:
                        product.long_description = syn_api
                        fields_updated.append("long_description")

                    aut_api = str(matched.get("NOM_AUTOR") or matched.get("AUTOR") or "").strip()
                    if aut_api and not product.short_description:
                        product.short_description = aut_api[:400]
                        fields_updated.append("short_description")
            except Exception as ae:
                log.debug(f"[DBM Enrich] Aviso Busca_Acervo produto #{product.id}: {ae}")
            finally:
                if horus_client:
                    try:
                        await horus_client.close()
                    except Exception:
                        pass

    # 3. Resolução da URL de Capa (mesma cascata do Storefront B2C)
    cover_candidates: list[str] = []
    if product.cover_url and product.cover_url.strip():
        cover_candidates.append(product.cover_url.strip())

    if isbn_clean:
        company_cover_dir = STATIC_DIR / str(seller_id)
        if (company_cover_dir / f"{isbn_clean}.jpg").exists():
            local_cov = f"/uploads/covers/{seller_id}/{isbn_clean}.jpg"
            if local_cov not in cover_candidates:
                cover_candidates.append(local_cov)
        elif (company_cover_dir / f"{isbn_clean}.png").exists():
            local_cov = f"/uploads/covers/{seller_id}/{isbn_clean}.png"
            if local_cov not in cover_candidates:
                cover_candidates.append(local_cov)

        if cover_primary_base:
            prim_url = f"{cover_primary_base}/{isbn_clean}.jpg"
            if prim_url not in cover_candidates:
                cover_candidates.append(prim_url)
        if cover_secondary_base:
            sec_url = f"{cover_secondary_base}/{isbn_clean}.jpg"
            if sec_url not in cover_candidates:
                cover_candidates.append(sec_url)

        local_fallback = f"/uploads/covers/{seller_id}/{isbn_clean}.jpg"
        if local_fallback not in cover_candidates:
            cover_candidates.append(local_fallback)

    if not product.cover_url and cover_candidates:
        product.cover_url = cover_candidates[0]
        fields_updated.append("cover_url")

    # 4. Cálculo automático de vencimento de contrato se tiver assinatura + anos e faltar vencimento
    if product.contract_signed_date and product.contract_validity_years and not product.contract_expires_date:
        exp_calc = _calculate_contract_expiration_str(product.contract_signed_date, product.contract_validity_years)
        if exp_calc:
            product.contract_expires_date = exp_calc
            fields_updated.append("contract_expires_date")

    if fields_updated:
        db.commit()
        db.refresh(product)

    prod_dict = ProductResponse.from_orm(product).dict()
    prod_dict["price"] = product.promotional_price if product.promotional_price else product.base_price
    prod_dict["stock"] = product.stock_quantity
    prod_dict["total_stock_with_consigned"] = int(product.stock_quantity or 0) + int(product.consignment_stock or 0)

    return {
        "success": True,
        "updated": len(fields_updated) > 0,
        "fields_updated": fields_updated,
        "cover_image_base_url": cover_primary_base or None,
        "cover_image_secondary_base_url": cover_secondary_base or None,
        "cover_candidates": cover_candidates,
        "product": prod_dict,
    }


def _calculate_contract_expiration_str(signed_str: Optional[str], validity_years: Optional[int]) -> Optional[str]:
    if not signed_str or not validity_years:
        return None
    try:
        years = int(validity_years)
        if years <= 0:
            return None
        s = str(signed_str).strip()
        if "/" in s:
            parts = s.split("/")
            if len(parts) == 3:
                day, month, yr = int(parts[0]), int(parts[1]), int(parts[2])
                if yr < 100:
                    yr += 2000
                return f"{day:02d}/{month:02d}/{yr + years:04d}"
        elif "-" in s:
            parts = s[:10].split("-")
            if len(parts) == 3:
                yr, month, day = int(parts[0]), int(parts[1]), int(parts[2])
                return f"{day:02d}/{month:02d}/{yr + years:04d}"
    except Exception:
        pass
    return None


# ── Importação de Planilha Excel de 2 Abas (Itens + Tiragens) no Cadastro DBM ──

MAX_DBM_PRODUCTS_EXCEL_BYTES = 10 * 1024 * 1024  # 10 MB (Regra Mandatória #1 AGENTS.md)


def _format_cell_date_br(val: Any) -> str:
    if val is None or val == "":
        return ""
    if isinstance(val, datetime):
        return val.strftime("%d/%m/%Y")
    if hasattr(val, "strftime"):
        try:
            return val.strftime("%d/%m/%Y")
        except Exception:
            pass
    s = str(val).strip()
    if not s:
        return ""
    if "/" in s and len(s) >= 8:
        return s[:10]
    if "-" in s and len(s) >= 10:
        parts = s[:10].split("-")
        if len(parts) == 3 and len(parts[0]) == 4:
            return f"{parts[2]}/{parts[1]}/{parts[0]}"
    return s[:30]


def _parse_cell_datetime(val: Any) -> Optional[datetime]:
    if val is None or val == "":
        return None
    if isinstance(val, datetime):
        return val
    if hasattr(val, "year") and hasattr(val, "month") and hasattr(val, "day"):
        return datetime(val.year, val.month, val.day, 12, 0, 0)
    s = str(val).strip()
    if not s:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            clean_s = s[:19] if ":" in fmt else s[:10]
            return datetime.strptime(clean_s, fmt)
        except Exception:
            continue
    return None


def _fmt_pct_br(val: Any) -> str:
    try:
        num = float(str(val or 0).replace(",", "."))
        if 0 < abs(num) <= 1.0:
            num = num * 100.0
        return f"{num:,.2f}%".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception:
        return "0,00%"


def _fmt_brl(val: Any) -> str:
    try:
        num = float(str(val or 0).replace(",", "."))
        return f"R$ {num:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception:
        return "R$ 0,00"


def _normalize_binding_finish(raw_val: Any, title_str: str = "") -> str:
    s = str(raw_val or "").strip().lower()
    t_up = (title_str or "").upper()
    if "e-book" in s or "ebook" in s or "[E-BOOK]" in t_up or "[EBOOK]" in t_up:
        return "E-book"
    if "capa" in s and "dura" in s:
        return "Capa Dura"
    if "cartonad" in s:
        return "Cartonado"
    if "espiral" in s or "wire" in s:
        return "Espiral / Wire-o"
    if "gramp" in s or "canoa" in s:
        return "Grampeado"
    if "flex" in s:
        return "Flexível"
    if "box" in s or "kit" in s:
        return "Box / Kit"
    return "Brochura"


@router.post("/products/import-excel-lancamentos")
async def import_dbm_products_excel_lancamentos(
    file: UploadFile = File(...),
    company_id: Optional[int] = Form(None),
    create_missing: bool = Form(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Importa planilha Excel de 2 abas (ex: 'data de lançamento.xlsx' com 'Planilha1' + 'TIRAGENS'):
    - Valida limite rígido de 10 MB (Regra 1 do AGENTS.md).
    - Lê a aba de Tiragens ('TIRAGENS' ou 2ª aba), agrupando todas as tiragens pelo 'cod_prod'
      (inclusive quando houver 2, 3 ou mais tiragens para o mesmo livro) e ordenando cronologicamente.
    - Lê a aba de Produtos ('Planilha1' ou 1ª aba), cruzando com prd_product pelo ISBN ('ean_gtin'/'barcode')
      ou pelo 'CodProdHorus' ('horus_cod_item'/'sku').
    - Atualiza todos os campos existentes na Ficha de Cadastro do DBM:
      Data de Lançamento, Mês/Ano, Páginas, Preço de Capa, Edição, Sinopse, Subtítulo/Autor, Coleção,
      Assunto, Largura (cm), Altura (cm), Peso (gramas -> kg), Acabamento, Link da Obra (LinkGGbrasil),
      Unidades/Caixa (UniCaixas), Giro 90d (Vds90dias), Saldo Consignado (Consignado), Esgotado/Data Esgotado,
      Regra de Royalties, Empresa Royalties, Data de Assinatura (Data_Contrato), Anos de Validade (Anos_Validade),
      Vencimento calculado automaticamente, % Royalties E-book (perc_royalties_ebook) e a grade completa de Tiragens!
    """
    import json
    from app.models.product import Product

    seller_id = _resolve_seller_id(current_user, company_id)

    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="Nenhum arquivo Excel foi enviado.")

    fname = file.filename.strip()
    if not fname.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(
            status_code=400,
            detail="Formato inválido. Envie uma planilha Excel no formato .XLSX."
        )

    content = await file.read()
    if len(content) > MAX_DBM_PRODUCTS_EXCEL_BYTES:
        raise HTTPException(
            status_code=413,
            detail="O arquivo excede o limite máximo permitido de 10 MB para este tipo de envio."
        )

    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Não foi possível abrir a planilha Excel: {str(e)}")

    sheet_names = wb.sheetnames
    if not sheet_names:
        raise HTTPException(status_code=400, detail="A planilha enviada não possui abas válidas.")

    # Identifica aba de Itens (Planilha1 ou primeira aba) e aba de Tiragens (TIRAGENS ou segunda aba)
    items_ws = None
    tiragens_ws = None
    for sname in sheet_names:
        up = sname.strip().upper()
        if "TIRAGEN" in up or "TIRAGEM" in up:
            tiragens_ws = wb[sname]
        elif items_ws is None:
            items_ws = wb[sname]

    if items_ws is None:
        items_ws = wb[sheet_names[0]]
    if tiragens_ws is None and len(sheet_names) >= 2:
        for sname in sheet_names[1:]:
            if wb[sname] != items_ws:
                tiragens_ws = wb[sname]
                break

    # 1. Processa aba TIRAGENS agrupada por cod_prod
    tiragens_by_cod_prod: dict[str, list[dict]] = {}
    total_tiragens_rows_read = 0

    if tiragens_ws is not None and tiragens_ws.max_row >= 2:
        t_headers = [str(cell.value or "").strip() for cell in tiragens_ws[1]]
        t_col: dict[str, int] = {}
        for idx, h in enumerate(t_headers):
            norm = _normalize_header(h)
            if norm:
                t_col[norm] = idx

        def _t_val(row_vals: tuple, *keys: str) -> Any:
            for k in keys:
                nk = _normalize_header(k)
                if nk in t_col and t_col[nk] < len(row_vals):
                    return row_vals[t_col[nk]]
            return None

        raw_tiragens_by_cod: dict[str, list[tuple[datetime, dict]]] = {}
        for r_idx, row_vals in enumerate(tiragens_ws.iter_rows(min_row=2, values_only=True), start=2):
            try:
                cp_raw = _t_val(row_vals, "cod_prod", "codprod", "codigo")
                if cp_raw is None or str(cp_raw).strip() == "":
                    continue
                try:
                    cp_key = str(int(float(str(cp_raw).strip())))
                except Exception:
                    cp_key = str(cp_raw).strip()

                qtd_raw = _t_val(row_vals, "tiragem", "qtd", "quantidade")
                try:
                    qtd_tiragem = max(0, int(float(str(qtd_raw or 0).replace(",", "."))))
                except Exception:
                    qtd_tiragem = 0

                dt_raw = _t_val(row_vals, "data_tiragem", "datatiragem", "data")
                dt_obj = _parse_cell_datetime(dt_raw) or datetime(2000, 1, 1)
                dt_str = _format_cell_date_br(dt_raw)

                free_raw = _t_val(row_vals, "free_copies", "freecopies", "cortesia", "fre")
                try:
                    free_num = float(str(free_raw or 0).replace(",", "."))
                    if free_num > 1 and qtd_tiragem > 0:
                        fre_str = f"{(free_num / qtd_tiragem * 100.0):,.2f}%".replace(",", "X").replace(".", ",").replace("X", ".") if free_num <= qtd_tiragem else f"{int(free_num)}"
                    else:
                        fre_str = _fmt_pct_br(free_num)
                except Exception:
                    fre_str = "0,00%"

                perc_roy_raw = _t_val(row_vals, "perc_roy", "percroy", "royalties", "daroy")
                pis_raw = _t_val(row_vals, "pis")
                advance_raw = _t_val(row_vals, "advance", "adiantamento", "daadvance")
                custo_unit_raw = _t_val(row_vals, "custo_unit", "custounit", "custodb")
                custo_real_raw = _t_val(row_vals, "custo_real", "custoreal", "custopro")
                custo_final_raw = _t_val(row_vals, "custo_final", "custofinal", "custofin")
                roy_min_raw = _t_val(row_vals, "roy_min", "roymin", "roy")

                def _safe_float(v: Any) -> float:
                    try:
                        return float(str(v or 0).replace(",", "."))
                    except Exception:
                        return 0.0

                c_unit = _safe_float(custo_unit_raw)
                c_real = _safe_float(custo_real_raw)
                c_fin = _safe_float(custo_final_raw)
                ttc_val = round(c_fin * qtd_tiragem, 2) if (c_fin > 0 and qtd_tiragem > 0) else round(c_unit * qtd_tiragem, 2)

                id_tir_raw = _t_val(row_vals, "id_tiragem", "idtiragem", "id")
                try:
                    row_id = int(float(str(id_tir_raw))) if id_tir_raw is not None else r_idx
                except Exception:
                    row_id = r_idx

                t_entry = {
                    "id": row_id,
                    "data_tiragem": dt_str,
                    "tiragem": qtd_tiragem,
                    "fre": fre_str,
                    "da_roy": _fmt_pct_br(perc_roy_raw),
                    "pis": _fmt_pct_br(pis_raw),
                    "da_advance": _fmt_brl(advance_raw),
                    "custo_db": _fmt_brl(c_unit),
                    "custo_pro": _fmt_brl(c_real),
                    "custo_fin": _fmt_brl(c_fin),
                    "roy": _fmt_brl(roy_min_raw),
                    "da_s": "R$ 0,00",
                    "ttc": _fmt_brl(ttc_val),
                }
                raw_tiragens_by_cod.setdefault(cp_key, []).append((dt_obj, t_entry))
                total_tiragens_rows_read += 1
            except Exception as tir_err:
                log.warning(f"[DBM Excel Import] Aviso na linha {r_idx} da aba TIRAGENS: {tir_err}")
                continue

        # Ordena tiragens de cada produto da mais antiga para a mais recente e renumera IDs sequenciais se necessário
        for cp_key, entries in raw_tiragens_by_cod.items():
            entries.sort(key=lambda x: x[0])
            tiragens_by_cod_prod[cp_key] = [e[1] for e in entries]

    # 2. Carrega catálogo de produtos locais do Seller e mapa de empresas (para id_empresa_royalties)
    local_products = db.query(Product).filter(Product.company_id == seller_id).all()
    by_isbn: dict[str, Product] = {}
    by_horus_cod: dict[int, Product] = {}
    by_sku: dict[str, Product] = {}
    by_cod_dbm: dict[str, Product] = {}

    for p in local_products:
        if p.ean_gtin:
            clean_e = re.sub(r"[^0-9Xx]", "", p.ean_gtin.strip())
            if clean_e:
                by_isbn[clean_e] = p
        if p.barcode:
            clean_b = re.sub(r"[^0-9Xx]", "", p.barcode.strip())
            if clean_b and clean_b not in by_isbn:
                by_isbn[clean_b] = p
        if p.additional_isbns:
            for extra in p.additional_isbns.replace(";", ",").split(","):
                clean_ex = re.sub(r"[^0-9Xx]", "", extra.strip())
                if clean_ex and clean_ex not in by_isbn:
                    by_isbn[clean_ex] = p
        if p.horus_cod_item is not None:
            by_horus_cod[int(p.horus_cod_item)] = p
        if p.sku:
            by_sku[p.sku.strip()] = p
        if p.cod_dbm:
            by_cod_dbm[p.cod_dbm.strip()] = p

    # Mapa de clientes/fornecedores locais caso id_empresa_royalties bata com horus_cod_fornecedor / horus_cod_cli
    customers_local = db.query(Customer).filter(Customer.company_id == seller_id).all()
    empresa_roy_map: dict[str, str] = {}
    for c in customers_local:
        label_c = (c.name or c.corporate_name or "").strip()
        if not label_c:
            continue
        if c.horus_cod_fornecedor:
            empresa_roy_map[str(c.horus_cod_fornecedor)] = label_c
        if c.horus_cod_cli:
            empresa_roy_map[str(c.horus_cod_cli)] = label_c
        empresa_roy_map[str(c.id)] = label_c

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == seller_id).first()
    cover_primary_base = (settings.cover_image_base_url or "").strip().rstrip("/") if settings else ""
    cover_secondary_base = (settings.cover_image_secondary_base_url or "").strip().rstrip("/") if settings else ""

    # 3. Processa aba de Itens (Planilha1)
    i_headers = [str(cell.value or "").strip() for cell in items_ws[1]]
    i_col: dict[str, int] = {}
    for idx, h in enumerate(i_headers):
        norm = _normalize_header(h)
        if norm and norm not in i_col:
            i_col[norm] = idx

    def _i_val(row_vals: tuple, *keys: str) -> Any:
        for k in keys:
            nk = _normalize_header(k)
            if nk in i_col and i_col[nk] < len(row_vals):
                return row_vals[i_col[nk]]
        return None

    updated_products_count = 0
    created_products_count = 0
    matched_tiragens_books = 0
    matched_tiragens_rows = 0
    not_found_items: list[dict] = []

    for r_idx, row_vals in enumerate(items_ws.iter_rows(min_row=2, values_only=True), start=2):
        cod_prod_raw = _i_val(row_vals, "Cod_Prod", "codprod")
        isbn_raw = _i_val(row_vals, "ISBN", "Cod_Barras", "codbarras", "ean")
        cod_horus_raw = _i_val(row_vals, "CodProdHorus", "codprodhorus", "cod_horus", "cod_item")
        titulo_raw = _i_val(row_vals, "Titulo", "nome", "name")

        if cod_prod_raw is None and isbn_raw is None and cod_horus_raw is None and titulo_raw is None:
            continue

        cp_key = ""
        if cod_prod_raw is not None and str(cod_prod_raw).strip() != "":
            cp_key = str(int(float(cod_prod_raw))) if str(cod_prod_raw).replace(".", "").isdigit() else str(cod_prod_raw).strip()

        clean_isbn = re.sub(r"[^0-9Xx]", "", str(isbn_raw or "").strip())
        if not clean_isbn:
            cb_raw = _i_val(row_vals, "Cod_Barras", "codbarras")
            clean_isbn = re.sub(r"[^0-9Xx]", "", str(cb_raw or "").strip())

        cod_horus_int: Optional[int] = None
        if cod_horus_raw is not None and str(cod_horus_raw).strip() != "":
            ch_s = str(cod_horus_raw).strip()
            if ch_s.replace(".", "").isdigit():
                cod_horus_int = int(float(ch_s))

        # Localiza o produto correspondente no Cronuz
        prod: Optional[Product] = None
        if clean_isbn and clean_isbn in by_isbn:
            prod = by_isbn[clean_isbn]
        elif cod_horus_int is not None and cod_horus_int in by_horus_cod:
            prod = by_horus_cod[cod_horus_int]
        elif cod_horus_int is not None and str(cod_horus_int) in by_sku:
            prod = by_sku[str(cod_horus_int)]
        elif cp_key and cp_key in by_cod_dbm:
            prod = by_cod_dbm[cp_key]

        if not prod:
            if not create_missing:
                not_found_items.append({
                    "row": r_idx,
                    "cod_prod": cp_key,
                    "cod_horus": cod_horus_int,
                    "isbn": clean_isbn,
                    "title": str(titulo_raw or "").strip(),
                })
                continue
            sku_new = str(cod_horus_int or clean_isbn or cp_key or f"DBM-{r_idx}").strip()
            prod = Product(
                company_id=seller_id,
                sku=sku_new,
                name=str(titulo_raw or f"Livro #{sku_new}").strip()[:255],
                ean_gtin=clean_isbn[:50] if clean_isbn else None,
                barcode=clean_isbn[:50] if clean_isbn else None,
                horus_cod_item=cod_horus_int,
                cod_dbm=str(cod_horus_int or cp_key or sku_new),
                status="ACTIVE",
                stock_quantity=0,
            )
            db.add(prod)
            db.flush()
            created_products_count += 1
            if clean_isbn:
                by_isbn[clean_isbn] = prod
            if cod_horus_int:
                by_horus_cod[cod_horus_int] = prod
        else:
            updated_products_count += 1

        # Atualiza campos do produto com os dados da planilha
        if titulo_raw and str(titulo_raw).strip() and not prod.name:
            prod.name = str(titulo_raw).strip()[:255]

        sub_raw = _i_val(row_vals, "SubtTitulo", "subtitulo")
        autor_raw = _i_val(row_vals, "Autor", "autor")
        short_desc = str(sub_raw or autor_raw or "").strip()
        if short_desc:
            prod.short_description = short_desc[:400]

        if clean_isbn:
            if not prod.ean_gtin:
                prod.ean_gtin = clean_isbn[:50]
            if not prod.barcode:
                prod.barcode = clean_isbn[:50]

        if cod_horus_int is not None and not prod.horus_cod_item:
            prod.horus_cod_item = cod_horus_int
        if not prod.cod_dbm:
            prod.cod_dbm = str(cod_horus_int or cp_key or prod.sku)

        # Data de Lançamento, Ano e Mês
        dt_lanc = _parse_cell_datetime(_i_val(row_vals, "Data_Lanc", "datalanc", "data_lancamento"))
        if dt_lanc:
            prod.launch_date = dt_lanc
            prod.launch_month = dt_lanc.month
            prod.launch_year = dt_lanc.year
        else:
            ano_raw = _i_val(row_vals, "Ano_Lanc", "anolanc")
            mes_raw = _i_val(row_vals, "Mes_Lanc", "meslanc")
            if ano_raw and str(ano_raw).replace(".", "").isdigit():
                prod.launch_year = int(float(ano_raw))
            if mes_raw and str(mes_raw).replace(".", "").isdigit():
                prod.launch_month = int(float(mes_raw))

        # Assunto, Coleção, Sinopse, Páginas, Edição, Unidades por Caixa
        assunto_raw = _i_val(row_vals, "Assunto", "assunto")
        if assunto_raw and str(assunto_raw).strip():
            prod.subject = str(assunto_raw).strip()[:150]

        col_raw = _i_val(row_vals, "Coleção", "colecao")
        if col_raw and str(col_raw).strip():
            prod.collection = str(col_raw).strip()[:150]

        sinopse_raw = _i_val(row_vals, "Sinopse", "sinopse")
        if sinopse_raw and str(sinopse_raw).strip():
            prod.long_description = str(sinopse_raw).strip()

        pag_raw = _i_val(row_vals, "Páginas", "paginas")
        if pag_raw is not None and str(pag_raw).replace(".", "").isdigit():
            p_int = int(float(pag_raw))
            if p_int > 0:
                prod.pages = p_int

        ed_raw = _i_val(row_vals, "Edição", "edicao")
        if ed_raw is not None and str(ed_raw).strip() != "":
            ed_s = str(int(float(ed_raw))) if str(ed_raw).replace(".", "").isdigit() else str(ed_raw).strip()
            prod.edition_number = ed_s[:50]

        uni_cx_raw = _i_val(row_vals, "UniCaixas", "unicaixas", "unid_caixa")
        if uni_cx_raw is not None and str(uni_cx_raw).replace(".", "").isdigit():
            ucx = int(float(uni_cx_raw))
            if ucx > 0:
                prod.units_per_box = ucx

        # Preço (P_Euro na planilha é o Preço de Capa em R$ se o produto estiver sem preço)
        preco_raw = _i_val(row_vals, "P_Euro", "peuro", "preco")
        if preco_raw is not None:
            try:
                p_val = float(str(preco_raw).replace(",", "."))
                if p_val > 0 and (not prod.base_price or prod.base_price <= 0):
                    prod.base_price = round(p_val, 2)
            except Exception:
                pass

        # Largura, Altura e Peso (em gramas na planilha -> kg no banco)
        larg_raw = _i_val(row_vals, "Largura", "largura")
        if larg_raw is not None:
            try:
                l_val = float(str(larg_raw).replace(",", "."))
                if l_val > 0:
                    prod.width_cm = round(l_val, 2)
            except Exception:
                pass

        alt_raw = _i_val(row_vals, "Altura", "altura")
        if alt_raw is not None:
            try:
                a_val = float(str(alt_raw).replace(",", "."))
                if a_val > 0:
                    prod.height_cm = round(a_val, 2)
            except Exception:
                pass

        peso_raw = _i_val(row_vals, "Peso", "peso")
        if peso_raw is not None:
            try:
                ps_val = float(str(peso_raw).replace(",", "."))
                if ps_val > 0:
                    prod.weight_kg = round(ps_val / 1000.0, 3) if ps_val > 15 else round(ps_val, 3)
            except Exception:
                pass

        # Acabamento e flag de E-book
        acab_raw = _i_val(row_vals, "Acabamento", "acabamento", "Encadernacao")
        if acab_raw and str(acab_raw).strip():
            norm_acab = _normalize_binding_finish(acab_raw, prod.name)
            prod.binding_finish = norm_acab
            if norm_acab == "E-book":
                prod.is_ebook = True
        elif "[E-BOOK]" in (prod.name or "").upper() or "[EBOOK]" in (prod.name or "").upper():
            prod.binding_finish = "E-book"
            prod.is_ebook = True

        # Link do Site (LinkGGbrasil) -> external_link
        link_raw = _i_val(row_vals, "LinkGGbrasil", "linkggbrasil", "link", "external_link")
        if link_raw and str(link_raw).strip():
            prod.external_link = str(link_raw).strip()[:500]

        # Esgotado, Data_Esgotado e Situação do Item (Lançamento, Em Distribuição, Esgotado, Fora de Catálogo)
        dt_esg_raw = _i_val(row_vals, "Data_Esgotado", "dataesgotado")
        if dt_esg_raw:
            dt_esg_str = _format_cell_date_br(dt_esg_raw)
            if dt_esg_str:
                prod.out_of_print_date = dt_esg_str
                prod.is_out_of_print = True
                prod.horus_situacao_item = "Esgotado"

        sit_raw = _i_val(row_vals, "Situacao", "situacao", "Situação", "Status", "status")
        if sit_raw and str(sit_raw).strip():
            s_up = str(sit_raw).strip().upper()
            if "FORA" in s_up or s_up == "FC":
                prod.horus_situacao_item = "Fora de Catálogo"
                prod.is_out_of_print = True
            elif "ESGOT" in s_up or s_up in ("ES", "FE"):
                prod.horus_situacao_item = "Esgotado"
                prod.is_out_of_print = True
            elif "LANC" in s_up or "LANÇ" in s_up or s_up in ("LC", "IP"):
                prod.horus_situacao_item = "Lançamento"
                prod.is_out_of_print = False
            elif "DISTRIB" in s_up or s_up in ("ED", "DI", "A", "ATIVO"):
                prod.horus_situacao_item = "Em Distribuição"
                prod.is_out_of_print = False
        elif not prod.horus_situacao_item:
            prod.horus_situacao_item = "Esgotado" if prod.is_out_of_print else "Em Distribuição"

        # Consignado e Giro 90 dias (se informados na planilha)
        consig_raw = _i_val(row_vals, "Consignado", "consignado")
        if consig_raw is not None and str(consig_raw).replace(".", "").isdigit():
            c_val = int(float(consig_raw))
            if c_val >= 0 and not prod.consignment_stock:
                prod.consignment_stock = c_val

        vds90_raw = _i_val(row_vals, "Vds90dias", "vds90dias")
        if vds90_raw is not None and str(vds90_raw).replace(".", "").isdigit():
            v90_val = int(float(vds90_raw))
            if v90_val >= 0:
                prod.sales_90 = v90_val

        # Contratos & Royalties DBM
        roy_rule_raw = _i_val(row_vals, "Royaties", "Royalties", "royalties")
        if roy_rule_raw and str(roy_rule_raw).strip():
            prod.royalty_rule = str(roy_rule_raw).strip()[:100]

        id_emp_roy_raw = _i_val(row_vals, "id_empresa_royalties", "idempresaroyalties")
        if id_emp_roy_raw is not None and str(id_emp_roy_raw).strip() != "":
            emp_key = str(int(float(id_emp_roy_raw))) if str(id_emp_roy_raw).replace(".", "").isdigit() else str(id_emp_roy_raw).strip()
            prod.royalty_company = empresa_roy_map.get(emp_key, emp_key)[:200]

        dt_contrato_raw = _i_val(row_vals, "Data_Contrato", "datacontrato")
        if dt_contrato_raw:
            signed_str = _format_cell_date_br(dt_contrato_raw)
            if signed_str:
                prod.contract_signed_date = signed_str

        anos_val_raw = _i_val(row_vals, "Anos_Validade", "anosvalidade")
        if anos_val_raw is not None and str(anos_val_raw).replace(".", "").isdigit():
            anos_int = int(float(anos_val_raw))
            if anos_int > 0:
                prod.contract_validity_years = anos_int

        if prod.contract_signed_date and prod.contract_validity_years:
            exp_str = _calculate_contract_expiration_str(prod.contract_signed_date, prod.contract_validity_years)
            if exp_str:
                prod.contract_expires_date = exp_str

        perc_eb_raw = _i_val(row_vals, "perc_royalties_ebook", "percroyaltiesebook")
        if perc_eb_raw is not None and str(perc_eb_raw).strip() != "":
            try:
                peb = float(str(perc_eb_raw).replace(",", "."))
                if 0 < peb <= 1.0:
                    peb = round(peb * 100.0, 2)
                prod.ebook_royalty_pct = round(peb, 2)
            except Exception:
                pass

        # Capa automática usando as configurações do seller se o produto ainda não tiver cover_url
        eff_isbn = re.sub(r"[^0-9Xx]", "", str(prod.ean_gtin or clean_isbn or ""))
        if not prod.cover_url and eff_isbn:
            if cover_primary_base:
                prod.cover_url = f"{cover_primary_base}/{eff_isbn}.jpg"
            elif cover_secondary_base:
                prod.cover_url = f"{cover_secondary_base}/{eff_isbn}.jpg"

        # Cruzamento com a aba TIRAGENS pelo Cod_Prod == cod_prod
        if cp_key and cp_key in tiragens_by_cod_prod:
            t_list = tiragens_by_cod_prod[cp_key]
            if t_list:
                # Se perc_roy vier na tiragem e o livro estiver como 'Sem Royalties', ajusta para 'Royalties % Capa'
                has_roy_in_tiragem = any(t.get("da_roy") and t.get("da_roy") != "0,00%" for t in t_list)
                if has_roy_in_tiragem and (not prod.royalty_rule or prod.royalty_rule == "Sem Royalties"):
                    prod.royalty_rule = "Royalties % Capa"
                prod.dbm_tiragens = json.dumps(t_list, ensure_ascii=False)
                matched_tiragens_books += 1
                matched_tiragens_rows += len(t_list)

    try:
        db.commit()
    except Exception as commit_err:
        db.rollback()
        log.error(f"[DBM Excel Import] Erro ao salvar alterações no banco: {commit_err}")
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao gravar dados da planilha no banco: {str(commit_err)[:250]}"
        )

    return {
        "success": True,
        "filename": fname,
        "sheets_detected": sheet_names,
        "updated_products_count": updated_products_count,
        "created_products_count": created_products_count,
        "total_tiragens_rows_read": total_tiragens_rows_read,
        "matched_tiragens_books": matched_tiragens_books,
        "matched_tiragens_rows": matched_tiragens_rows,
        "not_found_count": len(not_found_items),
        "not_found_sample": not_found_items[:20],
        "message": (
            f"Importação concluída com sucesso! {updated_products_count} livro(s) atualizado(s)"
            + (f", {created_products_count} criado(s)" if created_products_count > 0 else "")
            + f" e {matched_tiragens_rows} tiragem(ns) vinculada(s) em {matched_tiragens_books} obra(s)."
        ),
    }


@router.delete("/products/{product_id}")
def delete_dbm_product(
    product_id: int,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Exclui um produto do cadastro DBM do seller, limpando movimentações locais vinculadas.
    """
    from app.models.product import Product, StockMovement, PriceHistory
    from app.models.catalog_support import ProductCharacteristic

    seller_id = _resolve_seller_id(current_user, company_id)
    prod = db.query(Product).filter(
        Product.id == product_id,
        Product.company_id == seller_id
    ).first()
    if not prod:
        raise HTTPException(status_code=404, detail="Produto não encontrado no cadastro DBM deste seller.")

    prod_name = prod.name
    try:
        db.query(StockMovement).filter(StockMovement.product_id == prod.id).delete(synchronize_session=False)
        db.query(PriceHistory).filter(PriceHistory.product_id == prod.id).delete(synchronize_session=False)
        db.query(ProductCharacteristic).filter(ProductCharacteristic.product_id == prod.id).delete(synchronize_session=False)
        db.delete(prod)
        db.commit()
    except Exception as exc:
        db.rollback()
        log.error(f"[DBM Product Delete] Erro ao excluir produto #{product_id}: {exc}")
        raise HTTPException(
            status_code=400,
            detail=f"Não foi possível excluir o item '{prod_name}': {str(exc)[:220]}"
        )

    return {"success": True, "deleted_id": product_id, "name": prod_name}


@router.post("/products/batch-enrich-metrics")
def batch_enrich_dbm_products_metrics(
    company_id: Optional[int] = Query(None),
    general_sales_days: int = Query(90, ge=1, le=730),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Calcula em lote para todo o catálogo de produtos DBM do seller:
    - VDS365 Geral (vendas dos últimos 365 dias)
    - VDS(XM) Geral (vendas dos últimos `general_sales_days` dias, ex: 90d = 3M)
    - Saldo Consignado Geral (soma do saldo consignado ativo no mercado)
    Persiste nos campos `sales_365`, `sales_90` e `consignment_stock` de cada produto e devolve o mapa atualizado.
    """
    from datetime import timedelta
    from app.models.product import Product
    from app.models.horus_bi_sale import HorusBISale

    seller_id = _resolve_seller_id(current_user, company_id)
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == seller_id).first()
    products = db.query(Product).filter(Product.company_id == seller_id).all()
    if not products:
        return {"metrics": {}, "general_sales_days": general_sales_days}

    def _clean_key(val: Any) -> str:
        return str(val or "").strip().replace("-", "").replace(" ", "")

    sales_365_map: dict[str, int] = {}
    sales_period_map: dict[str, int] = {}
    consig_map: dict[str, int] = {}
    stock_map: dict[str, int] = {}
    sql_consig_ok = False
    sql_sales_ok = False

    sql_client = None
    try:
        sql_client = HorusSQLClient(db, seller_id)
    except Exception as sql_init_err:
        log.warning(f"[DBM Products Batch Metrics] Conexão HorusSQLClient indisponível: {sql_init_err}")
        sql_client = None

    cod_empresa, cod_filial = _resolve_horus_empresa_filial(settings, sql_client)

    if sql_client:
        try:
            cfop_sales_in = ", ".join(f"'{c}'" for c in (list(CFOP_VENDA_LIST) + list(CFOP_ACERTO_LIST)))
            clean_cfop_expr = "REPLACE(REPLACE(REPLACE(RTRIM(LTRIM(ISNULL(NFI.COD_NATUREZA, NF.COD_NATUREZA))), '.', ''), ',', ''), ' ', '')"

            sql_sales_all = f"""
                SELECT
                    RTRIM(LTRIM(ISNULL(I.COD_BARRA_ITEM, ''))) AS cod_barra,
                    RTRIM(LTRIM(ISNULL(I.COD_ISBN_ITEM, ''))) AS cod_isbn,
                    CAST(NFI.COD_ITEM AS VARCHAR) AS cod_item,
                    SUM(CASE WHEN NF.DAT_EMISSAO_NF >= DATEADD(day, -365, GETDATE()) THEN ISNULL(NFI.QTD_ITENS, 0) ELSE 0 END) AS qty_365,
                    SUM(CASE WHEN NF.DAT_EMISSAO_NF >= DATEADD(day, -%s, GETDATE()) THEN ISNULL(NFI.QTD_ITENS, 0) ELSE 0 END) AS qty_period
                FROM NF_ITENS NFI WITH (NOLOCK)
                INNER JOIN NF_MESTRE NF WITH (NOLOCK)
                    ON NF.COD_NF = NFI.COD_NF
                    AND NF.COD_FILIAL = NFI.COD_FILIAL
                    AND NF.COD_EMPRESA = NFI.COD_EMPRESA
                INNER JOIN ITENS_ESTOQUE_GERAL I WITH (NOLOCK) ON I.COD_ITEM = NFI.COD_ITEM
                WHERE NF.COD_EMPRESA = {cod_empresa}
                  AND NF.COD_FILIAL = {cod_filial}
                  AND ISNULL(NF.SIT_NF, '') NOT IN ('C', 'CAN')
                  AND NF.DAT_EMISSAO_NF >= DATEADD(day, -370, GETDATE())
                  AND {clean_cfop_expr} IN ({cfop_sales_in})
                GROUP BY I.COD_BARRA_ITEM, I.COD_ISBN_ITEM, NFI.COD_ITEM
            """
            s_rows = sql_client.query(sql_sales_all, (general_sales_days,), max_rows=5000)
            sql_sales_ok = True
            for sr in (s_rows or []):
                q365 = int(float(sr.get("qty_365") or 0))
                qper = int(float(sr.get("qty_period") or 0))
                for rk in (sr.get("cod_barra"), sr.get("cod_isbn"), sr.get("cod_item")):
                    k = _clean_key(rk)
                    if k:
                        sales_365_map[k] = max(sales_365_map.get(k, 0), q365)
                        sales_period_map[k] = max(sales_period_map.get(k, 0), qper)
        except Exception as e:
            log.warning(f"[DBM Products Batch Metrics] Aviso ao consultar vendas gerais SQL: {e}")

        try:
            sql_consig_all = f"""
                SELECT
                    RTRIM(LTRIM(ISNULL(I.COD_BARRA_ITEM, ''))) AS cod_barra,
                    RTRIM(LTRIM(ISNULL(I.COD_ISBN_ITEM, ''))) AS cod_isbn,
                    CAST(V.COD_ITEM AS VARCHAR) AS cod_item,
                    SUM(ISNULL(V.SALDO, 0)) AS saldo_consig
                FROM VW_ITENS_CONSIGNACAO V WITH (NOLOCK)
                INNER JOIN ITENS_ESTOQUE_GERAL I WITH (NOLOCK) ON I.COD_ITEM = V.COD_ITEM
                WHERE V.COD_EMPRESA = {cod_empresa}
                  AND V.COD_FILIAL = {cod_filial}
                  AND ISNULL(V.SALDO, 0) > 0
                GROUP BY I.COD_BARRA_ITEM, I.COD_ISBN_ITEM, V.COD_ITEM
            """
            c_rows = sql_client.query(sql_consig_all, (), max_rows=5000)
            sql_consig_ok = True
            for cr in (c_rows or []):
                cs_v = int(float(cr.get("saldo_consig") or 0))
                for rk in (cr.get("cod_barra"), cr.get("cod_isbn"), cr.get("cod_item")):
                    k = _clean_key(rk)
                    if k:
                        consig_map[k] = max(consig_map.get(k, 0), cs_v)
        except Exception as e:
            log.warning(f"[DBM Products Batch Metrics] Aviso ao consultar consignado geral SQL: {e}")

        try:
            sql_stock_all = f"""
                SELECT
                    RTRIM(LTRIM(ISNULL(I.COD_BARRA_ITEM, ''))) AS cod_barra,
                    RTRIM(LTRIM(ISNULL(I.COD_ISBN_ITEM, ''))) AS cod_isbn,
                    CAST(S.cod_item AS VARCHAR) AS cod_item,
                    SUM(ISNULL(S.saldo_disponivel, 0)) AS saldo_disp
                FROM VW_SALDO_ITENS S WITH (NOLOCK)
                INNER JOIN ITENS_ESTOQUE_GERAL I WITH (NOLOCK) ON I.COD_ITEM = S.cod_item
                WHERE S.cod_empresa = {cod_empresa}
                  AND S.cod_filial = {cod_filial}
                GROUP BY I.COD_BARRA_ITEM, I.COD_ISBN_ITEM, S.cod_item
            """
            st_rows = sql_client.query(sql_stock_all, (), max_rows=5000)
            for strw in (st_rows or []):
                st_v = max(0, int(float(strw.get("saldo_disp") or 0)))
                for rk in (strw.get("cod_barra"), strw.get("cod_isbn"), strw.get("cod_item")):
                    k = _clean_key(rk)
                    if k:
                        stock_map[k] = max(stock_map.get(k, 0), st_v)
        except Exception as e:
            log.warning(f"[DBM Products Batch Metrics] Aviso ao consultar saldo disponivel SQL: {e}")

    # Complemento via HorusBISale local
    try:
        now_dt = datetime.utcnow()
        dt_365 = now_dt - timedelta(days=365)
        dt_period = now_dt - timedelta(days=max(1, general_sales_days))
        bi_365_rows = db.query(
            HorusBISale.ean,
            func.sum(HorusBISale.qty_fulfilled).label("qty")
        ).filter(
            HorusBISale.company_id == seller_id,
            HorusBISale.sale_date >= dt_365,
            HorusBISale.cfop.in_(list(CFOP_VENDA_LIST) + list(CFOP_ACERTO_LIST))
        ).group_by(HorusBISale.ean).all()
        for r in bi_365_rows:
            k = _clean_key(r.ean)
            if k and k not in sales_365_map:
                sales_365_map[k] = int(r.qty or 0)

        bi_per_rows = db.query(
            HorusBISale.ean,
            func.sum(HorusBISale.qty_fulfilled).label("qty")
        ).filter(
            HorusBISale.company_id == seller_id,
            HorusBISale.sale_date >= dt_period,
            HorusBISale.cfop.in_(list(CFOP_VENDA_LIST) + list(CFOP_ACERTO_LIST))
        ).group_by(HorusBISale.ean).all()
        for r in bi_per_rows:
            k = _clean_key(r.ean)
            if k and k not in sales_period_map:
                sales_period_map[k] = int(r.qty or 0)
    except Exception as e:
        log.warning(f"[DBM Products Batch Metrics] Aviso ao consultar HorusBISale: {e}")

    metrics_out: dict[str, dict[str, int]] = {}
    dirty = False
    for p in products:
        keys_to_try = [
            _clean_key(p.ean_gtin),
            _clean_key(p.barcode),
            _clean_key(p.horus_cod_item),
            _clean_key(p.sku),
        ]
        keys_to_try = [k for k in keys_to_try if k]
        s365 = 0
        sper = 0
        consig = 0
        for k in keys_to_try:
            if k in sales_365_map:
                s365 = max(s365, sales_365_map[k])
            if k in sales_period_map:
                sper = max(sper, sales_period_map[k])
            if k in consig_map:
                consig = max(consig, consig_map[k])

        # Se a consulta SQL rodou com sucesso, usa o valor exato da filial no Horus; senão mantém fallback local
        final_s365 = s365 if (sql_sales_ok or sales_365_map or s365 > 0) else int(p.sales_365 or 0)
        final_sper = sper if (sql_sales_ok or sales_period_map or sper > 0) else int(p.sales_90 or 0)
        final_consig = consig if (sql_consig_ok or consig_map or consig > 0) else int(p.consignment_stock or 0)

        new_stock = None
        for k in keys_to_try:
            if k in stock_map:
                new_stock = stock_map[k]
                break

        if (
            p.sales_365 != final_s365
            or p.sales_90 != final_sper
            or p.consignment_stock != final_consig
            or (new_stock is not None and p.stock_quantity != new_stock)
        ):
            p.sales_365 = final_s365
            p.sales_90 = final_sper
            p.consignment_stock = final_consig
            if new_stock is not None:
                p.stock_quantity = new_stock
            dirty = True

        metrics_out[str(p.id)] = {
            "consignment_stock": final_consig,
            "sales_365": final_s365,
            "sales_90": final_sper,
            "stock_quantity": new_stock if new_stock is not None else int(p.stock_quantity or 0),
        }

    if dirty:
        try:
            db.commit()
        except Exception:
            db.rollback()

    return {
        "metrics": metrics_out,
        "general_sales_days": general_sales_days,
    }








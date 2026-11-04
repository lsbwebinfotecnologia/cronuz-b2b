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
from typing import Optional, List
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
        elif any(k in norm for k in ['apelido', 'fantasia', 'nomefantasia']) or norm in ['nome', 'empresa']:
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

    if existing_cust:
        existing_cust.name = apelido
        existing_cust.corporate_name = razao_social
        existing_cust.document = clean_doc
        existing_cust.city = (payload.city or "").strip() or None
        existing_cust.state = (payload.state or "").strip().upper() or None
        existing_cust.group_name = (payload.group_name or "").strip() or None
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
            group_name=(payload.group_name or "").strip() or None,
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
def download_dbm_import_template():
    """
    Gera e entrega modelo Excel (.xlsx) para importação de empresas no DBM.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
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

    # Ajusta largura das colunas
    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 15)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    filename = "modelo_importacao_empresas_dbm.xlsx"
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
            "segmento": segmento or "Editoras",
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

    if not sql_company_id:
        raise HTTPException(status_code=400, detail="Nenhuma conexão Horus SQL configurada no sistema.")

    try:
        sql_client = HorusSQLClient(db, sql_company_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao conectar ao banco Horus: {str(e)}")

    # Filial configurada nos dados da API (horus_branch)
    api_filial = None
    if settings:
        if settings.horus_branch and str(settings.horus_branch).strip():
            api_filial = str(settings.horus_branch).strip()
        elif settings.horus_sql_cod_filial and str(settings.horus_sql_cod_filial).strip():
            api_filial = str(settings.horus_sql_cod_filial).strip()

    cod_filial = int(api_filial) if (api_filial and api_filial.isdigit()) else (int(sql_client.cod_filial) if str(sql_client.cod_filial).isdigit() else 2)

    import_mode = (payload.import_mode or "cliente").strip().lower()
    is_fornecedor_mode = (import_mode == "fornecedor")

    results = []
    
    for item in payload.items:
        cod_horus = item.codigo_horus
        row_idx = item.row_index

        try:
            if is_fornecedor_mode:
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
CFOP_VENDA_LIST = ("5101", "5102", "6101", "6102", "5403", "6403", "5405", "6405")
CFOP_REMESSA_LIST = ("5917", "6917")
CFOP_DEVOLUCAO_LIST = ("1918", "2918", "1201", "1202", "2201", "2202", "1410", "1411", "2410", "2411")


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
    cod_filial = int(sql_client.cod_filial) if (sql_client and str(sql_client.cod_filial).isdigit()) else 2
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
                    """
                    SELECT
                        ISNULL(SUM(V.SALDO), 0) AS total_pecas,
                        ISNULL(SUM(V.SALDO * ISNULL(V.VLR_VENDIDO, V.VLR_PRECO * (1.0 - ISNULL(V.VLR_DESCONTO, 0) / 100.0))), 0) AS total_valor
                    FROM VW_ITENS_CONSIGNACAO V WITH (NOLOCK)
                    WHERE V.COD_CLI = %s
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

    isbns = list({str(it.get("isbn") or "").strip().replace("-", "").replace(" ", "") for it in items_list if it.get("isbn")})
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

    # 1. Enriquecimento direto via Horus SQL Server (alta precisão em tempo real)
    if sql_client:
        try:
            cfop_sales_in = ", ".join(f"'{c}'" for c in (list(CFOP_VENDA_LIST) + list(CFOP_ACERTO_LIST)))
            clean_cfop_expr = "REPLACE(REPLACE(REPLACE(RTRIM(LTRIM(ISNULL(NFI.COD_NATUREZA, NF.COD_NATUREZA))), '.', ''), ',', ''), ' ', '')"
            for c_start in range(0, len(isbns), 120):
                chunk = isbns[c_start:c_start + 120]
                ph = ", ".join(["%s"] * len(chunk))
                # Giro Geral (Yd) + Giro Cliente (Xd e 365d) em uma única passada por lote
                if cod_cli:
                    sql_batch_giro = f"""
                        SELECT
                            RTRIM(LTRIM(ISNULL(I.COD_BARRA_ITEM, ISNULL(I.COD_ISBN_ITEM, CAST(NFI.COD_ITEM AS VARCHAR))))) AS isbn,
                            SUM(CASE WHEN NF.DAT_EMISSAO_NF >= DATEADD(day, -%s, GETDATE()) THEN ISNULL(NFI.QTD_ITENS, 0) ELSE 0 END) AS gen_qty,
                            SUM(CASE WHEN NF.COD_CLI = %s AND NF.DAT_EMISSAO_NF >= DATEADD(day, -365, GETDATE()) THEN ISNULL(NFI.QTD_ITENS, 0) ELSE 0 END) AS cli_365,
                            SUM(CASE WHEN NF.COD_CLI = %s AND NF.DAT_EMISSAO_NF >= DATEADD(day, -%s, GETDATE()) THEN ISNULL(NFI.QTD_ITENS, 0) ELSE 0 END) AS cli_win
                        FROM NF_ITENS NFI WITH (NOLOCK)
                        INNER JOIN NF_MESTRE NF WITH (NOLOCK)
                            ON NF.COD_NF = NFI.COD_NF
                            AND NF.COD_FILIAL = NFI.COD_FILIAL
                            AND NF.COD_EMPRESA = NFI.COD_EMPRESA
                        INNER JOIN ITENS_ESTOQUE_GERAL I WITH (NOLOCK) ON I.COD_ITEM = NFI.COD_ITEM
                        WHERE ISNULL(NF.SIT_NF, '') NOT IN ('C', 'CAN')
                          AND NF.DAT_EMISSAO_NF >= DATEADD(day, -370, GETDATE())
                          AND {clean_cfop_expr} IN ({cfop_sales_in})
                          AND (I.COD_BARRA_ITEM IN ({ph}) OR I.COD_ISBN_ITEM IN ({ph}))
                        GROUP BY I.COD_BARRA_ITEM, I.COD_ISBN_ITEM, NFI.COD_ITEM
                    """
                    params = (general_sales_days, cod_cli, cod_cli, client_sales_days) + tuple(chunk) + tuple(chunk)
                    g_rows = sql_client.query(sql_batch_giro, params, max_rows=300)
                    for gr in (g_rows or []):
                        k = str(gr.get("isbn") or "").strip().replace("-", "").replace(" ", "")
                        if k:
                            gen_period_map[k] = int(float(gr.get("gen_qty") or 0))
                            cli_365_map[k] = int(float(gr.get("cli_365") or 0))
                            cli_period_map[k] = int(float(gr.get("cli_win") or 0))

                    # Saldo consignado ativo por item na VW_ITENS_CONSIGNACAO
                    sql_batch_consig = f"""
                        SELECT
                            RTRIM(LTRIM(ISNULL(I.COD_BARRA_ITEM, ISNULL(I.COD_ISBN_ITEM, CAST(V.COD_ITEM AS VARCHAR))))) AS isbn,
                            SUM(ISNULL(V.SALDO, 0)) AS saldo_consig
                        FROM VW_ITENS_CONSIGNACAO V WITH (NOLOCK)
                        INNER JOIN ITENS_ESTOQUE_GERAL I WITH (NOLOCK) ON I.COD_ITEM = V.COD_ITEM
                        WHERE V.COD_CLI = %s
                          AND ISNULL(V.SALDO, 0) > 0
                          AND (I.COD_BARRA_ITEM IN ({ph}) OR I.COD_ISBN_ITEM IN ({ph}))
                        GROUP BY I.COD_BARRA_ITEM, I.COD_ISBN_ITEM, V.COD_ITEM
                    """
                    c_rows = sql_client.query(sql_batch_consig, (cod_cli,) + tuple(chunk) + tuple(chunk), max_rows=300)
                    for cr in (c_rows or []):
                        k = str(cr.get("isbn") or "").strip().replace("-", "").replace(" ", "")
                        if k:
                            consig_map[k] = int(float(cr.get("saldo_consig") or 0))
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
            k = str(r.ean).strip().replace("-", "").replace(" ", "")
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
                k = str(r.ean).strip().replace("-", "").replace(" ", "")
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
                k = str(r.ean).strip().replace("-", "").replace(" ", "")
                if k not in cli_period_map:
                    cli_period_map[k] = int(r.qty or 0)
    except Exception as e:
        log.warning(f"[DBM Desk] Aviso ao enriquecer giro BI em lote: {e}")

    for it in items_list:
        isbn = str(it.get("isbn") or "").strip().replace("-", "").replace(" ", "")
        if isbn:
            if not it.get("clientSalesPeriod"):
                it["clientSalesPeriod"] = cli_period_map.get(isbn, 0)
            if not it.get("clientSales365d"):
                it["clientSales365d"] = cli_365_map.get(isbn, 0)
            if not it.get("generalSalesPeriod"):
                it["generalSalesPeriod"] = gen_period_map.get(isbn, 0)
            if not it.get("consignedBalance") and isbn in consig_map:
                it["consignedBalance"] = consig_map[isbn]

    return items_list


@router.get("/proposals-desk/catalog-tabs")
async def get_proposals_desk_catalog_tabs(
    customer_id: int = Query(..., description="ID do cliente selecionado"),
    company_id: Optional[int] = Query(None),
    client_sales_days: int = Query(30, ge=1, le=730),
    general_sales_days: int = Query(90, ge=1, le=730),
    limit: int = Query(40, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retorna os itens das abas de catálogo para o cliente selecionado:
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
    customer = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.company_id == seller_id
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == seller_id).first()
    legacy_pagination = getattr(settings, "horus_legacy_pagination", False) if settings else False
    default_disc = float(customer.discount or 35.0)

    sql_client = None
    try:
        sql_client = HorusSQLClient(db, seller_id)
    except Exception:
        sql_client = None

    cod_cli = _resolve_customer_horus_cod_cli(db, customer, sql_client)
    cod_filial = int(sql_client.cod_filial) if (sql_client and str(sql_client.cod_filial).isdigit()) else 2

    now_dt = datetime.utcnow()
    win_start = now_dt - timedelta(days=270)  # 9 meses para trás
    win_end = now_dt + timedelta(days=180)    # 6 meses para frente

    novidades_items: list[dict] = []
    reposicao_items: list[dict] = []
    fundo_items: list[dict] = []
    seen_isbns: set[str] = set()

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
            isbn = str(p.ean_gtin or p.sku or p.id).strip()
            if not isbn or isbn in seen_isbns:
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
                "boxQty": max(1, int(p.units_per_box or 12)),
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
                isbn = str(p.ean_gtin or p.sku or p.id).strip()
                if not isbn or isbn in seen_isbns:
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
                    "boxQty": max(1, int(p.units_per_box or 12)),
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
    replenishment_sales_days: int = Query(90, ge=1, le=1095, description="Dias de histórico de vendas ao cliente para basear a reposição"),
    client_sales_days: int = Query(30, ge=1, le=730),
    general_sales_days: int = Query(90, ge=1, le=730),
    exclude_isbns: Optional[str] = Query(None, description="Lista de ISBNs separados por vírgula já presentes em outras abas (ex: Pedido, Novidades)"),
    company_id: Optional[int] = Query(None),
    limit: int = Query(150, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Busca sob demanda para a aba REPOSIÇÃO:
    1. Coleta os itens que possuem SALDO CONSIGNADO ativo com o cliente via API Horus (Busca_Contrato_Cliente_Analitico),
       e caso o cliente não possua permissão B2B na API (B2B_PEDIDOS=0) ou a API retorne vazio, faz fallback automático
       na View oficial do Horus SQL (VW_ITENS_CONSIGNACAO).
    2. Coleta e cruza o histórico dos itens VENDIDOS / ACERTADOS para o cliente nos últimos X dias (replenishment_sales_days)
       via Horus SQL (NF_ITENS / NF_MESTRE) e base BI (HorusBISale).
    3. Filtra rigorosamente para retornar apenas itens com SALDO DE ESTOQUE DISPONÍVEL > 0 (stockAvailable > 0)
       e que não estejam na lista de exclusão (exclude_isbns), evitando duplicidade entre abas.
    """
    from datetime import timedelta
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

    excluded_set: set[str] = set()
    if exclude_isbns:
        for raw_c in exclude_isbns.split(","):
            cl = raw_c.strip().replace("-", "").replace(" ", "")
            if cl:
                excluded_set.add(cl)

    sql_client = None
    try:
        sql_client = HorusSQLClient(db, seller_id)
    except Exception:
        sql_client = None

    cod_cli = _resolve_customer_horus_cod_cli(db, customer, sql_client)
    cod_filial = int(sql_client.cod_filial) if (sql_client and str(sql_client.cod_filial).isdigit()) else 2
    branch_cnpj = sql_client.get_branch_cnpj() if sql_client else None
    effective_cnpj_destino = branch_cnpj or (_sanitize_doc(company.document or "") if company else "")
    clean_cli_doc = _sanitize_doc(customer.document or "")

    # Mapa de itens candidatos indexado por ISBN/código limpo
    candidates_by_key: dict[str, dict] = {}
    consigned_from_api_count = 0
    consigned_from_sql_count = 0
    sold_in_window_count = 0
    sold_total_units_window = 0

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
        "consignmentSource": "NONE",
        "consignedSkusFound": 0,
        "salesWindowDays": replenishment_sales_days,
        "salesCfops": list(CFOP_VENDA_LIST) + list(CFOP_ACERTO_LIST),
        "salesSkusFound": 0,
        "salesTotalUnits": 0,
    }

    # ── PASSO 1A: Coletar Saldo Consignado no Cliente via API Horus (Busca_Contrato_Cliente_Analitico) ──
    if settings and getattr(settings, "horus_enabled", False) and getattr(settings, "horus_url", None) and effective_cnpj_destino and clean_cli_doc:
        try:
            h_client = HorusClients(db, seller_id)
            fin_res = await h_client.get_customer_financials(
                cnpj_destino=effective_cnpj_destino,
                cnpj_cliente=clean_cli_doc,
            )
            if fin_res:
                api_diagnostic["customerB2BInfo"] = fin_res.get("raw")
                if not cod_cli and fin_res.get("cod_cli"):
                    cod_cli = int(fin_res["cod_cli"])
                    sql_diagnostic["codCli"] = cod_cli
                if float(fin_res.get("discount") or 0) > 0:
                    default_disc = float(fin_res["discount"])

            id_guid = (
                customer.id_guid
                or (fin_res.get("id_guid") if fin_res else "")
                or getattr(settings, "horus_default_b2b_guid", "")
                or ""
            )
            api_diagnostic["params"] = {
                "CNPJ_DESTINO": effective_cnpj_destino,
                "ID_DOC": clean_cli_doc,
                "ID_GUID": id_guid,
            }

            if id_guid:
                consig_details = await h_client.get_consignment_details(
                    cnpj_destino=effective_cnpj_destino,
                    cnpj_cliente=clean_cli_doc,
                    id_guid=id_guid,
                    limit=500
                )
                rows_api = consig_details if isinstance(consig_details, list) else ([consig_details] if isinstance(consig_details, dict) else [])
                api_diagnostic["rawResponse"] = rows_api[:5] if rows_api else consig_details

                if rows_api and isinstance(rows_api[0], dict) and (rows_api[0].get("Falha") or rows_api[0].get("FALHA") == "S"):
                    err_msg = str(rows_api[0].get("Mensagem") or rows_api[0].get("MENSAGEM") or rows_api[0].get("Falha") or "Falha na API Horus")
                    api_diagnostic["status"] = "API_REJECTED"
                    api_diagnostic["message"] = err_msg
                else:
                    for row in rows_api:
                        if not isinstance(row, dict) or row.get("Falha") or row.get("FALHA") == "S":
                            continue
                        raw_saldo = row.get("SALDO_ITENS")
                        if raw_saldo is None:
                            q_atend = float(str(row.get("QTD_ATENDIDA", 0) or 0).replace(",", "."))
                            q_fat = float(str(row.get("QTD_FATURADA", 0) or 0).replace(",", "."))
                            q_dev = float(str(row.get("QTD_DEVOLVIDA", row.get("QTD_DEV_FAT", 0)) or 0).replace(",", "."))
                            saldo_consig = int(max(0.0, q_atend - q_fat - q_dev))
                        else:
                            saldo_consig = int(float(str(raw_saldo or 0).replace(",", ".")))

                        if saldo_consig <= 0:
                            continue

                        isbn = str(
                            row.get("BARRAS_ISBN")
                            or row.get("COD_BARRA_ITEM")
                            or row.get("COD_ISBN_ITEM")
                            or row.get("COD_ITEM")
                            or ""
                        ).strip()
                        clean_isbn = isbn.replace("-", "").replace(" ", "")
                        if not clean_isbn or clean_isbn in excluded_set:
                            continue

                        cod_item_str = str(row.get("COD_ITEM") or clean_isbn).strip()
                        vlr_capa = float(str(row.get("VLR_CAPA") or row.get("VLR_PRECO") or 0).replace(",", "."))
                        per_desc = float(str(row.get("PER_DESCONTO") or row.get("DESCONTO") or default_disc).replace(",", "."))

                        if clean_isbn in candidates_by_key:
                            candidates_by_key[clean_isbn]["consignedBalance"] += saldo_consig
                        else:
                            consigned_from_api_count += 1
                            candidates_by_key[clean_isbn] = {
                                "isbn": clean_isbn,
                                "sku": cod_item_str,
                                "cod_item": int(cod_item_str) if cod_item_str.isdigit() else None,
                                "title": str(row.get("NOM_ITEM") or row.get("DESC_ITEM") or f"Item #{clean_isbn}").strip(),
                                "publisher": str(row.get("NOM_EDITORA") or "Editora").strip(),
                                "subject": str(row.get("NOM_GENERO") or "Consignado").strip(),
                                "coverPrice": round(vlr_capa, 2),
                                "discountPct": round(per_desc, 2),
                                "consignedBalance": saldo_consig,
                                "soldInReplenishmentWindow": 0,
                            }
                    api_diagnostic["status"] = "OK"
                    api_diagnostic["itemsReturned"] = consigned_from_api_count
                    api_diagnostic["message"] = f"{consigned_from_api_count} SKUs consignados retornados via API Horus."
            else:
                api_diagnostic["status"] = "NO_GUID"
                api_diagnostic["message"] = "Cliente não possui ID_GUID B2B cadastrado no Horus."
            await h_client.close()
        except Exception as e:
            api_diagnostic["status"] = "ERROR"
            api_diagnostic["message"] = str(e)
            log.warning(f"[DBM Desk] Aviso ao consultar consignado analítico na API Horus p/ cliente {customer.id}: {e}")

    # ── PASSO 1B: Fallback Automático de Consignação via Banco de Dados (VW_ITENS_CONSIGNACAO) ──
    if consigned_from_api_count == 0 and sql_client and cod_cli:
        top_clause = f"TOP ({limit * 2})" if legacy_pagination else ""
        offset_clause = "" if legacy_pagination else f"OFFSET 0 ROWS FETCH NEXT {limit * 2} ROWS ONLY"
        sql_consig = f"""
            SELECT {top_clause}
                V.COD_ITEM AS cod_item,
                RTRIM(LTRIM(ISNULL(I.COD_BARRA_ITEM, ISNULL(I.COD_ISBN_ITEM, CAST(V.COD_ITEM AS VARCHAR))))) AS isbn,
                RTRIM(LTRIM(ISNULL(I.NOM_ITEM, ISNULL(V.NOME_ITEM, CONCAT('Item #', V.COD_ITEM))))) AS nome_item,
                RTRIM(LTRIM(ISNULL(ED.NOM_FANTASIA, ISNULL(ED.NOM_EDITORA, 'Editora')))) AS editora,
                RTRIM(LTRIM(ISNULL(G.NOM_GENERO, 'Geral'))) AS assunto,
                SUM(ISNULL(V.SALDO, 0)) AS saldo_consig,
                MAX(ISNULL(PA.VLR_CAPA, ISNULL(V.VLR_PRECO, 0.0))) AS preco_capa,
                MAX(ISNULL(V.VLR_DESCONTO, %s)) AS per_desconto,
                MAX(ISNULL(S.saldo_disponivel, 0)) AS estoque_atual,
                MAX(ISNULL(I.QTD_ITENS_CAIXA, 12)) AS qtd_caixa
            FROM VW_ITENS_CONSIGNACAO V WITH (NOLOCK)
            LEFT JOIN ITENS_ESTOQUE_GERAL I WITH (NOLOCK) ON I.COD_ITEM = V.COD_ITEM
            LEFT JOIN EDITORA ED WITH (NOLOCK) ON ED.COD_EDITORA = I.COD_EDITORA
            LEFT JOIN TABELA_GENERO G WITH (NOLOCK) ON G.COD_GENERO = I.COD_GENERO
            LEFT JOIN ITENS_ESTPRECO_ATUAL PA WITH (NOLOCK) ON PA.COD_ITEM = V.COD_ITEM
            LEFT JOIN VW_SALDO_ITENS S WITH (NOLOCK) ON S.cod_item = V.COD_ITEM AND S.cod_filial = {cod_filial}
            WHERE V.COD_CLI = %s
              AND ISNULL(V.SALDO, 0) > 0
            GROUP BY
                V.COD_ITEM,
                I.COD_BARRA_ITEM,
                I.COD_ISBN_ITEM,
                I.NOM_ITEM,
                V.NOME_ITEM,
                ED.NOM_FANTASIA,
                ED.NOM_EDITORA,
                G.NOM_GENERO
            ORDER BY SUM(ISNULL(V.SALDO, 0)) DESC
            {offset_clause}
        """
        try:
            c_rows = sql_client.query(sql_consig, (default_disc, cod_cli), max_rows=limit * 2)
            for r in (c_rows or []):
                saldo_c = int(float(r.get("saldo_consig") or 0))
                if saldo_c <= 0:
                    continue
                isbn = str(r.get("isbn") or r.get("cod_item") or "").strip().replace("-", "").replace(" ", "")
                if not isbn or isbn in excluded_set:
                    continue
                cod_it = r.get("cod_item")
                consigned_from_sql_count += 1
                candidates_by_key[isbn] = {
                    "isbn": isbn,
                    "sku": str(cod_it or isbn),
                    "cod_item": int(cod_it) if str(cod_it).isdigit() else None,
                    "title": str(r.get("nome_item") or f"Item #{isbn}").strip(),
                    "publisher": str(r.get("editora") or "Editora").strip(),
                    "subject": str(r.get("assunto") or "Geral").strip(),
                    "coverPrice": round(float(r.get("preco_capa") or 0.0), 2),
                    "discountPct": round(float(r.get("per_desconto") or default_disc), 2),
                    "consignedBalance": saldo_c,
                    "soldInReplenishmentWindow": 0,
                    "stockAvailable": int(float(r.get("estoque_atual") or 0)),
                    "boxQty": max(1, int(r.get("qtd_caixa") or 12)),
                }
            sql_diagnostic["consignmentSource"] = "VW_ITENS_CONSIGNACAO"
            sql_diagnostic["consignedSkusFound"] = consigned_from_sql_count
        except Exception as e:
            log.warning(f"[DBM Desk] Aviso ao buscar consignação via SQL VW_ITENS_CONSIGNACAO: {e}")

    # ── PASSO 2: Histórico de Itens Vendidos / Acertados ao Cliente nos últimos X dias (SQL + BI) ──
    now_dt = datetime.utcnow()
    dt_rep_start = now_dt - timedelta(days=max(1, replenishment_sales_days))

    if sql_client and cod_cli:
        cfop_sales_in = ", ".join(f"'{c}'" for c in (list(CFOP_VENDA_LIST) + list(CFOP_ACERTO_LIST)))
        clean_cfop_expr = "REPLACE(REPLACE(REPLACE(RTRIM(LTRIM(ISNULL(NFI.COD_NATUREZA, NF.COD_NATUREZA))), '.', ''), ',', ''), ' ', '')"
        top_clause = f"TOP ({limit * 2})" if legacy_pagination else ""
        offset_clause = "" if legacy_pagination else f"OFFSET 0 ROWS FETCH NEXT {limit * 2} ROWS ONLY"

        sql_hist = f"""
            SELECT {top_clause}
                NFI.COD_ITEM AS cod_item,
                RTRIM(LTRIM(ISNULL(I.COD_BARRA_ITEM, ISNULL(I.COD_ISBN_ITEM, CAST(NFI.COD_ITEM AS VARCHAR))))) AS isbn,
                RTRIM(LTRIM(ISNULL(I.NOM_ITEM, CONCAT('Item #', NFI.COD_ITEM)))) AS nome_item,
                RTRIM(LTRIM(ISNULL(ED.NOM_FANTASIA, ISNULL(ED.NOM_EDITORA, 'Editora')))) AS editora,
                RTRIM(LTRIM(ISNULL(G.NOM_GENERO, 'Geral'))) AS assunto,
                SUM(ISNULL(NFI.QTD_ITENS, 0)) AS qtd_vendida_x,
                MAX(ISNULL(PA.VLR_CAPA, ISNULL(I.VLR_CAPA, ISNULL(NFI.VLR_BRUTO_ITEM, 0.0)))) AS preco_capa,
                MAX(ISNULL(S.saldo_disponivel, 0)) AS estoque_atual,
                MAX(ISNULL(I.QTD_ITENS_CAIXA, 12)) AS qtd_caixa
            FROM NF_ITENS NFI WITH (NOLOCK)
            INNER JOIN NF_MESTRE NF WITH (NOLOCK)
                ON NF.COD_NF = NFI.COD_NF
                AND NF.COD_FILIAL = NFI.COD_FILIAL
                AND NF.COD_EMPRESA = NFI.COD_EMPRESA
            LEFT JOIN ITENS_ESTOQUE_GERAL I WITH (NOLOCK) ON I.COD_ITEM = NFI.COD_ITEM
            LEFT JOIN EDITORA ED WITH (NOLOCK) ON ED.COD_EDITORA = I.COD_EDITORA
            LEFT JOIN TABELA_GENERO G WITH (NOLOCK) ON G.COD_GENERO = I.COD_GENERO
            LEFT JOIN ITENS_ESTPRECO_ATUAL PA WITH (NOLOCK) ON PA.COD_ITEM = NFI.COD_ITEM
            LEFT JOIN VW_SALDO_ITENS S WITH (NOLOCK) ON S.cod_item = NFI.COD_ITEM AND S.cod_filial = {cod_filial}
            WHERE NF.COD_CLI = %s
              AND ISNULL(NF.SIT_NF, '') NOT IN ('C', 'CAN')
              AND NF.DAT_EMISSAO_NF >= DATEADD(day, -%s, GETDATE())
              AND {clean_cfop_expr} IN ({cfop_sales_in})
            GROUP BY
                NFI.COD_ITEM,
                I.COD_BARRA_ITEM,
                I.COD_ISBN_ITEM,
                I.NOM_ITEM,
                ED.NOM_FANTASIA,
                ED.NOM_EDITORA,
                G.NOM_GENERO
            ORDER BY SUM(ISNULL(NFI.QTD_ITENS, 0)) DESC
            {offset_clause}
        """
        try:
            hist_rows = sql_client.query(sql_hist, (cod_cli, replenishment_sales_days), max_rows=limit * 2)
            for r in (hist_rows or []):
                isbn = str(r.get("isbn") or r.get("cod_item") or "").strip().replace("-", "").replace(" ", "")
                if not isbn or isbn in excluded_set:
                    continue
                qty_v = int(float(r.get("qtd_vendida_x") or 0))
                if qty_v > 0:
                    sold_in_window_count += 1
                    sold_total_units_window += qty_v
                if isbn in candidates_by_key:
                    candidates_by_key[isbn]["soldInReplenishmentWindow"] = max(
                        candidates_by_key[isbn].get("soldInReplenishmentWindow", 0), qty_v
                    )
                    if not candidates_by_key[isbn].get("stockAvailable"):
                        candidates_by_key[isbn]["stockAvailable"] = int(float(r.get("estoque_atual") or 0))
                    if not candidates_by_key[isbn].get("coverPrice") and float(r.get("preco_capa") or 0) > 0:
                        candidates_by_key[isbn]["coverPrice"] = round(float(r.get("preco_capa") or 0), 2)
                    if r.get("assunto"):
                        candidates_by_key[isbn]["subject"] = str(r.get("assunto")).strip()
                else:
                    cod_it = r.get("cod_item")
                    candidates_by_key[isbn] = {
                        "isbn": isbn,
                        "sku": str(cod_it or isbn),
                        "cod_item": int(cod_it) if str(cod_it).isdigit() else None,
                        "title": str(r.get("nome_item") or f"Item #{isbn}").strip(),
                        "publisher": str(r.get("editora") or "Editora").strip(),
                        "subject": str(r.get("assunto") or "Geral").strip(),
                        "coverPrice": round(float(r.get("preco_capa") or 0.0), 2),
                        "discountPct": default_disc,
                        "consignedBalance": 0,
                        "soldInReplenishmentWindow": qty_v,
                        "stockAvailable": int(float(r.get("estoque_atual") or 0)),
                        "boxQty": max(1, int(r.get("qtd_caixa") or 12)),
                    }
            sql_diagnostic["salesSkusFound"] = sold_in_window_count
            sql_diagnostic["salesTotalUnits"] = sold_total_units_window
        except Exception as e:
            log.warning(f"[DBM Desk] Aviso ao buscar vendas de reposição no Horus SQL: {e}")

    # Complementa também com HorusBISale local para os últimos X dias
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
            HorusBISale.sale_date >= dt_rep_start,
            HorusBISale.cfop.in_(list(CFOP_VENDA_LIST) + list(CFOP_ACERTO_LIST))
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
            if not isbn or isbn in excluded_set:
                continue
            qty_x = int(r.sold_x or 0)
            if isbn in candidates_by_key:
                if qty_x > candidates_by_key[isbn].get("soldInReplenishmentWindow", 0):
                    candidates_by_key[isbn]["soldInReplenishmentWindow"] = qty_x
            else:
                sold_in_window_count += 1
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

    # ── PASSO 3: Enriquecer Estoque / Preço / Assunto e Filtrar Estoque > 0 ────
    all_keys = list(candidates_by_key.keys())
    if all_keys and sql_client:
        try:
            for c_start in range(0, len(all_keys), 150):
                chunk = all_keys[c_start:c_start + 150]
                ph = ", ".join(["%s"] * len(chunk))
                sql_enrich = f"""
                    SELECT
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
                    WHERE I.COD_BARRA_ITEM IN ({ph})
                       OR I.COD_ISBN_ITEM IN ({ph})
                """
                e_rows = sql_client.query(sql_enrich, tuple(chunk + chunk), max_rows=300)
                for er in (e_rows or []):
                    k = str(er.get("isbn") or "").strip().replace("-", "").replace(" ", "")
                    if k in candidates_by_key:
                        c_obj = candidates_by_key[k]
                        c_obj["stockAvailable"] = int(float(er.get("estoque") or 0))
                        if float(er.get("preco") or 0) > 0:
                            c_obj["coverPrice"] = round(float(er.get("preco") or 0), 2)
                        if er.get("nome_item"):
                            c_obj["title"] = str(er.get("nome_item")).strip()
                        if er.get("editora"):
                            c_obj["publisher"] = str(er.get("editora")).strip()
                        if er.get("assunto"):
                            c_obj["subject"] = str(er.get("assunto")).strip()
                        c_obj["boxQty"] = max(1, int(er.get("qtd_caixa") or 12))
        except Exception as e:
            log.warning(f"[DBM Desk] Aviso ao enriquecer estoque SQL da reposição: {e}")

    # Complementa estoque/preço com base local prd_product quando necessário
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
            log.warning(f"[DBM Desk] Aviso ao cruzar prd_product na reposição: {e}")

    # Filtra rigorosamente saldo de estoque > 0 (Regra 6) e ordena por Consignado DESC, Vendidos nos últimos X dias DESC
    final_items: list[dict] = []
    for k, c_obj in candidates_by_key.items():
        stock_val = int(c_obj.get("stockAvailable") or 0)
        if stock_val <= 0:
            continue
        sold_x = int(c_obj.get("soldInReplenishmentWindow") or 0)
        final_items.append({
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
            "clientSalesPeriod": sold_x,
            "stockAvailable": stock_val,
            "boxQty": int(c_obj.get("boxQty") or 12),
            "clientSales365d": sold_x,
            "generalSalesPeriod": 0,
            "sourceTab": "REPOSICAO",
            "addedOrigin": None,
            "manualStatus": None,
        })

    final_items.sort(
        key=lambda x: (x.get("consignedBalance", 0), x.get("clientSalesPeriod", 0), x.get("stockAvailable", 0)),
        reverse=True
    )
    final_items = final_items[:limit]

    _enrich_items_with_bi_metrics(
        db=db,
        seller_id=seller_id,
        customer=customer,
        cod_cli=cod_cli,
        items_list=final_items,
        client_sales_days=client_sales_days,
        general_sales_days=general_sales_days,
        sql_client=sql_client,
    )

    return {
        "replenishmentSalesDays": replenishment_sales_days,
        "consignedItemsCount": sum(1 for x in final_items if x.get("consignedBalance", 0) > 0),
        "consignedFromApiCount": consigned_from_api_count,
        "consignedFromSqlCount": consigned_from_sql_count,
        "soldInWindowCount": sum(1 for x in final_items if x.get("clientSalesPeriod", 0) > 0),
        "apiDiagnostic": api_diagnostic,
        "sqlDiagnostic": sql_diagnostic,
        "items": final_items,
    }


@router.get("/proposals-desk/last-operation-items")
async def get_proposals_desk_last_operation_items(
    customer_id: int = Query(..., description="ID do cliente selecionado"),
    operation_type: str = Query("ACERTO", description="ACERTO (CFOP 5113/5114/6113/6114) ou VENDA"),
    exclude_isbns: Optional[str] = Query(None, description="ISBNs separados por vírgula já presentes em outras abas"),
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

    excluded_set: set[str] = set()
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
    cod_filial = int(sql_client.cod_filial) if (sql_client and str(sql_client.cod_filial).isdigit()) else 2

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
                    if clean_isbn in excluded_set:
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
            isbn = str(p.ean_gtin or p.sku or p.id).strip()
            if not isbn or isbn in seen_isbns:
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
                "boxQty": 12,
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
                    "boxQty": 12,
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
    )

    return {
        "totalParsed": len(items_out),
        "source": source_label,
        "items": items_out,
    }


# ── DBM Orçamentos & Propostas (Persistência Isolada DBM) ─────────────────────

class DbmProposalSavePayload(BaseModel):
    id: Optional[int] = None
    company_id: Optional[int] = None
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    customer_corporate_name: Optional[str] = None
    customer_document: Optional[str] = None
    customer_horus_cod_cli: Optional[int] = None
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


class DbmProposalStatusPatchPayload(BaseModel):
    status_id: str
    status_name: str
    status_phase: str
    horus_order_number: Optional[str] = None


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
            DbmProposal.status_name.ilike(term),
            DbmProposal.horus_order_number.ilike(term),
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
        items_out.append({
            "id": p.id,
            "local_id": p.local_id,
            "customer_id": p.customer_id,
            "customer_name": p.customer_name,
            "customer_corporate_name": p.customer_corporate_name or p.customer_name,
            "customer_document": p.customer_document or "",
            "customer_horus_cod_cli": p.customer_horus_cod_cli,
            "status_id": p.status_id,
            "status_name": p.status_name,
            "status_phase": p.status_phase,
            "total_titles": p.total_titles or 0,
            "total_requested_qty": p.total_requested_qty or 0,
            "total_approved_qty": p.total_approved_qty or 0,
            "total_cover_value": round(float(p.total_cover_value or 0.0), 2),
            "total_net_value": round(float(p.total_net_value or 0.0), 2),
            "average_discount": round(float(p.average_discount or 0.0), 2),
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
    Retorna os dados completos de um orçamento/proposta do DBM (incluindo os itens da grade).
    """
    from app.models.dbm_proposal import DbmProposal

    seller_id = _resolve_seller_id(current_user, company_id)
    prop = db.query(DbmProposal).filter(
        DbmProposal.id == proposal_id,
        DbmProposal.company_id == seller_id
    ).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Orçamento não encontrado.")

    return {
        "id": prop.id,
        "local_id": prop.local_id,
        "customer_id": prop.customer_id,
        "customer_name": prop.customer_name,
        "customer_corporate_name": prop.customer_corporate_name or prop.customer_name,
        "customer_document": prop.customer_document or "",
        "customer_horus_cod_cli": prop.customer_horus_cod_cli,
        "status_id": prop.status_id,
        "status_name": prop.status_name,
        "status_phase": prop.status_phase,
        "total_titles": prop.total_titles or 0,
        "total_requested_qty": prop.total_requested_qty or 0,
        "total_approved_qty": prop.total_approved_qty or 0,
        "total_cover_value": round(float(prop.total_cover_value or 0.0), 2),
        "total_net_value": round(float(prop.total_net_value or 0.0), 2),
        "average_discount": round(float(prop.average_discount or 0.0), 2),
        "global_discount": round(float(prop.global_discount or 0.0), 2),
        "min_order_value": round(float(prop.min_order_value or 0.0), 2),
        "horus_order_number": prop.horus_order_number,
        "notes": prop.notes,
        "items": prop.items_json or [],
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
    Salva ou atualiza um orçamento/proposta da Mesa DBM.
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

    existing = None
    if payload.id and payload.id > 0:
        existing = db.query(DbmProposal).filter(
            DbmProposal.id == payload.id,
            DbmProposal.company_id == seller_id
        ).first()

    user_id = getattr(current_user, "id", None) if not isinstance(current_user, dict) else current_user.get("id")

    if existing:
        existing.customer_id = cust.id if cust else payload.customer_id
        existing.customer_name = cust_name
        existing.customer_corporate_name = cust_corp
        existing.customer_document = cust_doc
        existing.customer_horus_cod_cli = cust_cod_cli
        existing.status_id = payload.status_id
        existing.status_name = payload.status_name
        existing.status_phase = payload.status_phase
        existing.total_titles = int(payload.total_titles or 0)
        existing.total_requested_qty = int(payload.total_requested_qty or 0)
        existing.total_approved_qty = int(payload.total_approved_qty or 0)
        existing.total_cover_value = round(float(payload.total_cover_value or 0.0), 2)
        existing.total_net_value = round(float(payload.total_net_value or 0.0), 2)
        existing.average_discount = round(float(payload.average_discount or 0.0), 2)
        existing.global_discount = round(float(payload.global_discount or 0.0), 2)
        existing.min_order_value = round(float(payload.min_order_value or 0.0), 2)
        if payload.horus_order_number is not None:
            existing.horus_order_number = payload.horus_order_number
        if payload.notes is not None:
            existing.notes = payload.notes
        existing.items_json = payload.items or []
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
            status_id=payload.status_id,
            status_name=payload.status_name,
            status_phase=payload.status_phase,
            total_titles=int(payload.total_titles or 0),
            total_requested_qty=int(payload.total_requested_qty or 0),
            total_approved_qty=int(payload.total_approved_qty or 0),
            total_cover_value=round(float(payload.total_cover_value or 0.0), 2),
            total_net_value=round(float(payload.total_net_value or 0.0), 2),
            average_discount=round(float(payload.average_discount or 0.0), 2),
            global_discount=round(float(payload.global_discount or 0.0), 2),
            min_order_value=round(float(payload.min_order_value or 0.0), 2),
            horus_order_number=payload.horus_order_number,
            notes=payload.notes,
            items_json=payload.items or [],
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




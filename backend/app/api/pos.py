import io
import csv
import os
import json
import uuid
import tempfile
import time
import asyncio
import logging
import hashlib
from datetime import datetime, date, timedelta, timezone
from typing import Optional, List

BRT_TZ = timezone(timedelta(hours=-3))


def _to_brt(dt: Optional[datetime]) -> Optional[datetime]:
    """Converte qualquer datetime (UTC ou com offset) para o Horário Oficial de Brasília (UTC-3)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=BRT_TZ)
    return dt.astimezone(BRT_TZ)
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status, Response
from starlette.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_
import openpyxl
from openpyxl.utils import get_column_letter
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from fpdf import FPDF
from fpdf.enums import XPos, YPos

from app.db.session import get_db
from app.core import dependencies
from app.core.utils import parse_horus_price
from app.core.upload_security import validate_file_size_and_extension, read_file_safely
from app.models import user as user_models
from app.models.company import Company
from app.models.company_settings import CompanySettings
from app.models.product import Product
from app.models.customer import Customer
from app.models.seller_branch import SellerBranch
from app.models.financial import FinancialCategory, FinancialTransaction, FinancialInstallment
from app.integrators.horus_product_search import HorusProductSearch
from app.models.pos import (
    POSSession,
    POSSessionProduct,
    POSSale,
    POSSaleItem,
    POSSessionStatus,
    POSCatalogSource,
    POSPaymentMethod,
)
from app.schemas.pos import (
    POSSessionCreate,
    POSSessionCloseRequest,
    POSSessionReopenRequest,
    POSSaleCancelRequest,
    POSSessionResponse,
    POSSessionProductOut,
    POSSessionProductsListResponse,
    POSSaleCreate,
    POSSyncBatchRequest,
    POSSyncBatchResponse,
    POSHorusSyncSendRequest,
    POSHorusSyncDefaultsUpdateRequest,
)
from sqlalchemy.orm.attributes import flag_modified


router = APIRouter(prefix="/companies/{company_id}/pos", tags=["pos-omnichannel"])
logger = logging.getLogger("cronuz.pos")


def _assert_pos_access(current_user: user_models.User, company_id: int, db: Session) -> Company:
    raw_type = getattr(current_user, "type", None) or getattr(current_user, "role", None)
    user_type = (getattr(raw_type, "value", None) or str(raw_type)).upper()
    is_master = "MASTER" in user_type

    if not is_master and getattr(current_user, "company_id", None) != company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso restrito a esta empresa.")

    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa não encontrada.")

    # [REQUISITO] A tela do PDV só pode ser liberada para quem está com o módulo PDV ativo no cadastro do seller
    if not is_master and not getattr(company, "module_pdv", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Módulo de Ponto de Venda (PDV) não está ativo no cadastro deste seller. Solicite a liberação ao administrador."
        )

    return company


def _parse_payment_breakdown(payment_method: Optional[str], payment_details_raw: Optional[str], total_amount: float):
    """
    Decompõe uma venda em suas formas reais de pagamento (incluindo MISTO e parcelas no crédito).
    Retorna:
      - breakdown_map: dict {'DINHEIRO': float, 'PIX': float, 'DEBITO': float, 'CREDITO': float, 'OUTROS': float}
      - display_label: str (ex: 'Crédito (3x)', 'Misto (Crédito 2x: R$ 300,00 | Dinheiro: R$ 147,60)')
      - cash_amount: float (fração em dinheiro que entra na gaveta física)
      - installments: Optional[int] (número de parcelas caso crédito)
    """
    method = (payment_method or "DINHEIRO").upper().strip()
    breakdown_map = {"DINHEIRO": 0.0, "PIX": 0.0, "DEBITO": 0.0, "CREDITO": 0.0, "OUTROS": 0.0}
    cash_amount = 0.0
    installments = None
    display_label = method

    details = {}
    if payment_details_raw:
        try:
            if isinstance(payment_details_raw, str) and payment_details_raw.strip().startswith("{"):
                details = json.loads(payment_details_raw)
            elif isinstance(payment_details_raw, dict):
                details = payment_details_raw
        except Exception:
            details = {}

    if method == "CREDITO":
        inst = details.get("installments") or details.get("parcelas")
        try:
            installments = int(inst) if inst else 1
        except Exception:
            installments = 1
        breakdown_map["CREDITO"] = total_amount
        display_label = f"Crédito ({installments}x)" if installments > 1 else "Crédito"

    elif method == "DINHEIRO":
        breakdown_map["DINHEIRO"] = total_amount
        cash_amount = total_amount
        display_label = "Dinheiro"

    elif method in ("PIX", "DEBITO"):
        breakdown_map[method] = total_amount
        display_label = method.capitalize() if method == "DEBITO" else "PIX"

    elif method == "MISTO":
        payments_list = details.get("payments")
        parts_text = []
        parsed_sum = 0.0
        if isinstance(payments_list, list) and len(payments_list) > 0:
            for p in payments_list:
                m_sub = str(p.get("method") or "OUTROS").upper().strip()
                a_sub = float(p.get("amount") or 0.0)
                parsed_sum += a_sub
                inst_sub = p.get("installments")
                try:
                    inst_sub = int(inst_sub) if inst_sub else 1
                except Exception:
                    inst_sub = 1

                if m_sub in breakdown_map:
                    breakdown_map[m_sub] += a_sub
                else:
                    breakdown_map["OUTROS"] += a_sub

                if m_sub == "DINHEIRO":
                    cash_amount += a_sub
                    parts_text.append(f"Dinheiro: R$ {a_sub:,.2f}")
                elif m_sub == "CREDITO":
                    if inst_sub > 1:
                        parts_text.append(f"Crédito {inst_sub}x: R$ {a_sub:,.2f}")
                    else:
                        parts_text.append(f"Crédito: R$ {a_sub:,.2f}")
                elif m_sub == "DEBITO":
                    parts_text.append(f"Débito: R$ {a_sub:,.2f}")
                elif m_sub == "PIX":
                    parts_text.append(f"PIX: R$ {a_sub:,.2f}")
                else:
                    parts_text.append(f"{m_sub}: R$ {a_sub:,.2f}")
        else:
            din = float(details.get("dinheiro") or 0.0)
            pix = float(details.get("pix") or 0.0)
            car = float(details.get("cartao") or 0.0)
            if din > 0:
                breakdown_map["DINHEIRO"] += din
                cash_amount += din
                parts_text.append(f"Dinheiro: R$ {din:,.2f}")
            if pix > 0:
                breakdown_map["PIX"] += pix
                parts_text.append(f"PIX: R$ {pix:,.2f}")
            if car > 0:
                breakdown_map["CREDITO"] += car
                parts_text.append(f"Cartão: R$ {car:,.2f}")
            parsed_sum = din + pix + car

        if parts_text:
            display_label = f"Misto ({' | '.join(parts_text)})"
        else:
            display_label = "Misto"
            breakdown_map["OUTROS"] = total_amount

    else:
        breakdown_map["OUTROS"] = total_amount
        display_label = method

    return breakdown_map, display_label, cash_amount, installments


@router.get("/config")
def get_pos_config(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    """
    Retorna as configurações do PDV para a empresa:
    - module_pdv: se o módulo está ativo no cadastro do seller
    - pdv_allow_out_of_stock: se permite vender sem validar saldo
    - validate_stock: True se deve validar saldo de estoque nas vendas
    """
    company = _assert_pos_access(current_user, company_id, db)
    from app.models.company_settings import CompanySettings
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    allow_out_of_stock = bool(getattr(settings, "pdv_allow_out_of_stock", False)) if settings else False
    max_installments = int(getattr(settings, "pdv_max_installments", 12) or 12) if settings else 12
    min_installment_amount = float(getattr(settings, "pdv_min_installment_amount", 5.0) or 5.0) if settings else 5.0
    has_supervisor_password = bool(
        settings and getattr(settings, "pdv_supervisor_password", None) and str(settings.pdv_supervisor_password).strip()
    )
    supervisor_password_hash = (
        hashlib.sha256(str(settings.pdv_supervisor_password).strip().encode("utf-8")).hexdigest()
        if has_supervisor_password
        else None
    )

    return {
        "company_id": company_id,
        "module_pdv": getattr(company, "module_pdv", False),
        "module_cafeteria": bool(getattr(company, "module_cafeteria", False)),
        "pdv_allow_out_of_stock": allow_out_of_stock,
        "validate_stock": not allow_out_of_stock,
        "pdv_max_installments": max_installments,
        "pdv_min_installment_amount": min_installment_amount,
        "has_supervisor_password": has_supervisor_password,
        "supervisor_password_hash": supervisor_password_hash,
        "horus_legacy_pagination": bool(getattr(settings, "horus_legacy_pagination", False)) if settings else False,
        "pdv_desktop_license_enabled": bool(getattr(settings, "pdv_desktop_license_enabled", False)) if settings else False,
        "pdv_desktop_expires_at": settings.pdv_desktop_expires_at.isoformat() if (settings and getattr(settings, "pdv_desktop_expires_at", None)) else None,
        "pdv_desktop_license_key": getattr(settings, "pdv_desktop_license_key", None) if settings else None,
        "pdv_horus_range_sync_enabled": bool(getattr(settings, "pdv_horus_range_sync_enabled", False)) if settings else False,
    }


# ─────────────────────────────────────────────────────────────────────────────
# SESSÕES DE PDV (Caixas / Eventos)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/sessions", response_model=List[POSSessionResponse])
def list_pos_sessions(
    company_id: int,
    status_filter: Optional[str] = Query(None, alias="status"),
    include_deleted: bool = Query(False, description="Incluir sessões excluídas (lixeira)"),
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    """Lista as sessões de PDV da empresa (abertas, fechadas ou excluídas na lixeira)."""
    _assert_pos_access(current_user, company_id, db)

    query = db.query(POSSession).filter(POSSession.company_id == company_id)
    if status_filter:
        query = query.filter(POSSession.status == status_filter.upper())
    elif not include_deleted:
        query = query.filter(POSSession.status != POSSessionStatus.DELETED.value)

    sessions = query.order_by(desc(POSSession.opened_at)).all()
    return sessions


@router.post("/sessions", response_model=POSSessionResponse)
def create_pos_session(
    company_id: int,
    payload: POSSessionCreate,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    """Abre uma nova sessão ou evento de PDV."""
    _assert_pos_access(current_user, company_id, db)

    now_str = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    code = f"PDV-{company_id}-{now_str}"

    cust_name = payload.customer_name
    cust_doc = payload.customer_document
    if payload.customer_id and not cust_name:
        cust = db.query(Customer).filter(
            Customer.id == payload.customer_id,
            Customer.company_id == company_id
        ).first()
        if cust:
            cust_name = cust.name or cust.corporate_name
            cust_doc = cust.document

    new_session = POSSession(
        company_id=company_id,
        user_id=current_user.id,
        code=code,
        title=payload.title,
        status=POSSessionStatus.OPEN.value,
        catalog_source=payload.catalog_source or POSCatalogSource.GENERAL.value,
        source_reference=payload.source_reference,
        branch_id=payload.branch_id,
        validate_stock=payload.validate_stock if payload.validate_stock is not None else True,
        initial_cash_amount=payload.initial_cash_amount or 0.00,
        customer_id=payload.customer_id,
        customer_name=cust_name,
        customer_document=cust_doc,
        notes=payload.notes,
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    return new_session


@router.get("/sessions/{session_id}")
def get_pos_session(
    company_id: int,
    session_id: int,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    """Retorna detalhes de uma sessão com resumo de vendas e controle de caixa."""
    _assert_pos_access(current_user, company_id, db)

    session = db.query(POSSession).filter(
        POSSession.id == session_id,
        POSSession.company_id == company_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sessão não encontrada.")

    # Breakdown consolidado por método de pagamento real (rateando MISTO e parcelas)
    sales = db.query(POSSale).filter(
        POSSale.session_id == session_id,
        POSSale.status == "COMPLETED"
    ).all()

    by_payment = {
        "DINHEIRO": {"count": 0, "total": 0.0},
        "PIX": {"count": 0, "total": 0.0},
        "DEBITO": {"count": 0, "total": 0.0},
        "CREDITO": {"count": 0, "total": 0.0},
        "OUTROS": {"count": 0, "total": 0.0},
    }
    for s in sales:
        b_map, _, _, _ = _parse_payment_breakdown(s.payment_method, s.payment_details, float(s.total_amount or 0.0))
        for m_key, val in b_map.items():
            if val > 0:
                if m_key not in by_payment:
                    by_payment[m_key] = {"count": 0, "total": 0.0}
                by_payment[m_key]["count"] += 1
                by_payment[m_key]["total"] = round(by_payment[m_key]["total"] + val, 2)

    return {
        "session": {
            "id": session.id,
            "code": session.code,
            "title": session.title,
            "status": session.status,
            "catalog_source": session.catalog_source,
            "source_reference": session.source_reference,
            "branch_id": session.branch_id,
            "branch_name": session.branch_name,
            "validate_stock": bool(session.validate_stock),
            "initial_cash_amount": float(session.initial_cash_amount or 0),
            "closed_cash_amount": float(session.closed_cash_amount) if session.closed_cash_amount is not None else None,
            "expected_cash_amount": float(session.expected_cash_amount) if session.expected_cash_amount is not None else None,
            "cash_difference": float(session.cash_difference) if session.cash_difference is not None else None,
            "closing_notes": session.closing_notes,
            "closed_by_user_id": session.closed_by_user_id,
            "customer_id": session.customer_id,
            "customer_name": session.customer_name,
            "customer_document": session.customer_document,
            "total_sales_count": session.total_sales_count,
            "total_sales_amount": float(session.total_sales_amount or 0),
            "opened_at": session.opened_at.isoformat() if session.opened_at else None,
            "closed_at": session.closed_at.isoformat() if session.closed_at else None,
            "notes": session.notes,
        },
        "by_payment_method": by_payment,
    }


@router.get("/sessions/{session_id}/close-summary")
def get_session_close_summary(
    company_id: int,
    session_id: int,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    """Retorna o resumo financeiro da sessão para conferência prévia do fechamento de caixa."""
    _assert_pos_access(current_user, company_id, db)
    session = db.query(POSSession).filter(
        POSSession.id == session_id,
        POSSession.company_id == company_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sessão não encontrada.")

    sales = db.query(POSSale).filter(
        POSSale.session_id == session_id,
        POSSale.status == "COMPLETED"
    ).all()

    by_method = {
        "DINHEIRO": 0.0,
        "PIX": 0.0,
        "DEBITO": 0.0,
        "CREDITO": 0.0,
        "OUTROS": 0.0,
    }
    total_sales_amount = 0.0
    cash_sales = 0.0
    for s in sales:
        amt = float(s.total_amount or 0.0)
        total_sales_amount += amt
        b_map, _, c_amt, _ = _parse_payment_breakdown(s.payment_method, s.payment_details, amt)
        cash_sales += c_amt
        for m_key, val in b_map.items():
            if m_key in by_method:
                by_method[m_key] = round(by_method[m_key] + val, 2)
            else:
                by_method["OUTROS"] = round(by_method.get("OUTROS", 0.0) + val, 2)

    initial_cash = float(session.initial_cash_amount or 0.0)
    expected_cash = round(initial_cash + cash_sales, 2)

    return {
        "session_id": session.id,
        "title": session.title,
        "code": session.code,
        "status": session.status,
        "opened_at": session.opened_at.isoformat() if session.opened_at else None,
        "closed_at": session.closed_at.isoformat() if session.closed_at else None,
        "initial_cash_amount": initial_cash,
        "cash_sales_amount": round(cash_sales, 2),
        "expected_cash_amount": expected_cash,
        "sales_count": len(sales),
        "total_sales_amount": round(total_sales_amount, 2),
        "by_payment_method": by_method,
        "closed_cash_amount": float(session.closed_cash_amount) if session.closed_cash_amount is not None else None,
        "cash_difference": float(session.cash_difference) if session.cash_difference is not None else None,
        "closing_notes": session.closing_notes,
    }


@router.put("/sessions/{session_id}/close", response_model=POSSessionResponse)
def close_pos_session(
    company_id: int,
    session_id: int,
    payload: Optional[POSSessionCloseRequest] = None,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    """Fecha a sessão de PDV registrando apuração de gaveta e valores do fechamento de caixa."""
    _assert_pos_access(current_user, company_id, db)

    session = db.query(POSSession).filter(
        POSSession.id == session_id,
        POSSession.company_id == company_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sessão não encontrada.")

    # Total em dinheiro físico apurado nas vendas concluídas (incluindo frações em dinheiro de vendas mistas)
    sales = db.query(POSSale).filter(
        POSSale.session_id == session_id,
        POSSale.status == "COMPLETED"
    ).all()
    cash_sales_total = 0.0
    for s in sales:
        _, _, c_amt, _ = _parse_payment_breakdown(s.payment_method, s.payment_details, float(s.total_amount or 0.0))
        cash_sales_total += c_amt

    initial_cash = float(session.initial_cash_amount or 0.0)
    expected_cash = round(initial_cash + cash_sales_total, 2)
    session.expected_cash_amount = expected_cash

    if payload and payload.closed_cash_amount is not None:
        session.closed_cash_amount = payload.closed_cash_amount
        session.cash_difference = round(float(payload.closed_cash_amount) - expected_cash, 2)
    if payload and payload.closing_notes is not None:
        session.closing_notes = payload.closing_notes.strip() or None

    session.closed_by_user_id = current_user.id
    session.status = POSSessionStatus.CLOSED.value
    session.closed_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return session


@router.put("/sessions/{session_id}/reopen", response_model=POSSessionResponse)
def reopen_pos_session(
    company_id: int,
    session_id: int,
    payload: POSSessionReopenRequest,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    """Reabre uma sessão de PDV fechada mediante validação da Senha do Supervisor configurada pela empresa."""
    _assert_pos_access(current_user, company_id, db)

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    configured_password = (getattr(settings, "pdv_supervisor_password", None) or "").strip() if settings else ""
    if not configured_password:
        raise HTTPException(
            status_code=400,
            detail="A Senha do Supervisor ainda não foi configurada. Acesse Configurações → Frente de Caixa (PDV) para defini-la.",
        )

    provided_password = (payload.supervisor_password or "").strip()
    if provided_password != configured_password:
        raise HTTPException(
            status_code=403,
            detail="Senha do supervisor incorreta. A reabertura da sessão não foi autorizada.",
        )

    session = db.query(POSSession).filter(
        POSSession.id == session_id,
        POSSession.company_id == company_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sessão não encontrada.")

    session.status = POSSessionStatus.OPEN.value
    session.closed_at = None
    session.closed_by_user_id = None
    db.commit()
    db.refresh(session)
    return session


@router.put("/sessions/{session_id}/delete", response_model=POSSessionResponse)
def delete_pos_session(
    company_id: int,
    session_id: int,
    payload: POSSessionReopenRequest,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    """
    Exclui logicamente (Soft Delete -> status DELETED) uma sessão de PDV mediante Senha do Supervisor.
    As vendas ativas da sessão são estornadas (estoque devolvido e financeiro cancelado), mas o registro
    da sessão permanece preservado na lixeira para auditoria ou eventual restauração.
    """
    _assert_pos_access(current_user, company_id, db)

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    configured_password = (getattr(settings, "pdv_supervisor_password", None) or "").strip() if settings else ""
    if not configured_password:
        raise HTTPException(
            status_code=400,
            detail="A Senha do Supervisor ainda não foi configurada. Acesse Configurações → Frente de Caixa (PDV) para defini-la.",
        )

    provided_password = (payload.supervisor_password or "").strip()
    if provided_password != configured_password:
        raise HTTPException(
            status_code=403,
            detail="Senha do supervisor incorreta. A exclusão da sessão não foi autorizada.",
        )

    session = db.query(POSSession).filter(
        POSSession.id == session_id,
        POSSession.company_id == company_id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sessão não encontrada.")

    # Estorna vendas ativas vinculadas à sessão caso existam
    active_sales = db.query(POSSale).filter(
        POSSale.session_id == session_id,
        POSSale.company_id == company_id,
        POSSale.status == "COMPLETED",
    ).all()
    for s in active_sales:
        _revert_completed_pos_sale(db, s, reason="Sessão excluída pelo supervisor")

    session.status = POSSessionStatus.DELETED.value
    session.closed_at = datetime.utcnow()
    session.closed_by_user_id = current_user.id
    db.commit()
    db.refresh(session)
    return session


@router.get("/branches")
def list_pos_branches(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    """Lista as filiais ativas do seller disponíveis para vincular à sessão do PDV."""
    _assert_pos_access(current_user, company_id, db)
    branches = (
        db.query(SellerBranch)
        .filter(
            SellerBranch.company_id == company_id,
            SellerBranch.active == True,
        )
        .order_by(SellerBranch.nome)
        .all()
    )
    return [
        {
            "id": b.id,
            "nome": b.nome,
            "cod_empresa": b.cod_empresa,
            "cod_filial": b.cod_filial,
            "cod_local": b.cod_local,
            "active": b.active,
        }
        for b in branches
    ]


@router.get("/realtime-search")
async def realtime_search_horus(
    company_id: int,
    term: str = Query(..., description="Termo de busca (ISBN, Código de Barras, Código Interno ou Nome)"),
    session_id: Optional[int] = Query(None, description="ID da sessão do PDV"),
    branch_id: Optional[int] = Query(None, description="ID da filial específica para saldo"),
    search_option: Optional[str] = Query(None, description="BARRAS_ISBN | NOME | COD_ITEM"),
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    """
    Busca em tempo real no Horus via Busca_Acervo (sem necessidade de ID_GUID)
    e consulta o saldo na filial selecionada para a sessão de PDV.
    """
    _assert_pos_access(current_user, company_id, db)

    clean_term = term.strip()
    if not clean_term:
        return {"items": [], "total": 0}

    # Resolve filial a partir da sessão ou parâmetro direto
    branch: Optional[SellerBranch] = None
    if branch_id:
        branch = db.query(SellerBranch).filter(
            SellerBranch.id == branch_id,
            SellerBranch.company_id == company_id,
            SellerBranch.active == True
        ).first()
    elif session_id:
        session_obj = db.query(POSSession).filter(
            POSSession.id == session_id,
            POSSession.company_id == company_id
        ).first()
        if session_obj and session_obj.branch_id:
            branch = db.query(SellerBranch).filter(
                SellerBranch.id == session_obj.branch_id,
                SellerBranch.company_id == company_id,
                SellerBranch.active == True
            ).first()

    # Determina search_option se não fornecida
    sanitized_term = clean_term
    digits_only = "".join(ch for ch in clean_term if ch.isdigit())
    if not search_option:
        if digits_only and len(digits_only) >= 7 and len(clean_term) <= len(digits_only) + 4:
            # Código de barras / ISBN (com ou sem hífens)
            search_option = "BARRAS_ISBN"
            sanitized_term = digits_only
        elif clean_term.isdigit() and len(clean_term) <= 6:
            search_option = "COD_ITEM"
        else:
            search_option = "NOME"

    # URL base de capas (primária e secundária)
    settings = db.query(CompanySettings).filter(
        CompanySettings.company_id == company_id
    ).first()
    cover_base_url = settings.cover_image_base_url if settings else None
    cover_secondary_base_url = settings.cover_image_secondary_base_url if settings else None

    try:
        client = HorusProductSearch(db, company_id)
    except Exception as e:
        logger.warning(f"Erro ao instanciar HorusProductSearch: {e}")
        raise HTTPException(status_code=400, detail=f"Configuração do Horus indisponível: {str(e)}")

    try:
        raw = await client.busca_acervo(
            term=sanitized_term,
            search_option=search_option,
            limit=limit,
        )
    except Exception as e:
        logger.error(f"Erro na consulta ao Horus Busca_Acervo: {e}")
        await client.close()
        raise HTTPException(status_code=502, detail=f"Erro ao consultar Horus: {str(e)}")

    # Fallback se não encontrou e pode ser nome
    if not raw or (isinstance(raw, dict) and (raw.get("Falha") or raw.get("FALHA") == "S")):
        if search_option == "COD_ITEM":
            try:
                raw = await client.busca_acervo(term=clean_term, search_option="NOME", limit=limit)
            except Exception:
                pass
        elif search_option == "BARRAS_ISBN" and not clean_term.isdigit():
            try:
                raw = await client.busca_acervo(term=clean_term, search_option="NOME", limit=limit)
            except Exception:
                pass

    raw_items: List[dict] = []
    if isinstance(raw, list):
        for it in raw:
            if isinstance(it, dict) and not (it.get("Falha") or it.get("FALHA") == "S"):
                raw_items.append(it)
    elif isinstance(raw, dict) and not (raw.get("Falha") or raw.get("FALHA") == "S"):
        raw_items.append(raw)

    if not raw_items:
        await client.close()
        return {
            "items": [],
            "total": 0,
            "branch_id": branch.id if branch else None,
            "branch_name": branch.nome if branch else None,
        }

    # Consulta de saldo da filial selecionada em paralelo com timeout individual
    async def _fetch_stock(cod_item: Optional[int]) -> float:
        if not branch or not cod_item or not branch.cod_empresa or not branch.cod_filial:
            return 0.0
        try:
            stock_data = await asyncio.wait_for(
                client.busca_estoque_filial(
                    cod_item=cod_item,
                    cod_empresa=branch.cod_empresa,
                    cod_filial=branch.cod_filial,
                ),
                timeout=5.0
            )
            if isinstance(stock_data, list):
                total_saldo = 0.0
                for loc in stock_data:
                    if isinstance(loc, dict):
                        saldo_val = loc.get("SALDO_DISPONIVEL") or loc.get("QTD_SALDO") or 0.0
                        try:
                            total_saldo += float(saldo_val)
                        except (ValueError, TypeError):
                            pass
                return total_saldo
            elif isinstance(stock_data, dict):
                saldo_val = stock_data.get("SALDO_DISPONIVEL") or stock_data.get("QTD_SALDO") or 0.0
                try:
                    return float(saldo_val)
                except (ValueError, TypeError):
                    return 0.0
            return 0.0
        except Exception as stock_err:
            logger.debug(f"Falha ao consultar saldo do item {cod_item} na filial: {stock_err}")
            return 0.0

    stocks = []
    try:
        if branch:
            stocks = await asyncio.gather(*[_fetch_stock(it.get("COD_ITEM")) for it in raw_items])
        else:
            stocks = [
                float(it.get("SALDO_GERAL") or it.get("QTD_SALDO") or it.get("SALDO_DISPONIVEL") or 0.0)
                for it in raw_items
            ]
    finally:
        await client.close()

    formatted_items = []
    for idx, it in enumerate(raw_items):
        cod_barra = str(it.get("COD_BARRA_ITEM") or it.get("BARRAS_ISBN") or it.get("COD_ITEM") or "").strip()
        cod_item = it.get("COD_ITEM")
        title = it.get("NOM_ITEM") or "Produto sem título"
        publisher = it.get("NOM_EDITORA") or it.get("EDITORA") or ""
        price_val = (
            it.get("VLR_CAPA")
            or it.get("PRECO")
            or it.get("VLR_ITEM")
            or it.get("PRECO_TABELA")
            or it.get("PRECO_VENDA")
            or it.get("PRECO_CAPA")
            or it.get("VLR_LIQUIDO")
            or 0.0
        )
        price = parse_horus_price(price_val)

        stock_val = stocks[idx] if idx < len(stocks) else 0.0

        cover_url = None
        cover_secondary_url = None
        if cod_barra:
            if cover_base_url:
                base = cover_base_url.rstrip("/")
                cover_url = f"{base}/{cod_barra}.jpg"
            if cover_secondary_base_url:
                sec_base = cover_secondary_base_url.rstrip("/")
                cover_secondary_url = f"{sec_base}/{cod_barra}.jpg"
            if not cover_url and cover_secondary_url:
                cover_url = cover_secondary_url

        formatted_items.append({
            "barcode": cod_barra,
            "sku": str(cod_item) if cod_item else cod_barra,
            "title": title,
            "publisher": publisher,
            "price": price,
            "stock": stock_val,
            "horus_item_code": str(cod_item) if cod_item else None,
            "cover_url": cover_url,
            "cover_secondary_url": cover_secondary_url,
            "source": "HORUS_REALTIME",
        })

    return {
        "items": formatted_items,
        "total": len(formatted_items),
        "branch_id": branch.id if branch else None,
        "branch_name": branch.nome if branch else None,
    }


@router.get("/sessions/{session_id}/products", response_model=POSSessionProductsListResponse)
def get_session_products(
    company_id: int,
    session_id: int,
    page: int = Query(1, ge=1, description="Número da página"),
    limit: Optional[int] = Query(None, ge=1, le=5000, description="Tamanho da página para download rápido e seguro"),
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    """
    Retorna os produtos atrelados a esta sessão específica de PDV.
    Utilizado para carregar/sincronizar instantaneamente o catálogo no mobile ou desktop.
    Suporta download paginado em lotes (limit) para altíssima performance no mobile.
    """
    _assert_pos_access(current_user, company_id, db)

    session = db.query(POSSession).filter(
        POSSession.id == session_id,
        POSSession.company_id == company_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sessão não encontrada.")

    base_query = db.query(POSSessionProduct).filter(
        POSSessionProduct.session_id == session_id
    )

    total_count = base_query.count()

    if limit is not None:
        offset = (page - 1) * limit
        total_pages = (total_count + limit - 1) // limit if total_count > 0 else 1
        items = base_query.order_by(POSSessionProduct.id.asc()).offset(offset).limit(limit).all()
    else:
        total_pages = 1
        items = base_query.order_by(POSSessionProduct.title.asc()).all()

    return {
        "session_id": session.id,
        "count": len(items),
        "total": total_count,
        "page": page,
        "total_pages": total_pages,
        "catalog_source": session.catalog_source or "GENERAL",
        "items": [
            {
                "id": it.id,
                "session_id": it.session_id,
                "barcode": it.barcode,
                "sku": it.sku,
                "title": it.title,
                "publisher": it.publisher,
                "price": float(it.price or 0.0),
                "stock": float(it.stock or 0.0),
                "horus_item_code": it.horus_item_code,
                "product_id": it.product_id,
                "source": it.source or "SPREADSHEET",
            }
            for it in items
        ]
    }



# ─────────────────────────────────────────────────────────────────────────────
# CARGA DE CATÁLOGO OFFLINE (Consignação Horus, Acervo ou Local)
# ─────────────────────────────────────────────────────────────────────────────

def _clean_barcode(raw_val) -> str:
    """Normaliza o código de barras/ISBN, tratando números e notações científicas do Excel."""
    if raw_val is None:
        return ""
    val_str = str(raw_val).strip()
    if not val_str:
        return ""
    try:
        if "e" in val_str.lower() or "." in val_str:
            f = float(val_str)
            if f.is_integer():
                return str(int(f))
    except Exception:
        pass
    if val_str.endswith(".0"):
        val_str = val_str[:-2]
    return val_str


def _persist_session_products(
    db: Session,
    session_id: int,
    company_id: int,
    items: list,
    source: str,
    source_ref: Optional[str] = None
):
    """Grava em lote os produtos atrelados à sessão no PostgreSQL."""
    session = db.query(POSSession).filter(
        POSSession.id == session_id,
        POSSession.company_id == company_id
    ).first()
    if not session:
        return

    # Limpa itens anteriores para substituição completa e limpa
    db.query(POSSessionProduct).filter(POSSessionProduct.session_id == session_id).delete()

    bulk_items = [
        POSSessionProduct(
            session_id=session.id,
            company_id=company_id,
            product_id=it.get("product_id"),
            barcode=it["barcode"],
            sku=it.get("sku"),
            title=it["title"],
            publisher=it.get("publisher"),
            price=it["price"],
            stock=it.get("stock", 100.0),
            horus_item_code=it.get("horus_item_code"),
            source=it.get("source", source),
        )
        for it in items
    ]
    if bulk_items:
        db.bulk_save_objects(bulk_items)

    session.catalog_source = source
    if source_ref:
        session.source_reference = source_ref
    session.products_count = len(items)
    db.commit()


@router.get("/catalog-load")
async def load_pos_catalog(
    company_id: int,
    source: str = Query("GENERAL", description="GENERAL, CONSIGNMENT, CRONUZ_CATALOG, HORUS_CATALOG"),
    customer_id: Optional[int] = Query(None),
    cod_ctr: Optional[str] = Query(None),
    session_id: Optional[int] = Query(None),
    limit: int = Query(5000, le=10000),
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    """
    Retorna a lista de produtos formatada para alimentar o banco local IndexedDB do PDV.
    Suporta Contrato de Consignação Horus, Catálogo Cronuz ou Catálogo Geral.
    Regras estritas:
    - Preço zerado (<= 0) é descartado.
    - ISBNs duplicados são ignorados (mantendo apenas o primeiro registro).
    - Retorna resumo com quantidade de duplicados e itens com preço zero.
    """
    company = _assert_pos_access(current_user, company_id, db)

    items = []
    seen_barcodes = set()
    duplicate_items = []
    zero_price_items = []

    # 1. Carga via Contrato de Consignação Horus
    if source == "CONSIGNMENT" and customer_id:
        customer = db.query(Customer).filter(
            Customer.id == customer_id,
            Customer.company_id == company_id
        ).first()
        if not customer or not customer.document:
            raise HTTPException(status_code=400, detail="Cliente inválido ou sem documento para consulta Horus.")

        try:
            from app.integrators.horus_clients import HorusClients
            from app.models.company_settings import CompanySettings

            settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
            id_guid = customer.id_guid or (settings.horus_default_b2b_guid if settings else "")

            client = HorusClients(db, company_id)
            res = await client.get_consignment_details(
                cnpj_destino=company.document,
                cnpj_cliente=customer.document,
                id_guid=id_guid,
                cod_ctr=cod_ctr,
                limit=limit
            )
            await client.close()

            raw_list = res if isinstance(res, list) else ([res] if isinstance(res, dict) else [])
            for row in raw_list:
                if row.get("Falha"):
                    continue
                raw_code = row.get("COD_BARRA_ITEM") or row.get("COD_ITEM") or ""
                barcode = _clean_barcode(raw_code)
                if not barcode:
                    continue

                vlr_str = str(row.get("VLR_PRECO") or row.get("VLR_LIQUIDO") or "0").replace(",", ".")
                try:
                    price = float(vlr_str)
                except Exception:
                    price = 0.0

                # [REQUISITO] Não possibilitar item com preço zerado
                if price <= 0:
                    zero_price_items.append(barcode)
                    continue

                # [REQUISITO] Não deixar item com mesmo ISBN duplicado
                if barcode in seen_barcodes:
                    duplicate_items.append(barcode)
                    continue

                seen_barcodes.add(barcode)
                saldo = float(row.get("SALDO_ITENS") or row.get("QTD_ATENDIDA") or 0)

                items.append({
                    "barcode": barcode,
                    "sku": str(row.get("COD_ITEM") or ""),
                    "title": row.get("NOM_ITEM") or "Item Consignado",
                    "publisher": row.get("NOM_EDITORA") or "",
                    "price": price,
                    "stock": saldo,
                    "horus_item_code": str(row.get("COD_ITEM") or ""),
                    "source": "CONSIGNMENT",
                })
        except Exception as e:
            logger.error("Erro ao carregar consignação Horus: %s", str(e))
            raise HTTPException(status_code=400, detail=f"Erro ao buscar consignação no Horus: {str(e)}")

        if session_id:
            _persist_session_products(
                db, session_id, company_id, items,
                source="CONSIGNMENT",
                source_ref=f"Contrato {cod_ctr or ''}".strip()
            )

        return {
            "source": "CONSIGNMENT",
            "count": len(items),
            "duplicate_count": len(duplicate_items),
            "zero_price_count": len(zero_price_items),
            "duplicate_sample": duplicate_items[:10],
            "zero_price_sample": zero_price_items[:10],
            "items": items,
        }

    # 2. Carga padrão via Catálogo Cronuz
    products = (
        db.query(Product)
        .filter(
            Product.company_id == company_id,
            Product.status == "ACTIVE"
        )
        .order_by(Product.name)
        .limit(limit)
        .all()
    )

    for p in products:
        raw_code = p.ean_gtin or p.sku or p.id
        barcode = _clean_barcode(raw_code)
        if not barcode:
            continue

        price = float(p.promotional_price or p.base_price or 0.0)
        # [REQUISITO] Não possibilitar item com preço zerado
        if price <= 0:
            zero_price_items.append(barcode)
            continue

        # [REQUISITO] Não deixar item com mesmo ISBN duplicado
        if barcode in seen_barcodes:
            duplicate_items.append(barcode)
            continue

        seen_barcodes.add(barcode)

        items.append({
            "barcode": barcode,
            "sku": p.sku or "",
            "title": p.name or "Sem nome",
            "publisher": p.brand or "",
            "price": price,
            "stock": float(p.stock_quantity or 0),
            "product_id": p.id,
            "source": "CRONUZ_CATALOG",
        })

    if session_id:
        _persist_session_products(
            db, session_id, company_id, items,
            source="CRONUZ_CATALOG",
            source_ref="Catálogo Geral Cronuz"
        )

    return {
        "source": "CRONUZ_CATALOG",
        "count": len(items),
        "duplicate_count": len(duplicate_items),
        "zero_price_count": len(zero_price_items),
        "duplicate_sample": duplicate_items[:10],
        "zero_price_sample": zero_price_items[:10],
        "items": items,
    }


# ─────────────────────────────────────────────────────────────────────────────
# IMPORTAÇÃO DE PLANILHA PARA CARGA DE PRODUTOS
# ─────────────────────────────────────────────────────────────────────────────

def _cleanup_old_imports(import_dir: str, max_age_seconds: int = 3600):
    """Remove arquivos temporários de importação de planilhas com mais de 1 hora."""
    try:
        if not os.path.exists(import_dir):
            return
        now = time.time()
        for f in os.listdir(import_dir):
            filepath = os.path.join(import_dir, f)
            if os.path.isfile(filepath) and f.endswith(".json"):
                if now - os.path.getmtime(filepath) > max_age_seconds:
                    try:
                        os.remove(filepath)
                    except Exception:
                        pass
    except Exception:
        pass


@router.post("/upload-spreadsheet")
async def upload_pos_spreadsheet(
    company_id: int,
    file: UploadFile = File(...),
    session_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    """
    Recebe um arquivo Excel (.xlsx) ou CSV com colunas de ISBN/Código de Barras, Título, Preço e Estoque.
    Processa arquivos gigantes (ex: >250 mil linhas / >30MB) com alta performance em streaming
    sem causar estouro de memória (openpyxl read_only=True).
    Suporta paginação por lotes (chunks) para salvar no IndexedDB local do PDV.
    """
    _assert_pos_access(current_user, company_id, db)

    validate_file_size_and_extension(file, category="sheet")

    filename = file.filename.lower()
    suffix = ".xlsx" if filename.endswith(".xlsx") else (".csv" if filename.endswith(".csv") else "")
    if not suffix:
        raise HTTPException(status_code=400, detail="Formato não suportado. Envie um arquivo .xlsx ou .csv")

    import_dir = os.path.join(tempfile.gettempdir(), "pos_imports")
    os.makedirs(import_dir, exist_ok=True)
    _cleanup_old_imports(import_dir)

    # 1. Grava o arquivo enviado em um arquivo temporário no disco para streaming
    content = await read_file_safely(file, max_size_bytes=10 * 1024 * 1024)
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp_path = tmp.name
        tmp.write(content)

    items = []
    seen_barcodes = set()
    duplicate_items = []
    zero_price_items = []

    try:
        if suffix == ".xlsx":
            wb = openpyxl.load_workbook(tmp_path, read_only=True, data_only=True)
            sheet = wb.active
            rows_iter = sheet.iter_rows(values_only=True)

            header_row = next(rows_iter, None)
            if header_row:
                header = [str(col).strip().upper() if col is not None else "" for col in header_row]

                isbn_idx = next((i for i, h in enumerate(header) if any(k in h for k in ["ISBN", "BARRAS", "EAN", "CODIGO"])), 0)
                title_idx = next((i for i, h in enumerate(header) if any(k in h for k in ["TITULO", "NOME", "DESCRICAO", "LIVRO"])), 1)
                price_idx = next((i for i, h in enumerate(header) if any(k in h for k in ["PRECO", "VALOR", "VLR", "PRICE"])), 2)
                stock_idx = next((i for i, h in enumerate(header) if any(k in h for k in ["ESTOQUE", "QTD", "QUANTIDADE", "SALDO"])), -1)

                for r in rows_iter:
                    if not r or len(r) <= isbn_idx or r[isbn_idx] is None:
                        continue
                    barcode = _clean_barcode(r[isbn_idx])
                    if not barcode:
                        continue

                    title = str(r[title_idx]).strip() if len(r) > title_idx and r[title_idx] is not None else "Item Importado"

                    price = 0.0
                    if len(r) > price_idx and r[price_idx] is not None:
                        try:
                            price = float(str(r[price_idx]).replace(",", "."))
                        except Exception:
                            price = 0.0

                    if price <= 0:
                        zero_price_items.append(barcode)
                        continue

                    if barcode in seen_barcodes:
                        duplicate_items.append(barcode)
                        continue

                    seen_barcodes.add(barcode)

                    stock = 100.0
                    if stock_idx >= 0 and len(r) > stock_idx and r[stock_idx] is not None:
                        try:
                            stock = float(str(r[stock_idx]).replace(",", "."))
                        except Exception:
                            stock = 100.0

                    items.append({
                        "barcode": barcode,
                        "sku": barcode,
                        "title": title,
                        "publisher": "Planilha",
                        "price": price,
                        "stock": stock,
                        "source": "SPREADSHEET",
                    })

            wb.close()

        elif suffix == ".csv":
            with open(tmp_path, "r", encoding="utf-8-sig", errors="ignore") as f:
                sample = f.read(4096)
                f.seek(0)
                delimiter = ";" if ";" in sample.splitlines()[0] else ","
                reader = csv.reader(f, delimiter=delimiter)

                header_row = next(reader, None)
                if header_row:
                    header = [c.strip().upper() for c in header_row]
                    isbn_idx = next((i for i, h in enumerate(header) if any(k in h for k in ["ISBN", "BARRAS", "EAN", "CODIGO"])), 0)
                    title_idx = next((i for i, h in enumerate(header) if any(k in h for k in ["TITULO", "NOME", "DESCRICAO"])), 1)
                    price_idx = next((i for i, h in enumerate(header) if any(k in h for k in ["PRECO", "VALOR", "VLR"])), 2)
                    stock_idx = next((i for i, h in enumerate(header) if any(k in h for k in ["ESTOQUE", "QTD", "QUANTIDADE"])), -1)

                    for r in reader:
                        if not r or len(r) <= isbn_idx or not r[isbn_idx].strip():
                            continue
                        barcode = _clean_barcode(r[isbn_idx])
                        if not barcode:
                            continue

                        title = r[title_idx].strip() if len(r) > title_idx and r[title_idx] else "Item Importado"
                        price = 0.0
                        if len(r) > price_idx and r[price_idx]:
                            try:
                                price = float(r[price_idx].replace(",", "."))
                            except Exception:
                                price = 0.0

                        if price <= 0:
                            zero_price_items.append(barcode)
                            continue

                        if barcode in seen_barcodes:
                            duplicate_items.append(barcode)
                            continue

                        seen_barcodes.add(barcode)

                        stock = 100.0
                        if stock_idx >= 0 and len(r) > stock_idx and r[stock_idx]:
                            try:
                                stock = float(r[stock_idx].replace(",", "."))
                            except Exception:
                                stock = 100.0

                        items.append({
                            "barcode": barcode,
                            "sku": barcode,
                            "title": title,
                            "publisher": "Planilha",
                            "price": price,
                            "stock": stock,
                            "source": "SPREADSHEET",
                        })
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass

    upload_id = str(uuid.uuid4())
    total_count = len(items)

    # Cacheia o resultado em arquivo JSON temporário para loteamento (chunking)
    cache_data = {
        "upload_id": upload_id,
        "total_count": total_count,
        "duplicate_count": len(duplicate_items),
        "zero_price_count": len(zero_price_items),
        "duplicate_sample": duplicate_items[:10],
        "zero_price_sample": zero_price_items[:10],
        "items": items,
    }

    cache_filepath = os.path.join(import_dir, f"{upload_id}.json")
    with open(cache_filepath, "w", encoding="utf-8") as f:
        json.dump(cache_data, f, ensure_ascii=False)

    if session_id:
        _persist_session_products(
            db, session_id, company_id, items,
            source="SPREADSHEET",
            source_ref=file.filename
        )

    return {
        "upload_id": upload_id,
        "filename": file.filename,
        "session_id": session_id,
        "total_count": total_count,
        "count": total_count,
        "duplicate_count": len(duplicate_items),
        "zero_price_count": len(zero_price_items),
        "duplicate_sample": duplicate_items[:10],
        "zero_price_sample": zero_price_items[:10],
        "items": items if total_count <= 5000 else [],
    }


@router.get("/upload-spreadsheet/{upload_id}/chunk")
async def get_pos_spreadsheet_chunk(
    company_id: int,
    upload_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(10000, le=20000),
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    """
    Retorna um lote (chunk) de produtos de uma planilha de grandes proporções (ex: 250k+ itens).
    Garante transmissão ultrarrápida sem causar estouro de buffer ou timeout HTTP.
    """
    _assert_pos_access(current_user, company_id, db)

    import_dir = os.path.join(tempfile.gettempdir(), "pos_imports")
    cache_filepath = os.path.join(import_dir, f"{upload_id}.json")

    if not os.path.exists(cache_filepath):
        raise HTTPException(
            status_code=404,
            detail="Sessão de importação expirada ou não encontrada. Faça o envio da planilha novamente."
        )

    try:
        with open(cache_filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao ler cache da planilha: {str(e)}")

    all_items = data.get("items", [])
    total_count = len(all_items)
    chunk = all_items[offset : offset + limit]

    # Se o cliente consumiu todos os lotes, limpa o arquivo em disco
    if offset + limit >= total_count:
        try:
            os.remove(cache_filepath)
        except Exception:
            pass

    return {
        "upload_id": upload_id,
        "offset": offset,
        "limit": limit,
        "count": len(chunk),
        "total_count": total_count,
        "items": chunk,
    }


# ─────────────────────────────────────────────────────────────────────────────
# ROTINAS DE ESTOQUE, FINANCEIRO E CANCELAMENTO DE VENDA PDV
# ─────────────────────────────────────────────────────────────────────────────

def _adjust_pos_sale_stock(db: Session, sale: POSSale, direction: int) -> None:
    """
    Ajusta o saldo dos produtos da venda:
    - direction = -1: Baixa o estoque na efetivação da venda.
    - direction = +1: Devolve (estorna) o estoque no cancelamento da venda.
    """
    for it in sale.items:
        qty = max(0.0, float(it.quantity or 0.0))
        if qty <= 0:
            continue

        bar_clean = str(it.barcode or "").strip()
        sku_clean = str(it.sku or "").strip()
        horus_clean = str(it.horus_item_code or "").strip()

        # 1. Atualiza saldo no catálogo da sessão (POSSessionProduct), se houver sessão vinculada
        if sale.session_id:
            conds = []
            if bar_clean and bar_clean != "SEM_BARRAS":
                conds.append(POSSessionProduct.barcode == bar_clean)
            if sku_clean:
                conds.append(POSSessionProduct.sku == sku_clean)
            if horus_clean:
                conds.append(POSSessionProduct.horus_item_code == horus_clean)
            if conds:
                sess_prod = (
                    db.query(POSSessionProduct)
                    .filter(
                        POSSessionProduct.session_id == sale.session_id,
                        or_(*conds),
                    )
                    .first()
                )
                if sess_prod:
                    updated_stock = float(sess_prod.stock or 0.0) + (direction * qty)
                    sess_prod.stock = max(0.0, round(updated_stock, 2))

        # 2. Atualiza saldo no cadastro geral de produtos da empresa (Product), se existir
        prod = None
        if it.product_id:
            prod = (
                db.query(Product)
                .filter(Product.id == it.product_id, Product.company_id == sale.company_id)
                .first()
            )
        if not prod and bar_clean and bar_clean != "SEM_BARRAS":
            prod = (
                db.query(Product)
                .filter(
                    Product.company_id == sale.company_id,
                    or_(
                        Product.ean_gtin == bar_clean,
                        Product.barcode == bar_clean,
                        Product.sku == bar_clean,
                    ),
                )
                .first()
            )
        if not prod and sku_clean:
            prod = (
                db.query(Product)
                .filter(Product.company_id == sale.company_id, Product.sku == sku_clean)
                .first()
            )
        if prod:
            updated_prod_stock = int(prod.stock_quantity or 0) + int(round(direction * qty))
            prod.stock_quantity = max(0, updated_prod_stock)


def _create_financial_for_pos_sale(db: Session, sale: POSSale) -> None:
    """
    Gera o lançamento financeiro (FinancialTransaction e FinancialInstallment)
    correspondente a uma venda concluída no PDV.
    """
    total_val = round(float(sale.total_amount or 0.0), 2)
    if total_val <= 0:
        return

    uuid_tag = f"[UUID:{sale.client_sale_uuid}]"
    existing_tx = (
        db.query(FinancialTransaction)
        .filter(
            FinancialTransaction.company_id == sale.company_id,
            FinancialTransaction.description.ilike(f"%{uuid_tag}%"),
        )
        .first()
    )
    if existing_tx:
        return

    category = (
        db.query(FinancialCategory)
        .filter(
            FinancialCategory.company_id == sale.company_id,
            FinancialCategory.name.ilike("Venda%"),
            FinancialCategory.type == "RECEIVABLE",
        )
        .first()
    )
    if not category:
        category = FinancialCategory(
            company_id=sale.company_id,
            name="Venda de Produtos (PDV)",
            type="RECEIVABLE",
            is_system=True,
            dre_group="1_Receita_Bruta",
        )
        db.add(category)
        db.flush()

    sold_dt = sale.sold_at or datetime.utcnow()
    issue_dt = sold_dt.date() if hasattr(sold_dt, "date") else date.today()

    _, _, _, inst_count = _parse_payment_breakdown(
        sale.payment_method, sale.payment_details, total_val
    )
    num_inst = max(1, int(inst_count or 1)) if sale.payment_method == "CREDITO" else 1

    fin_tx = FinancialTransaction(
        company_id=sale.company_id,
        customer_id=sale.customer_id,
        category_id=category.id,
        description=f"Venda PDV: {sale.sale_number} ({sale.payment_method}) {uuid_tag}",
        type="RECEIVABLE",
        transaction_status="CONFIRMADO",
        total_amount=total_val,
        issue_date=issue_dt,
        first_due_date=issue_dt,
        exclude_from_reports=False,
    )
    db.add(fin_tx)
    db.flush()

    amt_per_inst = round(total_val / num_inst, 2)
    last_amt = round(total_val - (amt_per_inst * (num_inst - 1)), 2)

    for i in range(num_inst):
        due_dt = issue_dt if num_inst == 1 else (issue_dt + timedelta(days=30 * (i + 1)))
        val = amt_per_inst if i < (num_inst - 1) else last_amt
        inst = FinancialInstallment(
            transaction_id=fin_tx.id,
            number=i + 1,
            due_date=due_dt,
            amount=val,
            status="PAID",
            payment_date=sold_dt,
            amount_paid=val,
            exclude_from_reports=False,
        )
        db.add(inst)


def _cancel_financial_for_pos_sale(db: Session, sale: POSSale) -> None:
    """
    Cancela/estorna o lançamento financeiro e as parcelas vinculadas à venda do PDV.
    """
    uuid_tag = f"[UUID:{sale.client_sale_uuid}]"
    tx_list = (
        db.query(FinancialTransaction)
        .filter(
            FinancialTransaction.company_id == sale.company_id,
            or_(
                FinancialTransaction.description.ilike(f"%{uuid_tag}%"),
                FinancialTransaction.description.ilike(f"%Venda PDV: {sale.sale_number}%"),
            ),
        )
        .all()
    )
    for tx in tx_list:
        tx.transaction_status = "CANCELADO"
        tx.exclude_from_reports = True
        for inst in tx.installments:
            inst.status = "CANCELLED"
            inst.exclude_from_reports = True


def _revert_completed_pos_sale(db: Session, sale: POSSale, reason: Optional[str] = None) -> bool:
    """
    Executa a reversão completa de uma venda de PDV:
    1. Altera o status da venda para 'CANCELLED'.
    2. Estorna os produtos para o estoque (POSSessionProduct e Product).
    3. Subtrai a venda do totalizador da sessão (POSSession).
    4. Cancela o lançamento financeiro vinculado (FinancialTransaction / FinancialInstallment).
    """
    if sale.status == "CANCELLED":
        return False

    sale.status = "CANCELLED"
    cancel_stamp = datetime.utcnow().strftime("%d/%m/%Y %H:%M")
    reason_str = f" — Motivo: {reason.strip()}" if (reason and reason.strip()) else ""
    cancel_note = f"[CANCELADA EM {cancel_stamp}{reason_str}]"
    sale.notes = f"{sale.notes} | {cancel_note}".strip(" |") if sale.notes else cancel_note

    if sale.session_id:
        sess = (
            db.query(POSSession)
            .filter(POSSession.id == sale.session_id, POSSession.company_id == sale.company_id)
            .first()
        )
        if sess:
            sess.total_sales_count = max(0, int(sess.total_sales_count or 1) - 1)
            sess.total_sales_amount = max(
                0.0, round(float(sess.total_sales_amount or 0.0) - float(sale.total_amount or 0.0), 2)
            )

    _adjust_pos_sale_stock(db, sale, direction=+1)
    _cancel_financial_for_pos_sale(db, sale)
    return True


# ─────────────────────────────────────────────────────────────────────────────
# SINCRONIZAÇÃO EM LOTE DE VENDAS OFFLINE / ONLINE
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/sync-sales", response_model=POSSyncBatchResponse)
def sync_pos_sales(
    company_id: int,
    payload: POSSyncBatchRequest,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    """
    Ingestão em lote de vendas realizadas no PDV (Offline ou Online).
    Garantia de IDEMPOTÊNCIA via 'client_sale_uuid'.
    Se a venda já foi sincronizada anteriormente, não duplica (mas processa cancelamento
    caso tenha sido cancelada offline posteriormente).
    Baixa estoque, gera financeiro e atualiza as estatísticas da sessão.
    """
    _assert_pos_access(current_user, company_id, db)

    session = None
    if payload.session_id:
        session = db.query(POSSession).filter(
            POSSession.id == payload.session_id,
            POSSession.company_id == company_id
        ).first()

    success_count = 0
    already_synced_count = 0
    failed_count = 0
    synced_uuids = []
    errors = []
    seen_uuids_in_batch = set()

    for s_in in payload.sales:
        uuid_key = s_in.client_sale_uuid.strip()
        if not uuid_key:
            failed_count += 1
            errors.append({"uuid": "", "error": "client_sale_uuid obrigatório"})
            continue

        # Trava anti-duplicidade dentro do próprio lote recebido
        if uuid_key in seen_uuids_in_batch:
            already_synced_count += 1
            if uuid_key not in synced_uuids:
                synced_uuids.append(uuid_key)
            continue
        seen_uuids_in_batch.add(uuid_key)

        incoming_status = "CANCELLED" if str(getattr(s_in, "sale_status", "COMPLETED")).upper() == "CANCELLED" else "COMPLETED"

        # Verifica se já existe no banco (idempotência global)
        existing = db.query(POSSale).filter(
            POSSale.company_id == company_id,
            POSSale.client_sale_uuid == uuid_key
        ).first()

        if existing:
            # Se a venda já existia como COMPLETED e foi cancelada offline, aplica a reversão completa!
            if incoming_status == "CANCELLED" and existing.status != "CANCELLED":
                try:
                    _revert_completed_pos_sale(db, existing, reason="Cancelada no PDV (sincronização offline)")
                    db.commit()
                    success_count += 1
                except Exception as cancel_err:
                    db.rollback()
                    logger.error("Falha ao sincronizar cancelamento da venda %s: %s", uuid_key, str(cancel_err))
                    failed_count += 1
                    errors.append({"uuid": uuid_key, "error": str(cancel_err)})
                    continue
            else:
                already_synced_count += 1
            synced_uuids.append(uuid_key)
            continue

        try:
            sale_num = (s_in.sale_number or "").strip() or f"PDV-{datetime.utcnow().strftime('%y%m%d%H%M')}-{success_count+1}"

            # Resolução e Auto-cadastro de Cliente para relatórios gerenciais:
            cust_name = (s_in.customer_name or "").strip() or "Consumidor Final"
            cust_doc = (s_in.customer_document or "").strip()

            target_customer_id = None
            if s_in.customer_id and int(s_in.customer_id) > 0:
                cust_exists = db.query(Customer.id).filter(
                    Customer.id == int(s_in.customer_id),
                    Customer.company_id == company_id
                ).first()
                if cust_exists:
                    target_customer_id = cust_exists[0]

            # Se não veio ID ou veio zero/inválido: busca por Documento ou Nome; se não existir, auto-cadastra!
            if not target_customer_id:
                # 1. Tenta buscar por CPF/CNPJ se informado
                if cust_doc:
                    found_by_doc = db.query(Customer.id).filter(
                        Customer.company_id == company_id,
                        Customer.document == cust_doc
                    ).first()
                    if found_by_doc:
                        target_customer_id = found_by_doc[0]

                # 2. Tenta buscar por Nome exato (case insensitive) na mesma empresa
                if not target_customer_id:
                    found_by_name = db.query(Customer.id).filter(
                        Customer.company_id == company_id,
                        func.lower(Customer.name) == cust_name.lower()
                    ).first()
                    if found_by_name:
                        target_customer_id = found_by_name[0]

                # 3. Se ainda não existe, cria um novo cliente no CRM da empresa para relatórios gerenciais
                if not target_customer_id:
                    clean_digits = "".join(filter(str.isdigit, cust_doc))
                    cust_type = "PJ" if len(clean_digits) > 11 else "PF"
                    doc_val = cust_doc if cust_doc else f"PDV-{uuid_key[:8].upper()}"

                    new_customer = Customer(
                        company_id=company_id,
                        name=cust_name,
                        corporate_name=cust_name,
                        document=doc_val,
                        customer_type=cust_type,
                        crm_status="ACTIVE",
                        credit_limit=0.0,
                        discount=0.0,
                        open_debts=0.0,
                        consignment_status="INACTIVE",
                    )
                    db.add(new_customer)
                    db.flush()
                    target_customer_id = new_customer.id

            target_sess_id = payload.session_id or s_in.session_id
            new_sale = POSSale(
                company_id=company_id,
                session_id=target_sess_id,
                user_id=current_user.id,
                client_sale_uuid=uuid_key,
                sale_number=sale_num,
                customer_name=cust_name,
                customer_document=cust_doc or None,
                customer_id=target_customer_id,
                payment_method=s_in.payment_method.upper(),
                payment_details=s_in.payment_details,
                subtotal=s_in.subtotal,
                discount=s_in.discount,
                total_amount=s_in.total_amount,
                items_count=s_in.items_count,
                sold_at=s_in.sold_at,
                synced_at=datetime.utcnow(),
                origin=s_in.origin or "pdv_offline",
                status=incoming_status,
                notes=s_in.notes,
            )
            db.add(new_sale)
            db.flush()

            for it in s_in.items:
                valid_product_id = None
                if it.product_id and int(it.product_id) > 0:
                    prod_row = db.query(Product.id).filter(
                        Product.id == int(it.product_id),
                        Product.company_id == company_id,
                    ).first()
                    if prod_row:
                        valid_product_id = prod_row[0]

                horus_code = it.horus_item_code or it.sku or (str(it.product_id) if it.product_id else None)
                sale_item = POSSaleItem(
                    sale_id=new_sale.id,
                    product_id=valid_product_id,
                    barcode=str(it.barcode or "SEM_BARRAS").strip()[:50],
                    sku=str(it.sku or horus_code).strip()[:100] if (it.sku or horus_code) else None,
                    title=str(it.title or "Item sem título").strip()[:255],
                    publisher=str(it.publisher).strip()[:255] if it.publisher else None,
                    quantity=max(1.0, float(it.quantity or 1.0)),
                    unit_price=max(0.0, float(it.unit_price or 0.0)),
                    total_price=max(0.0, float(it.total_price or 0.0)),
                    horus_item_code=str(horus_code).strip()[:50] if horus_code else None,
                )
                db.add(sale_item)

            db.flush()
            db.refresh(new_sale)

            # Somente se a venda está CONCLUÍDA (COMPLETED): soma na sessão, baixa o estoque e gera o financeiro
            if incoming_status == "COMPLETED":
                target_sess_obj = session
                if not target_sess_obj and target_sess_id:
                    target_sess_obj = db.query(POSSession).filter(
                        POSSession.id == target_sess_id,
                        POSSession.company_id == company_id
                    ).first()
                if target_sess_obj:
                    target_sess_obj.total_sales_count = (target_sess_obj.total_sales_count or 0) + 1
                    target_sess_obj.total_sales_amount = float(target_sess_obj.total_sales_amount or 0) + float(s_in.total_amount)

                _adjust_pos_sale_stock(db, new_sale, direction=-1)
                _create_financial_for_pos_sale(db, new_sale)

            db.commit()
            success_count += 1
            synced_uuids.append(uuid_key)

        except Exception as e:
            db.rollback()
            logger.error("Falha ao gravar venda %s: %s", uuid_key, str(e))
            failed_count += 1
            errors.append({"uuid": uuid_key, "error": str(e)})

    return POSSyncBatchResponse(
        status="ok" if failed_count == 0 else "partial_error",
        total_received=len(payload.sales),
        success_count=success_count,
        already_synced_count=already_synced_count,
        synced=success_count,
        skipped_duplicates=already_synced_count,
        failed_count=failed_count,
        synced_uuids=synced_uuids,
        errors=errors,
    )


@router.put("/sales/{sale_identifier}/cancel")
def cancel_pos_sale(
    company_id: int,
    sale_identifier: str,
    payload: POSSaleCancelRequest,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    """
    Cancela uma venda do PDV mediante validação da Senha do Supervisor da empresa.
    Reverte automaticamente:
    - Status da venda para 'CANCELLED'
    - Estoque dos itens (na sessão POSSessionProduct e no cadastro geral Product)
    - Totais da sessão de caixa (POSSession)
    - Lançamento financeiro vinculado (FinancialTransaction e FinancialInstallment)
    """
    _assert_pos_access(current_user, company_id, db)

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    configured_password = (getattr(settings, "pdv_supervisor_password", None) or "").strip() if settings else ""
    if not configured_password:
        raise HTTPException(
            status_code=400,
            detail="A Senha do Supervisor ainda não foi configurada. Acesse Configurações → Frente de Caixa (PDV) para defini-la.",
        )

    provided_password = (payload.supervisor_password or "").strip()
    if provided_password != configured_password:
        raise HTTPException(
            status_code=403,
            detail="Senha do supervisor incorreta. O cancelamento da venda não foi autorizado.",
        )

    clean_id = sale_identifier.strip()
    conds = [
        POSSale.client_sale_uuid == clean_id,
        POSSale.sale_number == clean_id,
    ]
    if clean_id.isdigit():
        conds.append(POSSale.id == int(clean_id))

    sale = (
        db.query(POSSale)
        .filter(
            POSSale.company_id == company_id,
            or_(*conds),
        )
        .first()
    )
    if not sale:
        raise HTTPException(
            status_code=404,
            detail="Venda não localizada no servidor. Caso tenha sido realizada offline, sincronize as vendas antes ou cancele localmente.",
        )

    was_reverted = _revert_completed_pos_sale(db, sale, reason=payload.reason)
    db.commit()
    db.refresh(sale)

    return {
        "status": "ok",
        "already_cancelled": not was_reverted,
        "sale_id": sale.id,
        "client_sale_uuid": sale.client_sale_uuid,
        "sale_number": sale.sale_number,
        "sale_status": sale.status,
        "notes": sale.notes,
        "message": f"Venda {sale.sale_number} cancelada com sucesso. Estoque e financeiro estornados.",
    }


# ─────────────────────────────────────────────────────────────────────────────
# LISTAGEM & ACOMPANHAMENTO EM TEMPO REAL DAS VENDAS
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/sales")
def list_pos_sales(
    company_id: int,
    session_id: Optional[int] = Query(None),
    start_date: Optional[str] = Query(None, description="Data inicial YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="Data final YYYY-MM-DD"),
    payment_method: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=1000),
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    """
    Centralização e acompanhamento em tempo real das vendas do PDV.
    Retorna métricas consolidadas (KPIs) e lista paginada com os itens.
    """
    _assert_pos_access(current_user, company_id, db)

    dt_start = None
    if isinstance(start_date, str) and start_date.strip():
        try:
            dt_start = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            if dt_start.tzinfo is None:
                dt_start = dt_start.replace(tzinfo=BRT_TZ)
        except Exception:
            try:
                dt_start = datetime.strptime(start_date[:10], "%Y-%m-%d").replace(tzinfo=BRT_TZ)
            except Exception:
                pass

    dt_end = None
    if isinstance(end_date, str) and end_date.strip():
        try:
            dt_end = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            if len(end_date.strip()) == 10:
                dt_end = dt_end.replace(hour=23, minute=59, second=59, microsecond=999999)
            if dt_end.tzinfo is None:
                dt_end = dt_end.replace(tzinfo=BRT_TZ)
        except Exception:
            try:
                dt_end = datetime.strptime(end_date[:10], "%Y-%m-%d").replace(
                    hour=23, minute=59, second=59, microsecond=999999, tzinfo=BRT_TZ
                )
            except Exception:
                pass

    query = db.query(POSSale).filter(POSSale.company_id == company_id)

    if session_id:
        query = query.filter(POSSale.session_id == session_id)
    if dt_start:
        query = query.filter(POSSale.sold_at >= dt_start)
    if dt_end:
        query = query.filter(POSSale.sold_at <= dt_end)
    if payment_method:
        query = query.filter(POSSale.payment_method == payment_method.upper())
    if status_filter and status_filter.upper() not in ("ALL", "TODAS", ""):
        query = query.filter(POSSale.status == status_filter.upper())
    if search:
        search_like = f"%{search}%"
        query = query.filter(
            or_(
                POSSale.sale_number.ilike(search_like),
                POSSale.customer_name.ilike(search_like),
                POSSale.customer_document.ilike(search_like),
            )
        )

    # Métricas agregadas (separando concluídas e canceladas)
    base_kpi_filter = [POSSale.company_id == company_id]
    if session_id:
        base_kpi_filter.append(POSSale.session_id == session_id)
    if dt_start:
        base_kpi_filter.append(POSSale.sold_at >= dt_start)
    if dt_end:
        base_kpi_filter.append(POSSale.sold_at <= dt_end)

    completed_count = db.query(func.count(POSSale.id)).filter(
        *base_kpi_filter, POSSale.status == "COMPLETED"
    ).scalar() or 0
    completed_amount = db.query(func.sum(POSSale.total_amount)).filter(
        *base_kpi_filter, POSSale.status == "COMPLETED"
    ).scalar() or 0.0

    cancelled_count = db.query(func.count(POSSale.id)).filter(
        *base_kpi_filter, POSSale.status == "CANCELLED"
    ).scalar() or 0
    cancelled_amount = db.query(func.sum(POSSale.total_amount)).filter(
        *base_kpi_filter, POSSale.status == "CANCELLED"
    ).scalar() or 0.0

    # Agrupamento por método de pagamento (desmembrando vendas MISTAS e considerando apenas COMPLETED)
    completed_sales_for_pay = db.query(POSSale).filter(
        *base_kpi_filter, POSSale.status == "COMPLETED"
    ).all()
    by_payment: dict = {}
    for cs in completed_sales_for_pay:
        b_map, _, _, _ = _parse_payment_breakdown(
            cs.payment_method, cs.payment_details, float(cs.total_amount or 0.0)
        )
        for m_key, m_val in b_map.items():
            if m_val > 0:
                if m_key not in by_payment:
                    by_payment[m_key] = {"count": 0, "total": 0.0}
                by_payment[m_key]["count"] += 1
                by_payment[m_key]["total"] = round(by_payment[m_key]["total"] + m_val, 2)

    # Registros paginados
    sales = query.order_by(desc(POSSale.sold_at), POSSale.id.desc()).offset(skip).limit(limit).all()
    sales_result = []
    for s in sales:
        _, display_label, _, inst_num = _parse_payment_breakdown(
            s.payment_method, s.payment_details, float(s.total_amount or 0.0)
        )
        items_data = [
            {
                "barcode": it.barcode,
                "isbn": it.barcode,
                "sku": it.sku or it.horus_item_code,
                "horus_item_code": it.horus_item_code or it.sku,
                "title": it.title,
                "name": it.title,
                "quantity": float(it.quantity),
                "unit_price": float(it.unit_price),
                "total_price": float(it.total_price),
                "publisher": it.publisher,
            }
            for it in s.items
        ]
        sold_brt = _to_brt(s.sold_at)
        sold_iso = sold_brt.isoformat() if sold_brt else None
        sales_result.append({
            "id": s.id,
            "client_sale_uuid": s.client_sale_uuid,
            "sale_number": s.sale_number,
            "session_id": s.session_id,
            "customer_name": s.customer_name,
            "customer_document": s.customer_document,
            "payment_method": s.payment_method,
            "installments": inst_num or 1,
            "payment_display": display_label,
            "payment_details": s.payment_details,
            "subtotal": float(s.subtotal),
            "discount": float(s.discount),
            "discount_amount": float(s.discount),
            "total_amount": float(s.total_amount),
            "items_count": s.items_count,
            "sold_at": sold_iso,
            "sold_at_brt": sold_brt.strftime("%d/%m/%Y %H:%M") if sold_brt else "-",
            "created_at": sold_iso,
            "synced_at": _to_brt(s.synced_at).isoformat() if s.synced_at else None,
            "origin": s.origin,
            "status": s.status,
            "notes": s.notes,
            "items": items_data,
        })

    return {
        "kpis": {
            "total_sales": completed_count,
            "total_amount": float(completed_amount),
            "cancelled_sales": cancelled_count,
            "cancelled_amount": float(cancelled_amount),
            "by_payment_method": by_payment,
        },
        "sales": sales_result,
        "items": sales_result,
        "skip": skip,
        "limit": limit,
    }


# ─────────────────────────────────────────────────────────────────────────────
# RELATÓRIO ANALÍTICO DE ITENS VENDIDOS (JSON, EXCEL E PDF)
# ─────────────────────────────────────────────────────────────────────────────

def _pdf_safe(val: Optional[str]) -> str:
    """Higieniza strings para inclusão segura no FPDF evitando problemas com latin-1."""
    if val is None:
        return ""
    text = str(val).strip()
    return text.encode("latin-1", "replace").decode("latin-1")


class POSReportPDF(FPDF):
    """Classe FPDF customizada para o relatório analítico do PDV."""
    def __init__(self, company_name: str, subtitle: str, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.company_name = company_name
        self.subtitle = subtitle

    def header(self):
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(30, 41, 59)  # Slate-800
        self.cell(0, 7, _pdf_safe(f"CRONUZ B2B — {self.company_name}"), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_font("Helvetica", "", 9)
        self.set_text_color(100, 116, 139)  # Slate-500
        self.cell(0, 5, _pdf_safe(self.subtitle), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_draw_color(226, 232, 240)
        self.set_line_width(0.3)
        self.line(10, self.get_y() + 2, 287, self.get_y() + 2)
        self.ln(4)

    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(148, 163, 184)
        self.cell(0, 8, _pdf_safe(f"Cronuz Omnichannel PDV  •  Página {self.page_no()} de {{nb}}"), align="C")


@router.get("/reports/sales")
def get_pos_sales_report(
    company_id: int,
    session_id: Optional[int] = Query(None, description="Filtrar por sessão específica"),
    start_date: Optional[str] = Query(None, description="Data inicial (YYYY-MM-DD ou ISO)"),
    end_date: Optional[str] = Query(None, description="Data final (YYYY-MM-DD ou ISO)"),
    payment_method: Optional[str] = Query(None, description="Filtrar por forma de pagamento"),
    status: Optional[str] = Query("COMPLETED", description="Status da venda"),
    format: str = Query("json", description="Formato de saída: json | excel | pdf"),
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    """
    Relatório detalhado de itens vendidos no PDV com ISBN, quantidade, valor,
    forma de pagamento, sessão e consumidor.
    Exporta nos formatos JSON, Excel (.xlsx) ou PDF (.pdf).
    """
    company = _assert_pos_access(current_user, company_id, db)

    # Tratamento defensivo caso chamado diretamente em testes
    if not isinstance(start_date, str):
        start_date = None
    if not isinstance(end_date, str):
        end_date = None
    if not isinstance(payment_method, str):
        payment_method = None
    if not isinstance(session_id, int):
        session_id = None
    if not isinstance(status, str):
        status = "COMPLETED"
    if not isinstance(format, str):
        format = "json"

    dt_start = None
    if start_date:
        try:
            dt_start = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            if dt_start.tzinfo is None:
                dt_start = dt_start.replace(tzinfo=BRT_TZ)
        except Exception:
            try:
                dt_start = datetime.strptime(start_date[:10], "%Y-%m-%d").replace(tzinfo=BRT_TZ)
            except Exception:
                pass

    dt_end = None
    if end_date:
        try:
            dt_end = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            if len(end_date) == 10:
                dt_end = dt_end.replace(hour=23, minute=59, second=59, microsecond=999999)
            if dt_end.tzinfo is None:
                dt_end = dt_end.replace(tzinfo=BRT_TZ)
        except Exception:
            try:
                dt_end = datetime.strptime(end_date[:10], "%Y-%m-%d").replace(
                    hour=23, minute=59, second=59, microsecond=999999, tzinfo=BRT_TZ
                )
            except Exception:
                pass

    query = (
        db.query(POSSaleItem, POSSale, POSSession)
        .join(POSSale, POSSaleItem.sale_id == POSSale.id)
        .outerjoin(POSSession, POSSale.session_id == POSSession.id)
        .filter(POSSale.company_id == company_id)
    )

    if status and status.upper() not in ("ALL", "TODAS", ""):
        query = query.filter(POSSale.status == status.upper())
    if session_id:
        query = query.filter(POSSale.session_id == session_id)
    if dt_start:
        query = query.filter(POSSale.sold_at >= dt_start)
    if dt_end:
        query = query.filter(POSSale.sold_at <= dt_end)
    if payment_method:
        query = query.filter(POSSale.payment_method == payment_method.upper())

    rows = query.order_by(desc(POSSale.sold_at), POSSale.id.desc(), POSSaleItem.id.asc()).all()

    # Agregações
    unique_sale_ids = set()
    completed_sale_ids = set()
    cancelled_sale_ids = set()
    total_qty = 0.0
    total_revenue = 0.0
    completed_revenue = 0.0
    cancelled_revenue = 0.0
    by_payment = {}

    formatted_rows = []
    for item, sale, session in rows:
        unique_sale_ids.add(sale.id)
        is_cancelled = (sale.status == "CANCELLED")
        if is_cancelled:
            cancelled_sale_ids.add(sale.id)
        else:
            completed_sale_ids.add(sale.id)

        qty = float(item.quantity or 0.0)
        u_price = float(item.unit_price or 0.0)
        t_price = float(item.total_price or 0.0)

        if is_cancelled:
            cancelled_revenue += t_price
            if status and status.upper() == "CANCELLED":
                total_qty += qty
                total_revenue += t_price
        else:
            completed_revenue += t_price
            total_qty += qty
            total_revenue += t_price

        b_map, display_label, _, _ = _parse_payment_breakdown(
            sale.payment_method, sale.payment_details, float(sale.total_amount or 0.0)
        )

        if not is_cancelled or (status and status.upper() == "CANCELLED"):
            ratio = (t_price / float(sale.total_amount)) if float(sale.total_amount or 0.0) > 0 else 1.0
            for m_key, m_val in b_map.items():
                if m_val > 0:
                    if m_key not in by_payment:
                        by_payment[m_key] = {"count": 0, "total": 0.0}
                    by_payment[m_key]["count"] += 1
                    by_payment[m_key]["total"] = round(by_payment[m_key]["total"] + (m_val * ratio), 2)

        sess_name = session.name if session else (f"Sessão #{sale.session_id}" if sale.session_id else "Avulsa")

        sold_brt = _to_brt(sale.sold_at)
        formatted_rows.append({
            "id": item.id,
            "sale_id": sale.id,
            "sale_number": sale.sale_number,
            "sale_status": sale.status or "COMPLETED",
            "sold_at": sold_brt.strftime("%d/%m/%Y %H:%M") if sold_brt else "-",
            "sold_at_iso": sold_brt.isoformat() if sold_brt else None,
            "session_id": sale.session_id,
            "session_name": sess_name,
            "barcode": item.barcode or "",
            "sku": item.sku or "",
            "title": (f"[CANCELADA] {item.title}" if is_cancelled and format in ("excel", "pdf") else (item.title or "Sem descrição")),
            "publisher": item.publisher or "",
            "quantity": qty,
            "unit_price": u_price,
            "total_price": t_price,
            "payment_method": display_label,
            "customer_name": sale.customer_name or "Consumidor Final",
            "customer_document": sale.customer_document or "",
        })

    # Resumo
    kpis = {
        "total_sales": len(completed_sale_ids) if (not status or status.upper() != "CANCELLED") else len(cancelled_sale_ids),
        "total_items": round(total_qty, 2),
        "total_amount": round(total_revenue, 2),
        "completed_sales": len(completed_sale_ids),
        "completed_amount": round(completed_revenue, 2),
        "cancelled_sales": len(cancelled_sale_ids),
        "cancelled_amount": round(cancelled_revenue, 2),
        "by_payment": by_payment,
    }

    # 1. Retorno JSON
    if format == "json":
        return {
            "kpis": kpis,
            "rows": formatted_rows,
            "filters": {
                "session_id": session_id,
                "start_date": start_date,
                "end_date": end_date,
                "payment_method": payment_method,
            }
        }

    # 2. Retorno EXCEL
    if format == "excel":
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Itens Vendidos"
        ws.views.sheetView[0].showGridLines = True

        # Paleta de Cores e Estilos
        title_font = Font(name="Calibri", size=15, bold=True, color="1E293B")
        sub_font = Font(name="Calibri", size=10, italic=True, color="64748B")
        header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
        header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
        card_fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
        card_font = Font(name="Calibri", size=10, bold=True, color="334155")
        card_val_font = Font(name="Calibri", size=12, bold=True, color="0F172A")
        zebra_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
        thin_border = Border(
            left=Side(style='thin', color="E2E8F0"),
            right=Side(style='thin', color="E2E8F0"),
            top=Side(style='thin', color="E2E8F0"),
            bottom=Side(style='thin', color="E2E8F0")
        )
        total_fill = PatternFill(start_color="E2E8F0", end_color="E2E8F0", fill_type="solid")
        total_font = Font(name="Calibri", size=11, bold=True, color="0F172A")

        # Cabeçalho da Empresa
        ws.merge_cells("A1:M1")
        ws["A1"] = f"{company.name.upper()} — RELATÓRIO ANALÍTICO DE VENDAS (PDV)"
        ws["A1"].font = title_font

        periodo_txt = f"Período: {start_date or 'Início'} até {end_date or 'Hoje'}"
        if session_id:
            sess_obj = db.query(POSSession).filter(POSSession.id == session_id).first()
            periodo_txt += f"  |  Sessão: {sess_obj.name if sess_obj else session_id}"
        periodo_txt += f"  |  Gerado em: {datetime.now(BRT_TZ).strftime('%d/%m/%Y %H:%M')}"

        ws.merge_cells("A2:M2")
        ws["A2"] = periodo_txt
        ws["A2"].font = sub_font

        # Cards de KPIs
        ws["A4"] = "Vendas Únicas"
        ws["A4"].font = card_font
        ws["A4"].fill = card_fill
        ws["A5"] = len(unique_sale_ids)
        ws["A5"].font = card_val_font
        ws["A5"].fill = card_fill
        ws["A5"].alignment = Alignment(horizontal="center")

        ws["C4"] = "Volume Itens"
        ws["C4"].font = card_font
        ws["C4"].fill = card_fill
        ws["C5"] = round(total_qty, 2)
        ws["C5"].font = card_val_font
        ws["C5"].fill = card_fill
        ws["C5"].alignment = Alignment(horizontal="center")

        ws["E4"] = "Faturamento Total"
        ws["E4"].font = card_font
        ws["E4"].fill = card_fill
        ws["E5"] = total_revenue
        ws["E5"].font = card_val_font
        ws["E5"].fill = card_fill
        ws["E5"].number_format = '"R$ "#,##0.00'
        ws["E5"].alignment = Alignment(horizontal="right")

        # Tabela de Itens
        headers = [
            "Data / Hora", "Nº Venda", "Sessão PDV", "ISBN / Cód. Barras",
            "SKU", "Título do Produto", "Editora", "Qtd",
            "Vlr. Unitário", "Total Item", "Forma Pagamento", "Cliente", "CPF / CNPJ"
        ]
        start_row = 7
        for col_idx, col_name in enumerate(headers, 1):
            cell = ws.cell(row=start_row, column=col_idx, value=col_name)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = thin_border

        for r_idx, row in enumerate(formatted_rows, start_row + 1):
            fill = zebra_fill if r_idx % 2 == 0 else PatternFill(fill_type=None)
            ws.cell(row=r_idx, column=1, value=row["sold_at"]).alignment = Alignment(horizontal="center")
            ws.cell(row=r_idx, column=2, value=row["sale_number"]).alignment = Alignment(horizontal="center")
            ws.cell(row=r_idx, column=3, value=row["session_name"])
            ws.cell(row=r_idx, column=4, value=str(row["barcode"])).alignment = Alignment(horizontal="center")
            ws.cell(row=r_idx, column=5, value=row["sku"]).alignment = Alignment(horizontal="center")
            ws.cell(row=r_idx, column=6, value=row["title"])
            ws.cell(row=r_idx, column=7, value=row["publisher"])
            
            c_qty = ws.cell(row=r_idx, column=8, value=row["quantity"])
            c_qty.alignment = Alignment(horizontal="center")
            c_qty.number_format = '#,##0'

            c_unit = ws.cell(row=r_idx, column=9, value=row["unit_price"])
            c_unit.alignment = Alignment(horizontal="right")
            c_unit.number_format = '"R$ "#,##0.00'

            c_tot = ws.cell(row=r_idx, column=10, value=row["total_price"])
            c_tot.alignment = Alignment(horizontal="right")
            c_tot.number_format = '"R$ "#,##0.00'

            ws.cell(row=r_idx, column=11, value=row["payment_method"]).alignment = Alignment(horizontal="center")
            ws.cell(row=r_idx, column=12, value=row["customer_name"])
            ws.cell(row=r_idx, column=13, value=row["customer_document"]).alignment = Alignment(horizontal="center")

            for c in range(1, 14):
                cur_c = ws.cell(row=r_idx, column=c)
                if fill.fill_type:
                    cur_c.fill = fill
                cur_c.border = thin_border

        # Linha Totalizadora
        final_row = start_row + len(formatted_rows) + 1
        ws.cell(row=final_row, column=7, value="TOTAL GERAL").font = total_font
        ws.cell(row=final_row, column=7).alignment = Alignment(horizontal="right")
        ws.cell(row=final_row, column=7).fill = total_fill
        ws.cell(row=final_row, column=7).border = thin_border

        c_tot_qty = ws.cell(row=final_row, column=8, value=total_qty)
        c_tot_qty.font = total_font
        c_tot_qty.alignment = Alignment(horizontal="center")
        c_tot_qty.number_format = '#,##0'
        c_tot_qty.fill = total_fill
        c_tot_qty.border = thin_border

        ws.cell(row=final_row, column=9, value="").fill = total_fill
        ws.cell(row=final_row, column=9).border = thin_border

        c_tot_rev = ws.cell(row=final_row, column=10, value=total_revenue)
        c_tot_rev.font = total_font
        c_tot_rev.alignment = Alignment(horizontal="right")
        c_tot_rev.number_format = '"R$ "#,##0.00'
        c_tot_rev.fill = total_fill
        c_tot_rev.border = thin_border

        for c in [1, 2, 3, 4, 5, 6, 11, 12, 13]:
            ws.cell(row=final_row, column=c, value="").fill = total_fill
            ws.cell(row=final_row, column=c).border = thin_border

        # Auto-ajuste de largura de colunas (ignora linhas de cabeçalho mesclado)
        for col_idx in range(1, 14):
            col_letter = get_column_letter(col_idx)
            max_len = 0
            for r in range(start_row, final_row + 1):
                val_s = str(ws.cell(row=r, column=col_idx).value or "")
                if len(val_s) > max_len:
                    max_len = len(val_s)
            ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

        out_stream = io.BytesIO()
        wb.save(out_stream)
        file_bytes = out_stream.getvalue()

        filename = f"relatorio_itens_pdv_{company_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        return Response(
            content=file_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    # 3. Retorno PDF
    if format == "pdf":
        subtitle_txt = f"Relatório Analítico de Itens Vendidos | Emissão: {datetime.now(BRT_TZ).strftime('%d/%m/%Y %H:%M')}"
        if session_id:
            sess_obj = db.query(POSSession).filter(POSSession.id == session_id).first()
            subtitle_txt += f" | Sessão: {sess_obj.name if sess_obj else session_id}"
        if start_date or end_date:
            subtitle_txt += f" | Período: {start_date or 'Início'} a {end_date or 'Hoje'}"

        pdf = POSReportPDF(
            company_name=company.name,
            subtitle=subtitle_txt,
            orientation="L",
            unit="mm",
            format="A4"
        )
        pdf.alias_nb_pages()
        pdf.set_auto_page_break(auto=True, margin=15)
        pdf.add_page()

        # Barra de KPIs Resumo
        pdf.set_fill_color(241, 245, 249)  # Slate-100
        pdf.set_draw_color(203, 213, 225)  # Slate-300
        pdf.rect(10, pdf.get_y(), 277, 10, style="DF")

        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(15, 23, 42)
        kpi_bar = (
            f"VENDAS REALIZADAS: {len(unique_sale_ids)}   |   "
            f"VOLUME TOTAL DE ITENS: {int(total_qty)} un   |   "
            f"FATURAMENTO TOTAL: R$ {total_revenue:,.2f}"
        )
        pdf.set_xy(12, pdf.get_y() + 2)
        pdf.cell(273, 6, _pdf_safe(kpi_bar), align="L")
        pdf.ln(10)

        # Cabeçalho da Tabela
        # Larguras somam 277mm (largura útil de A4 Landscape com margem 10mm)
        col_w = {
            "data": 24,
            "venda": 20,
            "sessao": 26,
            "isbn": 27,
            "titulo": 58,
            "qtd": 12,
            "vlr_unit": 20,
            "total": 20,
            "pagto": 35,
            "cliente": 35,
        }

        pdf.set_font("Helvetica", "B", 7)
        pdf.set_fill_color(30, 41, 59)  # Slate-800
        pdf.set_text_color(255, 255, 255)
        pdf.set_draw_color(30, 41, 59)

        pdf.cell(col_w["data"], 6, "Data/Hora", border=1, fill=True, align="C")
        pdf.cell(col_w["venda"], 6, "Nº Venda", border=1, fill=True, align="C")
        pdf.cell(col_w["sessao"], 6, "Sessão", border=1, fill=True, align="L")
        pdf.cell(col_w["isbn"], 6, "ISBN / Cód.", border=1, fill=True, align="C")
        pdf.cell(col_w["titulo"], 6, "Título do Produto", border=1, fill=True, align="L")
        pdf.cell(col_w["qtd"], 6, "Qtd", border=1, fill=True, align="C")
        pdf.cell(col_w["vlr_unit"], 6, "Vlr Unit (R$)", border=1, fill=True, align="R")
        pdf.cell(col_w["total"], 6, "Total (R$)", border=1, fill=True, align="R")
        pdf.cell(col_w["pagto"], 6, "Pagamento", border=1, fill=True, align="C")
        pdf.cell(col_w["cliente"], 6, "Cliente", border=1, fill=True, align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        # Linhas de dados
        pdf.set_font("Helvetica", "", 7)
        pdf.set_text_color(30, 41, 59)
        pdf.set_draw_color(226, 232, 240)

        for idx, r in enumerate(formatted_rows):
            fill = (idx % 2 == 1)
            if fill:
                pdf.set_fill_color(248, 250, 252)
            else:
                pdf.set_fill_color(255, 255, 255)

            # Trunca títulos longos para caber na célula sem quebrar altura
            title_clean = _pdf_safe(r["title"])
            if len(title_clean) > 34:
                title_clean = title_clean[:31] + "..."

            sess_clean = _pdf_safe(r["session_name"])
            if len(sess_clean) > 16:
                sess_clean = sess_clean[:14] + ".."

            cli_clean = _pdf_safe(r["customer_name"])
            if len(cli_clean) > 22:
                cli_clean = cli_clean[:20] + ".."

            pm_clean = _pdf_safe(r["payment_method"])
            if len(pm_clean) > 24:
                pm_clean = pm_clean[:22] + ".."

            pdf.cell(col_w["data"], 5, r["sold_at"], border=1, fill=True, align="C")
            pdf.cell(col_w["venda"], 5, _pdf_safe(r["sale_number"]), border=1, fill=True, align="C")
            pdf.cell(col_w["sessao"], 5, sess_clean, border=1, fill=True, align="L")
            pdf.cell(col_w["isbn"], 5, _pdf_safe(r["barcode"]), border=1, fill=True, align="C")
            pdf.cell(col_w["titulo"], 5, title_clean, border=1, fill=True, align="L")
            pdf.cell(col_w["qtd"], 5, str(int(r["quantity"])), border=1, fill=True, align="C")
            pdf.cell(col_w["vlr_unit"], 5, f"{r['unit_price']:,.2f}", border=1, fill=True, align="R")
            pdf.cell(col_w["total"], 5, f"{r['total_price']:,.2f}", border=1, fill=True, align="R")
            pdf.cell(col_w["pagto"], 5, pm_clean, border=1, fill=True, align="C")
            pdf.cell(col_w["cliente"], 5, cli_clean, border=1, fill=True, align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        # Linha Totalizadora no PDF
        pdf.set_font("Helvetica", "B", 7)
        pdf.set_fill_color(226, 232, 240)
        pdf.set_draw_color(203, 213, 225)
        w_sub = col_w["data"] + col_w["venda"] + col_w["sessao"] + col_w["isbn"] + col_w["titulo"]
        pdf.cell(w_sub, 6, "TOTAL GERAL:", border=1, fill=True, align="R")
        pdf.cell(col_w["qtd"], 6, str(int(total_qty)), border=1, fill=True, align="C")
        pdf.cell(col_w["vlr_unit"], 6, "-", border=1, fill=True, align="C")
        pdf.cell(col_w["total"], 6, f"R$ {total_revenue:,.2f}", border=1, fill=True, align="R")
        pdf.cell(col_w["pagto"] + col_w["cliente"], 6, "", border=1, fill=True, align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        pdf_bytes = bytes(pdf.output())
        filename = f"relatorio_itens_pdv_{company_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    raise HTTPException(status_code=400, detail="Formato inválido. Use json, excel ou pdf.")


# ─────────────────────────────────────────────────────────────────────────────
# LICENCIAMENTO HORUS PDV DESKTOP (.EXE) & SINCRONIZAÇÃO POR RANGE HORUS
# ─────────────────────────────────────────────────────────────────────────────
import base64
import hashlib
import hmac
from datetime import timezone
from pydantic import BaseModel

# Segredo criptográfico compartilhado entre o Backend e o Executável HorusPDV.exe
# para validação offline inviolável da chave de licença (HMAC-SHA256).
PDV_DESKTOP_LICENSE_SECRET = b"CRONUZ-HORUS-PDV-LICENSE-V1-2026-KEY-9F8A7B6C5D4E"


class PDVDesktopLicenseUpdateRequest(BaseModel):
    enabled: bool = True
    expires_at: Optional[str] = None  # YYYY-MM-DD ou ISO-8601
    range_sync_enabled: bool = True
    horus_sync_enabled: Optional[bool] = None



class HorusCatalogRangeRequest(BaseModel):
    cod_item_ini: int
    cod_item_fim: int
    session_id: Optional[int] = None
    branch_id: Optional[int] = None
    offset: int = 0
    limit: int = 500
    data_ini: Optional[str] = None
    data_fim: Optional[str] = None
    merge_into_session: bool = True


def _generate_pdv_desktop_license_key(
    company_id: int,
    company_document: str,
    enabled: bool,
    expires_at_iso: str,
    range_sync_enabled: bool,
) -> str:
    """
    Gera um token de licença assinado com HMAC-SHA256 no formato:
    HPDV1.<payload_base64url>.<assinatura_hmac_24chars>
    Impede adulteração manual de datas no config_pdv.json quando o PDV estiver offline.
    """
    payload_dict = {
        "v": 1,
        "cid": int(company_id),
        "doc": "".join(c for c in (company_document or "") if c.isdigit()),
        "en": 1 if enabled else 0,
        "exp": str(expires_at_iso or "")[:10],  # YYYY-MM-DD
        "rng": 1 if range_sync_enabled else 0,
        "iat": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    }
    raw_json = json.dumps(payload_dict, separators=(",", ":"), sort_keys=True).encode("utf-8")
    b64_payload = base64.urlsafe_b64encode(raw_json).decode("ascii").rstrip("=")
    sig = hmac.new(PDV_DESKTOP_LICENSE_SECRET, b64_payload.encode("ascii"), hashlib.sha256).hexdigest()[:24].upper()
    return f"HPDV1.{b64_payload}.{sig}"


class POSSessionSettingsUpdateRequest(BaseModel):
    validate_stock: bool = True
    branch_id: Optional[int] = None


def _build_license_status_response(company: Company, settings: Optional[CompanySettings]) -> dict:
    from datetime import timedelta as _td
    br_tz = timezone(_td(hours=-3))
    today_br = datetime.now(br_tz).date()

    enabled = bool(getattr(settings, "pdv_desktop_license_enabled", False)) if settings else False
    range_sync = bool(getattr(settings, "pdv_horus_range_sync_enabled", False)) if settings else False
    exp_dt = getattr(settings, "pdv_desktop_expires_at", None) if settings else None
    lic_key = getattr(settings, "pdv_desktop_license_key", None) if settings else None

    horus_sync_enabled = True
    if settings and getattr(settings, "b2c_showcases_config", None):
        raw_cfg = settings.b2c_showcases_config
        if isinstance(raw_cfg, str):
            try:
                raw_cfg = json.loads(raw_cfg)
            except Exception:
                raw_cfg = {}
        if isinstance(raw_cfg, dict):
            pdv_sync_cfg = raw_cfg.get("pdv_horus_sync") or {}
            if isinstance(pdv_sync_cfg, dict) and "enabled" in pdv_sync_cfg:
                horus_sync_enabled = bool(pdv_sync_cfg["enabled"])


    days_remaining = None
    is_expired = True
    exp_iso = None
    exp_br = None

    if exp_dt is not None:
        exp_date = exp_dt.date() if hasattr(exp_dt, "date") else exp_dt
        exp_iso = exp_date.strftime("%Y-%m-%d")
        exp_br = exp_date.strftime("%d/%m/%Y")
        days_remaining = (exp_date - today_br).days
        is_expired = days_remaining < 0

    is_valid = bool(company.module_pdv and enabled and exp_dt is not None and not is_expired)

    if not company.module_pdv:
        status_label = "MÓDULO PDV DESATIVADO NO SELLER"
    elif not enabled:
        status_label = "LICENÇA DESKTOP BLOQUEADA PELO MASTER"
    elif exp_dt is None:
        status_label = "SEM DATA DE VALIDADE DEFINIDA PELO MASTER"
    elif is_expired:
        status_label = f"LICENÇA EXPIRADA EM {exp_br}"
    else:
        status_label = f"LICENÇA ATIVA ATÉ {exp_br} ({days_remaining} dia(s) restante(s))"

    return {
        "company_id": company.id,
        "company_name": company.name,
        "module_pdv": bool(company.module_pdv),
        "enabled": enabled,
        "range_sync_enabled": range_sync,
        "horus_sync_enabled": horus_sync_enabled,
        "expires_at": exp_iso,

        "expires_at_br": exp_br,
        "days_remaining": days_remaining,
        "is_expired": is_expired,
        "is_valid": is_valid,
        "server_today": today_br.strftime("%Y-%m-%d"),
        "status_label": status_label,
        # Sempre envia a chave assinada atual (mesmo expirada ou bloqueada) para o HorusPDV.exe
        # sobrescrever imediatamente qualquer chave antiga que estivesse salva no config_pdv.json
        "license_key": lic_key,
        "horus_legacy_pagination": bool(getattr(settings, "horus_legacy_pagination", False)) if settings else False,
    }


@router.get("/desktop-license")
def get_pdv_desktop_license(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    """
    Consulta o status da licença do Horus PDV Desktop (.EXE) e retorna a chave
    assinada atualizada caso a licença esteja ativa e dentro da validade.
    """
    raw_type = getattr(current_user, "type", None) or getattr(current_user, "role", None)
    user_type = (getattr(raw_type, "value", None) or str(raw_type)).upper()
    is_master = "MASTER" in user_type
    if not is_master and getattr(current_user, "company_id", None) != company_id:
        raise HTTPException(status_code=403, detail="Acesso restrito a esta empresa.")

    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not settings:
        settings = CompanySettings(company_id=company_id)
        db.add(settings)
        db.commit()
        db.refresh(settings)

    # Se tiver data de expiração mas ainda não tiver a chave gerada, gera automaticamente
    if settings.pdv_desktop_expires_at and not settings.pdv_desktop_license_key:
        exp_str = settings.pdv_desktop_expires_at.strftime("%Y-%m-%d")
        settings.pdv_desktop_license_key = _generate_pdv_desktop_license_key(
            company_id=company.id,
            company_document=company.document or "",
            enabled=bool(settings.pdv_desktop_license_enabled),
            expires_at_iso=exp_str,
            range_sync_enabled=bool(settings.pdv_horus_range_sync_enabled),
        )
        db.commit()
        db.refresh(settings)

    return _build_license_status_response(company, settings)


@router.put("/desktop-license")
def update_pdv_desktop_license(
    company_id: int,
    payload: PDVDesktopLicenseUpdateRequest,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.require_master_user),
):
    """
    Exclusivo Master: Ativa/bloqueia a licença do Horus PDV Desktop (.EXE),
    define a data de validade (até quando o cliente pagou), libera ou bloqueia
    a rotina de sincronização por Range do Horus e gera a chave criptográfica.
    """
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not settings:
        settings = CompanySettings(company_id=company_id)
        db.add(settings)

    exp_dt = None
    exp_str = ""
    if payload.expires_at and str(payload.expires_at).strip():
        raw_exp = str(payload.expires_at).strip()[:10]
        try:
            parsed = datetime.strptime(raw_exp, "%Y-%m-%d")
            exp_dt = parsed.replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
            exp_str = raw_exp
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato de data inválido. Use AAAA-MM-DD.")

    settings.pdv_desktop_license_enabled = bool(payload.enabled)
    settings.pdv_horus_range_sync_enabled = bool(payload.range_sync_enabled)
    settings.pdv_desktop_expires_at = exp_dt

    if payload.horus_sync_enabled is not None:
        raw_cfg = getattr(settings, "b2c_showcases_config", None) or {}
        if isinstance(raw_cfg, str):
            try:
                raw_cfg = json.loads(raw_cfg)
            except Exception:
                raw_cfg = {}
        if not isinstance(raw_cfg, dict):
            raw_cfg = {}
        pdv_sync_cfg = raw_cfg.get("pdv_horus_sync") or {}
        if not isinstance(pdv_sync_cfg, dict):
            pdv_sync_cfg = {}
        pdv_sync_cfg["enabled"] = bool(payload.horus_sync_enabled)
        raw_cfg["pdv_horus_sync"] = pdv_sync_cfg
        settings.b2c_showcases_config = dict(raw_cfg)
        flag_modified(settings, "b2c_showcases_config")


    if exp_str:
        settings.pdv_desktop_license_key = _generate_pdv_desktop_license_key(
            company_id=company.id,
            company_document=company.document or "",
            enabled=bool(payload.enabled),
            expires_at_iso=exp_str,
            range_sync_enabled=bool(payload.range_sync_enabled),
        )
    else:
        settings.pdv_desktop_license_key = None

    db.commit()
    db.refresh(settings)

    return _build_license_status_response(company, settings)


@router.put("/sessions/{session_id}/settings", response_model=POSSessionResponse)
def update_pos_session_settings(
    company_id: int,
    session_id: int,
    payload: POSSessionSettingsUpdateRequest,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    """
    Atualiza as configurações operacionais de uma sessão de caixa (ex: ativar/desativar
    validação de estoque 'validate_stock' ou alterar filial vinculada 'branch_id').
    """
    _assert_pos_access(current_user, company_id, db)
    session = db.query(POSSession).filter(
        POSSession.id == session_id,
        POSSession.company_id == company_id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sessão não encontrada.")
    session.validate_stock = bool(payload.validate_stock)
    if payload.branch_id is not None:
        session.branch_id = payload.branch_id if payload.branch_id > 0 else None
    db.commit()
    db.refresh(session)
    return session


@router.post("/horus-catalog-range")
async def sync_horus_catalog_by_range(
    company_id: int,
    payload: HorusCatalogRangeRequest,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    """
    Sincroniza produtos do Horus ERP por sequência de código (`COD_ITEM_INI` a `COD_ITEM_FIM`),
    respeitando estritamente:
    1. Validade da licença do Horus PDV Desktop e flag `pdv_horus_range_sync_enabled` liberados pelo Master.
    2. Configuração `horus_legacy_pagination` (OFFSET/LIMIT) do Seller no Master.
    3. Consulta em lote de saldo no endpoint `Estoque` para o mesmo range (`COD_ITEM_INI`..`COD_ITEM_FIM`).
    4. Deduplicação rigorosa por `sku`/`cod_item` e `barcode`/`isbn` para jamais duplicar produtos.
    """
    company = _assert_pos_access(current_user, company_id, db)
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not settings or not settings.horus_enabled:
        raise HTTPException(status_code=400, detail="Integração Horus ERP não está habilitada para este Seller.")

    raw_type = getattr(current_user, "type", None) or getattr(current_user, "role", None)
    user_type = (getattr(raw_type, "value", None) or str(raw_type)).upper()
    is_master = "MASTER" in user_type

    lic_status = _build_license_status_response(company, settings)
    if not is_master:
        if not lic_status["is_valid"]:
            raise HTTPException(
                status_code=403,
                detail=f"Acesso bloqueado: {lic_status['status_label']}. Solicite a renovação da chave ao administrador.",
            )
        if not lic_status["range_sync_enabled"]:
            raise HTTPException(
                status_code=403,
                detail="A rotina de Sincronização de Catálogo por Sequência Horus (COD_ITEM_INI/FIM) não está habilitada na sua licença. Solicite a liberação no painel Master.",
            )

    cod_ini = max(1, int(payload.cod_item_ini))
    cod_fim = max(cod_ini, int(payload.cod_item_fim))
    if (cod_fim - cod_ini) > 5000:
        raise HTTPException(
            status_code=400,
            detail="O intervalo máximo permitido por requisição é de 5.000 códigos (ex: 1 a 5000). Use o passo em lotes no PDV.",
        )

    # Identifica filial da sessão (se houver) ou padrão do Seller
    cod_empresa = str(settings.horus_company or "").strip()
    cod_filial = str(settings.horus_branch or "").strip()
    if payload.branch_id:
        branch = db.query(SellerBranch).filter(
            SellerBranch.id == payload.branch_id,
            SellerBranch.company_id == company_id,
        ).first()
        if branch and branch.cod_empresa and branch.cod_filial:
            cod_empresa = str(branch.cod_empresa).strip()
            cod_filial = str(branch.cod_filial).strip()
    elif payload.session_id:
        sess = db.query(POSSession).filter(
            POSSession.id == payload.session_id,
            POSSession.company_id == company_id,
        ).first()
        if sess and sess.branch_id:
            branch = db.query(SellerBranch).filter(
                SellerBranch.id == sess.branch_id,
                SellerBranch.company_id == company_id,
            ).first()
            if branch and branch.cod_empresa and branch.cod_filial:
                cod_empresa = str(branch.cod_empresa).strip()
                cod_filial = str(branch.cod_filial).strip()

    try:
        client = HorusProductSearch(db, company_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Falha ao iniciar cliente Horus: {exc}")

    raw_items: List[dict] = []
    stock_by_cod_item: dict = {}

    try:
        # 1. Consulta Busca_Acervo por COD_ITEM_INI e COD_ITEM_FIM (respeitando horus_legacy_pagination)
        raw = await client.busca_acervo_por_range(
            cod_item_ini=cod_ini,
            cod_item_fim=cod_fim,
            offset=payload.offset,
            limit=payload.limit,
            data_ini=payload.data_ini,
            data_fim=payload.data_fim,
        )
        if isinstance(raw, list):
            for it in raw:
                if isinstance(it, dict) and not (it.get("Falha") or it.get("FALHA") == "S"):
                    raw_items.append(it)
        elif isinstance(raw, dict) and not (raw.get("Falha") or raw.get("FALHA") == "S"):
            raw_items.append(raw)

        # Fallback para Busca_AcervoB2B caso Busca_Acervo padrão retorne vazio e a empresa tenha GUID B2B
        if not raw_items and getattr(settings, "horus_default_b2b_guid", None):
            from app.integrators.horus_products import HorusProducts
            b2b_client = HorusProducts(db, company_id)
            try:
                raw_b2b = await b2b_client.busca_acervo_b2b(
                    id_doc=company.document,
                    id_guid=settings.horus_default_b2b_guid,
                    offset=payload.offset,
                    limit=payload.limit,
                    data_ini=payload.data_ini,
                    data_fim=payload.data_fim,
                    COD_ITEM_INI=cod_ini,
                    COD_ITEM_FIM=cod_fim,
                )
                if isinstance(raw_b2b, list):
                    for it in raw_b2b:
                        if isinstance(it, dict) and not (it.get("Falha") or it.get("FALHA") == "S"):
                            raw_items.append(it)
                elif isinstance(raw_b2b, dict) and not (raw_b2b.get("Falha") or raw_b2b.get("FALHA") == "S"):
                    raw_items.append(raw_b2b)
            finally:
                await b2b_client.close()

        # 2. Se encontrou itens e temos Empresa/Filial configuradas, busca o saldo do range em lote único
        if raw_items and cod_empresa and cod_filial:
            try:
                raw_stock = await asyncio.wait_for(
                    client.busca_estoque_por_range(
                        cod_item_ini=cod_ini,
                        cod_item_fim=cod_fim,
                        cod_empresa=cod_empresa,
                        cod_filial=cod_filial,
                        offset=0,
                        limit=max(2000, len(raw_items) * 3),
                    ),
                    timeout=12.0,
                )
                stock_list = raw_stock if isinstance(raw_stock, list) else ([raw_stock] if isinstance(raw_stock, dict) else [])
                for st_row in stock_list:
                    if not isinstance(st_row, dict) or st_row.get("Falha") or st_row.get("FALHA") == "S":
                        continue
                    c_it = st_row.get("COD_ITEM")
                    if c_it is not None:
                        try:
                            c_int = int(c_it)
                            s_val = float(st_row.get("SALDO_DISPONIVEL") or st_row.get("QTD_SALDO") or 0.0)
                            stock_by_cod_item[c_int] = stock_by_cod_item.get(c_int, 0.0) + s_val
                        except (ValueError, TypeError):
                            pass
            except Exception as st_err:
                logger.debug(f"Aviso ao consultar Estoque em lote ({cod_ini}..{cod_fim}): {st_err}")
    except Exception as exc:
        logger.error(f"Erro na sincronização Horus por range ({cod_ini}..{cod_fim}): {exc}")
        raise HTTPException(status_code=502, detail=f"Erro ao consultar Horus ERP no intervalo {cod_ini} a {cod_fim}: {exc}")
    finally:
        await client.close()

    dedup_batch_map: dict = {}
    seen_barcodes_in_batch: dict = {}
    min_cod = None
    max_cod = None

    for it in raw_items:
        cod_item_raw = it.get("COD_ITEM")
        cod_item_int = None
        try:
            cod_item_int = int(cod_item_raw)
        except (ValueError, TypeError):
            pass

        if cod_item_int is not None:
            if min_cod is None or cod_item_int < min_cod:
                min_cod = cod_item_int
            if max_cod is None or cod_item_int > max_cod:
                max_cod = cod_item_int

        cod_barra = _clean_barcode(it.get("COD_BARRA_ITEM") or it.get("BARRAS_ISBN") or it.get("COD_ISBN_ITEM") or cod_item_raw or "")
        if not cod_barra:
            continue

        title = str(it.get("NOM_ITEM") or "Produto sem título").strip()
        publisher = str(it.get("NOM_EDITORA") or it.get("EDITORA") or "").strip()
        price_val = (
            it.get("VLR_CAPA")
            or it.get("PRECO")
            or it.get("VLR_ITEM")
            or it.get("PRECO_TABELA")
            or it.get("PRECO_VENDA")
            or it.get("VLR_PRECO")
            or 0.0
        )
        price = parse_horus_price(price_val)
        if price <= 0:
            continue

        if cod_item_int is not None and cod_item_int in stock_by_cod_item:
            stock_val = stock_by_cod_item[cod_item_int]
        else:
            try:
                stock_val = float(it.get("SALDO_DISPONIVEL") or it.get("SALDO_GERAL") or it.get("QTD_SALDO") or 0.0)
            except (ValueError, TypeError):
                stock_val = 0.0

        sku_str = str(cod_item_int if cod_item_int is not None else (cod_item_raw or cod_barra))
        item_dict = {
            "id": sku_str,
            "cod_item": cod_item_int,
            "sku": sku_str,
            "isbn": cod_barra,
            "barcode": cod_barra,
            "name": title,
            "title": title,
            "brand": publisher,
            "publisher": publisher,
            "price": round(price, 2),
            "stock_quantity": int(stock_val),
            "stock": round(stock_val, 2),
            "horus_item_code": sku_str,
            "source": "HORUS_RANGE_SYNC",
        }
        # Deduplicação por SKU e por Barcode dentro do lote
        if cod_barra in seen_barcodes_in_batch:
            prev_sku = seen_barcodes_in_batch[cod_barra]
            dedup_batch_map[prev_sku] = item_dict
        else:
            seen_barcodes_in_batch[cod_barra] = sku_str
            dedup_batch_map[sku_str] = item_dict

    formatted_items = list(dedup_batch_map.values())

    # Se session_id foi informado e merge_into_session=True, faz upsert incremental sem jamais duplicar
    if payload.session_id and payload.merge_into_session and formatted_items:
        sess = db.query(POSSession).filter(
            POSSession.id == payload.session_id,
            POSSession.company_id == company_id,
        ).first()
        if sess:
            existing_rows = db.query(POSSessionProduct).filter(
                POSSessionProduct.session_id == sess.id
            ).all()
            by_sku = {}
            by_barcode = {}
            for r in existing_rows:
                if r.horus_item_code:
                    by_sku[str(r.horus_item_code).strip()] = r
                if r.sku:
                    by_sku[str(r.sku).strip()] = r
                if r.barcode:
                    by_barcode[str(r.barcode).strip()] = r

            new_objs = []
            for fi in formatted_items:
                sku_key = str(fi["sku"]).strip()
                bar_key = str(fi["barcode"]).strip()
                row_obj = by_sku.get(sku_key) or by_barcode.get(bar_key)
                if row_obj:
                    row_obj.barcode = bar_key
                    row_obj.sku = sku_key
                    row_obj.horus_item_code = fi["horus_item_code"]
                    row_obj.title = fi["title"]
                    row_obj.publisher = fi["publisher"]
                    row_obj.price = fi["price"]
                    row_obj.stock = fi["stock"]
                    by_sku[sku_key] = row_obj
                    by_barcode[bar_key] = row_obj
                else:
                    new_row = POSSessionProduct(
                        session_id=sess.id,
                        company_id=company_id,
                        barcode=bar_key,
                        sku=sku_key,
                        title=fi["title"],
                        publisher=fi["publisher"],
                        price=fi["price"],
                        stock=fi["stock"],
                        horus_item_code=fi["horus_item_code"],
                        source="HORUS_RANGE_SYNC",
                    )
                    new_objs.append(new_row)
                    by_sku[sku_key] = new_row
                    by_barcode[bar_key] = new_row

            if new_objs:
                db.bulk_save_objects(new_objs)
            sess.products_count = len(existing_rows) + len(new_objs)
            db.commit()

    return {
        "status": "ok",
        "cod_item_ini": cod_ini,
        "cod_item_fim": cod_fim,
        "count": len(formatted_items),
        "raw_horus_count": len(raw_items),
        "min_cod_item": min_cod,
        "max_cod_item": max_cod,
        "horus_legacy_pagination": bool(getattr(settings, "horus_legacy_pagination", False)),
        "items": formatted_items,
    }


# ─────────────────────────────────────────────────────────────────────────────
# SINTETIZAÇÃO DE VENDAS DO PDV E ENVIO DE PEDIDOS AO HORUS ERP (MÁX R$ 10.000)
# ─────────────────────────────────────────────────────────────────────────────

def _upper_horus_params(d: dict) -> dict:
    """Garante que todas as chaves e valores string sejam enviados em CAIXA ALTA ao Horus ERP (Regra 11)."""
    out = {}
    for k, v in d.items():
        if v is None or v == "":
            continue
        if isinstance(v, str):
            out[str(k).upper()] = v.strip().upper()
        else:
            out[str(k).upper()] = v
    return out


def _extract_horus_err_msg(resp: object) -> Optional[str]:
    """Retorna mensagem de falha do Horus caso o retorno indique erro."""
    if isinstance(resp, list) and len(resp) > 0 and isinstance(resp[0], dict):
        first = resp[0]
        if first.get("Falha") or str(first.get("FALHA") or "").upper() == "S":
            return str(first.get("Mensagem") or first.get("MENSAGEM") or first)
    elif isinstance(resp, dict):
        if resp.get("Falha") or str(resp.get("FALHA") or "").upper() == "S":
            return str(resp.get("Mensagem") or resp.get("MENSAGEM") or resp)
    return None


@router.get("/horus-sync/defaults")
def get_pos_horus_sync_defaults(
    company_id: int,
    session_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    """
    Retorna os parâmetros padrão do Horus configurados para a empresa (ou sessão/filial),
    facilitando o preenchimento na tela de Sintetização & Envio de Vendas para o Horus.
    """
    _assert_pos_access(current_user, company_id, db)
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()

    cod_empresa = str(getattr(settings, "horus_company", "") or "").strip()
    cod_filial = str(getattr(settings, "horus_branch", "") or "").strip()
    branch_name = None

    if session_id:
        sess = db.query(POSSession).filter(
            POSSession.id == session_id,
            POSSession.company_id == company_id,
        ).first()
        if sess and sess.branch_id:
            br = db.query(SellerBranch).filter(SellerBranch.id == sess.branch_id).first()
            if br:
                cod_empresa = str(br.cod_empresa or cod_empresa).strip()
                cod_filial = str(br.cod_filial or cod_filial).strip()
                branch_name = br.nome

    b2c_cfg = {}
    pdv_sync_cfg = {}
    session_saved_cfg = {}
    if settings and getattr(settings, "b2c_showcases_config", None):
        raw_cfg = settings.b2c_showcases_config
        if isinstance(raw_cfg, str):
            try:
                raw_cfg = json.loads(raw_cfg)
            except Exception:
                raw_cfg = {}
        if isinstance(raw_cfg, dict):
            b2c_cfg = raw_cfg.get("horus_integration") or {}
            pdv_sync_cfg = raw_cfg.get("pdv_horus_sync") or {}
            if session_id and isinstance(pdv_sync_cfg.get("sessions"), dict):
                session_saved_cfg = pdv_sync_cfg["sessions"].get(str(session_id)) or {}

    def _pick(key: str, default_val: str = "") -> str:
        if session_saved_cfg and session_saved_cfg.get(key) not in (None, ""):
            return str(session_saved_cfg.get(key)).strip()
        if pdv_sync_cfg and pdv_sync_cfg.get(key) not in (None, ""):
            return str(pdv_sync_cfg.get(key)).strip()
        return default_val

    fallback_param_fiscal = str(
        b2c_cfg.get("cod_param_fiscal_intra")
        or b2c_cfg.get("cod_param_fiscal_inter")
        or "1"
    ).strip()

    return {
        "company_id": company_id,
        "cod_empresa": cod_empresa,
        "cod_filial": cod_filial,
        "branch_name": branch_name,
        "horus_sync_enabled": bool(pdv_sync_cfg.get("enabled", True)) if isinstance(pdv_sync_cfg, dict) else True,
        "cod_cli": _pick("cod_cli", ""),
        "client_name": _pick("client_name", ""),
        "tipo_pedido": _pick("tipo_pedido", str(b2c_cfg.get("tipo_pedido") or "L").strip()).upper(),
        "cod_param_fiscal": _pick("cod_param_fiscal", fallback_param_fiscal),
        "cod_metodo": _pick("cod_metodo", str(b2c_cfg.get("cod_metodo") or "").strip()),
        "cod_tpo_end": _pick("cod_tpo_end", str(b2c_cfg.get("cod_endereco") or "1").strip()),
        "cod_transp": _pick("cod_transp", str(b2c_cfg.get("cod_transp") or "").strip()),
        "frete_emit_dest": _pick("frete_emit_dest", str(b2c_cfg.get("frete_emit_dest") or "E").strip()).upper(),
        "status_envio_erp": _pick("status_envio_erp", str(b2c_cfg.get("status_envio_erp") or "").strip()).upper(),
        "obs_extra": _pick("obs_extra", ""),
        "max_order_amount": 10000.0,
    }


@router.put("/horus-sync/defaults")
def update_pos_horus_sync_defaults(
    company_id: int,
    payload: POSHorusSyncDefaultsUpdateRequest,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    """
    Salva os parâmetros padrão de envio ao Horus (COD_CLI, COD_TRANSP, CFOP, Tipo Pedido, etc.)
    para o seller (e opcionalmente por sessão do PDV), mantendo-os guardados para os próximos envios.
    """
    _assert_pos_access(current_user, company_id, db)
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not settings:
        settings = CompanySettings(company_id=company_id)
        db.add(settings)

    raw_cfg = getattr(settings, "b2c_showcases_config", None) or {}
    if isinstance(raw_cfg, str):
        try:
            raw_cfg = json.loads(raw_cfg)
        except Exception:
            raw_cfg = {}
    if not isinstance(raw_cfg, dict):
        raw_cfg = {}

    pdv_sync_cfg = raw_cfg.get("pdv_horus_sync") or {}
    if not isinstance(pdv_sync_cfg, dict):
        pdv_sync_cfg = {}

    new_vals = {
        "cod_cli": str(payload.cod_cli or "").strip().upper(),
        "client_name": str(payload.client_name or "").strip(),
        "cod_transp": str(payload.cod_transp or "").strip().upper(),
        "cod_param_fiscal": str(payload.cod_param_fiscal or "1").strip().upper(),
        "tipo_pedido": str(payload.tipo_pedido or "L").strip().upper(),
        "cod_metodo": str(payload.cod_metodo or "").strip().upper(),
        "cod_tpo_end": str(payload.cod_tpo_end or "1").strip().upper(),
        "frete_emit_dest": str(payload.frete_emit_dest or "E").strip().upper(),
        "status_envio_erp": str(payload.status_envio_erp or "").strip().upper(),
        "obs_extra": str(payload.obs_extra or "").strip().upper(),
    }

    # Sempre atualiza o padrão geral do seller e, se houver session_id, também salva para a sessão
    for k, v in new_vals.items():
        pdv_sync_cfg[k] = v

    if payload.session_id:
        sessions_map = pdv_sync_cfg.get("sessions") or {}
        if not isinstance(sessions_map, dict):
            sessions_map = {}
        sessions_map[str(payload.session_id)] = dict(new_vals)
        pdv_sync_cfg["sessions"] = sessions_map

    raw_cfg["pdv_horus_sync"] = pdv_sync_cfg
    settings.b2c_showcases_config = dict(raw_cfg)
    flag_modified(settings, "b2c_showcases_config")

    db.commit()
    db.refresh(settings)

    return get_pos_horus_sync_defaults(
        company_id=company_id,
        session_id=payload.session_id,
        db=db,
        current_user=current_user,
    )



@router.get("/horus-sync/lookup-client")
async def lookup_horus_client_for_pos(
    company_id: int,
    query: str = Query(..., description="CPF, CNPJ ou COD_CLI para localizar no Horus"),
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    """
    Busca um cliente no Horus ERP por CPF, CNPJ ou COD_CLI para auxiliar no preenchimento
    do Código do Cliente antes de enviar as vendas sintetizadas.
    """
    _assert_pos_access(current_user, company_id, db)
    from app.integrators.horus_clients import HorusClients

    clean_digits = "".join(filter(str.isdigit, query or ""))
    if not clean_digits:
        raise HTTPException(status_code=400, detail="Informe um código, CPF ou CNPJ válido.")

    horus_clients = HorusClients(db, company_id)
    try:
        if len(clean_digits) == 11:
            params = {"CPF": clean_digits}
        elif len(clean_digits) == 14:
            params = {"CNPJ": clean_digits}
        else:
            params = {"COD_CLI": clean_digits}

        res = await horus_clients.get("Busca_Cliente", params=params)
        err = _extract_horus_err_msg(res)
        if err:
            raise HTTPException(status_code=404, detail=f"Horus: {err}")

        item = res[0] if isinstance(res, list) and len(res) > 0 else (res if isinstance(res, dict) else None)
        if not item:
            raise HTTPException(status_code=404, detail="Cliente não localizado no Horus.")

        cod_cli = str(item.get("COD_CLI") or item.get("CODIGO") or "").strip()
        nom_cli = str(item.get("NOM_CLI") or item.get("NOME") or item.get("RAZAO_SOCIAL") or "").strip()
        doc = str(item.get("CNPJ") or item.get("CPF") or clean_digits).strip()
        uf = str(item.get("SIGLA_UF") or item.get("UF") or "").strip()

        return {
            "found": True,
            "cod_cli": cod_cli,
            "name": nom_cli,
            "document": doc,
            "uf": uf,
            "raw": item,
        }
    finally:
        await horus_clients.close()


@router.post("/horus-sync/send")
async def send_synthesized_pos_sales_to_horus(
    company_id: int,
    payload: POSHorusSyncSendRequest,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    """
    Sintetiza (unifica) os itens das vendas selecionadas do PDV e envia um ou mais pedidos
    para o Horus ERP via InsPedidoVenda + InsItensPedidoVenda, respeitando rigorosamente o
    limite máximo de R$ 10.000,00 por pedido e fechando 100% o valor das vendas selecionadas.
    """
    import math
    from app.integrators.horus_clients import HorusClients

    _assert_pos_access(current_user, company_id, db)

    cod_cli = (payload.cod_cli or "").strip().upper()
    if not cod_cli:
        raise HTTPException(status_code=400, detail="Informe o Código do Cliente no Horus (COD_CLI).")

    if not payload.sale_ids:
        raise HTTPException(status_code=400, detail="Selecione ao menos uma venda para sintetizar e enviar ao Horus.")

    sales = (
        db.query(POSSale)
        .filter(
            POSSale.company_id == company_id,
            POSSale.id.in_(payload.sale_ids),
            POSSale.status == "COMPLETED",
        )
        .order_by(POSSale.sold_at.asc(), POSSale.id.asc())
        .all()
    )
    if not sales:
        raise HTTPException(
            status_code=404,
            detail="Nenhuma venda concluída encontrada para os IDs selecionados.",
        )

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not settings or not getattr(settings, "horus_enabled", False):
        raise HTTPException(
            status_code=400,
            detail="A integração com o Horus ERP não está habilitada nas configurações desta empresa.",
        )

    # Resolve Empresa e Filial (priorizando a filial da sessão quando vinculada)
    cod_empresa = str(getattr(settings, "horus_company", "") or "").strip().upper()
    cod_filial = str(getattr(settings, "horus_branch", "") or "").strip().upper()
    sess_title = "VENDAS GERAIS"

    target_session_id = payload.session_id or sales[0].session_id
    if target_session_id:
        sess = db.query(POSSession).filter(
            POSSession.id == target_session_id,
            POSSession.company_id == company_id,
        ).first()
        if sess:
            sess_title = (sess.title or sess.code or f"SESSAO {sess.id}").strip().upper()
            if sess.branch_id:
                br = db.query(SellerBranch).filter(SellerBranch.id == sess.branch_id).first()
                if br:
                    cod_empresa = str(br.cod_empresa or cod_empresa).strip().upper()
                    cod_filial = str(br.cod_filial or cod_filial).strip().upper()

    # 1. Coleta todos os itens das vendas selecionadas rateando eventual desconto global da venda
    # para que a soma dos itens feche exatos 100% com o valor vendido em cada venda
    grouped_by_barcode: dict = {}
    selected_sales_total = 0.0

    for s in sales:
        sale_total = round(float(s.total_amount or 0.0), 2)
        selected_sales_total = round(selected_sales_total + sale_total, 2)
        sale_items = list(s.items or [])
        if not sale_items:
            continue

        raw_items_sum = round(sum(float(it.total_price or 0.0) for it in sale_items), 2)
        ratio = (sale_total / raw_items_sum) if (raw_items_sum > 0 and abs(raw_items_sum - sale_total) >= 0.01) else 1.0

        remaining_sale_val = sale_total
        for idx, it in enumerate(sale_items):
            qty = max(1, int(round(float(it.quantity or 1))))
            if idx == len(sale_items) - 1 and ratio != 1.0:
                net_item_total = round(max(0.01, remaining_sale_val), 2)
            else:
                net_item_total = round(float(it.total_price or 0.0) * ratio, 2)
                remaining_sale_val = round(remaining_sale_val - net_item_total, 2)

            bcode = str(it.barcode or it.sku or it.horus_item_code or f"ITEM-{it.id}").strip().upper()
            if bcode not in grouped_by_barcode:
                grouped_by_barcode[bcode] = {
                    "barcode": bcode,
                    "sku": str(it.sku or "").strip().upper() or None,
                    "horus_item_code": str(it.horus_item_code or "").strip().upper() or None,
                    "product_id": it.product_id,
                    "title": str(it.title or "Item PDV").strip(),
                    "qty": 0,
                    "total_price": 0.0,
                }
            grouped_by_barcode[bcode]["qty"] += qty
            grouped_by_barcode[bcode]["total_price"] = round(
                grouped_by_barcode[bcode]["total_price"] + net_item_total, 2
            )
            if not grouped_by_barcode[bcode]["horus_item_code"] and it.horus_item_code:
                grouped_by_barcode[bcode]["horus_item_code"] = str(it.horus_item_code).strip().upper()

    if not grouped_by_barcode:
        raise HTTPException(status_code=400, detail="As vendas selecionadas não possuem itens válidos para envio.")

    horus_clients = HorusClients(db, company_id)
    try:
        # 2. Resolve COD_ITEM de cada produto sintetizado e garante fechamento exato de centavos
        synthesized_lines = []
        for bcode, g in grouped_by_barcode.items():
            cod_item_val = g["horus_item_code"]

            # Busca no cadastro local se ainda não tiver cod_item numérico/válido
            if (not cod_item_val or cod_item_val == bcode and len(bcode) >= 10) and g["product_id"]:
                p_obj = db.query(Product).filter(Product.id == g["product_id"]).first()
                if p_obj and p_obj.horus_cod_item:
                    cod_item_val = str(p_obj.horus_cod_item).strip().upper()

            if not cod_item_val or (cod_item_val == bcode and len(bcode) >= 10):
                p_by_ean = (
                    db.query(Product)
                    .filter(
                        Product.company_id == company_id,
                        or_(Product.ean_gtin == bcode, Product.sku == bcode),
                    )
                    .first()
                )
                if p_by_ean and p_by_ean.horus_cod_item:
                    cod_item_val = str(p_by_ean.horus_cod_item).strip().upper()

            if not cod_item_val or (cod_item_val == bcode and len(bcode) >= 10):
                try:
                    acervo = await horus_clients.get("Busca_Acervo", params={"BARRAS_ISBN": bcode})
                    if isinstance(acervo, list) and len(acervo) > 0 and isinstance(acervo[0], dict) and not acervo[0].get("Falha"):
                        found_cod = str(acervo[0].get("COD_ITEM") or acervo[0].get("CODIGO") or "").strip().upper()
                        if found_cod:
                            cod_item_val = found_cod
                except Exception:
                    pass

            if not cod_item_val:
                cod_item_val = g["sku"] or bcode

            total_qty = int(g["qty"])
            total_val = round(float(g["total_price"]), 2)
            base_unit = round(total_val / total_qty, 2)
            reconstructed = round(base_unit * total_qty, 2)
            diff = round(total_val - reconstructed, 2)

            if abs(diff) < 0.005 or total_qty == 1:
                final_unit = round(total_val / total_qty, 2)
                synthesized_lines.append({
                    "barcode": bcode,
                    "cod_item": cod_item_val,
                    "title": g["title"],
                    "qty": total_qty,
                    "unit_price": final_unit,
                    "total_price": round(final_unit * total_qty, 2),
                })
            else:
                # Divide em (total_qty - 1) unidades com base_unit e 1 unidade ajustada com o centavo residual
                main_qty = total_qty - 1
                adj_unit = round(base_unit + diff, 2)
                if adj_unit > 0:
                    synthesized_lines.append({
                        "barcode": bcode,
                        "cod_item": cod_item_val,
                        "title": g["title"],
                        "qty": main_qty,
                        "unit_price": base_unit,
                        "total_price": round(base_unit * main_qty, 2),
                    })
                    synthesized_lines.append({
                        "barcode": bcode,
                        "cod_item": cod_item_val,
                        "title": g["title"],
                        "qty": 1,
                        "unit_price": adj_unit,
                        "total_price": adj_unit,
                    })
                else:
                    synthesized_lines.append({
                        "barcode": bcode,
                        "cod_item": cod_item_val,
                        "title": g["title"],
                        "qty": total_qty,
                        "unit_price": base_unit,
                        "total_price": reconstructed,
                    })

        # 3. Quebra automática em Lotes (Pedidos) respeitando o teto máximo de R$ 10.000,00 por pedido
        max_limit = min(10000.0, max(100.0, float(payload.max_order_amount or 10000.0)))
        batches = []
        current_batch = []
        current_batch_total = 0.0

        for line in synthesized_lines:
            rem_qty = int(line["qty"])
            u_price = float(line["unit_price"])

            while rem_qty > 0:
                space_left = round(max_limit - current_batch_total, 2)
                if u_price <= 0:
                    fit_qty = rem_qty
                else:
                    fit_qty = int(math.floor((space_left + 1e-6) / u_price))

                if fit_qty <= 0:
                    if current_batch:
                        batches.append({
                            "items": current_batch,
                            "total_amount": round(current_batch_total, 2),
                            "total_qty": sum(i["qty"] for i in current_batch),
                        })
                        current_batch = []
                        current_batch_total = 0.0
                        continue
                    else:
                        # Caso extremo: 1 única unidade custa mais que o limite
                        fit_qty = 1

                take_qty = min(rem_qty, fit_qty)
                part_total = round(take_qty * u_price, 2)
                current_batch.append({
                    "barcode": line["barcode"],
                    "cod_item": line["cod_item"],
                    "title": line["title"],
                    "qty": take_qty,
                    "unit_price": u_price,
                    "total_price": part_total,
                })
                current_batch_total = round(current_batch_total + part_total, 2)
                rem_qty -= take_qty

                if rem_qty > 0:
                    batches.append({
                        "items": current_batch,
                        "total_amount": round(current_batch_total, 2),
                        "total_qty": sum(i["qty"] for i in current_batch),
                    })
                    current_batch = []
                    current_batch_total = 0.0

        if current_batch:
            batches.append({
                "items": current_batch,
                "total_amount": round(current_batch_total, 2),
                "total_qty": sum(i["qty"] for i in current_batch),
            })

        # 4. Envia cada lote (pedido) para o Horus ERP via InsPedidoVenda + InsItensPedidoVenda
        now_tag = datetime.now(BRT_TZ).strftime("%y%m%d%H%M%S")
        tipo_ped = str(payload.tipo_pedido or "L").strip().upper()[:1] or "L"
        created_orders = []
        all_warnings = []

        for idx, batch in enumerate(batches, start=1):
            cod_origem = f"PDV-{company_id}-{now_tag}-{idx}".upper()
            obs_parts = [
                f"PDV SINTETIZADO | {sess_title}",
                f"LOTE {idx}/{len(batches)}",
                f"{len(sales)} VENDA(S)",
            ]
            if payload.obs_extra and payload.obs_extra.strip():
                obs_parts.append(payload.obs_extra.strip().upper())
            obs_pedido = " | ".join(obs_parts).upper()[:240]

            pedido_params = {
                "TIPO_PEDIDO_V_T_D": tipo_ped,
                "COD_PEDIDO_ORIGEM": cod_origem,
                "COD_CLI": cod_cli,
                "OBS_PEDIDO": obs_pedido,
            }
            if cod_empresa:
                pedido_params["COD_EMPRESA"] = cod_empresa
            if cod_filial:
                pedido_params["COD_FILIAL"] = cod_filial
            if payload.cod_param_fiscal and payload.cod_param_fiscal.strip():
                pedido_params["COD_PARAM_FISCAL"] = payload.cod_param_fiscal.strip().upper()
            if payload.cod_metodo and payload.cod_metodo.strip():
                pedido_params["COD_METODO"] = payload.cod_metodo.strip().upper()
            if payload.cod_tpo_end and payload.cod_tpo_end.strip():
                pedido_params["COD_TPO_END"] = payload.cod_tpo_end.strip().upper()
            if payload.cod_transp and payload.cod_transp.strip():
                pedido_params["COD_TRANSP"] = payload.cod_transp.strip().upper()
            if payload.frete_emit_dest and payload.frete_emit_dest.strip():
                pedido_params["FRETE_EMIT_DEST"] = payload.frete_emit_dest.strip().upper()

            pedido_params = _upper_horus_params(pedido_params)
            ped_res = await horus_clients.get("InsPedidoVenda", params=pedido_params)
            ped_err = _extract_horus_err_msg(ped_res)
            if ped_err:
                raise HTTPException(
                    status_code=422,
                    detail=f"O Horus recusou a criação do Pedido (Lote {idx}/{len(batches)}): {ped_err}",
                )

            cod_ped_venda = None
            if isinstance(ped_res, list) and len(ped_res) > 0 and isinstance(ped_res[0], dict):
                cod_ped_venda = str(ped_res[0].get("COD_PED_VENDA") or "").strip().upper() or None
            elif isinstance(ped_res, dict):
                cod_ped_venda = str(ped_res.get("COD_PED_VENDA") or "").strip().upper() or None

            if not cod_ped_venda:
                raise HTTPException(
                    status_code=422,
                    detail=f"O Horus não retornou o número do pedido (COD_PED_VENDA) no Lote {idx}/{len(batches)}. Resposta: {ped_res}",
                )

            items_inserted = 0
            batch_warnings = []
            for b_it in batch["items"]:
                item_params = {
                    "COD_PED_VENDA": cod_ped_venda,
                    "COD_ITEM": b_it["cod_item"],
                    "QTD_PEDIDA": b_it["qty"],
                    "VLR_LIQUIDO": round(float(b_it["unit_price"]), 2),
                    "COD_CLI": cod_cli,
                }
                if cod_empresa:
                    item_params["COD_EMPRESA"] = cod_empresa
                if cod_filial:
                    item_params["COD_FILIAL"] = cod_filial

                item_params = _upper_horus_params(item_params)
                it_res = await horus_clients.get("InsItensPedidoVenda", params=item_params)
                it_err = _extract_horus_err_msg(it_res)
                if it_err:
                    warn_msg = f"Lote {idx} (Pedido #{cod_ped_venda}) - Item {b_it['barcode']} (COD_ITEM {b_it['cod_item']}): {it_err}"
                    batch_warnings.append(warn_msg)
                    all_warnings.append(warn_msg)
                else:
                    items_inserted += 1

            # Opcional: avançar status no Horus se solicitado (ex: LEX / LAP)
            target_erp_status = (payload.status_envio_erp or "").strip().upper()
            if target_erp_status:
                alt_params = _upper_horus_params({
                    "COD_EMPRESA": cod_empresa,
                    "COD_FILIAL": cod_filial,
                    "COD_CLI": cod_cli,
                    "COD_PED_VENDA": cod_ped_venda,
                    "STA_PEDIDO": target_erp_status,
                })
                try:
                    alt_res = await horus_clients.get("AltStatus_Pedido", params=alt_params)
                    alt_err = _extract_horus_err_msg(alt_res)
                    if alt_err:
                        all_warnings.append(f"Pedido #{cod_ped_venda} (AltStatus_Pedido {target_erp_status}): {alt_err}")
                except Exception as e_alt:
                    all_warnings.append(f"Pedido #{cod_ped_venda} (AltStatus_Pedido): {e_alt}")

            created_orders.append({
                "batch_number": idx,
                "cod_ped_venda": cod_ped_venda,
                "cod_pedido_origem": cod_origem,
                "items_sent": items_inserted,
                "items_total": len(batch["items"]),
                "total_qty": batch["total_qty"],
                "total_amount": batch["total_amount"],
                "warnings": batch_warnings,
            })

        # 5. Marca nas vendas selecionadas os números dos pedidos gerados no Horus para rastreabilidade
        ped_codes_str = ",".join(o["cod_ped_venda"] for o in created_orders)
        stamp = f"[HORUS_PED:{ped_codes_str}]"
        for s in sales:
            existing_notes = (s.notes or "").strip()
            if stamp not in existing_notes:
                s.notes = f"{existing_notes} | {stamp}".strip(" |") if existing_notes else stamp
        db.commit()

        return {
            "status": "ok",
            "sales_processed": len(sales),
            "selected_sales_total": selected_sales_total,
            "batches_count": len(created_orders),
            "orders": created_orders,
            "warnings": all_warnings,
            "message": (
                f"{len(created_orders)} pedido(s) enviado(s) ao Horus ERP com sucesso: "
                f"{', '.join('#' + o['cod_ped_venda'] for o in created_orders)}!"
            ),
        }
    finally:
        await horus_clients.close()


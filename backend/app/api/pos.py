import io
import csv
import os
import json
import uuid
import tempfile
import time
import asyncio
import logging
from datetime import datetime
from typing import Optional, List
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
    POSSessionResponse,
    POSSessionProductOut,
    POSSessionProductsListResponse,
    POSSaleCreate,
    POSSyncBatchRequest,
    POSSyncBatchResponse,
)

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

    return {
        "company_id": company_id,
        "module_pdv": getattr(company, "module_pdv", False),
        "pdv_allow_out_of_stock": allow_out_of_stock,
        "validate_stock": not allow_out_of_stock,
    }


# ─────────────────────────────────────────────────────────────────────────────
# SESSÕES DE PDV (Caixas / Eventos)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/sessions", response_model=List[POSSessionResponse])
def list_pos_sessions(
    company_id: int,
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    """Lista as sessões de PDV da empresa (abertas ou fechadas)."""
    _assert_pos_access(current_user, company_id, db)

    query = db.query(POSSession).filter(POSSession.company_id == company_id)
    if status_filter:
        query = query.filter(POSSession.status == status_filter.upper())

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

    # Breakdown por método de pagamento
    breakdown = (
        db.query(
            POSSale.payment_method,
            func.count(POSSale.id).label("count"),
            func.sum(POSSale.total_amount).label("total")
        )
        .filter(POSSale.session_id == session_id, POSSale.status == "COMPLETED")
        .group_by(POSSale.payment_method)
        .all()
    )

    by_payment = {
        row.payment_method: {"count": row.count, "total": float(row.total or 0)}
        for row in breakdown
    }

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
        "MISTO": 0.0,
    }
    total_sales_amount = 0.0
    for s in sales:
        m = (s.payment_method or "DINHEIRO").upper()
        amt = float(s.total_amount or 0.0)
        by_method[m] = by_method.get(m, 0.0) + amt
        total_sales_amount += amt

    initial_cash = float(session.initial_cash_amount or 0.0)
    cash_sales = by_method.get("DINHEIRO", 0.0)
    expected_cash = initial_cash + cash_sales

    return {
        "session_id": session.id,
        "title": session.title,
        "code": session.code,
        "status": session.status,
        "opened_at": session.opened_at.isoformat() if session.opened_at else None,
        "closed_at": session.closed_at.isoformat() if session.closed_at else None,
        "initial_cash_amount": initial_cash,
        "cash_sales_amount": cash_sales,
        "expected_cash_amount": expected_cash,
        "sales_count": len(sales),
        "total_sales_amount": total_sales_amount,
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

    # Total em dinheiro de vendas concluídas
    cash_sales_total = (
        db.query(func.coalesce(func.sum(POSSale.total_amount), 0.0))
        .filter(
            POSSale.session_id == session_id,
            POSSale.status == "COMPLETED",
            POSSale.payment_method == "DINHEIRO"
        )
        .scalar()
    )
    initial_cash = float(session.initial_cash_amount or 0.0)
    expected_cash = initial_cash + float(cash_sales_total or 0.0)
    session.expected_cash_amount = expected_cash

    if payload and payload.closed_cash_amount is not None:
        session.closed_cash_amount = payload.closed_cash_amount
        session.cash_difference = float(payload.closed_cash_amount) - expected_cash
    if payload and payload.closing_notes is not None:
        session.closing_notes = payload.closing_notes.strip() or None

    session.closed_by_user_id = current_user.id
    session.status = POSSessionStatus.CLOSED.value
    session.closed_at = datetime.utcnow()
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

    # URL base de capas
    settings = db.query(CompanySettings).filter(
        CompanySettings.company_id == company_id
    ).first()
    cover_base_url = settings.cover_image_base_url if settings else None

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
        if cover_base_url and cod_barra:
            base = cover_base_url.rstrip("/")
            cover_url = f"{base}/{cod_barra}.jpg"

        formatted_items.append({
            "barcode": cod_barra,
            "sku": str(cod_item) if cod_item else cod_barra,
            "title": title,
            "publisher": publisher,
            "price": price,
            "stock": stock_val,
            "horus_item_code": str(cod_item) if cod_item else None,
            "cover_url": cover_url,
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
    Se a venda já foi sincronizada anteriormente, não duplica.
    Atualiza as estatísticas da sessão.
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

    for s_in in payload.sales:
        uuid_key = s_in.client_sale_uuid.strip()
        if not uuid_key:
            failed_count += 1
            errors.append({"uuid": "", "error": "client_sale_uuid obrigatório"})
            continue

        # Verifica se já existe (idempotência)
        existing = db.query(POSSale).filter(
            POSSale.company_id == company_id,
            POSSale.client_sale_uuid == uuid_key
        ).first()

        if existing:
            already_synced_count += 1
            synced_uuids.append(uuid_key)
            continue

        try:
            sale_num = s_in.sale_number or f"PDV-{datetime.utcnow().strftime('%y%m%d%H%M')}-{success_count+1}"

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

            new_sale = POSSale(
                company_id=company_id,
                session_id=payload.session_id or s_in.session_id,
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
                status="COMPLETED",
                notes=s_in.notes,
            )
            db.add(new_sale)
            db.flush()

            for it in s_in.items:
                sale_item = POSSaleItem(
                    sale_id=new_sale.id,
                    product_id=it.product_id if (it.product_id and it.product_id > 0) else None,
                    barcode=str(it.barcode or "SEM_BARRAS").strip()[:50],
                    sku=str(it.sku).strip()[:100] if it.sku else None,
                    title=str(it.title or "Item sem título").strip()[:255],
                    publisher=str(it.publisher).strip()[:255] if it.publisher else None,
                    quantity=max(1.0, float(it.quantity or 1.0)),
                    unit_price=max(0.0, float(it.unit_price or 0.0)),
                    total_price=max(0.0, float(it.total_price or 0.0)),
                    horus_item_code=str(it.horus_item_code).strip()[:50] if it.horus_item_code else None,
                )
                db.add(sale_item)

            if session:
                session.total_sales_count = (session.total_sales_count or 0) + 1
                session.total_sales_amount = float(session.total_sales_amount or 0) + float(s_in.total_amount)

            db.commit()
            success_count += 1
            synced_uuids.append(uuid_key)

        except Exception as e:
            db.rollback()
            logger.error("Falha ao gravar venda %s: %s", uuid_key, str(e))
            failed_count += 1
            errors.append({"uuid": uuid_key, "error": str(e)})

    return POSSyncBatchResponse(
        total_received=len(payload.sales),
        success_count=success_count,
        already_synced_count=already_synced_count,
        failed_count=failed_count,
        synced_uuids=synced_uuids,
        errors=errors,
    )


# ─────────────────────────────────────────────────────────────────────────────
# LISTAGEM & ACOMPANHAMENTO EM TEMPO REAL DAS VENDAS
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/sales")
def list_pos_sales(
    company_id: int,
    session_id: Optional[int] = Query(None),
    payment_method: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    """
    Centralização e acompanhamento em tempo real das vendas do PDV.
    Retorna métricas consolidadas (KPIs) e lista paginada com os itens.
    """
    _assert_pos_access(current_user, company_id, db)

    query = db.query(POSSale).filter(POSSale.company_id == company_id)

    if session_id:
        query = query.filter(POSSale.session_id == session_id)
    if payment_method:
        query = query.filter(POSSale.payment_method == payment_method.upper())
    if search:
        search_like = f"%{search}%"
        query = query.filter(
            or_(
                POSSale.sale_number.ilike(search_like),
                POSSale.customer_name.ilike(search_like),
                POSSale.customer_document.ilike(search_like),
            )
        )

    # Métricas agregadas
    total_count = query.count()
    total_amount = db.query(func.sum(POSSale.total_amount)).filter(
        POSSale.company_id == company_id,
        (POSSale.session_id == session_id) if session_id else True,
        POSSale.status == "COMPLETED"
    ).scalar() or 0.0

    # Agrupamento por método de pagamento
    pay_summary = (
        db.query(
            POSSale.payment_method,
            func.count(POSSale.id).label("count"),
            func.sum(POSSale.total_amount).label("total")
        )
        .filter(
            POSSale.company_id == company_id,
            (POSSale.session_id == session_id) if session_id else True,
            POSSale.status == "COMPLETED"
        )
        .group_by(POSSale.payment_method)
        .all()
    )

    by_payment = {
        r.payment_method: {"count": r.count, "total": float(r.total or 0)}
        for r in pay_summary
    }

    # Registros paginados
    sales = query.order_by(desc(POSSale.sold_at)).offset(skip).limit(limit).all()

    sales_result = []
    for s in sales:
        items_data = [
            {
                "barcode": it.barcode,
                "title": it.title,
                "quantity": float(it.quantity),
                "unit_price": float(it.unit_price),
                "total_price": float(it.total_price),
                "publisher": it.publisher,
            }
            for it in s.items
        ]
        sales_result.append({
            "id": s.id,
            "client_sale_uuid": s.client_sale_uuid,
            "sale_number": s.sale_number,
            "session_id": s.session_id,
            "customer_name": s.customer_name,
            "customer_document": s.customer_document,
            "payment_method": s.payment_method,
            "subtotal": float(s.subtotal),
            "discount": float(s.discount),
            "total_amount": float(s.total_amount),
            "items_count": s.items_count,
            "sold_at": s.sold_at.isoformat() if s.sold_at else None,
            "synced_at": s.synced_at.isoformat() if s.synced_at else None,
            "origin": s.origin,
            "status": s.status,
            "items": items_data,
        })

    return {
        "kpis": {
            "total_sales": total_count,
            "total_amount": float(total_amount),
            "by_payment_method": by_payment,
        },
        "sales": sales_result,
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
        except Exception:
            try:
                dt_start = datetime.strptime(start_date[:10], "%Y-%m-%d")
            except Exception:
                pass

    dt_end = None
    if end_date:
        try:
            dt_end = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            if len(end_date) == 10:
                dt_end = dt_end.replace(hour=23, minute=59, second=59)
        except Exception:
            try:
                dt_end = datetime.strptime(end_date[:10], "%Y-%m-%d").replace(hour=23, minute=59, second=59)
            except Exception:
                pass

    query = (
        db.query(POSSaleItem, POSSale, POSSession)
        .join(POSSale, POSSaleItem.sale_id == POSSale.id)
        .outerjoin(POSSession, POSSale.session_id == POSSession.id)
        .filter(POSSale.company_id == company_id)
    )

    if status:
        query = query.filter(POSSale.status == status)
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
    total_qty = 0.0
    total_revenue = 0.0
    by_payment = {}

    formatted_rows = []
    for item, sale, session in rows:
        unique_sale_ids.add(sale.id)
        qty = float(item.quantity or 0.0)
        u_price = float(item.unit_price or 0.0)
        t_price = float(item.total_price or 0.0)
        total_qty += qty
        total_revenue += t_price

        pm = (sale.payment_method or "OUTROS").upper()
        if pm not in by_payment:
            by_payment[pm] = {"count": 0, "total": 0.0}
        by_payment[pm]["count"] += 1
        by_payment[pm]["total"] += t_price

        sess_name = session.name if session else (f"Sessão #{sale.session_id}" if sale.session_id else "Avulsa")

        formatted_rows.append({
            "id": item.id,
            "sale_id": sale.id,
            "sale_number": sale.sale_number,
            "sold_at": sale.sold_at.strftime("%d/%m/%Y %H:%M") if sale.sold_at else "-",
            "sold_at_iso": sale.sold_at.isoformat() if sale.sold_at else None,
            "session_id": sale.session_id,
            "session_name": sess_name,
            "barcode": item.barcode or "",
            "sku": item.sku or "",
            "title": item.title or "Sem descrição",
            "publisher": item.publisher or "",
            "quantity": qty,
            "unit_price": u_price,
            "total_price": t_price,
            "payment_method": pm,
            "customer_name": sale.customer_name or "Consumidor Final",
            "customer_document": sale.customer_document or "",
        })

    # Resumo
    kpis = {
        "total_sales": len(unique_sale_ids),
        "total_items": round(total_qty, 2),
        "total_amount": round(total_revenue, 2),
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
        periodo_txt += f"  |  Gerado em: {datetime.now().strftime('%d/%m/%Y %H:%M')}"

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
        subtitle_txt = f"Relatório Analítico de Itens Vendidos | Emissão: {datetime.now().strftime('%d/%m/%Y %H:%M')}"
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
            "isbn": 28,
            "titulo": 65,
            "qtd": 12,
            "vlr_unit": 20,
            "total": 20,
            "pagto": 26,
            "cliente": 36,
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
            if len(title_clean) > 38:
                title_clean = title_clean[:35] + "..."

            sess_clean = _pdf_safe(r["session_name"])
            if len(sess_clean) > 16:
                sess_clean = sess_clean[:14] + ".."

            cli_clean = _pdf_safe(r["customer_name"])
            if len(cli_clean) > 22:
                cli_clean = cli_clean[:20] + ".."

            pdf.cell(col_w["data"], 5, r["sold_at"], border=1, fill=True, align="C")
            pdf.cell(col_w["venda"], 5, _pdf_safe(r["sale_number"]), border=1, fill=True, align="C")
            pdf.cell(col_w["sessao"], 5, sess_clean, border=1, fill=True, align="L")
            pdf.cell(col_w["isbn"], 5, _pdf_safe(r["barcode"]), border=1, fill=True, align="C")
            pdf.cell(col_w["titulo"], 5, title_clean, border=1, fill=True, align="L")
            pdf.cell(col_w["qtd"], 5, str(int(r["quantity"])), border=1, fill=True, align="C")
            pdf.cell(col_w["vlr_unit"], 5, f"{r['unit_price']:,.2f}", border=1, fill=True, align="R")
            pdf.cell(col_w["total"], 5, f"{r['total_price']:,.2f}", border=1, fill=True, align="R")
            pdf.cell(col_w["pagto"], 5, _pdf_safe(r["payment_method"]), border=1, fill=True, align="C")
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

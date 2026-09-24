import io
import csv
import os
import json
import uuid
import tempfile
import time
import logging
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_
import openpyxl

from app.db.session import get_db
from app.core import dependencies
from app.models import user as user_models
from app.models.company import Company
from app.models.product import Product
from app.models.customer import Customer
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
    """Retorna detalhes de uma sessão com resumo de vendas."""
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


@router.put("/sessions/{session_id}/close", response_model=POSSessionResponse)
def close_pos_session(
    company_id: int,
    session_id: int,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    """Fecha a sessão de PDV."""
    _assert_pos_access(current_user, company_id, db)

    session = db.query(POSSession).filter(
        POSSession.id == session_id,
        POSSession.company_id == company_id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sessão não encontrada.")

    session.status = POSSessionStatus.CLOSED.value
    session.closed_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return session


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

    filename = file.filename.lower()
    suffix = ".xlsx" if filename.endswith(".xlsx") else (".csv" if filename.endswith(".csv") else "")
    if not suffix:
        raise HTTPException(status_code=400, detail="Formato não suportado. Envie um arquivo .xlsx ou .csv")

    import_dir = os.path.join(tempfile.gettempdir(), "pos_imports")
    os.makedirs(import_dir, exist_ok=True)
    _cleanup_old_imports(import_dir)

    # 1. Grava o arquivo enviado em um arquivo temporário no disco para streaming
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp_path = tmp.name
        content = await file.read()
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

            new_sale = POSSale(
                company_id=company_id,
                session_id=payload.session_id or s_in.session_id,
                user_id=current_user.id,
                client_sale_uuid=uuid_key,
                sale_number=sale_num,
                customer_name=s_in.customer_name or "Consumidor Final",
                customer_document=s_in.customer_document,
                customer_id=s_in.customer_id,
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
                    product_id=it.product_id,
                    barcode=it.barcode,
                    sku=it.sku,
                    title=it.title,
                    publisher=it.publisher,
                    quantity=it.quantity,
                    unit_price=it.unit_price,
                    total_price=it.total_price,
                    horus_item_code=it.horus_item_code,
                )
                db.add(sale_item)

            if session:
                session.total_sales_count = (session.total_sales_count or 0) + 1
                session.total_sales_amount = float(session.total_sales_amount or 0) + float(s_in.total_amount)

            success_count += 1
            synced_uuids.append(uuid_key)

        except Exception as e:
            logger.error("Falha ao gravar venda %s: %s", uuid_key, str(e))
            failed_count += 1
            errors.append({"uuid": uuid_key, "error": str(e)})

    db.commit()

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

"""
API — Módulo Busca Preço

Rotas:
  GET /product-search/product  → busca produto no Horus via Busca_Acervo
  GET /product-search/stock    → saldo por filial via Estoque (sem filtro de local)

Regras:
  - Requer autenticação (SELLER).
  - Usa credenciais Horus do seller (CompanySettings).
  - Usa filiais do seller (cmp_seller_branch) para consulta de estoque.
  - A URL da capa é montada como: cover_image_base_url + COD_BARRA_ITEM + .jpg
  - NÃO interfere com os endpoints B2B existentes.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Any, Optional, Tuple
import logging
import re
import time

from app.db.session import get_db, SessionLocal
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.company import Company
from app.models.product import Product
from app.models.seller_branch import SellerBranch
from app.models.product_address import ProductAddress
from app.models.company_settings import CompanySettings
from app.models.product_search_log import ProductSearchLog
from app.schemas.backorder import QuickProductCreate
from app.integrators.horus_product_search import HorusProductSearch

_logger = logging.getLogger("cronuz.product_search")
router = APIRouter(tags=["product-search"])

# Opções válidas de busca
_VALID_SEARCH_OPTIONS = {"BARRAS_ISBN", "NOME", "COD_ITEM"}


def _build_cover_url(base_url: Optional[str], cod_barra_item: Optional[str]) -> Optional[str]:
    """
    Monta a URL da capa do produto: base_url + cod_barra_item + .jpg
    Retorna None se base_url não estiver configurado.
    """
    if not base_url or not cod_barra_item:
        return None
    base = base_url.rstrip("/")
    return f"{base}/{cod_barra_item}.jpg"


def _record_search_log(
    company_id: int,
    user_id: Optional[int],
    term: str,
    search_option: str,
    source: str,
    matched_cod_item: Optional[int],
    matched_isbn: Optional[str],
    matched_name: Optional[str],
    total_results: int,
):
    """
    Grava o log de consulta em background sem bloquear o retorno do endpoint ao usuário.
    """
    try:
        db = SessionLocal()
        try:
            log_entry = ProductSearchLog(
                company_id=company_id,
                user_id=user_id,
                search_term=term.strip(),
                search_option=search_option,
                source=source or "web",
                matched_cod_item=matched_cod_item,
                matched_isbn=matched_isbn,
                matched_name=matched_name[:255] if matched_name else None,
                total_results=total_results,
            )
            db.add(log_entry)
            db.commit()
        finally:
            db.close()
    except Exception as e:
        _logger.warning("Falha ao gravar log de busca de produto: %s", e)


def ensure_cronuz_product_record(
    db: Session,
    company_id: int,
    isbn: str,
    title: str,
    publisher: Optional[str] = None,
    author: Optional[str] = None,
    unit_price: float = 0.0,
    cover_url: Optional[str] = None,
    synopsis: Optional[str] = None,
    horus_cod_item: Optional[int] = None,
    product_id: Optional[int] = None,
) -> Tuple[Product, bool, Optional[int]]:
    """
    Garante que o item exista em `prd_product` (pré-cadastro no Cronuz se ainda não existir no Hórus,
    ou espelhado/vinculado se já existir no Hórus) sem duplicidades.
    Retorna: (product, has_erp_registration, effective_horus_cod_item).
    """
    raw_isbn = (isbn or "").strip()
    clean_isbn = re.sub(r"[^0-9Xx]", "", raw_isbn).upper()
    cod_int = int(horus_cod_item) if horus_cod_item and int(horus_cod_item) > 0 else None

    existing: Optional[Product] = None
    if product_id:
        existing = (
            db.query(Product)
            .filter(Product.id == product_id, Product.company_id == company_id)
            .first()
        )

    if not existing:
        match_filters = []
        if cod_int:
            match_filters.append(Product.horus_cod_item == cod_int)
            match_filters.append(Product.sku == str(cod_int))
        if clean_isbn:
            match_filters.extend([
                Product.ean_gtin == clean_isbn,
                Product.barcode == clean_isbn,
                Product.sku == clean_isbn,
            ])
        if raw_isbn and raw_isbn != clean_isbn:
            match_filters.extend([
                Product.ean_gtin == raw_isbn,
                Product.sku == raw_isbn,
            ])
        if match_filters:
            existing = (
                db.query(Product)
                .filter(Product.company_id == company_id, or_(*match_filters))
                .first()
            )

    if existing:
        effective_cod = existing.horus_cod_item or cod_int
        if cod_int and not existing.horus_cod_item:
            existing.horus_cod_item = cod_int
        if cover_url and not existing.cover_url:
            existing.cover_url = cover_url[:500]
        if publisher and not existing.brand:
            existing.brand = publisher.strip()[:100]
        if author and not existing.model:
            existing.model = author.strip()[:100]
        if unit_price and float(unit_price) > 0 and float(existing.base_price or 0) == 0:
            existing.base_price = float(unit_price)
        db.flush()
        return existing, bool(effective_cod), effective_cod

    effective_isbn = (clean_isbn or raw_isbn)[:50] or None
    if cod_int:
        sku_val = str(cod_int)
        status_label = "SINCRONIZADO HÓRUS"
    else:
        sku_val = (clean_isbn or raw_isbn or f"PRE-{int(time.time())}")[:100]
        status_label = "PRÉ-CADASTRO (SEM HÓRUS)"

    new_prod = Product(
        company_id=company_id,
        sku=sku_val,
        name=(title or "Obra sob Encomenda").strip()[:255],
        short_description=synopsis.strip()[:400] if synopsis else None,
        long_description=synopsis.strip() if synopsis else None,
        base_price=max(0.0, float(unit_price or 0.0)),
        brand=publisher.strip()[:100] if publisher else None,
        model=author.strip()[:100] if author else None,
        ean_gtin=effective_isbn,
        barcode=effective_isbn,
        status="ACTIVE",
        stock_quantity=0,
        allow_purchase=False,
        stock_status_label=status_label,
        cover_url=cover_url.strip()[:500] if cover_url else None,
        horus_cod_item=cod_int,
    )
    db.add(new_prod)
    db.flush()
    return new_prod, bool(cod_int), cod_int


def _search_local_cronuz_products(
    db: Session,
    company_id: int,
    term: str,
    search_option: str,
    limit: int,
    cover_base_url: Optional[str],
    cover_secondary_base_url: Optional[str],
    exclude_horus_codes: set,
    exclude_isbns: set,
) -> list:
    raw_term = term.strip()
    if not raw_term:
        return []
    clean_isbn = re.sub(r"[^0-9Xx]", "", raw_term).upper()
    like_term = f"%{raw_term}%"

    q = db.query(Product).filter(Product.company_id == company_id, Product.status != "INACTIVE")

    if search_option == "BARRAS_ISBN":
        conds = [
            Product.ean_gtin.ilike(like_term),
            Product.barcode.ilike(like_term),
            Product.sku.ilike(like_term),
        ]
        if clean_isbn and clean_isbn != raw_term:
            conds.extend([
                Product.ean_gtin == clean_isbn,
                Product.barcode == clean_isbn,
                Product.sku == clean_isbn,
            ])
        q = q.filter(or_(*conds))
    elif search_option == "COD_ITEM":
        conds = [Product.sku == raw_term]
        if raw_term.isdigit() and int(raw_term) <= 2147483647:
            num_id = int(raw_term)
            conds.extend([Product.id == num_id, Product.horus_cod_item == num_id])
        q = q.filter(or_(*conds))
    else:  # NOME
        q = q.filter(
            or_(
                Product.name.ilike(like_term),
                Product.brand.ilike(like_term),
                Product.model.ilike(like_term),
                Product.ean_gtin.ilike(like_term),
                Product.sku.ilike(like_term),
            )
        )

    local_rows = q.limit(limit).all()
    results = []
    for p in local_rows:
        if p.horus_cod_item and int(p.horus_cod_item) in exclude_horus_codes:
            continue
        p_isbn = (p.ean_gtin or p.barcode or p.sku or "").strip()
        p_clean = re.sub(r"[^0-9Xx]", "", p_isbn).upper()
        if p_clean and p_clean in exclude_isbns:
            continue

        primary_cover = p.cover_url or _build_cover_url(cover_base_url, p_isbn)
        secondary_cover = _build_cover_url(cover_secondary_base_url, p_isbn)
        has_horus = bool(p.horus_cod_item)

        results.append({
            "COD_ITEM": p.horus_cod_item or p.id,
            "product_id": p.id,
            "COD_BARRA_ITEM": p_isbn,
            "COD_ISBN_ITEM": p_isbn,
            "NOM_ITEM": p.name,
            "NOM_EDITORA": p.brand,
            "DES_AUTOR": p.model,
            "VLR_CAPA": float(p.base_price or 0.0),
            "SALDO_DISPONIVEL": int(p.stock_quantity or 0),
            "DESC_SINOPSE": p.long_description or p.short_description,
            "COVER_URL": primary_cover or secondary_cover,
            "COVER_SECONDARY_URL": secondary_cover,
            "has_erp_registration": has_horus,
            "horus_cod_item": p.horus_cod_item,
            "badge_warning": None if has_horus else "Pré-cadastro no Cronuz — Sem cadastro no ERP Hórus",
        })
    return results


# ──────────────────────────────────────────────────────────────────────────────
# 1. Busca Inteligente de Produto (ERP Hórus + Catálogo Pré-Cadastro Cronuz)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/product")
async def search_product(
    term: str = Query(..., description="Valor da busca (ISBN, nome ou código)"),
    search_option: str = Query(
        "BARRAS_ISBN",
        description="Parâmetro Horus: BARRAS_ISBN | NOME | COD_ITEM",
    ),
    source: str = Query(
        "web",
        description="Origem da consulta: web | app | physical_scanner",
    ),
    offset: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=50),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if search_option not in _VALID_SEARCH_OPTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"search_option inválido. Use: {', '.join(_VALID_SEARCH_OPTIONS)}",
        )

    company_id = current_user.company_id or 1

    settings = db.query(CompanySettings).filter(
        CompanySettings.company_id == company_id
    ).first()
    cover_base_url: Optional[str] = settings.cover_image_base_url if settings else None
    cover_secondary_base_url: Optional[str] = settings.cover_image_secondary_base_url if settings else None

    raw: Any = None
    horus_warning: Optional[str] = None

    try:
        client = HorusProductSearch(db, company_id)
        try:
            raw = await client.busca_acervo(
                term=term,
                search_option=search_option,
                offset=offset,
                limit=limit,
            )
        finally:
            await client.close()
    except Exception as e:
        horus_warning = str(e)
        _logger.info("[ProductSearch] Consulta Hórus indisponível/não configurada (%s) — usando catálogo Cronuz.", e)

    items = []
    seen_horus_codes = set()
    seen_isbns = set()

    raw_list = []
    if isinstance(raw, list):
        if len(raw) > 0 and isinstance(raw[0], dict) and (raw[0].get("Falha") or raw[0].get("FALHA") == "S"):
            raw_list = []
        else:
            raw_list = [r for r in raw if isinstance(r, dict)]
    elif isinstance(raw, dict):
        if not (raw.get("Falha") or raw.get("FALHA") == "S"):
            raw_list = [raw]

    # Cruza em lote com prd_product para obter product_id caso já espelhado no Cronuz
    horus_codes_batch = []
    for r in raw_list:
        c_val = r.get("COD_ITEM")
        if str(c_val or "").isdigit():
            horus_codes_batch.append(int(c_val))

    local_by_horus = {}
    if horus_codes_batch:
        for lp in db.query(Product.id, Product.horus_cod_item, Product.cover_url).filter(
            Product.company_id == company_id,
            Product.horus_cod_item.in_(horus_codes_batch),
        ).all():
            if lp.horus_cod_item:
                local_by_horus[int(lp.horus_cod_item)] = (lp.id, lp.cover_url)

    for item in raw_list:
        cod_barra = item.get("COD_BARRA_ITEM") or item.get("BARRAS_ISBN")
        c_raw = item.get("COD_ITEM")
        c_int = int(c_raw) if str(c_raw or "").isdigit() else None
        if c_int:
            seen_horus_codes.add(c_int)
        if cod_barra:
            c_isbn = re.sub(r"[^0-9Xx]", "", str(cod_barra)).upper()
            if c_isbn:
                seen_isbns.add(c_isbn)

        local_info = local_by_horus.get(c_int) if c_int else None
        primary_cover = (local_info[1] if local_info and local_info[1] else None) or _build_cover_url(cover_base_url, cod_barra)
        secondary_cover = _build_cover_url(cover_secondary_base_url, cod_barra)
        item["COVER_URL"] = primary_cover or secondary_cover
        item["COVER_SECONDARY_URL"] = secondary_cover
        item["has_erp_registration"] = True
        item["horus_cod_item"] = c_int
        item["product_id"] = local_info[0] if local_info else None
        items.append(item)

    # Complementa com produtos pré-cadastrados no Cronuz (incluindo os que ainda não estão no Hórus)
    local_extra = _search_local_cronuz_products(
        db=db,
        company_id=company_id,
        term=term,
        search_option=search_option,
        limit=limit,
        cover_base_url=cover_base_url,
        cover_secondary_base_url=cover_secondary_base_url,
        exclude_horus_codes=seen_horus_codes,
        exclude_isbns=seen_isbns,
    )
    items.extend(local_extra)

    total_found = len(items)
    matched_cod_item: Optional[int] = None
    matched_isbn: Optional[str] = None
    matched_name: Optional[str] = None

    if total_found > 0:
        first_item = items[0]
        matched_cod_item = first_item.get("horus_cod_item") or first_item.get("COD_ITEM")
        matched_isbn = first_item.get("COD_BARRA_ITEM") or first_item.get("BARRAS_ISBN")
        matched_name = first_item.get("NOM_ITEM")

    background_tasks.add_task(
        _record_search_log,
        company_id=company_id,
        user_id=current_user.id,
        term=term,
        search_option=search_option,
        source=source,
        matched_cod_item=matched_cod_item if str(matched_cod_item or "").isdigit() else None,
        matched_isbn=matched_isbn,
        matched_name=matched_name,
        total_results=total_found,
    )

    resp: dict = {"items": items, "total": total_found}
    if horus_warning and total_found == 0:
        resp["horus_warning"] = horus_warning
    return resp


@router.post("/quick-create-product")
def quick_create_product(
    payload: QuickProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Realiza o Pré-Cadastro imediato de uma obra no catálogo do Cronuz (`prd_product`)
    sinalizando explicitamente quando ainda NÃO possui cadastro no ERP Hórus (`horus_cod_item = None`),
    permitindo amarrar encomendas e solicitar compras futuras sem perder o atendimento.
    """
    company_id = current_user.company_id or 1
    if not payload.isbn.strip() or not payload.title.strip():
        raise HTTPException(status_code=400, detail="ISBN e Título são obrigatórios para o pré-cadastro.")

    price_val = float(payload.market_cover_price or payload.price_estimated or 0.0)
    prod, has_horus, effective_cod = ensure_cronuz_product_record(
        db=db,
        company_id=company_id,
        isbn=payload.isbn,
        title=payload.title,
        publisher=payload.publisher,
        author=payload.author,
        unit_price=price_val,
        cover_url=payload.cover_url,
        synopsis=payload.synopsis,
        horus_cod_item=None,
    )
    db.commit()
    db.refresh(prod)

    p_isbn = prod.ean_gtin or prod.barcode or prod.sku
    return {
        "message": (
            f"Obra vinculada ao ERP Hórus #{effective_cod}!"
            if has_horus
            else f"Pré-cadastro realizado no Cronuz (#{prod.id}) — marcado como Sem Cadastro no Hórus!"
        ),
        "COD_ITEM": effective_cod or prod.id,
        "product_id": prod.id,
        "COD_BARRA_ITEM": p_isbn,
        "COD_ISBN_ITEM": p_isbn,
        "NOM_ITEM": prod.name,
        "NOM_EDITORA": prod.brand,
        "DES_AUTOR": prod.model,
        "VLR_CAPA": float(prod.base_price or 0.0),
        "SALDO_DISPONIVEL": int(prod.stock_quantity or 0),
        "DESC_SINOPSE": prod.long_description or prod.short_description,
        "COVER_URL": prod.cover_url,
        "has_erp_registration": has_horus,
        "horus_cod_item": effective_cod,
        "badge_warning": None if has_horus else "Pré-cadastro no Cronuz — Sem cadastro no ERP Hórus",
    }


# ──────────────────────────────────────────────────────────────────────────────
# 2. Estoque por Filial
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/stock")
async def get_stock_by_branch(
    cod_item: int = Query(..., description="Código interno do produto no Horus (COD_ITEM)"),
    isbn: Optional[str] = Query(None, description="ISBN ou código de barras do produto"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Consulta o saldo disponível do produto em CADA filial ativa cadastrada
    para o seller, via endpoint `Estoque` do Horus.

    Faz uma chamada por filial filtrando por COD_EMPRESA + COD_FILIAL.
    NÃO filtra por COD_LOCAL_ESTOQUE — deixa o Horus retornar todos os locais
    e soma o saldo total por filial.
    """
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="Usuário sem empresa vinculada.")

    # Carrega filiais ativas do seller
    branches_db = (
        db.query(SellerBranch)
        .filter(
            SellerBranch.company_id == current_user.company_id,
            SellerBranch.active == True,
        )
        .all()
    )

    if not branches_db:
        return {
            "cod_item": cod_item,
            "branches": [],
            "warning": "Nenhuma filial ativa cadastrada. Configure em Logística Horus → Filiais do Seller.",
        }

    # Monta lista de filiais — SEM cod_local para não filtrar por local
    branches = [
        {
            "nome": b.nome,
            "cod_empresa": b.cod_empresa,
            "cod_filial": b.cod_filial,
        }
        for b in branches_db
    ]

    try:
        client = HorusProductSearch(db, current_user.company_id)
    except Exception as e:
        return {
            "cod_item": cod_item,
            "branches": [],
            "status": "offline",
            "error_message": f"Configuração do ERP Horus inacessível: {str(e)}",
        }

    try:
        results = await client.busca_estoque_por_filiais(
            cod_item=cod_item,
            branches=branches,
        )
    except Exception as e:
        return {
            "cod_item": cod_item,
            "branches": [],
            "status": "offline",
            "error_message": f"Falha ao conectar com o ERP Horus: {str(e)}",
        }
    finally:
        await client.close()

    # Consulta endereçamentos cadastrados para o produto na empresa
    address_filters = [ProductAddress.company_id == current_user.company_id]
    match_conds = [ProductAddress.horus_cod_item == str(cod_item)]
    if isbn:
        clean_isbn = isbn.strip().replace("-", "")
        match_conds.append(ProductAddress.isbn == clean_isbn)
        match_conds.append(ProductAddress.isbn == isbn.strip())
    address_filters.append(or_(*match_conds))

    addresses_db = db.query(ProductAddress).filter(*address_filters).all()

    # Mapeia endereços por branch_id
    branch_map = {f"{b.cod_empresa}_{b.cod_filial}": b.id for b in branches_db}
    addr_by_branch_id = {}
    for a in addresses_db:
        addr_by_branch_id.setdefault(a.branch_id, []).append({
            "id": a.id,
            "address": a.address,
            "cod_local_estoque": a.cod_local_estoque,
            "notes": a.notes
        })

    for r in results:
        key = f"{r.get('cod_empresa')}_{r.get('cod_filial')}"
        b_id = branch_map.get(key)
        branch_addresses = addr_by_branch_id.get(b_id, [])
        r["addresses"] = [a["address"] for a in branch_addresses]
        r["address_details"] = branch_addresses

    # Diagnóstico de integridade das respostas das filiais
    total_branches = len(results)
    errors_count = sum(1 for r in results if r.get("erro"))

    if errors_count == total_branches and total_branches > 0:
        status = "offline"
        error_message = "O servidor do ERP Horus não respondeu para nenhuma das filiais configuradas."
    elif errors_count > 0:
        status = "partial_error"
        error_message = f"{errors_count} de {total_branches} filial(is) apresentaram instabilidade na consulta."
    else:
        status = "ok"
        error_message = None

    return {
        "cod_item": cod_item,
        "branches": results,
        "status": status,
        "error_message": error_message,
    }


# ──────────────────────────────────────────────────────────────────────────────
# 3. Estoque de Distribuidores (Catavento, Disal, …)
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/distributor-stock")
async def get_distributor_stock(
    isbn: str = Query(..., description="ISBN / código de barras do produto"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Consulta o estoque nos distribuidores habilitados para o seller.

    Executa as consultas em paralelo com isolamento e timeout individual.
    """
    import asyncio
    from app.models.distributor import DistributorCredential
    from app.integrators.catavento_client import CataventoClient
    from app.integrators.disal_client import DisalClient
    from app.integrators.inovacao_client import InovacaoClient

    company_id = current_user.company_id

    # Carrega distribuidores habilitados do seller
    distributors = (
        db.query(DistributorCredential)
        .filter(
            DistributorCredential.company_id == company_id,
            DistributorCredential.enabled == True,
        )
        .order_by(DistributorCredential.slug)
        .all()
    )

    if not distributors:
        return {"isbn": isbn, "distributors": []}

    async def query_catavento(dist: DistributorCredential):
        client = CataventoClient(
            base_url=dist.base_url or "",
            username=dist.username or "",
            password=dist.password or "",
            token=dist.token,
            token_expires=dist.token_expires,
        )
        try:
            # Pior caso: token rejeitado → re-auth (~9s) → consulta (até 30s). Fica abaixo dos 60s do Nginx.
            result = await asyncio.wait_for(client.get_stock_by_isbn(isbn), timeout=55.0)
        except asyncio.TimeoutError:
            result = {"found": False, "saldo": 0, "error": "A Catavento não respondeu a tempo (lentidão no servidor deles). Tente novamente."}
        except Exception as e:
            result = {"found": False, "saldo": 0, "error": f"Erro de comunicação com a Catavento: {e}"}

        # Persiste token renovado no banco (sem bloquear a resposta)
        if client.token_renewed:
            try:
                dist_db = db.query(DistributorCredential).filter(DistributorCredential.id == dist.id).first()
                if dist_db:
                    dist_db.token         = client.new_token
                    dist_db.token_expires = client.token_expires
                    db.commit()
            except Exception:
                pass

        return {
            "slug":   dist.slug,
            "name":   dist.name,
            "enabled": True,
            "found":  result.get("found", False),
            "saldo":  result.get("saldo", 0),
            "preco":  result.get("preco"),
            "titulo": result.get("titulo"),
            "error":  result.get("error"),
        }

    async def query_disal(dist: DistributorCredential):
        client = DisalClient(
            base_url=dist.base_url or "",
            api_key=dist.api_key or "",
        )
        try:
            result = await asyncio.wait_for(client.get_stock_by_isbn(isbn), timeout=12.0)
        except asyncio.TimeoutError:
            result = {"found": False, "saldo": 0, "error": "Tempo limite esgotado ao consultar a Disal (Timeout)."}
        except Exception as e:
            result = {"found": False, "saldo": 0, "error": f"Erro de comunicação com a Disal: {e}"}

        return {
            "slug":   dist.slug,
            "name":   dist.name,
            "enabled": True,
            "found":  result.get("found", False),
            "saldo":  result.get("saldo", 0),
            "preco":  result.get("preco"),
            "titulo": result.get("titulo"),
            "error":  result.get("error"),
        }

    async def query_inovacao(dist: DistributorCredential):
        client = InovacaoClient(
            base_url=dist.base_url or "",
            username=dist.username or "",
            password=dist.password or "",
        )
        try:
            result = await asyncio.wait_for(client.get_stock_by_isbn(isbn), timeout=12.0)
        except asyncio.TimeoutError:
            result = {"found": False, "saldo": 0, "error": "Tempo limite esgotado ao consultar a Inovação (Timeout)."}
        except Exception as e:
            result = {"found": False, "saldo": 0, "error": f"Erro de comunicação com a Inovação: {e}"}

        return {
            "slug":   dist.slug,
            "name":   dist.name,
            "enabled": True,
            "found":  result.get("found", False),
            "saldo":  result.get("saldo", 0),
            "preco":  result.get("preco"),
            "titulo": result.get("titulo"),
            "error":  result.get("error"),
        }

    # Monta coroutines por distribuidor com tratamento individual
    tasks = []
    for dist in distributors:
        if dist.slug == "catavento":
            tasks.append(query_catavento(dist))
        elif dist.slug == "disal":
            tasks.append(query_disal(dist))
        elif dist.slug == "inovacao":
            tasks.append(query_inovacao(dist))
        else:
            # Distribuidor futuro sem integrador implementado
            async def _not_implemented(d=dist):
                return {
                    "slug":    d.slug,
                    "name":    d.name,
                    "enabled": True,
                    "found":   False,
                    "saldo":   0,
                    "preco":   None,
                    "titulo":  None,
                    "error":   "Integrador ainda não implementado para este parceiro.",
                }
            tasks.append(_not_implemented())

    results = await asyncio.gather(*tasks, return_exceptions=True)

    output = []
    for idx, r in enumerate(results):
        if isinstance(r, Exception):
            d_name = distributors[idx].name if idx < len(distributors) else "Parceiro"
            d_slug = distributors[idx].slug if idx < len(distributors) else "?"
            output.append({
                "slug": d_slug,
                "name": d_name,
                "enabled": True,
                "found": False,
                "saldo": 0,
                "error": f"Falha inesperada ao consultar {d_name}: {str(r)}",
            })
        else:
            output.append(r)

    return {"isbn": isbn, "distributors": output}


# ──────────────────────────────────────────────────────────────────────────────
# 4. Relatórios Analíticos de Consultas (Logs e Mais Buscados)
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/metrics/top-searched")
def get_top_searched_products(
    days: int = Query(30, ge=1, le=365, description="Intervalo em dias para análise"),
    limit: int = Query(20, ge=1, le=100, description="Quantidade máxima de itens"),
    source: Optional[str] = Query(None, description="Filtrar por canal: web | app | physical_scanner"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retorna os produtos/termos mais consultados para a empresa do usuário no período.
    Permite filtrar por canal (web, app ou leitor físico).
    """
    from sqlalchemy import func, desc
    from datetime import datetime, timedelta, timezone

    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="Usuário sem empresa vinculada.")

    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)

    query = (
        db.query(
            ProductSearchLog.search_term,
            ProductSearchLog.matched_isbn,
            ProductSearchLog.matched_name,
            ProductSearchLog.matched_cod_item,
            func.count(ProductSearchLog.id).label("total_searches"),
            func.max(ProductSearchLog.created_at).label("last_searched_at"),
            func.count(func.nullif(ProductSearchLog.source == "web", False)).label("searches_web"),
            func.count(func.nullif(ProductSearchLog.source == "app", False)).label("searches_app"),
        )
        .filter(
            ProductSearchLog.company_id == current_user.company_id,
            ProductSearchLog.created_at >= cutoff_date,
        )
    )

    if source:
        query = query.filter(ProductSearchLog.source == source)

    # Agrupa prioritariamente por ISBN ou Termo
    results = (
        query.group_by(
            ProductSearchLog.search_term,
            ProductSearchLog.matched_isbn,
            ProductSearchLog.matched_name,
            ProductSearchLog.matched_cod_item,
        )
        .order_by(desc("total_searches"))
        .limit(limit)
        .all()
    )

    return {
        "days": days,
        "source_filter": source,
        "items": [
            {
                "search_term": r[0],
                "isbn": r[1],
                "product_name": r[2] or r[0],
                "cod_item": r[3],
                "total_searches": r[4],
                "last_searched_at": r[5].isoformat() if r[5] else None,
                "searches_web": r[6],
                "searches_app": r[7],
            }
            for r in results
        ],
    }


@router.get("/logs")
def get_search_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    source: Optional[str] = Query(None, description="web | app | physical_scanner"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retorna os logs detalhados e paginados de consultas realizadas.
    """
    from sqlalchemy import desc

    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="Usuário sem empresa vinculada.")

    q = db.query(ProductSearchLog).filter(ProductSearchLog.company_id == current_user.company_id)
    if source:
        q = q.filter(ProductSearchLog.source == source)

    total = q.count()
    logs = q.order_by(desc(ProductSearchLog.created_at)).offset((page - 1) * page_size).limit(page_size).all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": l.id,
                "term": l.search_term,
                "search_option": l.search_option,
                "source": l.source,
                "matched_cod_item": l.matched_cod_item,
                "matched_isbn": l.matched_isbn,
                "matched_name": l.matched_name,
                "total_results": l.total_results,
                "created_at": l.created_at.isoformat() if l.created_at else None,
            }
            for l in logs
        ],
    }


# ──────────────────────────────────────────────────────────────────────────────
# 5. Painel Exclusivo MASTER — Análise e Inteligência Geral de Consultas
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/master/metrics")
def get_master_search_metrics(
    days: int = Query(30, ge=1, le=365, description="Intervalo em dias para análise"),
    limit: int = Query(20, ge=1, le=100, description="Quantidade máxima de itens no ranking"),
    company_id: Optional[int] = Query(None, description="Filtrar por seller específico"),
    source: Optional[str] = Query(None, description="Filtrar por canal: web | app | physical_scanner"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retorna métricas gerenciais e consolidadas de buscas para o usuário MASTER.
    Permite dimensionar o volume de consultas, distribuição de canais,
    produtos mais procurados e engajamento por seller.
    """
    user_type = getattr(current_user, "type", None)
    if hasattr(user_type, "value"):
        user_type = user_type.value
    if user_type != "MASTER":
        raise HTTPException(status_code=403, detail="Acesso restrito ao perfil MASTER.")

    from sqlalchemy import func, desc, distinct
    from datetime import datetime, timedelta, timezone

    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)

    base_query = db.query(ProductSearchLog).filter(ProductSearchLog.created_at >= cutoff_date)
    if company_id:
        base_query = base_query.filter(ProductSearchLog.company_id == company_id)
    if source:
        base_query = base_query.filter(ProductSearchLog.source == source)

    # 1. KPIs Gerais
    total_searches = base_query.count()
    searches_web = base_query.filter(ProductSearchLog.source == "web").count()
    searches_app = base_query.filter(ProductSearchLog.source == "app").count()
    
    total_sellers_active = db.query(distinct(ProductSearchLog.company_id)).filter(
        ProductSearchLog.created_at >= cutoff_date
    )
    if company_id:
        total_sellers_active = total_sellers_active.filter(ProductSearchLog.company_id == company_id)
    if source:
        total_sellers_active = total_sellers_active.filter(ProductSearchLog.source == source)
    total_sellers_count = total_sellers_active.count()

    matched_searches = base_query.filter(ProductSearchLog.total_results > 0).count()
    unmatched_searches = base_query.filter(ProductSearchLog.total_results == 0).count()

    # 2. Ranking Top Produtos / Termos
    prod_query = (
        db.query(
            ProductSearchLog.search_term,
            ProductSearchLog.matched_isbn,
            ProductSearchLog.matched_name,
            ProductSearchLog.matched_cod_item,
            func.count(ProductSearchLog.id).label("total_searches"),
            func.max(ProductSearchLog.created_at).label("last_searched_at"),
            func.count(func.nullif(ProductSearchLog.source == "web", False)).label("searches_web"),
            func.count(func.nullif(ProductSearchLog.source == "app", False)).label("searches_app"),
            func.count(distinct(ProductSearchLog.company_id)).label("unique_sellers_count"),
            func.string_agg(Company.name.distinct(), "|||").label("seller_names"),
        )
        .join(Company, Company.id == ProductSearchLog.company_id)
        .filter(ProductSearchLog.created_at >= cutoff_date)
    )
    if company_id:
        prod_query = prod_query.filter(ProductSearchLog.company_id == company_id)
    if source:
        prod_query = prod_query.filter(ProductSearchLog.source == source)

    prod_results = (
        prod_query.group_by(
            ProductSearchLog.search_term,
            ProductSearchLog.matched_isbn,
            ProductSearchLog.matched_name,
            ProductSearchLog.matched_cod_item,
        )
        .order_by(desc("total_searches"))
        .limit(limit)
        .all()
    )

    top_products = [
        {
            "search_term": r[0],
            "isbn": r[1],
            "product_name": r[2] or r[0],
            "cod_item": r[3],
            "total_searches": r[4],
            "last_searched_at": r[5].isoformat() if r[5] else None,
            "searches_web": r[6],
            "searches_app": r[7],
            "unique_sellers_count": r[8],
            "seller_names": [s.strip() for s in (r[9] or "").split("|||") if s.strip()],
        }
        for r in prod_results
    ]

    # 3. Ranking Sellers Mais Ativos no Busca Preço
    seller_query = (
        db.query(
            Company.id.label("company_id"),
            Company.name.label("company_name"),
            Company.document.label("company_document"),
            Company.logo.label("company_logo"),
            func.count(ProductSearchLog.id).label("total_searches"),
            func.max(ProductSearchLog.created_at).label("last_searched_at"),
            func.count(func.nullif(ProductSearchLog.source == "web", False)).label("searches_web"),
            func.count(func.nullif(ProductSearchLog.source == "app", False)).label("searches_app"),
        )
        .join(Company, Company.id == ProductSearchLog.company_id)
        .filter(ProductSearchLog.created_at >= cutoff_date)
    )
    if company_id:
        seller_query = seller_query.filter(ProductSearchLog.company_id == company_id)
    if source:
        seller_query = seller_query.filter(ProductSearchLog.source == source)

    seller_results = (
        seller_query.group_by(Company.id, Company.name, Company.document, Company.logo)
        .order_by(desc("total_searches"))
        .limit(20)
        .all()
    )

    top_sellers = [
        {
            "company_id": s[0],
            "company_name": s[1],
            "company_document": s[2],
            "company_logo": s[3],
            "total_searches": s[4],
            "last_searched_at": s[5].isoformat() if s[5] else None,
            "searches_web": s[6],
            "searches_app": s[7],
        }
        for s in seller_results
    ]

    return {
        "days": days,
        "filter_company_id": company_id,
        "filter_source": source,
        "summary": {
            "total_searches": total_searches,
            "searches_web": searches_web,
            "searches_app": searches_app,
            "total_sellers_active": total_sellers_count,
            "matched_searches": matched_searches,
            "unmatched_searches": unmatched_searches,
            "success_rate_percent": round((matched_searches / total_searches * 100), 1) if total_searches > 0 else 0,
        },
        "top_products": top_products,
        "top_sellers": top_sellers,
    }


@router.get("/master/logs")
def get_master_search_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    company_id: Optional[int] = Query(None, description="Filtrar por seller"),
    source: Optional[str] = Query(None, description="Filtrar por canal: web | app | physical_scanner"),
    q: Optional[str] = Query(None, description="Filtrar por termo, ISBN ou nome"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retorna logs detalhados e paginados de buscas para o usuário MASTER.
    Exibe dados do Seller (razão social / nome fantasia e CNPJ) e dados do operador/usuário.
    """
    user_type = getattr(current_user, "type", None)
    if hasattr(user_type, "value"):
        user_type = user_type.value
    if user_type != "MASTER":
        raise HTTPException(status_code=403, detail="Acesso restrito ao perfil MASTER.")

    from sqlalchemy import desc, or_

    query = (
        db.query(
            ProductSearchLog,
            Company.name.label("company_name"),
            Company.document.label("company_document"),
            User.name.label("user_name"),
            User.email.label("user_email"),
        )
        .join(Company, Company.id == ProductSearchLog.company_id)
        .outerjoin(User, User.id == ProductSearchLog.user_id)
    )

    if company_id:
        query = query.filter(ProductSearchLog.company_id == company_id)
    if source:
        query = query.filter(ProductSearchLog.source == source)
    if q and q.strip():
        term_clean = f"%{q.strip()}%"
        query = query.filter(
            or_(
                ProductSearchLog.search_term.ilike(term_clean),
                ProductSearchLog.matched_isbn.ilike(term_clean),
                ProductSearchLog.matched_name.ilike(term_clean),
                Company.name.ilike(term_clean),
            )
        )

    total = query.count()
    rows = (
        query.order_by(desc(ProductSearchLog.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    items = []
    for log, comp_name, comp_doc, usr_name, usr_email in rows:
        items.append({
            "id": log.id,
            "company_id": log.company_id,
            "company_name": comp_name,
            "company_document": comp_doc,
            "user_id": log.user_id,
            "user_name": usr_name,
            "user_email": usr_email,
            "search_term": log.search_term,
            "search_option": log.search_option,
            "source": log.source,
            "matched_cod_item": log.matched_cod_item,
            "matched_isbn": log.matched_isbn,
            "matched_name": log.matched_name,
            "total_results": log.total_results,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        })

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": items,
    }


# ──────────────────────────────────────────────────────────────────────────────
# 6. Autenticação Dedicada & Diagnóstico para Terminais Físicos (Gertec G2)
# ──────────────────────────────────────────────────────────────────────────────

from pydantic import BaseModel


class TerminalAuthRequest(BaseModel):
    email: str
    password: str
    company_id: Optional[int] = None


@router.post("/terminal-auth")
def authenticate_price_checker_terminal(
    payload: TerminalAuthRequest,
    db: Session = Depends(get_db),
):
    """
    Autentica o aplicativo Windows "Cronuz Busca Preço (Gertec G2)" e gera um token
    de longa duração (365 dias) em uma sessão isolada (`GERTEC_TERMINAL`),
    garantindo que o login no navegador web ou PDV do seller NUNCA derrube o terminal.
    """
    import re
    import uuid
    from datetime import datetime, timedelta, timezone
    from app.core import security
    from app.models.user_session import UserSession

    username_input = payload.email.strip()
    filters = [User.email == username_input]
    if "@" not in username_input:
        username_clean = re.sub(r"\D", "", username_input)
        if username_clean:
            filters.append(User.document == username_clean)

    query = db.query(User).filter(or_(*filters))
    if payload.company_id:
        query = query.filter(User.company_id == payload.company_id)

    user = query.first()
    if not user or not security.verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=401,
            detail="E-mail/documento ou senha incorretos.",
        )

    target_company_id = payload.company_id or user.company_id
    if not target_company_id:
        raise HTTPException(
            status_code=400,
            detail="Este usuário não possui uma empresa (Seller) vinculada. Informe o ID da Empresa.",
        )

    company = db.query(Company).filter(Company.id == target_company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    jti = str(uuid.uuid4())
    now_utc = datetime.now(timezone.utc)
    expires_delta = timedelta(days=365)
    expire_date = now_utc + expires_delta

    # Sessão com role GERTEC_TERMINAL para NÃO ser invalidada quando o SELLER logar na web
    new_session = UserSession(
        user_id=user.id,
        role="GERTEC_TERMINAL",
        jti=jti,
        ip_address="gertec-windows-app",
        user_agent="CronuzGertecServer/1.0",
        login_at=now_utc,
        last_activity_at=now_utc,
        expires_at=expire_date,
        is_active=True,
    )
    db.add(new_session)
    db.commit()

    user_type_str = user.type.value if hasattr(user.type, "value") else str(user.type)
    access_token = security.create_access_token(
        data={
            "sub": user.email,
            "type": user_type_str,
            "company_id": target_company_id,
            "jti": jti,
        },
        expires_delta=expires_delta,
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "company_id": company.id,
        "company_name": company.name,
        "company_document": company.document,
        "user_name": user.name,
        "user_email": user.email,
    }


@router.get("/terminal-status")
async def get_terminal_configuration_status(
    test_horus: bool = Query(True, description="Executar ping real de conectividade no Horus ERP"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Realiza um diagnóstico completo das configurações necessárias para o funcionamento
    do leitor Gertec Busca Preço G2 no Seller atual.
    Retorna exatamente o que está OK e o que precisa ser configurado caso falte algo.
    """
    company_id = current_user.company_id
    if not company_id:
        return {
            "ready": False,
            "company": None,
            "checklist": [
                {
                    "key": "company_bound",
                    "label": "Vínculo de Empresa (Seller)",
                    "ok": False,
                    "detail": "O usuário autenticado não está vinculado a uma empresa Seller.",
                    "action_hint": "Faça login com uma conta de Seller ou selecione a empresa correta.",
                }
            ],
        }

    company = db.query(Company).filter(Company.id == company_id).first()
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    branches_count = (
        db.query(SellerBranch)
        .filter(SellerBranch.company_id == company_id, SellerBranch.active == True)
        .count()
    )

    checklist = []

    # 1. Empresa ativa e módulo Busca Preço
    module_active = bool(company and getattr(company, "module_busca_preco", False))
    checklist.append({
        "key": "module_busca_preco",
        "label": "Módulo Busca Preço Habilitado",
        "ok": module_active,
        "required": False,  # Avisar se desativado, mas permitir operação
        "detail": (
            f"Módulo Busca Preço ativo para {company.name}."
            if module_active
            else "O módulo 'Busca Preço' ainda não está marcado como ativo no cadastro da empresa."
        ),
        "action_hint": (
            None
            if module_active
            else "No Painel Master → Empresas → Módulos, ative o módulo 'Busca Preço'."
        ),
    })

    # 2. Integração Horus Habilitada
    horus_enabled = bool(settings and settings.horus_enabled)
    checklist.append({
        "key": "horus_enabled",
        "label": "Integração Horus ERP Ativa",
        "ok": horus_enabled,
        "required": True,
        "detail": (
            "A integração com o ERP Horus está habilitada nas configurações do Seller."
            if horus_enabled
            else "A integração com o ERP Horus está DESATIVADA para este Seller."
        ),
        "action_hint": (
            None
            if horus_enabled
            else "Acesse Configurações da Empresa → Aba Horus ERP e marque 'Habilitar Integração Horus'."
        ),
    })

    # 3. Credenciais da API Horus (URL, Porta, Usuário, Senha)
    missing_fields = []
    if not settings or not (settings.horus_url or "").strip():
        missing_fields.append("URL do Horus")
    if not settings or not (settings.horus_username or "").strip():
        missing_fields.append("Usuário da API Horus")
    if not settings or not (settings.horus_password or "").strip():
        missing_fields.append("Senha da API Horus")

    creds_ok = len(missing_fields) == 0
    horus_endpoint_preview = None
    if settings and settings.horus_url:
        port_part = f":{settings.horus_port}" if settings.horus_port and f":{settings.horus_port}" not in settings.horus_url else ""
        horus_endpoint_preview = f"{settings.horus_url.rstrip('/')}{port_part}"

    checklist.append({
        "key": "horus_credentials",
        "label": "Dados de Conexão da API Horus (URL / Usuário / Senha)",
        "ok": creds_ok,
        "required": True,
        "detail": (
            f"Configurado para {horus_endpoint_preview} (Usuário: {settings.horus_username})."
            if creds_ok
            else f"Campos pendentes de preenchimento: {', '.join(missing_fields)}."
        ),
        "action_hint": (
            None
            if creds_ok
            else "Acesse o Painel Cronuz → Configurações da Empresa → Horus ERP e preencha URL, Porta, Usuário e Senha."
        ),
    })

    # 4. Parâmetros de Empresa/Filial/Paginação Horus
    has_emp_filial = bool(settings and settings.horus_company and settings.horus_branch)
    legacy_pag = bool(settings and getattr(settings, "horus_legacy_pagination", False))
    checklist.append({
        "key": "horus_company_branch",
        "label": "Parâmetros de Empresa/Filial e Paginação (OFFSET/LIMIT)",
        "ok": True,
        "required": False,
        "detail": (
            f"Empresa Horus: {settings.horus_company or 'Padrão'} | Filial: {settings.horus_branch or 'Padrão'} | "
            f"Local Estoque: {settings.horus_stock_local or 'Geral'} | "
            f"Paginação: {'Legada (Sem OFFSET/LIMIT)' if legacy_pag else 'Padrão (Com OFFSET/LIMIT)'} | "
            f"Filiais cadastradas: {branches_count}"
            if settings
            else "Configurações complementares do Horus não localizadas."
        ),
        "action_hint": (
            None
            if has_emp_filial
            else "Recomendado preencher Código da Empresa e Filial Horus nas Configurações da Empresa."
        ),
    })

    # 5. Teste Real de Comunicação com o Servidor Horus
    horus_live_ok = False
    horus_live_detail = "Teste de conexão não executado devido a credenciais incompletas."
    horus_live_hint = "Corrija os itens anteriores para testar a comunicação com o Horus."

    if horus_enabled and creds_ok and test_horus:
        try:
            client = HorusProductSearch(db, company_id)
            try:
                # Faz uma consulta rápida de diagnóstico
                raw = await client.busca_acervo(
                    term="97885",
                    search_option="BARRAS_ISBN",
                    offset=0,
                    limit=1,
                )
                # Se respondeu JSON do Horus (mesmo que "Nenhum registro encontrado"), a comunicação HTTP/Auth está 100% funcional!
                horus_live_ok = True
                horus_live_detail = "Comunicação em tempo real com o servidor Horus ERP validada com sucesso!"
                horus_live_hint = None
            except Exception as exc:
                err_txt = str(exc)
                # No Horus, quando retorna HTTP 200 ou erro de negócio controlado mas conectou
                horus_live_ok = False
                horus_live_detail = f"Falha ao comunicar com a API do Horus: {err_txt}"
                horus_live_hint = (
                    "Verifique se o servidor Horus do Seller está online, se a porta está liberada no firewall "
                    "e se o usuário/senha do TServerB2B estão corretos."
                )
            finally:
                await client.close()
        except Exception as exc:
            horus_live_ok = False
            horus_live_detail = f"Erro ao inicializar cliente Horus: {str(exc)}"
            horus_live_hint = "Verifique os dados da API Horus no cadastro da empresa."

    checklist.append({
        "key": "horus_live_connection",
        "label": "Comunicação em Tempo Real com o Servidor Horus ERP",
        "ok": horus_live_ok,
        "required": True,
        "detail": horus_live_detail,
        "action_hint": horus_live_hint,
    })

    ready = all(item["ok"] for item in checklist if item.get("required", True))

    return {
        "ready": ready,
        "company": {
            "id": company.id if company else company_id,
            "name": company.name if company else "Empresa",
            "document": company.document if company else "",
            "horus_url": horus_endpoint_preview,
            "horus_company": settings.horus_company if settings else None,
            "horus_branch": settings.horus_branch if settings else None,
            "horus_stock_local": settings.horus_stock_local if settings else None,
            "horus_legacy_pagination": legacy_pag,
        },
        "checklist": checklist,
    }

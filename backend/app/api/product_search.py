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
from typing import Any, Optional
import logging

from app.db.session import get_db, SessionLocal
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.company import Company
from app.models.seller_branch import SellerBranch
from app.models.product_address import ProductAddress
from app.models.company_settings import CompanySettings
from app.models.product_search_log import ProductSearchLog
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


# ──────────────────────────────────────────────────────────────────────────────
# 1. Busca de Produto
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
    """
    Busca produto(s) no Horus via endpoint `Busca_Acervo` (padrão, sem B2B).

    Retorna lista de produtos com dados gerais (nome, ISBN, preço de capa,
    saldo geral, situação, sinopse etc.) + URL da capa montada via
    cover_image_base_url configurado no seller.
    
    Grava log analítico da consulta em background para relatórios de produtos mais buscados.
    """
    if search_option not in _VALID_SEARCH_OPTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"search_option inválido. Use: {', '.join(_VALID_SEARCH_OPTIONS)}",
        )

    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="Usuário sem empresa vinculada.")

    # Lê URL base de capas configurada pelo seller
    settings = db.query(CompanySettings).filter(
        CompanySettings.company_id == current_user.company_id
    ).first()
    cover_base_url: Optional[str] = settings.cover_image_base_url if settings else None

    try:
        client = HorusProductSearch(db, current_user.company_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        raw = await client.busca_acervo(
            term=term,
            search_option=search_option,
            offset=offset,
            limit=limit,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erro ao consultar Horus: {str(e)}")
    finally:
        await client.close()

    # Normalização: injeta a URL da capa em cada item
    matched_cod_item: Optional[int] = None
    matched_isbn: Optional[str] = None
    matched_name: Optional[str] = None
    total_found = 0

    if isinstance(raw, list):
        if len(raw) > 0 and isinstance(raw[0], dict):
            first = raw[0]
            if first.get("Falha") or first.get("FALHA") == "S":
                raise HTTPException(
                    status_code=400,
                    detail=first.get("Mensagem", "Nenhum produto localizado no Horus."),
                )
        items = []
        for item in raw:
            if isinstance(item, dict):
                cod_barra = item.get("COD_BARRA_ITEM") or item.get("BARRAS_ISBN")
                item["COVER_URL"] = _build_cover_url(cover_base_url, cod_barra)
            items.append(item)

        total_found = len(items)
        if total_found > 0:
            first_item = items[0]
            matched_cod_item = first_item.get("COD_ITEM")
            matched_isbn = first_item.get("COD_BARRA_ITEM") or first_item.get("BARRAS_ISBN")
            matched_name = first_item.get("NOM_ITEM")

        # Dispara gravação de log analítico em background
        background_tasks.add_task(
            _record_search_log,
            company_id=current_user.company_id,
            user_id=current_user.id,
            term=term,
            search_option=search_option,
            source=source,
            matched_cod_item=matched_cod_item,
            matched_isbn=matched_isbn,
            matched_name=matched_name,
            total_results=total_found,
        )

        return {"items": items, "total": total_found}

    if isinstance(raw, dict):
        if raw.get("Falha"):
            raise HTTPException(
                status_code=400,
                detail=raw.get("Mensagem", "Nenhum produto localizado no Horus."),
            )
        cod_barra = raw.get("COD_BARRA_ITEM") or raw.get("BARRAS_ISBN")
        raw["COVER_URL"] = _build_cover_url(cover_base_url, cod_barra)

        matched_cod_item = raw.get("COD_ITEM")
        matched_isbn = cod_barra
        matched_name = raw.get("NOM_ITEM")

        background_tasks.add_task(
            _record_search_log,
            company_id=current_user.company_id,
            user_id=current_user.id,
            term=term,
            search_option=search_option,
            source=source,
            matched_cod_item=matched_cod_item,
            matched_isbn=matched_isbn,
            matched_name=matched_name,
            total_results=1,
        )

        return {"items": [raw], "total": 1}

    # Nenhum resultado
    background_tasks.add_task(
        _record_search_log,
        company_id=current_user.company_id,
        user_id=current_user.id,
        term=term,
        search_option=search_option,
        source=source,
        matched_cod_item=None,
        matched_isbn=None,
        matched_name=None,
        total_results=0,
    )

    return {"items": [], "total": 0}


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

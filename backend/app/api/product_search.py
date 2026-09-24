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
from typing import Any, Optional
import logging

from app.db.session import get_db, SessionLocal
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.seller_branch import SellerBranch
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
            result = await asyncio.wait_for(client.get_stock_by_isbn(isbn), timeout=25.0)
        except asyncio.TimeoutError:
            result = {"found": False, "saldo": 0, "error": "Tempo limite esgotado ao consultar a Catavento (Timeout)."}
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

    # Monta coroutines por distribuidor com tratamento individual
    tasks = []
    for dist in distributors:
        if dist.slug == "catavento":
            tasks.append(query_catavento(dist))
        elif dist.slug == "disal":
            tasks.append(query_disal(dist))
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



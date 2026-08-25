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
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Any, Optional

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.seller_branch import SellerBranch
from app.models.company_settings import CompanySettings
from app.integrators.horus_product_search import HorusProductSearch

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
    offset: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Busca produto(s) no Horus via endpoint `Busca_Acervo` (padrão, sem B2B).

    Retorna lista de produtos com dados gerais (nome, ISBN, preço de capa,
    saldo geral, situação, sinopse etc.) + URL da capa montada via
    cover_image_base_url configurado no seller.
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
        return {"items": items, "total": len(items)}

    if isinstance(raw, dict):
        if raw.get("Falha"):
            raise HTTPException(
                status_code=400,
                detail=raw.get("Mensagem", "Nenhum produto localizado no Horus."),
            )
        cod_barra = raw.get("COD_BARRA_ITEM") or raw.get("BARRAS_ISBN")
        raw["COVER_URL"] = _build_cover_url(cover_base_url, cod_barra)
        return {"items": [raw], "total": 1}

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
        raise HTTPException(status_code=400, detail=str(e))

    try:
        results = await client.busca_estoque_por_filiais(
            cod_item=cod_item,
            branches=branches,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erro ao consultar estoque no Horus: {str(e)}")
    finally:
        await client.close()

    return {
        "cod_item": cod_item,
        "branches": results,
    }

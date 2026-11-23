"""
backend/app/api/horus_analise_itens.py
--------------------------------------
Módulo dedicado: Horus Direct -> Análise de Itens (/horus-direct/analise-itens)
Totalmente isolado do DBM exclusivo da EO Editora (Olhares).

Recursos principais:
1. Integração nativa com Filiais do Seller (/logistics/branches - cmp_seller_branch):
   - Permite analisar uma Empresa/Filial/Local específica ou TODAS as filiais configuradas.
2. Contador exato de sincronização (Total Horus SQL vs Sincronizados no Cronuz vs Faltando)
   + Worker de Sincronização em Segundo Plano (Background Sync) em lotes seguros por keyset pagination
   (COD_ITEM > last_cod_item), sem travar o Uvicorn e sem dar timeout ("Failed to fetch").
3. Enriquecimento Multi-Filial de Alta Performance (TABELA_SALDO_ITENS_GERAL + TABELA_SALDO_ITENS):
   - Saldo Disponível (respeitando COD_LOCAL configurado na filial quando aplicável)
   - Consignado Enviado (SALDO_CONSIGNADO_ENVIADO)
   - Consignado Recebido (SALDO_CONSIGNADO_RECEBIDO)
   - Custo Médio / Unitário por Filial (CUSTO_MEDIO_ESTOQUE / CUSTO_MEDIO_ESTOQUE_REAL)
4. Vendas por Filial com filtro de período (dias ou intervalo de datas) via NF_ITENS + NF_MESTRE.
5. Última Entrada confiável de COMPRA ou RECEBIMENTO EM CONSIGNAÇÃO (excluindo Ajustes!) por Filial:
   - Combina NF_ENTRADA + ITENS_NOTAS_FISCAIS (CFOPs de Compra e Consignação Recebida 1917/2917)
     com TABELA_MOVIMENTACAO + TPO_MOVIMENTACAO (STA_MOVTO = 'E', excluindo ajustes/devoluções).
6. Exportação segura de Relatório Excel Multi-Filial (repetindo linhas por filial para análise
   de estoque, custo, última entrada e sugestão de reposição baseada em vendas vs saldo).
"""

import io
import logging
import re
import threading
import time as _time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import String, cast, func, or_
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import SessionLocal, get_db
from app.integrators.horus_sql_client import HorusSQLClient, HorusSQLConfigError
from app.models.catalog_support import Brand, Category
from app.models.company import Company
from app.models.company_settings import CompanySettings
from app.models.product import Product
from app.models.seller_branch import SellerBranch
from app.models.user import User

router = APIRouter(prefix="/horus-analise-itens", tags=["horus-analise-itens"])
log = logging.getLogger(__name__)

# ── CFOPs Oficiais para Vendas, Compras e Recebimento em Consignação ──────────
CFOP_VENDAS_TUPLE = (
    "5101", "5102", "5108", "5113", "5114", "5115", "5403", "5405",
    "6101", "6102", "6108", "6113", "6114", "6115", "6403", "6405",
)

CFOP_ENTRADA_COMPRA_TUPLE = (
    "1101", "1102", "2101", "2102",
    "1113", "1114", "2113", "2114",
    "1401", "1403", "2401", "2403",
    "1120", "2120", "1121", "2121",
)

CFOP_ENTRADA_CONSIG_TUPLE = (
    "1917", "2917",
)


def _build_sargable_cfop_in(cfop_codes: Tuple[str, ...]) -> str:
    """
    Gera lista literal SARGable para COD_NATUREZA IN (...), cobrindo variações
    formatadas no Horus ('1102', '1.102', '1,102', '1.102.', '1102 ').
    """
    variants: set[str] = set()
    for raw in cfop_codes:
        c = str(raw or "").strip().replace(".", "").replace(",", "").replace(" ", "")
        if len(c) == 4 and c.isdigit():
            variants.add(c)
            variants.add(f"{c[0]}.{c[1:]}")
            variants.add(f"{c[0]},{c[1:]}")
            variants.add(f"{c[0]}.{c[1:]}.")
            variants.add(f"{c} ")
    return ", ".join(f"'{v}'" for v in sorted(variants))


SARGABLE_CFOP_VENDAS = _build_sargable_cfop_in(CFOP_VENDAS_TUPLE)
SARGABLE_CFOP_ENTRADA_COMPRA_CONSIG = _build_sargable_cfop_in(
    CFOP_ENTRADA_COMPRA_TUPLE + CFOP_ENTRADA_CONSIG_TUPLE
)
CLEAN_CONSIG_CFOPS_SET = set(CFOP_ENTRADA_CONSIG_TUPLE)


def _resolve_seller_id(current_user: Any, company_id: Optional[int] = None) -> int:
    is_master = False
    if hasattr(current_user, "type"):
        u_type = current_user.type
        t_str = u_type.value if hasattr(u_type, "value") else str(u_type or "")
        is_master = t_str.upper() == "MASTER"
    elif isinstance(current_user, dict):
        is_master = str(current_user.get("type") or "").upper() == "MASTER"

    user_cid = (
        getattr(current_user, "company_id", None)
        if not isinstance(current_user, dict)
        else current_user.get("company_id")
    )
    if is_master and company_id:
        return int(company_id)
    if user_cid:
        return int(user_cid)
    if company_id:
        return int(company_id)
    raise HTTPException(status_code=400, detail="Empresa (Seller) não identificada.")


def _parse_int(val: Any, default: int = 0) -> int:
    if val is None:
        return default
    s = str(val).strip()
    if s.lstrip("-").isdigit():
        return int(s)
    try:
        return int(float(s))
    except Exception:
        return default


def _extract_branch_locais(branch: SellerBranch) -> List[int]:
    locais: List[int] = []
    if branch.cod_local and str(branch.cod_local).strip().isdigit():
        locais.append(int(str(branch.cod_local).strip()))
    if isinstance(branch.cod_local_estoque, list):
        for raw_l in branch.cod_local_estoque:
            s_l = str(raw_l or "").strip()
            if s_l.isdigit():
                val_l = int(s_l)
                if val_l not in locais:
                    locais.append(val_l)
    return locais


def _load_configured_branches(db: Session, seller_id: int) -> List[Dict[str, Any]]:
    """
    Carrega todas as filiais ativas configuradas em /logistics/branches (cmp_seller_branch).
    Caso o seller ainda não tenha filiais cadastradas em cmp_seller_branch, utiliza a
    empresa/filial/local padrão de cmp_settings.
    """
    rows = (
        db.query(SellerBranch)
        .filter(SellerBranch.company_id == seller_id, SellerBranch.active == True)
        .order_by(SellerBranch.id.asc())
        .all()
    )
    branches: List[Dict[str, Any]] = []
    for b in rows:
        emp = _parse_int(b.cod_empresa, 1)
        fil = _parse_int(b.cod_filial, 1)
        locais = _extract_branch_locais(b)
        loc_label = f" • Local {', '.join(str(x) for x in locais)}" if locais else ""
        branches.append({
            "id": b.id,
            "nome": (b.nome or f"Filial {fil}").strip(),
            "cnpj": b.cnpj or "",
            "cod_empresa": emp,
            "cod_filial": fil,
            "cod_local": locais[0] if locais else None,
            "locais": locais,
            "label": f"{(b.nome or f'Filial {fil}').strip()} (Emp {emp} • Fil {fil}{loc_label})",
        })

    if not branches:
        settings = db.query(CompanySettings).filter(CompanySettings.company_id == seller_id).first()
        emp = 1
        fil = 1
        locais: List[int] = []
        if settings:
            for cand_e in (settings.horus_company, settings.horus_sql_cod_empresa):
                if cand_e and str(cand_e).strip().isdigit():
                    emp = int(str(cand_e).strip())
                    break
            for cand_f in (settings.horus_branch, settings.horus_sql_cod_filial):
                if cand_f and str(cand_f).strip().isdigit():
                    fil = int(str(cand_f).strip())
                    break
            if settings.horus_stock_local and str(settings.horus_stock_local).strip().isdigit():
                locais.append(int(str(settings.horus_stock_local).strip()))
        loc_label = f" • Local {locais[0]}" if locais else ""
        branches.append({
            "id": 0,
            "nome": f"Filial Principal ({emp}/{fil})",
            "cnpj": "",
            "cod_empresa": emp,
            "cod_filial": fil,
            "cod_local": locais[0] if locais else None,
            "locais": locais,
            "label": f"Filial Principal (Emp {emp} • Fil {fil}{loc_label})",
        })

    return branches


# ── Cache do Total de Itens no Horus SQL & Estado do Background Sync Worker ───
_HORUS_COUNT_CACHE: Dict[int, Dict[str, Any]] = {}
_BG_SYNC_LOCK = threading.Lock()
_BG_SYNC_STATES: Dict[int, Dict[str, Any]] = {}


def _get_horus_total_count(sql_client: Optional[HorusSQLClient], seller_id: int, force: bool = False) -> int:
    now = _time.time()
    cached = _HORUS_COUNT_CACHE.get(seller_id)
    if not force and cached and (now - cached["ts"] < 90):
        return int(cached["total"])
    if not sql_client:
        return int(cached["total"]) if cached else 0
    try:
        rows = sql_client.query(
            "SELECT COUNT(*) AS total FROM ITENS_ESTOQUE_GERAL WITH (NOLOCK)",
            max_rows=1,
        )
        total = int(rows[0].get("total") or 0) if rows else 0
        _HORUS_COUNT_CACHE[seller_id] = {"ts": now, "total": total}
        return total
    except Exception as e:
        log.warning(f"[HorusAnaliseItens] Aviso ao contar ITENS_ESTOQUE_GERAL (company={seller_id}): {e}")
        return int(cached["total"]) if cached else 0


def _detect_launch_col(sql_client: HorusSQLClient) -> str:
    try:
        rows = sql_client.query(
            """
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'ITENS_ESTOQUE_GERAL'
              AND COLUMN_NAME IN ('DAT_LANCAMENTO', 'DAT_EXP_LANCTO', 'DATA_LANCAMENTO', 'DAT_CADASTRO')
            """,
            max_rows=10,
        )
        found = {str(r.get("COLUMN_NAME") or "").upper() for r in (rows or [])}
        for pref in ("DAT_LANCAMENTO", "DAT_EXP_LANCTO", "DATA_LANCAMENTO", "DAT_CADASTRO"):
            if pref in found:
                return f"I.{pref}"
    except Exception:
        pass
    return "I.DAT_CADASTRO"


def _run_background_sync_worker(seller_id: int, only_with_stock: bool = False) -> None:
    """
    Worker em segundo plano que sincroniza todo o acervo de ITENS_ESTOQUE_GERAL do Horus SQL
    para a base local do Cronuz (prd_product) em lotes seguros de 400 itens usando
    keyset pagination (I.COD_ITEM > last_cod_item).
    """
    db = SessionLocal()
    try:
        sql_client = HorusSQLClient(db, seller_id)
        branches = _load_configured_branches(db, seller_id)
        settings = db.query(CompanySettings).filter(CompanySettings.company_id == seller_id).first()
        legacy_pagination = getattr(settings, "horus_legacy_pagination", False) if settings else False
        cover_primary = (settings.cover_image_base_url or "").strip().rstrip("/") if settings else ""
        cover_secondary = (settings.cover_image_secondary_base_url or "").strip().rstrip("/") if settings else ""

        horus_total = _get_horus_total_count(sql_client, seller_id, force=True)
        launch_col = _detect_launch_col(sql_client)

        # Pré-carrega mapa rápido de produtos existentes do seller (horus_cod_item -> id, ean_gtin -> id)
        existing_rows = (
            db.query(Product.id, Product.horus_cod_item, Product.ean_gtin, Product.sku)
            .filter(Product.company_id == seller_id)
            .all()
        )
        by_cod_item: Dict[int, int] = {}
        by_isbn: Dict[str, int] = {}
        for pid, h_cod, ean, sku in existing_rows:
            if h_cod is not None:
                by_cod_item[int(h_cod)] = int(pid)
            for raw_k in (ean, sku):
                if raw_k and str(raw_k).strip():
                    by_isbn[str(raw_k).strip()] = int(pid)

        # Cláusula de filiais para somar saldo das filiais configuradas
        branch_pairs = list({(b["cod_empresa"], b["cod_filial"]) for b in branches})
        if branch_pairs:
            pair_conds = " OR ".join(
                f"(cod_empresa = {int(emp)} AND cod_filial = {int(fil)})"
                for emp, fil in branch_pairs
            )
        else:
            pair_conds = "1=1"

        batch_size = 400
        last_cod_item = 0

        with _BG_SYNC_LOCK:
            st = _BG_SYNC_STATES.get(seller_id, {})
            st["horus_total"] = horus_total
            st["synced_total"] = len(existing_rows)
            st["missing_total"] = max(0, horus_total - len(existing_rows))
            st["status_message"] = "Sincronizando lotes do Horus SQL em segundo plano..."

        while True:
            with _BG_SYNC_LOCK:
                st = _BG_SYNC_STATES.get(seller_id)
                if not st or st.get("stop_requested"):
                    if st:
                        st["is_running"] = False
                        st["status_message"] = "Sincronização pausada pelo usuário."
                        st["finished_at"] = datetime.utcnow().isoformat()
                    break

            top_clause = f"TOP ({batch_size})" if legacy_pagination else ""
            offset_clause = "" if legacy_pagination else f"OFFSET 0 ROWS FETCH NEXT {batch_size} ROWS ONLY"
            stock_having = "AND ISNULL(S.saldo_disponivel, 0) > 0" if only_with_stock else ""

            sql_batch = f"""
                SELECT {top_clause}
                    I.COD_ITEM AS cod_item,
                    RTRIM(LTRIM(ISNULL(I.COD_BARRA_ITEM, ISNULL(I.COD_ISBN_ITEM, '')))) AS isbn,
                    RTRIM(LTRIM(ISNULL(I.NOM_ITEM, ''))) AS nome_item,
                    RTRIM(LTRIM(ISNULL(ED.NOM_FANTASIA, ISNULL(ED.NOM_EDITORA, '')))) AS editora,
                    RTRIM(LTRIM(ISNULL(G.NOM_GENERO, ''))) AS assunto,
                    ISNULL(PA.VLR_CAPA, ISNULL(I.VLR_CAPA, 0.0)) AS preco,
                    ISNULL(S.saldo_disponivel, 0) AS estoque,
                    ISNULL(S.consig_enviado, 0) AS consig_enviado,
                    ISNULL(S.custo_medio, 0.0) AS custo_medio,
                    ISNULL(I.QTD_ITENS_CAIXA, 0) AS qtd_caixa,
                    RTRIM(LTRIM(ISNULL(I.SITUACAO_ITEM, ''))) AS situacao_item,
                    {launch_col} AS data_lancamento
                FROM ITENS_ESTOQUE_GERAL I WITH (NOLOCK)
                LEFT JOIN EDITORA ED WITH (NOLOCK) ON ED.COD_EDITORA = I.COD_EDITORA
                LEFT JOIN TABELA_GENERO G WITH (NOLOCK) ON G.COD_GENERO = I.COD_GENERO
                LEFT JOIN (
                    SELECT COD_ITEM, MAX(VLR_CAPA) AS VLR_CAPA
                    FROM ITENS_ESTPRECO_ATUAL WITH (NOLOCK)
                    GROUP BY COD_ITEM
                ) PA ON PA.COD_ITEM = I.COD_ITEM
                LEFT JOIN (
                    SELECT
                        COD_ITEM AS cod_item,
                        SUM(ISNULL(SALDO_VENDAVEL, 0) - ISNULL(SALDO_RESERVADO_VENDA, 0)) AS saldo_disponivel,
                        SUM(ISNULL(SALDO_CONSIGNADO_ENVIADO, 0)) AS consig_enviado,
                        MAX(ISNULL(CUSTO_MEDIO_ESTOQUE, 0)) AS custo_medio
                    FROM TABELA_SALDO_ITENS_GERAL WITH (NOLOCK)
                    WHERE ({pair_conds})
                    GROUP BY COD_ITEM
                ) S ON S.cod_item = I.COD_ITEM
                WHERE I.COD_ITEM > %s
                  {stock_having}
                ORDER BY I.COD_ITEM ASC
                {offset_clause}
            """
            rows = sql_client.query(sql_batch, (last_cod_item,), max_rows=batch_size + 5)
            if not rows:
                with _BG_SYNC_LOCK:
                    st = _BG_SYNC_STATES.get(seller_id)
                    if st:
                        st["is_running"] = False
                        st["missing_total"] = 0
                        st["status_message"] = "Sincronização em segundo plano concluída com sucesso!"
                        st["finished_at"] = datetime.utcnow().isoformat()
                break

            created_batch = 0
            updated_batch = 0
            new_objects: List[Product] = []
            existing_ids_in_batch = [
                by_cod_item[int(r["cod_item"])]
                for r in rows
                if r.get("cod_item") is not None and int(r["cod_item"]) in by_cod_item
            ]
            existing_prods_map: Dict[int, Product] = {}
            if existing_ids_in_batch:
                for p_obj in db.query(Product).filter(Product.id.in_(existing_ids_in_batch)).all():
                    existing_prods_map[p_obj.id] = p_obj

            for r in rows:
                cod_item = int(r["cod_item"])
                if cod_item > last_cod_item:
                    last_cod_item = cod_item

                isbn = str(r.get("isbn") or "").strip()
                sku_val = isbn if isbn else f"H-{cod_item}"
                nome = str(r.get("nome_item") or f"Item #{cod_item}").strip()
                editora = str(r.get("editora") or "").strip() or None
                assunto = str(r.get("assunto") or "").strip() or None
                preco = float(r.get("preco") or 0.0)
                estoque = int(float(r.get("estoque") or 0))
                consig_env = int(float(r.get("consig_enviado") or 0))
                custo_med = float(r.get("custo_medio") or 0.0)
                qtd_cx = int(float(r.get("qtd_caixa") or 0))
                sit_raw = str(r.get("situacao_item") or "").strip().upper()
                raw_dt = r.get("data_lancamento")
                l_dt: Optional[datetime] = None
                if isinstance(raw_dt, datetime):
                    l_dt = raw_dt
                elif raw_dt:
                    try:
                        l_dt = datetime.fromisoformat(str(raw_dt)[:19])
                    except Exception:
                        l_dt = None

                pid = by_cod_item.get(cod_item) or (by_isbn.get(isbn) if isbn else None)
                if pid and pid in existing_prods_map:
                    p_obj = existing_prods_map[pid]
                    p_obj.name = nome
                    p_obj.horus_cod_item = cod_item
                    if isbn and not p_obj.ean_gtin:
                        p_obj.ean_gtin = isbn
                    if editora:
                        p_obj.brand = editora
                    if assunto and not p_obj.subject:
                        p_obj.subject = assunto
                    if preco > 0:
                        p_obj.base_price = preco
                    if custo_med > 0:
                        p_obj.cost_price = custo_med
                    p_obj.stock_quantity = estoque
                    p_obj.consignment_stock = consig_env
                    if qtd_cx > 0 and not p_obj.units_per_box:
                        p_obj.units_per_box = qtd_cx
                    if l_dt and not p_obj.launch_date:
                        p_obj.launch_date = l_dt
                        p_obj.launch_year = l_dt.year
                        p_obj.launch_month = l_dt.month
                    updated_batch += 1
                elif not pid:
                    clean_isbn = re.sub(r"[^0-9Xx]", "", isbn)
                    cov_url = None
                    if clean_isbn:
                        if cover_primary:
                            cov_url = f"{cover_primary}/{clean_isbn}.jpg"
                        elif cover_secondary:
                            cov_url = f"{cover_secondary}/{clean_isbn}.jpg"
                    new_p = Product(
                        company_id=seller_id,
                        sku=sku_val[:100],
                        name=nome[:255],
                        ean_gtin=isbn[:50] if isbn else None,
                        barcode=isbn[:50] if isbn else None,
                        horus_cod_item=cod_item,
                        cod_dbm=str(cod_item),
                        brand=editora[:150] if editora else None,
                        subject=assunto[:150] if assunto else None,
                        base_price=preco,
                        cost_price=custo_med if custo_med > 0 else 0.0,
                        stock_quantity=estoque,
                        consignment_stock=consig_env,
                        units_per_box=qtd_cx if qtd_cx > 0 else 0,
                        launch_date=l_dt,
                        launch_year=l_dt.year if l_dt else None,
                        launch_month=l_dt.month if l_dt else None,
                        horus_situacao_item="Fora de Catálogo" if sit_raw == "FC" else ("Esgotado" if sit_raw in ("FE", "ES") else "Em Distribuição"),
                        is_out_of_print=sit_raw in ("FC", "FE", "ES"),
                        cover_url=cov_url,
                        status="ACTIVE",
                    )
                    new_objects.append(new_p)
                    created_batch += 1

            if new_objects:
                db.add_all(new_objects)
            db.commit()

            for np_obj in new_objects:
                if np_obj.horus_cod_item:
                    by_cod_item[int(np_obj.horus_cod_item)] = np_obj.id
                if np_obj.ean_gtin:
                    by_isbn[str(np_obj.ean_gtin)] = np_obj.id

            with _BG_SYNC_LOCK:
                st = _BG_SYNC_STATES.get(seller_id)
                if st:
                    st["processed_in_run"] = int(st.get("processed_in_run") or 0) + len(rows)
                    st["created_in_run"] = int(st.get("created_in_run") or 0) + created_batch
                    st["updated_in_run"] = int(st.get("updated_in_run") or 0) + updated_batch
                    st["last_cod_item"] = last_cod_item
                    st["synced_total"] = len(by_cod_item)
                    st["missing_total"] = max(0, horus_total - len(by_cod_item))
                    st["updated_at"] = datetime.utcnow().isoformat()
                    st["status_message"] = (
                        f"Processados {st['processed_in_run']:,} itens "
                        f"(Criados: {st['created_in_run']:,} • Atualizados: {st['updated_in_run']:,} • Últ. Cód: #{last_cod_item})"
                    ).replace(",", ".")

            _time.sleep(0.12)

    except Exception as exc:
        log.error(f"[HorusAnaliseItens] Erro no worker de background sync (company={seller_id}): {exc}")
        with _BG_SYNC_LOCK:
            st = _BG_SYNC_STATES.get(seller_id)
            if st:
                st["is_running"] = False
                st["last_error"] = str(exc)
                st["status_message"] = f"Erro na sincronização: {str(exc)[:180]}"
                st["finished_at"] = datetime.utcnow().isoformat()
    finally:
        db.close()


# ── Endpoints de Filiais e Status de Sincronização em Background ──────────────

@router.get("/branches")
def get_analise_itens_branches(
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retorna as filiais configuradas em /logistics/branches (Filiais do Seller)
    para o seletor de Empresa / Filial / Local da tela Análise de Itens.
    """
    seller_id = _resolve_seller_id(current_user, company_id)
    branches = _load_configured_branches(db, seller_id)
    return {
        "company_id": seller_id,
        "branches": branches,
    }


@router.get("/sync-status")
def get_analise_itens_sync_status(
    company_id: Optional[int] = Query(None),
    force_count: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retorna a contagem exata de itens no Horus SQL vs itens já sincronizados no Cronuz,
    quantos itens estão faltando sincronizar e o progresso em tempo real do worker em segundo plano.
    """
    seller_id = _resolve_seller_id(current_user, company_id)
    synced_count = (
        db.query(func.count(Product.id))
        .filter(Product.company_id == seller_id)
        .scalar()
        or 0
    )

    sql_client = None
    sql_error = None
    try:
        sql_client = HorusSQLClient(db, seller_id)
    except Exception as e:
        sql_error = str(e)

    horus_total = _get_horus_total_count(sql_client, seller_id, force=force_count)
    missing_count = max(0, horus_total - int(synced_count))
    pct = round((int(synced_count) / horus_total) * 100.0, 1) if horus_total > 0 else 0.0

    with _BG_SYNC_LOCK:
        bg_state = dict(_BG_SYNC_STATES.get(seller_id) or {})

    return {
        "company_id": seller_id,
        "horus_total": horus_total,
        "synced_count": int(synced_count),
        "missing_count": missing_count,
        "percent_complete": min(100.0, pct),
        "sql_connected": sql_client is not None,
        "sql_error": sql_error,
        "background_sync": {
            "is_running": bool(bg_state.get("is_running", False)),
            "processed_in_run": int(bg_state.get("processed_in_run") or 0),
            "created_in_run": int(bg_state.get("created_in_run") or 0),
            "updated_in_run": int(bg_state.get("updated_in_run") or 0),
            "last_cod_item": int(bg_state.get("last_cod_item") or 0),
            "status_message": bg_state.get("status_message") or (
                "Sincronização completa!" if missing_count == 0 and horus_total > 0 else f"Faltam {missing_count:,} itens para sincronizar.".replace(",", ".")
            ),
            "last_error": bg_state.get("last_error"),
            "started_at": bg_state.get("started_at"),
            "updated_at": bg_state.get("updated_at"),
            "finished_at": bg_state.get("finished_at"),
        },
    }


class BackgroundSyncStartPayload(BaseModel):
    company_id: Optional[int] = None
    only_with_stock: bool = False


@router.post("/background-sync/start")
def start_analise_itens_background_sync(
    payload: BackgroundSyncStartPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Inicia a sincronização segura em segundo plano de todos os itens de ITENS_ESTOQUE_GERAL
    do Horus SQL para a base do Cronuz (em lotes de 400 itens por COD_ITEM).
    """
    seller_id = _resolve_seller_id(current_user, payload.company_id)
    try:
        HorusSQLClient(db, seller_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Não foi possível iniciar: conexão Horus SQL indisponível ({e}).")

    with _BG_SYNC_LOCK:
        cur = _BG_SYNC_STATES.get(seller_id)
        if cur and cur.get("is_running"):
            return {
                "started": False,
                "message": "A sincronização em segundo plano já está em execução para esta empresa.",
                "state": cur,
            }
        new_state = {
            "is_running": True,
            "stop_requested": False,
            "only_with_stock": payload.only_with_stock,
            "processed_in_run": 0,
            "created_in_run": 0,
            "updated_in_run": 0,
            "last_cod_item": 0,
            "last_error": None,
            "status_message": "Iniciando worker de sincronização em segundo plano...",
            "started_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            "finished_at": None,
        }
        _BG_SYNC_STATES[seller_id] = new_state

    t = threading.Thread(
        target=_run_background_sync_worker,
        args=(seller_id, payload.only_with_stock),
        daemon=True,
    )
    t.start()

    return {
        "started": True,
        "message": "Sincronização em segundo plano iniciada com sucesso!",
        "state": new_state,
    }


@router.post("/background-sync/stop")
def stop_analise_itens_background_sync(
    company_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """
    Solicita a parada segura do worker de sincronização em segundo plano.
    """
    seller_id = _resolve_seller_id(current_user, company_id)
    with _BG_SYNC_LOCK:
        st = _BG_SYNC_STATES.get(seller_id)
        if st and st.get("is_running"):
            st["stop_requested"] = True
            st["status_message"] = "Parando sincronização após concluir o lote atual..."
            return {"stopped": True, "message": "Solicitação de pausa enviada ao worker."}
    return {"stopped": False, "message": "Nenhuma sincronização em execução no momento."}


# ── Motor Multi-Filial de Enriquecimento SQL (Saldos, Custos, Consignado, Vendas & Última Entrada) ──

def _enrich_cod_items_multibranch(
    sql_client: HorusSQLClient,
    cod_items: List[int],
    target_branches: List[Dict[str, Any]],
    sales_days: int = 90,
    sales_start_date: Optional[str] = None,
    sales_end_date: Optional[str] = None,
) -> Dict[int, Dict[str, Any]]:
    """
    Para um lote de COD_ITEMs (ex: 50 a 250 itens) e uma lista de filiais configuradas (SellerBranch),
    consulta de forma 100% indexada (COD_ITEM IN (...)) no Horus SQL Server:
      1. TABELA_SALDO_ITENS_GERAL:
         - SALDO_VENDAVEL, SALDO_ESTOQUE, SALDO_RESERVADO_VENDA
         - SALDO_CONSIGNADO_ENVIADO (Consignado Enviado)
         - SALDO_CONSIGNADO_RECEBIDO (Consignado Recebido)
         - CUSTO_MEDIO_ESTOQUE / CUSTO_MEDIO_ESTOQUE_REAL (Custo por Filial)
      2. TABELA_SALDO_ITENS (quando a filial possui COD_LOCAL configurado em /logistics/branches):
         - SALDO_TOTAL por COD_LOCAL
      3. NF_ITENS + NF_MESTRE:
         - Vendas 365d e Vendas no Período filtrado por filial
      4. NF_ENTRADA + ITENS_NOTAS_FISCAIS + TABELA_MOVIMENTACAO + TPO_MOVIMENTACAO:
         - Última Entrada de COMPRA ou RECEBIMENTO EM CONSIGNAÇÃO (excluindo Ajustes!) por filial,
           com Data da Última Entrada, Tipo (COMPRA / CONSIG. RECEBIDA), CFOP, Quantidade e Custo.
    """
    clean_cods = sorted({int(c) for c in cod_items if c is not None and int(c) > 0})
    if not clean_cods or not target_branches:
        return {}

    branch_by_pair: Dict[Tuple[int, int], List[Dict[str, Any]]] = {}
    for b in target_branches:
        pair = (int(b["cod_empresa"]), int(b["cod_filial"]))
        branch_by_pair.setdefault(pair, []).append(b)

    pair_conds = " OR ".join(
        f"(COD_EMPRESA = {emp} AND COD_FILIAL = {fil})"
        for emp, fil in branch_by_pair.keys()
    )
    nfi_pair_conds = " OR ".join(
        f"(NFI.COD_EMPRESA = {emp} AND NFI.COD_FILIAL = {fil})"
        for emp, fil in branch_by_pair.keys()
    )
    inf_pair_conds = " OR ".join(
        f"(INF.COD_EMPRESA = {emp} AND INF.COD_FILIAL = {fil})"
        for emp, fil in branch_by_pair.keys()
    )
    tm_pair_conds = " OR ".join(
        f"(TM.COD_EMPRESA_DEST = {emp} AND TM.COD_FILIAL_DEST = {fil})"
        for emp, fil in branch_by_pair.keys()
    )

    # Estrutura de saída: result[cod_item] = { "consolidated": {...}, "by_branch": { branch_id: {...} } }
    result: Dict[int, Dict[str, Any]] = {}
    for c_int in clean_cods:
        by_b: Dict[int, Dict[str, Any]] = {}
        for b in target_branches:
            by_b[int(b["id"])] = {
                "branch_id": int(b["id"]),
                "branch_name": b["nome"],
                "cod_empresa": int(b["cod_empresa"]),
                "cod_filial": int(b["cod_filial"]),
                "cod_local": b.get("cod_local"),
                "locais": b.get("locais") or [],
                "stock_available": 0,
                "stock_physical": 0,
                "consigned_sent": 0,
                "consigned_received": 0,
                "cost_price": 0.0,
                "sales_365": 0,
                "sales_period": 0,
                "last_entry_date": None,
                "last_entry_qty": 0,
                "last_entry_cost": 0.0,
                "last_entry_type": None,
                "last_entry_cfop": None,
                "last_entry_nf": None,
            }
        result[c_int] = {"by_branch": by_b}

    # Determina filtro de período de vendas
    custom_date_clause = f"NF.DAT_EMISSAO_NF >= DATEADD(day, -{max(1, int(sales_days))}, GETDATE())"
    if sales_start_date and re.match(r"^\d{4}-\d{2}-\d{2}$", sales_start_date.strip()):
        s_dt = sales_start_date.strip()
        if sales_end_date and re.match(r"^\d{4}-\d{2}-\d{2}$", sales_end_date.strip()):
            e_dt = sales_end_date.strip()
            custom_date_clause = f"(NF.DAT_EMISSAO_NF >= '{s_dt} 00:00:00' AND NF.DAT_EMISSAO_NF <= '{e_dt} 23:59:59')"
        else:
            custom_date_clause = f"NF.DAT_EMISSAO_NF >= '{s_dt} 00:00:00'"

    for chunk_start in range(0, len(clean_cods), 200):
        chunk = clean_cods[chunk_start:chunk_start + 200]
        cods_in = ", ".join(str(c) for c in chunk)

        # 1. TABELA_SALDO_ITENS_GERAL (Saldos, Consignado Enviado, Consignado Recebido e Custo Médio por Filial)
        try:
            sql_geral = f"""
                SELECT
                    COD_EMPRESA AS cod_empresa,
                    COD_FILIAL AS cod_filial,
                    COD_ITEM AS cod_item,
                    ISNULL(SALDO_VENDAVEL, 0) - ISNULL(SALDO_RESERVADO_VENDA, 0) AS saldo_disp,
                    ISNULL(SALDO_ESTOQUE, 0) AS saldo_fisico,
                    ISNULL(SALDO_CONSIGNADO_ENVIADO, 0) AS consig_enviado,
                    ISNULL(SALDO_CONSIGNADO_RECEBIDO, 0) AS consig_recebido,
                    CASE
                        WHEN ISNULL(CUSTO_MEDIO_ESTOQUE, 0) > 0 THEN CUSTO_MEDIO_ESTOQUE
                        ELSE ISNULL(CUSTO_MEDIO_ESTOQUE_REAL, 0)
                    END AS custo_medio
                FROM TABELA_SALDO_ITENS_GERAL WITH (NOLOCK)
                WHERE COD_ITEM IN ({cods_in})
                  AND ({pair_conds})
            """
            g_rows = sql_client.query(sql_geral, max_rows=len(chunk) * max(2, len(branch_by_pair) + 1))
            for gr in (g_rows or []):
                c_int = int(gr["cod_item"])
                pair = (int(gr["cod_empresa"]), int(gr["cod_filial"]))
                if c_int in result and pair in branch_by_pair:
                    for b in branch_by_pair[pair]:
                        b_entry = result[c_int]["by_branch"][int(b["id"])]
                        b_entry["stock_available"] = int(float(gr.get("saldo_disp") or 0))
                        b_entry["stock_physical"] = int(float(gr.get("saldo_fisico") or 0))
                        b_entry["consigned_sent"] = int(float(gr.get("consig_enviado") or 0))
                        b_entry["consigned_received"] = int(float(gr.get("consig_recebido") or 0))
                        b_entry["cost_price"] = round(float(gr.get("custo_medio") or 0.0), 2)
        except Exception as e:
            log.warning(f"[HorusAnaliseItens] Aviso em TABELA_SALDO_ITENS_GERAL: {e}")

        # 2. TABELA_SALDO_ITENS por COD_LOCAL (se alguma filial tiver COD_LOCAL parametrizado em /logistics/branches)
        branches_with_local = [b for b in target_branches if b.get("locais")]
        if branches_with_local:
            try:
                local_conds = " OR ".join(
                    f"(COD_EMPRESA = {int(b['cod_empresa'])} AND COD_FILIAL = {int(b['cod_filial'])} AND COD_LOCAL IN ({', '.join(str(x) for x in b['locais'])}))"
                    for b in branches_with_local
                )
                sql_local = f"""
                    SELECT
                        COD_EMPRESA AS cod_empresa,
                        COD_FILIAL AS cod_filial,
                        COD_LOCAL AS cod_local,
                        COD_ITEM AS cod_item,
                        SUM(ISNULL(SALDO_TOTAL, 0)) AS saldo_local
                    FROM TABELA_SALDO_ITENS WITH (NOLOCK)
                    WHERE COD_ITEM IN ({cods_in})
                      AND ({local_conds})
                    GROUP BY COD_EMPRESA, COD_FILIAL, COD_LOCAL, COD_ITEM
                """
                l_rows = sql_client.query(sql_local, max_rows=len(chunk) * max(4, len(branches_with_local) * 2))
                local_sums: Dict[Tuple[int, int], int] = {}
                for lr in (l_rows or []):
                    c_int = int(lr["cod_item"])
                    emp = int(lr["cod_empresa"])
                    fil = int(lr["cod_filial"])
                    loc = int(lr["cod_local"])
                    s_loc = int(float(lr.get("saldo_local") or 0))
                    for b in branches_with_local:
                        if int(b["cod_empresa"]) == emp and int(b["cod_filial"]) == fil and loc in (b.get("locais") or []):
                            key_bl = (c_int, int(b["id"]))
                            local_sums[key_bl] = local_sums.get(key_bl, 0) + s_loc
                for (c_int, bid), s_tot in local_sums.items():
                    if c_int in result and bid in result[c_int]["by_branch"]:
                        result[c_int]["by_branch"][bid]["stock_available"] = s_tot
            except Exception as e:
                log.warning(f"[HorusAnaliseItens] Aviso em TABELA_SALDO_ITENS por local: {e}")

        # 3. Vendas por Filial (365 dias + Período filtrado) em NF_ITENS + NF_MESTRE
        try:
            sql_sales = f"""
                SELECT
                    NFI.COD_EMPRESA AS cod_empresa,
                    NFI.COD_FILIAL AS cod_filial,
                    NFI.COD_ITEM AS cod_item,
                    SUM(CASE WHEN NF.DAT_EMISSAO_NF >= DATEADD(day, -365, GETDATE()) THEN ISNULL(NFI.QTD_ITENS, 0) ELSE 0 END) AS vds_365,
                    SUM(CASE WHEN {custom_date_clause} THEN ISNULL(NFI.QTD_ITENS, 0) ELSE 0 END) AS vds_periodo
                FROM NF_ITENS NFI WITH (NOLOCK)
                INNER JOIN NF_MESTRE NF WITH (NOLOCK)
                    ON NF.COD_NF = NFI.COD_NF
                    AND NF.COD_FILIAL = NFI.COD_FILIAL
                    AND NF.COD_EMPRESA = NFI.COD_EMPRESA
                WHERE NFI.COD_ITEM IN ({cods_in})
                  AND ({nfi_pair_conds})
                  AND NF.DAT_EMISSAO_NF >= DATEADD(day, -740, GETDATE())
                  AND ISNULL(NF.SIT_NF, '') NOT IN ('C', 'CAN')
                  AND NFI.COD_NATUREZA IN ({SARGABLE_CFOP_VENDAS})
                GROUP BY NFI.COD_EMPRESA, NFI.COD_FILIAL, NFI.COD_ITEM
            """
            s_rows = sql_client.query(sql_sales, max_rows=len(chunk) * max(2, len(branch_by_pair) + 1))
            for sr in (s_rows or []):
                c_int = int(sr["cod_item"])
                pair = (int(sr["cod_empresa"]), int(sr["cod_filial"]))
                if c_int in result and pair in branch_by_pair:
                    v365 = max(0, int(float(sr.get("vds_365") or 0)))
                    vper = max(0, int(float(sr.get("vds_periodo") or 0)))
                    for b in branch_by_pair[pair]:
                        b_entry = result[c_int]["by_branch"][int(b["id"])]
                        b_entry["sales_365"] = v365
                        b_entry["sales_period"] = vper
        except Exception as e:
            log.warning(f"[HorusAnaliseItens] Aviso ao consultar vendas por filial: {e}")

        # 4A. Última Entrada de COMPRA ou RECEBIMENTO EM CONSIGNAÇÃO (sem Ajuste) via NF_ENTRADA + ITENS_NOTAS_FISCAIS
        try:
            sql_last_nf_ent = f"""
                WITH RankedEntries AS (
                    SELECT
                        INF.COD_EMPRESA AS cod_empresa,
                        INF.COD_FILIAL AS cod_filial,
                        INF.COD_ITEM AS cod_item,
                        ISNULL(NE.DAT_RECEPCAO_NF, NE.DAT_EMISSAO_NF) AS dat_entrada,
                        ISNULL(INF.QTD_ITENS, 0) AS qtd_entrada,
                        CASE
                            WHEN ISNULL(INF.VLR_CUSTO_CALCULADO, 0) > 0 THEN INF.VLR_CUSTO_CALCULADO
                            WHEN ISNULL(INF.QTD_ITENS, 0) > 0 AND ISNULL(INF.VLR_LIQUIDO_ITEM, 0) > 0 THEN (INF.VLR_LIQUIDO_ITEM / INF.QTD_ITENS)
                            ELSE ISNULL(INF.VLR_BRUTO_ITEM, 0)
                        END AS custo_entrada,
                        RTRIM(LTRIM(ISNULL(INF.COD_NATUREZA, NE.COD_NATUREZA))) AS cfop_raw,
                        RTRIM(LTRIM(ISNULL(NE.NRO_NOTA_FISCAL, CAST(NE.COD_NF_ENTRADA AS VARCHAR)))) AS nro_nf,
                        ROW_NUMBER() OVER (
                            PARTITION BY INF.COD_EMPRESA, INF.COD_FILIAL, INF.COD_ITEM
                            ORDER BY ISNULL(NE.DAT_RECEPCAO_NF, NE.DAT_EMISSAO_NF) DESC, NE.COD_NF_ENTRADA DESC
                        ) AS rn
                    FROM ITENS_NOTAS_FISCAIS INF WITH (NOLOCK)
                    INNER JOIN NF_ENTRADA NE WITH (NOLOCK)
                        ON NE.COD_NF_ENTRADA = INF.COD_NF_ENTRADA
                        AND NE.COD_FILIAL = INF.COD_FILIAL
                        AND NE.COD_EMPRESA = INF.COD_EMPRESA
                    WHERE INF.COD_ITEM IN ({cods_in})
                      AND ({inf_pair_conds})
                      AND ISNULL(NE.SIT_NF, '') NOT IN ('C', 'CAN')
                      AND INF.COD_NATUREZA IN ({SARGABLE_CFOP_ENTRADA_COMPRA_CONSIG})
                )
                SELECT
                    cod_empresa, cod_filial, cod_item, dat_entrada, qtd_entrada, custo_entrada, cfop_raw, nro_nf
                FROM RankedEntries
                WHERE rn = 1
            """
            ent_rows = sql_client.query(sql_last_nf_ent, max_rows=len(chunk) * max(2, len(branch_by_pair) + 1))
            for er in (ent_rows or []):
                c_int = int(er["cod_item"])
                pair = (int(er["cod_empresa"]), int(er["cod_filial"]))
                if c_int in result and pair in branch_by_pair:
                    dt_val = er.get("dat_entrada")
                    dt_iso = dt_val.strftime("%Y-%m-%d") if isinstance(dt_val, datetime) else (str(dt_val)[:10] if dt_val else None)
                    cfop_raw = str(er.get("cfop_raw") or "").strip()
                    cfop_clean = re.sub(r"\D", "", cfop_raw)
                    entry_type = "CONSIG. RECEBIDA" if cfop_clean in CLEAN_CONSIG_CFOPS_SET else "COMPRA"
                    custo_ent = round(float(er.get("custo_entrada") or 0.0), 2)
                    qtd_ent = int(float(er.get("qtd_entrada") or 0))
                    nf_str = str(er.get("nro_nf") or "").strip()
                    for b in branch_by_pair[pair]:
                        b_entry = result[c_int]["by_branch"][int(b["id"])]
                        b_entry["last_entry_date"] = dt_iso
                        b_entry["last_entry_qty"] = qtd_ent
                        b_entry["last_entry_cost"] = custo_ent
                        b_entry["last_entry_type"] = entry_type
                        b_entry["last_entry_cfop"] = cfop_clean or cfop_raw
                        b_entry["last_entry_nf"] = nf_str
                        if b_entry["cost_price"] <= 0 and custo_ent > 0:
                            b_entry["cost_price"] = custo_ent
        except Exception as e:
            log.warning(f"[HorusAnaliseItens] Aviso ao consultar NF_ENTRADA (Última Entrada): {e}")

        # 4B. Conciliação complementar com TABELA_MOVIMENTACAO + TPO_MOVIMENTACAO (Entradas de Compra ou Consignação, sem Ajustes!)
        try:
            sql_last_mov = f"""
                WITH RankedMov AS (
                    SELECT
                        TM.COD_EMPRESA_DEST AS cod_empresa,
                        TM.COD_FILIAL_DEST AS cod_filial,
                        TM.COD_ITEM AS cod_item,
                        TM.DAT_MOVTO AS dat_movto,
                        ISNULL(TM.QTD_MOVTO, 0) AS qtd_movto,
                        RTRIM(LTRIM(ISNULL(TPO.NOM_MOVTO, ''))) AS nom_movto,
                        ROW_NUMBER() OVER (
                            PARTITION BY TM.COD_EMPRESA_DEST, TM.COD_FILIAL_DEST, TM.COD_ITEM
                            ORDER BY TM.DAT_MOVTO DESC
                        ) AS rn
                    FROM TABELA_MOVIMENTACAO TM WITH (NOLOCK)
                    INNER JOIN TPO_MOVIMENTACAO TPO WITH (NOLOCK)
                        ON TPO.COD_MOVTO = TM.COD_MOVTO
                    WHERE TM.COD_ITEM IN ({cods_in})
                      AND ({tm_pair_conds})
                      AND TM.STA_MOVTO = 'E'
                      AND (
                          UPPER(TPO.NOM_MOVTO) LIKE '%COMPRA%'
                          OR UPPER(TPO.NOM_MOVTO) LIKE '%CONSIG%'
                      )
                      AND UPPER(TPO.NOM_MOVTO) NOT LIKE '%AJUSTE%'
                      AND UPPER(TPO.NOM_MOVTO) NOT LIKE '%IMPLANT%'
                      AND UPPER(TPO.NOM_MOVTO) NOT LIKE '%DEVOL%'
                      AND UPPER(TPO.NOM_MOVTO) NOT LIKE '%RETORNO%'
                      AND UPPER(TPO.NOM_MOVTO) NOT LIKE '%CANCEL%'
                      AND UPPER(TPO.NOM_MOVTO) NOT LIKE '%SIMB%'
                )
                SELECT cod_empresa, cod_filial, cod_item, dat_movto, qtd_movto, nom_movto
                FROM RankedMov
                WHERE rn = 1
            """
            mov_rows = sql_client.query(sql_last_mov, max_rows=len(chunk) * max(2, len(branch_by_pair) + 1))
            for mr in (mov_rows or []):
                c_int = int(mr["cod_item"])
                pair = (int(mr["cod_empresa"]), int(mr["cod_filial"]))
                if c_int in result and pair in branch_by_pair:
                    dt_val = mr.get("dat_movto")
                    dt_iso = dt_val.strftime("%Y-%m-%d") if isinstance(dt_val, datetime) else (str(dt_val)[:10] if dt_val else None)
                    if not dt_iso:
                        continue
                    nom_up = str(mr.get("nom_movto") or "").upper()
                    mov_type = "CONSIG. RECEBIDA" if "CONSIG" in nom_up else "COMPRA"
                    qtd_m = int(float(mr.get("qtd_movto") or 0))
                    for b in branch_by_pair[pair]:
                        b_entry = result[c_int]["by_branch"][int(b["id"])]
                        cur_dt = b_entry.get("last_entry_date")
                        # Se NF_ENTRADA não tinha data ou se TABELA_MOVIMENTACAO tem uma entrada válida mais recente
                        if not cur_dt or dt_iso > cur_dt:
                            b_entry["last_entry_date"] = dt_iso
                            b_entry["last_entry_qty"] = qtd_m
                            b_entry["last_entry_type"] = mov_type
                            if not b_entry.get("last_entry_cfop"):
                                b_entry["last_entry_cfop"] = "1917/2917" if mov_type == "CONSIG. RECEBIDA" else "1102/2102"
        except Exception as e:
            log.warning(f"[HorusAnaliseItens] Aviso ao consultar TABELA_MOVIMENTACAO: {e}")

    # Consolida métricas somadas das filiais selecionadas para cada COD_ITEM
    for c_int, data_c in result.items():
        b_list = list(data_c["by_branch"].values())
        tot_stock = sum(x["stock_available"] for x in b_list)
        tot_consig_sent = sum(x["consigned_sent"] for x in b_list)
        tot_consig_rec = sum(x["consigned_received"] for x in b_list)
        tot_s365 = sum(x["sales_365"] for x in b_list)
        tot_sper = sum(x["sales_period"] for x in b_list)

        costs = [x["cost_price"] for x in b_list if x["cost_price"] > 0]
        avg_cost = round(sum(costs) / len(costs), 2) if costs else 0.0

        latest_b = None
        for x in b_list:
            if x.get("last_entry_date"):
                if not latest_b or x["last_entry_date"] > latest_b["last_entry_date"]:
                    latest_b = x

        data_c["consolidated"] = {
            "stock_available": tot_stock,
            "consigned_sent": tot_consig_sent,
            "consigned_received": tot_consig_rec,
            "cost_price": avg_cost,
            "sales_365": tot_s365,
            "sales_period": tot_sper,
            "last_entry_date": latest_b["last_entry_date"] if latest_b else None,
            "last_entry_qty": latest_b["last_entry_qty"] if latest_b else 0,
            "last_entry_cost": latest_b["last_entry_cost"] if latest_b else 0.0,
            "last_entry_type": latest_b["last_entry_type"] if latest_b else None,
            "last_entry_cfop": latest_b["last_entry_cfop"] if latest_b else None,
            "last_entry_nf": latest_b["last_entry_nf"] if latest_b else None,
            "last_entry_branch": latest_b["branch_name"] if latest_b else None,
        }

    return result


# ── Endpoint de Listagem e Enriquecimento em Lote da Página Atual ─────────────

class EnrichPagePayload(BaseModel):
    company_id: Optional[int] = None
    branch_id: Optional[str] = "ALL"  # "ALL" ou ID de uma SellerBranch
    product_ids: List[int] = []
    sales_days: int = 90
    sales_start_date: Optional[str] = None
    sales_end_date: Optional[str] = None


@router.post("/enrich-page")
def enrich_analise_itens_page(
    payload: EnrichPagePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Enriquece instantaneamente os itens visíveis na página atual (ex: 50 itens)
    consultando o Horus SQL Server para a filial selecionada (ou todas as filiais de /logistics/branches).
    Retorna:
      - Saldo Disponível
      - Consignado Enviado
      - Consignado Recebido
      - Custo Médio / Unitário por Filial
      - Vendas 365d e Vendas no Período Filtrado
      - Última Entrada (Compra ou Consignação Recebida, excluindo ajustes) com Data, Tipo, CFOP, Qtd e Custo
      - Breakdown detalhado por filial para cada produto
    """
    seller_id = _resolve_seller_id(current_user, payload.company_id)
    if not payload.product_ids:
        return {"metrics": {}, "branches": []}

    all_branches = _load_configured_branches(db, seller_id)
    if payload.branch_id and str(payload.branch_id).upper() != "ALL":
        target_branches = [b for b in all_branches if str(b["id"]) == str(payload.branch_id)]
        if not target_branches:
            target_branches = all_branches
    else:
        target_branches = all_branches

    prods = (
        db.query(Product)
        .filter(Product.company_id == seller_id, Product.id.in_(payload.product_ids[:250]))
        .all()
    )
    if not prods:
        return {"metrics": {}, "branches": target_branches}

    sql_client = None
    try:
        sql_client = HorusSQLClient(db, seller_id)
    except Exception:
        sql_client = None

    # Resolve horus_cod_item para produtos que só tinham ISBN/SKU
    cod_to_prods: Dict[int, List[Product]] = {}
    missing_cod_prods: List[Product] = []
    for p in prods:
        if p.horus_cod_item and int(p.horus_cod_item) > 0:
            cod_to_prods.setdefault(int(p.horus_cod_item), []).append(p)
        elif p.sku and str(p.sku).replace("H-", "").isdigit():
            c_val = int(str(p.sku).replace("H-", ""))
            cod_to_prods.setdefault(c_val, []).append(p)
        else:
            missing_cod_prods.append(p)

    if sql_client and missing_cod_prods:
        eans = [str(p.ean_gtin).strip() for p in missing_cod_prods if p.ean_gtin]
        if eans:
            try:
                ph = ", ".join(["%s"] * len(eans))
                rows_map = sql_client.query(
                    f"""
                    SELECT COD_ITEM AS cod_item, RTRIM(LTRIM(ISNULL(COD_BARRA_ITEM, ''))) AS barra, RTRIM(LTRIM(ISNULL(COD_ISBN_ITEM, ''))) AS isbn
                    FROM ITENS_ESTOQUE_GERAL WITH (NOLOCK)
                    WHERE COD_BARRA_ITEM IN ({ph}) OR COD_ISBN_ITEM IN ({ph})
                    """,
                    tuple(eans + eans),
                    max_rows=len(eans) * 2,
                )
                isbn_to_cod: Dict[str, int] = {}
                for rm in (rows_map or []):
                    c_i = int(rm["cod_item"])
                    for k_s in (rm.get("barra"), rm.get("isbn")):
                        if k_s:
                            isbn_to_cod[str(k_s).strip()] = c_i
                for p in missing_cod_prods:
                    c_found = isbn_to_cod.get(str(p.ean_gtin or "").strip())
                    if c_found:
                        p.horus_cod_item = c_found
                        cod_to_prods.setdefault(c_found, []).append(p)
            except Exception:
                pass

    metrics_out: Dict[str, Any] = {}
    if sql_client and cod_to_prods:
        enriched_by_cod = _enrich_cod_items_multibranch(
            sql_client=sql_client,
            cod_items=list(cod_to_prods.keys()),
            target_branches=target_branches,
            sales_days=payload.sales_days,
            sales_start_date=payload.sales_start_date,
            sales_end_date=payload.sales_end_date,
        )
        for c_int, p_list in cod_to_prods.items():
            e_data = enriched_by_cod.get(c_int)
            if not e_data:
                continue
            cons = e_data["consolidated"]
            by_b_list = list(e_data["by_branch"].values())
            for p_obj in p_list:
                metrics_out[str(p_obj.id)] = {
                    "horus_cod_item": c_int,
                    "stock_quantity": cons["stock_available"],
                    "consignment_stock": cons["consigned_sent"],
                    "consigned_received": cons["consigned_received"],
                    "cost_price": cons["cost_price"] if cons["cost_price"] > 0 else float(p_obj.cost_price or 0.0),
                    "sales_365": cons["sales_365"],
                    "sales_period": cons["sales_period"],
                    "last_entry_date": cons["last_entry_date"],
                    "last_entry_qty": cons["last_entry_qty"],
                    "last_entry_cost": cons["last_entry_cost"],
                    "last_entry_type": cons["last_entry_type"],
                    "last_entry_cfop": cons["last_entry_cfop"],
                    "last_entry_nf": cons["last_entry_nf"],
                    "last_entry_branch": cons["last_entry_branch"],
                    "branches_breakdown": by_b_list,
                }

    return {
        "metrics": metrics_out,
        "branches": target_branches,
    }


# ── Exportação Segura de Relatório Excel Multi-Filial (Análise & Reposição) ──

@router.get("/export-excel")
def export_analise_itens_excel(
    company_id: Optional[int] = Query(None),
    branch_id: str = Query("ALL", description="ALL para todas as filiais configuradas ou ID da SellerBranch"),
    model: str = Query("MULTIBRANCH_REPLENISHMENT", description="MULTIBRANCH_REPLENISHMENT (1 linha por item/filial) ou CONSOLIDATED"),
    search: Optional[str] = Query(None),
    publisher: Optional[str] = Query(None),
    situation: Optional[str] = Query("ALL"),
    hide_ebooks: bool = Query(True),
    hide_out_of_stock: bool = Query(False),
    sales_days: int = Query(90, ge=1, le=730),
    sales_start_date: Optional[str] = Query(None),
    sales_end_date: Optional[str] = Query(None),
    max_items: int = Query(5000, ge=1, le=15000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Exporta o Relatório Excel de Análise de Itens e Reposição por Filial:
    - Modelo Padrão (MULTIBRANCH_REPLENISHMENT): Repete 1 linha por Filial configurada para cada item,
      exibindo Empresa, Filial, Local, Cód Horus, ISBN, Título, Editora, Preço Capa, Custo Médio Filial,
      Saldo Disponível Filial, Consignado Enviado, Consignado Recebido, Vendas 365d, Vendas no Período,
      Sugestão de Reposição (Vendas Período - Saldo Disponível) e Dados Confiáveis da Última Entrada
      (Compra ou Consignação Recebida, excluindo ajustes: Data, Tipo, CFOP, Qtd, Custo Últ. Entrada e NF).
    - Modelo Consolidado (CONSOLIDATED): 1 linha consolidada por item somando as filiais filtradas.
    """
    seller_id = _resolve_seller_id(current_user, company_id)
    all_branches = _load_configured_branches(db, seller_id)
    if branch_id and str(branch_id).upper() != "ALL":
        target_branches = [b for b in all_branches if str(b["id"]) == str(branch_id)]
        if not target_branches:
            target_branches = all_branches
    else:
        target_branches = all_branches

    q = db.query(Product).filter(Product.company_id == seller_id)
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                Product.name.ilike(term),
                Product.ean_gtin.ilike(term),
                Product.sku.ilike(term),
                Product.additional_isbns.ilike(term),
                cast(Product.horus_cod_item, String).ilike(term),
            )
        )
    if publisher and publisher.strip():
        q = q.filter(Product.brand.ilike(f"%{publisher.strip()}%"))
    if hide_ebooks:
        q = q.filter(or_(Product.is_ebook == False, Product.is_ebook.is_(None)))
    if hide_out_of_stock:
        q = q.filter(Product.stock_quantity > 0, or_(Product.is_out_of_print == False, Product.is_out_of_print.is_(None)))

    products = q.order_by(Product.horus_cod_item.desc().nullslast(), Product.id.desc()).limit(max_items).all()

    sql_client = None
    try:
        sql_client = HorusSQLClient(db, seller_id)
    except Exception:
        sql_client = None

    cod_items = [int(p.horus_cod_item) for p in products if p.horus_cod_item and int(p.horus_cod_item) > 0]
    enriched_map: Dict[int, Dict[str, Any]] = {}
    if sql_client and cod_items:
        enriched_map = _enrich_cod_items_multibranch(
            sql_client=sql_client,
            cod_items=cod_items,
            target_branches=target_branches,
            sales_days=sales_days,
            sales_start_date=sales_start_date,
            sales_end_date=sales_end_date,
        )

    period_label = (
        f"{sales_start_date} a {sales_end_date or 'Hoje'}"
        if sales_start_date
        else f"{sales_days}d"
    )

    wb = openpyxl.Workbook()
    ws = wb.active
    is_multibranch = str(model or "").upper() != "CONSOLIDATED"
    ws.title = "Analise_Estoque_Filiais" if is_multibranch else "Analise_Consolidada"

    headers = [
        "Cód. Empresa",
        "Cód. Filial",
        "Local Estoque",
        "Filial / Loja",
        "Cód. Horus",
        "ISBN Principal",
        "2º ISBN (E-book)",
        "Título da Obra",
        "Editora / Selo",
        "Assunto / Gênero",
        "Situação do Item",
        "Preço Capa (R$)",
        "Custo Médio Filial (R$)",
        "Custo Últ. Entrada (R$)",
        "Saldo Disponível",
        "Consig. Enviado",
        "Consig. Recebido",
        "Vendas 365d",
        f"Vendas ({period_label})",
        "Sugestão Reposição",
        "Data Últ. Entrada",
        "Tipo Últ. Entrada",
        "CFOP Últ. Entrada",
        "Qtd Últ. Entrada",
        "NF Últ. Entrada",
        "Unid / Caixa",
    ]
    ws.append(headers)

    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True, size=10)
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    def _fmt_br_date(iso_str: Optional[str]) -> str:
        if not iso_str:
            return ""
        parts = str(iso_str)[:10].split("-")
        return f"{parts[2]}/{parts[1]}/{parts[0]}" if len(parts) == 3 else str(iso_str)

    for p in products:
        c_int = int(p.horus_cod_item) if (p.horus_cod_item and int(p.horus_cod_item) > 0) else 0
        e_item = enriched_map.get(c_int)
        sit_label = p.horus_situacao_item or ("Esgotado" if p.is_out_of_print else "Em Distribuição")

        if is_multibranch:
            for b in target_branches:
                bid = int(b["id"])
                b_metrics = (
                    e_item["by_branch"].get(bid)
                    if (e_item and bid in e_item["by_branch"])
                    else {
                        "stock_available": int(p.stock_quantity or 0) if len(target_branches) == 1 else 0,
                        "consigned_sent": int(p.consignment_stock or 0) if len(target_branches) == 1 else 0,
                        "consigned_received": 0,
                        "cost_price": float(p.cost_price or 0.0),
                        "sales_365": int(p.sales_365 or 0) if len(target_branches) == 1 else 0,
                        "sales_period": int(p.sales_90 or 0) if len(target_branches) == 1 else 0,
                        "last_entry_date": None,
                        "last_entry_qty": 0,
                        "last_entry_cost": 0.0,
                        "last_entry_type": None,
                        "last_entry_cfop": None,
                        "last_entry_nf": None,
                    }
                )
                saldo_disp = int(b_metrics.get("stock_available") or 0)
                if hide_out_of_stock and saldo_disp <= 0:
                    continue
                vds_per = int(b_metrics.get("sales_period") or 0)
                sug_rep = max(0, vds_per - max(0, saldo_disp))
                loc_str = ", ".join(str(x) for x in (b.get("locais") or [])) or (str(b.get("cod_local") or ""))

                ws.append([
                    int(b["cod_empresa"]),
                    int(b["cod_filial"]),
                    loc_str,
                    b["nome"],
                    c_int or p.sku,
                    p.ean_gtin or "",
                    p.additional_isbns or "",
                    p.name or "",
                    p.brand or "",
                    p.subject or "",
                    sit_label,
                    round(float(p.base_price or 0.0), 2),
                    round(float(b_metrics.get("cost_price") or p.cost_price or 0.0), 2),
                    round(float(b_metrics.get("last_entry_cost") or 0.0), 2),
                    saldo_disp,
                    int(b_metrics.get("consigned_sent") or 0),
                    int(b_metrics.get("consigned_received") or 0),
                    int(b_metrics.get("sales_365") or 0),
                    vds_per,
                    sug_rep,
                    _fmt_br_date(b_metrics.get("last_entry_date")),
                    b_metrics.get("last_entry_type") or "",
                    b_metrics.get("last_entry_cfop") or "",
                    int(b_metrics.get("last_entry_qty") or 0),
                    b_metrics.get("last_entry_nf") or "",
                    int(p.units_per_box or 0),
                ])
        else:
            cons = (
                e_item["consolidated"]
                if e_item
                else {
                    "stock_available": int(p.stock_quantity or 0),
                    "consigned_sent": int(p.consignment_stock or 0),
                    "consigned_received": 0,
                    "cost_price": float(p.cost_price or 0.0),
                    "sales_365": int(p.sales_365 or 0),
                    "sales_period": int(p.sales_90 or 0),
                    "last_entry_date": None,
                    "last_entry_qty": 0,
                    "last_entry_cost": 0.0,
                    "last_entry_type": None,
                    "last_entry_cfop": None,
                    "last_entry_nf": None,
                    "last_entry_branch": "Consolidado",
                }
            )
            saldo_disp = int(cons.get("stock_available") or 0)
            if hide_out_of_stock and saldo_disp <= 0:
                continue
            vds_per = int(cons.get("sales_period") or 0)
            sug_rep = max(0, vds_per - max(0, saldo_disp))

            ws.append([
                "TODAS" if len(target_branches) > 1 else int(target_branches[0]["cod_empresa"]),
                "TODAS" if len(target_branches) > 1 else int(target_branches[0]["cod_filial"]),
                "—",
                "Consolidado (" + ", ".join(b["nome"] for b in target_branches) + ")",
                c_int or p.sku,
                p.ean_gtin or "",
                p.additional_isbns or "",
                p.name or "",
                p.brand or "",
                p.subject or "",
                sit_label,
                round(float(p.base_price or 0.0), 2),
                round(float(cons.get("cost_price") or p.cost_price or 0.0), 2),
                round(float(cons.get("last_entry_cost") or 0.0), 2),
                saldo_disp,
                int(cons.get("consigned_sent") or 0),
                int(cons.get("consigned_received") or 0),
                int(cons.get("sales_365") or 0),
                vds_per,
                sug_rep,
                _fmt_br_date(cons.get("last_entry_date")),
                cons.get("last_entry_type") or "",
                cons.get("last_entry_cfop") or "",
                int(cons.get("last_entry_qty") or 0),
                cons.get("last_entry_nf") or "",
                int(p.units_per_box or 0),
            ])

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)
    today_str = datetime.now().strftime("%Y-%m-%d")
    fname = f"Horus_Analise_Itens_Filiais_{today_str}.xlsx"

    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )

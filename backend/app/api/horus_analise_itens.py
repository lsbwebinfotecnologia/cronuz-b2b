"""
backend/app/api/horus_analise_itens.py
--------------------------------------
Módulo dedicado: Horus Direct -> Análise de Itens (/horus-direct/analise-itens)
Totalmente isolado do DBM exclusivo da EO Editora (Olhares).

Recursos principais:
1. Integração nativa com Filiais do Seller (/logistics/branches - cmp_seller_branch):
   - Permite analisar uma Empresa/Filial/Local específica ou TODAS as filiais configuradas.
2. Contador exato de sincronização (Total Horus SQL vs Sincronizados no Cronuz vs Faltando)
   + Worker de Sincronização em Segundo Plano (Background Sync) em conexão SQL isolada (pool_slot='bg_sync')
   usando keyset pagination (COD_ITEM > last_cod_item), sem bloquear consultas interativas da tela.
3. Coleta de Editoras direto do Horus SQL (/horus-analise-itens/publishers) para filtro multi-seleção,
   com sincronização sob demanda quando o usuário filtra editoras ainda não trazidas pelo worker.
4. Estoque Mínimo por Produto (ISBN) e por Filial Configurada (prd_branch_min_stock):
   - Edição rápida inline por filial
   - Rotina de Importação por Filial Selecionada (Excel/CSV ou colagem mantendo apenas ISBN e Quantidade Estoque Mínimo)
   - Sinalização visual Vermelha (abaixo do estoque mínimo) e Laranja (próximo do estoque mínimo).
5. Enriquecimento Multi-Filial de Alta Performance (TABELA_SALDO_ITENS_GERAL + TABELA_SALDO_ITENS):
   - Saldo Disponível individual por filial/local (nunca repete saldo consolidado nas filiais)
   - Consignado Enviado (SALDO_CONSIGNADO_ENVIADO)
   - Consignado Recebido (SALDO_CONSIGNADO_RECEBIDO)
   - Custo Médio / Unitário por Filial (CUSTO_MEDIO_ESTOQUE / CUSTO_MEDIO_ESTOQUE_REAL)
6. Vendas por Filial com filtro de período (dias ou intervalo de datas) via NF_ITENS + NF_MESTRE.
7. Última Entrada confiável de COMPRA ou RECEBIMENTO EM CONSIGNAÇÃO (excluindo Ajustes!) por Filial.
8. Exportação segura de Relatório Excel Multi-Filial com Estoque Mínimo e Status de Alerta.
"""

import csv
import io
import json
import logging
import math
import os
import re
import threading
import time as _time
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import String, cast, func, or_
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.db.session import SessionLocal, get_db
from app.integrators.horus_sql_client import HorusSQLClient
from app.models.company_settings import CompanySettings
from app.models.product import Product
from app.models.seller_branch import ProductBranchMinStock, SellerBranch
from app.models.user import User

router = APIRouter(prefix="/horus-analise-itens", tags=["horus-analise-itens"])
log = logging.getLogger(__name__)

# Limite rígido de upload de planilhas (10 MB conforme regra mandatória do projeto)
MAX_SHEET_UPLOAD_BYTES = 10 * 1024 * 1024

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


def _normalize_isbn(raw: Any) -> str:
    if raw is None:
        return ""
    s = str(raw).strip()
    if s.endswith(".0"):
        s = s[:-2]
    cleaned = re.sub(r"[^0-9Xx]", "", s).upper()
    return cleaned or s.strip()


def _evaluate_min_stock_status(current_stock: int, min_stock: int) -> str:
    """
    Avalia o status do Estoque Atual vs Estoque Mínimo:
      - 'NONE': sem estoque mínimo configurado (min_stock <= 0)
      - 'BELOW_MIN': Vermelho — estoque atual abaixo do estoque mínimo (current_stock < min_stock)
      - 'NEAR_MIN': Laranja — estoque atual próximo do estoque mínimo
                    (min_stock <= current_stock <= max(min_stock + 2, ceil(min_stock * 1.25)))
      - 'OK': estoque confortável acima da faixa de proximidade
    """
    if min_stock <= 0:
        return "NONE"
    if current_stock < min_stock:
        return "BELOW_MIN"
    near_ceiling = max(min_stock + 2, int(math.ceil(min_stock * 1.25)))
    if current_stock <= near_ceiling:
        return "NEAR_MIN"
    return "OK"


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


def _load_min_stock_map(
    db: Session,
    seller_id: int,
    isbns: Optional[List[str]] = None,
    product_ids: Optional[List[int]] = None,
) -> Tuple[Dict[Tuple[int, str], int], Dict[Tuple[int, int], int]]:
    """
    Retorna dois mapas de Estoque Mínimo por filial:
      1. by_branch_isbn[(branch_id, clean_isbn)] = min_stock
      2. by_branch_prod[(branch_id, product_id)] = min_stock
    """
    q = db.query(ProductBranchMinStock).filter(ProductBranchMinStock.company_id == seller_id)
    if isbns and product_ids:
        clean_isbns = [i for i in isbns if i]
        q = q.filter(
            or_(
                ProductBranchMinStock.isbn.in_(clean_isbns),
                ProductBranchMinStock.product_id.in_(product_ids),
            )
        )
    elif isbns:
        clean_isbns = [i for i in isbns if i]
        if clean_isbns:
            q = q.filter(ProductBranchMinStock.isbn.in_(clean_isbns))
    elif product_ids:
        q = q.filter(ProductBranchMinStock.product_id.in_(product_ids))

    rows = q.all()
    by_branch_isbn: Dict[Tuple[int, str], int] = {}
    by_branch_prod: Dict[Tuple[int, int], int] = {}
    for r in rows:
        ms = max(0, int(r.min_stock or 0))
        if r.isbn:
            by_branch_isbn[(int(r.branch_id), _normalize_isbn(r.isbn))] = ms
            by_branch_isbn[(int(r.branch_id), str(r.isbn).strip())] = ms
        if r.product_id:
            by_branch_prod[(int(r.branch_id), int(r.product_id))] = ms
    return by_branch_isbn, by_branch_prod


def _resolve_product_branch_min_stock(
    branch_id: int,
    product_id: Optional[int],
    isbn: Optional[str],
    by_branch_isbn: Dict[Tuple[int, str], int],
    by_branch_prod: Dict[Tuple[int, int], int],
) -> int:
    if product_id and (branch_id, int(product_id)) in by_branch_prod:
        return by_branch_prod[(branch_id, int(product_id))]
    if isbn:
        norm = _normalize_isbn(isbn)
        if (branch_id, norm) in by_branch_isbn:
            return by_branch_isbn[(branch_id, norm)]
        raw_s = str(isbn).strip()
        if (branch_id, raw_s) in by_branch_isbn:
            return by_branch_isbn[(branch_id, raw_s)]
    return 0


# ── Caches de Total Horus SQL, Editoras Horus SQL & Background Sync Worker ────
_HORUS_COUNT_CACHE: Dict[int, Dict[str, Any]] = {}
_HORUS_PUBLISHERS_CACHE: Dict[int, Dict[str, Any]] = {}
_BG_SYNC_LOCK = threading.Lock()
_BG_SYNC_STATES: Dict[int, Dict[str, Any]] = {}


def _bg_state_file_path(seller_id: int) -> str:
    return f"/tmp/cronuz_horus_bg_sync_{int(seller_id)}.json"


def _load_shared_bg_state(seller_id: int) -> Dict[str, Any]:
    """
    Lê o estado compartilhado entre todos os workers do Gunicorn em /tmp.
    Se o worker estiver marcado como is_running mas sem heartbeat há mais de 90s,
    destrava automaticamente para permitir retomada imediata.
    """
    path = _bg_state_file_path(seller_id)
    state: Dict[str, Any] = {}
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as fp:
                state = json.load(fp) or {}
        except Exception:
            state = {}
    if not state:
        state = dict(_BG_SYNC_STATES.get(seller_id) or {})

    if state.get("is_running"):
        hb = float(state.get("heartbeat_ts") or 0)
        if hb > 0 and (_time.time() - hb > 90):
            state["is_running"] = False
            state["status_message"] = "Worker anterior interrompido. Pronto para retomar do último item sincronizado."
    return state


def _save_shared_bg_state(seller_id: int, state: Dict[str, Any]) -> None:
    """
    Salva atomicamente o estado do worker em /tmp para que todos os 4 workers do Gunicorn
    enxerguem o progresso real e solicitações de pausa em tempo real.
    """
    state["heartbeat_ts"] = _time.time()
    _BG_SYNC_STATES[seller_id] = dict(state)
    path = _bg_state_file_path(seller_id)
    tmp_path = f"{path}.{os.getpid()}.{threading.get_ident()}.tmp"
    try:
        with open(tmp_path, "w", encoding="utf-8") as fp:
            json.dump(state, fp, ensure_ascii=False)
        os.replace(tmp_path, path)
    except Exception:
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass


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
    para a base local do Cronuz (prd_product) em lotes seguros de 400 itens usando:
      1. CAST(... AS NVARCHAR(...)) no SQL Server para evitar erros de cp1252/charmap (byte 0x81, 0x8d, etc.)
      2. Retomada inteligente a partir do MAX(horus_cod_item) já sincronizado no Cronuz (para inserir novos
         itens imediatamente no 1º lote, fazendo uma 2ª passada para eventuais lacunas anteriores).
      3. Estado compartilhado em /tmp entre todos os workers do Gunicorn.
    """
    db = SessionLocal()
    try:
        sql_client = HorusSQLClient(db, seller_id, pool_slot="bg_sync")
        branches = _load_configured_branches(db, seller_id)
        settings = db.query(CompanySettings).filter(CompanySettings.company_id == seller_id).first()
        legacy_pagination = getattr(settings, "horus_legacy_pagination", False) if settings else False
        cover_primary = (settings.cover_image_base_url or "").strip().rstrip("/") if settings else ""
        cover_secondary = (settings.cover_image_secondary_base_url or "").strip().rstrip("/") if settings else ""

        horus_total = _get_horus_total_count(sql_client, seller_id, force=True)
        launch_col = _detect_launch_col(sql_client)

        existing_rows = (
            db.query(Product.id, Product.horus_cod_item, Product.ean_gtin, Product.sku)
            .filter(Product.company_id == seller_id)
            .all()
        )
        by_cod_item: Dict[int, int] = {}
        by_isbn: Dict[str, int] = {}
        max_existing_cod = 0
        for pid, h_cod, ean, sku in existing_rows:
            if h_cod is not None:
                c_val = int(h_cod)
                by_cod_item[c_val] = int(pid)
                if c_val > max_existing_cod:
                    max_existing_cod = c_val
            for raw_k in (ean, sku):
                if raw_k and str(raw_k).strip():
                    by_isbn[str(raw_k).strip()] = int(pid)

        branch_pairs = list({(b["cod_empresa"], b["cod_filial"]) for b in branches})
        if branch_pairs:
            pair_conds = " OR ".join(
                f"(cod_empresa = {int(emp)} AND cod_filial = {int(fil)})"
                for emp, fil in branch_pairs
            )
        else:
            pair_conds = "1=1"

        # Se já existem itens sincronizados e ainda faltam itens novos acima do max_existing_cod,
        # começa direto de max_existing_cod para inserir novos itens imediatamente no 1º lote!
        # Depois que chegar ao final do Horus SQL, se ainda faltarem lacunas anteriores, faz uma 2ª passada de 0 até max_existing_cod.
        started_from_resume = max_existing_cod > 0 and len(by_cod_item) < horus_total
        last_cod_item = max_existing_cod if started_from_resume else 0
        upper_bound_cod: Optional[int] = None
        batch_size = 400

        with _BG_SYNC_LOCK:
            st = _load_shared_bg_state(seller_id)
            st["is_running"] = True
            st["horus_total"] = horus_total
            st["synced_total"] = len(by_cod_item)
            st["missing_total"] = max(0, horus_total - len(by_cod_item))
            st["last_cod_item"] = last_cod_item
            st["status_message"] = (
                f"Retomando sincronização a partir do Cód. Horus #{last_cod_item}..."
                if started_from_resume
                else "Sincronizando lotes do Horus SQL em segundo plano..."
            )
            _save_shared_bg_state(seller_id, st)

        while True:
            st_check = _load_shared_bg_state(seller_id)
            if not st_check.get("is_running") or st_check.get("stop_requested"):
                st_check["is_running"] = False
                st_check["status_message"] = "Sincronização pausada pelo usuário."
                st_check["finished_at"] = datetime.utcnow().isoformat()
                _save_shared_bg_state(seller_id, st_check)
                break

            top_clause = f"TOP ({batch_size})" if legacy_pagination else ""
            offset_clause = "" if legacy_pagination else f"OFFSET 0 ROWS FETCH NEXT {batch_size} ROWS ONLY"
            stock_having = "AND ISNULL(S.saldo_disponivel, 0) > 0" if only_with_stock else ""
            upper_clause = f"AND I.COD_ITEM <= {int(upper_bound_cod)}" if upper_bound_cod is not None else ""

            # IMPORTANTE: CAST(... AS NVARCHAR(...)) força o SQL Server a converter strings em UTF-16LE no servidor,
            # evitando UnicodeDecodeError ('charmap' codec can't decode byte 0x81) no driver pytds!
            sql_batch = f"""
                SELECT {top_clause}
                    I.COD_ITEM AS cod_item,
                    CAST(RTRIM(LTRIM(ISNULL(I.COD_BARRA_ITEM, ISNULL(I.COD_ISBN_ITEM, '')))) AS NVARCHAR(100)) AS isbn,
                    CAST(RTRIM(LTRIM(ISNULL(I.NOM_ITEM, ''))) AS NVARCHAR(400)) AS nome_item,
                    CAST(RTRIM(LTRIM(ISNULL(ED.NOM_FANTASIA, ISNULL(ED.NOM_EDITORA, '')))) AS NVARCHAR(250)) AS editora,
                    CAST(RTRIM(LTRIM(ISNULL(G.NOM_GENERO, ''))) AS NVARCHAR(250)) AS assunto,
                    ISNULL(PA.VLR_CAPA, ISNULL(I.VLR_CAPA, 0.0)) AS preco,
                    ISNULL(S.saldo_disponivel, 0) AS estoque,
                    ISNULL(S.consig_enviado, 0) AS consig_enviado,
                    ISNULL(S.custo_medio, 0.0) AS custo_medio,
                    ISNULL(I.QTD_ITENS_CAIXA, 0) AS qtd_caixa,
                    CAST(RTRIM(LTRIM(ISNULL(I.SITUACAO_ITEM, ''))) AS NVARCHAR(60)) AS situacao_item,
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
                  {upper_clause}
                  {stock_having}
                ORDER BY I.COD_ITEM ASC
                {offset_clause}
            """
            try:
                rows = sql_client.query(sql_batch, (last_cod_item,), max_rows=batch_size + 5)
            except Exception as batch_err:
                log.warning(
                    f"[HorusAnaliseItens] Erro no lote após COD_ITEM={last_cod_item} (company={seller_id}): {batch_err}. Pulando +1 item..."
                )
                last_cod_item += 1
                continue

            if not rows:
                # Se terminou a 1ª passada a partir do max_existing_cod e ainda há lacunas anteriores, faz a 2ª passada de 0 até max_existing_cod
                if started_from_resume and upper_bound_cod is None and len(by_cod_item) < horus_total:
                    started_from_resume = False
                    upper_bound_cod = max_existing_cod
                    last_cod_item = 0
                    continue

                with _BG_SYNC_LOCK:
                    st = _load_shared_bg_state(seller_id)
                    st["is_running"] = False
                    st["missing_total"] = max(0, horus_total - len(by_cod_item))
                    st["status_message"] = "Sincronização em segundo plano concluída com sucesso!"
                    st["finished_at"] = datetime.utcnow().isoformat()
                    _save_shared_bg_state(seller_id, st)
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

            seen_skus_in_batch: set[str] = set()
            for r in rows:
                cod_item = int(r["cod_item"])
                if cod_item > last_cod_item:
                    last_cod_item = cod_item

                isbn = str(r.get("isbn") or "").strip()
                sku_val = isbn if (isbn and isbn not in by_isbn and isbn not in seen_skus_in_batch) else f"H-{cod_item}"
                seen_skus_in_batch.add(sku_val)
                nome = str(r.get("nome_item") or f"Item #{cod_item}").strip() or f"Item #{cod_item}"
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
                    p_obj.name = nome[:255]
                    p_obj.horus_cod_item = cod_item
                    if isbn and not p_obj.ean_gtin:
                        p_obj.ean_gtin = isbn[:50]
                    if editora:
                        p_obj.brand = editora[:150]
                    if assunto and not p_obj.subject:
                        p_obj.subject = assunto[:150]
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

            try:
                if new_objects:
                    db.add_all(new_objects)
                db.commit()
            except Exception as commit_err:
                db.rollback()
                log.warning(f"[HorusAnaliseItens] Fallback individual no lote COD_ITEM={last_cod_item}: {commit_err}")
                created_batch = 0
                for np_single in new_objects:
                    try:
                        np_single.sku = f"H-{np_single.horus_cod_item}"
                        db.add(np_single)
                        db.commit()
                        created_batch += 1
                    except Exception:
                        db.rollback()

            for np_obj in new_objects:
                if getattr(np_obj, "id", None) and np_obj.horus_cod_item:
                    by_cod_item[int(np_obj.horus_cod_item)] = np_obj.id
                if getattr(np_obj, "id", None) and np_obj.ean_gtin:
                    by_isbn[str(np_obj.ean_gtin)] = np_obj.id
                if getattr(np_obj, "id", None) and np_obj.sku:
                    by_isbn[str(np_obj.sku)] = np_obj.id

            with _BG_SYNC_LOCK:
                st = _load_shared_bg_state(seller_id)
                st["is_running"] = True
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
                _save_shared_bg_state(seller_id, st)

            _time.sleep(0.06)

    except Exception as exc:
        log.error(f"[HorusAnaliseItens] Erro no worker de background sync (company={seller_id}): {exc}")
        with _BG_SYNC_LOCK:
            st = _load_shared_bg_state(seller_id)
            st["is_running"] = False
            st["last_error"] = str(exc)
            st["status_message"] = f"Erro na sincronização: {str(exc)[:180]}"
            st["finished_at"] = datetime.utcnow().isoformat()
            _save_shared_bg_state(seller_id, st)
    finally:
        db.close()


# ── Endpoints de Filiais, Editoras do Horus e Status de Sincronização ─────────

@router.get("/branches")
def get_analise_itens_branches(
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    seller_id = _resolve_seller_id(current_user, company_id)
    branches = _load_configured_branches(db, seller_id)
    return {
        "company_id": seller_id,
        "branches": branches,
    }


@router.get("/publishers")
def get_analise_itens_publishers(
    company_id: Optional[int] = Query(None),
    force_refresh: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Coleta todas as Editoras diretamente do Horus SQL Server (tabela EDITORA + ITENS_ESTOQUE_GERAL)
    combinadas com as editoras já sincronizadas no Cronuz, permitindo ao usuário marcar/selecionar
    uma ou várias editoras para filtrar a tela de Análise de Itens.
    """
    seller_id = _resolve_seller_id(current_user, company_id)
    now = _time.time()
    cached = _HORUS_PUBLISHERS_CACHE.get(seller_id)
    if not force_refresh and cached and (now - cached["ts"] < 300):
        return {
            "company_id": seller_id,
            "source": cached.get("source", "cache"),
            "publishers": cached["publishers"],
        }

    pub_map: Dict[str, Dict[str, Any]] = {}
    source = "local"

    # 1. Coleta direto do Horus SQL (EDITORA + ITENS_ESTOQUE_GERAL)
    try:
        sql_client = HorusSQLClient(db, seller_id)
        rows = sql_client.query(
            """
            SELECT
                CAST(RTRIM(LTRIM(ISNULL(ED.NOM_FANTASIA, ISNULL(ED.NOM_EDITORA, '')))) AS NVARCHAR(250)) AS editora,
                COUNT(I.COD_ITEM) AS total_itens
            FROM ITENS_ESTOQUE_GERAL I WITH (NOLOCK)
            INNER JOIN EDITORA ED WITH (NOLOCK) ON ED.COD_EDITORA = I.COD_EDITORA
            WHERE RTRIM(LTRIM(ISNULL(ED.NOM_FANTASIA, ISNULL(ED.NOM_EDITORA, '')))) <> ''
            GROUP BY CAST(RTRIM(LTRIM(ISNULL(ED.NOM_FANTASIA, ISNULL(ED.NOM_EDITORA, '')))) AS NVARCHAR(250))
            ORDER BY editora ASC
            """,
            max_rows=5000,
        )
        for r in (rows or []):
            name = str(r.get("editora") or "").strip()
            if not name:
                continue
            key = name.upper()
            pub_map[key] = {
                "name": name,
                "horus_count": int(r.get("total_itens") or 0),
                "local_count": 0,
            }
        if pub_map:
            source = "horus_sql"
    except Exception as e:
        log.warning(f"[HorusAnaliseItens] Aviso ao coletar editoras do Horus SQL (company={seller_id}): {e}")

    # 2. Complementa com contagem local já sincronizada no Cronuz (prd_product)
    local_rows = (
        db.query(Product.brand, func.count(Product.id))
        .filter(Product.company_id == seller_id, Product.brand.isnot(None), Product.brand != "")
        .group_by(Product.brand)
        .all()
    )
    for b_name, cnt in local_rows:
        clean_b = str(b_name or "").strip()
        if not clean_b:
            continue
        key = clean_b.upper()
        if key in pub_map:
            pub_map[key]["local_count"] = int(cnt or 0)
        else:
            pub_map[key] = {
                "name": clean_b,
                "horus_count": int(cnt or 0),
                "local_count": int(cnt or 0),
            }

    publishers_list = sorted(pub_map.values(), key=lambda x: x["name"].upper())
    _HORUS_PUBLISHERS_CACHE[seller_id] = {
        "ts": now,
        "source": source,
        "publishers": publishers_list,
    }
    return {
        "company_id": seller_id,
        "source": source,
        "publishers": publishers_list,
    }


def _sync_items_from_horus_by_publishers(
    db: Session,
    seller_id: int,
    publishers: List[str],
    search: Optional[str] = None,
    max_sync: int = 1200,
) -> int:
    """
    Quando o usuário seleciona uma ou mais Editoras coletadas do Horus na tela e alguns itens
    daquela editora ainda não foram trazidos pelo worker de 2º plano, busca e sincroniza
    automaticamente os itens dessa(s) editora(s) direto do Horus SQL para que apareçam na hora.
    """
    clean_pubs = [p.strip() for p in publishers if p and p.strip()]
    if not clean_pubs:
        return 0
    try:
        sql_client = HorusSQLClient(db, seller_id)
    except Exception:
        return 0

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == seller_id).first()
    legacy_pagination = getattr(settings, "horus_legacy_pagination", False) if settings else False
    cover_primary = (settings.cover_image_base_url or "").strip().rstrip("/") if settings else ""
    cover_secondary = (settings.cover_image_secondary_base_url or "").strip().rstrip("/") if settings else ""
    launch_col = _detect_launch_col(sql_client)

    pub_placeholders = ", ".join(["%s"] * len(clean_pubs))
    params_list: List[Any] = [p.upper() for p in clean_pubs]

    search_clause = ""
    if search and search.strip():
        s_term = f"%{search.strip()}%"
        search_clause = """
          AND (
              I.NOM_ITEM LIKE %s
              OR I.COD_BARRA_ITEM LIKE %s
              OR I.COD_ISBN_ITEM LIKE %s
              OR CAST(I.COD_ITEM AS VARCHAR(30)) LIKE %s
          )
        """
        params_list.extend([s_term, s_term, s_term, s_term])

    top_clause = f"TOP ({max_sync})" if legacy_pagination else ""
    offset_clause = "" if legacy_pagination else f"OFFSET 0 ROWS FETCH NEXT {max_sync} ROWS ONLY"

    sql_q = f"""
        SELECT {top_clause}
            I.COD_ITEM AS cod_item,
            CAST(RTRIM(LTRIM(ISNULL(I.COD_BARRA_ITEM, ISNULL(I.COD_ISBN_ITEM, '')))) AS NVARCHAR(100)) AS isbn,
            CAST(RTRIM(LTRIM(ISNULL(I.NOM_ITEM, ''))) AS NVARCHAR(400)) AS nome_item,
            CAST(RTRIM(LTRIM(ISNULL(ED.NOM_FANTASIA, ISNULL(ED.NOM_EDITORA, '')))) AS NVARCHAR(250)) AS editora,
            CAST(RTRIM(LTRIM(ISNULL(G.NOM_GENERO, ''))) AS NVARCHAR(250)) AS assunto,
            ISNULL(PA.VLR_CAPA, ISNULL(I.VLR_CAPA, 0.0)) AS preco,
            ISNULL(I.QTD_ITENS_CAIXA, 0) AS qtd_caixa,
            CAST(RTRIM(LTRIM(ISNULL(I.SITUACAO_ITEM, ''))) AS NVARCHAR(60)) AS situacao_item,
            {launch_col} AS data_lancamento
        FROM ITENS_ESTOQUE_GERAL I WITH (NOLOCK)
        INNER JOIN EDITORA ED WITH (NOLOCK) ON ED.COD_EDITORA = I.COD_EDITORA
        LEFT JOIN TABELA_GENERO G WITH (NOLOCK) ON G.COD_GENERO = I.COD_GENERO
        LEFT JOIN (
            SELECT COD_ITEM, MAX(VLR_CAPA) AS VLR_CAPA
            FROM ITENS_ESTPRECO_ATUAL WITH (NOLOCK)
            GROUP BY COD_ITEM
        ) PA ON PA.COD_ITEM = I.COD_ITEM
        WHERE UPPER(RTRIM(LTRIM(ISNULL(ED.NOM_FANTASIA, ISNULL(ED.NOM_EDITORA, ''))))) IN ({pub_placeholders})
          {search_clause}
        ORDER BY I.COD_ITEM DESC
        {offset_clause}
    """
    try:
        rows = sql_client.query(sql_q, tuple(params_list), max_rows=max_sync + 5)
    except Exception as e:
        log.warning(f"[HorusAnaliseItens] Aviso ao sincronizar editoras sob demanda: {e}")
        return 0

    if not rows:
        return 0

    cod_list = [int(r["cod_item"]) for r in rows if r.get("cod_item") is not None]
    isbn_list = [str(r.get("isbn") or "").strip() for r in rows if r.get("isbn")]
    existing_prods = (
        db.query(Product)
        .filter(
            Product.company_id == seller_id,
            or_(
                Product.horus_cod_item.in_(cod_list),
                Product.ean_gtin.in_([x for x in isbn_list if x]),
                Product.sku.in_([x for x in isbn_list if x]),
            ),
        )
        .all()
    )
    by_cod: Dict[int, Product] = {}
    by_isbn: Dict[str, Product] = {}
    for p in existing_prods:
        if p.horus_cod_item:
            by_cod[int(p.horus_cod_item)] = p
        if p.ean_gtin:
            by_isbn[str(p.ean_gtin).strip()] = p
        if p.sku:
            by_isbn[str(p.sku).strip()] = p

    new_objects: List[Product] = []
    for r in rows:
        cod_item = int(r["cod_item"])
        isbn = str(r.get("isbn") or "").strip()
        sku_val = isbn if isbn else f"H-{cod_item}"
        nome = str(r.get("nome_item") or f"Item #{cod_item}").strip()
        editora = str(r.get("editora") or "").strip() or None
        assunto = str(r.get("assunto") or "").strip() or None
        preco = float(r.get("preco") or 0.0)
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

        p_obj = by_cod.get(cod_item) or (by_isbn.get(isbn) if isbn else None)
        if p_obj:
            p_obj.name = nome
            p_obj.horus_cod_item = cod_item
            if editora:
                p_obj.brand = editora
            if assunto and not p_obj.subject:
                p_obj.subject = assunto
            if preco > 0:
                p_obj.base_price = preco
        else:
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
                cost_price=0.0,
                stock_quantity=0,
                consignment_stock=0,
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
            by_cod[cod_item] = new_p
            if isbn:
                by_isbn[isbn] = new_p

    if new_objects:
        db.add_all(new_objects)
    db.commit()
    return len(new_objects)


def _parse_selected_branch_ids(
    branch_id_raw: Optional[str],
    branch_ids_list: Optional[List[int]],
    all_branches: List[Dict[str, Any]],
) -> List[int]:
    """
    Resolve a lista de branch_ids selecionadas pelo usuário:
      - Se 'ALL', vazio ou todas marcadas -> retorna todos os IDs de all_branches.
      - Se string separada por vírgula ('3,5') ou lista [3, 5] -> retorna apenas os IDs válidos selecionados.
    """
    valid_all = [int(b["id"]) for b in all_branches]
    candidates: List[int] = []
    if branch_ids_list:
        for x in branch_ids_list:
            try:
                val = int(x)
                if val in valid_all and val not in candidates:
                    candidates.append(val)
            except Exception:
                pass
    if not candidates and branch_id_raw and str(branch_id_raw).strip().upper() != "ALL":
        for part in str(branch_id_raw).split(","):
            s = part.strip()
            if s.lstrip("-").isdigit():
                val = int(s)
                if val in valid_all and val not in candidates:
                    candidates.append(val)
    return candidates if candidates else valid_all


@router.get("/products")
def list_analise_itens_products(
    company_id: Optional[int] = Query(None),
    branch_id: str = Query("ALL", description="'ALL' ou IDs de filiais separados por vírgula (ex: '3,5')"),
    search: Optional[str] = Query(None),
    publishers: Optional[str] = Query(None, description="Lista de editoras separadas por '||' ou vírgula"),
    limit: int = Query(5000, ge=1, le=10000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Lista os produtos para a tela Horus Direct -> Análise de Itens com:
    - Suporte a filtro multi-seleção de Filiais (Todas ou apenas algumas selecionadas)
    - Suporte a filtro multi-seleção de Editoras do Horus
    - Estoque Mínimo por Produto e por Filial Configurada (min_stock e min_stock_by_branch)
    """
    seller_id = _resolve_seller_id(current_user, company_id)
    all_branches = _load_configured_branches(db, seller_id)

    selected_pubs: List[str] = []
    if publishers and publishers.strip():
        sep = "||" if "||" in publishers else ","
        selected_pubs = [p.strip() for p in publishers.split(sep) if p.strip()]

    # Se o usuário selecionou editoras específicas, verifica se já estão todas sincronizadas
    if selected_pubs:
        local_pub_count = (
            db.query(func.count(Product.id))
            .filter(
                Product.company_id == seller_id,
                func.upper(func.trim(Product.brand)).in_([p.upper() for p in selected_pubs]),
            )
            .scalar()
            or 0
        )
        cached_pubs = (_HORUS_PUBLISHERS_CACHE.get(seller_id) or {}).get("publishers") or []
        horus_expected = sum(
            int(cp.get("horus_count") or 0)
            for cp in cached_pubs
            if str(cp.get("name") or "").strip().upper() in {p.upper() for p in selected_pubs}
        )
        if local_pub_count == 0 or (horus_expected > local_pub_count and (horus_expected - local_pub_count) <= 2500):
            _sync_items_from_horus_by_publishers(
                db=db,
                seller_id=seller_id,
                publishers=selected_pubs,
                search=search,
                max_sync=1500,
            )

    q = db.query(Product).filter(Product.company_id == seller_id)
    if selected_pubs:
        q = q.filter(func.upper(func.trim(Product.brand)).in_([p.upper() for p in selected_pubs]))

    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                Product.name.ilike(term),
                Product.subject.ilike(term),
                Product.brand.ilike(term),
                Product.ean_gtin.ilike(term),
                Product.sku.ilike(term),
                Product.additional_isbns.ilike(term),
                cast(Product.horus_cod_item, String).ilike(term),
            )
        )

    rows = q.order_by(Product.id.desc()).limit(limit).all()

    by_branch_isbn, by_branch_prod = _load_min_stock_map(db, seller_id)
    branch_ids = [int(b["id"]) for b in all_branches]
    active_bids = _parse_selected_branch_ids(branch_id, None, all_branches)

    items_out: List[Dict[str, Any]] = []
    for p in rows:
        isbn_val = (p.ean_gtin or p.sku or "").strip()
        min_by_b: Dict[str, int] = {}
        for bid in branch_ids:
            ms_val = _resolve_product_branch_min_stock(
                branch_id=bid,
                product_id=p.id,
                isbn=isbn_val,
                by_branch_isbn=by_branch_isbn,
                by_branch_prod=by_branch_prod,
            )
            min_by_b[str(bid)] = ms_val

        eff_min_stock = sum(min_by_b.get(str(bid), 0) for bid in active_bids)

        items_out.append({
            "id": p.id,
            "sku": p.sku or String(p.id),
            "name": (p.name or "").strip() or f"Item #{p.horus_cod_item or p.sku or p.id}",
            "isbn": isbn_val,
            "ean_gtin": p.ean_gtin or "",
            "additional_isbns": p.additional_isbns or "",
            "brand": (p.brand or "").strip() or "Sem Editora",
            "subject": (p.subject or "").strip() or "Geral",
            "base_price": float(p.base_price or 0.0),
            "cost_price": float(p.cost_price or 0.0),
            "stock_quantity": int(p.stock_quantity or 0),
            "min_stock": eff_min_stock,
            "min_stock_by_branch": min_by_b,
            "consignment_stock": int(p.consignment_stock or 0),
            "consigned_received": 0,
            "sales_365": int(p.sales_365 or 0),
            "sales_period": int(p.sales_90 or 0),
            "units_per_box": int(p.units_per_box or 0),
            "launch_date": p.launch_date.isoformat() if p.launch_date else None,
            "horus_cod_item": p.horus_cod_item,
            "horus_situacao_item": p.horus_situacao_item,
            "is_ebook": bool(p.is_ebook),
            "is_out_of_print": bool(p.is_out_of_print) or p.status == "INACTIVE",
            "status": p.status,
        })

    return {
        "items": items_out,
        "total": len(items_out),
    }


@router.get("/sync-status")
def get_analise_itens_sync_status(
    company_id: Optional[int] = Query(None),
    force_count: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
        bg_state = _load_shared_bg_state(seller_id)

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
    seller_id = _resolve_seller_id(current_user, payload.company_id)
    try:
        HorusSQLClient(db, seller_id, pool_slot="bg_sync")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Não foi possível iniciar: conexão Horus SQL indisponível ({e}).")

    with _BG_SYNC_LOCK:
        cur = _load_shared_bg_state(seller_id)
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
        _save_shared_bg_state(seller_id, new_state)

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
    seller_id = _resolve_seller_id(current_user, company_id)
    with _BG_SYNC_LOCK:
        st = _load_shared_bg_state(seller_id)
        if st and st.get("is_running"):
            st["stop_requested"] = True
            st["status_message"] = "Parando sincronização após concluir o lote atual..."
            _save_shared_bg_state(seller_id, st)
            return {"stopped": True, "message": "Solicitação de pausa enviada ao worker."}
    return {"stopped": False, "message": "Nenhuma sincronização em execução no momento."}


# ── Endpoints de Estoque Mínimo por Produto e por Filial Configurada ──────────

class SetBranchMinStockPayload(BaseModel):
    company_id: Optional[int] = None
    branch_id: int
    isbn: str
    product_id: Optional[int] = None
    min_stock: int


@router.post("/min-stock/set")
def set_branch_min_stock(
    payload: SetBranchMinStockPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Define ou atualiza o Estoque Mínimo de um produto (ISBN) para uma Filial Configurada específica.
    """
    seller_id = _resolve_seller_id(current_user, payload.company_id)
    clean_isbn = _normalize_isbn(payload.isbn)
    if not clean_isbn:
        raise HTTPException(status_code=400, detail="ISBN inválido para definir estoque mínimo.")

    min_val = max(0, int(payload.min_stock or 0))
    row = (
        db.query(ProductBranchMinStock)
        .filter(
            ProductBranchMinStock.company_id == seller_id,
            ProductBranchMinStock.branch_id == int(payload.branch_id),
            ProductBranchMinStock.isbn == clean_isbn,
        )
        .first()
    )
    if row:
        row.min_stock = min_val
        if payload.product_id:
            row.product_id = int(payload.product_id)
        row.updated_at = datetime.utcnow()
    else:
        row = ProductBranchMinStock(
            company_id=seller_id,
            branch_id=int(payload.branch_id),
            isbn=clean_isbn,
            product_id=int(payload.product_id) if payload.product_id else None,
            min_stock=min_val,
        )
        db.add(row)
    db.commit()

    return {
        "ok": True,
        "branch_id": int(payload.branch_id),
        "isbn": clean_isbn,
        "min_stock": min_val,
    }


@router.get("/min-stock/template")
def download_min_stock_template():
    """
    Baixa a planilha modelo (.xlsx) contendo apenas as 2 colunas exigidas:
    ISBN | ESTOQUE_MINIMO
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Estoque_Minimo_Filial"
    ws.append(["ISBN", "ESTOQUE_MINIMO"])

    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True, size=10)
    for col_idx in (1, 2):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    ws.append(["9788552994152", 10])
    ws.append(["9786555680614", 5])
    ws.column_dimensions["A"].width = 24
    ws.column_dimensions["B"].width = 22

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="Modelo_Estoque_Minimo_Por_Filial.xlsx"'},
    )


@router.post("/min-stock/import")
async def import_branch_min_stock_file(
    branch_id: int = Form(..., description="ID da Filial Configurada em /logistics/branches"),
    company_id: Optional[int] = Form(None),
    replace_existing: bool = Form(True, description="Se True, mantém apenas os ISBNs importados nesta filial"),
    pasted_text: Optional[str] = Form(None, description="Texto colado opcional no formato ISBN;ESTOQUE_MINIMO"),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Importa a relação de Estoque Mínimo para a Filial selecionada, mantendo apenas:
      - ISBN
      - Quantidade de Estoque Mínimo
    Aceita arquivo Excel (.xlsx) ou CSV (.csv) de até 10 MB ou colagem rápida de linhas (ISBN ; QTD).
    """
    seller_id = _resolve_seller_id(current_user, company_id)
    branches = _load_configured_branches(db, seller_id)
    target_branch = next((b for b in branches if int(b["id"]) == int(branch_id)), None)
    if not target_branch:
        raise HTTPException(
            status_code=400,
            detail="Selecione uma filial válida configurada em Logística -> Filiais do Seller antes de importar.",
        )

    parsed_pairs: Dict[str, int] = {}

    if file and file.filename:
        raw_bytes = await file.read()
        if len(raw_bytes) > MAX_SHEET_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail="O arquivo excede o limite máximo permitido de 10 MB para este tipo de envio.",
            )
        fname_lower = file.filename.lower()
        if fname_lower.endswith(".xlsx"):
            try:
                wb = openpyxl.load_workbook(io.BytesIO(raw_bytes), read_only=True, data_only=True)
                ws = wb.active
                for row_idx, row in enumerate(ws.iter_rows(values_only=True)):
                    if not row or len(row) < 2:
                        continue
                    c0 = str(row[0] if row[0] is not None else "").strip()
                    c1 = str(row[1] if row[1] is not None else "").strip()
                    if row_idx == 0 and (
                        "ISBN" in c0.upper()
                        or "CODIGO" in c0.upper()
                        or "BARRA" in c0.upper()
                        or "MIN" in c1.upper()
                    ):
                        continue
                    isbn_clean = _normalize_isbn(c0)
                    if not isbn_clean:
                        continue
                    try:
                        qty_val = max(0, int(float(c1.replace(",", "."))))
                    except Exception:
                        continue
                    parsed_pairs[isbn_clean] = qty_val
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Não foi possível ler a planilha Excel (.xlsx): {e}")
        else:
            # CSV / TXT
            try:
                text_content = raw_bytes.decode("utf-8-sig", errors="replace")
            except Exception:
                text_content = raw_bytes.decode("latin-1", errors="replace")
            for line_idx, raw_line in enumerate(text_content.splitlines()):
                line = raw_line.strip()
                if not line:
                    continue
                delim = ";" if ";" in line else ("\t" if "\t" in line else ",")
                parts = [p.strip().strip('"').strip("'") for p in line.split(delim)]
                if len(parts) < 2:
                    continue
                if line_idx == 0 and ("ISBN" in parts[0].upper() or "MIN" in parts[1].upper()):
                    continue
                isbn_clean = _normalize_isbn(parts[0])
                if not isbn_clean:
                    continue
                try:
                    qty_val = max(0, int(float(parts[1].replace(",", "."))))
                except Exception:
                    continue
                parsed_pairs[isbn_clean] = qty_val

    if pasted_text and pasted_text.strip():
        for line_idx, raw_line in enumerate(pasted_text.strip().splitlines()):
            line = raw_line.strip()
            if not line:
                continue
            delim = ";" if ";" in line else ("\t" if "\t" in line else ",")
            parts = [p.strip().strip('"').strip("'") for p in line.split(delim)]
            if len(parts) < 2:
                continue
            if line_idx == 0 and ("ISBN" in parts[0].upper() or "MIN" in parts[1].upper()):
                continue
            isbn_clean = _normalize_isbn(parts[0])
            if not isbn_clean:
                continue
            try:
                qty_val = max(0, int(float(parts[1].replace(",", "."))))
            except Exception:
                continue
            parsed_pairs[isbn_clean] = qty_val

    if not parsed_pairs:
        raise HTTPException(
            status_code=400,
            detail="Nenhum registro válido de (ISBN, Quantidade Estoque Mínimo) foi encontrado no envio.",
        )

    # Mapeia ISBN -> product_id existente no seller para vínculo rápido
    isbn_keys = list(parsed_pairs.keys())
    isbn_to_pid: Dict[str, int] = {}
    for ch_start in range(0, len(isbn_keys), 500):
        ch = isbn_keys[ch_start:ch_start + 500]
        prods = (
            db.query(Product.id, Product.ean_gtin, Product.sku)
            .filter(
                Product.company_id == seller_id,
                or_(Product.ean_gtin.in_(ch), Product.sku.in_(ch)),
            )
            .all()
        )
        for pid, ean, sku in prods:
            if ean:
                isbn_to_pid[_normalize_isbn(ean)] = int(pid)
            if sku:
                isbn_to_pid[_normalize_isbn(sku)] = int(pid)

    if replace_existing:
        db.query(ProductBranchMinStock).filter(
            ProductBranchMinStock.company_id == seller_id,
            ProductBranchMinStock.branch_id == int(branch_id),
        ).delete(synchronize_session=False)
        db.flush()

        new_records = [
            ProductBranchMinStock(
                company_id=seller_id,
                branch_id=int(branch_id),
                isbn=isbn_k[:50],
                product_id=isbn_to_pid.get(isbn_k),
                min_stock=qty_v,
            )
            for isbn_k, qty_v in parsed_pairs.items()
        ]
        db.bulk_save_objects(new_records)
        db.commit()
    else:
        existing_rows = (
            db.query(ProductBranchMinStock)
            .filter(
                ProductBranchMinStock.company_id == seller_id,
                ProductBranchMinStock.branch_id == int(branch_id),
            )
            .all()
        )
        existing_map = {_normalize_isbn(r.isbn): r for r in existing_rows}
        new_records = []
        for isbn_k, qty_v in parsed_pairs.items():
            if isbn_k in existing_map:
                r_obj = existing_map[isbn_k]
                r_obj.min_stock = qty_v
                if isbn_k in isbn_to_pid:
                    r_obj.product_id = isbn_to_pid[isbn_k]
                r_obj.updated_at = datetime.utcnow()
            else:
                new_records.append(
                    ProductBranchMinStock(
                        company_id=seller_id,
                        branch_id=int(branch_id),
                        isbn=isbn_k[:50],
                        product_id=isbn_to_pid.get(isbn_k),
                        min_stock=qty_v,
                    )
                )
        if new_records:
            db.bulk_save_objects(new_records)
        db.commit()

    return {
        "ok": True,
        "branch_id": int(branch_id),
        "branch_name": target_branch["nome"],
        "imported_count": len(parsed_pairs),
        "matched_products_count": len(isbn_to_pid),
        "replace_existing": replace_existing,
        "message": (
            f"Estoque mínimo importado com sucesso para a filial '{target_branch['nome']}' "
            f"({len(parsed_pairs)} ISBNs processados)."
        ),
    }


# ── Motor Multi-Filial de Enriquecimento SQL (Saldos, Custos, Consignado, Vendas & Última Entrada) ──

def _enrich_cod_items_multibranch(
    sql_client: HorusSQLClient,
    cod_items: List[int],
    target_branches: List[Dict[str, Any]],
    sales_days: int = 90,
    sales_start_date: Optional[str] = None,
    sales_end_date: Optional[str] = None,
) -> Dict[int, Dict[str, Any]]:
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
                "sold_unit_price": 0.0,
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

        # 1. TABELA_SALDO_ITENS_GERAL (Saldos por Empresa/Filial, Consignado Env/Rec e Custo Médio)
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
                        # Se a filial possui COD_LOCAL configurado, o saldo do local virá da TABELA_SALDO_ITENS abaixo;
                        # caso não possua local específico configurado, usa o saldo_disp geral da filial.
                        if not b.get("locais"):
                            b_entry["stock_available"] = int(float(gr.get("saldo_disp") or 0))
                        b_entry["stock_physical"] = int(float(gr.get("saldo_fisico") or 0))
                        b_entry["consigned_sent"] = int(float(gr.get("consig_enviado") or 0))
                        b_entry["consigned_received"] = int(float(gr.get("consig_recebido") or 0))
                        b_entry["cost_price"] = round(float(gr.get("custo_medio") or 0.0), 2)
        except Exception as e:
            log.warning(f"[HorusAnaliseItens] Aviso em TABELA_SALDO_ITENS_GERAL: {e}")

        # 2. TABELA_SALDO_ITENS por COD_LOCAL (respeita estritamente os locais de cada filial em /logistics/branches)
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

        # 3. Vendas por Filial (365 dias + Período filtrado + Preço Líquido Unitário Vendido) em NF_ITENS + NF_MESTRE
        try:
            sql_sales = f"""
                SELECT
                    NFI.COD_EMPRESA AS cod_empresa,
                    NFI.COD_FILIAL AS cod_filial,
                    NFI.COD_ITEM AS cod_item,
                    SUM(CASE WHEN NF.DAT_EMISSAO_NF >= DATEADD(day, -365, GETDATE()) THEN ISNULL(NFI.QTD_ITENS, 0) ELSE 0 END) AS vds_365,
                    SUM(CASE WHEN {custom_date_clause} THEN ISNULL(NFI.QTD_ITENS, 0) ELSE 0 END) AS vds_periodo,
                    CASE
                        WHEN SUM(CASE WHEN {custom_date_clause} AND ISNULL(NFI.VLR_LIQUIDO_ITEM, 0) > 0 THEN ISNULL(NFI.QTD_ITENS, 0) ELSE 0 END) > 0
                            THEN SUM(CASE WHEN {custom_date_clause} AND ISNULL(NFI.VLR_LIQUIDO_ITEM, 0) > 0 THEN ISNULL(NFI.VLR_LIQUIDO_ITEM, 0) * ISNULL(NFI.QTD_ITENS, 0) ELSE 0 END)
                                 / SUM(CASE WHEN {custom_date_clause} AND ISNULL(NFI.VLR_LIQUIDO_ITEM, 0) > 0 THEN ISNULL(NFI.QTD_ITENS, 0) ELSE 0 END)
                        WHEN SUM(CASE WHEN ISNULL(NFI.VLR_LIQUIDO_ITEM, 0) > 0 THEN ISNULL(NFI.QTD_ITENS, 0) ELSE 0 END) > 0
                            THEN SUM(CASE WHEN ISNULL(NFI.VLR_LIQUIDO_ITEM, 0) > 0 THEN ISNULL(NFI.VLR_LIQUIDO_ITEM, 0) * ISNULL(NFI.QTD_ITENS, 0) ELSE 0 END)
                                 / SUM(CASE WHEN ISNULL(NFI.VLR_LIQUIDO_ITEM, 0) > 0 THEN ISNULL(NFI.QTD_ITENS, 0) ELSE 0 END)
                        ELSE MAX(ISNULL(NFI.VLR_LIQUIDO_ITEM, 0))
                    END AS preco_vendido_unit
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
                    p_sold = round(float(sr.get("preco_vendido_unit") or 0.0), 2)
                    for b in branch_by_pair[pair]:
                        b_entry = result[c_int]["by_branch"][int(b["id"])]
                        b_entry["sales_365"] = v365
                        b_entry["sales_period"] = vper
                        b_entry["sold_unit_price"] = p_sold
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
                            WHEN ISNULL(INF.VLR_LIQUIDO_ITEM, 0) > 0 THEN INF.VLR_LIQUIDO_ITEM
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
                        if not cur_dt or dt_iso > cur_dt:
                            b_entry["last_entry_date"] = dt_iso
                            b_entry["last_entry_qty"] = qtd_m
                            b_entry["last_entry_type"] = mov_type
                            if not b_entry.get("last_entry_cfop"):
                                b_entry["last_entry_cfop"] = "1917/2917" if mov_type == "CONSIG. RECEBIDA" else "1102/2102"
        except Exception as e:
            log.warning(f"[HorusAnaliseItens] Aviso ao consultar TABELA_MOVIMENTACAO: {e}")

    for c_int, data_c in result.items():
        b_list = list(data_c["by_branch"].values())
        tot_stock = sum(x["stock_available"] for x in b_list)
        tot_consig_sent = sum(x["consigned_sent"] for x in b_list)
        tot_consig_rec = sum(x["consigned_received"] for x in b_list)
        tot_s365 = sum(x["sales_365"] for x in b_list)
        tot_sper = sum(x["sales_period"] for x in b_list)

        costs = [x["cost_price"] for x in b_list if x["cost_price"] > 0]
        avg_cost = round(sum(costs) / len(costs), 2) if costs else 0.0

        sold_prices = [x["sold_unit_price"] for x in b_list if x.get("sold_unit_price", 0) > 0]
        avg_sold_price = round(sum(sold_prices) / len(sold_prices), 2) if sold_prices else 0.0

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
            "sold_unit_price": avg_sold_price,
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


# ── Endpoint de Enriquecimento em Lote da Página Atual ────────────────────────

class EnrichPagePayload(BaseModel):
    company_id: Optional[int] = None
    branch_id: Optional[str] = "ALL"
    branch_ids: Optional[List[int]] = None
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
    Enriquece instantaneamente os itens visíveis na página atual consultando TODAS as filiais
    configuradas em /logistics/branches para que:
      1. O Raio-X Multi-Filial (branches_breakdown) SEMPRE tenha o saldo real e distinto de cada filial
         (nunca repetindo o saldo consolidado).
      2. A linha principal exiba os dados consolidados APENAS das filiais selecionadas no filtro
         (1 filial, um subconjunto de filiais ou Todas as Filiais).
      3. O Estoque Mínimo por Produto e por Filial (min_stock) seja conciliado junto com o saldo real.
    """
    seller_id = _resolve_seller_id(current_user, payload.company_id)
    if not payload.product_ids:
        return {"metrics": {}, "branches": []}

    all_branches = _load_configured_branches(db, seller_id)
    selected_bids = _parse_selected_branch_ids(payload.branch_id, payload.branch_ids, all_branches)

    prods = (
        db.query(Product)
        .filter(Product.company_id == seller_id, Product.id.in_(payload.product_ids[:250]))
        .all()
    )
    if not prods:
        return {"metrics": {}, "branches": all_branches}

    prod_isbns = [_normalize_isbn(p.ean_gtin or p.sku) for p in prods if (p.ean_gtin or p.sku)]
    prod_ids = [int(p.id) for p in prods]
    by_branch_isbn, by_branch_prod = _load_min_stock_map(
        db=db,
        seller_id=seller_id,
        isbns=prod_isbns,
        product_ids=prod_ids,
    )

    sql_client = None
    try:
        sql_client = HorusSQLClient(db, seller_id)
    except Exception:
        sql_client = None

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
            target_branches=all_branches,
            sales_days=payload.sales_days,
            sales_start_date=payload.sales_start_date,
            sales_end_date=payload.sales_end_date,
        )
        for c_int, p_list in cod_to_prods.items():
            e_data = enriched_by_cod.get(c_int)
            if not e_data:
                continue
            for p_obj in p_list:
                isbn_val = p_obj.ean_gtin or p_obj.sku or ""
                by_b_list: List[Dict[str, Any]] = []
                min_by_b: Dict[str, int] = {}
                for b in all_branches:
                    bid = int(b["id"])
                    raw_bm = dict(e_data["by_branch"].get(bid) or {})
                    ms_val = _resolve_product_branch_min_stock(
                        branch_id=bid,
                        product_id=p_obj.id,
                        isbn=isbn_val,
                        by_branch_isbn=by_branch_isbn,
                        by_branch_prod=by_branch_prod,
                    )
                    raw_bm["min_stock"] = ms_val
                    raw_bm["min_stock_status"] = _evaluate_min_stock_status(
                        int(raw_bm.get("stock_available") or 0),
                        ms_val,
                    )
                    min_by_b[str(bid)] = ms_val
                    by_b_list.append(raw_bm)

                # Consolida apenas as filiais marcadas em selected_bids (1, algumas ou todas)
                sel_branch_entries = [
                    e_data["by_branch"][bid]
                    for bid in selected_bids
                    if bid in e_data["by_branch"]
                ] or list(e_data["by_branch"].values())

                sel_stock = sum(int(x.get("stock_available") or 0) for x in sel_branch_entries)
                sel_consig_sent = sum(int(x.get("consigned_sent") or 0) for x in sel_branch_entries)
                sel_consig_rec = sum(int(x.get("consigned_received") or 0) for x in sel_branch_entries)
                sel_s365 = sum(int(x.get("sales_365") or 0) for x in sel_branch_entries)
                sel_sper = sum(int(x.get("sales_period") or 0) for x in sel_branch_entries)
                sel_min = sum(min_by_b.get(str(bid), 0) for bid in selected_bids)

                sel_costs = [float(x.get("cost_price") or 0.0) for x in sel_branch_entries if float(x.get("cost_price") or 0.0) > 0]
                sel_avg_cost = round(sum(sel_costs) / len(sel_costs), 2) if sel_costs else float(p_obj.cost_price or 0.0)

                sel_sold_prices = [float(x.get("sold_unit_price") or 0.0) for x in sel_branch_entries if float(x.get("sold_unit_price") or 0.0) > 0]
                sel_avg_sold = round(sum(sel_sold_prices) / len(sel_sold_prices), 2) if sel_sold_prices else 0.0

                latest_sel = None
                for x in sel_branch_entries:
                    if x.get("last_entry_date"):
                        if not latest_sel or x["last_entry_date"] > latest_sel["last_entry_date"]:
                            latest_sel = x

                metrics_out[str(p_obj.id)] = {
                    "horus_cod_item": c_int,
                    "stock_quantity": sel_stock,
                    "min_stock": sel_min,
                    "min_stock_by_branch": min_by_b,
                    "consignment_stock": sel_consig_sent,
                    "consigned_received": sel_consig_rec,
                    "cost_price": sel_avg_cost,
                    "sold_unit_price": sel_avg_sold,
                    "sales_365": sel_s365,
                    "sales_period": sel_sper,
                    "last_entry_date": latest_sel["last_entry_date"] if latest_sel else None,
                    "last_entry_qty": latest_sel["last_entry_qty"] if latest_sel else 0,
                    "last_entry_cost": latest_sel["last_entry_cost"] if latest_sel else 0.0,
                    "last_entry_type": latest_sel["last_entry_type"] if latest_sel else None,
                    "last_entry_cfop": latest_sel["last_entry_cfop"] if latest_sel else None,
                    "last_entry_nf": latest_sel["last_entry_nf"] if latest_sel else None,
                    "last_entry_branch": latest_sel["branch_name"] if latest_sel else None,
                    "branches_breakdown": by_b_list,
                }

    return {
        "metrics": metrics_out,
        "branches": all_branches,
    }


# ── Exportação Segura de Relatório Excel Multi-Filial (Análise & Reposição) ──

@router.get("/export-excel")
def export_analise_itens_excel(
    company_id: Optional[int] = Query(None),
    branch_id: str = Query("ALL", description="ALL para todas as filiais configuradas ou IDs separados por vírgula"),
    model: str = Query("MULTIBRANCH_REPLENISHMENT", description="MULTIBRANCH_REPLENISHMENT (1 linha por item/filial) ou CONSOLIDATED"),
    search: Optional[str] = Query(None),
    publisher: Optional[str] = Query(None),
    publishers: Optional[str] = Query(None, description="Lista de editoras selecionadas separadas por '||'"),
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
    seller_id = _resolve_seller_id(current_user, company_id)
    all_branches = _load_configured_branches(db, seller_id)
    selected_bids = _parse_selected_branch_ids(branch_id, None, all_branches)
    target_branches = [b for b in all_branches if int(b["id"]) in selected_bids] or all_branches

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
    if publishers and publishers.strip():
        sep = "||" if "||" in publishers else ","
        sel_pubs = [p.strip().upper() for p in publishers.split(sep) if p.strip()]
        if sel_pubs:
            q = q.filter(func.upper(func.trim(Product.brand)).in_(sel_pubs))
    elif publisher and publisher.strip():
        q = q.filter(Product.brand.ilike(f"%{publisher.strip()}%"))

    if hide_ebooks:
        q = q.filter(or_(Product.is_ebook == False, Product.is_ebook.is_(None)))
    if hide_out_of_stock:
        q = q.filter(Product.stock_quantity > 0, or_(Product.is_out_of_print == False, Product.is_out_of_print.is_(None)))

    products = q.order_by(Product.horus_cod_item.desc().nullslast(), Product.id.desc()).limit(max_items).all()
    by_branch_isbn, by_branch_prod = _load_min_stock_map(db, seller_id)

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
        "Preço Vendido Unit. (R$)",
        "Custo Médio Filial (R$)",
        "Custo Últ. Entrada (R$)",
        "Saldo Disponível",
        "Estoque Mínimo",
        "Alerta Estoque Mín.",
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

    def _status_label(st_code: str) -> str:
        if st_code == "BELOW_MIN":
            return "ABAIXO DO MÍNIMO (VERMELHO)"
        if st_code == "NEAR_MIN":
            return "PRÓXIMO DO MÍNIMO (LARANJA)"
        if st_code == "OK":
            return "ACIMA DO MÍNIMO"
        return "—"

    for p in products:
        c_int = int(p.horus_cod_item) if (p.horus_cod_item and int(p.horus_cod_item) > 0) else 0
        e_item = enriched_map.get(c_int)
        sit_label = p.horus_situacao_item or ("Esgotado" if p.is_out_of_print else "Em Distribuição")
        isbn_val = p.ean_gtin or p.sku or ""

        if is_multibranch:
            for b in target_branches:
                bid = int(b["id"])
                b_metrics = (
                    e_item["by_branch"].get(bid)
                    if (e_item and bid in e_item["by_branch"])
                    else {
                        "stock_available": 0,
                        "consigned_sent": 0,
                        "consigned_received": 0,
                        "cost_price": float(p.cost_price or 0.0),
                        "sales_365": 0,
                        "sales_period": 0,
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
                ms_val = _resolve_product_branch_min_stock(
                    branch_id=bid,
                    product_id=p.id,
                    isbn=isbn_val,
                    by_branch_isbn=by_branch_isbn,
                    by_branch_prod=by_branch_prod,
                )
                ms_status = _evaluate_min_stock_status(saldo_disp, ms_val)
                vds_per = int(b_metrics.get("sales_period") or 0)
                sug_rep = max(0, max(vds_per, ms_val) - max(0, saldo_disp))
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
                    round(float(b_metrics.get("sold_unit_price") or 0.0), 2),
                    round(float(b_metrics.get("cost_price") or p.cost_price or 0.0), 2),
                    round(float(b_metrics.get("last_entry_cost") or 0.0), 2),
                    saldo_disp,
                    ms_val,
                    _status_label(ms_status),
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
            tot_ms = sum(
                _resolve_product_branch_min_stock(
                    branch_id=int(b["id"]),
                    product_id=p.id,
                    isbn=isbn_val,
                    by_branch_isbn=by_branch_isbn,
                    by_branch_prod=by_branch_prod,
                )
                for b in target_branches
            )
            ms_status = _evaluate_min_stock_status(saldo_disp, tot_ms)
            vds_per = int(cons.get("sales_period") or 0)
            sug_rep = max(0, max(vds_per, tot_ms) - max(0, saldo_disp))

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
                round(float(cons.get("sold_unit_price") or 0.0), 2),
                round(float(cons.get("cost_price") or p.cost_price or 0.0), 2),
                round(float(cons.get("last_entry_cost") or 0.0), 2),
                saldo_disp,
                tot_ms,
                _status_label(ms_status),
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

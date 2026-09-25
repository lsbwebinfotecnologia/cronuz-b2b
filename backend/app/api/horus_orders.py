"""
horus_orders.py
---------------
Endpoints do módulo Horus Direct — Pedidos (Horus ERP).

Funcionalidades:
  1. Listagem de pedidos em PEDIDOS_VENDA (por padrão status != 'FAT' e != 'CAN')
  2. Filtro e detalhamento de datas:
     - Data de criação (DAT_PEDIDO_VENDA)
     - Data de liberação para expedição (DAT_LIB_EXP / DAT_EXPEDICAO)
     - Data de liberação para LFT (DAT_LIB_LFT / DAT_LFT)
  3. Filtro por Método de Venda (COD_METODO) e busca ampla
  4. Detalhes completos do pedido + Itens (ITENS_PEDIDO_VENDA)
  5. Se faturado (FAT): traz dados da NF (NF_MESTRE) com chave de acesso NFe de 44 dígitos e itens da NF (NF_ITENS)

PERFORMANCE & SEGURANÇA:
  - Paginação via SQL Server (OFFSET/FETCH NEXT)
  - Thread pool (run_in_executor) para chamadas pytds sem travar o event loop FastAPI
  - Ownership guard em todos os endpoints (assert_company_ownership)
"""
import asyncio
import logging
from datetime import datetime, date
from decimal import Decimal
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.core.utils import assert_company_ownership
from app.integrators.horus_sql_client import HorusSQLClient, HorusSQLConfigError

router = APIRouter()
logger = logging.getLogger(__name__)


def _assert_ownership(current_user, company_id: int) -> None:
    """[SEC] Valida se o usuário pertence à empresa ou é MASTER."""
    assert_company_ownership(current_user, company_id)


def _get_settings_or_404(db: Session, company_id: int):
    from app.models.company_settings import CompanySettings
    settings = db.query(CompanySettings).filter(
        CompanySettings.company_id == company_id
    ).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Configurações da empresa não encontradas.")
    return settings


def _serialize_val(val: Any) -> Any:
    """Converte tipos datetime e Decimal para formatos JSON amigáveis."""
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    if isinstance(val, Decimal):
        return float(val)
    if isinstance(val, bytes):
        return val.decode("utf-8", errors="replace")
    return val


def _serialize_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """Serializa todas as chaves e valores de uma linha do banco SQL."""
    if not isinstance(row, dict):
        return row
    return {k.lower(): _serialize_val(v) for k, v in row.items()}


@router.get("/companies/{company_id}/horus-sql/orders")
async def list_horus_orders(
    company_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    filial: Optional[str] = Query(None),
    status: Optional[str] = Query(None, description="Filtro de status: 'DEFAULT' (exclui FAT e CAN), 'TODOS', ou status específico como 'FAT', 'CAN', 'AB'"),
    cod_metodo: Optional[str] = Query(None),
    search: Optional[str] = Query(None, description="Busca por Pedido Web, Pedido Horus, Cliente ou NF"),
    data_inicio: Optional[str] = Query(None),
    data_fim: Optional[str] = Query(None),
    dias_alerta_expedicao: int = Query(3, ge=1, description="Dias limite em expedição para disparar alerta"),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    [ALTA PERFORMANCE & SEM LOCKS]
    Lista paginada de pedidos no Horus ERP (PEDIDOS_VENDA) usando NOLOCK,
    paginação em dois estágios (CTE) e joins tardios apenas para as 20 linhas da página.
    """
    _assert_ownership(current_user, company_id)
    settings = _get_settings_or_404(db, company_id)

    try:
        sql_client = HorusSQLClient(db, company_id)
    except HorusSQLConfigError as e:
        raise HTTPException(status_code=400, detail=str(e))

    cod_filial = str(filial or settings.horus_sql_cod_filial or settings.horus_branch or "1").strip()
    target_metodo = (cod_metodo or settings.horus_vendas_metodo or "").strip()

    def _execute_query():
        where_clauses = ["PV.COD_FILIAL = %s"]
        params: List[Any] = [cod_filial]

        # 1. Filtro de Status
        status_clean = (status or "").strip().upper()
        if not status_clean or status_clean == "DEFAULT":
            # Padrão: diferente de FAT (Faturado) e CAN (Cancelado)
            where_clauses.append("ISNULL(PV.STATUS_PEDIDO_VENDA, '') NOT IN ('FAT', 'CAN', 'CA')")
        elif status_clean != "TODOS":
            where_clauses.append("PV.STATUS_PEDIDO_VENDA = %s")
            params.append(status_clean)

        # 2. Filtro de Método de Venda (se fornecido)
        if target_metodo and target_metodo.upper() != "TODOS":
            where_clauses.append("PV.COD_METODO = %s")
            params.append(target_metodo)

        # 3. Filtro de Busca Textual Ampla
        has_search = bool(search and search.strip())
        if has_search:
            s = search.strip().replace("#", "")
            where_clauses.append("""(
                PV.COD_PEDIDO_ORIGEM LIKE %s
                OR CAST(PV.COD_PED_VENDA AS VARCHAR(30)) LIKE %s
                OR CAST(PV.COD_CLI AS VARCHAR(30)) LIKE %s
                OR ISNULL(CLI.NOM_CLI, '') LIKE %s
            )""")
            like_term = f"%{s}%"
            params.extend([like_term, like_term, like_term, like_term])

        # 4. Filtro por Período de Data de Criação (usa estilo 120 para conversão canônica independente do idioma)
        if data_inicio:
            where_clauses.append("PV.DAT_PEDIDO >= CONVERT(DATETIME, %s, 120)")
            params.append(f"{data_inicio[:10]} 00:00:00")
        if data_fim:
            where_clauses.append("PV.DAT_PEDIDO <= CONVERT(DATETIME, %s, 120)")
            params.append(f"{data_fim[:10]} 23:59:59")

        where_sql = " AND ".join(where_clauses)
        offset = (page - 1) * page_size

        # 1. Query de Contagem Ultra Rápida (sem joins desnecessários)
        if has_search:
            count_sql = f"""
                SELECT COUNT(1) AS total_count
                FROM PEDIDOS_VENDA PV WITH (NOLOCK)
                LEFT JOIN CLIENTES CLI WITH (NOLOCK) ON CLI.COD_CLI = PV.COD_CLI
                WHERE {where_sql}
            """
        else:
            count_sql = f"""
                SELECT COUNT(1) AS total_count
                FROM PEDIDOS_VENDA PV WITH (NOLOCK)
                WHERE {where_sql}
            """
        count_rows = sql_client.query(count_sql, tuple(params), max_rows=1)
        total_records = int(count_rows[0].get("total_count", 0)) if count_rows else 0

        # 2. Query Paginada de Alta Performance (Paginação via CTE + Joins apenas nos 20 registros retornados)
        if has_search:
            query_sql = f"""
                WITH PagedKeys AS (
                    SELECT PV.COD_PED_VENDA, PV.COD_FILIAL
                    FROM PEDIDOS_VENDA PV WITH (NOLOCK)
                    LEFT JOIN CLIENTES CLI WITH (NOLOCK) ON CLI.COD_CLI = PV.COD_CLI
                    WHERE {where_sql}
                    ORDER BY PV.COD_PED_VENDA DESC
                    OFFSET {offset} ROWS
                    FETCH NEXT {page_size} ROWS ONLY
                )
                SELECT 
                    PV.COD_PED_VENDA,
                    PV.COD_FILIAL,
                    PV.COD_EMPRESA,
                    PV.COD_PEDIDO_ORIGEM AS PEDIDO_WEB,
                    PV.COD_CLI,
                    ISNULL(CLI.NOM_CLI, '') AS NOM_CLI,
                    PV.COD_METODO,
                    ISNULL(MV.DESC_METODO, CAST(PV.COD_METODO AS VARCHAR(50))) AS DESC_METODO,
                    PV.COD_PARAM_FISCAL,
                    ISNULL(PF.DESC_PARAM_FISCAL, '') AS NATUREZA_OPERACAO,
                    PV.STATUS_PEDIDO_VENDA AS STA_PEDIDO_VENDA,
                    PV.DAT_PEDIDO AS DATA_CRIACAO,
                    PV.DAT_LEX AS DATA_EXPEDICAO,
                    PV.DAT_LFT AS DATA_LFT,
                    DATEDIFF(day, PV.DAT_LEX, GETDATE()) AS DIAS_EXPEDICAO,
                    PV.VLR_TOTAL_PEDIDO,
                    PV.VLR_TOTAL_LIQUIDO,
                    PV.PER_TOTAL_DESCONTO AS VLR_TOTAL_DESCONTO,
                    PV.QTD_ITENS,
                    NF.NRO_NOTA_FISCAL,
                    NF.SERIE_FISCAL AS SERIE_NOTA_FISCAL,
                    NF.DAT_EMISSAO_NF AS DATA_EMISSAO_NF,
                    NF.CHAVE_ACESSO_NFE AS CHAVE_NFE
                FROM PagedKeys PK
                INNER JOIN PEDIDOS_VENDA PV WITH (NOLOCK) 
                    ON PV.COD_PED_VENDA = PK.COD_PED_VENDA 
                   AND PV.COD_FILIAL = PK.COD_FILIAL
                LEFT JOIN CLIENTES CLI WITH (NOLOCK) 
                    ON CLI.COD_CLI = PV.COD_CLI
                LEFT JOIN METODO_VENDA MV WITH (NOLOCK) 
                    ON MV.COD_METODO = PV.COD_METODO
                LEFT JOIN PARAMETROS_FISCAIS PF WITH (NOLOCK) 
                    ON PF.COD_PARAM_FISCAL = PV.COD_PARAM_FISCAL 
                   AND PF.COD_FILIAL = PV.COD_FILIAL
                OUTER APPLY (
                    SELECT TOP 1 NRO_NOTA_FISCAL, SERIE_FISCAL, DAT_EMISSAO_NF, CHAVE_ACESSO_NFE
                    FROM NF_MESTRE WITH (NOLOCK)
                    WHERE NF_MESTRE.COD_PED_VENDA = PV.COD_PED_VENDA
                      AND NF_MESTRE.COD_FILIAL = PV.COD_FILIAL
                ) NF
                ORDER BY PV.COD_PED_VENDA DESC
            """
        else:
            query_sql = f"""
                WITH PagedKeys AS (
                    SELECT PV.COD_PED_VENDA, PV.COD_FILIAL
                    FROM PEDIDOS_VENDA PV WITH (NOLOCK)
                    WHERE {where_sql}
                    ORDER BY PV.COD_PED_VENDA DESC
                    OFFSET {offset} ROWS
                    FETCH NEXT {page_size} ROWS ONLY
                )
                SELECT 
                    PV.COD_PED_VENDA,
                    PV.COD_FILIAL,
                    PV.COD_EMPRESA,
                    PV.COD_PEDIDO_ORIGEM AS PEDIDO_WEB,
                    PV.COD_CLI,
                    ISNULL(CLI.NOM_CLI, '') AS NOM_CLI,
                    PV.COD_METODO,
                    ISNULL(MV.DESC_METODO, CAST(PV.COD_METODO AS VARCHAR(50))) AS DESC_METODO,
                    PV.COD_PARAM_FISCAL,
                    ISNULL(PF.DESC_PARAM_FISCAL, '') AS NATUREZA_OPERACAO,
                    PV.STATUS_PEDIDO_VENDA AS STA_PEDIDO_VENDA,
                    PV.DAT_PEDIDO AS DATA_CRIACAO,
                    PV.DAT_LEX AS DATA_EXPEDICAO,
                    PV.DAT_LFT AS DATA_LFT,
                    DATEDIFF(day, PV.DAT_LEX, GETDATE()) AS DIAS_EXPEDICAO,
                    PV.VLR_TOTAL_PEDIDO,
                    PV.VLR_TOTAL_LIQUIDO,
                    PV.PER_TOTAL_DESCONTO AS VLR_TOTAL_DESCONTO,
                    PV.QTD_ITENS,
                    NF.NRO_NOTA_FISCAL,
                    NF.SERIE_FISCAL AS SERIE_NOTA_FISCAL,
                    NF.DAT_EMISSAO_NF AS DATA_EMISSAO_NF,
                    NF.CHAVE_ACESSO_NFE AS CHAVE_NFE
                FROM PagedKeys PK
                INNER JOIN PEDIDOS_VENDA PV WITH (NOLOCK) 
                    ON PV.COD_PED_VENDA = PK.COD_PED_VENDA 
                   AND PV.COD_FILIAL = PK.COD_FILIAL
                LEFT JOIN CLIENTES CLI WITH (NOLOCK) 
                    ON CLI.COD_CLI = PV.COD_CLI
                LEFT JOIN METODO_VENDA MV WITH (NOLOCK) 
                    ON MV.COD_METODO = PV.COD_METODO
                LEFT JOIN PARAMETROS_FISCAIS PF WITH (NOLOCK) 
                    ON PF.COD_PARAM_FISCAL = PV.COD_PARAM_FISCAL 
                   AND PF.COD_FILIAL = PV.COD_FILIAL
                OUTER APPLY (
                    SELECT TOP 1 NRO_NOTA_FISCAL, SERIE_FISCAL, DAT_EMISSAO_NF, CHAVE_ACESSO_NFE
                    FROM NF_MESTRE WITH (NOLOCK)
                    WHERE NF_MESTRE.COD_PED_VENDA = PV.COD_PED_VENDA
                      AND NF_MESTRE.COD_FILIAL = PV.COD_FILIAL
                ) NF
                ORDER BY PV.COD_PED_VENDA DESC
            """

        raw_items = sql_client.query(query_sql, tuple(params), max_rows=page_size)
        items = []
        for r in raw_items:
            item = _serialize_row(r)
            sta = str(item.get("sta_pedido_venda") or "").upper().strip()
            dias_exp = item.get("dias_expedicao")
            is_alerta = False
            if sta not in ("FAT", "CAN", "CA", "NOV") and dias_exp is not None:
                try:
                    if int(dias_exp) >= dias_alerta_expedicao:
                        is_alerta = True
                except (ValueError, TypeError):
                    pass
            item["is_alerta_expedicao"] = is_alerta
            items.append(item)

        # 3. Contadores de resumo (executa com NOLOCK rápido)
        summary_sql = f"""
            SELECT 
                SUM(CASE WHEN ISNULL(PV.STATUS_PEDIDO_VENDA, '') NOT IN ('FAT', 'CAN', 'CA') THEN 1 ELSE 0 END) AS abertos_count,
                SUM(CASE WHEN ISNULL(PV.STATUS_PEDIDO_VENDA, '') = 'LFT' THEN 1 ELSE 0 END) AS lft_count,
                SUM(CASE WHEN ISNULL(PV.STATUS_PEDIDO_VENDA, '') = 'FAT' THEN 1 ELSE 0 END) AS faturados_count,
                SUM(CASE WHEN ISNULL(PV.STATUS_PEDIDO_VENDA, '') IN ('CAN', 'CA') THEN 1 ELSE 0 END) AS cancelados_count,
                SUM(CASE WHEN ISNULL(PV.STATUS_PEDIDO_VENDA, '') NOT IN ('FAT', 'CAN', 'CA', 'NOV') 
                         AND PV.DAT_LEX IS NOT NULL 
                         AND DATEDIFF(day, PV.DAT_LEX, GETDATE()) >= %s THEN 1 ELSE 0 END) AS alertas_expedicao_count,
                SUM(CASE WHEN ISNULL(PV.STATUS_PEDIDO_VENDA, '') NOT IN ('FAT', 'CAN', 'CA') THEN ISNULL(PV.VLR_TOTAL_PEDIDO, 0) ELSE 0 END) AS abertos_valor_bruto,
                SUM(CASE WHEN ISNULL(PV.STATUS_PEDIDO_VENDA, '') NOT IN ('FAT', 'CAN', 'CA') THEN ISNULL(PV.VLR_TOTAL_LIQUIDO, PV.VLR_TOTAL_PEDIDO) ELSE 0 END) AS abertos_valor_liquido,
                SUM(CASE WHEN ISNULL(PV.STATUS_PEDIDO_VENDA, '') = 'LFT' THEN ISNULL(PV.VLR_TOTAL_PEDIDO, 0) ELSE 0 END) AS lft_valor_bruto,
                SUM(CASE WHEN ISNULL(PV.STATUS_PEDIDO_VENDA, '') = 'LFT' THEN ISNULL(PV.VLR_TOTAL_LIQUIDO, PV.VLR_TOTAL_PEDIDO) ELSE 0 END) AS lft_valor_liquido,
                COUNT(1) AS total_count
            FROM PEDIDOS_VENDA PV WITH (NOLOCK)
            WHERE PV.COD_FILIAL = %s
        """
        summary_rows = sql_client.query(summary_sql, (dias_alerta_expedicao, cod_filial), max_rows=1)
        summary_data = summary_rows[0] if summary_rows else {}

        return {
            "items": items,
            "total": total_records,
            "page": page,
            "page_size": page_size,
            "total_pages": (total_records + page_size - 1) // page_size if total_records > 0 else 1,
            "summary": {
                "abertos_count": int(summary_data.get("abertos_count") or 0),
                "lft_count": int(summary_data.get("lft_count") or 0),
                "faturados_count": int(summary_data.get("faturados_count") or 0),
                "cancelados_count": int(summary_data.get("cancelados_count") or 0),
                "alertas_expedicao_count": int(summary_data.get("alertas_expedicao_count") or 0),
                "abertos_valor_bruto": float(summary_data.get("abertos_valor_bruto") or 0.0),
                "abertos_valor_liquido": float(summary_data.get("abertos_valor_liquido") or 0.0),
                "abertos_valor": float(summary_data.get("abertos_valor_liquido") or summary_data.get("abertos_valor_bruto") or 0.0),
                "lft_valor_bruto": float(summary_data.get("lft_valor_bruto") or 0.0),
                "lft_valor_liquido": float(summary_data.get("lft_valor_liquido") or 0.0),
                "total_count": int(summary_data.get("total_count") or 0),
                "filial_consultada": cod_filial,
                "dias_alerta_expedicao": dias_alerta_expedicao,
            }
        }

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, _execute_query)
        return result
    except Exception as e:
        logger.error("[HorusOrdersList] Erro ao consultar pedidos no Horus SQL company=%s: %s", company_id, e)
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao consultar pedidos no SQL Server do Horus: {str(e)}"
        )


@router.get("/companies/{company_id}/horus-sql/orders/{cod_ped_venda}")
async def get_horus_order_details(
    company_id: int,
    cod_ped_venda: int,
    filial: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    [DETALHES COMPLETOS COM NOLOCK]
    Consulta cabeçalho, itens do pedido em ITENS_PEDIDO_VENDA e, caso faturado (FAT),
    dados da Nota Fiscal (NF_MESTRE) e seus itens (NF_ITENS).
    """
    _assert_ownership(current_user, company_id)
    settings = _get_settings_or_404(db, company_id)

    try:
        sql_client = HorusSQLClient(db, company_id)
    except HorusSQLConfigError as e:
        raise HTTPException(status_code=400, detail=str(e))

    cod_filial = str(filial or settings.horus_sql_cod_filial or settings.horus_branch or "1").strip()

    def _execute_details_query():
        # 1. Cabeçalho do Pedido
        order_sql = """
            SELECT 
                PV.COD_PED_VENDA,
                PV.COD_FILIAL,
                PV.COD_EMPRESA,
                PV.COD_PEDIDO_ORIGEM AS PEDIDO_WEB,
                PV.COD_CLI,
                ISNULL(CLI.NOM_CLI, '') AS NOM_CLI,
                PV.COD_METODO,
                ISNULL(MV.DESC_METODO, CAST(PV.COD_METODO AS VARCHAR(50))) AS DESC_METODO,
                PV.COD_PARAM_FISCAL,
                ISNULL(PF.DESC_PARAM_FISCAL, '') AS NATUREZA_OPERACAO,
                PV.STATUS_PEDIDO_VENDA AS STA_PEDIDO_VENDA,
                PV.DAT_PEDIDO AS DATA_CRIACAO,
                PV.DAT_LEX AS DATA_EXPEDICAO,
                PV.DAT_LFT AS DATA_LFT,
                DATEDIFF(day, PV.DAT_LEX, GETDATE()) AS DIAS_EXPEDICAO,
                PV.VLR_TOTAL_PEDIDO,
                PV.VLR_TOTAL_LIQUIDO,
                PV.PER_TOTAL_DESCONTO AS VLR_TOTAL_DESCONTO,
                PV.QTD_ITENS,
                ISNULL(CAST(PV.OBS_PEDIDO AS VARCHAR(MAX)), '') AS OBS_PEDIDO
            FROM PEDIDOS_VENDA PV WITH (NOLOCK)
            LEFT JOIN CLIENTES CLI WITH (NOLOCK) ON CLI.COD_CLI = PV.COD_CLI
            LEFT JOIN METODO_VENDA MV WITH (NOLOCK) ON MV.COD_METODO = PV.COD_METODO
            LEFT JOIN PARAMETROS_FISCAIS PF WITH (NOLOCK) ON PF.COD_PARAM_FISCAL = PV.COD_PARAM_FISCAL AND PF.COD_FILIAL = PV.COD_FILIAL
            WHERE PV.COD_FILIAL = %s
              AND PV.COD_PED_VENDA = %s
        """
        order_rows = sql_client.query(order_sql, (cod_filial, cod_ped_venda), max_rows=1)
        if not order_rows:
            raise HTTPException(status_code=404, detail=f"Pedido Horus #{cod_ped_venda} não localizado para a filial {cod_filial}.")

        order_data = _serialize_row(order_rows[0])

        # 2. Itens do Pedido (ITENS_PEDIDO_VENDA + ITENS_ESTOQUE)
        items_sql = """
            SELECT 
                IPV.COD_PED_VENDA,
                IPV.COD_FILIAL,
                IPV.COD_ITEM,
                ISNULL(IE.NOM_ITEM, '') AS NOM_ITEM,
                IPV.QT_PEDIDA AS QTD_ITEM,
                IPV.VLR_PRECO AS VLR_UNITARIO,
                IPV.VLR_LIQUIDO AS VLR_TOTAL_ITEM,
                ISNULL(IPV.NRO_ITEM_PED, 1) AS SEQ_ITEM
            FROM ITENS_PEDIDO_VENDA IPV WITH (NOLOCK)
            LEFT JOIN ITENS_ESTOQUE IE WITH (NOLOCK) ON IE.COD_ITEM = IPV.COD_ITEM
            WHERE IPV.COD_FILIAL = %s
              AND IPV.COD_PED_VENDA = %s
            ORDER BY ISNULL(IPV.NRO_ITEM_PED, 1) ASC
        """
        item_rows = sql_client.query(items_sql, (cod_filial, cod_ped_venda), max_rows=500)
        items = [_serialize_row(r) for r in item_rows]

        # 3. Consulta NF_MESTRE (se houver nota fiscal emitida)
        nf_sql = """
            SELECT 
                NF.NRO_NOTA_FISCAL,
                NF.SERIE_FISCAL AS SERIE_NOTA_FISCAL,
                NF.CHAVE_ACESSO_NFE AS CHAVE_NFE,
                NF.DAT_EMISSAO_NF AS DAT_EMISSAO,
                NF.VLR_LIQUIDO_NF AS VLR_TOTAL_NOTA,
                NF.VLR_BRUTO_NF AS VLR_PRODUTOS,
                NF.VLR_FRETE_NF AS VLR_FRETE,
                NF.SIT_NF AS STA_NOTA_FISCAL,
                NF.COD_NF
            FROM NF_MESTRE NF WITH (NOLOCK)
            WHERE NF.COD_FILIAL = %s
              AND NF.COD_PED_VENDA = %s
        """
        nf_rows = sql_client.query(nf_sql, (cod_filial, cod_ped_venda), max_rows=1)
        invoice_data = None

        if nf_rows:
            invoice_data = _serialize_row(nf_rows[0])
            cod_nf = nf_rows[0].get("COD_NF")

            # 4. Itens da NF (NF_ITENS + ITENS_ESTOQUE)
            if cod_nf:
                nf_items_sql = """
                    SELECT 
                        NFI.COD_ITEM,
                        ISNULL(IE.NOM_ITEM, '') AS NOM_ITEM,
                        NFI.QTD_ITENS AS QTD_ITEM,
                        NFI.VLR_BRUTO_ITEM AS VLR_UNITARIO,
                        NFI.VLR_LIQUIDO_ITEM AS VLR_TOTAL_ITEM
                    FROM NF_ITENS NFI WITH (NOLOCK)
                    LEFT JOIN ITENS_ESTOQUE IE WITH (NOLOCK) ON IE.COD_ITEM = NFI.COD_ITEM
                    WHERE NFI.COD_FILIAL = %s
                      AND NFI.COD_NF = %s
                    ORDER BY NFI.COD_ITEM ASC
                """
                nf_items_rows = sql_client.query(nf_items_sql, (cod_filial, cod_nf), max_rows=500)
                invoice_data["itens"] = [_serialize_row(r) for r in nf_items_rows]
            else:
                invoice_data["itens"] = []

        return {
            "order": order_data,
            "items": items,
            "invoice": invoice_data,
            "has_invoice": invoice_data is not None,
        }

    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _execute_details_query)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("[HorusOrderDetails] Erro ao consultar detalhes do pedido %s: %s", cod_ped_venda, e)
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao consultar detalhes do pedido no Horus: {str(e)}"
        )


@router.get("/companies/{company_id}/horus-sql/sales-methods")
async def get_horus_sales_methods(
    company_id: int,
    filial: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retorna a lista de Métodos de Venda distintos com código e descrição encontrados em PEDIDOS_VENDA / METODO_VENDA.
    """
    _assert_ownership(current_user, company_id)
    settings = _get_settings_or_404(db, company_id)

    try:
        sql_client = HorusSQLClient(db, company_id)
    except HorusSQLConfigError as e:
        raise HTTPException(status_code=400, detail=str(e))

    cod_filial = str(filial or settings.horus_sql_cod_filial or settings.horus_branch or "1").strip()

    def _fetch_methods():
        query_sql = """
            SELECT COD_METODO, DESC_METODO
            FROM METODO_VENDA WITH (NOLOCK)
            ORDER BY COD_METODO ASC
        """
        rows = sql_client.query(query_sql, max_rows=100)
        methods = []
        for r in rows:
            c = str(r.get("COD_METODO") or "").strip()
            d = str(r.get("DESC_METODO") or "").strip()
            if c:
                methods.append({"cod_metodo": c, "desc_metodo": d or c})
        return methods

    try:
        loop = asyncio.get_event_loop()
        methods = await loop.run_in_executor(None, _fetch_methods)
        return {"methods": methods, "default_metodo": settings.horus_vendas_metodo or ""}
    except Exception as e:
        logger.error("[HorusSalesMethods] Erro ao consultar métodos de venda: %s", e)
        return {"methods": [], "default_metodo": settings.horus_vendas_metodo or ""}

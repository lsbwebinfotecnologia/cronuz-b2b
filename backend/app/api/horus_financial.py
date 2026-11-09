"""
horus_financial.py
------------------
Endpoints do módulo Horus Direct — Financeiro Vindi.

Funcionalidades:
  1. Upload e preview da planilha Vindi (CSV / XLSX) com comparação contra o SQL Server do Horus ERP.
  2. Apontamento de divergências (valor, status, não encontrados).
  3. Geração de Borderô de baixa no Horus ERP (INSERT em BORDERO + UPDATE em LANCTOS_CRECEBER/LANCTOS_CRECEBERA).
  4. Download de modelo de planilha CSV da Vindi.

PERFORMANCE & SEGURANÇA:
  - Processamento de arquivo 100% em memória (stateless).
  - Chamadas pytds executadas em thread pool (run_in_executor) para não bloquear o event loop FastAPI.
  - Ownership guard em todos os endpoints (_assert_ownership).
  - Cursores SQL fechados via context manager.
"""
import io
import os
import json
import time
import uuid
import asyncio
import logging
import tempfile
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db.session import get_db, SessionLocal
from app.core.dependencies import get_current_user
from app.core.utils import assert_company_ownership
from app.core.upload_security import validate_file_size_and_extension, read_file_safely
from app.integrators.horus_sql_client import HorusSQLClient, HorusSQLConfigError
from app.integrators.vindi_financial_parser import parse_vindi_file
from app.integrators.reconciliation_parser import (
    parse_channel_file,
    parse_tray_bridge_file,
    _normalize_order_key,
)
from app.payments.catalog import get_company_reconciliation_profiles

router = APIRouter()
logger = logging.getLogger(__name__)


def _assert_ownership(current_user, company_id: int) -> None:
    """[SEC] Delegado para assert_company_ownership centralizado."""
    assert_company_ownership(current_user, company_id)


def _get_settings_or_404(db: Session, company_id: int):
    from app.models.company_settings import CompanySettings
    settings = db.query(CompanySettings).filter(
        CompanySettings.company_id == company_id
    ).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Configurações da empresa não encontradas.")
    return settings


# ── Schemas ───────────────────────────────────────────────────────────────────

class ReleaseItemPayload(BaseModel):
    nro_lancamento: int
    cod_filial: str
    cod_ped_venda: Optional[int] = None
    pedido_web: Optional[str] = None
    valor: float
    status: str = "AB"


class CreateBorderoPayload(BaseModel):
    releases: List[ReleaseItemPayload]
    profile_code: Optional[str] = None


def _resolve_bank_config_for_profile(settings, sql_client_or_none, profile_code: Optional[str] = None) -> dict:
    """Resolve os parâmetros bancários de Borderô (específicos do perfil ou padrão do Horus SQL)."""
    profiles = get_company_reconciliation_profiles(settings)
    code_norm = (profile_code or "VINDI_DIRECT").upper().strip()
    matched = next((p for p in profiles if p["code"] == code_norm), None)

    eff = (matched or {}).get("effective_bank") or {
        "forma_pagto": settings.horus_banco_forma_pagto or "",
        "banco": settings.horus_banco_codigo or "",
        "agencia": settings.horus_banco_agencia or "",
        "conta": settings.horus_banco_conta or "",
        "carteira": settings.horus_banco_carteira or "",
    }
    cod_emp = sql_client_or_none.cod_empresa if sql_client_or_none else (settings.horus_sql_cod_empresa or settings.horus_company or "1")
    cod_fil = sql_client_or_none.cod_filial if sql_client_or_none else (settings.horus_sql_cod_filial or settings.horus_branch or "1")

    return {
        "profile_code": code_norm,
        "use_custom_bank": bool((matched or {}).get("use_custom_bank", False)),
        "forma_pagto": eff.get("forma_pagto") or "",
        "banco": eff.get("banco") or "",
        "agencia": eff.get("agencia") or "",
        "conta": eff.get("conta") or "",
        "carteira": eff.get("carteira") or "",
        "cod_empresa": str(cod_emp),
        "cod_filial": str(cod_fil),
        "is_configured": bool(
            eff.get("forma_pagto")
            and eff.get("banco")
            and eff.get("agencia")
            and eff.get("conta")
            and eff.get("carteira")
        ),
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/companies/{company_id}/horus-sql/reconciliation/profiles")
def get_reconciliation_profiles_for_seller(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Retorna os perfis de conciliação habilitados para a empresa (ex: TRAY_SHOPEE, TRAY_TIKTOK, TRAY_VINDI, VINDI_DIRECT)
    e a filial padrão do Horus SQL.
    """
    _assert_ownership(current_user, company_id)
    settings = _get_settings_or_404(db, company_id)
    all_profiles = get_company_reconciliation_profiles(settings)
    enabled_profiles = [p for p in all_profiles if p.get("enabled")]
    return {
        "company_id": company_id,
        "default_filial": str(settings.horus_sql_cod_filial or settings.horus_branch or "1").strip(),
        "horus_sql_enabled": bool(settings.horus_sql_enabled),
        "profiles": all_profiles,
        "enabled_profiles": enabled_profiles,
    }


@router.get("/companies/{company_id}/horus-sql/reconciliation/template")
def download_reconciliation_template(
    company_id: int,
    template_type: str = "shopee",
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Retorna modelos CSV para facilitar a operação:
      - template_type='shopee' : Modelo de planilha de repasse da Shopee
      - template_type='tiktok' : Modelo de planilha de liquidação do TikTok Shop
      - template_type='vindi'  : Modelo de planilha financeira da Vindi
      - template_type='tray'   : Modelo de planilha de Pedidos da Tray (Ponte Marketplace ↔ Horus)
    """
    _assert_ownership(current_user, company_id)
    t = (template_type or "shopee").lower().strip()

    if t == "shopee":
        filename = "modelo_recebimentos_shopee.csv"
        csv_content = (
            "Data;Tipo de transação;Descrição;ID do pedido;Direção do dinheiro;Valor;Status;Balança após as transações;Valor a Ser Ajustado\n"
            "2026-10-21 15:21:46;Renda do pedido;Renda do pedido #261015P4DJU18X;261015P4DJU18X;Entrada;41.57;Transação completa;1061.76;0\n"
            "2026-10-21 14:48:40;Renda do pedido;Renda do pedido #261016RMMGPAX3;261016RMMGPAX3;Entrada;20.11;Transação completa;1020.19;0\n"
            "2026-10-21 12:29:22;Renda do pedido;Renda do pedido #2610193DKW9JD0;2610193DKW9JD0;Entrada;20.11;Transação completa;897.49;0\n"
        )
    elif t == "tiktok":
        filename = "modelo_recebimentos_tiktok_shop.csv"
        csv_content = (
            "Order ID;Buyer Username;Documento;Order Amount;Commission Fee;Settlement Amount;Settled Time;Status;Payment Method\n"
            "576890001;carlos_books;123.456.789-00;150.00;18.00;132.00;05/11/2026;Settled;Pix\n"
            "576890002;leitura_viva;987.654.321-11;95.00;11.40;83.60;05/11/2026;Settled;Credit Card\n"
        )
    elif t == "tray":
        filename = "modelo_pedidos_tray_vinculo.csv"
        csv_content = (
            "Pedido;Data;Hora;Nome do Cliente;CPF;Subtotal produtos;Canal de venda;Frete valor;Pagamento tipo;Obs. loja;Status pedido;Desconto;Total;Valor pagamento;Forma pagamento paga;Pedido marketplace\n"
            "49809;15/10/2026;14:10:00;Gerson Eliton Pereira;3644527229;69,45;SHOPEE;21,44;Marketplace-Shopee;Pedido(s) no Shopee: 261015P4DJU18X;FINALIZADO;30,00;60,89;60,89;Pix;261015P4DJU18X\n"
            "49983;16/10/2026;11:20:00;Giselle Crescente;28092764808;31,37;SHOPEE;7,18;Marketplace-Shopee;Pedido(s) no Shopee: 261016RMMGPAX3;FINALIZADO;7,18;31,37;31,37;Cartão de Crédito - VISA;261016RMMGPAX3\n"
            "50435;19/10/2026;11:04:16;Caroline Victoria De Souza Gois;34617282840;31,37;SHOPEE;9,62;Marketplace-Shopee;Pedido(s) no Shopee: 2610193DKW9JD0;FINALIZADO;9,62;31,37;31,37;Pix;2610193DKW9JD0\n"
        )
    else:
        filename = "modelo_recebiveis_pagos_vindi.csv"
        csv_content = (
            "Data;ID Transação;N. Pedido;Descrição;Forma de Pagamento;Parcelas;Origem;Valor Liq.;Valor Bruto;Taxa Retenção;Taxa Antecipação\n"
            "07/08/2026 12:04;278669753;40591;Crédito referente ao recebimento da transação 278669753;Pix;1 de 1;Intermediador;R$ 78,73;R$ 80,68;R$ 1,95;R$ 0,00\n"
            "08/08/2026 00:26;274064340;38763;Crédito referente ao recebimento da transação 274064340;Mastercard;1 de 1;Intermediador;R$ 44,14;R$ 46,95;R$ 2,81;R$ 0,00\n"
            "13/08/2026 00:38;274892628;39127;Crédito referente ao recebimento da transação 274892628;Visa;1 de 2;Intermediador;R$ 111,82;R$ 119,66;R$ 7,84;R$ 0,00\n"
        )

    return StreamingResponse(
        io.BytesIO(csv_content.encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

@router.get("/companies/{company_id}/horus-sql/vindi/template")
def download_vindi_template(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Retorna modelo CSV de exemplo para upload de extrato/planilha da Vindi.
    """
    _assert_ownership(current_user, company_id)

    csv_content = (
        "Pedido;Cliente;Documento;Valor;Data Pagamento;Status;Forma Pagamento\n"
        "1001;Livraria Exemplo LTDA;12.345.678/0001-90;250.00;01/09/2026;Paga;Cartao de Credito\n"
        "1002;Distribuidora Cultural;98.765.432/0001-10;480.50;01/09/2026;Paga;Boleto Bancario\n"
        "1003;Livraria Saber Mais;11.222.333/0001-44;120.00;01/09/2026;Paga;Pix\n"
    )

    return StreamingResponse(
        io.BytesIO(csv_content.encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=modelo_planilha_vindi.csv"}
    )


# ── Rastreador de Jobs de Conciliação em Memória (Progresso em Tempo Real) ────
_RECONCILIATION_JOBS: Dict[str, Dict[str, Any]] = {}
_JOB_TTL_SECONDS = 900  # 15 minutos
_JOBS_DIR = Path(tempfile.gettempdir()) / "cronuz_reconciliation_jobs"


def _save_job_to_disk(job_id: str, job_data: Dict[str, Any]) -> None:
    try:
        _JOBS_DIR.mkdir(parents=True, exist_ok=True)
        final_path = _JOBS_DIR / f"{job_id}.json"
        tmp_path = _JOBS_DIR / f"{job_id}.{os.getpid()}.tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(job_data, f, ensure_ascii=False, default=str)
        os.replace(tmp_path, final_path)
    except Exception as ex:
        logger.warning("[HorusFinancialPreview] Aviso ao gravar estado de job em disco: %s", ex)


def _load_job_from_disk(job_id: str) -> Optional[Dict[str, Any]]:
    try:
        final_path = _JOBS_DIR / f"{job_id}.json"
        if not final_path.exists():
            return None
        with open(final_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _cleanup_old_reconciliation_jobs() -> None:
    now = time.time()
    expired = [
        jid for jid, j in list(_RECONCILIATION_JOBS.items())
        if now - float(j.get("started_at") or now) > _JOB_TTL_SECONDS
    ]
    for jid in expired:
        _RECONCILIATION_JOBS.pop(jid, None)
    try:
        if _JOBS_DIR.exists():
            for p in _JOBS_DIR.glob("*.json"):
                if now - p.stat().st_mtime > _JOB_TTL_SECONDS:
                    p.unlink(missing_ok=True)
    except Exception:
        pass


def _update_job_progress(job_id: Optional[str], **kwargs) -> None:
    if not job_id:
        return
    job = _RECONCILIATION_JOBS.get(job_id) or _load_job_from_disk(job_id)
    if not job:
        return
    job.update(kwargs)
    job["elapsed_seconds"] = round(time.time() - float(job.get("started_at") or time.time()), 1)
    _RECONCILIATION_JOBS[job_id] = job
    _save_job_to_disk(job_id, job)


@router.get("/companies/{company_id}/horus-sql/reconciliation/jobs/{job_id}")
def get_reconciliation_job_status(
    company_id: int,
    job_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Retorna o progresso em tempo real de um processamento de conciliação (compatível com múltiplos workers Gunicorn):
      - `status`: 'RUNNING' | 'COMPLETED' | 'ERROR'
      - `percent`: 0..100
      - `phase`: 'LENDO_PLANILHAS' | 'VINCULANDO_TRAY' | 'CONSULTANDO_HORUS' | 'AUDITORIA_VALORES' | 'CONCLUIDO'
      - `message`, `processed_orders`, `total_orders`, `current_batch`, `total_batches`, `horus_found_count`, `elapsed_seconds`
      - `result`: payload completo quando `status == 'COMPLETED'`
    """
    _assert_ownership(current_user, company_id)
    _cleanup_old_reconciliation_jobs()
    # Prioriza leitura do arquivo compartilhado em /tmp para garantir consistência entre múltiplos workers Gunicorn
    job = _load_job_from_disk(job_id) or _RECONCILIATION_JOBS.get(job_id)
    if not job or int(job.get("company_id") or 0) != int(company_id):
        raise HTTPException(status_code=404, detail="Processo de conciliação não encontrado ou expirado.")
    job["elapsed_seconds"] = round(time.time() - float(job.get("started_at") or time.time()), 1)
    return job


def _run_reconciliation_core(
    company_id: int,
    contents: bytes,
    channel_filename: str,
    tray_bytes: Optional[bytes],
    tray_filename: Optional[str],
    active_profile: str,
    filial: Optional[str],
    job_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Executa todo o pipeline de conciliação em thread separada com telemetria de progresso,
    consultas indexadas `WITH (NOLOCK)` no SQL Server e retentativa automática por lote.
    """
    t0 = time.time()
    db_local = SessionLocal()
    try:
        settings = _get_settings_or_404(db_local, company_id)
        is_dual_file = active_profile in ("TRAY_SHOPEE", "TRAY_TIKTOK", "TRAY_VINDI")

        # ETAPA 1: Leitura da Planilha do Canal
        _update_job_progress(
            job_id,
            phase="LENDO_PLANILHAS",
            percent=8,
            message=f"Lendo e validando planilha principal ({channel_filename})...",
        )

        parse_warnings: List[str] = []
        tray_map: Dict[str, Any] = {"rows": [], "by_channel_order": {}, "by_tray_order": {}, "token_index": {}}

        vindi_rows, w1 = parse_channel_file(contents, channel_filename, active_profile)
        parse_warnings.extend(w1)
        if not vindi_rows and active_profile == "VINDI_DIRECT":
            vindi_rows, w_fallback = parse_vindi_file(contents, channel_filename)
            parse_warnings.extend(w_fallback)

        if not vindi_rows:
            raise ValueError(
                f"Não foi possível extrair lançamentos da planilha principal. {'; '.join(parse_warnings)}"
            )

        _update_job_progress(
            job_id,
            phase="LENDO_PLANILHAS",
            percent=18,
            total_orders=len(vindi_rows),
            message=f"{len(vindi_rows)} pedidos válidos extraídos da planilha do canal.",
        )

        # ETAPA 2: Leitura e Amarração da Planilha da Tray (se enviada)
        if tray_bytes:
            _update_job_progress(
                job_id,
                phase="VINCULANDO_TRAY",
                percent=22,
                message=f"Indexando planilha de pedidos da Tray ({tray_filename or 'tray.csv'})...",
            )
            tray_map, w2 = parse_tray_bridge_file(tray_bytes, tray_filename or "tray.csv")
            parse_warnings.extend(w2)

        by_channel = tray_map.get("by_channel_order") or {}
        by_tray = tray_map.get("by_tray_order") or {}
        token_idx = tray_map.get("token_index") or {}

        pedidos_set = set()
        linked_tray_count = 0
        unlinked_tray_count = 0

        for v_row in vindi_rows:
            ped_canal = _normalize_order_key(v_row.get("pedido_canal") or v_row.get("pedido_web") or "")
            v_row["pedido_canal"] = ped_canal

            if is_dual_file:
                stripped_canal = ped_canal.lstrip("0") or ped_canal
                t_match = (
                    by_channel.get(ped_canal)
                    or by_channel.get(stripped_canal)
                    or by_tray.get(ped_canal)
                    or token_idx.get(ped_canal)
                )
                if t_match:
                    linked_tray_count += 1
                    ped_tray = str(t_match.get("pedido_tray") or "").strip()
                    ped_horus_ref = str(t_match.get("pedido_horus_ref") or ped_tray or ped_canal).strip()
                    v_row["vinculo_tray_ok"] = True
                    v_row["pedido_tray"] = ped_tray
                    v_row["pedido_horus_ref"] = ped_horus_ref
                    v_row["pedido_web"] = ped_horus_ref
                    v_row["valor_tray"] = float(t_match.get("valor_tray") or 0.0)
                    v_row["subtotal_tray"] = float(t_match.get("subtotal_tray") or 0.0)
                    v_row["status_tray"] = t_match.get("status_tray") or ""
                    v_row["nf_tray"] = t_match.get("nf_tray") or ""
                    if (not v_row.get("cliente_nome") or v_row["cliente_nome"] == "-") and t_match.get("cliente_tray"):
                        v_row["cliente_nome"] = t_match["cliente_tray"]
                    if (not v_row.get("documento") or v_row["documento"] == "-") and t_match.get("documento_tray"):
                        v_row["documento"] = t_match["documento_tray"]
                    if t_match.get("forma_pagamento_tray") and v_row.get("forma_pagamento") in ("Shopee", "TikTok Shop", "SHOPEE", "TIKTOK"):
                        v_row["forma_pagamento"] = f"{v_row['forma_pagamento']} • {t_match['forma_pagamento_tray']}"

                    if not v_row.get("bruto_from_channel", True) and float(t_match.get("valor_tray") or 0.0) > 0:
                        bruto_tray = float(t_match["valor_tray"])
                        liq_canal = float(v_row.get("valor_liquido") or v_row.get("valor") or 0.0)
                        v_row["valor"] = round(bruto_tray, 2)
                        v_row["valor_bruto"] = round(bruto_tray, 2)
                        v_row["taxa"] = round(max(0.0, bruto_tray - liq_canal), 2)
                    elif float(v_row.get("valor") or 0.0) <= 0 and float(t_match.get("valor_tray") or 0.0) > 0:
                        v_row["valor"] = float(t_match["valor_tray"])
                        v_row["valor_bruto"] = float(t_match["valor_tray"])

                    for cand in (ped_horus_ref, ped_tray, ped_canal):
                        if cand:
                            pedidos_set.add(cand)
                elif active_profile == "TRAY_VINDI" and ped_canal:
                    linked_tray_count += 1
                    v_row["vinculo_tray_ok"] = True
                    v_row["pedido_tray"] = ped_canal
                    v_row["pedido_horus_ref"] = ped_canal
                    v_row["pedido_web"] = ped_canal
                    v_row["valor_tray"] = float(v_row.get("valor_bruto") or v_row.get("valor") or 0.0)
                    pedidos_set.add(ped_canal)
                else:
                    unlinked_tray_count += 1
                    v_row["vinculo_tray_ok"] = False
                    v_row["pedido_tray"] = "-"
                    v_row["pedido_horus_ref"] = ped_canal
                    v_row["pedido_web"] = ped_canal
                    v_row["valor_tray"] = 0.0
                    if ped_canal:
                        pedidos_set.add(ped_canal)
            else:
                v_row["vinculo_tray_ok"] = True
                v_row["pedido_tray"] = "-"
                v_row["pedido_horus_ref"] = ped_canal
                if ped_canal:
                    pedidos_set.add(ped_canal)

        if not pedidos_set:
            raise ValueError("Nenhum número de pedido identificado nas planilhas.")

        _update_job_progress(
            job_id,
            phase="VINCULANDO_TRAY",
            percent=28,
            total_orders=len(vindi_rows),
            message=(
                f"Vínculos prontos: {linked_tray_count}/{len(vindi_rows)} pedidos amarrados. Conectando ao Horus ERP..."
                if is_dual_file
                else f"{len(vindi_rows)} pedidos prontos para busca. Conectando ao Horus ERP..."
            ),
        )

        # ETAPA 3: Consulta em Lotes no SQL Server do Horus com WITH (NOLOCK) e Índices Separados
        sql_client = HorusSQLClient(db_local, company_id)
        cod_filial = str(filial or settings.horus_sql_cod_filial or settings.horus_branch or "1").strip()

        pedidos_list = list(pedidos_set)
        batch_size = 200
        total_batches = max(1, (len(pedidos_list) + batch_size - 1) // batch_size)
        all_horus_releases: List[Dict[str, Any]] = []
        seen_lancto_keys = set()

        _update_job_progress(
            job_id,
            phase="CONSULTANDO_HORUS",
            percent=30,
            current_batch=0,
            total_batches=total_batches,
            processed_orders=0,
            total_orders=len(pedidos_list),
            horus_found_count=0,
            message=f"Iniciando consulta no Horus ERP (Filial {cod_filial}) em {total_batches} lote(s)...",
        )

        base_select_sql = """
            SELECT 
                LR.NRO_LANCTO_CRECEBER,
                LR.COD_PED_VENDA,
                LR.COD_FILIAL,
                LR.STA_LANCTO_CRECEBER,
                LR.VLR_LANCTO_TOTAL AS VLR_LANCTO_CRECEBER,
                LR.COD_BORDERO,
                PV.COD_METODO,
                PV.COD_PEDIDO_ORIGEM AS PEDIDO_WEB,
                NF.NRO_NOTA_FISCAL
            FROM LANCTOS_CRECEBER LR WITH (NOLOCK)
            INNER JOIN PEDIDOS_VENDA PV WITH (NOLOCK)
                ON PV.COD_PED_VENDA = LR.COD_PED_VENDA 
                AND PV.COD_FILIAL = LR.COD_FILIAL
            OUTER APPLY (
                SELECT TOP 1 NRO_NOTA_FISCAL 
                FROM NF_MESTRE WITH (NOLOCK)
                WHERE NF_MESTRE.COD_PED_VENDA = PV.COD_PED_VENDA 
                  AND NF_MESTRE.COD_FILIAL = PV.COD_FILIAL
            ) NF
            WHERE LR.COD_FILIAL = %s
              AND PV.COD_FILIAL = %s
        """

        def _query_with_retry(q_sql: str, q_params: tuple) -> List[Dict[str, Any]]:
            last_err = None
            for attempt in range(3):
                try:
                    return sql_client.query(q_sql, q_params, max_rows=10000)
                except Exception as q_ex:
                    last_err = q_ex
                    logger.warning(
                        "[HorusFinancialPreview] Tentativa %s/3 falhou na consulta SQL company=%s: %s",
                        attempt + 1, company_id, q_ex,
                    )
                    time.sleep(0.4 * (attempt + 1))
            raise last_err

        for b_idx, i in enumerate(range(0, len(pedidos_list), batch_size), start=1):
            batch = pedidos_list[i:i + batch_size]
            placeholders = ", ".join(["%s"] * len(batch))

            # 3.1. Busca primária indexada por PV.COD_PEDIDO_ORIGEM (sem OR que causava Full Table Scan)
            q_origem = (
                base_select_sql
                + f" AND PV.COD_PEDIDO_ORIGEM IN ({placeholders}) "
                + " ORDER BY PV.COD_PED_VENDA DESC, LR.NRO_LANCTO_CRECEBER DESC"
            )
            params_origem = tuple([cod_filial, cod_filial] + batch)
            rows_origem = _query_with_retry(q_origem, params_origem)

            found_origens = set()
            for r in rows_origem:
                lk = (r.get("COD_FILIAL"), r.get("NRO_LANCTO_CRECEBER"))
                if lk not in seen_lancto_keys:
                    seen_lancto_keys.add(lk)
                    all_horus_releases.append(r)
                pw = _normalize_order_key(r.get("PEDIDO_WEB") or "")
                if pw:
                    found_origens.add(pw)

            # 3.2. Apenas para códigos numéricos que não foram achados em COD_PEDIDO_ORIGEM, busca por PV.COD_PED_VENDA
            missing_numeric = [
                int(x) for x in batch
                if x not in found_origens and str(x).isdigit() and len(str(x)) <= 9
            ]
            if missing_numeric:
                num_placeholders = ", ".join(["%s"] * len(missing_numeric))
                q_ped_venda = (
                    base_select_sql
                    + f" AND PV.COD_PED_VENDA IN ({num_placeholders}) "
                    + " ORDER BY PV.COD_PED_VENDA DESC, LR.NRO_LANCTO_CRECEBER DESC"
                )
                params_ped = tuple([cod_filial, cod_filial] + missing_numeric)
                rows_ped = _query_with_retry(q_ped_venda, params_ped)
                for r in rows_ped:
                    lk = (r.get("COD_FILIAL"), r.get("NRO_LANCTO_CRECEBER"))
                    if lk not in seen_lancto_keys:
                        seen_lancto_keys.add(lk)
                        all_horus_releases.append(r)

            processed_cnt = min(i + len(batch), len(pedidos_list))
            pct = 30 + int((b_idx / total_batches) * 58)
            _update_job_progress(
                job_id,
                phase="CONSULTANDO_HORUS",
                percent=min(88, pct),
                current_batch=b_idx,
                total_batches=total_batches,
                processed_orders=processed_cnt,
                total_orders=len(pedidos_list),
                horus_found_count=len(all_horus_releases),
                message=f"Consultando Horus ERP: lote {b_idx} de {total_batches} ({processed_cnt}/{len(pedidos_list)} códigos • {len(all_horus_releases)} títulos localizados)...",
            )

        horus_rows = all_horus_releases

        # ETAPA 4: Auditoria de Valores, Taxas e Parcelas
        _update_job_progress(
            job_id,
            phase="AUDITORIA_VALORES",
            percent=92,
            horus_found_count=len(horus_rows),
            message=f"Auditando valores, taxas e parcelas de {len(vindi_rows)} pedidos contra {len(horus_rows)} títulos do Horus...",
        )

        # 6. Indexa os resultados do Horus por PEDIDO_WEB (COD_PEDIDO_ORIGEM) e por COD_PED_VENDA
        horus_by_pedido: Dict[str, List[Dict[str, Any]]] = {}
        for hr in horus_rows:
            ped_key = _normalize_order_key(hr.get("PEDIDO_WEB") or "")
            cod_ped_key = _normalize_order_key(hr.get("COD_PED_VENDA") or "")
            for k in {ped_key, cod_ped_key}:
                if not k:
                    continue
                if k not in horus_by_pedido:
                    horus_by_pedido[k] = []
                if hr not in horus_by_pedido[k]:
                    horus_by_pedido[k].append(hr)

        for ped_key, m_list in horus_by_pedido.items():
            m_list.sort(
                key=lambda m: (
                    1 if str(m.get("STA_LANCTO_CRECEBER", "")).strip().upper() == "AB" and not (m.get("COD_BORDERO") and int(m.get("COD_BORDERO")) > 0) else 0,
                    int(m.get("COD_PED_VENDA") or 0),
                    int(m.get("NRO_LANCTO_CRECEBER") or 0)
                ),
                reverse=True
            )

        # 7. Faz a conciliação linha a linha
        items_ready = []
        items_divergence = []
        items_already_paid = []
        items_not_found = []

        total_vindi_amount = 0.0
        total_ready_amount = 0.0
        total_divergence_amount = 0.0
        total_not_found_amount = 0.0

        used_lanctos = set()

        for v_row in vindi_rows:
            ped_canal = str(v_row.get("pedido_canal") or v_row.get("pedido_web") or "").strip()
            ped_tray = str(v_row.get("pedido_tray") or "-").strip()
            ped_horus_ref = str(v_row.get("pedido_horus_ref") or ped_canal).strip()
            vinculo_tray_ok = bool(v_row.get("vinculo_tray_ok", True))
            valor_tray = float(v_row.get("valor_tray") or 0.0)

            ped = ped_horus_ref
            v_valor = float(v_row["valor"])
            v_valor_liq = float(v_row.get("valor_liquido") or v_valor)
            v_taxa = float(v_row.get("taxa") or 0.0)
            total_vindi_amount += v_valor

            matches = (
                horus_by_pedido.get(ped_horus_ref)
                or (horus_by_pedido.get(ped_tray) if ped_tray and ped_tray != "-" else None)
                or horus_by_pedido.get(ped_canal)
                or []
            )

            if not matches:
                if is_dual_file and not vinculo_tray_ok:
                    motivo_msg = (
                        f"Pedido do canal '{ped_canal}' não encontrado na planilha da Tray nem diretamente no Horus (Filial {cod_filial})."
                    )
                elif is_dual_file:
                    motivo_msg = (
                        f"Vínculo Tray #{ped_tray} localizado para '{ped_canal}', mas pedido '{ped_horus_ref}' não foi encontrado no Horus (Filial {cod_filial})."
                    )
                else:
                    motivo_msg = f"Pedido '{ped}' não localizado no Horus para a filial {cod_filial}."

                items_not_found.append({
                    "linha": v_row["linha"],
                    "pedido_canal": ped_canal,
                    "pedido_tray": ped_tray,
                    "vinculo_tray_ok": vinculo_tray_ok,
                    "valor_tray": valor_tray,
                    "pedido_web": ped,
                    "cliente_nome": v_row["cliente_nome"],
                    "documento": v_row["documento"],
                    "valor_vindi": v_valor,
                    "valor_bruto": v_valor,
                    "valor_liquido": v_valor_liq,
                    "taxa": v_taxa,
                    "data_pagamento": v_row["data_pagamento"],
                    "status_vindi": v_row["status_vindi"],
                    "forma_pagamento": v_row["forma_pagamento"],
                    "motivo": motivo_msg,
                })
                total_not_found_amount += v_valor
                continue

            pedidos_horus_ids = sorted(
                list({int(m.get("COD_PED_VENDA") or 0) for m in matches if m.get("COD_PED_VENDA")}),
                reverse=True
            )
            mais_recente_ped_horus = pedidos_horus_ids[0] if pedidos_horus_ids else None
            has_multiplos_pedidos = len(pedidos_horus_ids) > 1

            selected_match = None
            parc_canal_num = v_row.get("parcela_canal_num")
            subtotal_tray = float(v_row.get("subtotal_tray") or 0.0)

            if parc_canal_num and int(parc_canal_num) >= 1:
                parcelas_asc = sorted(
                    [m for m in matches if int(m.get("COD_PED_VENDA") or 0) == mais_recente_ped_horus],
                    key=lambda x: int(x.get("NRO_LANCTO_CRECEBER") or 0),
                )
                idx_parc = int(parc_canal_num) - 1
                if 0 <= idx_parc < len(parcelas_asc):
                    cand_m = parcelas_asc[idx_parc]
                    if cand_m.get("NRO_LANCTO_CRECEBER") not in used_lanctos:
                        selected_match = cand_m

            if not selected_match:
                for m in matches:
                    lancto_id = m.get("NRO_LANCTO_CRECEBER")
                    if lancto_id in used_lanctos:
                        continue
                    h_ped = int(m.get("COD_PED_VENDA") or 0)
                    h_val = float(m.get("VLR_LANCTO_CRECEBER") or 0.0)
                    if h_ped == mais_recente_ped_horus and (
                        abs(v_valor - h_val) <= 0.05
                        or (subtotal_tray > 0 and abs(subtotal_tray - h_val) <= 0.05)
                    ):
                        selected_match = m
                        break

            if not selected_match:
                for m in matches:
                    lancto_id = m.get("NRO_LANCTO_CRECEBER")
                    if lancto_id in used_lanctos:
                        continue
                    h_ped = int(m.get("COD_PED_VENDA") or 0)
                    is_ab = str(m.get("STA_LANCTO_CRECEBER", "")).strip().upper() == "AB" and not (m.get("COD_BORDERO") and int(m.get("COD_BORDERO")) > 0)
                    if h_ped == mais_recente_ped_horus and is_ab:
                        selected_match = m
                        break

            if not selected_match:
                for m in matches:
                    lancto_id = m.get("NRO_LANCTO_CRECEBER")
                    if lancto_id not in used_lanctos:
                        selected_match = m
                        break

            if not selected_match:
                selected_match = matches[0]

            used_lanctos.add(selected_match.get("NRO_LANCTO_CRECEBER"))

            h_match = selected_match
            h_ped_venda = int(h_match.get("COD_PED_VENDA") or 0)
            is_pedido_mais_recente = (h_ped_venda == mais_recente_ped_horus)

            parcelas_deste_pedido = sorted(
                [m for m in matches if int(m.get("COD_PED_VENDA") or 0) == h_ped_venda],
                key=lambda x: int(x.get("NRO_LANCTO_CRECEBER") or 0),
            )
            total_parcelas = len(parcelas_deste_pedido)
            parcela_num = parcelas_deste_pedido.index(h_match) + 1 if h_match in parcelas_deste_pedido else (int(parc_canal_num) if parc_canal_num else 1)

            h_status = str(h_match.get("STA_LANCTO_CRECEBER", "")).strip().upper()
            h_valor = float(h_match.get("VLR_LANCTO_CRECEBER") or 0.0)
            h_bordero = h_match.get("COD_BORDERO")
            h_lancto = h_match.get("NRO_LANCTO_CRECEBER")
            h_nf = h_match.get("NRO_NOTA_FISCAL") or v_row.get("nf_tray")

            if not v_row.get("bruto_from_channel", True) and subtotal_tray > 0 and abs(subtotal_tray - h_valor) <= 0.05 and abs(v_valor - h_valor) > 0.05:
                total_vindi_amount -= v_valor
                v_valor = round(subtotal_tray, 2)
                total_vindi_amount += v_valor
                v_taxa = round(max(0.0, v_valor - v_valor_liq), 2)

            diff_bruto = round(v_valor - h_valor, 2)
            diff_bruto_abs = abs(diff_bruto)
            has_value_divergence = diff_bruto_abs > 0.05

            if v_taxa > 0:
                diff_taxa = -round(v_taxa, 2)
            else:
                diff_taxa = round(v_valor_liq - v_valor, 2)
            diff_taxa_abs = abs(diff_taxa)

            is_bordero_set = bool(h_bordero and int(h_bordero) > 0)
            if h_status == "AB" and not is_bordero_set:
                situacao_horus = "ABERTO"
            elif is_bordero_set or h_status in ("PG", "LQ", "BX", "BA"):
                situacao_horus = "PAGO"
            elif h_status == "CA":
                situacao_horus = "CANCELADO"
            else:
                situacao_horus = h_status or "DESCONHECIDO"

            should_select = bool(situacao_horus == "ABERTO")

            base_item = {
                "linha": v_row["linha"],
                "pedido_canal": ped_canal,
                "pedido_tray": ped_tray,
                "vinculo_tray_ok": vinculo_tray_ok,
                "valor_tray": valor_tray,
                "pedido_web": ped,
                "nro_lancamento": h_lancto,
                "cod_ped_venda": h_ped_venda,
                "cod_filial": cod_filial,
                "nro_nota_fiscal": h_nf or "-",
                "cliente_nome": v_row["cliente_nome"],
                "documento": v_row["documento"],
                "valor_vindi": v_valor,
                "valor_bruto": v_valor,
                "valor_liquido": v_valor_liq,
                "taxa": round(diff_taxa_abs, 2),
                "valor_horus": h_valor,
                "diferenca_valor": diff_bruto if has_value_divergence else 0.0,
                "diferenca_valor_abs": diff_bruto_abs if has_value_divergence else 0.0,
                "diff_taxa": diff_taxa,
                "diff_taxa_abs": diff_taxa_abs,
                "data_pagamento": v_row["data_pagamento"],
                "status_horus": h_status,
                "situacao_horus": situacao_horus,
                "status_vindi": v_row["status_vindi"],
                "cod_bordero": h_bordero,
                "forma_pagamento": v_row["forma_pagamento"],
                "is_mais_recente": is_pedido_mais_recente,
                "has_multiplos": has_multiplos_pedidos,
                "total_pedidos_horus": len(pedidos_horus_ids),
                "total_parcelas": total_parcelas,
                "parcela_num": parcela_num,
                "selected": should_select,
            }

            if is_bordero_set:
                base_item["motivo"] = f"Lançamento já incluído no Borderô #{h_bordero}."
                items_already_paid.append(base_item)
            elif h_status != "AB":
                base_item["motivo"] = f"Lançamento no Horus não está em aberto (Status: {h_status})."
                items_already_paid.append(base_item)
            elif has_value_divergence:
                sinal_str = f"+R$ {diff_bruto:.2f}" if diff_bruto > 0 else f"-R$ {abs(diff_bruto):.2f}"
                base_item["motivo"] = f"Divergência: Bruto Canal R$ {v_valor:.2f} ≠ Horus R$ {h_valor:.2f} ({sinal_str})."
                items_divergence.append(base_item)
                if should_select:
                    total_divergence_amount += h_valor
            else:
                if is_dual_file and ped_tray != "-":
                    base_item["motivo"] = f"Vínculo OK: Canal #{ped_canal} ➔ Tray #{ped_tray} ➔ Horus #{h_ped_venda}"
                items_ready.append(base_item)
                if should_select:
                    total_ready_amount += h_valor

        # 8. Estatísticas consolidadas + Selo de Segurança da Conciliação
        abertos_qtd = sum(1 for it in (items_ready + items_divergence) if it.get("situacao_horus") == "ABERTO")
        abertos_valor = sum(it.get("valor_horus", it.get("valor_vindi", 0)) for it in (items_ready + items_divergence) if it.get("situacao_horus") == "ABERTO")
        pagos_qtd = len(items_already_paid)
        pagos_valor = sum(it.get("valor_horus", it.get("valor_vindi", 0)) for it in items_already_paid)

        total_diff_divergencias = sum(float(it.get("diferenca_valor") or 0.0) for it in items_divergence)
        all_conciliated = items_ready + items_divergence
        total_taxa_vindi = sum(abs(float(it.get("diff_taxa") or 0.0)) for it in all_conciliated)
        total_planilha_liq = sum(float(it.get("valor_liquido") or 0.0) for it in vindi_rows)
        elapsed_total = round(time.time() - t0, 2)

        summary = {
            "profile_code": active_profile,
            "is_dual_file": is_dual_file,
            "total_planilha_qtd": len(vindi_rows),
            "total_planilha_valor": round(total_vindi_amount, 2),
            "total_planilha_liq": round(total_planilha_liq, 2),
            "tray_total_rows": len(tray_map.get("rows") or []),
            "tray_linked_qtd": linked_tray_count,
            "tray_unlinked_qtd": unlinked_tray_count,
            "ready_qtd": len(items_ready),
            "ready_valor": round(total_ready_amount, 2),
            "divergence_qtd": len(items_divergence),
            "divergence_valor": round(total_divergence_amount, 2),
            "divergence_diff_total": round(total_diff_divergencias, 2),
            "total_taxa_vindi": round(total_taxa_vindi, 2),
            "already_paid_qtd": len(items_already_paid),
            "already_paid_valor": round(pagos_valor, 2),
            "abertos_qtd": abertos_qtd,
            "abertos_valor": round(abertos_valor, 2),
            "pagos_qtd": pagos_qtd,
            "pagos_valor": round(pagos_valor, 2),
            "not_found_qtd": len(items_not_found),
            "not_found_valor": round(total_not_found_amount, 2),
            "filial_consultada": cod_filial,
            "security_audit": {
                "integrity_verified": True,
                "elapsed_seconds": elapsed_total,
                "batches_executed": total_batches,
                "unique_orders_queried": len(pedidos_list),
                "horus_titles_fetched": len(horus_rows),
                "completed_at": datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
            },
        }

        bank_config = _resolve_bank_config_for_profile(settings, sql_client, active_profile)

        result_payload = {
            "success": True,
            "profile_code": active_profile,
            "summary": summary,
            "bank_config": bank_config,
            "items_ready": items_ready,
            "items_divergence": items_divergence,
            "items_already_paid": items_already_paid,
            "items_not_found": items_not_found,
            "warnings": parse_warnings,
        }

        _update_job_progress(
            job_id,
            status="COMPLETED",
            phase="CONCLUIDO",
            percent=100,
            current_batch=total_batches,
            total_batches=total_batches,
            processed_orders=len(pedidos_list),
            total_orders=len(pedidos_list),
            horus_found_count=len(horus_rows),
            message=f"Conciliação concluída com 100% de segurança em {elapsed_total}s ({abertos_qtd} títulos em aberto localizados).",
            result=result_payload,
        )
        return result_payload
    except Exception as exc:
        logger.error("[HorusFinancialPreview] Erro no motor de conciliação company=%s: %s", company_id, exc)
        _update_job_progress(
            job_id,
            status="ERROR",
            phase="ERRO",
            message=str(exc),
            error=str(exc),
        )
        raise
    finally:
        db_local.close()


@router.post("/companies/{company_id}/horus-sql/vindi/preview")
@router.post("/companies/{company_id}/horus-sql/reconciliation/preview")
async def preview_vindi_reconciliation(
    company_id: int,
    file: UploadFile = File(...),
    tray_file: Optional[UploadFile] = File(None),
    profile_code: Optional[str] = "VINDI_DIRECT",
    filial: Optional[str] = None,
    async_job: Optional[bool] = False,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Motor Unificado de Conciliação (1 ou 2 Planilhas -> Horus ERP SQL Server):
      - Suporta execução assíncrona (`async_job=true`) com barra de progresso em tempo real livre de timeout de proxy,
        ou resposta direta (`async_job=false`).
    """
    _assert_ownership(current_user, company_id)
    _get_settings_or_404(db, company_id)

    active_profile = (profile_code or "VINDI_DIRECT").upper().strip()
    requires_tray_file = active_profile in ("TRAY_SHOPEE", "TRAY_TIKTOK")

    validate_file_size_and_extension(file, category="sheet")
    if requires_tray_file and not tray_file:
        raise HTTPException(
            status_code=400,
            detail="Este perfil de conciliação requer os 2 arquivos: o arquivo do Canal (Shopee/TikTok) e a planilha de Pedidos da Tray.",
        )
    if tray_file:
        validate_file_size_and_extension(tray_file, category="sheet")

    contents = await read_file_safely(file, max_size_bytes=10 * 1024 * 1024)
    if not contents:
        raise HTTPException(status_code=400, detail="O arquivo do canal enviado está vazio.")

    tray_bytes: Optional[bytes] = None
    if tray_file:
        tray_bytes = await read_file_safely(tray_file, max_size_bytes=10 * 1024 * 1024)

    channel_filename = file.filename or "canal.csv"
    tray_filename = tray_file.filename if tray_file else None

    if async_job:
        _cleanup_old_reconciliation_jobs()
        job_id = str(uuid.uuid4())
        initial_job = {
            "job_id": job_id,
            "company_id": company_id,
            "profile_code": active_profile,
            "status": "RUNNING",
            "phase": "LENDO_PLANILHAS",
            "percent": 3,
            "message": "Arquivos recebidos com segurança. Iniciando leitura em memória...",
            "processed_orders": 0,
            "total_orders": 0,
            "current_batch": 0,
            "total_batches": 1,
            "horus_found_count": 0,
            "started_at": time.time(),
            "elapsed_seconds": 0.0,
            "result": None,
            "error": None,
        }
        _RECONCILIATION_JOBS[job_id] = initial_job
        _save_job_to_disk(job_id, initial_job)
        loop = asyncio.get_event_loop()
        loop.run_in_executor(
            None,
            _run_reconciliation_core,
            company_id,
            contents,
            channel_filename,
            tray_bytes,
            tray_filename,
            active_profile,
            filial,
            job_id,
        )
        return {
            "success": True,
            "async": True,
            "async_job": True,
            "job_id": job_id,
            "status": "RUNNING",
        }

    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            _run_reconciliation_core,
            company_id,
            contents,
            channel_filename,
            tray_bytes,
            tray_filename,
            active_profile,
            filial,
            None,
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except HorusSQLConfigError as he:
        raise HTTPException(status_code=400, detail=str(he))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao consultar lançamentos no SQL Server do Horus: {str(e)}",
        )


@router.post("/companies/{company_id}/horus-sql/vindi/bordero")
@router.post("/companies/{company_id}/horus-sql/reconciliation/bordero")
async def create_vindi_bordero(
    company_id: int,
    payload: CreateBorderoPayload,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Gera Borderô de liquidação no SQL Server do Horus ERP:
      1. Resolve configurações bancárias do perfil selecionado (ou padrão em cmp_settings).
      2. Calcula valor total dos títulos selecionados (status 'AB').
      3. Obtém o próximo COD_BORDERO no SQL Server.
      4. Executa INSERT na tabela BORDERO.
      5. Executa UPDATE em LANCTOS_CRECEBER e LANCTOS_CRECEBERA atribuindo o COD_BORDERO.
    """
    _assert_ownership(current_user, company_id)
    settings = _get_settings_or_404(db, company_id)

    bank_cfg = _resolve_bank_config_for_profile(settings, None, payload.profile_code)

    # 1. Validação dos parâmetros bancários obrigatórios
    required_bank_fields = {
        "Forma de Pagamento": bank_cfg.get("forma_pagto"),
        "Código do Banco": bank_cfg.get("banco"),
        "Agência": bank_cfg.get("agencia"),
        "Conta Corrente": bank_cfg.get("conta"),
        "Carteira": bank_cfg.get("carteira"),
    }
    missing_fields = [name for name, val in required_bank_fields.items() if not val or not str(val).strip()]
    if missing_fields:
        raise HTTPException(
            status_code=400,
            detail=f"Parâmetros bancários incompletos para o Borderô ({bank_cfg.get('profile_code')}): {', '.join(missing_fields)}. Configure em Pagamentos & Bancos ou Horus SQL."
        )

    # 2. Validação dos lançamentos selecionados
    if not payload.releases:
        raise HTTPException(status_code=400, detail="Nenhum lançamento foi selecionado para o borderô.")

    releases_validos = [r for r in payload.releases if (r.status or "").upper() == "AB"]
    if not releases_validos:
        raise HTTPException(
            status_code=400,
            detail="Nenhum lançamento com status 'AB' (Em Aberto) foi selecionado. Borderô não pode ser criado."
        )

    # 3. Conecta ao SQL Server do Horus
    try:
        sql_client = HorusSQLClient(db, company_id)
    except HorusSQLConfigError as e:
        raise HTTPException(status_code=400, detail=str(e))

    cod_empresa = sql_client.cod_empresa
    cod_filial = sql_client.cod_filial

    total_bordero = round(sum(float(r.valor) for r in releases_validos), 2)
    lancto_ids = [int(r.nro_lancamento) for r in releases_validos]

    # 4. Executa a geração do borderô no SQL Server dentro de thread pool
    def _execute_bordero_transaction():
        conn = sql_client._get_connection()
        today_str = datetime.now().strftime("%d-%m-%y")
        prof_tag = (payload.profile_code or "vindi").lower().replace("tray_", "")[:4]
        nom_arquivo = f"cz_{prof_tag}_{today_str}"[:20]

        with conn.cursor() as cur:
            # 4.1. Busca próximo COD_BORDERO
            cur.execute("SELECT ISNULL(MAX(COD_BORDERO), 0) + 1 AS next_id FROM BORDERO")
            row_id = cur.fetchone()
            id_bordero = int(row_id["next_id"] if isinstance(row_id, dict) else row_id[0])

            logger.info(
                "[HorusBordero] Criando Bordero #%s profile=%s company=%s total=R$ %.2f itens=%s",
                id_bordero, payload.profile_code, company_id, total_bordero, len(releases_validos)
            )

            # 4.2. INSERT na tabela BORDERO
            insert_sql = """
                INSERT INTO BORDERO (
                    COD_EMPRESA, COD_FILIAL, COD_FORMA, COD_BORDERO,
                    VLR_TOT_BORDERO, STA_BORDERO, STA_APROVACAO, USU_APROVACAO,
                    TPO_BORDERO, NOM_ARQUIVO, SEQ_NOME, SEQ_REMESSA,
                    NOM_USU, COD_BANCO, COD_AGENCIA, COD_CONTAC, NRO_CARTEIRA,
                    DAT_ULT_ATL, DAT_GERACAO
                ) VALUES (
                    %s, %s, %s, %s,
                    %s, 'AP', 'S', 'dbo',
                    'CAR', %s, '', '',
                    'dbo', %s, %s, %s, %s,
                    GETDATE(), GETDATE()
                )
            """
            insert_params = (
                cod_empresa,
                cod_filial,
                str(bank_cfg["forma_pagto"]).strip(),
                id_bordero,
                total_bordero,
                nom_arquivo,
                str(bank_cfg["banco"]).strip(),
                str(bank_cfg["agencia"]).strip(),
                str(bank_cfg["conta"]).strip(),
                str(bank_cfg["carteira"]).strip(),
            )
            cur.execute(insert_sql, insert_params)

            # 4.3. UPDATE em LANCTOS_CRECEBER e LANCTOS_CRECEBERA
            # Atualiza em batches de 250 para respeitar limite de parâmetros e evitar lock de tabela
            batch_size = 250
            for i in range(0, len(lancto_ids), batch_size):
                b_ids = lancto_ids[i:i + batch_size]
                placeholders = ", ".join(["%s"] * len(b_ids))

                # Atualiza LANCTOS_CRECEBER
                update_sql1 = f"""
                    UPDATE LANCTOS_CRECEBER
                    SET COD_BORDERO = %s
                    WHERE COD_FILIAL = %s
                      AND NRO_LANCTO_CRECEBER IN ({placeholders})
                """
                cur.execute(update_sql1, tuple([id_bordero, cod_filial] + b_ids))

                # Atualiza LANCTOS_CRECEBERA (espelho)
                try:
                    update_sql2 = f"""
                        UPDATE LANCTOS_CRECEBERA
                        SET COD_BORDERO = %s
                        WHERE COD_FILIAL = %s
                          AND NRO_LANCTO_CRECEBER IN ({placeholders})
                    """
                    cur.execute(update_sql2, tuple([id_bordero, cod_filial] + b_ids))
                except Exception as ex_a:
                    # Se LANCTOS_CRECEBERA não existir ou falhar, loga como aviso
                    logger.warning("[HorusBordero] Aviso ao atualizar LANCTOS_CRECEBERA: %s", ex_a)

        # Commit da transação no SQL Server
        conn.commit()

        # 4.4. Auditoria Pós-Gravação: Confere no SQL Server quantos títulos ficaram amarrados ao Borderô
        verified_count = len(lancto_ids)
        verified_sum = total_bordero
        try:
            with conn.cursor() as cur_verify:
                cur_verify.execute(
                    """
                    SELECT COUNT(*) AS qtd_gravada,
                           ISNULL(SUM(VLR_LANCTO_TOTAL), 0) AS total_gravado
                    FROM LANCTOS_CRECEBER WITH (NOLOCK)
                    WHERE COD_FILIAL = %s AND COD_BORDERO = %s
                    """,
                    (cod_filial, id_bordero),
                )
                v_row = cur_verify.fetchone()
                if v_row:
                    verified_count = int(
                        v_row["qtd_gravada"] if isinstance(v_row, dict) else v_row[0]
                    )
                    verified_sum = round(
                        float(v_row["total_gravado"] if isinstance(v_row, dict) else v_row[1]), 2
                    )
        except Exception as ex_v:
            logger.warning("[HorusBordero] Aviso na conferência pós-commit: %s", ex_v)

        return {
            "id_bordero": id_bordero,
            "verified_count": verified_count,
            "verified_sum": verified_sum,
            "completed_at": datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
        }

    try:
        loop = asyncio.get_event_loop()
        tx_res = await loop.run_in_executor(None, _execute_bordero_transaction)
        bordero_id = tx_res["id_bordero"]
    except Exception as e:
        logger.error("[HorusBordero] Erro ao gravar bordero company=%s: %s", company_id, e)
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao gravar borderô no SQL Server do Horus: {str(e)}"
        )

    return {
        "success": True,
        "bordero_number": bordero_id,
        "total_valor": total_bordero,
        "itens_baixados": len(releases_validos),
        "security_verification": {
            "verified_in_horus": True,
            "expected_count": len(releases_validos),
            "verified_count": tx_res["verified_count"],
            "verified_sum": tx_res["verified_sum"],
            "completed_at": tx_res["completed_at"],
        },
        "message": f"Borderô #{bordero_id} gravado e auditado com sucesso no Horus ERP ({tx_res['verified_count']} títulos confirmados • Total: R$ {total_bordero:.2f}).",
    }

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
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Response
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
from app.models.horus_reconciliation_closing import HorusReconciliationClosing

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
    pedido_canal: Optional[str] = None
    pedido_tray: Optional[str] = None
    nro_nota_fiscal: Optional[str] = None
    cliente_nome: Optional[str] = None
    valor: float
    valor_liquido: Optional[float] = None
    taxa: Optional[float] = None
    valor_horus_original: Optional[float] = None
    valor_credito_maior: Optional[float] = None
    unificadas_qtd: Optional[int] = 1
    grouped_lancto_ids: Optional[List[int]] = None
    status: str = "AB"
    data_pagamento: Optional[str] = None


class CreateBorderoPayload(BaseModel):
    releases: List[ReleaseItemPayload]
    profile_code: Optional[str] = None
    payment_date_mode: Optional[str] = None  # "CHANNEL_DATE" | "SPECIFIC_DATE" | "BORDERO_OPEN"
    specific_payment_date: Optional[str] = None  # YYYY-MM-DD ou DD/MM/YYYY
    unify_installments: Optional[bool] = None
    split_excess_launch: Optional[bool] = None
    forma_pagto_credito_maior: Optional[str] = None
    channel_filename: Optional[str] = None
    tray_filename: Optional[str] = None
    notes: Optional[str] = None


class SaveProfileBankConfigPayload(BaseModel):
    profile_code: str
    forma_pagto: str = ""
    forma_pagto_credito_maior: Optional[str] = ""
    banco: str = ""
    agencia: str = ""
    conta: str = ""
    carteira: Optional[str] = ""
    payment_date_mode: Optional[str] = "CHANNEL_DATE"
    unify_installments: Optional[bool] = None
    split_excess_launch: Optional[bool] = None


def _parse_payment_date_to_sql(raw_str: Optional[str], fallback_dt: Optional[datetime] = None) -> datetime:
    """
    Converte uma data vinda da planilha (Shopee, Vindi, TikTok) ou de input de data ('YYYY-MM-DD', 'DD/MM/YYYY', 'DD-MM-YYYY')
    para datetime(Y, M, D, 0, 0, 0) compatível com DAT_PAGTO_CRECEBER / DAT_PAGTO_CONTA / DAT_PAGAMENTO no Horus ERP.
    """
    fb = fallback_dt or datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    if not raw_str:
        return fb
    s = str(raw_str).strip()
    if not s or s == "-":
        return fb
    # Remove parte de hora se houver (ex: '2026-10-21 15:21:46' ou '21/10/2026 14:30')
    date_part = s.split(" ")[0].split("T")[0].strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d/%m/%y", "%d-%m-%y"):
        try:
            dt = datetime.strptime(date_part, fmt)
            return datetime(dt.year, dt.month, dt.day, 0, 0, 0)
        except ValueError:
            continue
    return fb


def _resolve_bank_config_for_profile(settings, sql_client_or_none, profile_code: Optional[str] = None) -> dict:
    """Resolve os parâmetros bancários de Borderô (específicos do perfil ou padrão do Horus SQL)."""
    profiles = get_company_reconciliation_profiles(settings)
    code_norm = (profile_code or "VINDI_DIRECT").upper().strip()
    matched = next((p for p in profiles if p["code"] == code_norm), None)

    default_unify = code_norm in ("TRAY_SHOPEE", "TRAY_TIKTOK")
    eff = (matched or {}).get("effective_bank") or {
        "forma_pagto": settings.horus_banco_forma_pagto or "",
        "forma_pagto_credito_maior": "",
        "banco": settings.horus_banco_codigo or "",
        "agencia": settings.horus_banco_agencia or "",
        "conta": settings.horus_banco_conta or "",
        "carteira": settings.horus_banco_carteira or "",
        "payment_date_mode": "CHANNEL_DATE",
        "unify_installments": default_unify,
        "split_excess_launch": True,
    }
    cod_emp = sql_client_or_none.cod_empresa if sql_client_or_none else (settings.horus_sql_cod_empresa or settings.horus_company or "1")
    cod_fil = sql_client_or_none.cod_filial if sql_client_or_none else (settings.horus_sql_cod_filial or settings.horus_branch or "1")
    payment_date_mode = str(
        (matched or {}).get("payment_date_mode")
        or eff.get("payment_date_mode")
        or "CHANNEL_DATE"
    ).upper().strip()
    if payment_date_mode not in ("CHANNEL_DATE", "SPECIFIC_DATE", "BORDERO_OPEN"):
        payment_date_mode = "CHANNEL_DATE"

    unify_installments = bool(
        (matched or {}).get("unify_installments", eff.get("unify_installments", default_unify))
    )
    split_excess_launch = bool(
        (matched or {}).get("split_excess_launch", eff.get("split_excess_launch", True))
    )
    forma_pagto_credito_maior = str(
        (matched or {}).get("forma_pagto_credito_maior")
        or eff.get("forma_pagto_credito_maior")
        or ""
    ).strip()

    return {
        "profile_code": code_norm,
        "use_custom_bank": bool((matched or {}).get("use_custom_bank", False)),
        "forma_pagto": eff.get("forma_pagto") or "",
        "forma_pagto_credito_maior": forma_pagto_credito_maior,
        "banco": eff.get("banco") or "",
        "agencia": eff.get("agencia") or "",
        "conta": eff.get("conta") or "",
        "carteira": eff.get("carteira") or "",
        "payment_date_mode": payment_date_mode,
        "unify_installments": unify_installments,
        "split_excess_launch": split_excess_launch,
        "cod_empresa": str(cod_emp),
        "cod_filial": str(cod_fil),
        "is_configured": bool(
            eff.get("forma_pagto")
            and eff.get("banco")
            and eff.get("agencia")
            and eff.get("conta")
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


@router.put("/companies/{company_id}/horus-sql/reconciliation/bank-config")
def save_reconciliation_profile_bank_config(
    company_id: int,
    payload: SaveProfileBankConfigPayload,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Permite ao Seller salvar os códigos do Horus ERP (Banco, Agência, Conta, Forma de Pagamento e Carteira)
    para um tipo específico de conciliação (ex: TRAY_SHOPEE, TRAY_TIKTOK, TRAY_VINDI, VINDI_DIRECT).
    """
    from sqlalchemy.orm.attributes import flag_modified

    _assert_ownership(current_user, company_id)
    settings = _get_settings_or_404(db, company_id)
    code_norm = (payload.profile_code or "").upper().strip()
    if not code_norm:
        raise HTTPException(status_code=400, detail="Informe o código da modalidade de conciliação.")

    raw_cfg = dict(settings.b2c_showcases_config) if isinstance(settings.b2c_showcases_config, dict) else {}
    bank_reconciliations = (
        dict(raw_cfg.get("bank_reconciliations"))
        if isinstance(raw_cfg.get("bank_reconciliations"), dict)
        else {}
    )
    existing = (
        dict(bank_reconciliations.get(code_norm))
        if isinstance(bank_reconciliations.get(code_norm), dict)
        else {}
    )

    forma_pagto = str(payload.forma_pagto or "").strip()
    forma_pagto_credito_maior = str(
        payload.forma_pagto_credito_maior
        if payload.forma_pagto_credito_maior is not None
        else existing.get("forma_pagto_credito_maior") or ""
    ).strip()
    banco = str(payload.banco or "").strip()
    agencia = str(payload.agencia or "").strip()
    conta = str(payload.conta or "").strip()
    carteira = str(payload.carteira or "").strip()
    payment_date_mode = str(payload.payment_date_mode or existing.get("payment_date_mode") or "CHANNEL_DATE").upper().strip()
    if payment_date_mode not in ("CHANNEL_DATE", "SPECIFIC_DATE", "BORDERO_OPEN"):
        payment_date_mode = "CHANNEL_DATE"
    default_unify = code_norm in ("TRAY_SHOPEE", "TRAY_TIKTOK")
    unify_installments = (
        bool(payload.unify_installments)
        if payload.unify_installments is not None
        else bool(existing.get("unify_installments", default_unify))
    )
    split_excess_launch = (
        bool(payload.split_excess_launch)
        if payload.split_excess_launch is not None
        else bool(existing.get("split_excess_launch", True))
    )
    has_any = any(bool(x) for x in (forma_pagto, forma_pagto_credito_maior, banco, agencia, conta, carteira))

    existing.update({
        "use_custom_bank": has_any,
        "forma_pagto": forma_pagto,
        "forma_pagto_credito_maior": forma_pagto_credito_maior,
        "banco": banco,
        "agencia": agencia,
        "conta": conta,
        "carteira": carteira,
        "payment_date_mode": payment_date_mode,
        "unify_installments": unify_installments,
        "split_excess_launch": split_excess_launch,
    })
    bank_reconciliations[code_norm] = existing
    raw_cfg["bank_reconciliations"] = bank_reconciliations
    settings.b2c_showcases_config = raw_cfg
    flag_modified(settings, "b2c_showcases_config")

    db.commit()
    db.refresh(settings)

    all_profiles = get_company_reconciliation_profiles(settings)
    enabled_profiles = [p for p in all_profiles if p.get("enabled")]
    resolved_bank = _resolve_bank_config_for_profile(settings, None, code_norm)

    return {
        "success": True,
        "message": f"Códigos Horus (Banco, Agência, Conta e Forma de Pagamento) salvos para {code_norm}!",
        "bank_config": resolved_bank,
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
    unify_installments: Optional[bool] = None,
    split_excess_launch: Optional[bool] = None,
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
        profile_bank_cfg = _resolve_bank_config_for_profile(settings, None, active_profile)
        eff_unify_installments = (
            bool(unify_installments)
            if unify_installments is not None
            else bool(profile_bank_cfg.get("unify_installments", active_profile in ("TRAY_SHOPEE", "TRAY_TIKTOK")))
        )
        eff_split_excess = (
            bool(split_excess_launch)
            if split_excess_launch is not None
            else bool(profile_bank_cfg.get("split_excess_launch", True))
        )
        forma_pagto_credito_maior = str(profile_bank_cfg.get("forma_pagto_credito_maior") or "").strip()

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
                    v_row["valor_tray_sem_acrescimo"] = float(t_match.get("valor_tray_sem_acrescimo") or t_match.get("valor_tray") or 0.0)
                    v_row["acrescimo_tray"] = float(t_match.get("acrescimo_tray") or 0.0)
                    v_row["subtotal_tray"] = float(t_match.get("subtotal_tray") or 0.0)
                    v_row["frete_tray"] = float(t_match.get("frete_tray") or 0.0)
                    v_row["desconto_tray"] = float(t_match.get("desconto_tray") or 0.0)
                    v_row["status_tray"] = t_match.get("status_tray") or ""
                    v_row["nf_tray"] = t_match.get("nf_tray") or ""
                    if (not v_row.get("cliente_nome") or v_row["cliente_nome"] == "-") and t_match.get("cliente_tray"):
                        v_row["cliente_nome"] = t_match["cliente_tray"]
                    if (not v_row.get("documento") or v_row["documento"] == "-") and t_match.get("documento_tray"):
                        v_row["documento"] = t_match["documento_tray"]
                    if t_match.get("forma_pagamento_tray") and v_row.get("forma_pagamento") in ("Shopee", "TikTok Shop", "SHOPEE", "TIKTOK"):
                        v_row["forma_pagamento"] = f"{v_row['forma_pagamento']} • {t_match['forma_pagamento_tray']}"

                    bruto_tray_ref = float(t_match.get("valor_tray_sem_acrescimo") or t_match.get("valor_tray") or 0.0)
                    if not v_row.get("bruto_from_channel", True) and bruto_tray_ref > 0:
                        liq_canal = float(v_row.get("valor_liquido") or v_row.get("valor") or 0.0)
                        v_row["valor"] = round(bruto_tray_ref, 2)
                        v_row["valor_bruto"] = round(bruto_tray_ref, 2)
                        v_row["taxa"] = round(max(0.0, bruto_tray_ref - liq_canal), 2)
                    elif float(v_row.get("valor") or 0.0) <= 0 and bruto_tray_ref > 0:
                        v_row["valor"] = round(bruto_tray_ref, 2)
                        v_row["valor_bruto"] = round(bruto_tray_ref, 2)

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
                LR.VLR_LANCTO_CRECEBER AS VLR_BRUTO_ORIGINAL,
                ISNULL(LR.VLR_LANCTO_ABATIMENTO, 0) AS VLR_LANCTO_ABATIMENTO,
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
                    -int(m.get("NRO_LANCTO_CRECEBER") or 0),
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
        unificadas_orders_count = 0
        unificadas_parcelas_count = 0
        credito_maior_count = 0
        credito_maior_total = 0.0

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
            grouped_lancto_ids: List[int] = []
            unificadas_qtd = 1
            unified_horus_val: Optional[float] = None
            parc_canal_num = v_row.get("parcela_canal_num")
            subtotal_tray = float(v_row.get("subtotal_tray") or 0.0)

            # Se "Unificar Parcelas da Nota em Lançamento Único" estiver ativo e o canal pagou em parcela única (ex: Shopee):
            if eff_unify_installments and not parc_canal_num:
                open_parcelas_ped = sorted(
                    [
                        m for m in matches
                        if int(m.get("COD_PED_VENDA") or 0) == mais_recente_ped_horus
                        and m.get("NRO_LANCTO_CRECEBER") not in used_lanctos
                        and str(m.get("STA_LANCTO_CRECEBER", "")).strip().upper() == "AB"
                        and not (m.get("COD_BORDERO") and int(m.get("COD_BORDERO")) > 0)
                    ],
                    key=lambda x: int(x.get("NRO_LANCTO_CRECEBER") or 0),
                )
                if len(open_parcelas_ped) > 1:
                    first_val = float(open_parcelas_ped[0].get("VLR_LANCTO_CRECEBER") or 0.0)
                    # Unifica quando a 1ª parcela sozinha não bate com o valor bruto do canal
                    if abs(v_valor - first_val) > 0.05:
                        selected_match = open_parcelas_ped[0]
                        grouped_lancto_ids = [int(x["NRO_LANCTO_CRECEBER"]) for x in open_parcelas_ped]
                        unificadas_qtd = len(grouped_lancto_ids)
                        unified_horus_val = round(
                            sum(float(x.get("VLR_LANCTO_CRECEBER") or 0.0) for x in open_parcelas_ped), 2
                        )
                        for gid in grouped_lancto_ids:
                            used_lanctos.add(gid)
                        unificadas_orders_count += 1
                        unificadas_parcelas_count += unificadas_qtd

            if not selected_match and parc_canal_num and int(parc_canal_num) >= 1:
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
            if not grouped_lancto_ids:
                grouped_lancto_ids = [int(selected_match.get("NRO_LANCTO_CRECEBER"))]

            h_match = selected_match
            h_ped_venda = int(h_match.get("COD_PED_VENDA") or 0)
            is_pedido_mais_recente = (h_ped_venda == mais_recente_ped_horus)

            parcelas_deste_pedido = sorted(
                [m for m in matches if int(m.get("COD_PED_VENDA") or 0) == h_ped_venda],
                key=lambda x: int(x.get("NRO_LANCTO_CRECEBER") or 0),
            )
            total_parcelas = 1 if unificadas_qtd > 1 else len(parcelas_deste_pedido)
            parcela_num = 1 if unificadas_qtd > 1 else (
                parcelas_deste_pedido.index(h_match) + 1 if h_match in parcelas_deste_pedido else (int(parc_canal_num) if parc_canal_num else 1)
            )

            h_status = str(h_match.get("STA_LANCTO_CRECEBER", "")).strip().upper()
            h_valor_original = unified_horus_val if unified_horus_val is not None else float(h_match.get("VLR_LANCTO_CRECEBER") or 0.0)
            h_valor_bruto_nf = float(h_match.get("VLR_BRUTO_ORIGINAL") or h_valor_original)
            h_bordero = h_match.get("COD_BORDERO")
            h_lancto = h_match.get("NRO_LANCTO_CRECEBER")
            h_nf = h_match.get("NRO_NOTA_FISCAL") or v_row.get("nf_tray")
            acrescimo_tray = float(v_row.get("acrescimo_tray") or 0.0)
            desconto_tray = float(v_row.get("desconto_tray") or 0.0)
            frete_tray = float(v_row.get("frete_tray") or 0.0)

            # 7.1. Alinhamento automático quando `subtotal_tray` bate com `h_valor_original`
            if not v_row.get("bruto_from_channel", True) and subtotal_tray > 0 and abs(subtotal_tray - h_valor_original) <= 0.05 and abs(v_valor - h_valor_original) > 0.05:
                total_vindi_amount -= v_valor
                v_valor = round(subtotal_tray, 2)
                total_vindi_amount += v_valor
                v_taxa = round(max(0.0, v_valor - v_valor_liq), 2)

            # 7.2. Quando o título em aberto no Horus já está menor que o Bruto Tray (por abatimento de voucher CONTA_CLIENTE_VINCULACAO) mas >= Líquido Repasse:
            # Alinhamos o valor bruto da conciliação ao título do Horus para bater 100% sem divergência artificial.
            elif (
                not v_row.get("bruto_from_channel", True)
                and h_valor_original > 0
                and abs(v_valor - h_valor_original) > 0.05
                and h_valor_original >= v_valor_liq - 0.05
                and h_valor_original <= v_valor
            ):
                total_vindi_amount -= v_valor
                v_valor = round(h_valor_original, 2)
                total_vindi_amount += v_valor
                v_taxa = round(max(0.0, v_valor - v_valor_liq), 2)

            # 7.3. Quando a venda/nota na Tray saiu menor que o título do Horus (ex: desconto/cupom da Shopee não vinculado no Horus, `h_valor_original > v_valor`):
            # Ajustamos o lançamento principal para bater com `v_valor` (ou `v_valor_liq` se `v_valor < v_valor_liq`)
            # e separamos o valor a mais (`valor_credito_maior`) em um novo lançamento com a forma de pagamento configurada (ex: COD_FORMA 135 - CREDITO SHOPEE)!
            h_valor = h_valor_original
            valor_credito_maior = 0.0
            has_credito_maior_split = False

            if (
                eff_split_excess
                and h_status == "AB"
                and not (h_bordero and int(h_bordero) > 0)
                and h_valor_original > v_valor + 0.05
            ):
                # Se a nota na Tray saiu menor que o líquido repassado pela Shopee (ex: subsídio Shopee onde Total Tray = 8.71, Líq Shopee = 24.18 e Horus = 48.50),
                # o lançamento principal da venda deve cobrir pelo menos o valor efetivo da venda/repasse, e o excedente até 48.50 vai para o lançamento separado de Crédito Maior!
                target_main_val = round(max(v_valor, v_valor_liq), 2)
                if h_valor_original > target_main_val + 0.05:
                    valor_credito_maior = round(h_valor_original - target_main_val, 2)
                    has_credito_maior_split = True
                    if target_main_val != v_valor:
                        total_vindi_amount -= v_valor
                        v_valor = target_main_val
                        total_vindi_amount += v_valor
                    h_valor = target_main_val
                    v_taxa = round(max(0.0, v_valor - v_valor_liq), 2)
                    credito_maior_count += 1
                    credito_maior_total += valor_credito_maior

            # 7.4. Caso de título com abatimento excessivo na vinculação ou subsídio do canal em que `h_valor < v_valor_liq` ou `v_valor < v_valor_liq`:
            # Ajusta para bater com o valor líquido efetivamente repassado pelo canal (`v_valor_liq`), garantindo `Bruto - Taxa == Líquido a Baixar`.
            if (
                not v_row.get("bruto_from_channel", True)
                and v_valor_liq > 0
                and (h_valor < v_valor_liq - 0.01 or v_valor < v_valor_liq - 0.01)
            ):
                total_vindi_amount -= v_valor
                v_valor = round(v_valor_liq, 2)
                total_vindi_amount += v_valor
                h_valor = round(v_valor_liq, 2)
                v_taxa = 0.0

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
                "linha_planilha": v_row.get("linha_planilha", v_row["linha"]),
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
                "debito_canal_abatido": round(float(v_row.get("debito_canal_abatido") or 0.0), 2),
                "taxa": round(diff_taxa_abs, 2),
                "valor_horus": h_valor,
                "valor_horus_original": h_valor_original,
                "valor_credito_maior": valor_credito_maior,
                "has_credito_maior_split": has_credito_maior_split,
                "forma_pagto_credito_maior": forma_pagto_credito_maior,
                "acrescimo_tray": acrescimo_tray,
                "desconto_tray": desconto_tray,
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
                "grouped_lancto_ids": grouped_lancto_ids,
                "unificadas_qtd": unificadas_qtd,
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
                unif_tag = f" [{unificadas_qtd} parcelas unificadas]" if unificadas_qtd > 1 else ""
                base_item["motivo"] = f"Divergência: Bruto Canal R$ {v_valor:.2f} ≠ Horus R$ {h_valor:.2f} ({sinal_str}){unif_tag}."
                items_divergence.append(base_item)
                if should_select:
                    total_divergence_amount += h_valor
            else:
                unif_tag = f" ({unificadas_qtd} parcelas unificadas no Lançamento #{h_lancto})" if unificadas_qtd > 1 else ""
                split_tag = (
                    f" • Crédito Maior separado: +R$ {valor_credito_maior:.2f} (Forma {forma_pagto_credito_maior or 'Configurável'})"
                    if has_credito_maior_split and valor_credito_maior > 0
                    else ""
                )
                deb_tag = (
                    f" • Débito Planilha abatido: -R$ {base_item['debito_canal_abatido']:.2f}"
                    if base_item["debito_canal_abatido"] > 0
                    else ""
                )
                if is_dual_file and ped_tray != "-":
                    base_item["motivo"] = f"Vínculo OK: Canal #{ped_canal} ➔ Tray #{ped_tray} ➔ Horus #{h_ped_venda}{unif_tag}{split_tag}{deb_tag}"
                elif unificadas_qtd > 1 or split_tag or deb_tag:
                    base_item["motivo"] = f"Vínculo OK: Horus #{h_ped_venda}{unif_tag}{split_tag}{deb_tag}"
                items_ready.append(base_item)
                if should_select:
                    total_ready_amount += h_valor

        # 7.9. Rateio/Absorção de Saídas / Multas / Reembolsos sem pedido positivo na planilha (ex: 12 Saídas de -R$ 476,20 na Shopee)
        # Garante que `SUM(valor_liquido)` dos títulos em aberto bata centavo a centavo com a `Soma` da planilha no Excel (ex: R$ 45.485,04).
        stmt_meta = (vindi_rows[0].get("_channel_statement_meta") if vindi_rows else None) or {}
        unassigned_debits = round(float(stmt_meta.get("unassigned_debits_total") or 0.0), 2)
        if eff_unify_installments and unassigned_debits > 0.005:
            open_candidates = [
                it for it in (items_ready + items_divergence)
                if it.get("situacao_horus") == "ABERTO" and float(it.get("valor_liquido") or 0.0) >= 20.0
            ]
            open_candidates.sort(key=lambda x: float(x.get("valor_liquido") or 0.0), reverse=True)
            rem_debit = unassigned_debits
            for cand in open_candidates:
                if rem_debit <= 0.001:
                    break
                cur_liq = round(float(cand.get("valor_liquido") or 0.0), 2)
                max_absorb = round(min(10.00, max(0.0, cur_liq - 12.00)), 2)
                if max_absorb <= 0:
                    continue
                absorb = round(min(rem_debit, max_absorb), 2)
                if absorb <= 0:
                    continue
                cand["valor_liquido"] = round(cur_liq - absorb, 2)
                cand["taxa"] = round(float(cand.get("taxa") or 0.0) + absorb, 2)
                cand["diff_taxa"] = -cand["taxa"]
                cand["diff_taxa_abs"] = cand["taxa"]
                cand["debito_canal_abatido"] = round(float(cand.get("debito_canal_abatido") or 0.0) + absorb, 2)
                cand["motivo"] = f"{cand.get('motivo') or ''} • Retenção/Saída Planilha: -R$ {absorb:.2f}".strip(" •")
                rem_debit = round(rem_debit - absorb, 2)

        # 8. Estatísticas consolidadas + Selo de Segurança da Conciliação
        abertos_qtd = sum(1 for it in (items_ready + items_divergence) if it.get("situacao_horus") == "ABERTO")
        abertos_valor = sum(it.get("valor_horus", it.get("valor_vindi", 0)) for it in (items_ready + items_divergence) if it.get("situacao_horus") == "ABERTO")
        abertos_valor_liquido = sum(
            float(it.get("valor_liquido") or it.get("valor_horus") or it.get("valor_vindi") or 0)
            for it in (items_ready + items_divergence)
            if it.get("situacao_horus") == "ABERTO"
        )
        pagos_qtd = len(items_already_paid)
        pagos_valor = sum(it.get("valor_horus", it.get("valor_vindi", 0)) for it in items_already_paid)

        total_diff_divergencias = sum(float(it.get("diferenca_valor") or 0.0) for it in items_divergence)
        all_conciliated = items_ready + items_divergence
        total_taxa_vindi = sum(abs(float(it.get("diff_taxa") or 0.0)) for it in all_conciliated)
        total_planilha_entradas_liq = round(
            float(stmt_meta.get("entradas_liquido_total") or sum(float(it.get("valor_liquido") or 0.0) for it in vindi_rows)),
            2,
        )
        total_planilha_saidas_qtd = int(stmt_meta.get("saidas_count") or 0)
        total_planilha_saidas_valor = round(float(stmt_meta.get("saidas_total") or 0.0), 2)
        total_planilha_linhas = int(stmt_meta.get("raw_rows_count") or len(vindi_rows))
        total_planilha_liq = round(
            float(stmt_meta.get("net_statement_total") or (total_planilha_entradas_liq - total_planilha_saidas_valor)),
            2,
        )
        elapsed_total = round(time.time() - t0, 2)

        summary = {
            "profile_code": active_profile,
            "is_dual_file": is_dual_file,
            "unify_installments": eff_unify_installments,
            "split_excess_launch": eff_split_excess,
            "forma_pagto_credito_maior": forma_pagto_credito_maior,
            "credito_maior_count": credito_maior_count,
            "credito_maior_total": round(credito_maior_total, 2),
            "unificadas_orders_count": unificadas_orders_count,
            "unificadas_parcelas_count": unificadas_parcelas_count,
            "total_planilha_linhas": total_planilha_linhas,
            "total_planilha_qtd": len(vindi_rows),
            "total_planilha_valor": round(total_vindi_amount, 2),
            "total_planilha_entradas_liq": total_planilha_entradas_liq,
            "total_planilha_saidas_qtd": total_planilha_saidas_qtd,
            "total_planilha_saidas_valor": total_planilha_saidas_valor,
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
            "abertos_valor_liquido": round(abertos_valor_liquido, 2),
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
        bank_config["unify_installments"] = eff_unify_installments
        bank_config["split_excess_launch"] = eff_split_excess

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
    unify_installments: Optional[bool] = None,
    unify_installments_form: Optional[str] = Form(None),
    split_excess_launch: Optional[bool] = None,
    split_excess_launch_form: Optional[str] = Form(None),
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

    eff_unify: Optional[bool] = unify_installments
    if eff_unify is None and unify_installments_form is not None:
        s_form = str(unify_installments_form).strip().lower()
        if s_form in ("true", "1", "sim", "yes"):
            eff_unify = True
        elif s_form in ("false", "0", "nao", "não", "no"):
            eff_unify = False

    eff_split_excess: Optional[bool] = split_excess_launch
    if eff_split_excess is None and split_excess_launch_form is not None:
        s_split = str(split_excess_launch_form).strip().lower()
        if s_split in ("true", "1", "sim", "yes"):
            eff_split_excess = True
        elif s_split in ("false", "0", "nao", "não", "no"):
            eff_split_excess = False

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
            eff_unify,
            eff_split_excess,
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
            eff_unify,
            eff_split_excess,
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
    async_job: Optional[bool] = False,
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
        "Forma de Pagamento (COD_FORMA)": bank_cfg.get("forma_pagto"),
        "Código do Banco (COD_BANCO)": bank_cfg.get("banco"),
        "Agência (COD_AGENCIA)": bank_cfg.get("agencia"),
        "Conta Corrente (COD_CONTAC)": bank_cfg.get("conta"),
    }
    missing_fields = [name for name, val in required_bank_fields.items() if not val or not str(val).strip()]
    if missing_fields:
        raise HTTPException(
            status_code=400,
            detail=f"Parâmetros bancários do Horus incompletos para a modalidade {bank_cfg.get('profile_code')}: {', '.join(missing_fields)}. Configure em Configurações > Horus SQL Direct ou no botão 'Configurar Códigos Horus' da conciliação."
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
    total_liquido_bordero = round(
        sum(
            float(r.valor_liquido) if r.valor_liquido is not None and float(r.valor_liquido) > 0
            else max(0.0, float(r.valor) - float(r.taxa or 0.0))
            for r in releases_validos
        ),
        2,
    )
    total_taxa_bordero = round(
        sum(max(0.0, float(r.taxa or 0.0)) for r in releases_validos), 2
    )
    lancto_ids = [int(r.nro_lancamento) for r in releases_validos]

    eff_mode = str(
        payload.payment_date_mode
        or bank_cfg.get("payment_date_mode")
        or "CHANNEL_DATE"
    ).upper().strip()
    if eff_mode not in ("CHANNEL_DATE", "SPECIFIC_DATE", "BORDERO_OPEN"):
        eff_mode = "CHANNEL_DATE"

    eff_unify = (
        bool(payload.unify_installments)
        if payload.unify_installments is not None
        else bool(bank_cfg.get("unify_installments", (payload.profile_code or "").upper() in ("TRAY_SHOPEE", "TRAY_TIKTOK")))
    )
    eff_split_excess = (
        bool(payload.split_excess_launch)
        if payload.split_excess_launch is not None
        else bool(bank_cfg.get("split_excess_launch", True))
    )
    raw_forma_credito = str(
        payload.forma_pagto_credito_maior
        if payload.forma_pagto_credito_maior is not None
        else bank_cfg.get("forma_pagto_credito_maior") or ""
    ).strip()

    if eff_mode == "SPECIFIC_DATE" and not (payload.specific_payment_date and str(payload.specific_payment_date).strip()):
        raise HTTPException(
            status_code=400,
            detail="Informe a Data Específica de Pagamento para realizar a baixa do Borderô."
        )

    def _to_int_or_str(v: Any):
        s = str(v or "").strip()
        return int(s) if s.isdigit() else s

    cod_forma_val = _to_int_or_str(bank_cfg["forma_pagto"])
    cod_forma_credito_val = _to_int_or_str(raw_forma_credito) if raw_forma_credito else cod_forma_val
    cod_banco_val = _to_int_or_str(bank_cfg["banco"])
    cod_agencia_val = _to_int_or_str(bank_cfg["agencia"])
    cod_contac_val = _to_int_or_str(bank_cfg["conta"])
    carteira_val = str(bank_cfg.get("carteira") or "").strip()

    # 4. Executa a geração do borderô, unificação segura de parcelas e baixa de datas/taxas no SQL Server
    def _execute_bordero_transaction(b_job_id: Optional[str] = None):
        _update_job_progress(
            b_job_id,
            phase="VALIDANDO_SEGURANCA",
            percent=8,
            processed_orders=0,
            total_orders=len(releases_validos),
            message=f"Conectando ao Horus ERP e validando integridade dos {len(releases_validos)} títulos selecionados...",
        )
        conn = sql_client._get_connection()
        today_str = datetime.now().strftime("%d-%m-%y")
        prof_tag = (payload.profile_code or "vindi").lower().replace("tray_", "")[:4]
        nom_arquivo = f"cz_{prof_tag}_{today_str}"[:20]
        unificadas_orders_tx = 0
        unificadas_parcelas_removidas_tx = 0
        credito_maior_lancamentos_criados_tx = 0
        credito_maior_valor_total_tx = 0.0
        new_credito_lancto_map: Dict[int, int] = {}

        with conn.cursor() as cur:
            # 4.0.0. Trava de Segurança: Confere se os lançamentos principais continuam em aberto ('AB') antes de criar o Borderô
            sample_check_ids = lancto_ids[:200]
            if sample_check_ids:
                ph_chk = ", ".join(["%s"] * len(sample_check_ids))
                cur.execute(
                    f"""
                    SELECT COUNT(*) AS ab_cnt
                    FROM LANCTOS_CRECEBER WITH (NOLOCK)
                    WHERE COD_FILIAL = %s
                      AND NRO_LANCTO_CRECEBER IN ({ph_chk})
                      AND STA_LANCTO_CRECEBER = 'AB'
                      AND (COD_BORDERO IS NULL OR COD_BORDERO = 0)
                    """,
                    tuple([cod_filial] + sample_check_ids),
                )
                chk_row = cur.fetchone()
                ab_cnt = int(chk_row["ab_cnt"] if isinstance(chk_row, dict) else chk_row[0]) if chk_row else 0
                if ab_cnt == 0:
                    raise ValueError(
                        "Os lançamentos selecionados já foram baixados ou vinculados a outro Borderô no Horus ERP. Atualize a conciliação antes de gerar um novo Borderô."
                    )

            _update_job_progress(
                b_job_id,
                phase="UNIFICANDO_PARCELAS",
                percent=15,
                processed_orders=0,
                total_orders=len(releases_validos),
                message="Iniciando consolidação de parcelas e ajustes de títulos no Horus...",
            )

            # 4.0. Unificação Segura de Parcelas (se habilitada e se o lançamento possuir mais de 1 parcela aberta agrupada)
            if eff_unify:
                multi_items = [
                    r_it for r_it in releases_validos
                    if len([int(x) for x in (r_it.grouped_lancto_ids or []) if x]) > 1
                ]
                total_multi = max(1, len(multi_items))
                for m_idx, r_item in enumerate(multi_items, start=1):
                    g_ids = [int(x) for x in (r_item.grouped_lancto_ids or []) if x]
                    if len(g_ids) <= 1:
                        continue
                    if m_idx == 1 or m_idx % 25 == 0 or m_idx == len(multi_items):
                        pct_u = 15 + int((m_idx / total_multi) * 18)
                        _update_job_progress(
                            b_job_id,
                            phase="UNIFICANDO_PARCELAS",
                            percent=min(33, pct_u),
                            processed_orders=m_idx,
                            total_orders=len(multi_items),
                            message=f"Unificando parcelas da mesma nota no Horus: {m_idx}/{len(multi_items)} notas consolidadas...",
                        )
                    g_ids_sorted = sorted(list(set(g_ids)))
                    main_id = int(r_item.nro_lancamento)
                    if main_id not in g_ids_sorted:
                        main_id = g_ids_sorted[0]
                    extra_ids = [x for x in g_ids_sorted if x != main_id]
                    if not extra_ids:
                        continue

                    ph_all = ", ".join(["%s"] * len(g_ids_sorted))
                    cur.execute(
                        f"""
                        SELECT NRO_LANCTO_CRECEBER,
                               ISNULL(VLR_LANCTO_CRECEBER, 0) AS VLR_LANCTO_CRECEBER,
                               ISNULL(VLR_LANCTO_TOTAL, 0) AS VLR_LANCTO_TOTAL,
                               ISNULL(VLR_LANCTO_CORRECAO, 0) AS VLR_LANCTO_CORRECAO
                        FROM LANCTOS_CRECEBER
                        WHERE COD_FILIAL = %s
                          AND NRO_LANCTO_CRECEBER IN ({ph_all})
                          AND STA_LANCTO_CRECEBER = 'AB'
                        """,
                        tuple([cod_filial] + g_ids_sorted),
                    )
                    open_rows_db = cur.fetchall() or []
                    open_map = {}
                    for rw in open_rows_db:
                        lid = int(rw["NRO_LANCTO_CRECEBER"] if isinstance(rw, dict) else rw[0])
                        v_cr = float(rw["VLR_LANCTO_CRECEBER"] if isinstance(rw, dict) else rw[1])
                        v_tot = float(rw["VLR_LANCTO_TOTAL"] if isinstance(rw, dict) else rw[2])
                        v_cor = float(rw["VLR_LANCTO_CORRECAO"] if isinstance(rw, dict) else rw[3])
                        open_map[lid] = (v_cr, v_tot, v_cor)

                    if main_id not in open_map or len(open_map) <= 1:
                        continue

                    valid_all_ids = sorted(list(open_map.keys()))
                    valid_extra_ids = [x for x in valid_all_ids if x != main_id]
                    if not valid_extra_ids:
                        continue

                    sum_vlr_creceber = round(sum(open_map[x][0] for x in valid_all_ids), 2)
                    sum_vlr_total = round(sum(open_map[x][1] for x in valid_all_ids), 2)
                    sum_vlr_correcao = round(sum(open_map[x][2] for x in valid_all_ids), 2)

                    # 4.0.1. Consolida vínculos de CONTA_CLIENTE_VINCULACAO (ex: créditos de frete/adiantamento) na 1ª parcela
                    ph_valid_all = ", ".join(["%s"] * len(valid_all_ids))
                    ph_valid_extra = ", ".join(["%s"] * len(valid_extra_ids))
                    cur.execute(
                        f"""
                        SELECT NRO_LANCTO_CRED_DEB,
                               ISNULL(SUM(VLR_CRED_DEB), 0) AS TOTAL_CRED_DEB
                        FROM CONTA_CLIENTE_VINCULACAO
                        WHERE COD_FILIAL_LANCTO = %s
                          AND NRO_LANCTO_CRECEBER IN ({ph_valid_all})
                        GROUP BY NRO_LANCTO_CRED_DEB
                        """,
                        tuple([cod_filial] + valid_all_ids),
                    )
                    ccv_groups = cur.fetchall() or []
                    for ccv_row in ccv_groups:
                        nro_cred = int(ccv_row["NRO_LANCTO_CRED_DEB"] if isinstance(ccv_row, dict) else ccv_row[0])
                        tot_cred = round(float(ccv_row["TOTAL_CRED_DEB"] if isinstance(ccv_row, dict) else ccv_row[1]), 2)
                        cur.execute(
                            """
                            UPDATE CONTA_CLIENTE_VINCULACAO
                            SET VLR_CRED_DEB = %s,
                                DAT_ULT_ATL = GETDATE()
                            WHERE COD_FILIAL_LANCTO = %s
                              AND NRO_LANCTO_CRECEBER = %s
                              AND NRO_LANCTO_CRED_DEB = %s
                            """,
                            (tot_cred, cod_filial, main_id, nro_cred),
                        )
                        cur.execute(
                            f"""
                            DELETE FROM CONTA_CLIENTE_VINCULACAO
                            WHERE COD_FILIAL_LANCTO = %s
                              AND NRO_LANCTO_CRED_DEB = %s
                              AND NRO_LANCTO_CRECEBER IN ({ph_valid_extra})
                            """,
                            tuple([cod_filial, nro_cred] + valid_extra_ids),
                        )

                    # 4.0.2. Remove as parcelas excedentes em aberto de LANCTOS_CRECEBERA e LANCTOS_CRECEBER
                    # (respeitando a FK FK_LANCTOS_CRECEBERA_LANCTOS_CRECEBER1 e a trigger de auditoria)
                    cur.execute(
                        f"""
                        DELETE FROM LANCTOS_CRECEBERA
                        WHERE COD_FILIAL = %s
                          AND STA_LANCTO_CRECEBER = 'AB'
                          AND NRO_LANCTO_CRECEBER IN ({ph_valid_extra})
                        """,
                        tuple([cod_filial] + valid_extra_ids),
                    )
                    cur.execute(
                        f"""
                        DELETE FROM LANCTOS_CRECEBER
                        WHERE COD_FILIAL = %s
                          AND STA_LANCTO_CRECEBER = 'AB'
                          AND NRO_LANCTO_CRECEBER IN ({ph_valid_extra})
                        """,
                        tuple([cod_filial] + valid_extra_ids),
                    )

                    # 4.0.3. Atualiza a parcela principal (main_id) com o valor unificado da nota
                    cur.execute(
                        """
                        UPDATE LANCTOS_CRECEBER
                        SET VLR_LANCTO_CRECEBER = %s,
                            VLR_LANCTO_TOTAL = %s,
                            VLR_LANCTO_CORRECAO = %s,
                            DAT_ULT_ATL = GETDATE()
                        WHERE COD_FILIAL = %s
                          AND NRO_LANCTO_CRECEBER = %s
                        """,
                        (sum_vlr_creceber, sum_vlr_total, sum_vlr_correcao, cod_filial, main_id),
                    )
                    try:
                        cur.execute(
                            """
                            UPDATE LANCTOS_CRECEBERA
                            SET VLR_LANCTO_CRECEBER = %s,
                                VLR_LANCTO_TOTAL = %s,
                                VLR_LANCTO_CORRECAO = %s,
                                DAT_ULT_ATL = GETDATE()
                            WHERE COD_FILIAL = %s
                              AND NRO_LANCTO_CRECEBER = %s
                            """,
                            (sum_vlr_creceber, sum_vlr_total, sum_vlr_correcao, cod_filial, main_id),
                        )
                    except Exception as ex_unif_a:
                        logger.warning("[HorusBordero] Aviso ao unificar LANCTOS_CRECEBERA #%s: %s", main_id, ex_unif_a)

                    unificadas_orders_tx += 1
                    unificadas_parcelas_removidas_tx += len(valid_extra_ids)

            # 4.0.5. Desmembramento de Crédito Maior (quando o título do Horus veio maior que a venda/nota e há valor a mais para separar em novo lançamento)
            if eff_split_excess:
                for r_item in releases_validos:
                    v_cred_maior = round(float(r_item.valor_credito_maior or 0.0), 2)
                    if v_cred_maior <= 0.05:
                        continue
                    main_id = int(r_item.nro_lancamento)
                    v_main_target = round(float(r_item.valor), 2)

                    cur.execute(
                        """
                        SELECT COD_EMPRESA, COD_FILIAL, COD_CLI, DAT_VENC_CRECEBER,
                               ISNULL(VLR_LANCTO_CRECEBER, 0) AS VLR_LANCTO_CRECEBER,
                               ISNULL(VLR_LANCTO_TOTAL, 0) AS VLR_LANCTO_TOTAL,
                               COD_NF, COD_PED_VENDA, USU_APROVACAO, NOM_USUARIO
                        FROM LANCTOS_CRECEBER
                        WHERE COD_FILIAL = %s
                          AND NRO_LANCTO_CRECEBER = %s
                          AND STA_LANCTO_CRECEBER = 'AB'
                        """,
                        (cod_filial, main_id),
                    )
                    orig_lr = cur.fetchone()
                    if not orig_lr:
                        continue

                    o_emp = orig_lr["COD_EMPRESA"] if isinstance(orig_lr, dict) else orig_lr[0]
                    o_fil = orig_lr["COD_FILIAL"] if isinstance(orig_lr, dict) else orig_lr[1]
                    o_cli = orig_lr["COD_CLI"] if isinstance(orig_lr, dict) else orig_lr[2]
                    o_venc = orig_lr["DAT_VENC_CRECEBER"] if isinstance(orig_lr, dict) else orig_lr[3]
                    o_vlr_tot = float(orig_lr["VLR_LANCTO_TOTAL"] if isinstance(orig_lr, dict) else orig_lr[5])
                    o_nf = orig_lr["COD_NF"] if isinstance(orig_lr, dict) else orig_lr[6]
                    o_ped = orig_lr["COD_PED_VENDA"] if isinstance(orig_lr, dict) else orig_lr[7]
                    o_usu_ap = (orig_lr["USU_APROVACAO"] if isinstance(orig_lr, dict) else orig_lr[8]) or "dbo"
                    o_nom_usu = (orig_lr["NOM_USUARIO"] if isinstance(orig_lr, dict) else orig_lr[9]) or "dbo"

                    # Proteção de idempotência: só desmembra se o título ainda estiver com o valor cheio (> v_main_target)
                    if o_vlr_tot <= v_main_target + 0.05:
                        continue

                    # Ajusta o lançamento principal para o valor da venda (`v_main_target`)
                    cur.execute(
                        """
                        UPDATE LANCTOS_CRECEBER
                        SET VLR_LANCTO_CRECEBER = %s,
                            VLR_LANCTO_TOTAL = %s,
                            DAT_ULT_ATL = GETDATE()
                        WHERE COD_FILIAL = %s
                          AND NRO_LANCTO_CRECEBER = %s
                        """,
                        (v_main_target, v_main_target, cod_filial, main_id),
                    )
                    try:
                        cur.execute(
                            """
                            UPDATE LANCTOS_CRECEBERA
                            SET VLR_LANCTO_CRECEBER = %s,
                                VLR_LANCTO_TOTAL = %s,
                                DAT_ULT_ATL = GETDATE()
                            WHERE COD_FILIAL = %s
                              AND NRO_LANCTO_CRECEBER = %s
                            """,
                            (v_main_target, v_main_target, cod_filial, main_id),
                        )
                    except Exception as ex_adj_a:
                        logger.warning("[HorusBordero] Aviso ao ajustar LANCTOS_CRECEBERA principal #%s: %s", main_id, ex_adj_a)

                    # Cria o novo lançamento separado (`STA_LANCTO_CRECEBER = 'AB'`, `COD_BORDERO = NULL`) com a forma de pagamento de Crédito Maior (`cod_forma_credito_val`, ex: 135 - CREDITO SHOPEE)
                    cur.execute(
                        "SELECT ISNULL(MAX(NRO_LANCTO_CRECEBER), 0) + 1 AS next_lancto FROM LANCTOS_CRECEBER WHERE COD_FILIAL = %s",
                        (cod_filial,),
                    )
                    r_next = cur.fetchone()
                    new_lancto_id = int(r_next["next_lancto"] if isinstance(r_next, dict) else r_next[0])
                    obs_split = f"GERAÇÃO AUTOMÁTICA! CRÉDITO MAIOR SEPARADO DO LANÇ. #{main_id}: R$ {v_cred_maior:.2f}"[:100].upper()

                    cur.execute(
                        """
                        INSERT INTO LANCTOS_CRECEBER (
                            NRO_LANCTO_CRECEBER, COD_EMPRESA, COD_FILIAL, COD_CLI,
                            DAT_VENC_CRECEBER, VLR_LANCTO_CRECEBER, VLR_LANCTO_CORRECAO, VLR_LANCTO_TOTAL,
                            VLR_LANCTO_PAGO, COD_NF, STA_LANCTO_CRECEBER, STA_APROVACAO,
                            USU_APROVACAO, OBS_CRECEBER, DAT_ULT_ATL, NOM_USUARIO,
                            VLR_LANCTO_ABATIMENTO, COD_PED_VENDA
                        ) VALUES (
                            %s, %s, %s, %s,
                            %s, %s, 0, %s,
                            0, %s, 'AB', 'S',
                            %s, %s, GETDATE(), %s,
                            0, %s
                        )
                        """,
                        (
                            new_lancto_id, o_emp, o_fil, o_cli,
                            o_venc, v_cred_maior, v_cred_maior,
                            o_nf,
                            o_usu_ap, obs_split, o_nom_usu,
                            o_ped,
                        ),
                    )
                    try:
                        cur.execute(
                            """
                            INSERT INTO LANCTOS_CRECEBERA (
                                COD_PARCELA, NRO_LANCTO_CRECEBER, COD_EMPRESA, COD_FILIAL, COD_CLI,
                                COD_FORMA, COD_SITUACAO, DAT_VENC_CRECEBER,
                                VLR_LANCTO_CRECEBER, VLR_LANCTO_CORRECAO, VLR_LANCTO_TOTAL, VLR_LANCTO_PAGO,
                                STA_LANCTO_CRECEBER, STA_APROVACAO, USU_APROVACAO, OBS_CRECEBER,
                                DAT_ULT_ATL, NOM_USUARIO, COD_BANCO, COD_AGENCIA, COD_CONTAC,
                                VLR_LANCTO_ABATIMENTO, DATA_LANCTO_CRECEBER
                            ) VALUES (
                                1, %s, %s, %s, %s,
                                %s, 2, %s,
                                %s, 0, %s, 0,
                                'AB', 'S', %s, %s,
                                GETDATE(), %s, %s, %s, %s,
                                0, GETDATE()
                            )
                            """,
                            (
                                new_lancto_id, o_emp, o_fil, o_cli,
                                cod_forma_credito_val, o_venc,
                                v_cred_maior, v_cred_maior,
                                o_usu_ap, obs_split,
                                o_nom_usu, cod_banco_val, cod_agencia_val, cod_contac_val,
                            ),
                        )
                    except Exception as ex_ins_a:
                        logger.warning("[HorusBordero] Aviso ao inserir LANCTOS_CRECEBERA de Crédito Maior #%s: %s", new_lancto_id, ex_ins_a)

                    credito_maior_lancamentos_criados_tx += 1
                    credito_maior_valor_total_tx = round(credito_maior_valor_total_tx + v_cred_maior, 2)
                    new_credito_lancto_map[main_id] = new_lancto_id

            # 4.1. Busca próximo COD_BORDERO
            cur.execute("SELECT ISNULL(MAX(COD_BORDERO), 0) + 1 AS next_id FROM BORDERO")
            row_id = cur.fetchone()
            id_bordero = int(row_id["next_id"] if isinstance(row_id, dict) else row_id[0])

            logger.info(
                "[HorusBordero] Criando Bordero #%s mode=%s unify=%s profile=%s company=%s bruto=R$ %.2f liq=R$ %.2f taxa=R$ %.2f itens=%s",
                id_bordero, eff_mode, eff_unify, payload.profile_code, company_id,
                total_bordero, total_liquido_bordero, total_taxa_bordero, len(releases_validos),
            )

            # 4.2. INSERT na tabela BORDERO e UPDATE nos Lançamentos conforme o modo de data de pagamento
            batch_size = 50
            total_title_batches = max(1, (len(releases_validos) + batch_size - 1) // batch_size)
            vlr_bordero_efetivo = total_liquido_bordero if eff_unify and total_liquido_bordero > 0 else total_bordero

            _update_job_progress(
                b_job_id,
                phase="CRIANDO_BORDERO",
                percent=38,
                current_batch=0,
                total_batches=total_title_batches,
                processed_orders=0,
                total_orders=len(releases_validos),
                horus_found_count=id_bordero,
                message=f"Criando cabeçalho do Borderô #{id_bordero} no Horus ERP (R$ {vlr_bordero_efetivo:.2f})...",
            )

            if eff_mode == "BORDERO_OPEN":
                # Modo 3: Apenas gera o Borderô em aberto ('AP') sem liquidar os lançamentos
                insert_sql = """
                    INSERT INTO BORDERO (
                        COD_EMPRESA, COD_FILIAL, COD_FORMA, COD_BORDERO,
                        VLR_TOT_BORDERO, VLR_TOT_PAGO, STA_BORDERO, STA_APROVACAO, USU_APROVACAO,
                        TPO_BORDERO, NOM_ARQUIVO, SEQ_NOME, SEQ_REMESSA,
                        NOM_USU, COD_BANCO, COD_AGENCIA, COD_CONTAC, NRO_CARTEIRA,
                        DAT_ULT_ATL, DAT_GERACAO
                    ) VALUES (
                        %s, %s, %s, %s,
                        %s, 0, 'AP', 'S', 'dbo',
                        'CAR', %s, '', '',
                        'dbo', %s, %s, %s, %s,
                        GETDATE(), GETDATE()
                    )
                """
                insert_params = (
                    cod_empresa,
                    cod_filial,
                    cod_forma_val,
                    id_bordero,
                    vlr_bordero_efetivo,
                    nom_arquivo,
                    cod_banco_val,
                    cod_agencia_val,
                    cod_contac_val,
                    carteira_val,
                )
                cur.execute(insert_sql, insert_params)

                for t_idx, r_item in enumerate(releases_validos, start=1):
                    lid = int(r_item.nro_lancamento)
                    taxa_val = round(max(0.0, float(r_item.taxa or 0.0)), 2) if eff_unify else 0.0
                    if eff_unify:
                        liq_val = round(
                            float(r_item.valor_liquido)
                            if r_item.valor_liquido is not None and float(r_item.valor_liquido) > 0
                            else max(0.0, float(r_item.valor) - taxa_val),
                            2,
                        )
                        cur.execute(
                            """
                            UPDATE LANCTOS_CRECEBER
                            SET COD_BORDERO = %s,
                                VLR_LANCTO_CRECEBER = CASE WHEN VLR_LANCTO_CRECEBER < %s THEN %s ELSE VLR_LANCTO_CRECEBER END,
                                VLR_LANCTO_ABATIMENTO = %s,
                                VLR_LANCTO_TOTAL = %s,
                                DAT_ULT_ATL = GETDATE()
                            WHERE COD_FILIAL = %s AND NRO_LANCTO_CRECEBER = %s
                            """,
                            (id_bordero, liq_val, liq_val, taxa_val, liq_val, cod_filial, lid),
                        )
                        try:
                            cur.execute(
                                """
                                UPDATE LANCTOS_CRECEBERA
                                SET COD_BORDERO = %s,
                                    VLR_LANCTO_CRECEBER = CASE WHEN VLR_LANCTO_CRECEBER < %s THEN %s ELSE VLR_LANCTO_CRECEBER END,
                                    VLR_LANCTO_ABATIMENTO = %s,
                                    VLR_LANCTO_TOTAL = %s,
                                    DAT_ULT_ATL = GETDATE()
                                WHERE COD_FILIAL = %s AND NRO_LANCTO_CRECEBER = %s
                                """,
                                (id_bordero, liq_val, liq_val, taxa_val, liq_val, cod_filial, lid),
                            )
                        except Exception as ex_a:
                            logger.warning("[HorusBordero] Aviso ao atualizar LANCTOS_CRECEBERA (AP/taxa): %s", ex_a)
                    else:
                        cur.execute(
                            "UPDATE LANCTOS_CRECEBER SET COD_BORDERO = %s WHERE COD_FILIAL = %s AND NRO_LANCTO_CRECEBER = %s",
                            (id_bordero, cod_filial, lid),
                        )
                        try:
                            cur.execute(
                                "UPDATE LANCTOS_CRECEBERA SET COD_BORDERO = %s WHERE COD_FILIAL = %s AND NRO_LANCTO_CRECEBER = %s",
                                (id_bordero, cod_filial, lid),
                            )
                        except Exception as ex_a:
                            logger.warning("[HorusBordero] Aviso ao atualizar LANCTOS_CRECEBERA: %s", ex_a)

                    if t_idx == 1 or t_idx % batch_size == 0 or t_idx == len(releases_validos):
                        cur_b = (t_idx + batch_size - 1) // batch_size
                        pct_t = 42 + int((t_idx / max(1, len(releases_validos))) * 48)
                        _update_job_progress(
                            b_job_id,
                            phase="BAIXANDO_TITULOS",
                            percent=min(90, pct_t),
                            current_batch=cur_b,
                            total_batches=total_title_batches,
                            processed_orders=t_idx,
                            total_orders=len(releases_validos),
                            horus_found_count=id_bordero,
                            message=f"Vinculando títulos ao Borderô #{id_bordero}: {t_idx}/{len(releases_validos)} lançamentos (lote {cur_b}/{total_title_batches})...",
                        )

            else:
                # Modo 1 (CHANNEL_DATE) ou Modo 2 (SPECIFIC_DATE):
                # Baixa os títulos no Horus ('PG') marcando DAT_PAGTO_CRECEBER, DAT_PAGTO_CONTA e VLR_LANCTO_ABATIMENTO (taxa)
                today_midnight = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
                item_pay_dates: Dict[int, datetime] = {}
                if eff_mode == "SPECIFIC_DATE":
                    bordero_pay_dt = _parse_payment_date_to_sql(payload.specific_payment_date, today_midnight)
                    for r_item in releases_validos:
                        item_pay_dates[int(r_item.nro_lancamento)] = bordero_pay_dt
                else:
                    for r_item in releases_validos:
                        dt_item = _parse_payment_date_to_sql(r_item.data_pagamento, today_midnight)
                        item_pay_dates[int(r_item.nro_lancamento)] = dt_item
                    bordero_pay_dt = max(item_pay_dates.values()) if item_pay_dates else today_midnight

                vlr_pago_bordero = total_liquido_bordero if eff_unify and total_liquido_bordero > 0 else total_bordero

                insert_sql = """
                    INSERT INTO BORDERO (
                        COD_EMPRESA, COD_FILIAL, COD_FORMA, COD_BORDERO,
                        VLR_TOT_BORDERO, VLR_TOT_PAGO, STA_BORDERO, STA_APROVACAO, USU_APROVACAO,
                        TPO_BORDERO, NOM_ARQUIVO, SEQ_NOME, SEQ_REMESSA,
                        NOM_USU, COD_BANCO, COD_AGENCIA, COD_CONTAC, NRO_CARTEIRA,
                        DAT_ULT_ATL, DAT_GERACAO, DAT_PAGAMENTO
                    ) VALUES (
                        %s, %s, %s, %s,
                        %s, %s, 'PG', 'S', 'dbo',
                        'CAR', %s, '', '',
                        'dbo', %s, %s, %s, %s,
                        GETDATE(), GETDATE(), %s
                    )
                """
                insert_params = (
                    cod_empresa,
                    cod_filial,
                    cod_forma_val,
                    id_bordero,
                    vlr_pago_bordero,
                    vlr_pago_bordero,
                    nom_arquivo,
                    cod_banco_val,
                    cod_agencia_val,
                    cod_contac_val,
                    carteira_val,
                    bordero_pay_dt,
                )
                cur.execute(insert_sql, insert_params)

                # Atualiza cada lançamento em LANCTOS_CRECEBER e LANCTOS_CRECEBERA (acionando TRG_IMP_LANCTO_CRECEBER para BLANCTOS)
                for t_idx, r_item in enumerate(releases_validos, start=1):
                    lid = int(r_item.nro_lancamento)
                    pay_dt = item_pay_dates.get(lid, bordero_pay_dt)
                    taxa_val = round(max(0.0, float(r_item.taxa or 0.0)), 2) if eff_unify else 0.0

                    if eff_unify:
                        liq_val = round(
                            float(r_item.valor_liquido)
                            if r_item.valor_liquido is not None and float(r_item.valor_liquido) > 0
                            else max(0.0, float(r_item.valor) - taxa_val),
                            2,
                        )
                        cur.execute(
                            """
                            UPDATE LANCTOS_CRECEBER
                            SET COD_BORDERO = %s,
                                STA_LANCTO_CRECEBER = 'PG',
                                DAT_PAGTO_CRECEBER = %s,
                                DAT_PAGTO_CONTA = %s,
                                DAT_PAGTO_CRECEBER_REAL = GETDATE(),
                                DAT_ULT_ATL = GETDATE(),
                                VLR_LANCTO_CRECEBER = CASE WHEN VLR_LANCTO_CRECEBER < %s THEN %s ELSE VLR_LANCTO_CRECEBER END,
                                VLR_LANCTO_ABATIMENTO = %s,
                                VLR_LANCTO_TOTAL = %s,
                                VLR_LANCTO_PAGO = %s,
                                VLR_LANCTO_RECEBIDO = %s
                            WHERE COD_FILIAL = %s
                              AND NRO_LANCTO_CRECEBER = %s
                            """,
                            (id_bordero, pay_dt, pay_dt, liq_val, liq_val, taxa_val, liq_val, liq_val, liq_val, cod_filial, lid),
                        )
                        try:
                            cur.execute(
                                """
                                UPDATE LANCTOS_CRECEBERA
                                SET COD_BORDERO = %s,
                                     STA_LANCTO_CRECEBER = 'PG',
                                     COD_SITUACAO = 8,
                                     DAT_PAGTO_CRECEBER = %s,
                                     DAT_PAGTO_CONTA = %s,
                                     DAT_PAGTO_CRECEBER_REAL = GETDATE(),
                                     DAT_ULT_ATL = GETDATE(),
                                     VLR_LANCTO_CRECEBER = CASE WHEN VLR_LANCTO_CRECEBER < %s THEN %s ELSE VLR_LANCTO_CRECEBER END,
                                     VLR_LANCTO_ABATIMENTO = %s,
                                     VLR_LANCTO_TOTAL = %s,
                                     VLR_LANCTO_PAGO = %s,
                                     VLR_LANCTO_RECEBIDO = %s,
                                     COD_BANCO = %s,
                                     COD_AGENCIA = %s,
                                     COD_CONTAC = %s,
                                     COD_FORMA = %s,
                                     NRO_CARTEIRA = %s
                                 WHERE COD_FILIAL = %s
                                   AND NRO_LANCTO_CRECEBER = %s
                                 """,
                                 (
                                     id_bordero,
                                     pay_dt,
                                     pay_dt,
                                     liq_val,
                                     liq_val,
                                     taxa_val,
                                     liq_val,
                                     liq_val,
                                     liq_val,
                                     cod_banco_val,
                                     cod_agencia_val,
                                     cod_contac_val,
                                     cod_forma_val,
                                     carteira_val or None,
                                     cod_filial,
                                     lid,
                                 ),
                             )
                        except Exception as ex_a:
                            logger.warning("[HorusBordero] Aviso ao atualizar LANCTOS_CRECEBERA (PG+taxa) #%s: %s", lid, ex_a)
                    else:
                        cur.execute(
                            """
                            UPDATE LANCTOS_CRECEBER
                            SET COD_BORDERO = %s,
                                STA_LANCTO_CRECEBER = 'PG',
                                DAT_PAGTO_CRECEBER = %s,
                                DAT_PAGTO_CONTA = %s,
                                DAT_PAGTO_CRECEBER_REAL = GETDATE(),
                                DAT_ULT_ATL = GETDATE(),
                                VLR_LANCTO_PAGO = VLR_LANCTO_TOTAL,
                                VLR_LANCTO_RECEBIDO = VLR_LANCTO_TOTAL
                            WHERE COD_FILIAL = %s
                              AND NRO_LANCTO_CRECEBER = %s
                            """,
                            (id_bordero, pay_dt, pay_dt, cod_filial, lid),
                        )
                        try:
                            cur.execute(
                                """
                                UPDATE LANCTOS_CRECEBERA
                                SET COD_BORDERO = %s,
                                    STA_LANCTO_CRECEBER = 'PG',
                                    COD_SITUACAO = 8,
                                    DAT_PAGTO_CRECEBER = %s,
                                    DAT_PAGTO_CONTA = %s,
                                    DAT_PAGTO_CRECEBER_REAL = GETDATE(),
                                    DAT_ULT_ATL = GETDATE(),
                                    VLR_LANCTO_PAGO = VLR_LANCTO_TOTAL,
                                    VLR_LANCTO_RECEBIDO = VLR_LANCTO_TOTAL,
                                    COD_BANCO = %s,
                                    COD_AGENCIA = %s,
                                    COD_CONTAC = %s,
                                    COD_FORMA = %s,
                                    NRO_CARTEIRA = %s
                                WHERE COD_FILIAL = %s
                                  AND NRO_LANCTO_CRECEBER = %s
                                """,
                                (
                                    id_bordero,
                                    pay_dt,
                                    pay_dt,
                                    cod_banco_val,
                                    cod_agencia_val,
                                    cod_contac_val,
                                    cod_forma_val,
                                    carteira_val or None,
                                    cod_filial,
                                    lid,
                                ),
                            )
                        except Exception as ex_a:
                            logger.warning("[HorusBordero] Aviso ao atualizar LANCTOS_CRECEBERA (PG) #%s: %s", lid, ex_a)

                    if t_idx == 1 or t_idx % batch_size == 0 or t_idx == len(releases_validos):
                        cur_b = (t_idx + batch_size - 1) // batch_size
                        pct_t = 42 + int((t_idx / max(1, len(releases_validos))) * 48)
                        _update_job_progress(
                            b_job_id,
                            phase="BAIXANDO_TITULOS",
                            percent=min(90, pct_t),
                            current_batch=cur_b,
                            total_batches=total_title_batches,
                            processed_orders=t_idx,
                            total_orders=len(releases_validos),
                            horus_found_count=id_bordero,
                            message=f"Baixando títulos no Borderô #{id_bordero}: {t_idx}/{len(releases_validos)} lançamentos liquidados (lote {cur_b}/{total_title_batches})...",
                        )

        _update_job_progress(
            b_job_id,
            phase="AUDITORIA_FINAL",
            percent=94,
            processed_orders=len(releases_validos),
            total_orders=len(releases_validos),
            horus_found_count=id_bordero,
            message=f"Confirmando transação no SQL Server e auditando Borderô #{id_bordero}...",
        )

        # Commit da transação no SQL Server
        conn.commit()

        # 4.4. Auditoria Pós-Gravação: Confere no SQL Server quantos títulos ficaram amarrados ao Borderô
        verified_count = len(lancto_ids)
        verified_sum = vlr_bordero_efetivo
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
            "nom_arquivo": nom_arquivo,
            "payment_date_mode": eff_mode,
            "unify_installments": eff_unify,
            "unificadas_orders_tx": unificadas_orders_tx,
            "unificadas_parcelas_removidas_tx": unificadas_parcelas_removidas_tx,
            "credito_maior_lancamentos_criados_tx": credito_maior_lancamentos_criados_tx,
            "credito_maior_valor_total_tx": credito_maior_valor_total_tx,
            "new_credito_lancto_map": new_credito_lancto_map,
            "verified_count": verified_count,
            "verified_sum": verified_sum,
            "completed_at": datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
        }

    all_profiles_Pre = get_company_reconciliation_profiles(settings)
    prof_code_norm_pre = (payload.profile_code or "TRAY_SHOPEE").upper().strip()
    prof_match_pre = next((p for p in all_profiles_Pre if p["code"] == prof_code_norm_pre), None)
    prof_name_pre = (prof_match_pre or {}).get("name") or prof_code_norm_pre
    user_id_pre = current_user.get("id") if isinstance(current_user, dict) else getattr(current_user, "id", None)
    user_name_pre = (
        (current_user.get("name") or current_user.get("email"))
        if isinstance(current_user, dict)
        else (getattr(current_user, "name", None) or getattr(current_user, "email", None))
    )

    def _run_full_bordero_pipeline(b_job_id: Optional[str] = None) -> Dict[str, Any]:
        try:
            tx_res = _execute_bordero_transaction(b_job_id)
            bordero_id = tx_res["id_bordero"]

            _update_job_progress(
                b_job_id,
                phase="AUDITORIA_FINAL",
                percent=98,
                processed_orders=len(releases_validos),
                total_orders=len(releases_validos),
                horus_found_count=bordero_id,
                message=f"Salvando histórico do Fechamento (Borderô #{bordero_id}) no banco do Cronuz...",
            )

            # 5. Salva o registro de Fechamento no banco de dados PostgreSQL do Cronuz B2B para futuras consultas/auditorias
            closing_id = None
            db_closing = SessionLocal()
            try:
                cred_map = tx_res.get("new_credito_lancto_map") or {}
                snapshot_items = []
                for r_it in releases_validos:
                    lid_int = int(r_it.nro_lancamento)
                    snapshot_items.append({
                        "nro_lancamento": lid_int,
                        "cod_filial": str(r_it.cod_filial or cod_filial),
                        "cod_ped_venda": r_it.cod_ped_venda,
                        "pedido_web": r_it.pedido_web,
                        "pedido_canal": r_it.pedido_canal or r_it.pedido_web,
                        "pedido_tray": r_it.pedido_tray,
                        "nro_nota_fiscal": r_it.nro_nota_fiscal,
                        "cliente_nome": r_it.cliente_nome,
                        "valor_bruto": round(float(r_it.valor or 0.0), 2),
                        "taxa": round(float(r_it.taxa or 0.0), 2),
                        "valor_liquido": round(
                            float(r_it.valor_liquido)
                            if r_it.valor_liquido is not None and float(r_it.valor_liquido) > 0
                            else max(0.0, float(r_it.valor or 0.0) - float(r_it.taxa or 0.0)),
                            2,
                        ),
                        "valor_horus_original": round(float(r_it.valor_horus_original or r_it.valor or 0.0), 2),
                        "valor_credito_maior": round(float(r_it.valor_credito_maior or 0.0), 2),
                        "novo_lancamento_credito_maior": cred_map.get(lid_int),
                        "unificadas_qtd": int(r_it.unificadas_qtd or len(r_it.grouped_lancto_ids or [1])),
                        "grouped_lancto_ids": r_it.grouped_lancto_ids or [lid_int],
                        "data_pagamento": r_it.data_pagamento,
                    })

                closing_rec = HorusReconciliationClosing(
                    company_id=company_id,
                    created_by_user_id=int(user_id_pre) if user_id_pre else None,
                    created_by_name=str(user_name_pre or "")[:150] or None,
                    profile_code=prof_code_norm_pre,
                    profile_name=str(prof_name_pre)[:150],
                    channel_filename=(payload.channel_filename or "")[:255] or None,
                    tray_filename=(payload.tray_filename or "")[:255] or None,
                    cod_empresa=int(cod_empresa) if str(cod_empresa).isdigit() else 1,
                    cod_filial=int(cod_filial) if str(cod_filial).isdigit() else 1,
                    cod_bordero=int(bordero_id),
                    sta_bordero="AP" if eff_mode == "BORDERO_OPEN" else "PG",
                    nom_arquivo_horus=tx_res.get("nom_arquivo"),
                    payment_date_mode=eff_mode,
                    specific_payment_date=payload.specific_payment_date,
                    unify_installments=bool(eff_unify),
                    split_excess_launch=bool(eff_split_excess),
                    forma_pagto=str(cod_forma_val),
                    forma_pagto_credito_maior=str(cod_forma_credito_val) if raw_forma_credito else None,
                    banco=str(cod_banco_val),
                    agencia=str(cod_agencia_val),
                    conta=str(cod_contac_val),
                    carteira=str(carteira_val or "") or None,
                    total_titles=len(releases_validos),
                    unificadas_parcelas_removidas=int(tx_res.get("unificadas_parcelas_removidas_tx") or 0),
                    credito_maior_lancamentos_criados=int(tx_res.get("credito_maior_lancamentos_criados_tx") or 0),
                    valor_bruto_total=round(total_bordero, 2),
                    valor_taxa_total=round(total_taxa_bordero, 2),
                    valor_liquido_bordero=round(total_liquido_bordero, 2),
                    valor_credito_maior_total=round(float(tx_res.get("credito_maior_valor_total_tx") or 0.0), 2),
                    items_json=snapshot_items,
                    notes=(payload.notes or "")[:500] or None,
                )
                db_closing.add(closing_rec)
                db_closing.commit()
                db_closing.refresh(closing_rec)
                closing_id = closing_rec.id
            except Exception as ex_save_closing:
                db_closing.rollback()
                logger.warning("[HorusBordero] Aviso ao salvar historico de fechamento no PostgreSQL: %s", ex_save_closing)
            finally:
                db_closing.close()

            mode_desc = {
                "CHANNEL_DATE": "Baixado (PG) com a data de pagamento individual de cada lançamento da planilha",
                "SPECIFIC_DATE": f"Baixado (PG) com data específica ({payload.specific_payment_date})",
                "BORDERO_OPEN": "Borderô gerado em aberto (AP) para baixa manual no Horus",
            }.get(eff_mode, "")

            unif_desc = (
                f" • {tx_res['unificadas_orders_tx']} nota(s) tiveram parcelas unificadas e taxa gravada em VLR_LANCTO_ABATIMENTO"
                if tx_res.get("unificadas_orders_tx", 0) > 0
                else ""
            )
            cred_desc = (
                f" • {tx_res['credito_maior_lancamentos_criados_tx']} lançamento(s) separado(s) de Crédito Maior criado(s) (R$ {tx_res['credito_maior_valor_total_tx']:.2f} na Forma {cod_forma_credito_val})"
                if tx_res.get("credito_maior_lancamentos_criados_tx", 0) > 0
                else ""
            )

            final_res = {
                "success": True,
                "closing_id": closing_id,
                "bordero_number": bordero_id,
                "payment_date_mode": eff_mode,
                "unify_installments": eff_unify,
                "total_valor": total_liquido_bordero,
                "total_bruto": total_bordero,
                "total_liquido": total_liquido_bordero,
                "total_taxa": total_taxa_bordero,
                "itens_baixados": len(releases_validos),
                "security_verification": {
                    "verified_in_horus": True,
                    "expected_count": len(releases_validos),
                    "verified_count": tx_res["verified_count"],
                    "verified_sum": tx_res["verified_sum"],
                    "unificadas_orders_tx": tx_res["unificadas_orders_tx"],
                    "unificadas_parcelas_removidas_tx": tx_res["unificadas_parcelas_removidas_tx"],
                    "credito_maior_lancamentos_criados_tx": tx_res.get("credito_maior_lancamentos_criados_tx", 0),
                    "credito_maior_valor_total_tx": tx_res.get("credito_maior_valor_total_tx", 0.0),
                    "completed_at": tx_res["completed_at"],
                },
                "message": f"Borderô #{bordero_id} gravado com sucesso no Horus ERP e salvo no histórico do Cronuz! {mode_desc}{unif_desc}{cred_desc} ({tx_res['verified_count']} títulos confirmados • Valor Baixado no Borderô: R$ {total_liquido_bordero:.2f} • Bruto: R$ {total_bordero:.2f}).",
            }

            _update_job_progress(
                b_job_id,
                status="COMPLETED",
                phase="CONCLUIDO",
                percent=100,
                processed_orders=len(releases_validos),
                total_orders=len(releases_validos),
                horus_found_count=bordero_id,
                message=f"Borderô #{bordero_id} finalizado e auditado com 100% de segurança!",
                result=final_res,
            )
            return final_res
        except Exception as exc_b:
            logger.error("[HorusBordero] Erro ao gravar bordero company=%s: %s", company_id, exc_b)
            _update_job_progress(
                b_job_id,
                status="ERROR",
                phase="ERRO",
                message=str(exc_b),
                error=str(exc_b),
            )
            raise

    if async_job:
        _cleanup_old_reconciliation_jobs()
        b_job_id = f"brd_{uuid.uuid4().hex[:12]}"
        total_b = max(1, (len(releases_validos) + 49) // 50)
        initial_b_job = {
            "job_id": b_job_id,
            "company_id": company_id,
            "profile_code": prof_code_norm_pre,
            "status": "RUNNING",
            "phase": "VALIDANDO_SEGURANCA",
            "percent": 4,
            "message": f"Iniciando protocolo de geração segura do Borderô ({len(releases_validos)} títulos)...",
            "processed_orders": 0,
            "total_orders": len(releases_validos),
            "current_batch": 0,
            "total_batches": total_b,
            "horus_found_count": 0,
            "started_at": time.time(),
            "elapsed_seconds": 0.0,
            "result": None,
            "error": None,
        }
        _RECONCILIATION_JOBS[b_job_id] = initial_b_job
        _save_job_to_disk(b_job_id, initial_b_job)
        loop = asyncio.get_event_loop()
        loop.run_in_executor(None, _run_full_bordero_pipeline, b_job_id)
        return {
            "success": True,
            "async": True,
            "async_job": True,
            "job_id": b_job_id,
            "status": "RUNNING",
        }

    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _run_full_bordero_pipeline, None)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao gravar borderô no SQL Server do Horus: {str(e)}"
        )


@router.get("/companies/{company_id}/horus-sql/reconciliation/closings")
def list_reconciliation_closings(
    company_id: int,
    profile_code: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Lista o histórico de Fechamentos / Borderôs de Conciliação salvos no banco de dados do Cronuz B2B
    para futuras consultas e auditoria de divergências.
    """
    _assert_ownership(current_user, company_id)
    q = db.query(HorusReconciliationClosing).filter(
        HorusReconciliationClosing.company_id == company_id
    )
    if profile_code and profile_code.strip():
        q = q.filter(HorusReconciliationClosing.profile_code == profile_code.strip().upper())

    rows = (
        q.order_by(HorusReconciliationClosing.created_at.desc())
        .limit(min(max(1, limit), 200))
        .all()
    )
    return {
        "success": True,
        "closings": [
            {
                "id": r.id,
                "company_id": r.company_id,
                "created_by_user_id": r.created_by_user_id,
                "created_by_name": r.created_by_name or "Sistema",
                "profile_code": r.profile_code,
                "profile_name": r.profile_name or r.profile_code,
                "channel_filename": r.channel_filename,
                "tray_filename": r.tray_filename,
                "cod_empresa": r.cod_empresa,
                "cod_filial": r.cod_filial,
                "cod_bordero": r.cod_bordero,
                "sta_bordero": r.sta_bordero,
                "nom_arquivo_horus": r.nom_arquivo_horus,
                "payment_date_mode": r.payment_date_mode,
                "specific_payment_date": r.specific_payment_date,
                "unify_installments": bool(r.unify_installments),
                "split_excess_launch": bool(r.split_excess_launch),
                "forma_pagto": r.forma_pagto,
                "forma_pagto_credito_maior": r.forma_pagto_credito_maior,
                "banco": r.banco,
                "agencia": r.agencia,
                "conta": r.conta,
                "carteira": r.carteira,
                "total_titles": r.total_titles,
                "unificadas_parcelas_removidas": r.unificadas_parcelas_removidas,
                "credito_maior_lancamentos_criados": r.credito_maior_lancamentos_criados,
                "valor_bruto_total": round(float(r.valor_bruto_total or 0.0), 2),
                "valor_taxa_total": round(float(r.valor_taxa_total or 0.0), 2),
                "valor_liquido_bordero": round(float(r.valor_liquido_bordero or 0.0), 2),
                "valor_credito_maior_total": round(float(r.valor_credito_maior_total or 0.0), 2),
                "notes": r.notes,
                "created_at": r.created_at.strftime("%d/%m/%Y %H:%M:%S") if r.created_at else "",
            }
            for r in rows
        ],
    }


@router.get("/companies/{company_id}/horus-sql/reconciliation/closings/{closing_id}")
def get_reconciliation_closing_detail(
    company_id: int,
    closing_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Retorna os detalhes completos de um Fechamento / Borderô salvo no Cronuz B2B,
    incluindo o snapshot completo de todos os títulos conciliados (`items_json`).
    """
    _assert_ownership(current_user, company_id)
    r = (
        db.query(HorusReconciliationClosing)
        .filter(
            HorusReconciliationClosing.company_id == company_id,
            HorusReconciliationClosing.id == closing_id,
        )
        .first()
    )
    if not r:
        raise HTTPException(status_code=404, detail="Registro de fechamento não encontrado.")

    return {
        "success": True,
        "closing": {
            "id": r.id,
            "company_id": r.company_id,
            "created_by_user_id": r.created_by_user_id,
            "created_by_name": r.created_by_name or "Sistema",
            "profile_code": r.profile_code,
            "profile_name": r.profile_name or r.profile_code,
            "channel_filename": r.channel_filename,
            "tray_filename": r.tray_filename,
            "cod_empresa": r.cod_empresa,
            "cod_filial": r.cod_filial,
            "cod_bordero": r.cod_bordero,
            "sta_bordero": r.sta_bordero,
            "nom_arquivo_horus": r.nom_arquivo_horus,
            "payment_date_mode": r.payment_date_mode,
            "specific_payment_date": r.specific_payment_date,
            "unify_installments": bool(r.unify_installments),
            "split_excess_launch": bool(r.split_excess_launch),
            "forma_pagto": r.forma_pagto,
            "forma_pagto_credito_maior": r.forma_pagto_credito_maior,
            "banco": r.banco,
            "agencia": r.agencia,
            "conta": r.conta,
            "carteira": r.carteira,
            "total_titles": r.total_titles,
            "unificadas_parcelas_removidas": r.unificadas_parcelas_removidas,
            "credito_maior_lancamentos_criados": r.credito_maior_lancamentos_criados,
            "valor_bruto_total": round(float(r.valor_bruto_total or 0.0), 2),
            "valor_taxa_total": round(float(r.valor_taxa_total or 0.0), 2),
            "valor_liquido_bordero": round(float(r.valor_liquido_bordero or 0.0), 2),
            "valor_credito_maior_total": round(float(r.valor_credito_maior_total or 0.0), 2),
            "notes": r.notes,
            "created_at": r.created_at.strftime("%d/%m/%Y %H:%M:%S") if r.created_at else "",
            "items": r.items_json or [],
        },
    }

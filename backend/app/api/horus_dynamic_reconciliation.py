"""
Horus Dynamic Reconciliation & Template Builder API
===================================================
Módulo isolado por cliente (horus_sql_feature_conciliador_padrao) que permite:
1. Criar, editar, clonar e migrar Modelos de Conciliação Financeira sem alterar código.
2. Inspecionar qualquer planilha (.xlsx/.csv) para mapear colunas ("De -> Para") e regras de extração.
3. Vincular títulos no Horus ERP por:
   - Número da Nota Fiscal (NRO_NOTA_FISCAL)
   - Código do Pedido de Venda Horus (COD_PED_VENDA)
   - Número Direto do Lançamento (NRO_LANCTO_CRECEBER)
   - Código do Pedido Web / Origem (COD_PEDIDO_ORIGEM)
   - Automático Multi-Chave (AUTO)
   Em modo 1 Planilha (Direto) ou 2 Planilhas (Extrato + Planilha Ponte).
4. Configurar parâmetros bancários (Banco, Agência, Conta, Forma Pagto, Crédito Maior) e regras de baixa
   (Data da Planilha, Data Específica ou Apenas Borderô em Aberto AP) individualmente por modelo.
"""

import logging
import re
import threading
import time
import unicodedata
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.core.upload_security import (
    MAX_SHEET_SIZE_BYTES,
    read_file_safely,
    validate_file_size_and_extension,
)
from app.core.utils import assert_company_ownership
from app.db.session import SessionLocal, get_db
from app.integrators.horus_sql_client import HorusSQLClient, HorusSQLConfigError
from app.integrators.reconciliation_parser import (
    _clean_str,
    _normalize_order_key,
    _parse_currency as _parse_money,
    _read_raw_rows,
    parse_channel_file,
    parse_tray_bridge_file,
)


def _clean_header(val: Any) -> str:
    if val is None:
        return ""
    s = str(val).strip().lower()
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    s = re.sub(r"[_\-\./\\]+", " ", s)
    s = re.sub(r"[^\w\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _format_date_br(val: Any) -> str:
    if val is None:
        return ""
    if hasattr(val, "strftime"):
        return val.strftime("%d/%m/%Y")
    s = str(val).strip()
    if not s:
        return ""
    # YYYY-MM-DD... -> DD/MM/YYYY
    m_iso = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
    if m_iso:
        return f"{m_iso.group(3)}/{m_iso.group(2)}/{m_iso.group(1)}"
    m_br = re.match(r"^(\d{2}/\d{2}/\d{4})", s)
    if m_br:
        return m_br.group(1)
    return s.split(" ")[0]
from app.models.company_settings import CompanySettings
from app.models.horus_reconciliation_closing import HorusReconciliationClosing
from app.models.horus_reconciliation_template import HorusReconciliationTemplate
from app.api.horus_financial import (
    CreateBorderoPayload,
    _RECONCILIATION_JOBS,
    _cleanup_old_reconciliation_jobs,
    _save_job_to_disk,
    _update_job_progress,
    create_vindi_bordero,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def _create_reconciliation_job(company_id: int, profile_code: str) -> str:
    _cleanup_old_reconciliation_jobs()
    job_id = f"dyn_{uuid.uuid4().hex[:12]}"
    job_data = {
        "job_id": job_id,
        "company_id": company_id,
        "profile_code": profile_code,
        "status": "RUNNING",
        "phase": "LENDO_PLANILHAS",
        "percent": 2,
        "message": "Iniciando leitura da planilha no Conciliador Dinâmico...",
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
    _RECONCILIATION_JOBS[job_id] = job_data
    _save_job_to_disk(job_id, job_data)
    return job_id


def _finalize_reconciliation_job(
    job_id: Optional[str],
    result: Optional[Dict[str, Any]] = None,
    error: Optional[str] = None,
) -> None:
    if not job_id:
        return
    if error:
        _update_job_progress(
            job_id,
            status="ERROR",
            phase="ERRO",
            message=str(error),
            error=str(error),
        )
    else:
        _update_job_progress(
            job_id,
            status="COMPLETED",
            phase="CONCLUIDO",
            percent=100,
            message="Conciliação finalizada com sucesso!",
            result=result,
        )


# ── Helpers de Extração de Chave ──────────────────────────────────────────────

def _extract_key_by_rule(raw_value: Any, rule: str = "AUTO", custom_regex: str = "") -> str:
    """
    Extrai a chave de relacionamento da célula conforme a regra configurada no Modelo:
    - 'EXACT': Mantém o texto limpo em caixa alta
    - 'DIGITS_ONLY': Extrai apenas dígitos numéricos (removendo zeros à esquerda se for número puro)
    - 'AFTER_HASH': Extrai o token logo após '#' (ex: 'Pedido #394504' -> '394504')
    - 'REGEX': Aplica expressão regular customizada
    - 'AUTO': Inteligente (se tiver '#', extrai após '#'; senão usa _normalize_order_key)
    """
    s = _clean_str(raw_value)
    if not s:
        return ""
    rule_up = (rule or "AUTO").upper().strip()

    if rule_up == "REGEX" and custom_regex:
        try:
            m = re.search(custom_regex, s, flags=re.IGNORECASE)
            if m:
                val = m.group(1) if m.lastindex and m.lastindex >= 1 else m.group(0)
                return _normalize_order_key(val)
        except Exception:
            pass

    if rule_up == "AFTER_HASH" or (rule_up == "AUTO" and "#" in s):
        m = re.search(r"#\s*([A-Za-z0-9\-_]+)", s)
        if m:
            tok = m.group(1).strip().upper()
            if tok.isdigit():
                return str(int(tok))
            return tok

    if rule_up == "DIGITS_ONLY":
        # Remove sufixo .0 de floats do Excel antes de extrair dígitos
        s_clean = re.sub(r"\.0+$", "", s.strip())
        digits = re.sub(r"\D+", "", s_clean)
        if not digits:
            return ""
        return str(int(digits)) if digits.isdigit() else digits

    if rule_up == "EXACT":
        s_clean = re.sub(r"\.0+$", "", s.strip()).upper()
        return s_clean

    return _normalize_order_key(s)


def _detect_best_header_row(raw_rows: List[List[Any]]) -> Tuple[int, List[str]]:
    """
    Localiza automaticamente a linha de cabeçalho da planilha (mesmo quando começa
    na linha 18 como na Shopee ou na linha 1 em planilhas padrão).
    Retorna (header_idx_0_based, list_of_header_names).
    """
    best_idx = 0
    best_score = -1
    keywords = (
        "pedido", "nota", "nf", "lancamento", "lançamento", "valor", "liquido", "líquido",
        "bruto", "taxa", "comissao", "comissão", "data", "pagamento", "cliente", "cpf",
        "cnpj", "documento", "status", "tipo", "direcao", "direção", "transacao", "transação",
        "id", "codigo", "código", "erp", "horus", "parcela",
    )
    max_scan = min(len(raw_rows), 45)
    max_cols_in_scan = max(
        (len([_clean_str(c) for c in raw_rows[i] if _clean_str(c)]) for i in range(max_scan)),
        default=0,
    )
    min_cols = 1 if max_cols_in_scan <= 1 else 2
    for idx in range(max_scan):
        row = raw_rows[idx]
        non_empty = [ _clean_str(c) for c in row if _clean_str(c) ]
        if len(non_empty) < min_cols:
            continue
        score = 0
        for cell in non_empty:
            cl = _clean_header(cell)
            if any(kw in cl for kw in keywords):
                score += 3
            elif not cell.replace(".", "").replace(",", "").replace("-", "").isdigit():
                score += 1
        if score > best_score:
            best_score = score
            best_idx = idx

    headers_raw = raw_rows[best_idx] if raw_rows else []
    headers: List[str] = []
    seen: Dict[str, int] = {}
    for col_i, h in enumerate(headers_raw):
        name = _clean_str(h) or f"Coluna_{col_i + 1}"
        if name in seen:
            seen[name] += 1
            name = f"{name} ({seen[name]})"
        else:
            seen[name] = 1
        headers.append(name)
    return best_idx, headers


def _suggest_column_mapping(headers: List[str]) -> Dict[str, str]:
    """Sugere automaticamente quais colunas correspondem a Chave, Valor Líquido, Bruto, Taxa, Data, etc."""
    suggestion = {
        "key_col": "",
        "valor_liquido_col": "",
        "valor_bruto_col": "",
        "taxa_col": "",
        "data_pagamento_col": "",
        "tipo_transacao_col": "",
        "cliente_col": "",
        "documento_col": "",
    }
    for h in headers:
        hl = _clean_header(h)
        if not suggestion["key_col"] and any(
            k in hl for k in (
                "id do pedido", "numero no erp", "nro_lancamento", "lancamento",
                "nota fiscal", "nro_nota", "nf", "pedido", "codigo na loja", "descricao",
            )
        ):
            suggestion["key_col"] = h
        if not suggestion["valor_liquido_col"] and any(
            k in hl for k in ("valor liquido", "liquido", "repasse", "valor pago", "valor")
        ):
            suggestion["valor_liquido_col"] = h
        if not suggestion["valor_bruto_col"] and any(
            k in hl for k in ("valor bruto", "valor original", "valor pedido", "total pedido", "valor da nota")
        ):
            suggestion["valor_bruto_col"] = h
        if not suggestion["taxa_col"] and any(
            k in hl for k in ("taxa", "comissao", "tarifa", "abatimento", "desconto")
        ):
            suggestion["taxa_col"] = h
        if not suggestion["data_pagamento_col"] and any(
            k in hl for k in ("data pagamento", "data credito", "data", "pagamento", "ocorrencia")
        ):
            suggestion["data_pagamento_col"] = h
        if not suggestion["tipo_transacao_col"] and any(
            k in hl for k in ("direcao do dinheiro", "direcao", "tipo de transacao", "entrada/saida", "natureza")
        ):
            suggestion["tipo_transacao_col"] = h
        if not suggestion["cliente_col"] and any(
            k in hl for k in ("cliente", "comprador", "nome", "razao social", "sacado")
        ):
            suggestion["cliente_col"] = h
        if not suggestion["documento_col"] and any(
            k in hl for k in ("cpf", "cnpj", "documento")
        ):
            suggestion["documento_col"] = h

    return suggestion


def _serialize_template(t: HorusReconciliationTemplate, settings: CompanySettings) -> Dict[str, Any]:
    """Serializa o modelo de conciliação com os parâmetros bancários efetivos."""
    default_forma = (getattr(settings, "horus_banco_forma_pagto", "") or "").strip()
    default_banco = (getattr(settings, "horus_banco_codigo", "") or "").strip()
    default_agencia = (getattr(settings, "horus_banco_agencia", "") or "").strip()
    default_conta = (getattr(settings, "horus_banco_conta", "") or "").strip()
    default_carteira = (getattr(settings, "horus_banco_carteira", "") or "").strip()
    cod_emp = (getattr(settings, "horus_sql_cod_empresa", None) or getattr(settings, "horus_company", None) or "1").strip()
    cod_fil = (getattr(settings, "horus_sql_cod_filial", None) or getattr(settings, "horus_branch", None) or "1").strip()

    eff_forma = (t.forma_pagto or default_forma).strip()
    eff_banco = (t.banco or default_banco).strip()
    eff_agencia = (t.agencia or default_agencia).strip()
    eff_conta = (t.conta or default_conta).strip()
    eff_carteira = (t.carteira or default_carteira).strip()
    eff_forma_cred = (t.forma_pagto_credito_maior or "").strip()

    bank_configured = bool(eff_forma and eff_banco and eff_agencia and eff_conta)
    col_map = dict(t.column_mapping) if isinstance(t.column_mapping, dict) else {}
    use_horus_val = bool(col_map.get("use_horus_value", False))

    return {
        "id": t.id,
        "company_id": t.company_id,
        "code": t.code,
        "name": t.name,
        "short_name": t.short_name,
        "channel_label": t.channel_label or t.short_name,
        "hub_label": t.hub_label or ("Planilha Ponte" if t.mode == "DUAL_FILE" else "Direto Horus"),
        "badge": t.badge or ("2 Planilhas" if t.mode == "DUAL_FILE" else f"1 Planilha • {t.horus_match_field}"),
        "description": t.description or "",
        "mode": t.mode or "SINGLE_FILE",
        "file_1_label": t.file_1_label or f"1º Arquivo: Planilha de Pagamentos / Extrato ({t.short_name})",
        "file_2_label": t.file_2_label if t.mode == "DUAL_FILE" else None,
        "horus_match_field": t.horus_match_field or "AUTO",
        "column_mapping": col_map,
        "forma_pagto": eff_forma,
        "forma_pagto_credito_maior": eff_forma_cred,
        "banco": eff_banco,
        "agencia": eff_agencia,
        "conta": eff_conta,
        "carteira": eff_carteira,
        "payment_date_mode": t.payment_date_mode or "CHANNEL_DATE",
        "unify_installments": bool(t.unify_installments),
        "split_excess_launch": bool(t.split_excess_launch),
        "use_horus_value": use_horus_val,
        "is_active": bool(t.is_active),
        "is_system_preset": bool(t.is_system_preset),
        "display_order": t.display_order or 10,
        "bank_configured": bank_configured,
        "effective_bank": {
            "profile_code": t.code,
            "forma_pagto": eff_forma,
            "forma_pagto_credito_maior": eff_forma_cred,
            "banco": eff_banco,
            "agencia": eff_agencia,
            "conta": eff_conta,
            "carteira": eff_carteira,
            "payment_date_mode": t.payment_date_mode or "CHANNEL_DATE",
            "unify_installments": bool(t.unify_installments),
            "split_excess_launch": bool(t.split_excess_launch),
            "use_horus_value": use_horus_val,
            "cod_empresa": cod_emp,
            "cod_filial": cod_fil,
            "is_configured": bank_configured,
        },
    }


def _seed_or_migrate_company_templates(db: Session, company_id: int, settings: CompanySettings) -> List[HorusReconciliationTemplate]:
    """
    Garante que a empresa tenha os modelos iniciais migrados (Shopee, Vindi + os 3 formatos padrão:
    Nota Fiscal, Código do Pedido Horus e Número Direto do Lançamento), herdando automaticamente
    os códigos bancários já configurados pela empresa na rotina antiga para migração sem perda.
    """
    raw_cfg = (
        dict(settings.b2c_showcases_config)
        if (settings and isinstance(settings.b2c_showcases_config, dict))
        else {}
    )
    saved_map = (
        raw_cfg.get("bank_reconciliations")
        if isinstance(raw_cfg.get("bank_reconciliations"), dict)
        else {}
    )

    def _bank_for(legacy_code: str, default_unify: bool = True) -> Dict[str, Any]:
        saved = saved_map.get(legacy_code) if isinstance(saved_map.get(legacy_code), dict) else {}
        # Se não tiver no perfil específico, tenta herdar do TRAY_SHOPEE ou TRAY_VINDI ou global
        fallback_saved = (
            saved_map.get("TRAY_SHOPEE")
            or saved_map.get("TRAY_VINDI")
            or saved_map.get("VINDI_DIRECT")
            or {}
        )
        return {
            "forma_pagto": str(saved.get("forma_pagto") or fallback_saved.get("forma_pagto") or settings.horus_banco_forma_pagto or "").strip(),
            "forma_pagto_credito_maior": str(saved.get("forma_pagto_credito_maior") or fallback_saved.get("forma_pagto_credito_maior") or "").strip(),
            "banco": str(saved.get("banco") or fallback_saved.get("banco") or settings.horus_banco_codigo or "").strip(),
            "agencia": str(saved.get("agencia") or fallback_saved.get("agencia") or settings.horus_banco_agencia or "").strip(),
            "conta": str(saved.get("conta") or fallback_saved.get("conta") or settings.horus_banco_conta or "").strip(),
            "carteira": str(saved.get("carteira") or fallback_saved.get("carteira") or settings.horus_banco_carteira or "").strip(),
            "payment_date_mode": str(saved.get("payment_date_mode") or fallback_saved.get("payment_date_mode") or "CHANNEL_DATE").strip(),
            "unify_installments": bool(saved.get("unify_installments", default_unify)),
            "split_excess_launch": bool(saved.get("split_excess_launch", True)),
        }

    shopee_bank = _bank_for("TRAY_SHOPEE", True)
    vindi_bank = _bank_for("TRAY_VINDI", False)
    generic_bank = _bank_for("TRAY_SHOPEE", True)

    presets = [
        {
            "code": "SHOPEE_TRAY",
            "name": "Shopee ↔ Tray ↔ Horus ERP",
            "short_name": "Shopee + Tray",
            "channel_label": "Shopee",
            "hub_label": "Tray E-commerce",
            "badge": "2 Planilhas • Pedido Origem",
            "description": "Cruza o relatório de renda/extrato da Shopee com a planilha da Tray para localizar os títulos no Horus ERP, abater taxas/saídas e gerar o Borderô.",
            "mode": "DUAL_FILE",
            "file_1_label": "1º Arquivo: Planilha de Repasse / Extrato da Shopee (.xlsx ou .csv)",
            "file_2_label": "2º Arquivo: Planilha de Pedidos da Tray com vínculo Shopee ↔ Horus (.xlsx ou .csv)",
            "horus_match_field": "COD_PEDIDO_ORIGEM",
            "column_mapping": {
                "engine_preset": "SHOPEE",
                "key_col": "ID do pedido",
                "key_extract_rule": "AFTER_HASH",
                "valor_liquido_col": "Valor",
                "valor_bruto_col": "",
                "taxa_col": "",
                "data_pagamento_col": "Data",
                "tipo_transacao_col": "Direção do dinheiro",
                "deduct_debit_rows": True,
                "bridge_channel_key_col": "Código na loja",
                "bridge_channel_extract_rule": "AUTO",
                "bridge_horus_key_col": "Numero no ERP",
                "bridge_horus_extract_rule": "AUTO",
                "bridge_valor_pedido_col": "Valor Pedido",
            },
            "display_order": 1,
            **shopee_bank,
        },
        {
            "code": "VINDI_TRAY",
            "name": "Vindi ↔ Tray ↔ Horus ERP",
            "short_name": "Vindi + Tray",
            "channel_label": "Vindi",
            "hub_label": "Tray E-commerce",
            "badge": "2 Planilhas • Pedido Origem",
            "description": "Cruza o extrato financeiro da Vindi com a planilha de pedidos da Tray para identificar os títulos no Horus ERP e gerar o Borderô.",
            "mode": "DUAL_FILE",
            "file_1_label": "1º Arquivo: Extrato Financeiro da Vindi (.xlsx ou .csv)",
            "file_2_label": "2º Arquivo: Planilha de Pedidos da Tray com vínculo Vindi ↔ Horus (.xlsx ou .csv)",
            "horus_match_field": "COD_PEDIDO_ORIGEM",
            "column_mapping": {
                "engine_preset": "VINDI",
                "key_col": "Descrição",
                "key_extract_rule": "AFTER_HASH",
                "valor_liquido_col": "Valor líquido",
                "valor_bruto_col": "Valor original",
                "taxa_col": "Taxa",
                "data_pagamento_col": "Data pagamento",
                "tipo_transacao_col": "Tipo",
                "deduct_debit_rows": False,
                "bridge_channel_key_col": "Pedido",
                "bridge_channel_extract_rule": "AUTO",
                "bridge_horus_key_col": "Numero no ERP",
                "bridge_horus_extract_rule": "AUTO",
                "bridge_valor_pedido_col": "Valor Pedido",
            },
            "display_order": 2,
            **vindi_bank,
        },
        {
            "code": "POR_NOTA_FISCAL",
            "name": "Importação por Nº da Nota Fiscal (Horus)",
            "short_name": "Por Nota Fiscal (NF)",
            "channel_label": "Planilha NF",
            "hub_label": "NF_MESTRE Horus",
            "badge": "1 Planilha • NRO_NOTA_FISCAL",
            "description": "Localiza os títulos em aberto no Horus ERP diretamente pelo Número da Nota Fiscal (NRO_NOTA_FISCAL), unifica parcelas se necessário e gera o Borderô.",
            "mode": "SINGLE_FILE",
            "file_1_label": "Planilha Financeira contendo o Número da Nota Fiscal (NF) e Valores (.xlsx ou .csv)",
            "file_2_label": None,
            "horus_match_field": "NRO_NOTA_FISCAL",
            "column_mapping": {
                "engine_preset": "DYNAMIC",
                "key_col": "Nota Fiscal",
                "key_extract_rule": "DIGITS_ONLY",
                "valor_liquido_col": "Valor Liquido",
                "valor_bruto_col": "Valor Bruto",
                "taxa_col": "Taxa",
                "data_pagamento_col": "Data Pagamento",
                "tipo_transacao_col": "",
                "cliente_col": "Cliente",
                "documento_col": "Documento",
                "deduct_debit_rows": False,
            },
            "display_order": 3,
            **generic_bank,
        },
        {
            "code": "POR_PEDIDO_HORUS",
            "name": "Importação por Código do Pedido (Horus)",
            "short_name": "Por Pedido Horus",
            "channel_label": "Planilha Pedido",
            "hub_label": "PEDIDOS_VENDA Horus",
            "badge": "1 Planilha • COD_PED_VENDA",
            "description": "Localiza os títulos em aberto no Horus ERP pelo Código do Pedido de Venda (COD_PED_VENDA) ou Pedido Origem (COD_PEDIDO_ORIGEM) e gera o Borderô.",
            "mode": "SINGLE_FILE",
            "file_1_label": "Planilha Financeira contendo o Código do Pedido Horus e Valores (.xlsx ou .csv)",
            "file_2_label": None,
            "horus_match_field": "COD_PED_VENDA",
            "column_mapping": {
                "engine_preset": "DYNAMIC",
                "key_col": "Pedido Horus",
                "key_extract_rule": "DIGITS_ONLY",
                "valor_liquido_col": "Valor Liquido",
                "valor_bruto_col": "Valor Bruto",
                "taxa_col": "Taxa",
                "data_pagamento_col": "Data Pagamento",
                "tipo_transacao_col": "",
                "cliente_col": "Cliente",
                "documento_col": "Documento",
                "deduct_debit_rows": False,
            },
            "display_order": 4,
            **generic_bank,
        },
        {
            "code": "POR_LANCAMENTO_DIRETO",
            "name": "Importação Direta por Nº do Lançamento (Horus)",
            "short_name": "Por Nº Lançamento",
            "channel_label": "Planilha Lançamento",
            "hub_label": "LANCTOS_CRECEBER Horus",
            "badge": "1 Planilha • NRO_LANCTO_CRECEBER",
            "description": "Localiza os títulos diretamente pelo Número do Lançamento do Contas a Receber (NRO_LANCTO_CRECEBER) no Horus ERP e gera o Borderô.",
            "mode": "SINGLE_FILE",
            "file_1_label": "Planilha Financeira contendo o Nº do Lançamento (NRO_LANCTO_CRECEBER) e Valores (.xlsx ou .csv)",
            "file_2_label": None,
            "horus_match_field": "NRO_LANCTO_CRECEBER",
            "column_mapping": {
                "engine_preset": "DYNAMIC",
                "key_col": "Lancamento",
                "key_extract_rule": "DIGITS_ONLY",
                "valor_liquido_col": "Valor Liquido",
                "valor_bruto_col": "Valor Bruto",
                "taxa_col": "Taxa",
                "data_pagamento_col": "Data Pagamento",
                "tipo_transacao_col": "",
                "cliente_col": "Cliente",
                "documento_col": "Documento",
                "deduct_debit_rows": False,
            },
            "display_order": 5,
            **generic_bank,
        },
    ]

    existing = (
        db.query(HorusReconciliationTemplate)
        .filter(HorusReconciliationTemplate.company_id == company_id)
        .all()
    )
    by_code = {t.code: t for t in existing}

    changed = False
    for p in presets:
        code = p["code"]
        if code not in by_code:
            new_t = HorusReconciliationTemplate(
                company_id=company_id,
                code=code,
                name=p["name"],
                short_name=p["short_name"],
                channel_label=p["channel_label"],
                hub_label=p["hub_label"],
                badge=p["badge"],
                description=p["description"],
                mode=p["mode"],
                file_1_label=p["file_1_label"],
                file_2_label=p["file_2_label"],
                horus_match_field=p["horus_match_field"],
                column_mapping=p["column_mapping"],
                forma_pagto=p["forma_pagto"],
                forma_pagto_credito_maior=p["forma_pagto_credito_maior"],
                banco=p["banco"],
                agencia=p["agencia"],
                conta=p["conta"],
                carteira=p["carteira"],
                payment_date_mode=p["payment_date_mode"],
                unify_installments=p["unify_installments"],
                split_excess_launch=p["split_excess_launch"],
                is_active=True,
                is_system_preset=True,
                display_order=p["display_order"],
            )
            db.add(new_t)
            changed = True
        else:
            # Se já existe mas está sem banco configurado, herda os códigos bancários migrados
            cur = by_code[code]
            if not cur.forma_pagto and p["forma_pagto"]:
                cur.forma_pagto = p["forma_pagto"]
                changed = True
            if not cur.banco and p["banco"]:
                cur.banco = p["banco"]
                changed = True
            if not cur.agencia and p["agencia"]:
                cur.agencia = p["agencia"]
                changed = True
            if not cur.conta and p["conta"]:
                cur.conta = p["conta"]
                changed = True
            if not cur.forma_pagto_credito_maior and p["forma_pagto_credito_maior"]:
                cur.forma_pagto_credito_maior = p["forma_pagto_credito_maior"]
                changed = True

    if changed:
        db.commit()

    return (
        db.query(HorusReconciliationTemplate)
        .filter(
            HorusReconciliationTemplate.company_id == company_id,
            HorusReconciliationTemplate.is_active == True,
        )
        .order_by(HorusReconciliationTemplate.display_order.asc(), HorusReconciliationTemplate.id.asc())
        .all()
    )


# ── Parser Dinâmico Baseado no Mapeamento ("De -> Para") ──────────────────────

def _find_col_index(headers: List[str], target_col: str, fallback_aliases: Tuple[str, ...] = ()) -> Optional[int]:
    """Localiza o índice de uma coluna pelo nome exato, case-insensitive, ou por aliases."""
    if target_col:
        target_clean = _clean_header(target_col)
        for idx, h in enumerate(headers):
            if h.strip() == target_col.strip() or _clean_header(h) == target_clean:
                return idx
        for idx, h in enumerate(headers):
            if target_clean and target_clean in _clean_header(h):
                return idx

    for alias in fallback_aliases:
        alias_clean = _clean_header(alias)
        for idx, h in enumerate(headers):
            if alias_clean == _clean_header(h) or alias_clean in _clean_header(h):
                return idx
    return None


def _parse_dynamic_channel_file(
    file_bytes: bytes,
    filename: str,
    template: HorusReconciliationTemplate,
    override_use_horus_value: Optional[bool] = None,
) -> List[Dict[str, Any]]:
    """
    Lê a planilha principal usando o mapeamento configurado no modelo (column_mapping).
    Se o modelo usar um engine_preset nativo ('SHOPEE', 'VINDI', 'TIKTOK') e a planilha
    bater com a estrutura original do canal, aproveita o parser especializado; caso contrário,
    aplica o motor dinâmico De/Para.
    """
    col_map = dict(template.column_mapping) if isinstance(template.column_mapping, dict) else {}
    preset = str(col_map.get("engine_preset") or "DYNAMIC").upper().strip()
    use_horus_value = (
        bool(override_use_horus_value)
        if override_use_horus_value is not None
        else bool(col_map.get("use_horus_value", False))
    )

    if preset in ("SHOPEE", "VINDI", "TIKTOK") and not use_horus_value:
        try:
            legacy_code = {
                "SHOPEE": "TRAY_SHOPEE",
                "VINDI": "TRAY_VINDI",
                "TIKTOK": "TRAY_TIKTOK",
            }[preset]
            parsed_rows, _ = parse_channel_file(file_bytes, filename, legacy_code)
            if parsed_rows:
                return parsed_rows
        except Exception as e:
            logger.info(
                "[DynamicReconciliation] Fallback para motor De/Para no template %s (%s): %s",
                template.code, filename, e,
            )

    raw_rows, _ = _read_raw_rows(file_bytes, filename)
    if not raw_rows:
        raise ValueError("A planilha enviada está vazia.")

    header_idx, headers = _detect_best_header_row(raw_rows)
    if not headers:
        raise ValueError("Não foi possível identificar os cabeçalhos da planilha.")

    key_col = str(col_map.get("key_col") or "").strip()
    key_rule = str(col_map.get("key_extract_rule") or "AUTO").upper().strip()
    key_regex = str(col_map.get("key_regex") or "").strip()

    liq_col = str(col_map.get("valor_liquido_col") or "").strip()
    bruto_col = str(col_map.get("valor_bruto_col") or "").strip()
    taxa_col = str(col_map.get("taxa_col") or "").strip()
    date_col = str(col_map.get("data_pagamento_col") or "").strip()
    tipo_col = str(col_map.get("tipo_transacao_col") or "").strip()
    cli_col = str(col_map.get("cliente_col") or "").strip()
    doc_col = str(col_map.get("documento_col") or "").strip()
    deduct_debits = bool(col_map.get("deduct_debit_rows", True))

    idx_key = _find_col_index(
        headers,
        key_col,
        (
            "nota fiscal", "nro nota fiscal", "nf", "lancamento", "nro lancamento", "lancto",
            "nro lancto", "pedido", "id do pedido", "codigo", "numero no erp", "numero",
            "titulo", "doc", "venda", "descricao",
        ),
    )
    idx_liq = _find_col_index(
        headers,
        liq_col,
        (
            "valor liquido", "liquido", "vlr liquido", "repasse", "valor pago", "vlr pago",
            "valor recebido", "recebido", "valor", "vlr", "total liquido", "total",
        ),
    )
    idx_bruto = _find_col_index(
        headers,
        bruto_col,
        ("valor bruto", "vlr bruto", "valor original", "valor pedido", "valor da nota", "total bruto"),
    ) if bruto_col else _find_col_index(headers, "", ("valor bruto", "vlr bruto", "valor original", "valor da nota"))

    idx_taxa = _find_col_index(
        headers,
        taxa_col,
        ("taxa", "comissao", "tarifa", "abatimento", "desconto"),
    ) if taxa_col else _find_col_index(headers, "", ("taxa", "comissao", "tarifa"))

    idx_date = _find_col_index(
        headers,
        date_col,
        ("data pagamento", "data credito", "data", "pagamento", "dt pagto", "vencimento"),
    )
    idx_tipo = _find_col_index(
        headers,
        tipo_col,
        ("direcao do dinheiro", "tipo", "entrada/saida", "natureza"),
    ) if tipo_col else None
    idx_cli = _find_col_index(
        headers,
        cli_col,
        ("cliente", "comprador", "nome", "razao social", "sacado"),
    )
    idx_doc = _find_col_index(
        headers,
        doc_col,
        ("cpf", "cnpj", "documento"),
    )

    # Fallback inteligente para planilhas montadas de 1 a 6 colunas (mesmo sem cabeçalho padrão)
    start_row_idx = header_idx + 1
    first_row_all_numeric = bool(
        header_idx == 0
        and raw_rows
        and len([c for c in raw_rows[0] if _clean_str(c)]) >= (1 if use_horus_value else 2)
        and all(
            re.sub(r"[\d\.,R\$\-\s/]", "", _clean_str(c)) == ""
            for c in raw_rows[0]
            if _clean_str(c)
        )
    )
    if first_row_all_numeric:
        start_row_idx = 0

    if idx_key is None and len(headers) == 1:
        idx_key = 0

    if (idx_key is None or (idx_liq is None and idx_bruto is None)) and len(headers) >= 1:
        sample_scan = raw_rows[start_row_idx : min(len(raw_rows), start_row_idx + 10)] or raw_rows[:5]
        if sample_scan:
            if idx_key is None:
                for c_i in range(len(headers)):
                    vals = [_clean_str(r[c_i]) for r in sample_scan if c_i < len(r) and _clean_str(r[c_i])]
                    if vals and all(re.search(r"\d+", v) and ("," not in v) for v in vals):
                        idx_key = c_i
                        break
                if idx_key is None:
                    idx_key = 0
            if idx_liq is None and idx_bruto is None and len(headers) >= 2:
                for c_i in range(len(headers)):
                    if c_i == idx_key:
                        continue
                    vals = [_parse_money(r[c_i]) for r in sample_scan if c_i < len(r) and _clean_str(r[c_i])]
                    if vals and any(abs(v) > 0 for v in vals):
                        idx_liq = c_i
                        break

    if idx_key is None:
        raise ValueError(
            f"Coluna de Chave ('{key_col or 'Pedido/NF/Lançamento'}') não encontrada na planilha. "
            f"Colunas disponíveis: {', '.join(headers[:12])}. Clique em 'Editar Modelo' para ajustar o De/Para."
        )
    if not use_horus_value and idx_liq is None and idx_bruto is None:
        raise ValueError(
            f"Coluna de Valor ('{liq_col or bruto_col or 'Valor'}') não encontrada na planilha. "
            f"Colunas disponíveis: {', '.join(headers[:12])}. Clique em 'Editar Modelo' para ajustar o De/Para ou ative 'Considerar Valor do Lançamento Pago do Horus'."
        )

    grouped: Dict[str, Dict[str, Any]] = {}
    debit_rows: List[Dict[str, Any]] = []
    raw_valid_rows = 0
    header_key_norm = _extract_key_by_rule(headers[idx_key], key_rule, key_regex) if idx_key < len(headers) else ""

    for r_i in range(start_row_idx, len(raw_rows)):
        row = raw_rows[r_i]
        if not row or not any(_clean_str(c) for c in row):
            continue

        raw_key_cell = row[idx_key] if idx_key < len(row) else ""
        extracted_key = _extract_key_by_rule(raw_key_cell, key_rule, key_regex)
        if not extracted_key:
            continue
        if r_i == header_idx and extracted_key == header_key_norm and not str(extracted_key).isdigit():
            continue

        raw_liq = _parse_money(row[idx_liq]) if (idx_liq is not None and idx_liq < len(row)) else 0.0
        raw_bruto = _parse_money(row[idx_bruto]) if (idx_bruto is not None and idx_bruto < len(row)) else 0.0
        raw_taxa = abs(_parse_money(row[idx_taxa])) if (idx_taxa is not None and idx_taxa < len(row)) else 0.0

        tipo_str = _clean_str(row[idx_tipo]).upper() if (idx_tipo is not None and idx_tipo < len(row)) else ""
        is_withdrawal = any(w in tipo_str for w in ("SAQUE", "WITHDRAW", "TRANSFERENCIA BANCARIA"))
        if is_withdrawal:
            continue

        is_debit = (
            not use_horus_value
            and (
                any(w in tipo_str for w in ("SAIDA", "SAÍDA", "DEBITO", "DÉBITO", "ESTORNO"))
                or (raw_liq < -0.001)
                or (raw_liq == 0.0 and raw_bruto < -0.001)
            )
        )

        if is_debit:
            if deduct_debits:
                deb_val = abs(raw_liq) if abs(raw_liq) > 0.001 else abs(raw_bruto)
                if deb_val > 0.001:
                    raw_valid_rows += 1
                    debit_rows.append({
                        "key": extracted_key,
                        "valor_debito": round(deb_val, 2),
                        "linha_planilha": r_i + 1,
                    })
            continue

        val_liq = round(raw_liq if raw_liq > 0 else max(0.0, raw_bruto - raw_taxa), 2)
        val_bruto = round(raw_bruto if raw_bruto > 0 else (val_liq + raw_taxa), 2)
        val_taxa = round(raw_taxa if raw_taxa > 0 else max(0.0, val_bruto - val_liq), 2)

        if not use_horus_value and (val_liq <= 0 and val_bruto <= 0):
            continue

        raw_valid_rows += 1
        dt_pagto = _format_date_br(row[idx_date]) if (idx_date is not None and idx_date < len(row)) else ""
        cli_nome = _clean_str(row[idx_cli]) if (idx_cli is not None and idx_cli < len(row)) else "-"
        doc_str = _clean_str(row[idx_doc]) if (idx_doc is not None and idx_doc < len(row)) else "-"

        if extracted_key not in grouped:
            grouped[extracted_key] = {
                "linha_planilha": r_i + 1,
                "pedido_canal": extracted_key,
                "pedido_web": extracted_key,
                "cliente_nome": cli_nome or "-",
                "documento": doc_str or "-",
                "valor": val_bruto,
                "valor_bruto": val_bruto,
                "valor_liquido": val_liq,
                "taxa": val_taxa,
                "bruto_from_channel": bool(idx_bruto is not None and raw_bruto > 0),
                "data_pagamento": dt_pagto,
                "status_vindi": "PAGO",
                "forma_pagamento": template.channel_label or template.short_name,
            }
        else:
            g = grouped[extracted_key]
            g["valor_liquido"] = round(g["valor_liquido"] + val_liq, 2)
            g["valor_bruto"] = round(g["valor_bruto"] + val_bruto, 2)
            g["valor"] = g["valor_bruto"]
            g["taxa"] = round(g["taxa"] + val_taxa, 2)
            if not g["data_pagamento"] and dt_pagto:
                g["data_pagamento"] = dt_pagto

    entradas_liquido_total = round(sum(float(r["valor_liquido"]) for r in grouped.values()), 2)
    saidas_total = round(sum(float(d["valor_debito"]) for d in debit_rows), 2)
    unassigned_debits_total = 0.0

    for d in debit_rows:
        dk = d["key"]
        dval = float(d["valor_debito"])
        if dk and dk in grouped:
            g = grouped[dk]
            g["valor_liquido"] = round(g["valor_liquido"] - dval, 2)
            g["taxa"] = round(g["taxa"] + dval, 2)
        else:
            unassigned_debits_total = round(unassigned_debits_total + dval, 2)

    records = list(grouped.values())
    for seq_idx, rec in enumerate(records, start=1):
        rec["linha"] = seq_idx

    if records:
        records[0]["_channel_statement_meta"] = {
            "raw_rows_count": raw_valid_rows,
            "entradas_count": len(records),
            "entradas_liquido_total": entradas_liquido_total,
            "saidas_count": len(debit_rows),
            "saidas_total": saidas_total,
            "assigned_debits_total": round(saidas_total - unassigned_debits_total, 2),
            "unassigned_debits_total": unassigned_debits_total,
            "net_statement_total": round(entradas_liquido_total - saidas_total, 2),
        }

    if not records:
        raise ValueError(
            "Nenhuma linha válida foi extraída da planilha. Verifique se a Coluna de Chave e a Coluna de Valor estão mapeadas corretamente no Modelo."
        )
    return records


def _parse_dynamic_bridge_file(
    file_bytes: bytes,
    filename: str,
    template: HorusReconciliationTemplate,
) -> Dict[str, Any]:
    """
    Lê a 2ª planilha (Planilha Ponte, ex: Tray ou ERP hub).
    Tenta primeiro o parser inteligente da Tray, e se o modelo tiver mapeamento customizado de ponte,
    indexa também pelas colunas configuradas.
    """
    col_map = dict(template.column_mapping) if isinstance(template.column_mapping, dict) else {}
    bridge_channel_col = str(col_map.get("bridge_channel_key_col") or "").strip()
    bridge_horus_col = str(col_map.get("bridge_horus_key_col") or "").strip()

    try:
        parsed_bridge, _ = parse_tray_bridge_file(file_bytes, filename)
        if parsed_bridge and (parsed_bridge.get("by_channel_order") or parsed_bridge.get("by_tray_order")):
            return parsed_bridge
    except Exception:
        if not bridge_channel_col or not bridge_horus_col:
            raise

    raw_rows, _ = _read_raw_rows(file_bytes, filename)
    header_idx, headers = _detect_best_header_row(raw_rows)
    idx_ch = _find_col_index(headers, bridge_channel_col, ("codigo na loja", "pedido canal", "pedido marketplace"))
    idx_hr = _find_col_index(headers, bridge_horus_col, ("numero no erp", "pedido horus", "nota fiscal", "nf"))
    idx_val = _find_col_index(headers, str(col_map.get("bridge_valor_pedido_col") or ""), ("valor pedido", "valor", "total"))

    if idx_ch is None or idx_hr is None:
        raise ValueError(
            f"Colunas da Planilha Ponte ('{bridge_channel_col}' / '{bridge_horus_col}') não encontradas."
        )

    ch_rule = str(col_map.get("bridge_channel_extract_rule") or "AUTO")
    hr_rule = str(col_map.get("bridge_horus_extract_rule") or "AUTO")
    by_channel_order: Dict[str, Dict[str, Any]] = {}
    by_tray_order: Dict[str, Dict[str, Any]] = {}
    total_rows = 0

    for r_i in range(header_idx + 1, len(raw_rows)):
        row = raw_rows[r_i]
        if not row:
            continue
        k_ch = _extract_key_by_rule(row[idx_ch] if idx_ch < len(row) else "", ch_rule)
        k_hr = _extract_key_by_rule(row[idx_hr] if idx_hr < len(row) else "", hr_rule)
        if not k_ch and not k_hr:
            continue
        total_rows += 1
        val_p = _parse_money(row[idx_val]) if (idx_val is not None and idx_val < len(row)) else 0.0
        entry = {
            "pedido_tray": k_ch or k_hr,
            "pedido_canal": k_ch,
            "pedido_horus": k_hr or k_ch,
            "valor_tray": val_p,
            "valor_tray_sem_acrescimo": val_p,
            "acrescimo_tray": 0.0,
            "subtotal_tray": val_p,
            "frete_tray": 0.0,
            "desconto_tray": 0.0,
            "cliente_tray": "",
            "documento_tray": "",
            "nf_tray": "",
            "status_tray": "",
            "forma_pagamento_tray": "",
        }
        if k_ch:
            by_channel_order[k_ch] = entry
        if k_hr:
            by_tray_order[k_hr] = entry

    return {
        "by_channel_order": by_channel_order,
        "by_tray_order": by_tray_order,
        "total_rows": total_rows,
    }


# ── Motor Core de Conciliação Dinâmica Multi-Chave no Horus ERP ──────────────

def _run_dynamic_reconciliation_core(
    company_id: int,
    template_id: int,
    filial: Optional[str],
    channel_bytes: bytes,
    channel_filename: str,
    tray_bytes: Optional[bytes],
    tray_filename: Optional[str],
    job_id: Optional[str] = None,
    override_unify_installments: Optional[bool] = None,
    override_split_excess_launch: Optional[bool] = None,
    override_use_horus_value: Optional[bool] = None,
) -> Dict[str, Any]:
    started_ts = time.time()
    db_local = SessionLocal()
    try:
        settings = db_local.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
        if not settings:
            raise ValueError("Configurações da empresa não encontradas.")

        template = (
            db_local.query(HorusReconciliationTemplate)
            .filter(
                HorusReconciliationTemplate.id == template_id,
                HorusReconciliationTemplate.company_id == company_id,
            )
            .first()
        )
        if not template:
            raise ValueError("Modelo de conciliação não encontrado.")

        is_dual_file = (template.mode or "SINGLE_FILE").upper() == "DUAL_FILE"
        match_field = (template.horus_match_field or "AUTO").upper().strip()
        tpl_col_map = dict(template.column_mapping) if isinstance(template.column_mapping, dict) else {}

        eff_unify_installments = (
            bool(override_unify_installments)
            if override_unify_installments is not None
            else bool(template.unify_installments)
        )
        eff_split_excess_launch = (
            bool(override_split_excess_launch)
            if override_split_excess_launch is not None
            else bool(template.split_excess_launch)
        )
        eff_use_horus_value = (
            bool(override_use_horus_value)
            if override_use_horus_value is not None
            else bool(tpl_col_map.get("use_horus_value", False))
        )
        eff_forma_credito_maior = str(template.forma_pagto_credito_maior or "").strip()

        _update_job_progress(
            job_id,
            phase="LENDO_PLANILHAS",
            percent=8,
            message=f"Lendo planilha de {template.channel_label} ({channel_filename})...",
        )

        vindi_rows = _parse_dynamic_channel_file(
            channel_bytes,
            channel_filename,
            template,
            override_use_horus_value=eff_use_horus_value,
        )
        if not vindi_rows:
            raise ValueError("Nenhum lançamento válido encontrado na planilha principal.")

        channel_meta = vindi_rows[0].get("_channel_statement_meta") if vindi_rows else None

        _update_job_progress(
            job_id,
            phase="LENDO_PLANILHAS",
            percent=18,
            total_orders=len(vindi_rows),
            message=f"{len(vindi_rows)} registros identificados na planilha. Processando vínculos...",
        )

        tray_bridge = None
        if is_dual_file and tray_bytes and tray_filename:
            _update_job_progress(
                job_id,
                phase="VINCULANDO_TRAY",
                percent=22,
                total_orders=len(vindi_rows),
                message=f"Cruzando {len(vindi_rows)} registros com a 2ª planilha ({tray_filename})...",
            )
            tray_bridge = _parse_dynamic_bridge_file(tray_bytes, tray_filename, template)

        lookup_keys_set = set()
        linked_tray_count = 0
        unlinked_tray_count = 0

        for v_row in vindi_rows:
            ped_canal = _normalize_order_key(v_row.get("pedido_canal") or v_row.get("pedido_web") or "")
            if tray_bridge:
                by_ch = tray_bridge["by_channel_order"]
                by_tr = tray_bridge["by_tray_order"]
                t_match = by_ch.get(ped_canal) or by_tr.get(ped_canal)
                if t_match:
                    linked_tray_count += 1
                    ped_tray = _normalize_order_key(t_match.get("pedido_tray") or "")
                    ped_horus_ref = _normalize_order_key(t_match.get("pedido_horus") or "") or ped_tray or ped_canal
                    v_row["vinculo_tray_ok"] = True
                    v_row["pedido_tray"] = ped_tray or "-"
                    v_row["pedido_horus_ref"] = ped_horus_ref
                    v_row["pedido_web"] = ped_horus_ref
                    v_row["valor_tray"] = float(t_match.get("valor_tray") or 0.0)
                    v_row["valor_tray_sem_acrescimo"] = float(t_match.get("valor_tray_sem_acrescimo") or t_match.get("valor_tray") or 0.0)
                    v_row["acrescimo_tray"] = float(t_match.get("acrescimo_tray") or 0.0)
                    v_row["subtotal_tray"] = float(t_match.get("subtotal_tray") or 0.0)
                    v_row["frete_tray"] = float(t_match.get("frete_tray") or 0.0)
                    v_row["desconto_tray"] = float(t_match.get("desconto_tray") or 0.0)
                    v_row["nf_tray"] = t_match.get("nf_tray") or ""
                    if (not v_row.get("cliente_nome") or v_row["cliente_nome"] == "-") and t_match.get("cliente_tray"):
                        v_row["cliente_nome"] = t_match["cliente_tray"]
                    if (not v_row.get("documento") or v_row["documento"] == "-") and t_match.get("documento_tray"):
                        v_row["documento"] = t_match["documento_tray"]

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
                            lookup_keys_set.add(cand)
                else:
                    unlinked_tray_count += 1
                    v_row["vinculo_tray_ok"] = False
                    v_row["pedido_tray"] = "-"
                    v_row["pedido_horus_ref"] = ped_canal
                    v_row["pedido_web"] = ped_canal
                    v_row["valor_tray"] = 0.0
                    if ped_canal:
                        lookup_keys_set.add(ped_canal)
            else:
                v_row["vinculo_tray_ok"] = True
                v_row["pedido_tray"] = "-"
                v_row["pedido_horus_ref"] = ped_canal
                if ped_canal:
                    lookup_keys_set.add(ped_canal)

        if not lookup_keys_set:
            raise ValueError("Nenhuma chave de busca foi identificada nas planilhas.")

        sql_client = HorusSQLClient(db_local, company_id)
        cod_filial = str(filial or settings.horus_sql_cod_filial or settings.horus_branch or "1").strip()

        keys_list = list(lookup_keys_set)
        batch_size = 200
        total_batches = max(1, (len(keys_list) + batch_size - 1) // batch_size)
        all_horus_releases: List[Dict[str, Any]] = []
        seen_lancto_keys = set()

        _update_job_progress(
            job_id,
            phase="CONSULTANDO_HORUS",
            percent=30,
            current_batch=0,
            total_batches=total_batches,
            processed_orders=0,
            total_orders=len(keys_list),
            horus_found_count=0,
            message=f"Consultando Horus ERP por {match_field} (Filial {cod_filial}) em {total_batches} lote(s)...",
        )

        # LEFT JOIN em PEDIDOS_VENDA e CLIENTES permite encontrar tanto lançamentos com pedido quanto avulsos / por NF
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
                ISNULL(NF.NRO_NOTA_FISCAL, LR.COD_NF) AS NRO_NOTA_FISCAL,
                CLI.NOM_CLI
            FROM LANCTOS_CRECEBER LR WITH (NOLOCK)
            LEFT JOIN PEDIDOS_VENDA PV WITH (NOLOCK)
                ON PV.COD_PED_VENDA = LR.COD_PED_VENDA 
                AND PV.COD_FILIAL = LR.COD_FILIAL
            LEFT JOIN CLIENTES CLI WITH (NOLOCK)
                ON CLI.COD_CLI = LR.COD_CLI
            OUTER APPLY (
                SELECT TOP 1 NRO_NOTA_FISCAL 
                FROM NF_MESTRE WITH (NOLOCK)
                WHERE NF_MESTRE.COD_PED_VENDA = LR.COD_PED_VENDA
                  AND NF_MESTRE.COD_FILIAL = LR.COD_FILIAL
            ) NF
            WHERE LR.COD_FILIAL = %s
        """

        def _query_with_retry(q_sql: str, q_params: tuple) -> List[Dict[str, Any]]:
            last_err = None
            for attempt in range(3):
                try:
                    return sql_client.query(q_sql, q_params, max_rows=10000)
                except Exception as q_ex:
                    last_err = q_ex
                    time.sleep(0.35 * (attempt + 1))
            raise last_err

        def _add_rows(rows: List[Dict[str, Any]]) -> None:
            for r in rows:
                lk = (r.get("COD_FILIAL"), r.get("NRO_LANCTO_CRECEBER"))
                if lk not in seen_lancto_keys:
                    seen_lancto_keys.add(lk)
                    all_horus_releases.append(r)

        for b_idx, i in enumerate(range(0, len(keys_list), batch_size), start=1):
            batch = keys_list[i:i + batch_size]
            numeric_batch = [int(x) for x in batch if str(x).isdigit() and len(str(x)) <= 10]

            # 1) Busca por NRO_NOTA_FISCAL
            if match_field in ("NRO_NOTA_FISCAL", "AUTO") and numeric_batch:
                ph = ", ".join(["%s"] * len(numeric_batch))
                q_nf = f"""
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
                        NFM.NRO_NOTA_FISCAL,
                        CLI.NOM_CLI
                    FROM NF_MESTRE NFM WITH (NOLOCK)
                    INNER JOIN LANCTOS_CRECEBER LR WITH (NOLOCK)
                        ON LR.COD_PED_VENDA = NFM.COD_PED_VENDA
                        AND LR.COD_FILIAL = NFM.COD_FILIAL
                    LEFT JOIN PEDIDOS_VENDA PV WITH (NOLOCK)
                        ON PV.COD_PED_VENDA = LR.COD_PED_VENDA
                        AND PV.COD_FILIAL = LR.COD_FILIAL
                    LEFT JOIN CLIENTES CLI WITH (NOLOCK)
                        ON CLI.COD_CLI = LR.COD_CLI
                    WHERE NFM.COD_FILIAL = %s
                      AND NFM.NRO_NOTA_FISCAL IN ({ph})
                    ORDER BY LR.COD_PED_VENDA DESC, LR.NRO_LANCTO_CRECEBER DESC
                """
                _add_rows(_query_with_retry(q_nf, tuple([cod_filial] + numeric_batch)))

                q_cod_nf = (
                    base_select_sql
                    + f" AND LR.COD_NF IN ({ph}) "
                    + " ORDER BY LR.NRO_LANCTO_CRECEBER DESC"
                )
                try:
                    _add_rows(_query_with_retry(q_cod_nf, tuple([cod_filial] + numeric_batch)))
                except Exception:
                    pass

            # 2) Busca por NRO_LANCTO_CRECEBER (Lançamento Direto)
            if match_field in ("NRO_LANCTO_CRECEBER", "AUTO") and numeric_batch:
                ph = ", ".join(["%s"] * len(numeric_batch))
                q_lancto = (
                    base_select_sql
                    + f" AND LR.NRO_LANCTO_CRECEBER IN ({ph}) "
                    + " ORDER BY LR.NRO_LANCTO_CRECEBER DESC"
                )
                _add_rows(_query_with_retry(q_lancto, tuple([cod_filial] + numeric_batch)))

            # 3) Busca por COD_PEDIDO_ORIGEM (Pedido Web / Origem)
            if match_field in ("COD_PEDIDO_ORIGEM", "COD_PED_VENDA", "AUTO"):
                ph_str = ", ".join(["%s"] * len(batch))
                q_origem = (
                    base_select_sql
                    + f" AND PV.COD_FILIAL = %s AND PV.COD_PEDIDO_ORIGEM IN ({ph_str}) "
                    + " ORDER BY LR.COD_PED_VENDA DESC, LR.NRO_LANCTO_CRECEBER DESC"
                )
                _add_rows(_query_with_retry(q_origem, tuple([cod_filial, cod_filial] + batch)))

            # 4) Busca por COD_PED_VENDA (Código do Pedido Horus)
            if match_field in ("COD_PED_VENDA", "COD_PEDIDO_ORIGEM", "AUTO") and numeric_batch:
                ph_num = ", ".join(["%s"] * len(numeric_batch))
                q_ped = (
                    base_select_sql
                    + f" AND LR.COD_PED_VENDA IN ({ph_num}) "
                    + " ORDER BY LR.COD_PED_VENDA DESC, LR.NRO_LANCTO_CRECEBER DESC"
                )
                _add_rows(_query_with_retry(q_ped, tuple([cod_filial] + numeric_batch)))

            processed_cnt = min(i + len(batch), len(keys_list))
            pct = 30 + int((b_idx / total_batches) * 58)
            _update_job_progress(
                job_id,
                phase="CONSULTANDO_HORUS",
                percent=min(88, pct),
                current_batch=b_idx,
                total_batches=total_batches,
                processed_orders=processed_cnt,
                total_orders=len(keys_list),
                horus_found_count=len(all_horus_releases),
                message=f"Consultando Horus ERP ({match_field}): lote {b_idx}/{total_batches} ({len(all_horus_releases)} títulos localizados)...",
            )

        horus_rows = all_horus_releases

        # Indexa os títulos do Horus de acordo com o campo de amarração do Modelo
        horus_by_key: Dict[str, List[Dict[str, Any]]] = {}
        for hr in horus_rows:
            k_origem = _normalize_order_key(hr.get("PEDIDO_WEB") or "")
            k_ped = _normalize_order_key(hr.get("COD_PED_VENDA") or "")
            k_nf = _normalize_order_key(hr.get("NRO_NOTA_FISCAL") or "")
            k_lancto = _normalize_order_key(hr.get("NRO_LANCTO_CRECEBER") or "")

            if match_field == "NRO_NOTA_FISCAL":
                candidate_keys = [k_nf]
            elif match_field == "NRO_LANCTO_CRECEBER":
                candidate_keys = [k_lancto]
            elif match_field == "COD_PED_VENDA":
                candidate_keys = [k_ped, k_origem]
            elif match_field == "COD_PEDIDO_ORIGEM":
                candidate_keys = [k_origem, k_ped]
            else:
                candidate_keys = [k_origem, k_ped, k_nf, k_lancto]

            for k in candidate_keys:
                if not k:
                    continue
                if k not in horus_by_key:
                    horus_by_key[k] = []
                if hr not in horus_by_key[k]:
                    horus_by_key[k].append(hr)

        for k, m_list in horus_by_key.items():
            m_list.sort(
                key=lambda m: (
                    1 if str(m.get("STA_LANCTO_CRECEBER", "")).strip().upper() == "AB" and not (m.get("COD_BORDERO") and int(m.get("COD_BORDERO")) > 0) else 0,
                    int(m.get("COD_PED_VENDA") or 0),
                    -int(m.get("NRO_LANCTO_CRECEBER") or 0),
                ),
                reverse=True,
            )

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
                horus_by_key.get(ped_horus_ref)
                or (horus_by_key.get(ped_tray) if ped_tray and ped_tray != "-" else None)
                or horus_by_key.get(ped_canal)
                or []
            )

            if not matches:
                motivo_msg = (
                    f"Chave '{ped}' não localizada no Horus por {match_field} (Filial {cod_filial})."
                )
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
                reverse=True,
            )
            mais_recente_ped_horus = pedidos_horus_ids[0] if pedidos_horus_ids else int(matches[0].get("COD_PED_VENDA") or 0)
            has_multiplos_pedidos = len(pedidos_horus_ids) > 1

            selected_match = None
            grouped_lancto_ids: List[int] = []
            unificadas_qtd = 1
            unified_horus_val: Optional[float] = None
            parc_canal_num = v_row.get("parcela_canal_num")
            subtotal_tray = float(v_row.get("subtotal_tray") or 0.0)

            # Quando a busca é por NRO_LANCTO_CRECEBER direto, não unifica parcelas de outros lançamentos
            allow_unify = eff_unify_installments and match_field != "NRO_LANCTO_CRECEBER"

            if allow_unify and not parc_canal_num:
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
                parcelas_deste_pedido.index(h_match) + 1 if h_match in parcelas_deste_pedido else 1
            )

            h_status = str(h_match.get("STA_LANCTO_CRECEBER", "")).strip().upper()
            h_valor_original = unified_horus_val if unified_horus_val is not None else float(h_match.get("VLR_LANCTO_CRECEBER") or 0.0)
            h_bordero = h_match.get("COD_BORDERO")
            h_lancto = h_match.get("NRO_LANCTO_CRECEBER")
            h_nf = h_match.get("NRO_NOTA_FISCAL") or v_row.get("nf_tray")
            h_nom_cli = _clean_str(h_match.get("NOM_CLI"))
            if (not v_row.get("cliente_nome") or v_row["cliente_nome"] == "-") and h_nom_cli:
                v_row["cliente_nome"] = h_nom_cli

            # Se a opção "Considerar Valor do Lançamento Pago do Horus" estiver ativa:
            # mesmo que a planilha tenha outro valor ou nem tenha coluna de valor, assume 100% o valor do lançamento no Horus ERP.
            if eff_use_horus_value and h_valor_original > 0:
                old_v = v_valor
                v_valor = round(h_valor_original, 2)
                v_valor_liq = round(h_valor_original, 2)
                v_taxa = 0.0
                v_row["valor"] = v_valor
                v_row["valor_bruto"] = v_valor
                v_row["valor_liquido"] = v_valor_liq
                v_row["taxa"] = 0.0
                total_vindi_amount += (v_valor - old_v)
            elif not v_row.get("bruto_from_channel", True) and not is_dual_file and h_valor_original > 0:
                if abs(v_valor - v_valor_liq) < 0.005 and h_valor_original >= v_valor_liq:
                    old_v = v_valor
                    v_valor = round(h_valor_original, 2)
                    v_taxa = round(max(0.0, h_valor_original - v_valor_liq), 2)
                    v_row["valor"] = v_valor
                    v_row["valor_bruto"] = v_valor
                    v_row["taxa"] = v_taxa
                    total_vindi_amount += (v_valor - old_v)

            acrescimo_tray = float(v_row.get("acrescimo_tray") or 0.0)
            desconto_tray = float(v_row.get("desconto_tray") or 0.0)
            raw_diff = 0.0 if eff_use_horus_value else round(v_valor - h_valor_original, 2)

            valor_credito_maior = 0.0
            has_credito_maior_split = False
            h_valor = h_valor_original

            if eff_unify_installments and not eff_use_horus_value:
                if raw_diff < -0.05 and eff_split_excess_launch:
                    valor_credito_maior = round(abs(raw_diff), 2)
                    has_credito_maior_split = True
                    h_valor = round(v_valor, 2)
                    credito_maior_count += 1
                    credito_maior_total = round(credito_maior_total + valor_credito_maior, 2)
                elif abs(raw_diff) > 0.05:
                    h_valor = round(v_valor, 2)

            diff_val_abs = abs(v_valor - h_valor)
            diff_val_signed = round(v_valor - h_valor, 2)
            diff_taxa_signed = round(v_valor_liq - h_valor, 2)
            diff_taxa_abs = round(abs(diff_taxa_signed), 2)

            ja_baixado = (h_status != "AB") or (h_bordero is not None and int(h_bordero) > 0)
            situacao_label = "PAGO" if ja_baixado else "ABERTO"

            item_payload = {
                "linha": v_row["linha"],
                "pedido_canal": ped_canal,
                "pedido_tray": ped_tray,
                "vinculo_tray_ok": vinculo_tray_ok,
                "valor_tray": valor_tray,
                "pedido_web": ped,
                "nro_lancamento": h_lancto,
                "cod_ped_venda": h_ped_venda,
                "cod_filial": h_match.get("COD_FILIAL"),
                "nro_nota_fiscal": str(h_nf) if h_nf else None,
                "cliente_nome": v_row["cliente_nome"],
                "documento": v_row["documento"],
                "valor_vindi": v_valor,
                "valor_bruto": v_valor,
                "valor_liquido": v_valor_liq,
                "taxa": v_taxa,
                "valor_horus": h_valor,
                "valor_horus_original": h_valor_original,
                "valor_credito_maior": valor_credito_maior,
                "has_credito_maior_split": has_credito_maior_split,
                "forma_pagto_credito_maior": eff_forma_credito_maior if has_credito_maior_split else None,
                "acrescimo_tray": acrescimo_tray,
                "desconto_tray": desconto_tray,
                "diff_taxa": diff_taxa_signed,
                "diff_taxa_abs": diff_taxa_abs,
                "diferenca_valor_abs": round(diff_val_abs, 2),
                "diferenca_valor": diff_val_signed,
                "data_pagamento": v_row["data_pagamento"],
                "status_horus": h_status,
                "situacao_horus": situacao_label,
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
            }

            if ja_baixado:
                items_already_paid.append({
                    **item_payload,
                    "motivo": f"Já consta como baixado no Horus (Status: {h_status}, Borderô: {h_bordero or 'S/N'}).",
                })
                continue

            if diff_val_abs > 0.05:
                items_divergence.append({
                    **item_payload,
                    "selected": True,
                    "motivo": f"Diferença de R$ {diff_val_abs:.2f} (Planilha: R$ {v_valor:.2f} vs Horus: R$ {h_valor:.2f}).",
                })
                total_divergence_amount += h_valor
            else:
                motivo_ready = f"Vínculo {match_field} OK: #{ped_canal} → Horus Lanç. #{h_lancto}"
                if eff_use_horus_value:
                    motivo_ready += f" • Valor considerado do Lançamento Horus (R$ {h_valor:.2f})"
                if unificadas_qtd > 1:
                    motivo_ready += f" ({unificadas_qtd} parcelas unificadas)"
                if has_credito_maior_split:
                    motivo_ready += f" • Crédito Maior R$ {valor_credito_maior:.2f} separado"
                items_ready.append({
                    **item_payload,
                    "selected": True,
                    "motivo": motivo_ready,
                })
                total_ready_amount += h_valor

        unassigned_debits = 0.0 if eff_use_horus_value else float((channel_meta or {}).get("unassigned_debits_total") or 0.0)
        if unassigned_debits > 0.001 and eff_unify_installments and not eff_use_horus_value:
            rem_debit = round(unassigned_debits, 2)
            abertos_candidates = sorted(
                items_ready + items_divergence,
                key=lambda x: float(x.get("valor_liquido") or 0.0),
                reverse=True,
            )
            for cand in abertos_candidates:
                if rem_debit <= 0.001:
                    break
                cur_liq = float(cand.get("valor_liquido") or 0.0)
                if cur_liq > 1.0:
                    deduct = round(min(rem_debit, cur_liq - 0.01), 2)
                    if deduct > 0:
                        cand["valor_liquido"] = round(cur_liq - deduct, 2)
                        cand["taxa"] = round(float(cand.get("taxa") or 0.0) + deduct, 2)
                        cand["diff_taxa"] = -cand["taxa"]
                        cand["diff_taxa_abs"] = cand["taxa"]
                        rem_debit = round(rem_debit - deduct, 2)

        total_taxa_all = sum(float(r.get("taxa") or 0.0) for r in vindi_rows) + unassigned_debits
        total_liq_all = sum(float(r.get("valor_liquido") or r.get("valor") or 0.0) for r in vindi_rows) - unassigned_debits

        all_abertos = items_ready + items_divergence
        abertos_qtd = len(all_abertos)
        abertos_valor = sum(float(i.get("valor_horus") or 0.0) for i in all_abertos)
        abertos_valor_liquido = sum(
            float(i.get("valor_liquido") if i.get("valor_liquido") is not None else (i.get("valor_horus") or 0.0))
            for i in all_abertos
        )
        pagos_qtd = len(items_already_paid)
        pagos_valor = sum(float(i.get("valor_horus") or i.get("valor_vindi") or 0.0) for i in items_already_paid)
        divergence_diff_total = sum(float(i.get("diferenca_valor_abs") or 0.0) for i in items_divergence)
        elapsed_total = round(time.time() - started_ts, 2)

        serialized_tpl = _serialize_template(template, settings)

        result_payload = {
            "summary": {
                "profile_code": template.code,
                "template_id": template.id,
                "horus_match_field": match_field,
                "is_dual_file": is_dual_file,
                "unify_installments": eff_unify_installments,
                "split_excess_launch": eff_split_excess_launch,
                "use_horus_value": eff_use_horus_value,
                "forma_pagto_credito_maior": eff_forma_credito_maior,
                "credito_maior_count": credito_maior_count,
                "credito_maior_total": round(credito_maior_total, 2),
                "unificadas_orders_count": unificadas_orders_count,
                "unificadas_parcelas_count": unificadas_parcelas_count,
                "total_planilha_qtd": len(vindi_rows),
                "total_planilha_linhas": int((channel_meta or {}).get("raw_rows_count") or len(vindi_rows)),
                "total_planilha_valor": round(total_vindi_amount, 2),
                "total_planilha_liq": round(total_liq_all, 2),
                "total_planilha_entradas_liq": round(float((channel_meta or {}).get("entradas_liquido_total") or total_liq_all), 2),
                "total_planilha_saidas_qtd": int((channel_meta or {}).get("saidas_count") or 0),
                "total_planilha_saidas_valor": round(float((channel_meta or {}).get("saidas_total") or 0.0), 2),
                "tray_total_rows": tray_bridge["total_rows"] if tray_bridge else 0,
                "tray_linked_qtd": linked_tray_count if is_dual_file else len(vindi_rows),
                "tray_unlinked_qtd": unlinked_tray_count if is_dual_file else 0,
                "ready_qtd": len(items_ready),
                "ready_valor": round(total_ready_amount, 2),
                "divergence_qtd": len(items_divergence),
                "divergence_valor": round(total_divergence_amount, 2),
                "divergence_diff_total": round(divergence_diff_total, 2),
                "total_taxa_vindi": round(total_taxa_all, 2),
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
                    "verified": True,
                    "elapsed_seconds": elapsed_total,
                    "total_batches": total_batches,
                    "total_orders_checked": len(keys_list),
                    "horus_titles_fetched": len(horus_rows),
                    "completed_at": datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
                },
            },
            "bank_config": serialized_tpl["effective_bank"],
            "template": serialized_tpl,
            "warnings": [],
            "items_ready": items_ready,
            "items_divergence": items_divergence,
            "items_already_paid": items_already_paid,
            "items_not_found": items_not_found,
        }

        _finalize_reconciliation_job(job_id, result=result_payload)
        return result_payload
    except Exception as exc:
        logger.error("[DynamicReconciliation] Erro na conciliação company=%s: %s", company_id, exc)
        _finalize_reconciliation_job(job_id, error=str(exc))
        raise
    finally:
        db_local.close()


# ── Schemas de Criação / Edição de Modelo ─────────────────────────────────────

class ReconciliationTemplatePayload(BaseModel):
    code: Optional[str] = None
    name: str
    short_name: Optional[str] = None
    channel_label: Optional[str] = None
    hub_label: Optional[str] = None
    badge: Optional[str] = None
    description: Optional[str] = None
    mode: str = "SINGLE_FILE"  # SINGLE_FILE | DUAL_FILE
    file_1_label: Optional[str] = None
    file_2_label: Optional[str] = None
    horus_match_field: str = "NRO_NOTA_FISCAL"  # NRO_NOTA_FISCAL | COD_PED_VENDA | NRO_LANCTO_CRECEBER | COD_PEDIDO_ORIGEM | AUTO
    column_mapping: Optional[Dict[str, Any]] = None
    forma_pagto: Optional[str] = ""
    forma_pagto_credito_maior: Optional[str] = ""
    banco: Optional[str] = ""
    agencia: Optional[str] = ""
    conta: Optional[str] = ""
    carteira: Optional[str] = ""
    payment_date_mode: Optional[str] = "CHANNEL_DATE"
    unify_installments: Optional[bool] = True
    split_excess_launch: Optional[bool] = True
    use_horus_value: Optional[bool] = None


# ── Endpoints REST ────────────────────────────────────────────────────────────

@router.get("/companies/{company_id}/horus-sql/dynamic-reconciliation/templates")
def list_dynamic_reconciliation_templates(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Lista todos os modelos de conciliação da empresa.
    Se a empresa ainda não possuir nenhum modelo na tabela, cria/migra automaticamente
    os 5 modelos iniciais (Shopee+Tray, Vindi+Tray, Por Nota Fiscal, Por Pedido Horus e Por Nº Lançamento).
    """
    assert_company_ownership(current_user, company_id)
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Configurações da empresa não encontradas.")

    templates = _seed_or_migrate_company_templates(db, company_id, settings)
    default_filial = (settings.horus_sql_cod_filial or settings.horus_branch or "1").strip()

    return {
        "company_id": company_id,
        "default_filial": default_filial,
        "templates": [_serialize_template(t, settings) for t in templates],
    }


@router.post("/companies/{company_id}/horus-sql/dynamic-reconciliation/migrate-presets")
def migrate_legacy_presets_to_dynamic_templates(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Sincroniza/migra os parâmetros bancários da rotina antiga (Vindi/Shopee) e restaura
    os 5 modelos padrão sem apagar modelos customizados já criados pelo cliente.
    """
    assert_company_ownership(current_user, company_id)
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Configurações da empresa não encontradas.")

    templates = _seed_or_migrate_company_templates(db, company_id, settings)
    return {
        "status": "success",
        "message": "Modelos padrão (Shopee, Vindi, Nota Fiscal, Pedido Horus e Nº Lançamento) sincronizados com sucesso!",
        "templates": [_serialize_template(t, settings) for t in templates],
    }


@router.post("/companies/{company_id}/horus-sql/dynamic-reconciliation/templates")
def create_dynamic_reconciliation_template(
    company_id: int,
    payload: ReconciliationTemplatePayload,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Cria um novo Modelo de Conciliação customizado para a empresa."""
    assert_company_ownership(current_user, company_id)
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Configurações da empresa não encontradas.")

    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Informe o nome do Modelo de Conciliação.")

    short_name = (payload.short_name or name[:40]).strip()
    raw_code = (payload.code or re.sub(r"[^A-Z0-9_]+", "_", short_name.upper()).strip("_") or "MODELO_CUSTOM").strip()
    code = f"{raw_code}_{uuid.uuid4().hex[:4].upper()}" if db.query(HorusReconciliationTemplate).filter_by(company_id=company_id, code=raw_code).first() else raw_code

    mode = (payload.mode or "SINGLE_FILE").upper().strip()
    if mode not in ("SINGLE_FILE", "DUAL_FILE"):
        mode = "SINGLE_FILE"

    match_field = (payload.horus_match_field or "NRO_NOTA_FISCAL").upper().strip()
    if match_field not in ("NRO_NOTA_FISCAL", "COD_PED_VENDA", "NRO_LANCTO_CRECEBER", "COD_PEDIDO_ORIGEM", "AUTO"):
        match_field = "AUTO"

    pay_mode = (payload.payment_date_mode or "CHANNEL_DATE").upper().strip()
    if pay_mode not in ("CHANNEL_DATE", "SPECIFIC_DATE", "BORDERO_OPEN"):
        pay_mode = "CHANNEL_DATE"

    col_map = dict(payload.column_mapping or {"engine_preset": "DYNAMIC"})
    if payload.use_horus_value is not None:
        col_map["use_horus_value"] = bool(payload.use_horus_value)

    new_tpl = HorusReconciliationTemplate(
        company_id=company_id,
        code=code,
        name=name,
        short_name=short_name,
        channel_label=(payload.channel_label or short_name).strip(),
        hub_label=(payload.hub_label or ("Planilha Ponte" if mode == "DUAL_FILE" else f"Horus ({match_field})")).strip(),
        badge=(payload.badge or (f"2 Planilhas • {match_field}" if mode == "DUAL_FILE" else f"1 Planilha • {match_field}")).strip(),
        description=(payload.description or "").strip(),
        mode=mode,
        file_1_label=(payload.file_1_label or f"1º Arquivo: Planilha Financeira ({short_name})").strip(),
        file_2_label=(payload.file_2_label or "2º Arquivo: Planilha Ponte (Vínculo com Horus)").strip() if mode == "DUAL_FILE" else None,
        horus_match_field=match_field,
        column_mapping=col_map,
        forma_pagto=(payload.forma_pagto or "").strip(),
        forma_pagto_credito_maior=(payload.forma_pagto_credito_maior or "").strip(),
        banco=(payload.banco or "").strip(),
        agencia=(payload.agencia or "").strip(),
        conta=(payload.conta or "").strip(),
        carteira=(payload.carteira or "").strip(),
        payment_date_mode=pay_mode,
        unify_installments=bool(payload.unify_installments),
        split_excess_launch=bool(payload.split_excess_launch),
        is_active=True,
        is_system_preset=False,
        display_order=20,
    )
    db.add(new_tpl)
    db.commit()
    db.refresh(new_tpl)

    all_tpls = _seed_or_migrate_company_templates(db, company_id, settings)
    return {
        "status": "success",
        "template": _serialize_template(new_tpl, settings),
        "templates": [_serialize_template(t, settings) for t in all_tpls],
    }


@router.put("/companies/{company_id}/horus-sql/dynamic-reconciliation/templates/{template_id}")
def update_dynamic_reconciliation_template(
    company_id: int,
    template_id: int,
    payload: ReconciliationTemplatePayload,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Atualiza o mapeamento de colunas, chave Horus, parâmetros bancários e regras de um Modelo."""
    assert_company_ownership(current_user, company_id)
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Configurações da empresa não encontradas.")

    tpl = (
        db.query(HorusReconciliationTemplate)
        .filter(
            HorusReconciliationTemplate.id == template_id,
            HorusReconciliationTemplate.company_id == company_id,
        )
        .first()
    )
    if not tpl:
        raise HTTPException(status_code=404, detail="Modelo de conciliação não encontrado.")

    if payload.name:
        tpl.name = payload.name.strip()
    if payload.short_name:
        tpl.short_name = payload.short_name.strip()
    if payload.channel_label:
        tpl.channel_label = payload.channel_label.strip()
    if payload.hub_label is not None:
        tpl.hub_label = payload.hub_label.strip()
    if payload.description is not None:
        tpl.description = payload.description.strip()

    if payload.mode:
        mode = payload.mode.upper().strip()
        if mode in ("SINGLE_FILE", "DUAL_FILE"):
            tpl.mode = mode
    if payload.file_1_label is not None:
        tpl.file_1_label = payload.file_1_label.strip()
    if payload.file_2_label is not None:
        tpl.file_2_label = payload.file_2_label.strip() if tpl.mode == "DUAL_FILE" else None

    if payload.horus_match_field:
        mf = payload.horus_match_field.upper().strip()
        if mf in ("NRO_NOTA_FISCAL", "COD_PED_VENDA", "NRO_LANCTO_CRECEBER", "COD_PEDIDO_ORIGEM", "AUTO"):
            tpl.horus_match_field = mf

    tpl.badge = f"{'2 Planilhas' if tpl.mode == 'DUAL_FILE' else '1 Planilha'} • {tpl.horus_match_field}"

    if payload.column_mapping is not None:
        col_map = dict(payload.column_mapping)
        if payload.use_horus_value is not None:
            col_map["use_horus_value"] = bool(payload.use_horus_value)
        tpl.column_mapping = col_map
    elif payload.use_horus_value is not None:
        col_map = dict(tpl.column_mapping or {})
        col_map["use_horus_value"] = bool(payload.use_horus_value)
        tpl.column_mapping = col_map

    if payload.forma_pagto is not None:
        tpl.forma_pagto = payload.forma_pagto.strip()
    if payload.forma_pagto_credito_maior is not None:
        tpl.forma_pagto_credito_maior = payload.forma_pagto_credito_maior.strip()
    if payload.banco is not None:
        tpl.banco = payload.banco.strip()
    if payload.agencia is not None:
        tpl.agencia = payload.agencia.strip()
    if payload.conta is not None:
        tpl.conta = payload.conta.strip()
    if payload.carteira is not None:
        tpl.carteira = payload.carteira.strip()

    if payload.payment_date_mode:
        pm = payload.payment_date_mode.upper().strip()
        if pm in ("CHANNEL_DATE", "SPECIFIC_DATE", "BORDERO_OPEN"):
            tpl.payment_date_mode = pm

    if payload.unify_installments is not None:
        tpl.unify_installments = bool(payload.unify_installments)
    if payload.split_excess_launch is not None:
        tpl.split_excess_launch = bool(payload.split_excess_launch)

    db.commit()
    db.refresh(tpl)

    all_tpls = _seed_or_migrate_company_templates(db, company_id, settings)
    return {
        "status": "success",
        "template": _serialize_template(tpl, settings),
        "templates": [_serialize_template(t, settings) for t in all_tpls],
    }


@router.delete("/companies/{company_id}/horus-sql/dynamic-reconciliation/templates/{template_id}")
def delete_dynamic_reconciliation_template(
    company_id: int,
    template_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Remove (ou desativa) um Modelo de Conciliação."""
    assert_company_ownership(current_user, company_id)
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Configurações da empresa não encontradas.")

    tpl = (
        db.query(HorusReconciliationTemplate)
        .filter(
            HorusReconciliationTemplate.id == template_id,
            HorusReconciliationTemplate.company_id == company_id,
        )
        .first()
    )
    if not tpl:
        raise HTTPException(status_code=404, detail="Modelo não encontrado.")

    db.delete(tpl)
    db.commit()

    remaining = (
        db.query(HorusReconciliationTemplate)
        .filter(
            HorusReconciliationTemplate.company_id == company_id,
            HorusReconciliationTemplate.is_active == True,
        )
        .order_by(HorusReconciliationTemplate.display_order.asc(), HorusReconciliationTemplate.id.asc())
        .all()
    )
    return {
        "status": "success",
        "templates": [_serialize_template(t, settings) for t in remaining],
    }


@router.post("/companies/{company_id}/horus-sql/dynamic-reconciliation/inspect-columns")
async def inspect_spreadsheet_columns(
    company_id: int,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Recebe uma planilha de exemplo (.xlsx ou .csv), detecta automaticamente a linha
    de cabeçalho (mesmo com linhas de topo como Shopee), retorna a lista de colunas,
    5 linhas de amostra e uma sugestão automática de mapeamento De/Para.
    """
    assert_company_ownership(current_user, company_id)
    validate_file_size_and_extension(file, category="sheet")
    file_bytes = await read_file_safely(file, max_size_bytes=MAX_SHEET_SIZE_BYTES)
    filename = file.filename or "planilha.xlsx"

    try:
        raw_rows, _ = _read_raw_rows(file_bytes, filename)
        if not raw_rows:
            raise ValueError("A planilha enviada está vazia.")
        header_idx, headers = _detect_best_header_row(raw_rows)
        sample_rows: List[Dict[str, str]] = []
        for r_i in range(header_idx + 1, min(len(raw_rows), header_idx + 15)):
            row = raw_rows[r_i]
            if not row or not any(_clean_str(c) for c in row):
                continue
            row_dict = {}
            for c_i, h in enumerate(headers):
                row_dict[h] = _clean_str(row[c_i]) if c_i < len(row) else ""
            sample_rows.append(row_dict)
            if len(sample_rows) >= 4:
                break

        suggested = _suggest_column_mapping(headers)
        return {
            "filename": filename,
            "header_row_number": header_idx + 1,
            "headers": headers,
            "sample_rows": sample_rows,
            "suggested_mapping": suggested,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao ler colunas da planilha: {e}")


@router.post("/companies/{company_id}/horus-sql/dynamic-reconciliation/preview")
async def preview_dynamic_reconciliation(
    company_id: int,
    template_id: int = Query(..., description="ID do Modelo de Conciliação"),
    filial: Optional[str] = Query(default=None),
    async_job: Optional[bool] = Query(default=True),
    unify_installments: Optional[bool] = Query(default=None),
    split_excess_launch: Optional[bool] = Query(default=None),
    use_horus_value: Optional[bool] = Query(default=None),
    file: UploadFile = File(...),
    tray_file: Optional[UploadFile] = File(default=None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Executa a conciliação financeira no Horus ERP usando o Modelo Dinâmico selecionado.
    """
    assert_company_ownership(current_user, company_id)

    tpl = (
        db.query(HorusReconciliationTemplate)
        .filter(
            HorusReconciliationTemplate.id == template_id,
            HorusReconciliationTemplate.company_id == company_id,
        )
        .first()
    )
    if not tpl:
        raise HTTPException(status_code=404, detail="Modelo de conciliação não encontrado.")

    validate_file_size_and_extension(file, category="sheet")
    channel_bytes = await read_file_safely(file, max_size_bytes=MAX_SHEET_SIZE_BYTES)
    channel_filename = file.filename or "planilha_1.xlsx"

    tray_bytes: Optional[bytes] = None
    tray_filename: Optional[str] = None
    if (tpl.mode or "SINGLE_FILE").upper() == "DUAL_FILE":
        if not tray_file or not tray_file.filename:
            raise HTTPException(
                status_code=400,
                detail=f"O modelo '{tpl.name}' é de 2 Planilhas. Envie também o 2º arquivo ({tpl.file_2_label or 'Planilha Ponte'}).",
            )
        validate_file_size_and_extension(tray_file, category="sheet")
        tray_bytes = await read_file_safely(tray_file, max_size_bytes=MAX_SHEET_SIZE_BYTES)
        tray_filename = tray_file.filename

    if async_job:
        job_id = _create_reconciliation_job(company_id, tpl.code)

        def _bg_worker():
            try:
                _run_dynamic_reconciliation_core(
                    company_id=company_id,
                    template_id=template_id,
                    filial=filial,
                    channel_bytes=channel_bytes,
                    channel_filename=channel_filename,
                    tray_bytes=tray_bytes,
                    tray_filename=tray_filename,
                    job_id=job_id,
                    override_unify_installments=unify_installments,
                    override_split_excess_launch=split_excess_launch,
                    override_use_horus_value=use_horus_value,
                )
            except Exception as bg_err:
                logger.error("[DynamicReconciliationJob] Job %s falhou: %s", job_id, bg_err)

        t = threading.Thread(target=_bg_worker, daemon=True)
        t.start()
        return {"job_id": job_id, "status": "RUNNING"}

    try:
        return _run_dynamic_reconciliation_core(
            company_id=company_id,
            template_id=template_id,
            filial=filial,
            channel_bytes=channel_bytes,
            channel_filename=channel_filename,
            tray_bytes=tray_bytes,
            tray_filename=tray_filename,
            job_id=None,
            override_unify_installments=unify_installments,
            override_split_excess_launch=split_excess_launch,
            override_use_horus_value=use_horus_value,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/companies/{company_id}/horus-sql/dynamic-reconciliation/bordero")
async def create_dynamic_template_bordero(
    company_id: int,
    payload: CreateBorderoPayload,
    template_id: int = Query(..., description="ID do Modelo de Conciliação"),
    async_job: Optional[bool] = Query(default=True),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Gera o Borderô no Horus ERP usando os parâmetros bancários e regras do Modelo Dinâmico selecionado,
    com acompanhamento em tempo real e gravação do fechamento no histórico do Cronuz B2B.
    """
    assert_company_ownership(current_user, company_id)

    if not payload.releases:
        raise HTTPException(status_code=400, detail="Nenhum lançamento selecionado para gerar borderô.")

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Configurações da empresa não encontradas.")

    tpl = (
        db.query(HorusReconciliationTemplate)
        .filter(
            HorusReconciliationTemplate.id == template_id,
            HorusReconciliationTemplate.company_id == company_id,
        )
        .first()
    )
    if not tpl:
        raise HTTPException(status_code=404, detail="Modelo de conciliação não encontrado.")

    serialized_tpl = _serialize_template(tpl, settings)
    bank_cfg = serialized_tpl["effective_bank"]

    forma_pagto = bank_cfg["forma_pagto"]
    cod_banco = bank_cfg["banco"]
    cod_agencia = bank_cfg["agencia"]
    cod_conta = bank_cfg["conta"]
    nro_carteira = bank_cfg["carteira"] or ""

    if not all([forma_pagto, cod_banco, cod_agencia, cod_conta]):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Parâmetros bancários incompletos para o modelo '{tpl.short_name}'. "
                "Clique em 'Editar Modelo' para informar Forma de Pagamento, Banco, Agência e Conta."
            ),
        )

    unify_installments = (
        bool(payload.unify_installments)
        if payload.unify_installments is not None
        else bool(tpl.unify_installments)
    )
    split_excess_launch = (
        bool(payload.split_excess_launch)
        if payload.split_excess_launch is not None
        else bool(tpl.split_excess_launch)
    )
    forma_pagto_credito_maior = str(
        payload.forma_pagto_credito_maior
        or tpl.forma_pagto_credito_maior
        or forma_pagto
    ).strip()

    payment_date_mode = str(
        payload.payment_date_mode
        or tpl.payment_date_mode
        or "CHANNEL_DATE"
    ).upper().strip()
    if payment_date_mode not in ("CHANNEL_DATE", "SPECIFIC_DATE", "BORDERO_OPEN"):
        payment_date_mode = "CHANNEL_DATE"

    # Sincroniza o perfil bancário do modelo no dicionário da empresa para o pipeline de Borderô do Horus
    prof_configs = dict(getattr(settings, "horus_sql_profile_bank_configs", None) or {})
    prof_configs[tpl.code] = {
        "forma_pagto": forma_pagto,
        "forma_pagto_credito_maior": forma_pagto_credito_maior,
        "banco": cod_banco,
        "agencia": cod_agencia,
        "conta": cod_conta,
        "carteira": nro_carteira,
        "payment_date_mode": payment_date_mode,
        "unify_installments": unify_installments,
        "split_excess_launch": split_excess_launch,
    }
    settings.horus_sql_profile_bank_configs = prof_configs
    db.commit()

    payload.profile_code = tpl.code
    payload.payment_date_mode = payment_date_mode
    payload.unify_installments = unify_installments
    payload.split_excess_launch = split_excess_launch
    payload.forma_pagto_credito_maior = forma_pagto_credito_maior

    return await create_vindi_bordero(
        company_id=company_id,
        payload=payload,
        async_job=bool(async_job),
        db=db,
        current_user=current_user,
    )

"""
horus_invoices.py
-----------------
Consulta 100% via API REST do Horus (`Busca_NotaFiscal` + `XML_Base64` + `Busca_debitos`)
das últimas Notas Fiscais emitidas para geração controlada de boletos no Banco Cora.

Regras arquiteturais:
  - Respeita `horus_legacy_pagination` (OFFSET/LIMIT).
  - Extrai parcelas (`<cobr><dup>`: nDup, dVenc, vDup) e dados completos do destinatário (`<dest>`, `<enderDest>`)
    diretamente do XML da NF-e retornado pela API (`XML_Base64="S"`).
  - Cruza com `Busca_debitos` (Contas a Receber Horus via API) para vincular `NRO_LANCTO_CRECEBER`, forma de pagamento
    e identificar se o Horus (ex.: Bradesco) já gerou boleto para a parcela.
  - Cruza com `pay_charge` no PostgreSQL para bloquear emissão duplicada por Nota Fiscal + Parcela ou Lançamento.
"""
import asyncio
import base64
import io
import logging
import re
import time
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

import httpx
from pypdf import PdfReader, PdfWriter
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session, joinedload

from app.integrators.horus import HorusClient
from app.models.company import Company
from app.models.company_settings import CompanySettings
from app.models.cora import CoraConfig
from app.models.customer import Customer
from app.models.payments import PayCharge
from app.payments import service
from app.payments.base import ChargePayer, PaymentProviderError
from app.payments.registry import get_provider

logger = logging.getLogger(__name__)

_SCHEMA_CHECKED = False
# Cache em memória para catálogos estáticos do Horus (Busca_MetodoVenda + Busca_FormaPagto) -> TTL 30 min
_CATALOG_CACHE: Dict[int, Tuple[float, Dict[int, str], List[Dict[str, str]]]] = {}
# Cache de curto prazo (90s) das notas e débitos do período para troca instantânea de abas/filtros
_HORUS_DATA_CACHE: Dict[Tuple[int, str, str, str], Tuple[float, List[Dict[str, Any]], Dict[str, List[Dict[str, Any]]]]] = {}
# Cache de parse do XML_Base64 por nota (evita decodificar Base64 + XML repetidamente)
_XML_PARSE_CACHE: Dict[Tuple[int, str, str], Dict[str, Any]] = {}


def _ensure_cora_invoice_columns(db: Session) -> None:
    global _SCHEMA_CHECKED
    if _SCHEMA_CHECKED:
        return
    try:
        db.execute(text("ALTER TABLE fin_cora_config ADD COLUMN IF NOT EXISTS invoice_allowed_payment_forms VARCHAR(500);"))
        db.execute(text("ALTER TABLE fin_cora_config ADD COLUMN IF NOT EXISTS invoice_auto_emit_enabled BOOLEAN NOT NULL DEFAULT FALSE;"))
        db.commit()
        _SCHEMA_CHECKED = True
    except Exception as e:
        db.rollback()
        logger.debug("[HorusInvoices] _ensure_cora_invoice_columns: %s", e)


def invalidate_horus_invoices_cache(company_id: int) -> None:
    keys_to_remove = [k for k in _HORUS_DATA_CACHE if k[0] == company_id]
    for k in keys_to_remove:
        _HORUS_DATA_CACHE.pop(k, None)


def _digits(v: Any) -> str:
    return re.sub(r"\D", "", str(v or ""))


def _clean(v: Any) -> str:
    return re.sub(r"\s+", " ", str(v or "")).strip()


def _parse_amount(v: Any) -> float:
    if v is None or v == "":
        return 0.0
    if isinstance(v, (int, float, Decimal)):
        return round(float(v), 2)
    s = str(v).strip()
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return round(float(s), 2)
    except ValueError:
        return 0.0


def _parse_date_iso(v: Any) -> Optional[str]:
    if not v:
        return None
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    s = str(v).strip().split(" ")[0].split("T")[0]
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _normalize_installment_number(raw: Any, fallback_idx: int) -> str:
    s = _clean(raw)
    if not s:
        return str(fallback_idx)
    if s.isdigit():
        return str(int(s))
    digits = _digits(s)
    if digits:
        return str(int(digits))
    return s[:20]


def _parse_nfe_xml_base64(xml_b64: Optional[str]) -> Dict[str, Any]:
    """
    Extrai do XML da NF-e (`XML_Base64` de `Busca_NotaFiscal`):
      - `payer`: CPF/CNPJ, Razão Social, E-mail e Endereço completo (`<dest>` / `<enderDest>`)
      - `duplicatas`: lista de parcelas (`<cobr><dup>`: nDup, dVenc, vDup)
      - `fatura`: dados da fatura (`<cobr><fat>`: nFat, vOrig, vDesc, vLiq)
      - `nat_op`: natureza da operação (`<ide><natOp>`)
    """
    empty: Dict[str, Any] = {"payer": {}, "duplicatas": [], "fatura": {}, "nat_op": None}
    if not xml_b64 or not isinstance(xml_b64, str) or len(xml_b64.strip()) < 40:
        return empty
    s = xml_b64.strip()
    if s.upper().startswith("ERRO"):
        return empty

    try:
        raw_bytes = base64.b64decode(s)
    except Exception:
        return empty

    xml_text = None
    for enc in ("utf-8", "iso-8859-1", "cp1252"):
        try:
            xml_text = raw_bytes.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if not xml_text:
        return empty

    try:
        root = ET.fromstring(xml_text)
    except Exception:
        return empty

    def _local_tag(el) -> str:
        return el.tag.split("}")[-1] if "}" in el.tag else el.tag

    def _child_text(parent, tag_name: str) -> str:
        if parent is None:
            return ""
        for ch in parent:
            if _local_tag(ch) == tag_name:
                return _clean(ch.text)
        return ""

    dest_el = None
    cobr_el = None
    ide_el = None
    pag_el = None
    for el in root.iter():
        lt = _local_tag(el)
        if lt == "dest" and dest_el is None:
            dest_el = el
        elif lt == "cobr" and cobr_el is None:
            cobr_el = el
        elif lt == "ide" and ide_el is None:
            ide_el = el
        elif lt == "pag" and pag_el is None:
            pag_el = el

    nat_op = _child_text(ide_el, "natOp") if ide_el is not None else None

    tpag_map = {
        "01": "Dinheiro",
        "02": "Cheque",
        "03": "C Credito",
        "04": "C Debito",
        "05": "Crédito Loja",
        "14": "Duplicata Mercantil",
        "15": "Boleto",
        "16": "Deposito Bancário",
        "17": "Pix",
        "18": "Transferência",
        "90": "Sem Pagamento",
        "99": "Outros",
    }
    nfe_payment_label: Optional[str] = None
    if pag_el is not None:
        for ch in pag_el.iter():
            if _local_tag(ch) == "detPag":
                t_pag = _child_text(ch, "tPag").zfill(2) if _child_text(ch, "tPag") else ""
                x_pag = _child_text(ch, "xPag")
                nfe_payment_label = x_pag or tpag_map.get(t_pag)
                if nfe_payment_label:
                    break

    payer: Dict[str, Any] = {}
    if dest_el is not None:
        doc = _digits(_child_text(dest_el, "CNPJ") or _child_text(dest_el, "CPF"))
        name = _child_text(dest_el, "xNome")
        email = _child_text(dest_el, "email")
        ender_el = next((ch for ch in dest_el if _local_tag(ch) == "enderDest"), None)
        payer = {
            "document": doc,
            "name": name,
            "email": email,
            "street": _child_text(ender_el, "xLgr"),
            "number": _child_text(ender_el, "nro") or "S/N",
            "complement": _child_text(ender_el, "xCpl"),
            "district": _child_text(ender_el, "xBairro"),
            "city": _child_text(ender_el, "xMun"),
            "state": _child_text(ender_el, "UF")[:2].upper(),
            "zip_code": _digits(_child_text(ender_el, "CEP")),
        }

    fatura: Dict[str, Any] = {}
    duplicatas: List[Dict[str, Any]] = []
    if cobr_el is not None:
        for ch in cobr_el:
            lt = _local_tag(ch)
            if lt == "fat":
                fatura = {
                    "nFat": _child_text(ch, "nFat"),
                    "vOrig": _parse_amount(_child_text(ch, "vOrig")),
                    "vDesc": _parse_amount(_child_text(ch, "vDesc")),
                    "vLiq": _parse_amount(_child_text(ch, "vLiq")),
                }
            elif lt == "dup":
                idx = len(duplicatas) + 1
                raw_dup = _child_text(ch, "nDup")
                duplicatas.append({
                    "raw_number": raw_dup or f"{idx:03d}",
                    "installment_number": _normalize_installment_number(raw_dup, idx),
                    "due_date": _parse_date_iso(_child_text(ch, "dVenc")),
                    "amount": _parse_amount(_child_text(ch, "vDup")),
                })

    return {
        "payer": payer,
        "duplicatas": duplicatas,
        "fatura": fatura,
        "nat_op": nat_op or None,
        "nfe_payment_label": nfe_payment_label,
    }


def _run_async(coro):
    try:
        return asyncio.run(coro)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(coro)
        finally:
            loop.close()


def _resolve_horus_emp_fil(settings: CompanySettings) -> Tuple[str, str]:
    emp = _clean(getattr(settings, "horus_sql_cod_empresa", None) or settings.horus_company or "1") or "1"
    raw_branch = _clean(getattr(settings, "horus_sql_cod_filial", None) or settings.horus_branch or "1")
    branch_digits = _digits(raw_branch)
    fil = raw_branch if (branch_digits and len(branch_digits) < 11) else "1"
    return emp, fil


def _fetch_horus_invoices_and_debits_sql(
    db: Session,
    company_id: int,
    settings: CompanySettings,
    *,
    date_from: date,
    date_to: date,
    cod_ped_venda: Optional[str] = None,
    nro_nota_fiscal: Optional[str] = None,
    force_refresh: bool = False,
) -> Tuple[List[Dict[str, Any]], Dict[str, List[Dict[str, Any]]], Dict[int, str], List[Dict[str, str]]]:
    """
    Consulta rápida e direta no SQL Server do Horus ERP (`HorusSQLClient` / `pytds`):
      1. `METODO_VENDA` + `FORMA_PAGTO` cacheados por 30 minutos por empresa.
      2. `NF_MESTRE` + `PEDIDOS_VENDA` + `CLIENTES` + `ENDERECOS_CLIENTE` + `TABELA_UF` + `IBS_MUNICIPIOS_UF_ALIQ` / `LOCALIDADES`.
      3. `LANCTOS_CRECEBER` + `LANCTOS_CRECEBERA` + `FORMA_PAGTO` para todas as notas encontradas.
    """
    from app.integrators.horus_sql_client import HorusSQLClient

    emp, fil = _resolve_horus_emp_fil(settings)
    emp_int = int(emp) if emp.isdigit() else 1
    fil_int = int(fil) if fil.isdigit() else 1
    clean_ped = _clean(cod_ped_venda) if cod_ped_venda else ""
    clean_nf = _clean(nro_nota_fiscal).lstrip("0") if nro_nota_fiscal else ""
    now_ts = time.time()

    sql_client = HorusSQLClient(db, company_id)

    cached_cat = _CATALOG_CACHE.get(company_id)
    if cached_cat and (now_ts - cached_cat[0] < 1800) and not force_refresh:
        methods_map = dict(cached_cat[1])
        payment_forms_catalog = [dict(x) for x in cached_cat[2]]
    else:
        methods_map = {
            1: "Direta",
            2: "Consignação",
            3: "Web",
            4: "Representante",
            5: "Sem desconto na NF",
            6: "Pré-venda",
            7: "E-book",
        }
        payment_forms_catalog = []
        try:
            m_rows = sql_client.query(
                "SELECT COD_METODO, DESC_METODO FROM METODO_VENDA WITH (NOLOCK) ORDER BY COD_METODO",
                max_rows=200,
            )
            parsed_methods = {}
            for m in m_rows:
                if m.get("COD_METODO") is not None:
                    try:
                        parsed_methods[int(m["COD_METODO"])] = _clean(m.get("DESC_METODO")) or str(m["COD_METODO"])
                    except (ValueError, TypeError):
                        pass
            if parsed_methods:
                methods_map = parsed_methods
        except Exception as e:
            logger.debug("[HorusInvoices][SQL] Fallback METODO_VENDA company=%s: %s", company_id, e)

        try:
            fp_rows = sql_client.query(
                "SELECT COD_FORMA, NOM_FORMA FROM FORMA_PAGTO WITH (NOLOCK) ORDER BY COD_FORMA",
                max_rows=300,
            )
            for fp in fp_rows:
                c_forma = _clean(fp.get("COD_FORMA"))
                n_forma = _clean(fp.get("NOM_FORMA")) or c_forma
                if n_forma:
                    payment_forms_catalog.append({"code": c_forma or n_forma, "name": n_forma})
            if payment_forms_catalog:
                _CATALOG_CACHE[company_id] = (now_ts, dict(methods_map), [dict(x) for x in payment_forms_catalog])
        except Exception as e:
            logger.debug("[HorusInvoices][SQL] Fallback FORMA_PAGTO company=%s: %s", company_id, e)

    cache_key = (company_id, f"SQL:{date_from.isoformat()}", date_to.isoformat(), f"{clean_ped}:{clean_nf}")
    cached_data = _HORUS_DATA_CACHE.get(cache_key)
    if cached_data and (now_ts - cached_data[0] < 90) and not force_refresh:
        return cached_data[1], cached_data[2], methods_map, payment_forms_catalog

    where_clauses = ["NF.COD_EMPRESA = %s", "NF.COD_FILIAL = %s"]
    nf_params: List[Any] = [emp_int, fil_int]

    if clean_ped:
        where_clauses.append("(CAST(NF.COD_PED_VENDA AS VARCHAR(40)) = %s OR PV.COD_PEDIDO_ORIGEM = %s)")
        nf_params.extend([clean_ped, clean_ped])
    elif clean_nf:
        where_clauses.append("(LTRIM(RTRIM(NF.NRO_NOTA_FISCAL)) = %s OR LTRIM(RTRIM(NF.NRO_NOTA_FISCAL)) LIKE %s)")
        nf_params.extend([clean_nf, f"%{clean_nf}"])
    else:
        d_ini_sql = f"{date_from.strftime('%Y-%m-%d')} 00:00:00"
        d_fim_sql = f"{date_to.strftime('%Y-%m-%d')} 23:59:59"
        where_clauses.append("NF.DAT_EMISSAO_NF >= %s AND NF.DAT_EMISSAO_NF <= %s")
        nf_params.extend([d_ini_sql, d_fim_sql])

    where_sql = " AND ".join(where_clauses)
    nf_query = f"""
        SELECT TOP 500
            NF.COD_EMPRESA,
            NF.COD_FILIAL,
            NF.NRO_NOTA_FISCAL,
            NF.SERIE_FISCAL,
            NF.COD_NF,
            NF.COD_PED_VENDA,
            NF.COD_CLI,
            NF.COD_NATUREZA,
            NF.CHAVE_ACESSO_NFE,
            NF.SIT_NF,
            NF.DAT_EMISSAO_NF,
            NF.VLR_BRUTO_NF,
            NF.VLR_LIQUIDO_NF,
            PV.COD_PEDIDO_ORIGEM,
            PV.COD_METODO,
            C.NOM_CLI,
            C.NOM_REDUZIDO,
            C.CNPJ,
            C.CPF,
            C.EMAIL,
            C.EMAILB2B,
            C.ID_GUID,
            E.DESC_ENDERECO,
            E.NUM_END,
            E.COM_ENDERECO,
            E.NOM_BAIRRO,
            E.CEP,
            E.EMAIL AS EMAIL_END,
            E.CPF_CNPJ AS CPF_CNPJ_END,
            UF.SIGLA_UF,
            COALESCE(M.NOM_MUNICIPIO, LOC.NOM_LOCAL) AS NOM_MUNICIPIO
        FROM NF_MESTRE NF WITH (NOLOCK)
        LEFT JOIN PEDIDOS_VENDA PV WITH (NOLOCK)
            ON PV.COD_PED_VENDA = NF.COD_PED_VENDA
           AND PV.COD_FILIAL = NF.COD_FILIAL
           AND PV.COD_EMPRESA = NF.COD_EMPRESA
        LEFT JOIN CLIENTES C WITH (NOLOCK)
            ON C.COD_CLI = NF.COD_CLI
        OUTER APPLY (
            SELECT TOP 1 DESC_ENDERECO, NUM_END, COM_ENDERECO, NOM_BAIRRO, CEP, COD_UF, COD_MUNICIPIO, COD_IBGE, EMAIL, CPF_CNPJ
            FROM ENDERECOS_CLIENTE EC WITH (NOLOCK)
            WHERE EC.COD_CLI = NF.COD_CLI
            ORDER BY CASE WHEN EC.STA_DEFAULT = 'S' THEN 0 ELSE 1 END, EC.COD_TPO_END ASC, EC.COD_END ASC
        ) E
        LEFT JOIN TABELA_UF UF WITH (NOLOCK)
            ON UF.COD_UF = E.COD_UF
        OUTER APPLY (
            SELECT TOP 1 NOM_MUNICIPIO
            FROM IBS_MUNICIPIOS_UF_ALIQ IB WITH (NOLOCK)
            WHERE IB.COD_IBGE = E.COD_IBGE
        ) M
        OUTER APPLY (
            SELECT TOP 1 NOM_LOCAL
            FROM LOCALIDADES L WITH (NOLOCK)
            WHERE L.COD_UF = E.COD_UF AND L.COD_LOCAL = E.COD_MUNICIPIO
        ) LOC
        WHERE {where_sql}
        ORDER BY NF.DAT_EMISSAO_NF DESC, NF.COD_NF DESC
    """
    nf_rows = sql_client.query(nf_query, tuple(nf_params), max_rows=500)

    raw_invoices: List[Dict[str, Any]] = []
    cod_nf_to_nro: Dict[int, str] = {}
    ped_to_nro: Dict[int, str] = {}

    for r in nf_rows:
        nro_nf = _clean(r.get("NRO_NOTA_FISCAL"))
        cod_nf_val = r.get("COD_NF")
        ped_val = r.get("COD_PED_VENDA")
        if cod_nf_val is not None and str(cod_nf_val).isdigit():
            cod_nf_to_nro[int(cod_nf_val)] = nro_nf
        if ped_val is not None and str(ped_val).isdigit():
            ped_to_nro[int(ped_val)] = nro_nf

        raw_cep = r.get("CEP")
        if isinstance(raw_cep, (int, float, Decimal)):
            cep_str = _digits(str(int(raw_cep)))
        else:
            cep_str = _digits(raw_cep)
        if cep_str and len(cep_str) < 8:
            cep_str = cep_str.zfill(8)

        raw_email = _clean(r.get("EMAILB2B") or r.get("EMAIL") or r.get("EMAIL_END") or "")
        first_email = re.split(r"[;,\s]+", raw_email)[0] if raw_email else ""

        sit_nf = _clean(r.get("SIT_NF") or "")
        status_str = "CANCELADA" if sit_nf.upper() == "C" else (sit_nf or "AUTORIZADA")

        doc_cand = ""
        for raw_d in (r.get("CNPJ"), r.get("CPF"), r.get("CPF_CNPJ_END")):
            d_str = _digits(raw_d)
            if d_str and d_str.lstrip("0") and len(d_str) in (11, 14):
                doc_cand = d_str
                break
        if not doc_cand:
            for raw_d in (r.get("CNPJ"), r.get("CPF"), r.get("CPF_CNPJ_END")):
                d_str = _digits(raw_d)
                if d_str and d_str.lstrip("0"):
                    doc_cand = d_str.zfill(11) if len(d_str) <= 11 else d_str.zfill(14)
                    break

        raw_invoices.append({
            "COD_EMPRESA": r.get("COD_EMPRESA") or emp_int,
            "COD_FILIAL": r.get("COD_FILIAL") or fil_int,
            "NRO_NOTA_FISCAL": nro_nf,
            "SERIE_FISCAL": _clean(r.get("SERIE_FISCAL") or "1"),
            "COD_NF": cod_nf_val,
            "COD_PED_VENDA": ped_val,
            "COD_PEDIDO_ORIGEM": _clean(r.get("COD_PEDIDO_ORIGEM")),
            "COD_CLI": r.get("COD_CLI"),
            "COD_NATUREZA": _clean(r.get("COD_NATUREZA")),
            "CHAVE_ACESSO_NFE": _clean(r.get("CHAVE_ACESSO_NFE")),
            "STATUS": status_str,
            "DAT_EMISSAO_NF": r.get("DAT_EMISSAO_NF"),
            "VLR_BRUTO_NF": r.get("VLR_BRUTO_NF"),
            "VLR_LIQUIDO_NF": r.get("VLR_LIQUIDO_NF"),
            "COD_METODO": r.get("COD_METODO"),
            "_COD_METODO": r.get("COD_METODO"),
            "_SQL_ID_GUID": _clean(r.get("ID_GUID")),
            "_SQL_PAYER": {
                "document": doc_cand,
                "name": _clean(r.get("NOM_CLI") or r.get("NOM_REDUZIDO")),
                "email": first_email,
                "street": _clean(r.get("DESC_ENDERECO")),
                "number": _clean(r.get("NUM_END")) or "S/N",
                "complement": _clean(r.get("COM_ENDERECO")),
                "district": _clean(r.get("NOM_BAIRRO")),
                "city": _clean(r.get("NOM_MUNICIPIO")),
                "state": _clean(r.get("SIGLA_UF"))[:2].upper(),
                "zip_code": cep_str[:8],
            },
        })

    debits_by_cli: Dict[str, List[Dict[str, Any]]] = {}
    if cod_nf_to_nro or ped_to_nro:
        cod_nfs_list = list(cod_nf_to_nro.keys())
        peds_list = list(ped_to_nro.keys())

        or_conds = []
        lr_params: List[Any] = [emp_int, fil_int]
        if cod_nfs_list:
            ph_nf = ", ".join(["%s"] * len(cod_nfs_list))
            or_conds.append(f"LR.COD_NF IN ({ph_nf})")
            lr_params.extend(cod_nfs_list)
        if peds_list:
            ph_ped = ", ".join(["%s"] * len(peds_list))
            or_conds.append(f"(LR.COD_NF IS NULL AND LR.COD_PED_VENDA IN ({ph_ped}))")
            lr_params.extend(peds_list)

        or_sql = " OR ".join(or_conds)
        lr_query = f"""
            SELECT
                LR.NRO_LANCTO_CRECEBER,
                LR.COD_EMPRESA,
                LR.COD_FILIAL,
                LR.COD_CLI,
                LR.COD_NF,
                LR.COD_PED_VENDA,
                LR.DAT_VENC_CRECEBER AS LR_DAT_VENC,
                LR.VLR_LANCTO_TOTAL AS LR_VLR_TOTAL,
                LR.VLR_LANCTO_CRECEBER AS LR_VLR_BRUTO,
                LR.STA_LANCTO_CRECEBER AS LR_STA,
                LR.NRO_CONTROLE AS LR_NRO_CONTROLE,
                LRA.COD_PARCELA,
                LRA.COD_FORMA,
                FP.NOM_FORMA,
                LRA.DAT_VENC_CRECEBER AS LRA_DAT_VENC,
                LRA.VLR_LANCTO_TOTAL AS LRA_VLR_TOTAL,
                LRA.VLR_LANCTO_CRECEBER AS LRA_VLR_BRUTO,
                LRA.STA_LANCTO_CRECEBER AS LRA_STA,
                LRA.NRO_CONTROLE AS LRA_NRO_CONTROLE,
                LRA.CODIGO_BARRAS,
                LRA.LINHA_DIGITAVEL,
                LRA.COD_SOLICITACAO,
                LRA.CAMINHO_PDF
            FROM LANCTOS_CRECEBER LR WITH (NOLOCK)
            LEFT JOIN LANCTOS_CRECEBERA LRA WITH (NOLOCK)
                ON LRA.NRO_LANCTO_CRECEBER = LR.NRO_LANCTO_CRECEBER
               AND LRA.COD_EMPRESA = LR.COD_EMPRESA
               AND LRA.COD_FILIAL = LR.COD_FILIAL
            LEFT JOIN FORMA_PAGTO FP WITH (NOLOCK)
                ON FP.COD_FORMA = LRA.COD_FORMA
            WHERE LR.COD_EMPRESA = %s
              AND LR.COD_FILIAL = %s
              AND ({or_sql})
            ORDER BY LR.NRO_LANCTO_CRECEBER ASC, ISNULL(LRA.COD_PARCELA, 1) ASC
        """
        lr_rows = sql_client.query(lr_query, tuple(lr_params), max_rows=2500)
        for d in lr_rows:
            c_cli_str = str(d.get("COD_CLI") or "").strip()
            if not c_cli_str:
                continue
            c_nf_int = int(d["COD_NF"]) if (d.get("COD_NF") is not None and str(d["COD_NF"]).isdigit()) else None
            c_ped_int = int(d["COD_PED_VENDA"]) if (d.get("COD_PED_VENDA") is not None and str(d["COD_PED_VENDA"]).isdigit()) else None
            mapped_nro_nf = (
                (cod_nf_to_nro.get(c_nf_int) if c_nf_int is not None else None)
                or (ped_to_nro.get(c_ped_int) if c_ped_int is not None else None)
                or ""
            )
            deb_item = {
                "NRO_LANCTO_CRECEBER": d.get("NRO_LANCTO_CRECEBER"),
                "COD_PARCELA": d.get("COD_PARCELA") or 1,
                "COD_NF": d.get("COD_NF"),
                "COD_PED_VENDA": d.get("COD_PED_VENDA"),
                "NRO_NOTA_FISCAL": mapped_nro_nf,
                "COD_FORMA": d.get("COD_FORMA"),
                "NOM_FORMA": _clean(d.get("NOM_FORMA")),
                "DAT_VENC_CRECEBER": d.get("LRA_DAT_VENC") or d.get("LR_DAT_VENC"),
                "VLR_LANCTO_CRECEBER": (
                    d.get("LRA_VLR_TOTAL")
                    if d.get("LRA_VLR_TOTAL") is not None
                    else (
                        d.get("LRA_VLR_BRUTO")
                        if d.get("LRA_VLR_BRUTO") is not None
                        else (d.get("LR_VLR_TOTAL") if d.get("LR_VLR_TOTAL") is not None else d.get("LR_VLR_BRUTO"))
                    )
                ),
                "STA_LANCTO_CRECEBER": _clean(d.get("LRA_STA") or d.get("LR_STA") or "AB"),
                "NRO_CONTROLE": _clean(d.get("LRA_NRO_CONTROLE") or d.get("LR_NRO_CONTROLE")),
                "CODIGO_BARRAS": _clean(d.get("CODIGO_BARRAS")),
                "LINHA_DIGITAVEL": _clean(d.get("LINHA_DIGITAVEL")),
                "COD_SOLICITACAO": _clean(d.get("COD_SOLICITACAO")),
            }
            debits_by_cli.setdefault(c_cli_str, []).append(deb_item)

    if len(_HORUS_DATA_CACHE) > 30:
        _HORUS_DATA_CACHE.clear()
    _HORUS_DATA_CACHE[cache_key] = (time.time(), raw_invoices, debits_by_cli)
    return raw_invoices, debits_by_cli, methods_map, payment_forms_catalog


async def _fetch_horus_invoices_and_debits_async(
    db: Session,
    company_id: int,
    settings: CompanySettings,
    *,
    date_from: date,
    date_to: date,
    cod_ped_venda: Optional[str] = None,
    force_refresh: bool = False,
) -> Tuple[List[Dict[str, Any]], Dict[str, List[Dict[str, Any]]], Dict[int, str], List[Dict[str, str]]]:
    """
    Executa todas as chamadas REST no Horus em uma única sessão HTTP assíncrona com cache inteligente:
      1. `Busca_MetodoVenda` + `Busca_FormaPagto` cacheados por 30 minutos por empresa.
      2. Se `cod_ped_venda` for informado, consulta `Busca_PedidosVenda` para descobrir o `COD_METODO` exato do pedido.
      3. `Busca_NotaFiscal` (`XML_BASE64="S"`) por método de venda com `DATA_INI`/`DATA_FIM` e/ou `COD_PED_VENDA`.
      4. `Busca_debitos` (`ARQ_BASE64="N"`) para cada `COD_CLI` único das notas retornadas (alta velocidade).
    """
    emp, fil = _resolve_horus_emp_fil(settings)
    legacy_pag = bool(getattr(settings, "horus_legacy_pagination", False))
    clean_ped = _clean(cod_ped_venda) if cod_ped_venda else ""
    now_ts = time.time()

    client = HorusClient(db, company_id)
    try:
        # 1. Métodos de venda e Formas de pagamento (Busca_FormaPagto) com cache de 30 min
        cached_cat = _CATALOG_CACHE.get(company_id)
        if cached_cat and (now_ts - cached_cat[0] < 1800) and not force_refresh:
            methods_map = dict(cached_cat[1])
            payment_forms_catalog = [dict(x) for x in cached_cat[2]]
        else:
            methods_map = {
                1: "Direta",
                2: "Consignação",
                3: "Web",
                4: "Representante",
                5: "Sem desconto na NF",
                6: "Pré-venda",
                7: "E-book",
            }
            payment_forms_catalog = []
            try:
                m_params: Dict[str, Any] = {}
                if not legacy_pag:
                    m_params = {"OFFSET": 0, "LIMIT": 100}
                m_res, fp_res = await asyncio.gather(
                    client.get("Busca_MetodoVenda", params=m_params),
                    client.get("Busca_FormaPagto", params=m_params),
                    return_exceptions=True,
                )
                if isinstance(m_res, list):
                    parsed_methods = {}
                    for m in m_res:
                        if isinstance(m, dict) and not m.get("Falha") and m.get("COD_METODO"):
                            try:
                                parsed_methods[int(m["COD_METODO"])] = _clean(m.get("DESC_METODO")) or str(m["COD_METODO"])
                            except (ValueError, TypeError):
                                pass
                    if parsed_methods:
                        methods_map = parsed_methods
                if isinstance(fp_res, list):
                    for fp in fp_res:
                        if isinstance(fp, dict) and not fp.get("Falha") and (fp.get("COD_FORMA") is not None or fp.get("NOM_FORMA")):
                            c_forma = _clean(fp.get("COD_FORMA"))
                            n_forma = _clean(fp.get("NOM_FORMA")) or c_forma
                            if n_forma:
                                payment_forms_catalog.append({"code": c_forma or n_forma, "name": n_forma})
                if payment_forms_catalog:
                    _CATALOG_CACHE[company_id] = (now_ts, dict(methods_map), [dict(x) for x in payment_forms_catalog])
            except Exception as e:
                logger.debug("[HorusInvoices] Fallback de Busca_MetodoVenda/Busca_FormaPagto company=%s: %s", company_id, e)

        cache_key = (company_id, date_from.isoformat(), date_to.isoformat(), clean_ped)
        cached_data = _HORUS_DATA_CACHE.get(cache_key)
        if cached_data and (now_ts - cached_data[0] < 90) and not force_refresh:
            return cached_data[1], cached_data[2], methods_map, payment_forms_catalog

        target_methods: List[int] = list(methods_map.keys())

        # 2. Se filtrou por COD_PED_VENDA, tenta descobrir o método do pedido em Busca_PedidosVenda para consulta cirúrgica
        if clean_ped:
            try:
                pv_params: Dict[str, Any] = {
                    "COD_EMPRESA": emp,
                    "COD_FILIAL": fil,
                    "COD_PED_VENDA": clean_ped,
                }
                if not legacy_pag:
                    pv_params["OFFSET"] = 0
                    pv_params["LIMIT"] = 10
                pv_res = await client.get("Busca_PedidosVenda", params=pv_params)
                if isinstance(pv_res, list) and pv_res and isinstance(pv_res[0], dict) and not pv_res[0].get("Falha"):
                    found_methods = [
                        int(r["COD_METODO"])
                        for r in pv_res
                        if isinstance(r, dict) and str(r.get("COD_METODO") or "").isdigit()
                    ]
                    if found_methods:
                        target_methods = list(dict.fromkeys(found_methods))
            except Exception:
                pass

        # 3. Busca_NotaFiscal concorrente por método (semáforo = 8)
        sem = asyncio.Semaphore(8)
        d_ini_str = f"{date_from.strftime('%d/%m/%Y')} 00:00:00"
        d_fim_str = f"{date_to.strftime('%d/%m/%Y')} 23:59:59"
        method_errors: List[str] = []

        async def _fetch_by_method(cod_metodo: int) -> List[Dict[str, Any]]:
            async with sem:
                nf_params: Dict[str, Any] = {
                    "COD_EMPRESA": emp,
                    "COD_FILIAL": fil,
                    "COD_METODO": cod_metodo,
                    "XML_BASE64": "S",
                }
                if clean_ped:
                    nf_params["COD_PED_VENDA"] = clean_ped
                else:
                    nf_params["DATA_INI"] = d_ini_str
                    nf_params["DATA_FIM"] = d_fim_str

                if not legacy_pag:
                    nf_params["OFFSET"] = 0
                    nf_params["LIMIT"] = 200

                try:
                    res = await client.get("Busca_NotaFiscal", params=nf_params)
                    if isinstance(res, dict) and not res.get("Falha") and not res.get("FALHA"):
                        res = [res]
                    if isinstance(res, list):
                        if res and isinstance(res[0], dict) and (res[0].get("Falha") or res[0].get("FALHA") == "S"):
                            return []
                        out_rows = []
                        for r in res:
                            if isinstance(r, dict) and (r.get("NRO_NOTA_FISCAL") or r.get("COD_NF")):
                                r_copy = dict(r)
                                r_copy.setdefault("_COD_METODO", cod_metodo)
                                out_rows.append(r_copy)
                        return out_rows
                except Exception as e:
                    logger.warning("[HorusInvoices] Erro em Busca_NotaFiscal metodo=%s company=%s: %s", cod_metodo, company_id, e)
                    method_errors.append(str(e))
                return []

        method_Lists = await asyncio.gather(*[_fetch_by_method(m) for m in target_methods])
        if method_errors and len(method_errors) >= len(target_methods):
            raise PaymentProviderError(
                f"Falha ao consultar Notas Fiscais na API Horus REST: {method_errors[0]}"
            )
        raw_invoices: List[Dict[str, Any]] = []
        seen_nf_keys = set()
        for sublist in method_Lists:
            for nf in sublist:
                nf_key = (
                    str(nf.get("COD_EMPRESA") or emp),
                    str(nf.get("COD_FILIAL") or fil),
                    str(nf.get("COD_NF") or nf.get("NRO_NOTA_FISCAL") or ""),
                    str(nf.get("SERIE_FISCAL") or ""),
                )
                if nf_key not in seen_nf_keys:
                    seen_nf_keys.add(nf_key)
                    raw_invoices.append(nf)

        # 4. Busca_debitos concorrente para os COD_CLI das notas encontradas (ARQ_BASE64="N" evita renderizar PDFs pesados no Horus)
        unique_cod_clis = sorted({
            str(nf.get("COD_CLI")).strip()
            for nf in raw_invoices
            if nf.get("COD_CLI") is not None and str(nf.get("COD_CLI")).strip() != ""
        })

        async def _fetch_debits_for_cli(cod_cli: str) -> Tuple[str, List[Dict[str, Any]]]:
            async with sem:
                deb_params: Dict[str, Any] = {
                    "COD_EMPRESA": emp,
                    "COD_FILIAL": fil,
                    "COD_CLI": cod_cli,
                    "ARQ_BASE64": "N",
                }
                if not legacy_pag:
                    deb_params["OFFSET"] = 0
                    deb_params["LIMIT"] = 200
                try:
                    res = await client.get("Busca_debitos", params=deb_params)
                    if isinstance(res, dict) and not res.get("Falha") and not res.get("FALHA"):
                        return cod_cli, [res]
                    if isinstance(res, list):
                        if res and isinstance(res[0], dict) and (res[0].get("Falha") or res[0].get("FALHA") == "S"):
                            return cod_cli, []
                        return cod_cli, [r for r in res if isinstance(r, dict)]
                except Exception as e:
                    logger.debug("[HorusInvoices] Falha Busca_debitos cod_cli=%s company=%s: %s", cod_cli, company_id, e)
                return cod_cli, []

        debits_by_cli: Dict[str, List[Dict[str, Any]]] = {}
        if unique_cod_clis:
            deb_results = await asyncio.gather(*[_fetch_debits_for_cli(c) for c in unique_cod_clis])
            for c_id, d_list in deb_results:
                debits_by_cli[c_id] = d_list

        if len(_HORUS_DATA_CACHE) > 30:
            _HORUS_DATA_CACHE.clear()
        _HORUS_DATA_CACHE[cache_key] = (time.time(), raw_invoices, debits_by_cli)
        return raw_invoices, debits_by_cli, methods_map, payment_forms_catalog
    finally:
        await client.close()


def list_horus_invoices_for_boletos(
    db: Session,
    company_id: int,
    *,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    cod_ped_venda: Optional[str] = None,
    nro_nota_fiscal: Optional[str] = None,
    search: Optional[str] = None,
    status_filter: str = "ALL",
    force_refresh: bool = False,
) -> Dict[str, Any]:
    """
    Lista as últimas Notas Fiscais emitidas no Horus ERP no período (padrão: últimos 3 dias)
    com suas respectivas parcelas (`<cobr><dup>` + `Busca_debitos`) e status de emissão de boleto.
    """
    _ensure_cora_invoice_columns(db)
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    cora_cfg = db.query(CoraConfig).filter(CoraConfig.company_id == company_id).first()
    saved_allowed_forms = [
        f.strip()
        for f in ((cora_cfg.invoice_allowed_payment_forms if cora_cfg else "") or "").split(",")
        if f.strip()
    ]
    auto_emit_enabled = bool(getattr(cora_cfg, "invoice_auto_emit_enabled", False)) if cora_cfg else False
    allowed_upper_set = {f.upper() for f in saved_allowed_forms}

    if not settings or (not settings.horus_enabled and not getattr(settings, "horus_sql_enabled", False)):
        return {
            "horus_enabled": False,
            "date_from": (date_from or (date.today() - timedelta(days=3))).isoformat(),
            "date_to": (date_to or date.today()).isoformat(),
            "payment_forms_catalog": [],
            "allowed_payment_forms": saved_allowed_forms,
            "auto_emit_enabled": auto_emit_enabled,
            "hidden_by_payment_form_count": 0,
            "summary": {
                "total_invoices": 0,
                "total_installments": 0,
                "pending_installments": 0,
                "emitted_installments": 0,
                "total_amount": 0.0,
                "pending_amount": 0.0,
                "auto_emit_ready_invoices": 0,
                "auto_emit_ready_installments": 0,
            },
            "items": [],
        }

    today = date.today()
    eff_to = date_to or today
    eff_from = date_from or (eff_to - timedelta(days=3))
    if eff_from > eff_to:
        eff_from, eff_to = eff_to, eff_from

    emp, fil = _resolve_horus_emp_fil(settings)

    sql_error_msg: Optional[str] = None
    rest_error_msg: Optional[str] = None
    raw_invoices: Optional[List[Dict[str, Any]]] = None
    debits_by_cli: Dict[str, List[Dict[str, Any]]] = {}
    methods_map: Dict[int, str] = {}
    payment_forms_catalog: List[Dict[str, str]] = []

    if getattr(settings, "horus_sql_enabled", False):
        try:
            raw_invoices, debits_by_cli, methods_map, payment_forms_catalog = _fetch_horus_invoices_and_debits_sql(
                db,
                company_id,
                settings,
                date_from=eff_from,
                date_to=eff_to,
                cod_ped_venda=cod_ped_venda,
                nro_nota_fiscal=nro_nota_fiscal,
                force_refresh=force_refresh,
            )
        except Exception as sql_exc:
            sql_error_msg = str(sql_exc)
            logger.warning("[HorusInvoices] Falha ao consultar Notas Fiscais via Horus SQL company=%s: %s", company_id, sql_exc)

    if raw_invoices is None and settings.horus_enabled:
        try:
            raw_invoices, debits_by_cli, methods_map, payment_forms_catalog = _run_async(
                _fetch_horus_invoices_and_debits_async(
                    db,
                    company_id,
                    settings,
                    date_from=eff_from,
                    date_to=eff_to,
                    cod_ped_venda=cod_ped_venda,
                    force_refresh=force_refresh,
                )
            )
        except Exception as rest_exc:
            rest_error_msg = str(rest_exc)
            logger.warning("[HorusInvoices] Falha ao consultar Notas Fiscais via Horus REST company=%s: %s", company_id, rest_exc)

    if raw_invoices is None:
        reasons = []
        if sql_error_msg:
            reasons.append(f"Horus SQL Direct ({settings.horus_sql_host or 'sem host'}): {sql_error_msg}")
        if rest_error_msg:
            reasons.append(f"Horus API REST ({settings.horus_url or 'sem URL'}): {rest_error_msg}")
        raise PaymentProviderError(
            "Não foi possível consultar as Notas Fiscais no Horus ERP. Motivo: "
            + (" | ".join(reasons) if reasons else "Nenhuma conexão Horus ativa respondeu.")
        )
    forms_name_by_code = {fp["code"].upper(): fp["name"] for fp in payment_forms_catalog}
    forms_code_by_name = {fp["name"].upper(): fp["code"] for fp in payment_forms_catalog}
    # Expande o conjunto permitido para casar tanto pelo código (ex: "1") quanto pelo nome (ex: "BOLETO")
    expanded_allowed_upper = set(allowed_upper_set)
    for token in list(allowed_upper_set):
        if token in forms_name_by_code:
            expanded_allowed_upper.add(forms_name_by_code[token].upper())
        if token in forms_code_by_name:
            expanded_allowed_upper.add(forms_code_by_name[token].upper())

    # Pré-parseia XMLs (com cache em memória) e coleta apenas os COD_CLI das notas do período para consulta enxuta no PostgreSQL
    parsed_xml_by_nf_idx: Dict[int, Dict[str, Any]] = {}
    invoice_cod_clis = set()
    for idx_nf, nf in enumerate(raw_invoices):
        c_cli = _clean(nf.get("COD_CLI"))
        if c_cli:
            invoice_cod_clis.add(c_cli)
        xml_key = (company_id, _clean(nf.get("COD_NF")), _clean(nf.get("NRO_NOTA_FISCAL")))
        cached_xml = _XML_PARSE_CACHE.get(xml_key)
        if cached_xml is None:
            cached_xml = _parse_nfe_xml_base64(nf.get("XML_Base64") or nf.get("XML_BASE64"))
            if len(_XML_PARSE_CACHE) > 600:
                _XML_PARSE_CACHE.clear()
            if xml_key[1] or xml_key[2]:
                _XML_PARSE_CACHE[xml_key] = cached_xml
        parsed_xml_by_nf_idx[idx_nf] = cached_xml

    # Mapa enxuto de clientes locais do Cronuz apenas para os COD_CLI das notas retornadas
    cust_by_doc: Dict[str, Customer] = {}
    cust_by_cod: Dict[str, Customer] = {}
    if invoice_cod_clis:
        local_customers = (
            db.query(Customer)
            .options(joinedload(Customer.addresses))
            .filter(
                Customer.company_id == company_id,
                Customer.horus_cod_cli.in_(list(invoice_cod_clis)),
            )
            .all()
        )
        for c in local_customers:
            d = _digits(c.document)
            if d:
                cust_by_doc[d] = c
            if c.horus_cod_cli:
                cust_by_cod[str(c.horus_cod_cli)] = c

    # Mapa de cobranças ativas da empresa para impedir geração duplicada
    active_charges = (
        db.query(PayCharge)
        .filter(
            PayCharge.company_id == company_id,
            PayCharge.is_active.is_(True),
            PayCharge.status.notin_(("CANCELLED", "ERROR")),
        )
        .all()
    )
    charge_by_ref: Dict[str, PayCharge] = {c.origin_ref: c for c in active_charges if c.origin_ref}
    charge_by_nf_inst: Dict[Tuple[str, str], PayCharge] = {}
    charge_by_launch: Dict[str, PayCharge] = {}
    for c in active_charges:
        if c.invoice_number:
            nf_clean = str(c.invoice_number).strip().lstrip("0") or str(c.invoice_number).strip()
            inst_clean = _normalize_installment_number(c.installment_number, 1)
            charge_by_nf_inst[(nf_clean, inst_clean)] = c
            charge_by_nf_inst[(str(c.invoice_number).strip(), inst_clean)] = c
        if c.financial_launch_id:
            l_clean = str(c.financial_launch_id).strip()
            charge_by_launch[l_clean] = c
            if c.installment_number:
                charge_by_launch[f"{l_clean}:{_normalize_installment_number(c.installment_number, 1)}"] = c

    nf_filter = _clean(nro_nota_fiscal).lstrip("0") if nro_nota_fiscal else ""
    search_term = _clean(search).lower() if search else ""
    search_digits = _digits(search) if search else ""
    st_filter = (status_filter or "ALL").upper()

    items: List[Dict[str, Any]] = []
    total_installments = 0
    pending_installments = 0
    emitted_installments = 0
    total_amount_sum = 0.0
    pending_amount_sum = 0.0
    hidden_by_payment_form_count = 0
    auto_emit_ready_invoices = 0
    auto_emit_ready_installments = 0
    seen_catalog_names = {fp["name"].upper() for fp in payment_forms_catalog}
    today_iso = today.isoformat()

    for idx_nf, nf in enumerate(raw_invoices):
        nro_nf = _clean(nf.get("NRO_NOTA_FISCAL"))
        nro_nf_norm = nro_nf.lstrip("0") or nro_nf
        cod_nf = _clean(nf.get("COD_NF"))
        serie = _clean(nf.get("SERIE_FISCAL") or "1")
        ped_venda = _clean(nf.get("COD_PED_VENDA"))
        ped_origem = _clean(nf.get("COD_PEDIDO_ORIGEM"))
        cod_cli = _clean(nf.get("COD_CLI"))
        chave_nfe = _clean(nf.get("CHAVE_ACESSO_NFE"))
        status_nf = _clean(nf.get("STATUS") or "")
        vlr_bruto = _parse_amount(nf.get("VLR_BRUTO_NF"))
        vlr_liquido = _parse_amount(nf.get("VLR_LIQUIDO_NF")) or vlr_bruto
        issue_dt = _parse_date_iso(nf.get("DAT_EMISSAO_NF"))
        cod_metodo = nf.get("_COD_METODO") or nf.get("COD_METODO")
        desc_metodo = methods_map.get(int(cod_metodo), str(cod_metodo or "")) if str(cod_metodo or "").isdigit() else ""

        if nf_filter and nf_filter not in nro_nf_norm and _clean(nro_nota_fiscal) not in nro_nf:
            continue

        # Extrai destinatário e duplicatas do XML_Base64 (pré-cacheado) ou do SQL Direct (_SQL_PAYER)
        xml_info = parsed_xml_by_nf_idx.get(idx_nf) or _parse_nfe_xml_base64(nf.get("XML_Base64") or nf.get("XML_BASE64"))
        xml_payer = nf.get("_SQL_PAYER") or xml_info["payer"]
        xml_dups = xml_info["duplicatas"]

        # Enriquecimento com cadastro local se existir
        local_cust = (
            cust_by_doc.get(xml_payer.get("document") or "")
            or cust_by_cod.get(cod_cli)
        )
        payer_doc = xml_payer.get("document") or (_digits(local_cust.document) if local_cust else "")
        payer_name = xml_payer.get("name") or (local_cust.corporate_name or local_cust.name if local_cust else f"Cliente Horus #{cod_cli}")
        payer_email = xml_payer.get("email") or (local_cust.email if local_cust else "") or ""

        payer_address = {
            "street": xml_payer.get("street") or "",
            "number": xml_payer.get("number") or "S/N",
            "complement": xml_payer.get("complement") or "",
            "district": xml_payer.get("district") or "",
            "city": xml_payer.get("city") or (local_cust.city if local_cust else "") or "",
            "state": xml_payer.get("state") or ((local_cust.state or "")[:2].upper() if local_cust else ""),
            "zip_code": xml_payer.get("zip_code") or "",
        }
        if local_cust and not payer_address["street"] and getattr(local_cust, "addresses", None):
            addr0 = local_cust.addresses[0]
            payer_address = {
                "street": addr0.street or "",
                "number": addr0.number or "S/N",
                "complement": addr0.complement or "",
                "district": addr0.neighborhood or "",
                "city": addr0.city or local_cust.city or "",
                "state": (addr0.state or local_cust.state or "")[:2].upper(),
                "zip_code": _digits(addr0.zip_code),
            }

        # Filtra débitos do cliente no Horus que pertencem a esta Nota Fiscal
        cli_debits = debits_by_cli.get(cod_cli, [])
        nf_debits: List[Dict[str, Any]] = []
        for d in cli_debits:
            d_nf = _clean(d.get("NRO_NOTA_FISCAL")).lstrip("0")
            d_cod_nf = _clean(d.get("COD_NF"))
            d_ped = _clean(d.get("COD_PED_VENDA"))
            d_chave = _clean(d.get("CHAVE_ACESSO_NFE"))
            if (
                (nro_nf_norm and d_nf == nro_nf_norm)
                or (cod_nf and d_cod_nf == cod_nf)
                or (chave_nfe and d_chave == chave_nfe)
                or (ped_venda and not d_cod_nf and not d_nf and d_ped == ped_venda)
            ):
                nf_debits.append(d)
        nf_debits.sort(key=lambda x: (_parse_date_iso(x.get("DAT_VENC_CRECEBER")) or "", int(x.get("COD_PARCELA") or 1), str(x.get("NRO_LANCTO_CRECEBER") or "")))

        # Monta lista de parcelas da Nota Fiscal combinando `<cobr><dup>` do XML com `Busca_debitos`
        raw_installments: List[Dict[str, Any]] = []
        if xml_dups:
            used_debit_ids = set()
            for idx, dup in enumerate(xml_dups, start=1):
                matched_deb = None
                dup_due = dup.get("due_date")
                dup_amt = dup.get("amount") or 0.0
                for d in nf_debits:
                    lancto_id = str(d.get("NRO_LANCTO_CRECEBER") or "")
                    if lancto_id in used_debit_ids:
                        continue
                    d_due = _parse_date_iso(d.get("DAT_VENC_CRECEBER"))
                    if dup_due and d_due == dup_due:
                        matched_deb = d
                        used_debit_ids.add(lancto_id)
                        break
                if matched_deb is None and idx <= len(nf_debits):
                    cand = nf_debits[idx - 1]
                    lancto_id = str(cand.get("NRO_LANCTO_CRECEBER") or "")
                    if lancto_id not in used_debit_ids:
                        matched_deb = cand
                        used_debit_ids.add(lancto_id)

                raw_installments.append({
                    "installment_number": dup["installment_number"],
                    "raw_dup_number": dup["raw_number"],
                    "due_date": dup_due or (_parse_date_iso(matched_deb.get("DAT_VENC_CRECEBER")) if matched_deb else issue_dt),
                    "amount": dup_amt or (_parse_amount(matched_deb.get("VLR_LANCTO_CRECEBER")) if matched_deb else vlr_liquido),
                    "debit": matched_deb,
                })
        elif nf_debits:
            for idx, d in enumerate(nf_debits, start=1):
                raw_installments.append({
                    "installment_number": str(idx),
                    "raw_dup_number": f"{idx:03d}",
                    "due_date": _parse_date_iso(d.get("DAT_VENC_CRECEBER")) or issue_dt,
                    "amount": _parse_amount(d.get("VLR_LANCTO_CRECEBER")) or vlr_liquido,
                    "debit": d,
                })
        else:
            raw_installments.append({
                "installment_number": "1",
                "raw_dup_number": "001",
                "due_date": issue_dt or today.isoformat(),
                "amount": vlr_liquido,
                "debit": None,
            })

        total_parc = len(raw_installments)
        installments_out: List[Dict[str, Any]] = []
        nf_emitted_count = 0
        nf_pending_count = 0
        nf_pending_amount = 0.0

        for idx, r_inst in enumerate(raw_installments, start=1):
            inst_num = _normalize_installment_number(r_inst.get("installment_number"), idx)
            deb = r_inst.get("debit") or {}
            lancto = _clean(deb.get("NRO_LANCTO_CRECEBER")) or None
            cod_forma = _clean(deb.get("COD_FORMA"))
            if deb:
                forma = (
                    _clean(deb.get("NOM_FORMA"))
                    or (forms_name_by_code.get(cod_forma.upper()) if cod_forma else "")
                    or cod_forma
                    or "Boleto"
                )
            else:
                forma = xml_info.get("nfe_payment_label") or ("Boleto" if xml_dups else "Sem Lançamento CR")
            if forma and forma.upper() not in seen_catalog_names:
                seen_catalog_names.add(forma.upper())
                payment_forms_catalog.append({"code": cod_forma or forma, "name": forma})

            # Se houver filtro configurado de formas de pagamento, ignora parcelas de outras formas
            if expanded_allowed_upper:
                cand_tokens = {forma.upper()}
                if cod_forma:
                    cand_tokens.add(cod_forma.upper())
                if not (cand_tokens & expanded_allowed_upper):
                    continue

            sta_lancto = _clean(deb.get("STA_LANCTO_CRECEBER") or "AB").upper()

            pdf_b64 = _clean(deb.get("PDF_Base64") or deb.get("PDF_BASE64"))
            has_horus_pdf = bool(pdf_b64 and "ERRO" not in pdf_b64.upper() and len(pdf_b64) > 30)
            horus_linha = _clean(deb.get("LINHA_DIGITAVEL"))
            horus_barras = _clean(deb.get("CODIGO_BARRAS"))
            horus_nosso = _clean(deb.get("NOSSO_NUMERO") or deb.get("NRO_CONTROLE"))
            horus_cod_sol = _clean(deb.get("COD_SOLICITACAO"))
            has_horus_boleto = has_horus_pdf or bool(horus_linha or horus_barras or horus_cod_sol)

            origin_ref = f"horus_nf:{emp}:{fil}:{nro_nf}:{inst_num}"
            existing_charge = (
                charge_by_ref.get(origin_ref)
                or charge_by_nf_inst.get((nro_nf_norm, inst_num))
                or charge_by_nf_inst.get((nro_nf, inst_num))
                or (charge_by_launch.get(f"{lancto}:{inst_num}") if lancto else None)
                or (charge_by_launch.get(lancto) if lancto and total_parc == 1 else None)
            )

            has_existing = (existing_charge is not None) or has_horus_boleto
            existing_source = "CORA" if existing_charge else ("HORUS" if has_horus_boleto else None)
            amt = round(float(r_inst.get("amount") or 0.0), 2)

            if has_existing:
                nf_emitted_count += 1
            else:
                nf_pending_count += 1
                nf_pending_amount = round(nf_pending_amount + amt, 2)

            desc_parts = [f"ERP Horus - NF {nro_nf} (Parc. {inst_num}/{total_parc})"]
            if ped_venda:
                desc_parts.append(f"Ped. {ped_venda}")
            if lancto:
                desc_parts.append(f"Lanç. {lancto}")

            installments_out.append({
                "installment_number": inst_num,
                "installment_label": f"{inst_num}/{total_parc}",
                "raw_dup_number": r_inst.get("raw_dup_number") or f"{idx:03d}",
                "due_date": r_inst.get("due_date") or issue_dt or today.isoformat(),
                "amount": amt,
                "financial_launch_id": lancto,
                "payment_form": forma,
                "horus_status": sta_lancto,
                "origin_ref": origin_ref,
                "description": " | ".join(desc_parts),
                "has_existing_boleto": has_existing,
                "existing_boleto_source": existing_source,
                "existing_charge": service.serialize_charge(existing_charge) if existing_charge else None,
                "existing_digitable_line": (existing_charge.digitable_line if existing_charge else None) or horus_linha or None,
                "existing_our_number": (existing_charge.our_number if existing_charge else None) or horus_nosso or None,
            })

        if not installments_out:
            hidden_by_payment_form_count += 1
            continue

        total_parc = len(installments_out)
        if nf_emitted_count == total_parc and total_parc > 0:
            emission_status = "ALL_EMITTED"
        elif nf_emitted_count > 0:
            emission_status = "PARTIAL"
        else:
            emission_status = "PENDING"

        # Filtro de busca textual (Cliente, CNPJ/CPF, Nota, Pedido)
        if search_term:
            haystack = " ".join([
                nro_nf,
                ped_venda,
                ped_origem,
                payer_name,
                payer_doc,
                cod_cli,
                chave_nfe,
            ]).lower()
            doc_match = bool(search_digits and search_digits in payer_doc)
            if search_term not in haystack and not doc_match:
                continue

        # Filtro de status de emissão
        if st_filter == "PENDING" and nf_pending_count == 0:
            continue
        if st_filter == "EMITTED" and nf_emitted_count == 0:
            continue

        total_installments += total_parc
        pending_installments += nf_pending_count
        emitted_installments += nf_emitted_count
        total_amount_sum = round(total_amount_sum + vlr_liquido, 2)
        pending_amount_sum = round(pending_amount_sum + nf_pending_amount, 2)

        cora_charge_ids = [
            inst["existing_charge"]["id"]
            for inst in installments_out
            if inst.get("existing_charge") and inst["existing_charge"].get("id")
        ]

        # Validação de prontidão e segurança para Emissão Automática (Lote / Botão Play)
        auto_emit_issues: List[str] = []
        if status_nf and status_nf.upper() in ("C", "CANCELADA", "CANCELADO"):
            auto_emit_issues.append("Nota Fiscal cancelada no Horus")
        if len(_digits(payer_doc)) not in (11, 14):
            auto_emit_issues.append("CPF/CNPJ do destinatário ausente ou inválido")
        if not payer_name or len(payer_name.strip()) < 2:
            auto_emit_issues.append("Nome/Razão Social do destinatário ausente")
        if not payer_address.get("street") or not payer_address.get("district") or not payer_address.get("city"):
            auto_emit_issues.append("Endereço completo (logradouro/bairro/cidade) ausente no XML")
        if len(payer_address.get("state") or "") != 2 or len(_digits(payer_address.get("zip_code"))) != 8:
            auto_emit_issues.append("UF ou CEP do destinatário inválido")

        eligible_pending_insts = [
            inst for inst in installments_out
            if not inst["has_existing_boleto"]
            and (inst.get("amount") or 0) > 0
            and (inst.get("due_date") or "") >= today_iso
        ]
        overdue_pending = [
            inst for inst in installments_out
            if not inst["has_existing_boleto"] and (inst.get("due_date") or "") < today_iso
        ]
        if overdue_pending:
            auto_emit_issues.append(f"{len(overdue_pending)} parcela(s) com vencimento anterior a hoje")

        auto_emit_ready = bool(nf_pending_count > 0 and len(eligible_pending_insts) > 0 and not auto_emit_issues)
        if auto_emit_ready:
            auto_emit_ready_invoices += 1
            auto_emit_ready_installments += len(eligible_pending_insts)

        items.append({
            "nro_nota_fiscal": nro_nf,
            "serie_fiscal": serie,
            "cod_nf": cod_nf,
            "cod_ped_venda": ped_venda or None,
            "cod_pedido_origem": ped_origem or None,
            "cod_cli": cod_cli or None,
            "cod_metodo": cod_metodo,
            "desc_metodo": desc_metodo,
            "natureza_operacao": xml_info.get("nat_op") or _clean(nf.get("COD_NATUREZA")),
            "chave_acesso_nfe": chave_nfe or None,
            "status_nf": status_nf,
            "issue_date": issue_dt,
            "vlr_bruto_nf": vlr_bruto,
            "vlr_liquido_nf": vlr_liquido,
            "customer_id": local_cust.id if local_cust else None,
            "horus_id_guid": _clean(nf.get("_SQL_ID_GUID")) or (local_cust.id_guid if local_cust and local_cust.id_guid else None),
            "payer": {
                "name": payer_name,
                "document": payer_doc,
                "email": payer_email,
                **payer_address,
            },
            "installments_count": total_parc,
            "emitted_count": nf_emitted_count,
            "pending_count": nf_pending_count,
            "pending_amount": nf_pending_amount,
            "emission_status": emission_status,
            "cora_charge_ids": cora_charge_ids,
            "auto_emit_ready": auto_emit_ready,
            "auto_emit_issues": auto_emit_issues,
            "installments": installments_out,
        })

    # Ordena das notas mais recentes / maior número para as mais antigas
    items.sort(
        key=lambda x: (
            x.get("issue_date") or "",
            int(_digits(x.get("nro_nota_fiscal")) or 0),
        ),
        reverse=True,
    )

    return {
        "horus_enabled": True,
        "date_from": eff_from.isoformat(),
        "date_to": eff_to.isoformat(),
        "payment_forms_catalog": payment_forms_catalog,
        "allowed_payment_forms": saved_allowed_forms,
        "auto_emit_enabled": auto_emit_enabled,
        "hidden_by_payment_form_count": hidden_by_payment_form_count,
        "summary": {
            "total_invoices": len(items),
            "total_installments": total_installments,
            "pending_installments": pending_installments,
            "emitted_installments": emitted_installments,
            "total_amount": round(total_amount_sum, 2),
            "pending_amount": round(pending_amount_sum, 2),
            "auto_emit_ready_invoices": auto_emit_ready_invoices,
            "auto_emit_ready_installments": auto_emit_ready_installments,
        },
        "items": items,
    }


def emit_boletos_for_horus_invoice(
    db: Session,
    company_id: int,
    *,
    provider_code: str,
    method: str,
    nro_nota_fiscal: str,
    serie_fiscal: Optional[str] = None,
    cod_nf: Optional[str] = None,
    cod_ped_venda: Optional[str] = None,
    cod_pedido_origem: Optional[str] = None,
    horus_cod_cli: Optional[str] = None,
    horus_id_guid: Optional[str] = None,
    customer_id: Optional[int] = None,
    issue_date: Optional[date] = None,
    chave_acesso_nfe: Optional[str] = None,
    payer: ChargePayer,
    installments: List[Dict[str, Any]],
    user_id: Optional[int] = None,
    shared_provider: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Emite 1 ou todas as parcelas pendentes de uma Nota Fiscal do Horus ERP no provedor (ex.: Banco Cora),
    garantindo trava estrita contra emissão duplicada e reutilizando a mesma sessão mTLS para múltiplas parcelas.
    """
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    emp, fil = _resolve_horus_emp_fil(settings) if settings else ("1", "1")
    nro_nf = _clean(nro_nota_fiscal)
    nro_nf_norm = nro_nf.lstrip("0") or nro_nf
    if not nro_nf:
        raise PaymentProviderError("Número da Nota Fiscal é obrigatório.")
    if not installments:
        raise PaymentProviderError("Selecione ao menos uma parcela da Nota Fiscal para emitir o boleto.")

    total_parc = len(installments)
    created_charges: List[Dict[str, Any]] = []
    skipped_duplicates: List[Dict[str, Any]] = []

    # Carrega cobranças ativas da empresa uma única vez antes do loop
    existing_q = (
        db.query(PayCharge)
        .filter(
            PayCharge.company_id == company_id,
            PayCharge.is_active.is_(True),
            PayCharge.status.notin_(("CANCELLED", "ERROR")),
        )
        .all()
    )

    own_provider = shared_provider is None
    prov = shared_provider or get_provider(db, company_id, provider_code)
    try:
        for idx, inst in enumerate(installments, start=1):
            inst_num = _normalize_installment_number(inst.get("installment_number"), idx)
            lancto = _clean(inst.get("financial_launch_id")) or None
            origin_ref = _clean(inst.get("origin_ref")) or f"horus_nf:{emp}:{fil}:{nro_nf}:{inst_num}"

            dup_charge: Optional[PayCharge] = None
            for ex in existing_q:
                ex_nf = _clean(ex.invoice_number).lstrip("0") if ex.invoice_number else ""
                ex_inst = _normalize_installment_number(ex.installment_number, 1)
                if ex.origin_ref == origin_ref:
                    dup_charge = ex
                    break
                if ex_nf and ex_nf == nro_nf_norm and ex_inst == inst_num:
                    dup_charge = ex
                    break
                if lancto and ex.financial_launch_id and _clean(ex.financial_launch_id) == lancto and ex_inst == inst_num:
                    dup_charge = ex
                    break

            if dup_charge is not None:
                skipped_duplicates.append({
                    "installment_number": inst_num,
                    "reason": f"A NF {nro_nf} (parcela {inst_num}) já possui boleto ativo (#{dup_charge.id}).",
                    "charge": service.serialize_charge(dup_charge),
                })
                continue

            due_val = inst.get("due_date")
            if isinstance(due_val, str):
                due_dt = date.fromisoformat(due_val)
            elif isinstance(due_val, date):
                due_dt = due_val
            else:
                raise PaymentProviderError(f"Data de vencimento inválida na parcela {inst_num}.")

            amt_val = Decimal(str(inst.get("amount") or 0)).quantize(Decimal("0.01"))
            desc = _clean(inst.get("description"))
            if not desc:
                desc_parts = [f"ERP Horus - NF {nro_nf} (Parc. {inst_num}/{total_parc})"]
                if cod_ped_venda:
                    desc_parts.append(f"Ped. {cod_ped_venda}")
                if lancto:
                    desc_parts.append(f"Lanç. {lancto}")
                desc = " | ".join(desc_parts)

            charge = service.create_charge(
                db,
                company_id,
                payer=payer,
                amount=amt_val,
                due_date=due_dt,
                issue_date=issue_date or date.today(),
                description=desc,
                method=method,
                channel="INVOICES",
                provider_code=provider_code,
                origin_type="HORUS_INVOICE",
                origin_ref=origin_ref,
                customer_id=customer_id,
                order_number=cod_ped_venda or cod_pedido_origem,
                financial_launch_id=lancto,
                installment_number=inst_num,
                invoice_number=nro_nf,
                horus_cod_cli=horus_cod_cli,
                horus_id_guid=horus_id_guid,
                origin_meta={
                    "cod_empresa": emp,
                    "cod_filial": fil,
                    "cod_nf": cod_nf,
                    "serie_fiscal": serie_fiscal,
                    "cod_ped_venda": cod_ped_venda,
                    "cod_pedido_origem": cod_pedido_origem,
                    "chave_acesso_nfe": chave_acesso_nfe,
                },
                user_id=user_id,
                provider=prov,
            )
            existing_q.append(charge)
            created_charges.append(service.serialize_charge(charge))
    finally:
        if own_provider:
            prov.close()

    if not created_charges and skipped_duplicates:
        raise PaymentProviderError(skipped_duplicates[0]["reason"])

    return {
        "nro_nota_fiscal": nro_nf,
        "created_count": len(created_charges),
        "skipped_count": len(skipped_duplicates),
        "charges": created_charges,
        "skipped": skipped_duplicates,
    }


def emit_batch_boletos_for_horus_invoices(
    db: Session,
    company_id: int,
    *,
    provider_code: str,
    method: str,
    invoices: List[Dict[str, Any]],
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Emite em lote (de forma segura, idempotente e reutilizando uma única conexão mTLS com o Cora)
    todas as parcelas pendentes das Notas Fiscais selecionadas ou acionadas pela rotina automática (Play).
    Retorna a lista consolidada de cobranças geradas para alimentar imediatamente a Fila de Impressão.
    """
    if not invoices:
        raise PaymentProviderError("Nenhuma Nota Fiscal informada para emissão em lote.")

    created_all: List[Dict[str, Any]] = []
    skipped_all: List[Dict[str, Any]] = []
    errors_all: List[Dict[str, Any]] = []

    with get_provider(db, company_id, provider_code) as shared_provider:
        for inv in invoices:
            nro_nf = _clean(inv.get("nro_nota_fiscal"))
            raw_payer = inv.get("payer") or {}
            payer = ChargePayer(
                name=_clean(raw_payer.get("name")),
                document=_digits(raw_payer.get("document")),
                email=_clean(raw_payer.get("email")) or None,
                street=_clean(raw_payer.get("street")),
                number=_clean(raw_payer.get("number")) or "S/N",
                complement=_clean(raw_payer.get("complement")) or None,
                district=_clean(raw_payer.get("district")),
                city=_clean(raw_payer.get("city")),
                state=_clean(raw_payer.get("state"))[:2].upper(),
                zip_code=_digits(raw_payer.get("zip_code")),
            )
            issue_dt_raw = inv.get("issue_date")
            issue_dt = (
                date.fromisoformat(issue_dt_raw)
                if isinstance(issue_dt_raw, str) and len(issue_dt_raw) == 10
                else (issue_dt_raw if isinstance(issue_dt_raw, date) else date.today())
            )
            try:
                res = emit_boletos_for_horus_invoice(
                    db,
                    company_id,
                    provider_code=provider_code,
                    method=method,
                    nro_nota_fiscal=nro_nf,
                    serie_fiscal=inv.get("serie_fiscal"),
                    cod_nf=inv.get("cod_nf"),
                    cod_ped_venda=inv.get("cod_ped_venda"),
                    cod_pedido_origem=inv.get("cod_pedido_origem"),
                    horus_cod_cli=inv.get("horus_cod_cli"),
                    horus_id_guid=inv.get("horus_id_guid"),
                    customer_id=inv.get("customer_id"),
                    issue_date=issue_dt,
                    chave_acesso_nfe=inv.get("chave_acesso_nfe"),
                    payer=payer,
                    installments=inv.get("installments") or [],
                    user_id=user_id,
                    shared_provider=shared_provider,
                )
                created_all.extend(res.get("charges") or [])
                skipped_all.extend(res.get("skipped") or [])
            except PaymentProviderError as e:
                errors_all.append({
                    "nro_nota_fiscal": nro_nf,
                    "error": str(e),
                })
            except Exception as e:
                logger.error("[HorusInvoices] Falha no lote NF %s company=%s: %s", nro_nf, company_id, e)
                errors_all.append({
                    "nro_nota_fiscal": nro_nf,
                    "error": f"Falha ao emitir NF {nro_nf}: {e}",
                })

    return {
        "created_count": len(created_all),
        "skipped_count": len(skipped_all),
        "error_count": len(errors_all),
        "charges": created_all,
        "skipped": skipped_all,
        "errors": errors_all,
    }


def update_invoice_allowed_payment_forms(
    db: Session,
    company_id: int,
    allowed_forms: List[str],
    user_id: Optional[int] = None,
) -> List[str]:
    _ensure_cora_invoice_columns(db)
    cfg = db.query(CoraConfig).filter(CoraConfig.company_id == company_id).first()
    if not cfg:
        cfg = CoraConfig(company_id=company_id)
        db.add(cfg)

    cleaned: List[str] = []
    seen = set()
    for item in allowed_forms or []:
        val = str(item or "").strip()
        if val and val.upper() not in seen:
            seen.add(val.upper())
            cleaned.append(val)

    cfg.invoice_allowed_payment_forms = ",".join(cleaned) if cleaned else None
    if not cleaned:
        cfg.invoice_auto_emit_enabled = False
    if user_id:
        cfg.updated_by_user_id = user_id
    db.commit()
    db.refresh(cfg)
    return cleaned


def update_invoice_auto_emit(
    db: Session,
    company_id: int,
    enabled: bool,
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    _ensure_cora_invoice_columns(db)
    cfg = db.query(CoraConfig).filter(CoraConfig.company_id == company_id).first()
    if not cfg:
        cfg = CoraConfig(company_id=company_id)
        db.add(cfg)

    allowed = [
        f.strip()
        for f in (cfg.invoice_allowed_payment_forms or "").split(",")
        if f.strip()
    ]
    if enabled and not allowed:
        raise PaymentProviderError(
            "Por segurança operacional, antes de ativar o Modo Automático (Play), configure quais Formas de Pagamento "
            "(ex.: Boleto Cora) devem ser exibidas/processadas no ícone de filtro."
        )

    cfg.invoice_auto_emit_enabled = bool(enabled)
    if user_id:
        cfg.updated_by_user_id = user_id
    db.commit()
    db.refresh(cfg)
    return {
        "auto_emit_enabled": bool(cfg.invoice_auto_emit_enabled),
        "allowed_payment_forms": allowed,
    }


def build_merged_pdf_for_charges(
    db: Session,
    company_id: int,
    charge_ids: List[int],
    provider_code: str = "CORA",
) -> bytes:
    """
    Baixa concorrentemente os PDFs de todos os boletos solicitados (ex.: 10 parcelas de uma NF ou fila de impressão)
    e unifica todas as páginas em um único documento PDF pronto para impressão de uma só vez.
    """
    clean_ids: List[int] = []
    seen = set()
    for cid in charge_ids or []:
        try:
            iv = int(cid)
            if iv > 0 and iv not in seen:
                seen.add(iv)
                clean_ids.append(iv)
        except (ValueError, TypeError):
            continue

    if not clean_ids:
        raise PaymentProviderError("Selecione ao menos um boleto para gerar o PDF unificado de impressão.")

    charges = (
        db.query(PayCharge)
        .filter(
            PayCharge.company_id == company_id,
            PayCharge.id.in_(clean_ids),
        )
        .all()
    )
    if not charges:
        raise PaymentProviderError("Nenhum boleto encontrado para impressão.")

    charge_map = {c.id: c for c in charges}
    ordered_charges = [charge_map[cid] for cid in clean_ids if cid in charge_map]

    # Revalida URLs ausentes ou expiradas (> 20 min) usando uma única sessão do provedor
    now_utc = datetime.now(timezone.utc)
    needs_sync = [
        c for c in ordered_charges
        if c.provider_charge_id and (
            not c.pdf_url
            or not c.last_synced_at
            or (now_utc - c.last_synced_at).total_seconds() > 1200
        )
    ]
    if needs_sync:
        try:
            with get_provider(db, company_id, provider_code) as shared_prov:
                for c in needs_sync:
                    try:
                        service.sync_charge(db, c, provider=shared_prov, source="USER")
                    except Exception:
                        pass
        except Exception as e:
            logger.debug("[HorusInvoices] Falha ao revalidar PDFs em lote: %s", e)

    async def _download_all(targets: List[PayCharge]) -> Dict[int, bytes]:
        out: Dict[int, bytes] = {}
        sem = asyncio.Semaphore(8)
        async with httpx.AsyncClient(timeout=25.0, follow_redirects=True) as http_client:
            async def _dl(ch: PayCharge):
                if not ch.pdf_url:
                    return
                async with sem:
                    try:
                        resp = await http_client.get(ch.pdf_url)
                        if resp.status_code == 200 and resp.content.startswith(b"%PDF"):
                            out[ch.id] = resp.content
                    except Exception as err:
                        logger.warning("[HorusInvoices] Erro ao baixar PDF charge=%s: %s", ch.id, err)

            await asyncio.gather(*[_dl(c) for c in targets])
        return out

    pdf_map = _run_async(_download_all(ordered_charges))

    # Se algum boleto falhou por URL S3 expirada, força sync individual e tenta baixar mais uma vez
    missing_charges = [c for c in ordered_charges if c.id not in pdf_map and c.provider_charge_id]
    if missing_charges:
        try:
            with get_provider(db, company_id, provider_code) as shared_prov:
                for c in missing_charges:
                    try:
                        service.sync_charge(db, c, provider=shared_prov, source="USER")
                    except Exception:
                        pass
            retry_map = _run_async(_download_all(missing_charges))
            pdf_map.update(retry_map)
        except Exception:
            pass

    writer = PdfWriter()
    added_docs = 0
    for c in ordered_charges:
        raw_pdf = pdf_map.get(c.id)
        if not raw_pdf:
            continue
        try:
            reader = PdfReader(io.BytesIO(raw_pdf))
            for page in reader.pages:
                writer.add_page(page)
            added_docs += 1
        except Exception as e:
            logger.warning("[HorusInvoices] PDF inválido em charge=%s: %s", c.id, e)

    if added_docs == 0:
        raise PaymentProviderError("Não foi possível obter os PDFs dos boletos selecionados no provedor.")

    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()



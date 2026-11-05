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
import logging
import re
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.integrators.horus import HorusClient
from app.models.company import Company
from app.models.company_settings import CompanySettings
from app.models.customer import Customer
from app.models.payments import PayCharge
from app.payments import service
from app.payments.base import ChargePayer, PaymentProviderError

logger = logging.getLogger(__name__)


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
    for el in root.iter():
        lt = _local_tag(el)
        if lt == "dest" and dest_el is None:
            dest_el = el
        elif lt == "cobr" and cobr_el is None:
            cobr_el = el
        elif lt == "ide" and ide_el is None:
            ide_el = el

    nat_op = _child_text(ide_el, "natOp") if ide_el is not None else None

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
    emp = _clean(settings.horus_company or "1") or "1"
    raw_branch = _clean(settings.horus_branch or "1")
    branch_digits = _digits(raw_branch)
    fil = raw_branch if (branch_digits and len(branch_digits) < 11) else "1"
    return emp, fil


async def _fetch_horus_invoices_and_debits_async(
    db: Session,
    company_id: int,
    settings: CompanySettings,
    *,
    date_from: date,
    date_to: date,
    cod_ped_venda: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, List[Dict[str, Any]]], Dict[int, str]]:
    """
    Executa todas as chamadas REST no Horus em uma única sessão HTTP assíncrona:
      1. `Busca_MetodoVenda` para obter os métodos de venda ativos (e nomes).
      2. Se `cod_ped_venda` for informado, consulta `Busca_PedidosVenda` para descobrir o `COD_METODO` exato do pedido.
      3. `Busca_NotaFiscal` (`XML_BASE64="S"`) por método de venda com `DATA_INI`/`DATA_FIM` e/ou `COD_PED_VENDA`.
      4. `Busca_debitos` (`ARQ_BASE64="S"`) para cada `COD_CLI` único das notas retornadas.
    """
    emp, fil = _resolve_horus_emp_fil(settings)
    legacy_pag = bool(getattr(settings, "horus_legacy_pagination", False))

    client = HorusClient(db, company_id)
    try:
        # 1. Métodos de venda
        methods_map: Dict[int, str] = {
            1: "Direta",
            2: "Consignação",
            3: "Web",
            4: "Representante",
            5: "Sem desconto na NF",
            6: "Pré-venda",
            7: "E-book",
        }
        try:
            m_params: Dict[str, Any] = {}
            if not legacy_pag:
                m_params = {"OFFSET": 0, "LIMIT": 50}
            m_res = await client.get("Busca_MetodoVenda", params=m_params)
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
        except Exception as e:
            logger.debug("[HorusInvoices] Fallback de Busca_MetodoVenda company=%s: %s", company_id, e)

        target_methods: List[int] = list(methods_map.keys())
        clean_ped = _clean(cod_ped_venda) if cod_ped_venda else ""

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

        # 3. Busca_NotaFiscal concorrente por método (semáforo = 4)
        sem = asyncio.Semaphore(4)
        d_ini_str = f"{date_from.strftime('%d/%m/%Y')} 00:00:00"
        d_fim_str = f"{date_to.strftime('%d/%m/%Y')} 23:59:59"

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
                return []

        method_Lists = await asyncio.gather(*[_fetch_by_method(m) for m in target_methods])
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

        # 4. Busca_debitos concorrente para os COD_CLI das notas encontradas
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
                    "ARQ_BASE64": "S",
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

        return raw_invoices, debits_by_cli, methods_map
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
) -> Dict[str, Any]:
    """
    Lista as últimas Notas Fiscais emitidas no Horus ERP no período (padrão: últimos 3 dias)
    com suas respectivas parcelas (`<cobr><dup>` + `Busca_debitos`) e status de emissão de boleto.
    """
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not settings or not settings.horus_enabled:
        return {
            "horus_enabled": False,
            "date_from": (date_from or (date.today() - timedelta(days=3))).isoformat(),
            "date_to": (date_to or date.today()).isoformat(),
            "summary": {
                "total_invoices": 0,
                "total_installments": 0,
                "pending_installments": 0,
                "emitted_installments": 0,
                "total_amount": 0.0,
                "pending_amount": 0.0,
            },
            "items": [],
        }

    today = date.today()
    eff_to = date_to or today
    eff_from = date_from or (eff_to - timedelta(days=3))
    if eff_from > eff_to:
        eff_from, eff_to = eff_to, eff_from

    emp, fil = _resolve_horus_emp_fil(settings)

    raw_invoices, debits_by_cli, methods_map = _run_async(
        _fetch_horus_invoices_and_debits_async(
            db,
            company_id,
            settings,
            date_from=eff_from,
            date_to=eff_to,
            cod_ped_venda=cod_ped_venda,
        )
    )

    # Mapa de clientes locais do Cronuz para enriquecer e-mail/endereço/customer_id
    local_customers = (
        db.query(Customer)
        .options(joinedload(Customer.addresses))
        .filter(Customer.company_id == company_id)
        .all()
    )
    cust_by_doc: Dict[str, Customer] = {}
    cust_by_cod: Dict[str, Customer] = {}
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

    for nf in raw_invoices:
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

        # Extrai destinatário e duplicatas do XML_Base64
        xml_info = _parse_nfe_xml_base64(nf.get("XML_Base64") or nf.get("XML_BASE64"))
        xml_payer = xml_info["payer"]
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
            d_chave = _clean(d.get("CHAVE_ACESSO_NFE"))
            if (nro_nf_norm and d_nf == nro_nf_norm) or (chave_nfe and d_chave == chave_nfe):
                nf_debits.append(d)
        nf_debits.sort(key=lambda x: (_parse_date_iso(x.get("DAT_VENC_CRECEBER")) or "", str(x.get("NRO_LANCTO_CRECEBER") or "")))

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
            forma = _clean(deb.get("NOM_FORMA") or deb.get("COD_FORMA")) or "Boleto"
            sta_lancto = _clean(deb.get("STA_LANCTO_CRECEBER") or "AB").upper()

            pdf_b64 = _clean(deb.get("PDF_Base64") or deb.get("PDF_BASE64"))
            has_horus_pdf = bool(pdf_b64 and "ERRO" not in pdf_b64.upper() and len(pdf_b64) > 30)
            horus_linha = _clean(deb.get("LINHA_DIGITAVEL"))
            horus_barras = _clean(deb.get("CODIGO_BARRAS"))
            horus_nosso = _clean(deb.get("NOSSO_NUMERO") or deb.get("NRO_CONTROLE"))
            has_horus_boleto = has_horus_pdf or bool(horus_linha or horus_barras)

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
            "horus_id_guid": (local_cust.id_guid if local_cust and local_cust.id_guid else None),
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
        "summary": {
            "total_invoices": len(items),
            "total_installments": total_installments,
            "pending_installments": pending_installments,
            "emitted_installments": emitted_installments,
            "total_amount": round(total_amount_sum, 2),
            "pending_amount": round(pending_amount_sum, 2),
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
) -> Dict[str, Any]:
    """
    Emite 1 ou todas as parcelas pendentes de uma Nota Fiscal do Horus ERP no provedor (ex.: Banco Cora),
    garantindo trava estrita contra emissão duplicada.
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

    for idx, inst in enumerate(installments, start=1):
        inst_num = _normalize_installment_number(inst.get("installment_number"), idx)
        lancto = _clean(inst.get("financial_launch_id")) or None
        origin_ref = _clean(inst.get("origin_ref")) or f"horus_nf:{emp}:{fil}:{nro_nf}:{inst_num}"

        # Verifica no banco se já existe boleto ativo para esta NF + parcela ou lançamento
        existing_q = (
            db.query(PayCharge)
            .filter(
                PayCharge.company_id == company_id,
                PayCharge.is_active.is_(True),
                PayCharge.status.notin_(("CANCELLED", "ERROR")),
            )
            .all()
        )
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
        )
        created_charges.append(service.serialize_charge(charge))

    if not created_charges and skipped_duplicates:
        raise PaymentProviderError(skipped_duplicates[0]["reason"])

    return {
        "nro_nota_fiscal": nro_nf,
        "created_count": len(created_charges),
        "skipped_count": len(skipped_duplicates),
        "charges": created_charges,
        "skipped": skipped_duplicates,
    }

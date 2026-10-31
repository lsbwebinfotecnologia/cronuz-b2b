"""
origins.py
----------
Consulta unificada de clientes e lançamentos de origem para emissão de boletos no Hub de Pagamentos:
  1. Clientes (Cronuz `crm_customer` + enriquecimento/busca Horus ERP via REST API `id_guid` e/ou SQL Direct `CLIENTES`).
  2. Títulos/lançamentos em aberto do cliente selecionado:
     - `HORUS_SQL` / `HORUS_API`: lançamentos financeiros do Horus (`LANCTOS_CRECEBER`/`LANCTOS_CRECEBERA` ou `Busca_debitos`),
       identificando nº do lançamento, parcela, nº da Nota Fiscal, nº do pedido, emissão, vencimento, valor
       e se o Horus JÁ possui boleto emitido (bloqueando duplicidade).
     - `FINANCIAL`: parcelas em aberto do Financeiro Cronuz (`fin_installment` / `fin_order_installment`).
     - `B2B_ORDER`: pedidos do cliente (`ord_order`).
     - `PDV`: cupons de venda PDV do cliente (`pos_sale`).

Regras de arquitetura respeitadas:
  - Consultas Horus API respeitam `horus_legacy_pagination` (OFFSET/LIMIT).
  - Nenhuma operação de UPDATE/DELETE é executada no banco SQL Server do Horus.
"""
import asyncio
import logging
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.integrators.horus_clients import HorusClients
from app.integrators.horus_sql_client import HorusSQLClient, HorusSQLConfigError
from app.models.company import Company
from app.models.company_settings import CompanySettings
from app.models.customer import Address, Customer
from app.models.financial import FinancialInstallment, FinancialTransaction
from app.models.order import Order
from app.models.order_installment import OrderInstallment
from app.models.payments import PayCharge
from app.models.pos import POSSale

logger = logging.getLogger(__name__)


def _digits(v: Any) -> str:
    return re.sub(r"\D", "", str(v or ""))


def _clean_str(v: Any) -> str:
    return re.sub(r"\s+", " ", str(v or "")).strip()


def _parse_any_date(v: Any) -> Optional[str]:
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


def _parse_any_amount(v: Any) -> float:
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


def _pick_customer_address(c: Customer) -> Dict[str, str]:
    addrs: List[Address] = list(getattr(c, "addresses", None) or [])
    chosen = next((a for a in addrs if (a.type or "").upper() == "BILLING"), None) or (addrs[0] if addrs else None)
    if not chosen:
        return {
            "street": "",
            "number": "",
            "complement": "",
            "district": "",
            "city": c.city or "",
            "state": (c.state or "")[:2].upper(),
            "zip_code": "",
        }
    return {
        "street": chosen.street or "",
        "number": chosen.number or "S/N",
        "complement": chosen.complement or "",
        "district": chosen.neighborhood or "",
        "city": chosen.city or c.city or "",
        "state": (chosen.state or c.state or "")[:2].upper(),
        "zip_code": _digits(chosen.zip_code),
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


def _fetch_horus_api_client(db: Session, company_id: int, cnpj_destino: str, cnpj_cliente: str) -> Optional[Dict[str, Any]]:
    async def _call():
        client = HorusClients(db, company_id)
        try:
            res = await client.get_client(cnpj_destino=cnpj_destino, cnpj_cliente=cnpj_cliente, limit=5)
            if isinstance(res, dict) and not res.get("error") and isinstance(res.get("data"), dict):
                return res["data"]
            return None
        finally:
            await client.close()

    try:
        return _run_async(_call())
    except Exception as e:
        logger.warning("[Payments][Origins] Falha ao consultar Busca_ClienteB2B company=%s doc=%s: %s", company_id, cnpj_cliente, e)
        return None


def _fetch_horus_api_debits(db: Session, company_id: int, cnpj_destino: str, cnpj_cliente: str, id_guid: str) -> List[Dict[str, Any]]:
    async def _call():
        client = HorusClients(db, company_id)
        try:
            res = await client.get_customer_debits(
                cnpj_destino=cnpj_destino, cnpj_cliente=cnpj_cliente, id_guid=id_guid, arq_base64="S", limit=200
            )
            if isinstance(res, dict) and not res.get("Falha") and not res.get("FALHA"):
                return [res]
            if isinstance(res, list):
                if len(res) > 0 and isinstance(res[0], dict) and (res[0].get("Falha") or res[0].get("FALHA") == "S"):
                    return []
                return [r for r in res if isinstance(r, dict)]
            return []
        finally:
            await client.close()

    try:
        return _run_async(_call())
    except Exception as e:
        logger.warning("[Payments][Origins] Falha ao consultar Busca_debitos company=%s doc=%s: %s", company_id, cnpj_cliente, e)
        return []


def _search_horus_sql_customers(db: Session, company_id: int, term: str, limit: int = 15) -> List[Dict[str, Any]]:
    try:
        sql_client = HorusSQLClient(db, company_id)
    except HorusSQLConfigError:
        return []

    digits = _digits(term)
    like_term = f"%{term.strip()}%"
    try:
        sql = f"""
            SELECT TOP {int(limit)}
                C.COD_CLI,
                C.NOM_CLI,
                C.NOM_FANTASIA,
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
                UF.SIGLA_UF,
                M.NOM_MUNICIPIO
            FROM CLIENTES C
            OUTER APPLY (
                SELECT TOP 1 DESC_ENDERECO, NUM_END, COM_ENDERECO, NOM_BAIRRO, CEP, COD_UF, COD_IBGE
                FROM ENDERECOS_CLIENTE EC
                WHERE EC.COD_CLI = C.COD_CLI
                ORDER BY CASE WHEN EC.STA_DEFAULT = 'S' THEN 0 ELSE 1 END, EC.SEQ_ENDERECO ASC
            ) E
            LEFT JOIN TABELA_UF UF ON UF.COD_UF = E.COD_UF
            OUTER APPLY (
                SELECT TOP 1 NOM_MUNICIPIO
                FROM IBS_MUNICIPIOS_UF_ALIQ IB
                WHERE IB.COD_IBGE = E.COD_IBGE
            ) M
            WHERE C.STA_ATIVO = 'S'
              AND (
                  C.NOM_CLI LIKE %s
                  OR C.NOM_FANTASIA LIKE %s
                  OR (%s <> '' AND (REPLACE(REPLACE(REPLACE(C.CNPJ, '.', ''), '/', ''), '-', '') LIKE %s
                                    OR REPLACE(REPLACE(C.CPF, '.', ''), '-', '') LIKE %s
                                    OR CAST(C.COD_CLI AS VARCHAR(30)) = %s))
              )
            ORDER BY C.NOM_CLI ASC
        """
        d_like = f"%{digits}%" if digits else ""
        return sql_client.query(sql, (like_term, like_term, digits, d_like, d_like, digits), max_rows=limit)
    except Exception as e:
        logger.warning("[Payments][Origins] Erro ao buscar clientes no Horus SQL company=%s: %s", company_id, e)
        return []


def search_customers(db: Session, company_id: int, search: Optional[str] = None, limit: int = 20) -> Dict[str, Any]:
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    company = db.query(Company).filter(Company.id == company_id).first()
    horus_enabled = bool(settings and settings.horus_enabled)
    horus_sql_enabled = bool(settings and settings.horus_sql_enabled)

    q = db.query(Customer).options(joinedload(Customer.addresses)).filter(Customer.company_id == company_id)
    term = (search or "").strip()
    digits = _digits(term)
    if term:
        like = f"%{term}%"
        conds = [
            Customer.name.ilike(like),
            Customer.corporate_name.ilike(like),
            Customer.document.ilike(like),
            Customer.email.ilike(like),
            Customer.id_guid.ilike(like),
        ]
        if digits:
            conds.append(func.regexp_replace(Customer.document, r"\D", "", "g").like(f"%{digits}%"))
        if term.isdigit():
            conds.append(Customer.id == int(term))
            conds.append(Customer.horus_cod_cli == int(term))
        q = q.filter(or_(*conds))

    local_rows = q.order_by(Customer.name.asc()).limit(limit).all()

    by_doc: Dict[str, Dict[str, Any]] = {}
    items: List[Dict[str, Any]] = []

    for c in local_rows:
        doc = _digits(c.document)
        addr = _pick_customer_address(c)
        item = {
            "customer_id": c.id,
            "source": "CRONUZ_HORUS" if (c.id_guid or c.horus_cod_cli) else "CRONUZ",
            "name": c.corporate_name or c.name,
            "trade_name": c.name,
            "document": doc,
            "email": c.email or (c.billing_emails.split(",")[0].strip() if c.billing_emails else "") or "",
            "id_guid": c.id_guid or "",
            "horus_cod_cli": str(c.horus_cod_cli) if c.horus_cod_cli else "",
            "has_horus_link": bool(c.id_guid or c.horus_cod_cli),
            "address": addr,
        }
        items.append(item)
        if doc:
            by_doc[doc] = item

    # Enriquecimento/busca no Horus SQL Direct quando habilitado
    if horus_sql_enabled and len(term) >= 2:
        for h in _search_horus_sql_customers(db, company_id, term, limit=15):
            h_doc = _digits(h.get("CNPJ") or h.get("CPF"))
            h_cod = str(h.get("COD_CLI") or "").strip()
            h_guid = _clean_str(h.get("ID_GUID"))
            h_addr = {
                "street": _clean_str(h.get("DESC_ENDERECO")),
                "number": _clean_str(h.get("NUM_END")) or "S/N",
                "complement": _clean_str(h.get("COM_ENDERECO")),
                "district": _clean_str(h.get("NOM_BAIRRO")),
                "city": _clean_str(h.get("NOM_MUNICIPIO")),
                "state": _clean_str(h.get("SIGLA_UF"))[:2].upper(),
                "zip_code": _digits(h.get("CEP")),
            }
            if h_doc and h_doc in by_doc:
                existing = by_doc[h_doc]
                existing["source"] = "CRONUZ_HORUS"
                existing["has_horus_link"] = True
                if not existing["horus_cod_cli"] and h_cod:
                    existing["horus_cod_cli"] = h_cod
                if not existing["id_guid"] and h_guid:
                    existing["id_guid"] = h_guid
                if not existing["address"].get("street") and h_addr["street"]:
                    existing["address"] = h_addr
                if not existing["email"]:
                    existing["email"] = _clean_str(h.get("EMAILB2B") or h.get("EMAIL"))
            else:
                new_item = {
                    "customer_id": None,
                    "source": "HORUS_SQL",
                    "name": _clean_str(h.get("NOM_CLI") or h.get("NOM_FANTASIA")),
                    "trade_name": _clean_str(h.get("NOM_FANTASIA") or h.get("NOM_CLI")),
                    "document": h_doc,
                    "email": _clean_str(h.get("EMAILB2B") or h.get("EMAIL")),
                    "id_guid": h_guid,
                    "horus_cod_cli": h_cod,
                    "has_horus_link": True,
                    "address": h_addr,
                }
                items.append(new_item)
                if h_doc:
                    by_doc[h_doc] = new_item

    # Busca/autenticação direta na API Horus B2B (`Busca_ClienteB2B`) quando pesquisado por CPF/CNPJ
    if horus_enabled and company and company.document and len(digits) in (11, 14):
        target = by_doc.get(digits)
        if not target or not target.get("id_guid") or not target.get("address", {}).get("street"):
            api_data = _fetch_horus_api_client(db, company_id, _digits(company.document), digits)
            if api_data:
                api_guid = _clean_str(api_data.get("ID_GUID") or api_data.get("GUID"))
                api_cod = _clean_str(api_data.get("COD_CLI") or api_data.get("CODIGO"))
                api_addr = {
                    "street": _clean_str(api_data.get("ENDERECO") or api_data.get("DESC_ENDERECO") or api_data.get("LOGRADOURO")),
                    "number": _clean_str(api_data.get("NUMERO") or api_data.get("NUM_END")) or "S/N",
                    "complement": _clean_str(api_data.get("COMPLEMENTO") or api_data.get("COM_ENDERECO")),
                    "district": _clean_str(api_data.get("BAIRRO") or api_data.get("NOM_BAIRRO")),
                    "city": _clean_str(api_data.get("CIDADE") or api_data.get("MUNICIPIO") or api_data.get("NOM_MUNICIPIO")),
                    "state": _clean_str(api_data.get("UF") or api_data.get("SIGLA_UF") or api_data.get("ESTADO"))[:2].upper(),
                    "zip_code": _digits(api_data.get("CEP")),
                }
                if target:
                    target["source"] = "CRONUZ_HORUS"
                    target["has_horus_link"] = True
                    if api_guid and not target["id_guid"]:
                        target["id_guid"] = api_guid
                    if api_cod and not target["horus_cod_cli"]:
                        target["horus_cod_cli"] = api_cod
                    if api_addr["street"] and not target["address"].get("street"):
                        target["address"] = api_addr
                    # Vincula o id_guid no cadastro local se ainda não estava salvo
                    if target.get("customer_id") and api_guid:
                        c_obj = db.query(Customer).filter(Customer.id == target["customer_id"], Customer.company_id == company_id).first()
                        if c_obj and not c_obj.id_guid:
                            c_obj.id_guid = api_guid
                            db.commit()
                else:
                    items.insert(0, {
                        "customer_id": None,
                        "source": "HORUS_API",
                        "name": _clean_str(api_data.get("NOM_CLI") or api_data.get("RAZAO_SOCIAL") or api_data.get("NOME")),
                        "trade_name": _clean_str(api_data.get("NOM_FANTASIA") or api_data.get("FANTASIA") or api_data.get("NOM_CLI")),
                        "document": digits,
                        "email": _clean_str(api_data.get("EMAILB2B") or api_data.get("EMAIL")),
                        "id_guid": api_guid,
                        "horus_cod_cli": api_cod,
                        "has_horus_link": True,
                        "address": api_addr,
                    })

    return {
        "horus_enabled": horus_enabled,
        "horus_sql_enabled": horus_sql_enabled,
        "business_model": settings.business_model if settings else "B2B_CRONUZ",
        "items": items[:limit],
    }


def _query_horus_sql_open_receivables(
    db: Session,
    company_id: int,
    document: str,
    horus_cod_cli: Optional[str],
    active_charges_by_launch: Dict[str, PayCharge],
) -> List[Dict[str, Any]]:
    try:
        sql_client = HorusSQLClient(db, company_id)
    except HorusSQLConfigError:
        return []

    clean_doc = _digits(document)
    cod_cli_int = int(horus_cod_cli) if (horus_cod_cli and str(horus_cod_cli).isdigit()) else 0
    if not clean_doc and not cod_cli_int:
        return []

    sql = """
        SELECT TOP 200
            LR.COD_EMPRESA,
            LR.COD_FILIAL,
            LR.NRO_LANCTO_CRECEBER,
            LR.COD_CLI,
            LR.COD_PED_VENDA,
            LR.COD_NF,
            LR.STA_LANCTO_CRECEBER AS STA_HEADER,
            LR.COD_BORDERO AS BORDERO_HEADER,
            LRA.COD_PARCELA,
            LRA.COD_FORMA,
            LRA.DAT_EMISS_CRECEBER,
            LRA.DAT_VENC_CRECEBER,
            LRA.VLR_LANCTO_TOTAL,
            LRA.VLR_LANCTO_PAGO,
            LRA.STA_LANCTO_CRECEBER AS STA_PARCELA,
            LRA.NRO_CONTROLE,
            LRA.CODIGO_BARRAS,
            LRA.LINHA_DIGITAVEL,
            LRA.COD_SOLICITACAO,
            LRA.PIX,
            LRA.CAMINHO_PDF,
            PV.COD_PEDIDO_ORIGEM AS PEDIDO_WEB,
            NF.NRO_NOTA_FISCAL
        FROM LANCTOS_CRECEBER LR
        INNER JOIN LANCTOS_CRECEBERA LRA
            ON LRA.NRO_LANCTO_CRECEBER = LR.NRO_LANCTO_CRECEBER
           AND LRA.COD_EMPRESA = LR.COD_EMPRESA
           AND LRA.COD_FILIAL = LR.COD_FILIAL
        INNER JOIN CLIENTES C
            ON C.COD_CLI = LR.COD_CLI
        LEFT JOIN PEDIDOS_VENDA PV
            ON PV.COD_PED_VENDA = LR.COD_PED_VENDA
           AND PV.COD_FILIAL = LR.COD_FILIAL
           AND PV.COD_EMPRESA = LR.COD_EMPRESA
        OUTER APPLY (
            SELECT TOP 1 NRO_NOTA_FISCAL
            FROM NF_MESTRE NF_M
            WHERE (
                (LR.COD_NF IS NOT NULL AND NF_M.COD_NF = LR.COD_NF)
                OR (LR.COD_PED_VENDA IS NOT NULL AND NF_M.COD_PED_VENDA = LR.COD_PED_VENDA)
            )
            AND NF_M.COD_FILIAL = LR.COD_FILIAL
            AND NF_M.COD_EMPRESA = LR.COD_EMPRESA
            ORDER BY NF_M.COD_NF DESC
        ) NF
        WHERE LR.STA_LANCTO_CRECEBER = 'AB'
          AND ISNULL(LRA.STA_LANCTO_CRECEBER, 'AB') = 'AB'
          AND (
              (%s > 0 AND LR.COD_CLI = %s)
              OR (%s <> '' AND (
                  REPLACE(REPLACE(REPLACE(C.CNPJ, '.', ''), '/', ''), '-', '') = %s
                  OR REPLACE(REPLACE(C.CPF, '.', ''), '-', '') = %s
              ))
          )
        ORDER BY LRA.DAT_VENC_CRECEBER ASC, LR.NRO_LANCTO_CRECEBER DESC, LRA.COD_PARCELA ASC
    """
    try:
        rows = sql_client.query(sql, (cod_cli_int, cod_cli_int, clean_doc, clean_doc, clean_doc), max_rows=200)
    except Exception as e:
        logger.warning("[Payments][Origins] Erro ao consultar LANCTOS_CRECEBERA no Horus SQL company=%s: %s", company_id, e)
        return []

    out: List[Dict[str, Any]] = []
    for r in rows:
        lancto = str(r.get("NRO_LANCTO_CRECEBER") or "").strip()
        parcela = str(r.get("COD_PARCELA") or "1").strip()
        emp = str(r.get("COD_EMPRESA") or "1").strip()
        fil = str(r.get("COD_FILIAL") or "1").strip()
        nf = str(r.get("NRO_NOTA_FISCAL") or r.get("COD_NF") or "").strip()
        ped = str(r.get("PEDIDO_WEB") or r.get("COD_PED_VENDA") or "").strip()
        vlr_total = _parse_any_amount(r.get("VLR_LANCTO_TOTAL"))
        vlr_pago = _parse_any_amount(r.get("VLR_LANCTO_PAGO"))
        amount = max(0.0, round(vlr_total - vlr_pago, 2)) or vlr_total

        horus_linha = _clean_str(r.get("LINHA_DIGITAVEL"))
        horus_barras = _clean_str(r.get("CODIGO_BARRAS"))
        horus_solic = _clean_str(r.get("COD_SOLICITACAO"))
        horus_nosso = _clean_str(r.get("NRO_CONTROLE"))
        has_horus_boleto = bool(horus_linha or horus_barras or horus_solic)

        origin_ref = f"horus:{emp}:{fil}:{lancto}:{parcela}"
        existing_charge = active_charges_by_launch.get(f"{lancto}:{parcela}") or active_charges_by_launch.get(lancto)

        has_existing = has_horus_boleto or (existing_charge is not None)
        existing_source = "CORA" if existing_charge else ("HORUS" if has_horus_boleto else None)

        desc_parts = [f"ERP Horus - Lanç. {lancto}/{parcela}"]
        if nf:
            desc_parts.append(f"NF {nf}")
        if ped:
            desc_parts.append(f"Ped. {ped}")

        out.append({
            "origin_type": "HORUS_SQL",
            "origin_ref": origin_ref,
            "financial_launch_id": lancto,
            "installment_number": parcela,
            "invoice_number": nf or None,
            "order_number": ped or None,
            "pdv_coupon_number": None,
            "horus_cod_cli": str(r.get("COD_CLI") or ""),
            "issue_date": _parse_any_date(r.get("DAT_EMISS_CRECEBER")),
            "due_date": _parse_any_date(r.get("DAT_VENC_CRECEBER")),
            "amount": amount,
            "payment_form": _clean_str(r.get("COD_FORMA")),
            "description": " | ".join(desc_parts),
            "has_existing_boleto": has_existing,
            "existing_boleto_source": existing_source,
            "existing_charge_id": existing_charge.id if existing_charge else None,
            "existing_digitable_line": (existing_charge.digitable_line if existing_charge else None) or horus_linha or None,
            "existing_our_number": (existing_charge.our_number if existing_charge else None) or horus_nosso or None,
            "origin_meta": {
                "cod_empresa": emp,
                "cod_filial": fil,
                "cod_ped_venda": r.get("COD_PED_VENDA"),
                "cod_forma": _clean_str(r.get("COD_FORMA")),
            },
        })
    return out


def list_customer_open_items(
    db: Session,
    company_id: int,
    *,
    customer_id: Optional[int] = None,
    document: Optional[str] = None,
    id_guid: Optional[str] = None,
    horus_cod_cli: Optional[str] = None,
    origin_group: str = "ALL",
) -> Dict[str, Any]:
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    company = db.query(Company).filter(Company.id == company_id).first()
    horus_enabled = bool(settings and settings.horus_enabled)
    horus_sql_enabled = bool(settings and settings.horus_sql_enabled)

    customer: Optional[Customer] = None
    if customer_id:
        customer = db.query(Customer).options(joinedload(Customer.addresses)).filter(
            Customer.id == customer_id, Customer.company_id == company_id
        ).first()
    elif document:
        clean_d = _digits(document)
        if clean_d:
            customer = db.query(Customer).options(joinedload(Customer.addresses)).filter(
                Customer.company_id == company_id,
                func.regexp_replace(Customer.document, r"\D", "", "g") == clean_d,
            ).first()

    eff_doc = _digits(document or (customer.document if customer else ""))
    eff_guid = _clean_str(id_guid or (customer.id_guid if customer else ""))
    eff_cod_cli = _clean_str(horus_cod_cli or (customer.horus_cod_cli if customer and customer.horus_cod_cli else ""))

    # Se usa Horus API e ainda não temos id_guid do cliente, autentica/busca no Horus pelo CPF/CNPJ e salva no portal
    if horus_enabled and company and company.document and eff_doc and not eff_guid:
        api_cli = _fetch_horus_api_client(db, company_id, _digits(company.document), eff_doc)
        if api_cli:
            found_guid = _clean_str(api_cli.get("ID_GUID") or api_cli.get("GUID"))
            found_cod = _clean_str(api_cli.get("COD_CLI") or api_cli.get("CODIGO"))
            if found_guid:
                eff_guid = found_guid
            if found_cod and not eff_cod_cli:
                eff_cod_cli = found_cod
            if customer:
                changed = False
                if found_guid and not customer.id_guid:
                    customer.id_guid = found_guid
                    changed = True
                if found_cod and found_cod.isdigit() and not customer.horus_cod_cli:
                    customer.horus_cod_cli = int(found_cod)
                    changed = True
                if changed:
                    db.commit()

    if not eff_guid and settings and settings.horus_default_b2b_guid:
        eff_guid = settings.horus_default_b2b_guid.strip()

    # Mapa de cobranças ativas da empresa para impedir geração duplicada
    active_charges = db.query(PayCharge).filter(
        PayCharge.company_id == company_id,
        PayCharge.is_active.is_(True),
        PayCharge.status.notin_(("CANCELLED", "ERROR")),
    ).all()
    by_ref: Dict[str, PayCharge] = {c.origin_ref: c for c in active_charges if c.origin_ref}
    by_launch: Dict[str, PayCharge] = {}
    by_order: Dict[str, PayCharge] = {}
    by_pdv: Dict[str, PayCharge] = {}
    for c in active_charges:
        if c.financial_launch_id:
            by_launch[c.financial_launch_id] = c
            if c.installment_number:
                by_launch[f"{c.financial_launch_id}:{c.installment_number}"] = c
        if c.order_number:
            by_order[c.order_number] = c
        if c.pdv_coupon_number:
            by_pdv[c.pdv_coupon_number] = c

    grp = (origin_group or "ALL").upper()
    horus_items: List[Dict[str, Any]] = []
    financial_items: List[Dict[str, Any]] = []
    order_items: List[Dict[str, Any]] = []
    pdv_items: List[Dict[str, Any]] = []

    # 1. Lançamentos Horus (SQL Direct e/ou REST API `Busca_debitos`)
    if grp in ("ALL", "HORUS") and (horus_sql_enabled or horus_enabled):
        seen_launches = set()
        if horus_sql_enabled:
            for item in _query_horus_sql_open_receivables(db, company_id, eff_doc, eff_cod_cli, by_launch):
                horus_items.append(item)
                seen_launches.add(str(item["financial_launch_id"]))

        if horus_enabled and company and company.document and eff_doc:
            debits = _fetch_horus_api_debits(db, company_id, _digits(company.document), eff_doc, eff_guid)
            for d in debits:
                sta = _clean_str(d.get("STA_LANCTO_CRECEBER") or "AB").upper()
                if sta and sta not in ("AB", "ABERTO"):
                    continue
                lancto = _clean_str(d.get("NRO_LANCTO_CRECEBER") or d.get("NRO_TITULO") or d.get("NUMERO"))
                if not lancto or lancto in seen_launches:
                    continue
                parcela = _clean_str(d.get("COD_PARCELA") or d.get("PARCELA") or "1")
                nf = _clean_str(d.get("NRO_NOTA_FISCAL") or d.get("NOTA_FISCAL") or d.get("COD_NF"))
                ped = _clean_str(d.get("COD_PED_VENDA") or d.get("PEDIDO") or d.get("COD_PEDIDO_ORIGEM"))
                amount = _parse_any_amount(d.get("VLR_LANCTO_CRECEBER") or d.get("VLR_LANCTO_TOTAL") or d.get("VALOR"))
                due_dt = _parse_any_date(d.get("DAT_VENC_CRECEBER") or d.get("VENCIMENTO"))
                issue_dt = _parse_any_date(d.get("DAT_EMISS_CRECEBER") or d.get("DAT_LANCTO_CRECEBER") or d.get("EMISSAO"))
                forma = _clean_str(d.get("NOM_FORMA") or d.get("COD_FORMA"))

                pdf_b64 = _clean_str(d.get("PDF_Base64") or d.get("PDF_BASE64"))
                has_api_pdf = bool(pdf_b64 and "ERRO" not in pdf_b64.upper() and len(pdf_b64) > 30)
                api_linha = _clean_str(d.get("LINHA_DIGITAVEL"))
                api_barras = _clean_str(d.get("CODIGO_BARRAS"))
                api_nosso = _clean_str(d.get("NOSSO_NUMERO") or d.get("NRO_CONTROLE"))
                has_horus_boleto = has_api_pdf or bool(api_linha or api_barras)

                origin_ref = f"horus_api:{lancto}:{parcela}"
                existing_charge = by_ref.get(origin_ref) or by_launch.get(f"{lancto}:{parcela}") or by_launch.get(lancto)
                has_existing = has_horus_boleto or (existing_charge is not None)
                existing_source = "CORA" if existing_charge else ("HORUS" if has_horus_boleto else None)

                desc_parts = [f"ERP Horus - Lanç. {lancto}"]
                if nf:
                    desc_parts.append(f"NF {nf}")
                if ped:
                    desc_parts.append(f"Ped. {ped}")

                horus_items.append({
                    "origin_type": "HORUS_API",
                    "origin_ref": origin_ref,
                    "financial_launch_id": lancto,
                    "installment_number": parcela,
                    "invoice_number": nf or None,
                    "order_number": ped or None,
                    "pdv_coupon_number": None,
                    "horus_cod_cli": eff_cod_cli or None,
                    "issue_date": issue_dt,
                    "due_date": due_dt,
                    "amount": amount,
                    "payment_form": forma,
                    "description": " | ".join(desc_parts),
                    "has_existing_boleto": has_existing,
                    "existing_boleto_source": existing_source,
                    "existing_charge_id": existing_charge.id if existing_charge else None,
                    "existing_digitable_line": (existing_charge.digitable_line if existing_charge else None) or api_linha or None,
                    "existing_our_number": (existing_charge.our_number if existing_charge else None) or api_nosso or None,
                    "origin_meta": {
                        "nom_forma": forma,
                        "id_guid": eff_guid,
                    },
                })

    # 2. Lançamentos Financeiros Cronuz (`fin_installment` + `fin_order_installment`)
    if grp in ("ALL", "FINANCIAL") and customer:
        fin_rows = (
            db.query(FinancialInstallment, FinancialTransaction)
            .join(FinancialTransaction, FinancialInstallment.transaction_id == FinancialTransaction.id)
            .filter(
                FinancialTransaction.company_id == company_id,
                FinancialTransaction.customer_id == customer.id,
                FinancialTransaction.type == "RECEIVABLE",
                FinancialTransaction.transaction_status != "CANCELADO",
                FinancialInstallment.status.in_(("PENDING", "OVERDUE")),
            )
            .order_by(FinancialInstallment.due_date.asc(), FinancialInstallment.id.asc())
            .limit(100)
            .all()
        )
        for inst, trans in fin_rows:
            origin_ref = f"fin_inst:{inst.id}"
            existing_charge = by_ref.get(origin_ref) or by_launch.get(str(inst.id))
            has_slip = bool(inst.bank_slip_linha_digitavel or inst.bank_slip_nosso_numero)
            has_existing = has_slip or (existing_charge is not None)
            existing_source = "CORA" if existing_charge else ((inst.bank_slip_provider or "BANCO") if has_slip else None)
            financial_items.append({
                "origin_type": "FINANCIAL",
                "origin_ref": origin_ref,
                "financial_launch_id": str(inst.id),
                "installment_number": str(inst.number),
                "invoice_number": None,
                "order_number": str(trans.order_id) if trans.order_id else None,
                "pdv_coupon_number": None,
                "horus_cod_cli": eff_cod_cli or None,
                "issue_date": trans.issue_date.isoformat() if trans.issue_date else None,
                "due_date": inst.due_date.isoformat() if inst.due_date else None,
                "amount": round(float(inst.amount or 0), 2),
                "payment_form": "Financeiro Cronuz",
                "description": f"{trans.description} (Parc. {inst.number})"[:100],
                "has_existing_boleto": has_existing,
                "existing_boleto_source": existing_source,
                "existing_charge_id": existing_charge.id if existing_charge else None,
                "existing_digitable_line": (existing_charge.digitable_line if existing_charge else None) or inst.bank_slip_linha_digitavel,
                "existing_our_number": (existing_charge.our_number if existing_charge else None) or inst.bank_slip_nosso_numero,
                "origin_meta": {"transaction_id": trans.id, "installment_id": inst.id},
            })

        ord_inst_rows = (
            db.query(OrderInstallment)
            .filter(
                OrderInstallment.company_id == company_id,
                OrderInstallment.customer_id == customer.id,
                OrderInstallment.status != "PAID",
            )
            .order_by(OrderInstallment.due_date.asc(), OrderInstallment.id.asc())
            .limit(100)
            .all()
        )
        for oi in ord_inst_rows:
            origin_ref = f"ord_inst:{oi.id}"
            existing_charge = by_ref.get(origin_ref)
            financial_items.append({
                "origin_type": "FINANCIAL",
                "origin_ref": origin_ref,
                "financial_launch_id": f"OI-{oi.id}",
                "installment_number": str(oi.installment_number),
                "invoice_number": None,
                "order_number": str(oi.order_id),
                "pdv_coupon_number": None,
                "horus_cod_cli": eff_cod_cli or None,
                "issue_date": oi.created_at.date().isoformat() if getattr(oi, "created_at", None) else None,
                "due_date": oi.due_date.isoformat() if oi.due_date else None,
                "amount": round(float(oi.amount or 0), 2),
                "payment_form": "Parcela de Pedido",
                "description": f"Pedido #{oi.order_id} - Parcela {oi.installment_number}",
                "has_existing_boleto": existing_charge is not None,
                "existing_boleto_source": "CORA" if existing_charge else None,
                "existing_charge_id": existing_charge.id if existing_charge else None,
                "existing_digitable_line": existing_charge.digitable_line if existing_charge else None,
                "existing_our_number": existing_charge.our_number if existing_charge else None,
                "origin_meta": {"order_installment_id": oi.id, "order_id": oi.order_id},
            })

    # 3. Pedidos (`ord_order`)
    if grp in ("ALL", "ORDER") and customer:
        orders = (
            db.query(Order)
            .filter(
                Order.company_id == company_id,
                Order.customer_id == customer.id,
                Order.status != "CANCELLED",
            )
            .order_by(Order.created_at.desc(), Order.id.desc())
            .limit(50)
            .all()
        )
        for o in orders:
            ord_num = str(o.horus_pedido_venda or o.id)
            origin_ref = f"order:{o.id}"
            existing_charge = by_ref.get(origin_ref) or by_order.get(ord_num) or by_order.get(str(o.id))
            prefix = "ERP Horus" if o.horus_pedido_venda else "Pedido"
            desc = f"{prefix} - Pedido #{ord_num}" + (f" | NF {o.invoice_number}" if o.invoice_number else "")
            order_items.append({
                "origin_type": "B2B_ORDER",
                "origin_ref": origin_ref,
                "financial_launch_id": None,
                "installment_number": "1",
                "invoice_number": o.invoice_number or None,
                "order_number": ord_num,
                "pdv_coupon_number": None,
                "horus_cod_cli": eff_cod_cli or None,
                "issue_date": o.created_at.date().isoformat() if o.created_at else None,
                "due_date": None,
                "amount": round(float(o.total or 0), 2),
                "payment_form": o.payment_condition or o.origin,
                "description": desc[:100],
                "has_existing_boleto": existing_charge is not None,
                "existing_boleto_source": "CORA" if existing_charge else None,
                "existing_charge_id": existing_charge.id if existing_charge else None,
                "existing_digitable_line": existing_charge.digitable_line if existing_charge else None,
                "existing_our_number": existing_charge.our_number if existing_charge else None,
                "origin_meta": {"order_id": o.id, "horus_pedido_venda": o.horus_pedido_venda, "customer_order_ref": o.customer_order_ref},
            })

    # 4. Cupons de PDV (`pos_sale`)
    if grp in ("ALL", "PDV") and (customer or eff_doc):
        pdv_q = db.query(POSSale).filter(POSSale.company_id == company_id, POSSale.status == "COMPLETED")
        conds = []
        if customer:
            conds.append(POSSale.customer_id == customer.id)
        if eff_doc:
            conds.append(func.regexp_replace(POSSale.customer_document, r"\D", "", "g") == eff_doc)
        if conds:
            sales = pdv_q.filter(or_(*conds)).order_by(POSSale.sold_at.desc(), POSSale.id.desc()).limit(50).all()
            for s in sales:
                cupom = str(s.sale_number or s.id)
                origin_ref = f"pdv:{s.id}"
                existing_charge = by_ref.get(origin_ref) or by_pdv.get(cupom)
                pdv_items.append({
                    "origin_type": "PDV",
                    "origin_ref": origin_ref,
                    "financial_launch_id": None,
                    "installment_number": "1",
                    "invoice_number": None,
                    "order_number": None,
                    "pdv_coupon_number": cupom,
                    "horus_cod_cli": eff_cod_cli or None,
                    "issue_date": s.sold_at.date().isoformat() if s.sold_at else None,
                    "due_date": None,
                    "amount": round(float(s.total_amount or 0), 2),
                    "payment_form": s.payment_method,
                    "description": f"Cupom PDV #{cupom}",
                    "has_existing_boleto": existing_charge is not None,
                    "existing_boleto_source": "CORA" if existing_charge else None,
                    "existing_charge_id": existing_charge.id if existing_charge else None,
                    "existing_digitable_line": existing_charge.digitable_line if existing_charge else None,
                    "existing_our_number": existing_charge.our_number if existing_charge else None,
                    "origin_meta": {"pos_sale_id": s.id, "sale_number": cupom},
                })

    return {
        "customer_id": customer.id if customer else None,
        "document": eff_doc,
        "id_guid": eff_guid,
        "horus_cod_cli": eff_cod_cli,
        "horus_enabled": horus_enabled,
        "horus_sql_enabled": horus_sql_enabled,
        "horus_items": horus_items,
        "financial_items": financial_items,
        "order_items": order_items,
        "pdv_items": pdv_items,
    }

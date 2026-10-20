"""
cora_horus.py
-------------
Regras de negócio do Boleto Banco Cora integrado ao Horus ERP (Horus Direct / SQL Server).

Fluxo:
  1. list_open_titles      → títulos em aberto (LANCTOS_CRECEBERA status 'AB', sem borderô) paginados.
  2. emit_invoices         → emite fatura no Cora por título/parcela (idempotente) e registra em fin_cora_invoice.
  3. write_back_to_horus   → (opcional) grava nosso número, linha digitável, código de barras, Pix e PDF
                             nas colunas nativas de LANCTOS_CRECEBERA.
  4. sync_invoice          → revalida status no Cora (webhook / job / botão) — nunca confia no payload do webhook.
  5. baixa_paid_invoices   → (opcional/automático) gera borderô de baixa no Horus para faturas PAID.

Tabelas Horus mapeadas (somente leitura, exceto passos 3 e 5 quando habilitados pelo seller):
  LANCTOS_CRECEBER, LANCTOS_CRECEBERA, CLIENTES, ENDERECOS_CLIENTE, TABELA_UF,
  IBS_MUNICIPIOS_UF_ALIQ (nome do município por COD_IBGE), FORMA_PAGTO, BORDERO.
"""
import logging
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, Iterable, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.integrators.cora_client import CoraAPIError, CoraClient
from app.integrators.horus_sql_client import HorusSQLClient
from app.models.cora_invoice import CoraInvoice

logger = logging.getLogger(__name__)

CORA_MIN_AMOUNT = Decimal("5.00")
FINAL_STATUSES = {"PAID", "CANCELLED"}
OPEN_STATUSES = {"PENDING", "DRAFT", "OPEN", "LATE", "IN_PAYMENT"}
_STATUS_ALIASES = {"CANCELED": "CANCELLED"}


# ── Helpers ──────────────────────────────────────────────────────────────────

def _digits(value: Any) -> str:
    return re.sub(r"\D", "", str(value or ""))


def _to_cents(value: Any) -> int:
    return int((Decimal(str(value or 0)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _from_cents(value: Any) -> Optional[Decimal]:
    if value is None:
        return None
    return (Decimal(int(value)) / Decimal(100)).quantize(Decimal("0.01"))


def _as_date(value: Any) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return datetime.fromisoformat(str(value)[:10]).date()
    except ValueError:
        return None


def _parse_dt(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        d = _as_date(value)
        return datetime(d.year, d.month, d.day, tzinfo=timezone.utc) if d else None


def _clean(value: Any, max_len: int) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:max_len]


def parse_cod_formas(raw: Optional[str]) -> List[int]:
    return [int(x) for x in re.findall(r"\d+", raw or "")]


def normalize_status(value: Optional[str]) -> str:
    s = (value or "").upper().strip()
    return _STATUS_ALIASES.get(s, s) or "PENDING"


# ── 1. Listagem de títulos em aberto no Horus ────────────────────────────────

def list_open_titles(
    sql_client: HorusSQLClient,
    settings,
    *,
    due_from: Optional[date] = None,
    due_to: Optional[date] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
) -> Dict[str, Any]:
    """
    Lista parcelas em aberto ('AB', sem borderô) da filial configurada, paginadas no SQL Server.

    Paginação: respeita `horus_legacy_pagination` (config Master → seller). Quando ativo, usa
    ROW_NUMBER() em vez de OFFSET/FETCH (compatível com SQL Server antigos).
    """
    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or 50), 200))
    cod_filial = sql_client.cod_filial

    where = [
        "A.COD_FILIAL = %s",
        "A.STA_LANCTO_CRECEBER = 'AB'",
        "ISNULL(A.COD_BORDERO, 0) = 0",
        "ISNULL(L.COD_BORDERO, 0) = 0",
    ]
    params: List[Any] = [cod_filial]

    formas = parse_cod_formas(getattr(settings, "cora_horus_cod_formas", None))
    if formas:
        where.append(f"A.COD_FORMA IN ({', '.join(['%s'] * len(formas))})")
        params.extend(formas)
    if due_from:
        where.append("A.DAT_VENC_CRECEBER >= %s")
        params.append(datetime(due_from.year, due_from.month, due_from.day))
    if due_to:
        nxt = due_to + timedelta(days=1)
        where.append("A.DAT_VENC_CRECEBER < %s")
        params.append(datetime(nxt.year, nxt.month, nxt.day))
    if search and search.strip():
        term = search.strip()
        digits = _digits(term)
        conds = ["C.NOM_CLI LIKE %s"]
        params.append(f"%{term}%")
        if digits:
            conds.append("REPLACE(REPLACE(REPLACE(ISNULL(C.CNPJ, ''), '.', ''), '/', ''), '-', '') LIKE %s")
            conds.append("REPLACE(REPLACE(ISNULL(C.CPF, ''), '.', ''), '-', '') LIKE %s")
            params.extend([f"%{digits}%", f"%{digits}%"])
            if len(digits) <= 9:
                conds.append("A.NRO_LANCTO_CRECEBER = %s")
                conds.append("L.COD_PED_VENDA = %s")
                params.extend([int(digits), int(digits)])
        where.append("(" + " OR ".join(conds) + ")")

    from_sql = f"""
        FROM LANCTOS_CRECEBERA A WITH (NOLOCK)
        INNER JOIN LANCTOS_CRECEBER L WITH (NOLOCK)
            ON L.NRO_LANCTO_CRECEBER = A.NRO_LANCTO_CRECEBER AND L.COD_FILIAL = A.COD_FILIAL
        INNER JOIN CLIENTES C WITH (NOLOCK) ON C.COD_CLI = A.COD_CLI
        LEFT JOIN FORMA_PAGTO F WITH (NOLOCK) ON F.COD_FORMA = A.COD_FORMA
        WHERE {' AND '.join(where)}
    """
    select_cols = """
        A.NRO_LANCTO_CRECEBER, A.COD_PARCELA, A.COD_FILIAL, A.COD_EMPRESA, A.COD_CLI,
        A.COD_FORMA, F.NOM_FORMA, A.DAT_VENC_CRECEBER, A.DAT_EMISS_CRECEBER,
        A.VLR_LANCTO_TOTAL, ISNULL(A.VLR_LANCTO_PAGO, 0) AS VLR_LANCTO_PAGO,
        L.COD_PED_VENDA, L.COD_NF, C.NOM_CLI, C.CNPJ, C.CPF, C.TPO_PESSOA,
        A.LINHA_DIGITAVEL AS HORUS_LINHA_DIGITAVEL
    """
    order_sql = "A.DAT_VENC_CRECEBER ASC, A.NRO_LANCTO_CRECEBER ASC, A.COD_PARCELA ASC"
    offset = (page - 1) * page_size

    if getattr(settings, "horus_legacy_pagination", False):
        data_sql = f"""
            SELECT * FROM (
                SELECT {select_cols}, ROW_NUMBER() OVER (ORDER BY {order_sql}) AS RN
                {from_sql}
            ) T WHERE T.RN > %s AND T.RN <= %s ORDER BY T.RN
        """
        data_params = tuple(params + [offset, offset + page_size])
    else:
        data_sql = f"""
            SELECT {select_cols}
            {from_sql}
            ORDER BY {order_sql}
            OFFSET %s ROWS FETCH NEXT %s ROWS ONLY
        """
        data_params = tuple(params + [offset, page_size])

    rows = sql_client.query(data_sql, data_params, max_rows=page_size)
    total_row = sql_client.query(
        f"SELECT COUNT(1) AS TOTAL, SUM(A.VLR_LANCTO_TOTAL - ISNULL(A.VLR_LANCTO_PAGO, 0)) AS VALOR {from_sql}",
        tuple(params), max_rows=1,
    )
    total = int((total_row[0].get("TOTAL") if total_row else 0) or 0)
    total_valor = float((total_row[0].get("VALOR") if total_row else 0) or 0)

    items = []
    for r in rows:
        saldo = Decimal(str(r.get("VLR_LANCTO_TOTAL") or 0)) - Decimal(str(r.get("VLR_LANCTO_PAGO") or 0))
        items.append({
            "nro_lancamento": int(r["NRO_LANCTO_CRECEBER"]),
            "cod_parcela": int(r.get("COD_PARCELA") or 1),
            "cod_filial": str(r.get("COD_FILIAL")),
            "cod_cli": r.get("COD_CLI"),
            "cliente_nome": (r.get("NOM_CLI") or "").strip(),
            "documento": _digits(r.get("CNPJ")) or _digits(r.get("CPF")),
            "cod_forma": r.get("COD_FORMA"),
            "forma_nome": (r.get("NOM_FORMA") or "").strip(),
            "vencimento": _as_date(r.get("DAT_VENC_CRECEBER")).isoformat() if r.get("DAT_VENC_CRECEBER") else None,
            "emissao": _as_date(r.get("DAT_EMISS_CRECEBER")).isoformat() if r.get("DAT_EMISS_CRECEBER") else None,
            "valor": float(saldo.quantize(Decimal("0.01"))),
            "cod_ped_venda": r.get("COD_PED_VENDA"),
            "cod_nf": r.get("COD_NF"),
            "horus_tem_boleto": bool((r.get("HORUS_LINHA_DIGITAVEL") or "").strip()),
        })
    return {"items": items, "total": total, "total_valor": round(total_valor, 2), "page": page, "page_size": page_size}


# ── 2. Emissão ───────────────────────────────────────────────────────────────

def fetch_titles_for_emission(sql_client: HorusSQLClient, keys: List[Tuple[int, int]]) -> Dict[Tuple[int, int], Dict[str, Any]]:
    """Carrega título + sacado + endereço de cobrança para as chaves (nro_lancamento, cod_parcela)."""
    if not keys:
        return {}
    nros = sorted({k[0] for k in keys})
    wanted = set(keys)
    result: Dict[Tuple[int, int], Dict[str, Any]] = {}
    for i in range(0, len(nros), 500):
        batch = nros[i:i + 500]
        placeholders = ", ".join(["%s"] * len(batch))
        rows = sql_client.query(
            f"""
            SELECT
                A.NRO_LANCTO_CRECEBER, A.COD_PARCELA, A.COD_FILIAL, A.COD_EMPRESA, A.COD_CLI,
                A.STA_LANCTO_CRECEBER, A.COD_BORDERO, A.DAT_VENC_CRECEBER,
                A.VLR_LANCTO_TOTAL, ISNULL(A.VLR_LANCTO_PAGO, 0) AS VLR_LANCTO_PAGO,
                L.COD_PED_VENDA, L.COD_NF,
                C.NOM_CLI, C.CNPJ, C.CPF, C.TPO_PESSOA, C.EMAIL, C.EMAILB2B,
                E.DESC_ENDERECO, E.NUM_END, E.COM_ENDERECO, E.NOM_BAIRRO, E.CEP, E.EMAIL AS END_EMAIL,
                UF.SIGLA_UF, MUN.NOM_MUNICIPIO, MUN.SIGLA_UF AS MUN_UF
            FROM LANCTOS_CRECEBERA A WITH (NOLOCK)
            INNER JOIN LANCTOS_CRECEBER L WITH (NOLOCK)
                ON L.NRO_LANCTO_CRECEBER = A.NRO_LANCTO_CRECEBER AND L.COD_FILIAL = A.COD_FILIAL
            INNER JOIN CLIENTES C WITH (NOLOCK) ON C.COD_CLI = A.COD_CLI
            OUTER APPLY (
                SELECT TOP 1 EC.* FROM ENDERECOS_CLIENTE EC WITH (NOLOCK)
                WHERE EC.COD_CLI = A.COD_CLI AND ISNULL(EC.STA_VALIDO, 'S') <> 'N'
                ORDER BY CASE WHEN EC.STA_DEFAULT = 'S' THEN 0 ELSE 1 END, EC.COD_TPO_END, EC.COD_END
            ) E
            LEFT JOIN TABELA_UF UF WITH (NOLOCK) ON UF.COD_UF = E.COD_UF
            OUTER APPLY (
                SELECT TOP 1 M.NOM_MUNICIPIO, M.SIGLA_UF FROM IBS_MUNICIPIOS_UF_ALIQ M WITH (NOLOCK)
                WHERE M.COD_IBGE = E.COD_IBGE
            ) MUN
            WHERE A.COD_FILIAL = %s AND A.NRO_LANCTO_CRECEBER IN ({placeholders})
            """,
            tuple([sql_client.cod_filial] + batch),
            max_rows=5000,
        )
        for r in rows:
            key = (int(r["NRO_LANCTO_CRECEBER"]), int(r.get("COD_PARCELA") or 1))
            if key in wanted:
                result[key] = r
    return result


def validate_and_build_payload(
    title: Dict[str, Any],
    settings,
    *,
    overdue_due_date: Optional[date] = None,
) -> Tuple[Optional[Dict[str, Any]], Dict[str, Any], Optional[str]]:
    """
    Valida o título e monta o payload do POST /v2/invoices.
    Retorna (payload, snapshot, erro). Quando erro != None, payload é None.
    """
    nro = int(title["NRO_LANCTO_CRECEBER"])
    parcela = int(title.get("COD_PARCELA") or 1)
    filial = str(title.get("COD_FILIAL"))

    if (title.get("STA_LANCTO_CRECEBER") or "").strip().upper() != "AB":
        return None, {}, "Título não está em aberto no Horus."
    if int(title.get("COD_BORDERO") or 0) > 0:
        return None, {}, f"Título já vinculado ao borderô #{title.get('COD_BORDERO')}."

    amount = (Decimal(str(title.get("VLR_LANCTO_TOTAL") or 0)) - Decimal(str(title.get("VLR_LANCTO_PAGO") or 0))).quantize(Decimal("0.01"))
    if amount < CORA_MIN_AMOUNT:
        return None, {}, f"Valor R$ {amount} abaixo do mínimo do Cora (R$ 5,00)."

    due = _as_date(title.get("DAT_VENC_CRECEBER"))
    today = date.today()
    if not due or due < today:
        if overdue_due_date and overdue_due_date >= today:
            due = overdue_due_date
        else:
            return None, {}, "Título vencido: informe um novo vencimento para emitir o boleto."

    document = _digits(title.get("CNPJ")) or _digits(title.get("CPF"))
    if len(document) not in (11, 14):
        return None, {}, "Cliente sem CPF/CNPJ válido no cadastro do Horus."

    name = _clean(title.get("NOM_CLI"), 60)
    street = _clean(title.get("DESC_ENDERECO"), 100)
    number = _clean(title.get("NUM_END"), 20) or "S/N"
    district = _clean(title.get("NOM_BAIRRO"), 60)
    city = _clean(title.get("NOM_MUNICIPIO"), 60)
    state = _clean(title.get("SIGLA_UF") or title.get("MUN_UF"), 2).upper()
    cep = _digits(title.get("CEP")).zfill(8) if _digits(title.get("CEP")) else ""
    missing = [lbl for lbl, v in (("logradouro", street), ("bairro", district), ("cidade", city), ("UF", state), ("CEP", cep)) if not v]
    if missing:
        return None, {}, f"Endereço do cliente incompleto no Horus ({', '.join(missing)})."

    email = next(
        (e.strip() for e in (title.get("EMAIL"), title.get("END_EMAIL"), title.get("EMAILB2B"))
         if e and re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", e.strip())),
        None,
    )

    customer: Dict[str, Any] = {
        "name": name,
        "document": {"identity": document, "type": "CNPJ" if len(document) == 14 else "CPF"},
        "address": {
            "street": street,
            "number": number,
            "district": district,
            "city": city,
            "state": state,
            "complement": _clean(title.get("COM_ENDERECO"), 60) or "N/A",
            "zip_code": cep[:8],
        },
    }
    if email:
        customer["email"] = email[:60]

    ped = title.get("COD_PED_VENDA")
    nf = title.get("COD_NF")
    desc_parts = [f"Título {nro}/{parcela}"]
    if ped:
        desc_parts.append(f"Pedido {ped}")
    if nf:
        desc_parts.append(f"NF {nf}")

    payment_terms: Dict[str, Any] = {"due_date": due.isoformat()}
    fine_rate = getattr(settings, "cora_fine_rate", None)
    interest_rate = getattr(settings, "cora_interest_rate", None)
    if fine_rate and Decimal(str(fine_rate)) > 0:
        payment_terms["fine"] = {"rate": float(fine_rate)}
    if interest_rate and Decimal(str(interest_rate)) > 0:
        payment_terms["interest"] = {"rate": float(interest_rate)}

    payload: Dict[str, Any] = {
        "code": f"HORUS-{filial}-{nro}-{parcela}",
        "customer": customer,
        "services": [{
            "name": _clean(f"Cobrança título {nro}/{parcela}", 60),
            "description": _clean(" | ".join(desc_parts), 100),
            "amount": _to_cents(amount),
        }],
        "payment_terms": payment_terms,
        "payment_forms": ["BANK_SLIP", "PIX"],
    }
    if getattr(settings, "cora_notify_email", False) and email:
        payload["notification"] = {
            "name": name,
            "channels": [{
                "channel": "EMAIL",
                "contact": email[:60],
                "rules": ["NOTIFY_TWO_DAYS_BEFORE_DUE_DATE", "NOTIFY_ON_DUE_DATE", "NOTIFY_WHEN_PAID"],
            }],
        }

    snapshot = {
        "cod_empresa": str(title.get("COD_EMPRESA") or ""),
        "cod_filial": filial,
        "nro_lancto_creceber": nro,
        "cod_parcela": parcela,
        "cod_cli": title.get("COD_CLI"),
        "cod_ped_venda": ped,
        "customer_name": name,
        "customer_document": document,
        "amount": amount,
        "due_date": due,
    }
    return payload, snapshot, None


def apply_invoice_data(inv: CoraInvoice, data: Dict[str, Any]) -> None:
    """Copia a resposta do Cora (criação ou GET) para o registro local."""
    if not isinstance(data, dict):
        return
    if data.get("id"):
        inv.cora_invoice_id = data["id"]
    status = normalize_status(data.get("status"))
    if status:
        inv.status = status
    bank_slip = (data.get("payment_options") or {}).get("bank_slip") or {}
    inv.our_number = bank_slip.get("our_number") or inv.our_number
    inv.digitable_line = bank_slip.get("digitable") or inv.digitable_line
    inv.barcode = bank_slip.get("barcode") or inv.barcode
    inv.pdf_url = bank_slip.get("url") or inv.pdf_url
    pix = data.get("pix") or {}
    inv.pix_emv = pix.get("emv") or inv.pix_emv
    if data.get("total_paid") is not None:
        inv.total_paid = _from_cents(data.get("total_paid"))
    if inv.status == "PAID":
        inv.paid_at = _parse_dt(data.get("occurrence_date")) or inv.paid_at or datetime.now(timezone.utc)
    if inv.status == "CANCELLED":
        inv.is_active = False
    inv.last_synced_at = datetime.now(timezone.utc)
    inv.last_error = None


def emit_invoices(
    db: Session,
    settings,
    sql_client: HorusSQLClient,
    company_id: int,
    keys: List[Tuple[int, int]],
    *,
    user_id: Optional[int] = None,
    overdue_due_date: Optional[date] = None,
) -> Dict[str, Any]:
    """Emite boletos em lote (uma fatura por título/parcela). Idempotente por título ativo."""
    unique_keys = list(dict.fromkeys((int(n), int(p)) for n, p in keys))
    titles = fetch_titles_for_emission(sql_client, unique_keys)

    existing = {
        (i.nro_lancto_creceber, i.cod_parcela): i
        for i in db.query(CoraInvoice).filter(
            CoraInvoice.company_id == company_id,
            CoraInvoice.cod_filial == sql_client.cod_filial,
            CoraInvoice.is_active.is_(True),
            CoraInvoice.nro_lancto_creceber.in_([k[0] for k in unique_keys] or [0]),
        ).all()
    }

    results: List[Dict[str, Any]] = []
    emitted: List[CoraInvoice] = []

    with CoraClient.from_settings(settings) as cora:
        for key in unique_keys:
            nro, parcela = key
            base = {"nro_lancamento": nro, "cod_parcela": parcela}
            title = titles.get(key)
            if not title:
                results.append({**base, "success": False, "error": "Título não encontrado no Horus para a filial configurada."})
                continue

            inv = existing.get(key)
            if inv and inv.status not in ("ERROR", "PENDING"):
                results.append({**base, "success": False, "error": f"Já existe boleto Cora ativo ({inv.status}).", "invoice_id": inv.id})
                continue

            payload, snap, err = validate_and_build_payload(title, settings, overdue_due_date=overdue_due_date)
            if err:
                results.append({**base, "success": False, "error": err})
                continue

            if inv is None:
                inv = CoraInvoice(
                    company_id=company_id,
                    idempotency_key=str(uuid.uuid4()),
                    status="PENDING",
                    is_active=True,
                    created_by_user_id=user_id,
                    **snap,
                )
                db.add(inv)
            else:
                # Reenvio de tentativa anterior com erro: mantém a mesma Idempotency-Key
                for k, v in snap.items():
                    setattr(inv, k, v)
            db.flush()  # garante o índice único antes de chamar o banco (evita boleto duplicado)

            try:
                data = cora.create_invoice(payload, idempotency_key=inv.idempotency_key)
                apply_invoice_data(inv, data)
                if inv.status == "PENDING":
                    inv.status = "OPEN"
                emitted.append(inv)
                results.append({**base, "success": True, "invoice_id": inv.id, "cora_invoice_id": inv.cora_invoice_id,
                                "status": inv.status, "digitable_line": inv.digitable_line})
            except CoraAPIError as e:
                inv.status = "ERROR"
                inv.last_error = str(e)[:2000]
                results.append({**base, "success": False, "error": f"Cora: {e}", "invoice_id": inv.id})
            db.commit()

    written = 0
    if emitted and getattr(settings, "cora_horus_write_back", False):
        written = write_back_to_horus(db, settings, sql_client, emitted)

    return {
        "emitted": sum(1 for r in results if r["success"]),
        "failed": sum(1 for r in results if not r["success"]),
        "written_back": written,
        "results": results,
    }


# ── 3. Gravação reversa no Horus ─────────────────────────────────────────────

def write_back_to_horus(db: Session, settings, sql_client: HorusSQLClient, invoices: Iterable[CoraInvoice]) -> int:
    """
    Grava os dados do boleto nas colunas nativas de LANCTOS_CRECEBERA (apenas parcelas ainda 'AB').
    Executado somente quando o seller habilita `cora_horus_write_back`.
    """
    pending = [i for i in invoices if i.digitable_line and not i.horus_written_back]
    if not pending:
        return 0

    def _int_or_none(v):
        d = _digits(v)
        return int(d) if d else None

    banco = _int_or_none(settings.cora_horus_banco_codigo)
    agencia = _int_or_none(settings.cora_horus_banco_agencia)
    conta = _int_or_none(settings.cora_horus_banco_conta)
    carteira = (settings.cora_horus_banco_carteira or "").strip()[:20] or None

    def _tx(cur):
        count = 0
        for inv in pending:
            pix = inv.pix_emv if inv.pix_emv and len(inv.pix_emv) <= 255 else None
            pdf = inv.pdf_url if inv.pdf_url and len(inv.pdf_url) <= 255 else None
            cur.execute(
                """
                UPDATE LANCTOS_CRECEBERA SET
                    NRO_CONTROLE    = %s,
                    CODIGO_BARRAS   = %s,
                    LINHA_DIGITAVEL = %s,
                    COD_SOLICITACAO = %s,
                    PIX             = %s,
                    CAMINHO_PDF     = %s,
                    COD_BANCO       = ISNULL(%s, COD_BANCO),
                    COD_AGENCIA     = ISNULL(%s, COD_AGENCIA),
                    COD_CONTAC      = ISNULL(%s, COD_CONTAC),
                    NRO_CARTEIRA    = ISNULL(%s, NRO_CARTEIRA),
                    DAT_ULT_ATL     = GETDATE()
                WHERE COD_FILIAL = %s AND NRO_LANCTO_CRECEBER = %s AND COD_PARCELA = %s
                  AND STA_LANCTO_CRECEBER = 'AB'
                """,
                (
                    (inv.our_number or "")[:30] or None,
                    (inv.barcode or "")[:50] or None,
                    (inv.digitable_line or "")[:50] or None,
                    (inv.cora_invoice_id or "")[:40] or None,
                    pix, pdf, banco, agencia, conta, carteira,
                    inv.cod_filial, inv.nro_lancto_creceber, inv.cod_parcela,
                ),
            )
            if cur.rowcount and cur.rowcount > 0:
                inv.horus_written_back = True
                count += 1
        return count

    try:
        written = sql_client.execute_transaction(_tx)
        db.commit()
        return written
    except Exception as e:
        db.rollback()
        logger.error("[CoraHorus] Falha ao gravar boletos no Horus company=%s: %s", sql_client.company_id, e)
        for inv in pending:
            inv.last_error = f"Falha ao gravar no Horus: {e}"[:2000]
        db.commit()
        return 0


def clear_write_back(settings, sql_client: HorusSQLClient, inv: CoraInvoice) -> None:
    """Remove os dados do boleto cancelado de LANCTOS_CRECEBERA (somente se ainda for o mesmo boleto)."""
    if not inv.horus_written_back or not getattr(settings, "cora_horus_write_back", False):
        return

    def _tx(cur):
        cur.execute(
            """
            UPDATE LANCTOS_CRECEBERA SET
                NRO_CONTROLE = NULL, CODIGO_BARRAS = NULL, LINHA_DIGITAVEL = NULL,
                COD_SOLICITACAO = NULL, PIX = NULL, CAMINHO_PDF = NULL, DAT_ULT_ATL = GETDATE()
            WHERE COD_FILIAL = %s AND NRO_LANCTO_CRECEBER = %s AND COD_PARCELA = %s
              AND COD_SOLICITACAO = %s AND STA_LANCTO_CRECEBER = 'AB'
            """,
            (inv.cod_filial, inv.nro_lancto_creceber, inv.cod_parcela, (inv.cora_invoice_id or "")[:40]),
        )

    sql_client.execute_transaction(_tx)
    inv.horus_written_back = False


# ── 4. Sincronização ─────────────────────────────────────────────────────────

def sync_invoice(cora: CoraClient, inv: CoraInvoice) -> str:
    """Revalida o status direto na API do Cora (fonte da verdade). Retorna o status anterior."""
    previous = inv.status
    if not inv.cora_invoice_id:
        return previous
    try:
        data = cora.get_invoice(inv.cora_invoice_id)
        apply_invoice_data(inv, data)
    except CoraAPIError as e:
        inv.last_error = f"Sync: {e}"[:2000]
        inv.last_synced_at = datetime.now(timezone.utc)
    return previous


# ── 5. Baixa por borderô ─────────────────────────────────────────────────────

def baixa_paid_invoices(db: Session, settings, sql_client: HorusSQLClient, invoices: List[CoraInvoice]) -> Dict[str, Any]:
    """Gera UM borderô no Horus para todas as faturas PAID ainda não baixadas."""
    from app.services.horus_bordero import BorderoBankParams, BorderoRelease, create_bordero

    targets = [i for i in invoices if i.status == "PAID" and not i.cod_bordero_baixa]
    if not targets:
        return {"bordero": None, "count": 0, "total": 0.0}

    # Garante que os títulos ainda estão em aberto no Horus (evita baixa dupla se alguém baixou manualmente)
    nros = sorted({i.nro_lancto_creceber for i in targets})
    placeholders = ", ".join(["%s"] * len(nros))
    rows = sql_client.query(
        f"""
        SELECT NRO_LANCTO_CRECEBER, COD_PARCELA, STA_LANCTO_CRECEBER, COD_BORDERO
        FROM LANCTOS_CRECEBERA WITH (NOLOCK)
        WHERE COD_FILIAL = %s AND NRO_LANCTO_CRECEBER IN ({placeholders})
        """,
        tuple([sql_client.cod_filial] + nros), max_rows=5000,
    )
    open_keys = {
        (int(r["NRO_LANCTO_CRECEBER"]), int(r.get("COD_PARCELA") or 1))
        for r in rows
        if (r.get("STA_LANCTO_CRECEBER") or "").strip().upper() == "AB" and int(r.get("COD_BORDERO") or 0) == 0
    }
    eligible = [i for i in targets if (i.nro_lancto_creceber, i.cod_parcela) in open_keys]
    skipped = [i for i in targets if i not in eligible]
    for i in skipped:
        i.last_error = "Baixa não gerada: título já baixado/fora de aberto no Horus."
    if not eligible:
        db.commit()
        return {"bordero": None, "count": 0, "total": 0.0, "skipped": len(skipped)}

    bank = BorderoBankParams(
        forma_pagto=settings.cora_horus_banco_forma_pagto,
        banco=settings.cora_horus_banco_codigo,
        agencia=settings.cora_horus_banco_agencia,
        conta=settings.cora_horus_banco_conta,
        carteira=settings.cora_horus_banco_carteira,
    )
    releases = [
        BorderoRelease(nro_lancamento=i.nro_lancto_creceber, cod_parcela=i.cod_parcela,
                       valor=float(i.total_paid if i.total_paid is not None else i.amount))
        for i in eligible
    ]
    bordero = create_bordero(sql_client, bank, releases, company_id=sql_client.company_id, file_prefix="cora")
    now = datetime.now(timezone.utc)
    for i in eligible:
        i.cod_bordero_baixa = bordero
        i.baixa_at = now
        i.last_error = None
    db.commit()
    return {
        "bordero": bordero,
        "count": len(eligible),
        "total": round(sum(r.valor for r in releases), 2),
        "skipped": len(skipped),
    }

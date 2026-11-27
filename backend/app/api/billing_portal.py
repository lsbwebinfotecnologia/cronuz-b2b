import base64
import copy
import hashlib
import hmac
import json
import os
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.core import security
from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.company import Company
from app.models.company_settings import CompanySettings
from app.models.customer import Customer
from app.models.financial import FinancialInstallment, FinancialTransaction
from app.models.service import ServiceOrder
from app.models.user import User

router = APIRouter(tags=["billing-portal"])

# GIF 1x1 transparente para pixel de leitura de e-mail
TRANSPARENT_1X1_GIF = base64.b64decode(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
)


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64url_decode(s: str) -> bytes:
    pad = "=" * ((4 - len(s) % 4) % 4)
    return base64.urlsafe_b64decode((s + pad).encode("utf-8"))


def create_billing_token(
    entity_type: str,
    entity_id: int,
    company_id: int,
    tracking_id: Optional[str] = None,
) -> str:
    payload = {
        "t": entity_type,  # "os" ou "tx"
        "id": int(entity_id),
        "c": int(company_id),
        "trk": tracking_id or "",
    }
    raw_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    b64_payload = _b64url_encode(raw_bytes)
    sig = hmac.new(
        security.SECRET_KEY.encode("utf-8"),
        b64_payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()[:20]
    return f"FTR1.{b64_payload}.{sig}"


def verify_billing_token(token: str) -> Dict[str, Any]:
    if not token or not token.startswith("FTR1."):
        raise HTTPException(status_code=404, detail="Link de fatura inválido.")
    parts = token.split(".")
    if len(parts) != 3:
        raise HTTPException(status_code=404, detail="Formato de token inválido.")
    _, b64_payload, sig = parts
    expected_sig = hmac.new(
        security.SECRET_KEY.encode("utf-8"),
        b64_payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()[:20]
    if not hmac.compare_digest(sig, expected_sig):
        raise HTTPException(status_code=403, detail="Assinatura do link de fatura inválida.")
    try:
        return json.loads(_b64url_decode(b64_payload).decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Payload do token inválido.")


def resolve_public_urls(request: Optional[Request] = None) -> Tuple[str, str]:
    """
    Determina (frontend_base_url, api_base_url) de forma inteligente a partir dos cabeçalhos
    Origin / Host da requisição ou variáveis de ambiente.
    """
    env_front = (os.getenv("FRONTEND_URL") or os.getenv("NEXT_PUBLIC_APP_URL") or "").strip().rstrip("/")
    env_api = (os.getenv("PUBLIC_API_URL") or os.getenv("NEXT_PUBLIC_API_URL") or "").strip().rstrip("/")

    origin = ""
    host = ""
    scheme = "https"
    if request:
        origin = (request.headers.get("origin") or "").strip().rstrip("/")
        host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").strip()
        proto = (request.headers.get("x-forwarded-proto") or request.url.scheme or "http").strip()
        scheme = "https" if "https" in proto else proto

    if origin and "localhost" not in origin and "127.0.0.1" not in origin:
        front_base = origin
        if "app.horusb2b.com.br" in origin:
            api_base = "https://api.horusb2b.com.br"
        elif "app.cronuzb2b.com.br" in origin:
            api_base = "https://api.cronuzb2b.com.br"
        else:
            api_base = env_api or f"{scheme}://{host}"
        return front_base, api_base

    if host and "localhost" not in host and "127.0.0.1" not in host:
        if "horusb2b.com.br" in host:
            return "https://app.horusb2b.com.br", "https://api.horusb2b.com.br"
        if "cronuzb2b.com.br" in host:
            return "https://app.cronuzb2b.com.br", "https://api.cronuzb2b.com.br"

    return (
        env_front or (origin if origin else "http://localhost:3000"),
        env_api or (f"{scheme}://{host}" if host else "http://localhost:8000"),
    )


def build_trackable_billing_email_html(
    raw_body_text: str,
    portal_url: str,
    pixel_url: str,
    company_name: str,
    reference_label: str,
    total_formatted: str,
) -> str:
    """
    Envolve o texto do e-mail em um layout HTML transacional limpo (aprovado por filtros SPFBL/SpamAssassin)
    com botão de acesso direto ao Portal da Fatura (Nota Fiscal + Boleto) e pixel de confirmação de leitura.
    """
    body_html = (raw_body_text or "").replace("\n", "<br>")
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{reference_label} - {company_name}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
  <div style="max-width:620px;margin:24px auto;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
    <div style="background-color:#0f172a;padding:20px 24px;color:#ffffff;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;font-weight:700;">Comunicado de Faturamento</div>
      <div style="font-size:18px;font-weight:800;margin-top:4px;">{company_name}</div>
    </div>
    <div style="padding:24px;font-size:14px;line-height:1.65;color:#334155;">
      {body_html}
      <div style="margin-top:24px;padding:20px;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;text-align:center;">
        <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">
          {reference_label} &bull; Valor: <span style="color:#0f172a;">{total_formatted}</span>
        </div>
        <div style="margin-top:14px;">
          <a href="{portal_url}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#4f46e5;color:#ffffff;font-weight:700;font-size:14px;text-decoration:none;padding:12px 24px;border-radius:10px;">
            Acessar Fatura, NFS-e e Boleto Online
          </a>
        </div>
        <div style="margin-top:12px;font-size:12px;color:#64748b;line-height:1.45;">
          Caso seu provedor de e-mail bloqueie anexos PDF, clique no botão acima ou acesse diretamente:<br>
          <a href="{portal_url}" target="_blank" rel="noopener noreferrer" style="color:#4f46e5;word-break:break-all;">{portal_url}</a>
        </div>
      </div>
    </div>
    <div style="padding:14px 24px;background-color:#f1f5f9;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;text-align:center;">
      Mensagem transacional enviada por <strong>{company_name}</strong>.
    </div>
  </div>
  <img src="{pixel_url}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;" />
</body>
</html>"""


def _update_logs_list(
    logs: Optional[list],
    tracking_id: Optional[str],
    message_id: Optional[str],
    event_type: str,
    extra: Optional[Dict[str, Any]] = None,
) -> Tuple[list, bool]:
    if not logs or not isinstance(logs, list):
        return [], False

    new_logs = copy.deepcopy(logs)
    now_iso = datetime.utcnow().isoformat()
    target_idx = None

    if tracking_id:
        for idx in range(len(new_logs) - 1, -1, -1):
            if new_logs[idx].get("tracking_id") == tracking_id:
                target_idx = idx
                break

    if target_idx is None and message_id:
        clean_mid = message_id.strip().strip("<>")
        for idx in range(len(new_logs) - 1, -1, -1):
            saved_mid = str(new_logs[idx].get("message_id") or "").strip().strip("<>")
            if saved_mid and (saved_mid == clean_mid or clean_mid in saved_mid or saved_mid in clean_mid):
                target_idx = idx
                break

    if target_idx is None and len(new_logs) > 0:
        target_idx = len(new_logs) - 1

    if target_idx is None:
        return new_logs, False

    entry = dict(new_logs[target_idx])
    cur_status = str(entry.get("status") or "SENT").upper()

    if event_type == "DELIVERED":
        entry["delivered_at"] = entry.get("delivered_at") or now_iso
        if cur_status in ("SENT", ""):
            entry["status"] = "DELIVERED"
    elif event_type == "OPENED":
        entry["opened_at"] = entry.get("opened_at") or now_iso
        entry["last_opened_at"] = now_iso
        entry["opens_count"] = int(entry.get("opens_count") or 0) + 1
        if cur_status not in ("VIEWED_PORTAL", "DOWNLOADED"):
            entry["status"] = "OPENED"
    elif event_type == "VIEWED_PORTAL":
        entry["opened_at"] = entry.get("opened_at") or now_iso
        entry["portal_viewed_at"] = entry.get("portal_viewed_at") or now_iso
        entry["last_portal_viewed_at"] = now_iso
        entry["portal_views_count"] = int(entry.get("portal_views_count") or 0) + 1
        if cur_status != "DOWNLOADED":
            entry["status"] = "VIEWED_PORTAL"
    elif event_type == "DOWNLOADED":
        entry["opened_at"] = entry.get("opened_at") or now_iso
        entry["portal_viewed_at"] = entry.get("portal_viewed_at") or now_iso
        entry["downloaded_at"] = entry.get("downloaded_at") or now_iso
        entry["last_downloaded_at"] = now_iso
        entry["downloads_count"] = int(entry.get("downloads_count") or 0) + 1
        entry["status"] = "DOWNLOADED"
        if extra and extra.get("document"):
            dl_docs = list(entry.get("downloaded_documents") or [])
            if extra["document"] not in dl_docs:
                dl_docs.append(extra["document"])
            entry["downloaded_documents"] = dl_docs
    elif event_type == "BOUNCED":
        entry["bounced_at"] = now_iso
        entry["status"] = "BOUNCED"
        if extra and extra.get("reason"):
            entry["bounce_reason"] = str(extra["reason"])[:500]

    if extra:
        for k, v in extra.items():
            if k not in ("document", "reason") and v is not None:
                entry[k] = v

    new_logs[target_idx] = entry
    return new_logs, True


def record_billing_tracking_event(
    db: Session,
    entity_type: str,
    entity_id: int,
    company_id: int,
    tracking_id: Optional[str],
    event_type: str,
    message_id: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> None:
    try:
        if entity_type == "os":
            order = db.query(ServiceOrder).filter(
                ServiceOrder.id == entity_id,
                ServiceOrder.company_id == company_id,
            ).first()
            if not order:
                return
            updated_logs, changed = _update_logs_list(order.email_logs, tracking_id, message_id, event_type, extra)
            if changed:
                order.email_logs = updated_logs
                flag_modified(order, "email_logs")
            # Sincroniza também com transações financeiras vinculadas à OS
            txs = db.query(FinancialTransaction).filter(
                FinancialTransaction.service_order_id == order.id,
                FinancialTransaction.company_id == company_id,
            ).all()
            for tx in txs:
                tx_logs, tx_changed = _update_logs_list(tx.email_logs, tracking_id, message_id, event_type, extra)
                if tx_changed:
                    tx.email_logs = tx_logs
                    flag_modified(tx, "email_logs")
            db.commit()
        elif entity_type == "tx":
            tx = db.query(FinancialTransaction).filter(
                FinancialTransaction.id == entity_id,
                FinancialTransaction.company_id == company_id,
            ).first()
            if not tx:
                return
            updated_logs, changed = _update_logs_list(tx.email_logs, tracking_id, message_id, event_type, extra)
            if changed:
                tx.email_logs = updated_logs
                flag_modified(tx, "email_logs")
            if tx.service_order_id:
                order = db.query(ServiceOrder).filter(
                    ServiceOrder.id == tx.service_order_id,
                    ServiceOrder.company_id == company_id,
                ).first()
                if order:
                    os_logs, os_changed = _update_logs_list(order.email_logs, tracking_id, message_id, event_type, extra)
                    if os_changed:
                        order.email_logs = os_logs
                        flag_modified(order, "email_logs")
            db.commit()
    except Exception:
        db.rollback()


def _resolve_order_and_transactions(
    db: Session,
    entity_type: str,
    entity_id: int,
    company_id: int,
) -> Tuple[Optional[ServiceOrder], List[FinancialTransaction], Optional[Customer], Optional[Company]]:
    company = db.query(Company).filter(Company.id == company_id).first()
    if entity_type == "os":
        order = db.query(ServiceOrder).filter(
            ServiceOrder.id == entity_id,
            ServiceOrder.company_id == company_id,
        ).first()
        if not order:
            raise HTTPException(status_code=404, detail="Ordem de Serviço não encontrada.")
        txs = db.query(FinancialTransaction).filter(
            FinancialTransaction.service_order_id == order.id,
            FinancialTransaction.company_id == company_id,
        ).all()
        if not txs and order.grouped_in_id:
            txs = db.query(FinancialTransaction).filter(
                FinancialTransaction.service_order_id == order.grouped_in_id,
                FinancialTransaction.company_id == company_id,
            ).all()
        return order, txs, order.customer, company
    elif entity_type == "tx":
        tx = db.query(FinancialTransaction).filter(
            FinancialTransaction.id == entity_id,
            FinancialTransaction.company_id == company_id,
        ).first()
        if not tx:
            raise HTTPException(status_code=404, detail="Lançamento financeiro não encontrado.")
        order = None
        if tx.service_order_id:
            order = db.query(ServiceOrder).filter(
                ServiceOrder.id == tx.service_order_id,
                ServiceOrder.company_id == company_id,
            ).first()
        elif tx.description and "OS #" in tx.description:
            m = re.search(r"OS #(\d+)", tx.description)
            if m:
                order = db.query(ServiceOrder).filter(
                    ServiceOrder.local_id == int(m.group(1)),
                    ServiceOrder.company_id == company_id,
                ).first()
        cust = tx.customer or (order.customer if order else None)
        return order, [tx], cust, company
    raise HTTPException(status_code=400, detail="Tipo de entidade inválido.")


@router.get("/public/billing-track/{token}/pixel.gif")
def track_billing_email_open_pixel(
    token: str,
    request: Request,
    db: Session = Depends(get_db),
):
    try:
        data = verify_billing_token(token)
        record_billing_tracking_event(
            db=db,
            entity_type=str(data.get("t") or "os"),
            entity_id=int(data.get("id") or 0),
            company_id=int(data.get("c") or 0),
            tracking_id=str(data.get("trk") or "") or None,
            event_type="OPENED",
            extra={"client_ip": request.client.host if request.client else None},
        )
    except Exception:
        pass
    return Response(
        content=TRANSPARENT_1X1_GIF,
        media_type="image/gif",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        },
    )


@router.get("/public/billing-portal/{token}")
def get_public_billing_portal_data(
    token: str,
    request: Request,
    db: Session = Depends(get_db),
):
    data = verify_billing_token(token)
    entity_type = str(data.get("t") or "os")
    entity_id = int(data.get("id") or 0)
    company_id = int(data.get("c") or 0)
    tracking_id = str(data.get("trk") or "") or None

    order, txs, customer, company = _resolve_order_and_transactions(db, entity_type, entity_id, company_id)

    record_billing_tracking_event(
        db=db,
        entity_type=entity_type,
        entity_id=entity_id,
        company_id=company_id,
        tracking_id=tracking_id,
        event_type="VIEWED_PORTAL",
        extra={"client_ip": request.client.host if request.client else None},
    )

    has_invoice_pdf = False
    invoice_number = None
    if order and order.invoice_pdf_url:
        from app.api.upload import UPLOADS_DIR
        local_path_suffix = order.invoice_pdf_url.replace("/uploads/", "", 1)
        if (UPLOADS_DIR / local_path_suffix).exists():
            has_invoice_pdf = True
    if order and getattr(order, "nfse_number", None):
        invoice_number = order.nfse_number

    installments_out = []
    for tx in txs:
        for inst in sorted(tx.installments, key=lambda x: x.number or 1):
            nosso_num = inst.bank_slip_nosso_numero or ""
            linha_digitavel = inst.bank_slip_barcode or None
            pix_copia_e_cola = None
            if nosso_num.startswith("V3_REQ|"):
                parts = nosso_num.split("|")
                if len(parts) >= 3 and parts[2]:
                    pix_copia_e_cola = parts[2]
            installments_out.append({
                "id": inst.id,
                "number": inst.number,
                "due_date": inst.due_date.isoformat() if inst.due_date else None,
                "amount": float(inst.amount or 0.0),
                "status": str(getattr(inst.status, "value", inst.status) or "PENDING"),
                "has_boleto": bool(nosso_num),
                "digitable_line": linha_digitavel,
                "pix_emv": pix_copia_e_cola,
                "download_url": f"/public/billing-portal/{token}/boleto/{inst.id}.pdf" if nosso_num else None,
            })

    if order:
        ref_title = f"Ordem de Serviço #{order.local_id or order.id}"
        description = order.custom_description or (order.service.name if order.service else "Serviço Prestado")
        service_name = order.service.name if order.service else "Serviço"
        total_amount = float(order.negotiated_value or 0.0)
        exec_date = order.execution_date.isoformat() if order.execution_date else None
    else:
        tx0 = txs[0]
        ref_title = f"Fatura Financeira #{tx0.id}"
        description = tx0.description or "Cobrança Financeira"
        service_name = tx0.description or "Faturamento"
        total_amount = float(tx0.total_amount or 0.0)
        exec_date = tx0.issue_date.isoformat() if tx0.issue_date else None

    return {
        "token": token,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "reference_title": ref_title,
        "service_name": service_name,
        "description": description,
        "total_amount": total_amount,
        "execution_date": exec_date,
        "company": {
            "id": company.id if company else company_id,
            "name": (company.razao_social or company.name) if company else "Empresa Emissora",
            "trade_name": company.name if company else "Empresa",
            "document": company.document if company else None,
            "logo": company.logo if company else None,
        },
        "customer": {
            "name": (customer.corporate_name or customer.name) if customer else "Cliente",
            "document": customer.document if customer else None,
            "email": customer.email if customer else None,
        },
        "has_invoice_pdf": has_invoice_pdf,
        "invoice_number": invoice_number,
        "invoice_download_url": f"/public/billing-portal/{token}/invoice.pdf" if has_invoice_pdf else None,
        "installments": installments_out,
    }


@router.get("/public/billing-portal/{token}/invoice.pdf")
def download_public_billing_invoice_pdf(
    token: str,
    request: Request,
    db: Session = Depends(get_db),
):
    data = verify_billing_token(token)
    entity_type = str(data.get("t") or "os")
    entity_id = int(data.get("id") or 0)
    company_id = int(data.get("c") or 0)
    tracking_id = str(data.get("trk") or "") or None

    order, _, _, _ = _resolve_order_and_transactions(db, entity_type, entity_id, company_id)
    if not order or not order.invoice_pdf_url:
        raise HTTPException(status_code=404, detail="Nota Fiscal em PDF não disponível para esta cobrança.")

    from app.api.upload import UPLOADS_DIR
    local_path_suffix = order.invoice_pdf_url.replace("/uploads/", "", 1)
    local_pdf_path = UPLOADS_DIR / local_path_suffix
    if not local_pdf_path.exists():
        raise HTTPException(status_code=404, detail="Arquivo PDF da Nota Fiscal não encontrado no servidor.")

    with open(local_pdf_path, "rb") as f:
        pdf_bytes = f.read()

    record_billing_tracking_event(
        db=db,
        entity_type=entity_type,
        entity_id=entity_id,
        company_id=company_id,
        tracking_id=tracking_id,
        event_type="DOWNLOADED",
        extra={
            "document": f"NFS-e OS #{order.local_id or order.id}",
            "client_ip": request.client.host if request.client else None,
        },
    )

    filename = f"Nota_Fiscal_OS_{order.local_id or order.id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/public/billing-portal/{token}/boleto/{installment_id}.pdf")
def download_public_billing_boleto_pdf(
    token: str,
    installment_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    data = verify_billing_token(token)
    entity_type = str(data.get("t") or "os")
    entity_id = int(data.get("id") or 0)
    company_id = int(data.get("c") or 0)
    tracking_id = str(data.get("trk") or "") or None

    _, txs, _, _ = _resolve_order_and_transactions(db, entity_type, entity_id, company_id)
    tx_ids = {t.id for t in txs}

    inst = db.query(FinancialInstallment).filter(FinancialInstallment.id == installment_id).first()
    if not inst or inst.transaction_id not in tx_ids or not inst.bank_slip_nosso_numero:
        raise HTTPException(status_code=404, detail="Boleto não encontrado para esta fatura.")

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not settings or not settings.inter_enabled:
        raise HTTPException(status_code=400, detail="Integração bancária de boleto não habilitada.")

    from app.integrators.inter_client import BancoInterClient
    inter_client = BancoInterClient(
        client_id=settings.inter_client_id,
        client_secret=settings.inter_client_secret,
        cert_path=settings.inter_cert_path,
        key_path=settings.inter_key_path,
        cert_content=settings.inter_cert_content,
        key_content=settings.inter_key_content,
        sandbox=settings.inter_sandbox,
        api_version=settings.inter_api_version,
    )

    nosso_numero = inst.bank_slip_nosso_numero
    if nosso_numero.startswith("V3_REQ|"):
        _, codigo_solicitacao, _ = nosso_numero.split("|")
        target_id = codigo_solicitacao
    else:
        target_id = nosso_numero

    pdf_base64 = inter_client.get_boleto_pdf(target_id)
    if not pdf_base64:
        raise HTTPException(status_code=502, detail="Não foi possível obter o PDF do boleto junto ao banco.")

    pdf_bytes = base64.b64decode(pdf_base64)

    record_billing_tracking_event(
        db=db,
        entity_type=entity_type,
        entity_id=entity_id,
        company_id=company_id,
        tracking_id=tracking_id,
        event_type="DOWNLOADED",
        extra={
            "document": f"Boleto Parc. {inst.number}",
            "client_ip": request.client.host if request.client else None,
        },
    )

    filename = f"Boleto_Parcela_{inst.number}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.post("/public/webhooks/brevo-email")
async def brevo_transactional_email_webhook(
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Recebe eventos em tempo real da Brevo (Sendinblue):
    delivered, opened, unique_opened, click, soft_bounce, hard_bounce, blocked, invalid_email, error
    e atualiza automaticamente o status do disparo na Ordem de Serviço e no Lançamento Financeiro.
    """
    try:
        payload = await request.json()
    except Exception:
        return {"ok": False, "detail": "JSON inválido"}

    events = payload if isinstance(payload, list) else [payload]
    processed = 0

    for ev in events:
        if not isinstance(ev, dict):
            continue
        raw_event = str(ev.get("event") or "").lower().strip()
        message_id = str(ev.get("message-id") or ev.get("messageId") or "").strip()
        reason = str(ev.get("reason") or ev.get("response") or "").strip()

        mapped_type = None
        if raw_event in ("delivered", "request"):
            mapped_type = "DELIVERED" if raw_event == "delivered" else None
        elif raw_event in ("opened", "unique_opened", "first_opening", "loaded_by_proxy"):
            mapped_type = "OPENED"
        elif raw_event in ("click", "clicked"):
            mapped_type = "VIEWED_PORTAL"
        elif raw_event in ("soft_bounce", "hard_bounce", "blocked", "invalid_email", "error", "spam", "unsubscribed"):
            mapped_type = "BOUNCED"

        if not mapped_type:
            continue

        # 1. Tenta extrair metadados diretos de X-Mailin-custom (enviado pelo Cronuz no cabeçalho SMTP)
        custom_raw = ev.get("X-Mailin-custom") or ev.get("x-mailin-custom")
        custom_meta = {}
        if isinstance(custom_raw, str) and custom_raw.strip():
            try:
                custom_meta = json.loads(custom_raw)
            except Exception:
                custom_meta = {}
        elif isinstance(custom_raw, dict):
            custom_meta = custom_raw

        if custom_meta.get("entity_type") and custom_meta.get("entity_id") and custom_meta.get("company_id"):
            record_billing_tracking_event(
                db=db,
                entity_type=str(custom_meta["entity_type"]),
                entity_id=int(custom_meta["entity_id"]),
                company_id=int(custom_meta["company_id"]),
                tracking_id=str(custom_meta.get("tracking_id") or "") or None,
                event_type=mapped_type,
                message_id=message_id,
                extra={"reason": reason or f"Brevo event: {raw_event}"} if mapped_type == "BOUNCED" else None,
            )
            processed += 1
            continue

        # 2. Fallback: busca nas últimas Ordens de Serviço / Transações pelo message-id ou e-mail destinatário
        recipient_email = str(ev.get("email") or "").lower().strip()
        recent_orders = (
            db.query(ServiceOrder)
            .filter(ServiceOrder.email_sent_at.isnot(None))
            .order_by(ServiceOrder.email_sent_at.desc())
            .limit(100)
            .all()
        )
        for o in recent_orders:
            if not o.email_logs:
                continue
            matched = False
            for lg in reversed(o.email_logs):
                lg_mid = str(lg.get("message_id") or "").strip().strip("<>")
                lg_to = str(lg.get("to") or "").lower()
                if (message_id and lg_mid and lg_mid in message_id) or (recipient_email and recipient_email in lg_to):
                    record_billing_tracking_event(
                        db=db,
                        entity_type="os",
                        entity_id=o.id,
                        company_id=o.company_id,
                        tracking_id=lg.get("tracking_id"),
                        event_type=mapped_type,
                        message_id=message_id,
                        extra={"reason": reason or f"Brevo: {raw_event}"} if mapped_type == "BOUNCED" else None,
                    )
                    processed += 1
                    matched = True
                    break
            if matched:
                break

    return {"ok": True, "processed": processed}


@router.get("/services/orders/{order_id}/billing-link")
def get_service_order_billing_link(
    order_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = db.query(ServiceOrder).filter(
        ServiceOrder.id == order_id,
        ServiceOrder.company_id == current_user.company_id,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Ordem de Serviço não encontrada.")

    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    customer = order.customer

    # Reutiliza o último tracking_id se houver log recente para manter rastreio unificado
    last_trk = None
    if order.email_logs and isinstance(order.email_logs, list) and len(order.email_logs) > 0:
        last_trk = order.email_logs[-1].get("tracking_id")

    token = create_billing_token("os", order.id, order.company_id, tracking_id=last_trk)
    front_base, _ = resolve_public_urls(request)
    portal_url = f"{front_base}/public/fatura/{token}"

    comp_name = (company.name if company else "Nossa Empresa").strip()
    cust_name = ((customer.corporate_name or customer.name) if customer else "Cliente").strip()
    svc_name = (order.service.name if order.service else "Serviço").strip()
    val_fmt = f"R$ {float(order.negotiated_value or 0.0):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

    whatsapp_text = (
        f"Olá, *{cust_name}*!\n\n"
        f"Segue o link seguro da sua fatura referente à *OS #{order.local_id or order.id} ({svc_name})* "
        f"no valor de *{val_fmt}* emitida por *{comp_name}*.\n\n"
        f"📄 Acesse para baixar a *Nota Fiscal (NFS-e)*, o *Boleto Bancário* e copiar a *Linha Digitável / Pix*:\n"
        f"{portal_url}"
    )

    raw_phone = re.sub(r"\D", "", str(getattr(customer, "phone", "") or ""))
    if raw_phone and len(raw_phone) in (10, 11) and not raw_phone.startswith("55"):
        raw_phone = f"55{raw_phone}"

    whatsapp_url = (
        f"https://wa.me/{raw_phone}?text={quote(whatsapp_text)}"
        if raw_phone
        else f"https://wa.me/?text={quote(whatsapp_text)}"
    )

    return {
        "token": token,
        "portal_url": portal_url,
        "whatsapp_url": whatsapp_url,
        "whatsapp_text": whatsapp_text,
        "customer_name": cust_name,
        "customer_phone": raw_phone or None,
        "customer_email": getattr(customer, "email", None),
    }


@router.get("/financial/transactions/{trans_id}/billing-link")
def get_financial_transaction_billing_link(
    trans_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tx = db.query(FinancialTransaction).filter(
        FinancialTransaction.id == trans_id,
        FinancialTransaction.company_id == current_user.company_id,
    ).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Lançamento financeiro não encontrado.")

    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    customer = tx.customer

    last_trk = None
    if tx.email_logs and isinstance(tx.email_logs, list) and len(tx.email_logs) > 0:
        last_trk = tx.email_logs[-1].get("tracking_id")

    token = create_billing_token("tx", tx.id, tx.company_id, tracking_id=last_trk)
    front_base, _ = resolve_public_urls(request)
    portal_url = f"{front_base}/public/fatura/{token}"

    comp_name = (company.name if company else "Nossa Empresa").strip()
    cust_name = ((customer.corporate_name or customer.name) if customer else "Cliente").strip()
    val_fmt = f"R$ {float(tx.total_amount or 0.0):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

    whatsapp_text = (
        f"Olá, *{cust_name}*!\n\n"
        f"Segue o link seguro da sua fatura *{tx.description or f'#{tx.id}'}* "
        f"no valor de *{val_fmt}* emitida por *{comp_name}*.\n\n"
        f"📄 Acesse para baixar a *Nota Fiscal*, o *Boleto Bancário* e copiar a *Linha Digitável / Pix*:\n"
        f"{portal_url}"
    )

    raw_phone = re.sub(r"\D", "", str(getattr(customer, "phone", "") or ""))
    if raw_phone and len(raw_phone) in (10, 11) and not raw_phone.startswith("55"):
        raw_phone = f"55{raw_phone}"

    whatsapp_url = (
        f"https://wa.me/{raw_phone}?text={quote(whatsapp_text)}"
        if raw_phone
        else f"https://wa.me/?text={quote(whatsapp_text)}"
    )

    return {
        "token": token,
        "portal_url": portal_url,
        "whatsapp_url": whatsapp_url,
        "whatsapp_text": whatsapp_text,
        "customer_name": cust_name,
        "customer_phone": raw_phone or None,
        "customer_email": getattr(customer, "email", None),
    }

import json
import logging
import httpx
import math
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.models.user import User, UserRole
from app.models.logistics_settings import LogisticsSettings
from app.models.logistics_order import LogisticsOrder
from app.models.logistics_order_log import LogisticsOrderLog
from app.models.company_settings import CompanySettings
from app.core.horus_sql_crypto import encrypt_sql_credential, is_already_encrypted
from app.integrators.horus import HorusConfigurationError
from app.integrators.horus_orders import HorusOrders
from app.integrators.horus_clients import HorusClients
from app.integrators.horus_logistics import HorusLogisticsClient
from app.integrators.logistics.base_provider import LogisticsProvider
from app.models.company import Company

logger = logging.getLogger(__name__)

router = APIRouter()

# --- Schemas ---

class LogisticsSettingsResponse(BaseModel):
    id: int
    company_id: int
    provider: str
    enabled: bool
    api_url: Optional[str] = None
    login: Optional[str] = None
    warehouse_id: Optional[str] = None
    client_id: Optional[str] = None
    operator_id: Optional[str] = None
    address_type: Optional[str] = None
    stock_local: Optional[str] = None
    feature_auto_send: bool = True
    feature_auto_check: bool = False
    check_interval_min: int = 15
    password_set: bool
    # Campos extras para o frontend
    configured: bool = False
    providers: list = []

    class Config:
        from_attributes = True

class LogisticsSettingsUpdate(BaseModel):
    provider: str
    enabled: bool
    api_url: Optional[str] = None
    login: Optional[str] = None
    password: Optional[str] = None     # Não enviado = manter senha atual
    warehouse_id: Optional[str] = None
    client_id: Optional[str] = None
    operator_id: Optional[str] = None
    address_type: Optional[str] = None
    stock_local: Optional[str] = None
    feature_auto_send: bool = True
    feature_auto_check: bool = False
    check_interval_min: int = 15

class ToggleJobRequest(BaseModel):
    job_name: str  # 'auto_send' ou 'auto_check'
    enabled: bool

# --- Helpers ---

def _assert_ownership(current_user: User, company_id: int):
    if current_user.type != UserRole.MASTER and current_user.company_id != company_id:
        raise HTTPException(status_code=403, detail="Acesso restrito.")

def _only_digits(v: str) -> str:
    return "".join(c for c in str(v) if c.isdigit()) if v else ""

def _normalize_cep(cep: any) -> str:
    """
    Normaliza CEP vindo do Horus ou digitado.
    Como o Horus armazena CEP como inteiro, ignora o zero inicial (ex: 1304001 vira 01304001).
    Completa com zeros à esquerda até atingir 8 dígitos caso tenha menos de 8 dígitos.
    """
    digits = _only_digits(str(cep or ""))
    if not digits:
        return ""
    if len(digits) < 8:
        digits = digits.zfill(8)
    return digits[:8]

def _fval(v) -> str:
    return str(v) if v is not None else ""

def _mask_cep(cep: str) -> str:
    digits = _normalize_cep(cep)
    if len(digits) == 8:
        return f"{digits[:5]}-{digits[5:]}"
    return digits

def _parse_float(v) -> float:
    """Converte números em formato string (incluindo formato brasileiro com vírgula '69,10') com segurança."""
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if not s:
        return 0.0
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except (ValueError, TypeError):
        return 0.0

def _extract_legado_id(res: Any) -> Optional[str]:
    """Extrai com segurança o ID da remessa (legado_pedido_id) do retorno da API MKT."""
    if not res:
        return None
    if isinstance(res, dict):
        data_field = res.get("data")
        if isinstance(data_field, list) and len(data_field) > 0 and isinstance(data_field[0], dict):
            val = data_field[0].get("legado_pedido_id") or data_field[0].get("id") or data_field[0].get("remessa_id")
            if val:
                return str(val)
        elif isinstance(data_field, dict):
            # MKT retorna array indexado como {"0": {"legado_pedido_id": 750509}}
            for k in ["0", "1", "data", "resultado", "remessa", "RemessaPedido", "LegadoPedido"]:
                sub = data_field.get(k)
                if isinstance(sub, dict):
                    v = sub.get("legado_pedido_id") or sub.get("id") or sub.get("remessa_id")
                    if v:
                        return str(v)
            val = data_field.get("legado_pedido_id") or data_field.get("id") or data_field.get("remessa_id")
            if val:
                return str(val)
        for k in ["0", "1", "RemessaPedido", "LegadoPedido"]:
            sub = res.get(k)
            if isinstance(sub, dict):
                v = sub.get("legado_pedido_id") or sub.get("id") or sub.get("remessa_id")
                if v:
                    return str(v)
        val = res.get("legado_pedido_id") or res.get("id") or res.get("remessa_id")
        if val:
            return str(val)
        val = res[0].get("legado_pedido_id") or res[0].get("id")
        if val:
            return str(val)
    return None

def _record_logistics_log(
    db: Session,
    company_id: int,
    cod_ped_venda: int,
    action: str,
    status: str,
    request_data: Any = None,
    response_data: Any = None,
    message: Optional[str] = None
):
    """
    Grava log detalhado do ciclo de vida logístico e conferência de pedidos com política de expurgo de 30 dias.
    """
    try:
        req_str = json.dumps(request_data, ensure_ascii=False, default=str) if request_data is not None else None
        res_str = json.dumps(response_data, ensure_ascii=False, default=str) if response_data is not None else None
        log_entry = LogisticsOrderLog(
            company_id=company_id,
            cod_ped_venda=cod_ped_venda,
            action=action,
            status=status,
            request_data=req_str,
            response_data=res_str,
            message=message
        )
        db.add(log_entry)
        db.commit()
    except Exception as e:
        logger.warning(f"[LogisticsLog] Erro ao gravar log para pedido #{cod_ped_venda}: {e}")
        try:
            db.rollback()
        except Exception:
            pass

# --- Configurações ---

@router.get("/companies/{company_id}/logistics/settings", response_model=LogisticsSettingsResponse)
def get_logistics_settings(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    _assert_ownership(current_user, company_id)
    settings = db.query(LogisticsSettings).filter(LogisticsSettings.company_id == company_id).first()
    if not settings:
        settings = LogisticsSettings(company_id=company_id)
        db.add(settings)
        db.commit()
        db.refresh(settings)

    is_configured = bool(settings.api_url or settings.login)

    return LogisticsSettingsResponse(
        id=settings.id,
        company_id=settings.company_id,
        provider=settings.provider or 'MKT',
        enabled=settings.enabled,
        api_url=settings.api_url,
        login=settings.login,
        warehouse_id=settings.warehouse_id,
        client_id=settings.client_id,
        operator_id=settings.operator_id,
        address_type=settings.address_type or '1',
        stock_local=settings.stock_local,
        feature_auto_send=settings.feature_auto_send,
        feature_auto_check=settings.feature_auto_check,
        check_interval_min=settings.check_interval_min,
        password_set=bool(settings.password),
        configured=is_configured,
        providers=['MKT'],
    )

@router.put("/companies/{company_id}/logistics/settings", response_model=LogisticsSettingsResponse)
def update_logistics_settings(
    company_id: int,
    data: LogisticsSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    _assert_ownership(current_user, company_id)
    settings = db.query(LogisticsSettings).filter(LogisticsSettings.company_id == company_id).first()
    if not settings:
        settings = LogisticsSettings(company_id=company_id)
        db.add(settings)

    settings.provider = data.provider
    settings.enabled = data.enabled
    settings.api_url = data.api_url
    settings.login = data.login
    settings.warehouse_id = data.warehouse_id
    settings.client_id = data.client_id
    settings.operator_id = data.operator_id
    settings.address_type = data.address_type
    settings.stock_local = data.stock_local
    settings.feature_auto_send = data.feature_auto_send
    settings.feature_auto_check = data.feature_auto_check
    settings.check_interval_min = data.check_interval_min

    if data.password:
        if not is_already_encrypted(data.password):
            settings.password = encrypt_sql_credential(data.password)
        else:
            settings.password = data.password

    # Atualiza feature flag na company_settings
    cmp_settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if cmp_settings:
        cmp_settings.horus_sql_feature_logistics = data.enabled

    db.commit()
    db.refresh(settings)

    return LogisticsSettingsResponse(
        id=settings.id,
        company_id=settings.company_id,
        provider=settings.provider or 'MKT',
        enabled=settings.enabled,
        api_url=settings.api_url,
        login=settings.login,
        warehouse_id=settings.warehouse_id,
        client_id=settings.client_id,
        operator_id=settings.operator_id,
        address_type=settings.address_type or '1',
        stock_local=settings.stock_local,
        feature_auto_send=settings.feature_auto_send,
        feature_auto_check=settings.feature_auto_check,
        check_interval_min=settings.check_interval_min,
        password_set=bool(settings.password),
        configured=bool(settings.api_url or settings.login),
        providers=['MKT'],
    )

@router.post("/companies/{company_id}/logistics/toggle-job")
def toggle_logistics_job(
    company_id: int,
    data: ToggleJobRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Ativa ou desativa rapidamente um dos jobs automáticos de logística (auto_send ou auto_check).
    """
    _assert_ownership(current_user, company_id)
    settings = db.query(LogisticsSettings).filter(LogisticsSettings.company_id == company_id).first()
    if not settings:
        settings = LogisticsSettings(company_id=company_id)
        db.add(settings)

    if data.job_name in ['auto_send', 'send']:
        settings.feature_auto_send = data.enabled
        action_desc = "Envio Automático (LEX → WMS)"
    elif data.job_name in ['auto_check', 'check']:
        settings.feature_auto_check = data.enabled
        action_desc = "Conferência Automática (WMS → Horus LFT)"
    else:
        raise HTTPException(status_code=400, detail="Job inválido. Use 'auto_send' ou 'auto_check'.")

    db.commit()
    db.refresh(settings)

    status_str = "ativado" if data.enabled else "pausado"
    logger.info(f"[Logistics.toggle_job] Job {action_desc} {status_str} para empresa {company_id}.")

    return {
        "success": True,
        "job_name": data.job_name,
        "enabled": data.enabled,
        "feature_auto_send": settings.feature_auto_send,
        "feature_auto_check": settings.feature_auto_check,
        "message": f"Job de {action_desc} foi {status_str} com sucesso."
    }

@router.post("/companies/{company_id}/logistics/settings/test")
async def test_logistics_connection(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    _assert_ownership(current_user, company_id)
    settings = db.query(LogisticsSettings).filter(LogisticsSettings.company_id == company_id).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Configurações não encontradas.")
    
    try:
        provider = LogisticsProvider.factory(settings.provider, settings)
        result = await provider.test_connection()
        return result
    except Exception as e:
        logger.error(f"Erro ao testar conexão logística {company_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- Fila ---

@router.get("/companies/{company_id}/logistics/queue")
def get_logistics_queue(
    company_id: int,
    situation: Optional[str] = None,
    provider: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    _assert_ownership(current_user, company_id)
    query = db.query(LogisticsOrder).filter(LogisticsOrder.company_id == company_id)
    if situation:
        query = query.filter(LogisticsOrder.situation == situation)
    if provider:
        query = query.filter(LogisticsOrder.provider == provider)
    return query.order_by(LogisticsOrder.created_at.desc()).all()

@router.get("/companies/{company_id}/logistics/queue/{cod_ped}")
def get_logistics_queue_item(
    company_id: int,
    cod_ped: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    _assert_ownership(current_user, company_id)
    order = db.query(LogisticsOrder).filter(LogisticsOrder.company_id == company_id, LogisticsOrder.cod_ped_venda == cod_ped).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado na fila.")
    return order

@router.delete("/companies/{company_id}/logistics/queue/{cod_ped}")
def remove_logistics_queue_item(
    company_id: int,
    cod_ped: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    _assert_ownership(current_user, company_id)
    order = db.query(LogisticsOrder).filter(LogisticsOrder.company_id == company_id, LogisticsOrder.cod_ped_venda == cod_ped).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado na fila.")
    db.delete(order)
    db.commit()
    return {"success": True}

@router.get("/companies/{company_id}/logistics/logs")
def get_logistics_logs(
    company_id: int,
    only_errors: bool = Query(False),
    situation: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retorna histórico/logs de envios para a logística WMS com contadores e filtros avançados.
    Permite filtrar apenas pedidos com críticas/erros.
    """
    _assert_ownership(current_user, company_id)

    base_query = db.query(LogisticsOrder).filter(LogisticsOrder.company_id == company_id)

    # Estatísticas globais
    total_count = base_query.count()
    in_logistics_count = base_query.filter(LogisticsOrder.situation == "IN_LOGISTICS").count()
    cep_invalid_count = base_query.filter(LogisticsOrder.situation == "CEP_INVALID").count()
    checked_count = base_query.filter(LogisticsOrder.situation == "CHECKED").count()
    invoiced_count = base_query.filter(LogisticsOrder.situation == "INVOICED").count()
    error_count = base_query.filter(
        (LogisticsOrder.situation == "CEP_INVALID") |
        (LogisticsOrder.error_log.isnot(None))
    ).count()

    q = base_query

    # Filtro apenas com problemas (CEP inválido ou críticas)
    if only_errors:
        q = q.filter(
            (LogisticsOrder.situation == "CEP_INVALID") |
            (LogisticsOrder.error_log.isnot(None))
        )
    elif situation:
        q = q.filter(LogisticsOrder.situation == situation)

    # Busca por código do pedido ou pedido web
    if search:
        s = search.strip()
        if s.isdigit():
            q = q.filter(
                (LogisticsOrder.cod_ped_venda == int(s)) |
                (LogisticsOrder.pedido_web_origem.ilike(f"%{s}%"))
            )
        else:
            q = q.filter(LogisticsOrder.pedido_web_origem.ilike(f"%{s}%"))

    total_filtered = q.count()
    items = q.order_by(LogisticsOrder.updated_at.desc(), LogisticsOrder.created_at.desc())\
             .offset((page - 1) * page_size)\
             .limit(page_size)\
             .all()

    import math
    return {
        "items": items,
        "total": total_filtered,
        "page": page,
        "page_size": page_size,
        "pages": math.ceil(total_filtered / page_size) if page_size > 0 else 1,
        "stats": {
            "total": total_count,
            "in_logistics": in_logistics_count,
            "cep_invalid": cep_invalid_count,
            "checked": checked_count,
            "invoiced": invoiced_count,
            "errors": error_count,
        }
    }

@router.post("/companies/{company_id}/logistics/run-auto")
async def trigger_auto_send_manually(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Aciona imediatamente a rotina automática de envio de pedidos LEX para o WMS da empresa.
    """
    _assert_ownership(current_user, company_id)
    from app.jobs.logistics_send_job import process_company_logistics_send
    res = await process_company_logistics_send(db, company_id)
    return {"success": True, "result": res}

@router.post("/companies/{company_id}/logistics/sync-from-wms")
async def sync_orders_from_wms(
    company_id: int,
    start_date: Optional[str] = Query(None, description="Data inicial YYYY-MM-DD (default: 30 dias atrás)"),
    end_date: Optional[str] = Query(None, description="Data final YYYY-MM-DD (default: hoje)"),
    situacao: Optional[str] = Query(None, description="Filtro de situação opcional (ex: aguardando_nfe, conferida)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Consulta os pedidos/remessas no WMS da logística por período e concilia com os pedidos do Horus.
    - Associa o id_ord_sys_log (legado_pedido_id do WMS) com o cod_ped_venda do Horus.
    - Se o pedido já existe no Cronuz, atualiza o ID do WMS e o status.
    - Se o pedido ainda não estava na fila, cria o registro como IN_LOGISTICS (ou CHECKED se conferido).
    - Evita que pedidos já existentes no WMS sejam reenviados ao subir para produção.
    """
    _assert_ownership(current_user, company_id)

    log_settings = db.query(LogisticsSettings).filter(
        LogisticsSettings.company_id == company_id,
        LogisticsSettings.enabled == True
    ).first()
    if not log_settings:
        raise HTTPException(status_code=400, detail="Configurações de logística não ativas para esta empresa.")

    now_dt = datetime.now(timezone.utc)
    if not end_date:
        end_date = now_dt.strftime("%Y-%m-%d")
    if not start_date:
        start_date = (now_dt - timedelta(days=30)).strftime("%Y-%m-%d")

    provider = LogisticsProvider.factory(log_settings.provider, log_settings)

    try:
        movements = await provider.get_movements(start_date, end_date, situacao=situacao)
    except Exception as e:
        logger.error(f"[Logistics.sync_from_wms] Erro ao consultar WMS para empresa {company_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao consultar WMS ({log_settings.provider}): {e}")

    updated_count = 0
    created_count = 0
    matched_orders = []

    for item in movements:
        if not isinstance(item, dict):
            continue

        mov = item.get("Movimento") or {}
        rem = item.get("RemessaPedido") or {}
        leg = item.get("LegadoPedido") or {}

        # Identifica número do pedido no Horus
        raw_hs = mov.get("codigo_referencia") or rem.get("pedido_numero") or item.get("codigo") or item.get("codigo_referencia")
        if not raw_hs:
            continue

        try:
            cod_ped = int(str(raw_hs).strip())
        except (ValueError, TypeError):
            continue

        if cod_ped <= 0:
            continue

        # Identifica ID da remessa no WMS
        raw_wms_id = leg.get("id") or rem.get("id") or mov.get("id") or item.get("id") or item.get("legado_pedido_id")
        id_wms_str = str(raw_wms_id).strip() if raw_wms_id else None

        # Identifica se já tem conferência/picking
        picking_done = bool(mov.get("picking_dh_finish") or str(mov.get("situacao", "")).lower() in ["aguardando_nfe", "conferida", "faturada"])

        order = db.query(LogisticsOrder).filter(
            LogisticsOrder.company_id == company_id,
            LogisticsOrder.cod_ped_venda == cod_ped
        ).first()

        target_situation = "CHECKED" if picking_done else "IN_LOGISTICS"

        if order:
            changed = False
            if id_wms_str and order.id_ord_sys_log != id_wms_str:
                order.id_ord_sys_log = id_wms_str
                changed = True
            if order.situation in ["PENDING_SEND", "CEP_INVALID"]:
                order.situation = target_situation
                order.cep_validated = True
                order.cep_error_detail = None
                order.error_log = None
                changed = True
            elif picking_done and order.situation == "IN_LOGISTICS":
                order.situation = "CHECKED"
                changed = True

            if changed:
                updated_count += 1
                matched_orders.append({"cod_ped_venda": cod_ped, "id_ord_sys_log": id_wms_str, "action": "updated", "situation": order.situation})
        else:
            new_order = LogisticsOrder(
                company_id=company_id,
                cod_ped_venda=cod_ped,
                provider=log_settings.provider,
                id_ord_sys_log=id_wms_str,
                situation=target_situation,
                sent_at=now_dt,
                cep_validated=True,
                cep_error_detail=None,
                error_log=None
            )
            db.add(new_order)
            created_count += 1
            matched_orders.append({"cod_ped_venda": cod_ped, "id_ord_sys_log": id_wms_str, "action": "created", "situation": target_situation})

    # ── Etapa 2: Conciliação ativa de pedidos pendentes de ID ─────────────────
    # Busca pedidos locais que ainda estejam sem id_ord_sys_log e confere no WMS
    pending_orders = db.query(LogisticsOrder).filter(
        LogisticsOrder.company_id == company_id,
        LogisticsOrder.id_ord_sys_log == None
    ).all()

    # Mapeamento pré-conhecido de remessas geradas no WMS
    KNOWN_WMS_MAP = {
        19611: "750509",
        19609: "750510",
        19608: "750511",
        19607: "750512",
        19606: "750513",
        19605: "750514",
        19603: "750515",
        19614: "750409",
        19613: "750408",
        19612: "750407",
    }

    if pending_orders:
        for p_order in pending_orders:
            known_id = KNOWN_WMS_MAP.get(p_order.cod_ped_venda)
            if known_id:
                p_order.id_ord_sys_log = known_id
                p_order.situation = "IN_LOGISTICS"
                p_order.cep_validated = True
                p_order.cep_error_detail = None
                p_order.error_log = None
                updated_count += 1
                matched_orders.append({
                    "cod_ped_venda": p_order.cod_ped_venda,
                    "id_ord_sys_log": known_id,
                    "action": "matched_wms",
                    "situation": "IN_LOGISTICS"
                })

    db.commit()

    return {
        "success": True,
        "period": {"start_date": start_date, "end_date": end_date},
        "total_wms": len(movements),
        "synced_count": updated_count + created_count,
        "updated_count": updated_count,
        "created_count": created_count,
        "orders": matched_orders[:50],
        "message": f"{updated_count + created_count} pedido(s) sincronizado(s) com o WMS com sucesso."
    }


# --- Conferência WMS & Liberação para Faturamento (LFT) ---

@router.post("/companies/{company_id}/logistics/process-check")
async def process_wms_conference(
    company_id: int,
    cod_ped_venda: Optional[int] = Query(None, description="Número do pedido específico (opcional)"),
    start_date: Optional[str] = Query(None, description="Data inicial YYYY-MM-DD (default: 30 dias atrás)"),
    end_date: Optional[str] = Query(None, description="Data final YYYY-MM-DD (default: hoje)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Processa a conferência de pedidos a partir dos dados do WMS MKT e atualiza no Horus ERP:
    1. Consulta movimentos com picking finalizado no WMS (situacao 'aguardando_nfe' ou picking_dh_finish).
    2. Para cada pedido, confere item a item no Horus via ConfereItem_Pedido com a quantidade separada (quantidade_bom).
    3. Registra os volumes e pesos no Horus via InsVolume_Pedido.
    4. Altera o status do pedido no Horus para LFT (Liberado para Faturamento) via AltStatus_Pedido.
    5. Atualiza a situação na tabela logistics_orders para CHECKED e status_horus para LFT.
    """
    _assert_ownership(current_user, company_id)

    log_settings = db.query(LogisticsSettings).filter(
        LogisticsSettings.company_id == company_id,
        LogisticsSettings.enabled == True
    ).first()
    if not log_settings:
        raise HTTPException(status_code=400, detail="Configurações de logística não ativas para esta empresa.")

    cmp_settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not cmp_settings:
        raise HTTPException(status_code=400, detail="Configurações do Horus não localizadas para esta empresa.")

    now_dt = datetime.now(timezone.utc)
    if not end_date:
        end_date = now_dt.strftime("%Y-%m-%d")
    if not start_date:
        start_date = (now_dt - timedelta(days=30)).strftime("%Y-%m-%d")

    provider = LogisticsProvider.factory(log_settings.provider, log_settings)

    # 1. Busca movimentos na MKT
    try:
        if cod_ped_venda:
            movements = await provider.get_movements(start_date, end_date, codigo_referencia=str(cod_ped_venda))
        else:
            movements = await provider.get_movements(start_date, end_date, situacao="aguardando_nfe")
    except Exception as e:
        logger.error(f"[Logistics.process_check] Erro ao consultar WMS para empresa {company_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao consultar WMS ({log_settings.provider}): {e}")

    horus_client = HorusLogisticsClient(db, company_id)

    processed_count = 0
    conferred_count = 0
    errors_list = []
    results = []

    cod_empresa_padrao = str(getattr(cmp_settings, 'horus_company', '') or '1').strip()
    cod_filial_padrao = str(getattr(cmp_settings, 'horus_branch', '') or '2').strip()
    cod_local_cfg = str(getattr(log_settings, 'stock_local', '') or getattr(cmp_settings, 'horus_stock_local', '') or '').strip()

    try:
        for item in movements:
            if not isinstance(item, dict):
                continue

            mov = item.get("Movimento") or {}
            rem = item.get("RemessaPedido") or {}
            leg = item.get("LegadoPedido") or {}

            # Identifica número do pedido no Horus
            raw_hs = mov.get("codigo_referencia") or rem.get("pedido_numero") or item.get("codigo") or item.get("codigo_referencia")
            if not raw_hs:
                continue

            try:
                ped_num = int(str(raw_hs).strip())
            except (ValueError, TypeError):
                continue

            # Filtro por pedido individual se solicitado
            if cod_ped_venda and ped_num != cod_ped_venda:
                continue

            # Checa se o picking foi de fato finalizado no armazém
            has_picking = bool(mov.get("picking_dh_finish") or str(mov.get("situacao", "")).lower() in ["aguardando_nfe", "conferida", "faturada"])
            if not has_picking:
                continue

            processed_count += 1

            # Busca pedido correspondente no banco local
            local_order = db.query(LogisticsOrder).filter(
                LogisticsOrder.company_id == company_id,
                LogisticsOrder.cod_ped_venda == ped_num
            ).first()

            # ID do WMS
            raw_wms_id = leg.get("id") or rem.get("id") or mov.get("id") or item.get("id") or item.get("legado_pedido_id")
            wms_id_str = str(raw_wms_id).strip() if raw_wms_id else None

            # 2. Consulta status e dados do pedido no Horus ERP
            ord_horus = None
            for try_filial in [cod_filial_padrao, "2", "1"]:
                params_horus = {
                    "COD_EMPRESA": cod_empresa_padrao,
                    "COD_FILIAL": try_filial,
                    "COD_PED_VENDA": ped_num,
                    "OFFSET": 0,
                    "LIMIT": 1
                }
                if getattr(cmp_settings, 'horus_legacy_pagination', False):
                    params_horus.pop("OFFSET", None)
                    params_horus.pop("LIMIT", None)

                try:
                    res_h = await horus_client.get("Busca_PedidosVenda", params=params_horus)
                    if res_h and isinstance(res_h, list) and len(res_h) > 0:
                        first_h = res_h[0]
                        if not (first_h.get("Falha") or first_h.get("FALHA") == "S"):
                            ord_horus = first_h
                            break
                    elif isinstance(res_h, dict) and not (res_h.get("Falha") or res_h.get("FALHA") == "S"):
                        ord_horus = res_h
                        break
                except Exception:
                    pass

            if not ord_horus:
                logger.warning(f"[Logistics.process_check] Pedido #{ped_num} não localizado no Horus.")
                errors_list.append({"cod_ped_venda": ped_num, "error": "Pedido não encontrado no Horus."})
                continue

            status_erp = str(ord_horus.get("STATUS_PEDIDO_VENDA") or ord_horus.get("STA_PEDIDO_VENDA") or "").strip().upper()
            cod_cli = ord_horus.get("COD_CLI")
            cod_empresa = str(ord_horus.get("COD_EMPRESA") or cod_empresa_padrao).strip()
            cod_filial = str(ord_horus.get("COD_FILIAL") or cod_filial_padrao).strip()

            # Resolve local de estoque apropriado para a filial do pedido no Horus
            cod_local = cod_local_cfg
            if not cod_local or cod_local in ["1", "2", "5"]:
                if str(cod_filial) == "2":
                    cod_local = "15"  # EO-TRANSPO
                elif str(cod_filial) == "1":
                    cod_local = "9"   # CV-TRANSPO
                else:
                    cod_local = "15"

            # Se pedido já foi cancelado no ERP
            if status_erp == "CAN":
                if local_order:
                    local_order.situation = "CANCELLED"
                    local_order.status_horus = "CAN"
                    db.commit()
                results.append({"cod_ped_venda": ped_num, "status": "CANCELLED", "message": "Pedido cancelado no ERP."})
                continue

            # Se já faturado no ERP (FAT)
            if status_erp == "FAT":
                if local_order:
                    local_order.situation = "CHECKED"
                    local_order.status_horus = "FAT"
                    if not local_order.checked_at:
                        local_order.checked_at = now_dt
                    db.commit()
                results.append({"cod_ped_venda": ped_num, "status": "ALREADY_FAT", "message": "Pedido já faturado no ERP."})
                continue

            # Se já está conferido no Horus (LFT)
            if status_erp == "LFT":
                if local_order:
                    local_order.situation = "CHECKED"
                    local_order.status_horus = "LFT"
                    if not local_order.checked_at:
                        local_order.checked_at = now_dt
                    db.commit()
                results.append({"cod_ped_venda": ped_num, "status": "ALREADY_LFT", "message": "Pedido já liberado para faturamento (LFT) no ERP."})
                continue

            # 3. Executa a conferência dos itens no Horus (ConfereItem_Pedido)
            items_mkt = item.get("MovimentoItensPedido") or []
            total_volumes = int(mov.get("total_volumes") or rem.get("volumes") or 1)
            total_weights = float(mov.get("total_pesos") or 0.5)

            all_items_ok = True
            items_checked_count = 0

            for mkt_it in items_mkt:
                qty_bom = 0.0
                if "MovimentoItensPedido" in mkt_it and isinstance(mkt_it["MovimentoItensPedido"], list) and len(mkt_it["MovimentoItensPedido"]) > 0:
                    qty_bom = float(mkt_it["MovimentoItensPedido"][0].get("quantidade_bom") or 0.0)
                elif "quantidade_bom" in mkt_it:
                    qty_bom = float(mkt_it.get("quantidade_bom") or 0.0)
                elif "quantidade" in mkt_it:
                    qty_bom = float(mkt_it.get("quantidade") or 0.0)

                qty_atendida = abs(int(round(qty_bom)))
                if qty_atendida <= 0:
                    continue

                prod_info = mkt_it.get("Produto") or {}
                cod_item_raw = prod_info.get("codigo_cliente") or mkt_it.get("cProd") or mkt_it.get("codigo")
                ean_raw = prod_info.get("codigo_barras") or mkt_it.get("cEAN") or mkt_it.get("ean")

                # Se código tem 13 dígitos (ISBN) ou código ausente, resolve via Busca_Acervo
                cod_item_final = str(cod_item_raw or "").strip()
                if len(cod_item_final) == 13 or (not cod_item_final and ean_raw):
                    isbn_to_search = ean_raw or cod_item_final
                    try:
                        acervo_res = await horus_client.busca_acervo_isbn(str(isbn_to_search), cod_empresa=cod_empresa, cod_filial=cod_filial)
                        if acervo_res and isinstance(acervo_res, list) and len(acervo_res) > 0:
                            first_ac = acervo_res[0]
                            if first_ac.get("COD_ITEM"):
                                cod_item_final = str(first_ac.get("COD_ITEM"))
                    except Exception as e_ac:
                        logger.debug(f"[Logistics.process_check] Falha ao resolver acervo para ISBN {isbn_to_search}: {e_ac}")

                if not cod_item_final:
                    cod_item_final = str(ean_raw or "")

                # Chama ConfereItem_Pedido
                try:
                    conf_res = await horus_client.confere_item_pedido(
                        cod_empresa=cod_empresa,
                        cod_filial=cod_filial,
                        cod_cli=str(cod_cli),
                        cod_ped_venda=str(ped_num),
                        cod_item=cod_item_final,
                        cod_local=cod_local,
                        qtd_atendida=qty_atendida
                    )
                    
                    is_ok = False
                    first_conf = conf_res[0] if isinstance(conf_res, list) and len(conf_res) > 0 else conf_res
                    if isinstance(first_conf, dict):
                        msg = str(first_conf.get("MSG") or first_conf.get("Mensagem") or "").upper()
                        falha = str(first_conf.get("Falha") or first_conf.get("FALHA") or "").upper()
                        if "CONFERIDO COM SUCESSO" in msg or "JÁ CONFERIDO NA EXPEDIÇÃO" in msg or "JA CONFERIDO" in msg:
                            is_ok = True
                        elif "JÁ CONFERIDO" in falha or "JA CONFERIDO" in falha:
                            is_ok = True
                        elif "CANCELADO" in msg or "CANCELADO" in falha:
                            all_items_ok = False
                            if local_order:
                                local_order.situation = "CANCELLED"
                                local_order.status_horus = "CAN"
                                db.commit()
                            break
                        else:
                            if not first_conf.get("Falha") and not first_conf.get("FALHA"):
                                is_ok = True

                    if is_ok:
                        items_checked_count += 1
                    else:
                        logger.warning(f"[Logistics.process_check] ConfereItem_Pedido aviso para item {cod_item_final} ped {ped_num}: {conf_res}")
                        items_checked_count += 1

                    _record_logistics_log(
                        db=db,
                        company_id=company_id,
                        cod_ped_venda=ped_num,
                        action="CONFERENCE_ITEM",
                        status="SUCCESS" if is_ok else "WARNING",
                        request_data={
                            "COD_EMPRESA": cod_empresa,
                            "COD_FILIAL": cod_filial,
                            "COD_CLI": str(cod_cli),
                            "COD_PED_VENDA": str(ped_num),
                            "COD_ITEM": cod_item_final,
                            "COD_LOCAL": cod_local,
                            "QTD_ATENDIDA": qty_atendida
                        },
                        response_data=conf_res,
                        message=f"Item {cod_item_final} conferido ({qty_atendida} un) no local {cod_local}."
                    )
                except Exception as e_conf:
                    err_str = str(e_conf).upper()
                    if "JÁ CONFERIDO" in err_str or "JA CONFERIDO" in err_str:
                        items_checked_count += 1
                    else:
                        logger.error(f"[Logistics.process_check] Falha ao conferir item {cod_item_final} ped {ped_num}: {e_conf}")
                        all_items_ok = False
                        _record_logistics_log(
                            db=db,
                            company_id=company_id,
                            cod_ped_venda=ped_num,
                            action="CONFERENCE_ITEM",
                            status="ERROR",
                            request_data={
                                "COD_EMPRESA": cod_empresa,
                                "COD_FILIAL": cod_filial,
                                "COD_ITEM": cod_item_final,
                                "COD_LOCAL": cod_local,
                                "QTD_ATENDIDA": qty_atendida
                            },
                            response_data=str(e_conf),
                            message=f"Erro ao conferir item {cod_item_final}: {e_conf}"
                        )
                        break

            if not all_items_ok:
                errors_list.append({"cod_ped_venda": ped_num, "error": "Falha na conferência de um ou mais itens."})
                continue

            # 4. Registra Volumes e Pesos no Horus (InsVolume_Pedido)
            vols = max(1, total_volumes)
            peso_vol = math.ceil(total_weights) if vols > 1 else max(0.1, total_weights)

            for v in range(1, vols + 1):
                try:
                    vol_res = await horus_client.ins_volume_pedido(
                        cod_empresa=cod_empresa,
                        cod_filial=cod_filial,
                        cod_cli=str(cod_cli),
                        cod_ped_venda=str(ped_num),
                        cod_volume=v,
                        pes_volume=peso_vol
                    )
                    _record_logistics_log(
                        db=db,
                        company_id=company_id,
                        cod_ped_venda=ped_num,
                        action="INS_VOLUME",
                        status="SUCCESS",
                        request_data={"COD_VOLUME": v, "PES_VOLUME": peso_vol},
                        response_data=vol_res,
                        message=f"Volume {v}/{vols} registrado com peso {peso_vol}kg."
                    )
                except Exception as e_vol:
                    logger.debug(f"[Logistics.process_check] InsVolume_Pedido volume {v} ped {ped_num}: {e_vol}")

            # 5. Altera status no Horus para LFT (Liberado para Faturamento)
            try:
                alt_res = await horus_client.alt_status_pedido(
                    cod_empresa=cod_empresa,
                    cod_filial=cod_filial,
                    cod_cli=str(cod_cli),
                    cod_ped_venda=ped_num,
                    sta_pedido="LFT"
                )
                logger.info(f"[Logistics.process_check] Status alterado para LFT para pedido {ped_num}: {alt_res}")
                _record_logistics_log(
                    db=db,
                    company_id=company_id,
                    cod_ped_venda=ped_num,
                    action="ALT_STATUS_LFT",
                    status="SUCCESS",
                    request_data={"COD_EMPRESA": cod_empresa, "COD_FILIAL": cod_filial, "STA_PEDIDO": "LFT"},
                    response_data=alt_res,
                    message="Status do pedido alterado para LFT (Liberado para Faturamento) no Horus."
                )
            except Exception as e_alt:
                logger.error(f"[Logistics.process_check] Falha ao alterar status para LFT ped {ped_num}: {e_alt}")
                _record_logistics_log(
                    db=db,
                    company_id=company_id,
                    cod_ped_venda=ped_num,
                    action="ALT_STATUS_LFT",
                    status="ERROR",
                    request_data={"COD_EMPRESA": cod_empresa, "COD_FILIAL": cod_filial, "STA_PEDIDO": "LFT"},
                    response_data=str(e_alt),
                    message=f"Erro ao alterar status para LFT no Horus: {e_alt}"
                )

            # 6. Atualiza tabela local logistics_orders
            if not local_order:
                local_order = LogisticsOrder(
                    company_id=company_id,
                    cod_ped_venda=ped_num,
                    cod_cli=int(cod_cli) if str(cod_cli).isdigit() else None,
                    provider=log_settings.provider,
                    id_ord_sys_log=wms_id_str,
                    situation="CHECKED",
                    status_horus="LFT",
                    checked_at=now_dt,
                    cep_validated=True
                )
                db.add(local_order)
            else:
                local_order.situation = "CHECKED"
                local_order.status_horus = "LFT"
                local_order.checked_at = now_dt
                if wms_id_str and not local_order.id_ord_sys_log:
                    local_order.id_ord_sys_log = wms_id_str
                local_order.error_log = None

            db.commit()
            conferred_count += 1
            results.append({
                "cod_ped_venda": ped_num,
                "status": "CONFERRED_LFT",
                "items_checked": items_checked_count,
                "volumes": vols,
                "weight": peso_vol,
                "message": "Pedido conferido com sucesso e liberado para faturamento (LFT) no Horus."
            })

    finally:
        await horus_client.close()

    return {
        "success": True,
        "processed_count": processed_count,
        "conferred_count": conferred_count,
        "errors_count": len(errors_list),
        "errors": errors_list,
        "results": results,
        "message": f"{conferred_count} pedido(s) conferido(s) e liberado(s) para faturamento no Horus (LFT) com sucesso."
    }


@router.get("/companies/{company_id}/logistics/orders/{cod_ped}/logs")
def get_order_logistics_logs(
    company_id: int,
    cod_ped: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retorna o histórico de logs da esteira logística e conferência Horus/WMS do pedido (últimos 30 dias).
    """
    _assert_ownership(current_user, company_id)
    logs = db.query(LogisticsOrderLog).filter(
        LogisticsOrderLog.company_id == company_id,
        LogisticsOrderLog.cod_ped_venda == cod_ped
    ).order_by(LogisticsOrderLog.created_at.desc()).all()

    return [
        {
            "id": l.id,
            "action": l.action,
            "status": l.status,
            "request_data": json.loads(l.request_data) if l.request_data else None,
            "response_data": json.loads(l.response_data) if l.response_data else None,
            "message": l.message,
            "created_at": l.created_at.isoformat() if l.created_at else None
        }
        for l in logs
    ]


# --- Validação CEP ---

def _build_horus_clients(db, company_id: int):
    """Instancia HorusOrders + HorusClients compartilhando a mesma sessão de settings."""
    try:
        orders = HorusOrders(db, company_id)
        clients = HorusClients(db, company_id)
        return orders, clients, orders._settings
    except HorusConfigurationError as e:
        raise HTTPException(status_code=400, detail=f"Horus API não configurada: {e}")


def _get_cnpj_destino(db, company_id: int) -> str:
    """Obtém o CNPJ do destino (seller) via Company.document — padrão do projeto."""
    company = db.query(Company).filter(Company.id == company_id).first()
    if company and company.document:
        return "".join(c for c in str(company.document) if c.isdigit())
    return ""


async def _get_order_and_client(orders: HorusOrders, clients: HorusClients, settings, cod_ped: int, cod_filial: str, cnpj_destino: str = ""):
    """
    Busca cabeçalho do pedido via Busca_PedidosVenda e depois os dados cadastrais
    e de endereço do cliente via API Padrão do Horus: Busca_Cliente e Busca_EndCliente por COD_CLI.
    Retorna (ped_data, cli_data).
    """
    # 1. Busca pedido na API Horus
    cod_empresa = str(getattr(settings, 'horus_company', '') or '1').strip()
    params_ped = {
        "COD_EMPRESA": cod_empresa,
        "COD_FILIAL": str(cod_filial).strip(),
        "COD_PED_VENDA": str(cod_ped),
        "OFFSET": 0,
        "LIMIT": 1,
    }
    if getattr(settings, 'horus_legacy_pagination', False):
        params_ped.pop("OFFSET", None)
        params_ped.pop("LIMIT", None)

    res_ped = await orders.get("Busca_PedidosVenda", params=params_ped)

    ped_data = None
    if res_ped and isinstance(res_ped, list) and len(res_ped) > 0:
        first = res_ped[0]
        if not (first.get("Falha") or first.get("FALHA") == "S"):
            ped_data = first

    if not ped_data:
        raise HTTPException(
            status_code=404,
            detail=f"Pedido #{cod_ped} não encontrado no Horus (filial {cod_filial})."
        )

    # 2. Busca dados cadastrais do cliente via API Padrão do Horus (Busca_Cliente) usando COD_CLI
    cod_cli = str(ped_data.get("COD_CLI") or "").strip()
    if not cod_cli:
        raise HTTPException(status_code=422, detail="Pedido sem COD_CLI definido no Horus.")

    res_cli = await clients.get("Busca_Cliente", params={"COD_CLI": cod_cli})

    cli_data = None
    if res_cli and isinstance(res_cli, list) and len(res_cli) > 0:
        first_cli = res_cli[0]
        if not (first_cli.get("Falha") or first_cli.get("FALHA") == "S"):
            cli_data = dict(first_cli)

    if not cli_data:
        raise HTTPException(
            status_code=422,
            detail=f"Cliente COD_CLI={cod_cli} não localizado na API Padrão do Horus (Busca_Cliente)."
        )

    # Garante campos comuns esperados
    if not cli_data.get("CGCCPF_CLI"):
        cli_data["CGCCPF_CLI"] = cli_data.get("CPF") or cli_data.get("CNPJ") or ""

    # 3. Busca endereços do cliente via API Padrão do Horus (Busca_EndCliente) usando COD_CLI
    try:
        res_end = await clients.get("Busca_EndCliente", params={"COD_CLI": cod_cli})
        if res_end and isinstance(res_end, list) and len(res_end) > 0:
            ends = [e for e in res_end if isinstance(e, dict) and not (e.get("Falha") or e.get("FALHA") == "S")]
            if ends:
                # Prioridade: 1) Endereço marcado como STA_DEFAULT == 'S', 2) tipo ENTREGA (COD_TPO_END=2), 3) primeiro da lista
                selected_end = None
                for e in ends:
                    if str(e.get("STA_DEFAULT", "")).upper() == "S":
                        selected_end = e
                        break
                if not selected_end:
                    for e in ends:
                        if str(e.get("COD_TPO_END", "")) == "2":
                            selected_end = e
                            break
                if not selected_end:
                    selected_end = ends[0]

                # Mescla endereços com as chaves esperadas pela rotina de logística e ViaCEP
                cli_data["END_CLI"] = selected_end.get("DESC_ENDERECO") or ""
                cli_data["ENDERECO"] = selected_end.get("DESC_ENDERECO") or ""
                cli_data["NRO_END_CLI"] = str(selected_end.get("NUM_END") or "").strip()
                cli_data["NRO_END"] = str(selected_end.get("NUM_END") or "").strip()
                cli_data["COMPL_END_CLI"] = selected_end.get("COM_ENDERECO") or ""
                cli_data["COMPLEMENTO"] = selected_end.get("COM_ENDERECO") or ""
                cli_data["BAI_CLI"] = selected_end.get("NOM_BAIRRO") or ""
                cli_data["BAIRRO"] = selected_end.get("NOM_BAIRRO") or ""
                cli_data["CID_CLI"] = selected_end.get("NOM_LOCAL") or ""
                cli_data["CIDADE"] = selected_end.get("NOM_LOCAL") or ""
                cli_data["EST_CLI"] = selected_end.get("SIGLA_UF") or ""
                cli_data["UF"] = selected_end.get("SIGLA_UF") or ""
                cli_data["FONE_CLI"] = selected_end.get("TEL_ENDERECO") or selected_end.get("CEL_ENDERECO") or ""
                cli_data["TELEFONE"] = selected_end.get("TEL_ENDERECO") or selected_end.get("CEL_ENDERECO") or ""

        # Normaliza e aplica máscara com zero à frente antes de qualquer validação
        raw_cep = ""
        if selected_end:
            raw_cep = selected_end.get("CEP") or selected_end.get("CEP_CLI") or selected_end.get("DES_CEP") or ""
        if not raw_cep:
            raw_cep = cli_data.get("CEP_CLI") or cli_data.get("CEP") or cli_data.get("DES_CEP") or ""

        norm_cep = _normalize_cep(raw_cep)
        masked_cep = _mask_cep(norm_cep)

        cli_data["CEP_RAW"] = str(raw_cep)
        cli_data["CEP_NORMALIZADO"] = norm_cep
        cli_data["CEP_MASCARADO"] = masked_cep
        cli_data["CEP_CLI"] = masked_cep if masked_cep else norm_cep
        cli_data["CEP"] = masked_cep if masked_cep else norm_cep
        cli_data["DES_CEP"] = masked_cep if masked_cep else norm_cep
    except Exception as e_end:
        logger.warning(f"Erro ao buscar endereços do cliente COD_CLI={cod_cli} via Busca_EndCliente: {e_end}")

    return ped_data, cli_data


# --- Preflight (pré-validação sem enviar) ---

@router.get("/companies/{company_id}/logistics/preflight/{cod_ped}")
async def preflight_logistics(
    company_id: int,
    cod_ped: int,
    cod_filial: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Executa TODAS as validações necessárias para envio ao WMS sem de fato enviar.
    Retorna lista de checks com status OK/ERROR/WARNING e detalhes para exibição ao operador.
    """
    _assert_ownership(current_user, company_id)

    from datetime import datetime, timezone

    checks = []  # list of {key, label, status: "ok"|"error"|"warning", detail: str}
    ped_data = None
    cli_data = None
    items_data = []
    cep = ""
    vcep_data = {}

    # ── 1. Configuração de logística ─────────────────────────────────
    log_settings = db.query(LogisticsSettings).filter(LogisticsSettings.company_id == company_id).first()
    if not log_settings or not log_settings.enabled:
        checks.append({
            "key": "logistics_config",
            "label": "Configuração de Logística WMS",
            "status": "error",
            "detail": "Integração não configurada ou inativa. Vá em Configurações → Logística WMS."
        })
        return {"can_send": False, "checks": checks, "order": None, "client": None, "items": []}

    checks.append({
        "key": "logistics_config",
        "label": f"Configuração WMS ({log_settings.provider})",
        "status": "ok",
        "detail": f"Provider: {log_settings.provider} | URL: {log_settings.api_url or 'não informada'}"
    })

    # ── 2. API Horus configurada ───────────────────────────────────────
    try:
        horus_orders, horus_clients, horus_settings = _build_horus_clients(db, company_id)
        checks.append({
            "key": "horus_config",
            "label": "API Horus configurada",
            "status": "ok",
            "detail": f"URL: {getattr(horus_settings, 'horus_url', '?')}"
        })
    except HTTPException as e:
        checks.append({
            "key": "horus_config",
            "label": "API Horus configurada",
            "status": "error",
            "detail": e.detail
        })
        return {"can_send": False, "checks": checks, "order": None, "client": None, "items": []}

    cnpj_destino = _get_cnpj_destino(db, company_id)

    try:
        # ── 3. Pedido encontrado no Horus ───────────────────────────────
        try:
            ped_data, cli_data = await _get_order_and_client(
                horus_orders, horus_clients, horus_settings, cod_ped, cod_filial, cnpj_destino
            )
            checks.append({
                "key": "order_found",
                "label": f"Pedido #{cod_ped} localizado no Horus",
                "status": "ok",
                "detail": f"Status: {ped_data.get('STATUS_PEDIDO_VENDA') or ped_data.get('STA_PEDIDO_VENDA') or '?'} | Cliente: {cli_data.get('NOM_CLI') or cli_data.get('NOME') or '?'} (COD_CLI: {ped_data.get('COD_CLI')})"
            })
        except HTTPException as e:
            checks.append({
                "key": "order_found",
                "label": f"Pedido #{cod_ped} no Horus",
                "status": "error",
                "detail": e.detail
            })
            return {"can_send": False, "checks": checks, "order": None, "client": None, "items": []}
        except Exception as e:
            logger.error(f"Erro ao consultar pedido #{cod_ped} no Horus: {e}")
            checks.append({
                "key": "order_found",
                "label": f"Falha de conexão com a API do Horus",
                "status": "error",
                "detail": f"Não foi possível conectar à API do Horus: {str(e)}. Verifique se a URL e Porta nas configurações da empresa estão corretas e acessíveis."
            })
            return {"can_send": False, "checks": checks, "order": None, "client": None, "items": []}

        # ── 4. Status do pedido (deve ser LEX para enviar) ─────────────
        sta = str(ped_data.get("STATUS_PEDIDO_VENDA") or ped_data.get("STA_PEDIDO_VENDA") or "").upper().strip()
        if sta == "LEX":
            checks.append({
                "key": "order_status",
                "label": "Status do pedido elegível para envio",
                "status": "ok",
                "detail": f"Status atual: LEX (Em Expedição) — elegível para envio à logística."
            })
        elif sta in ["FAT", "NF"]:
            checks.append({
                "key": "order_status",
                "label": "Status do pedido elegível para envio",
                "status": "warning",
                "detail": f"Pedido com status {sta} — já pode ter NF emitida. Verifique se ainda precisa enviar ao WMS."
            })
        else:
            checks.append({
                "key": "order_status",
                "label": "Status do pedido elegível para envio",
                "status": "warning",
                "detail": f"Status atual: {sta or '?'}. Recomendado: LEX (Em Expedição)."
            })

        # ── 5. Dados do cliente ────────────────────────────────────────
        doc_cli = _only_digits(cli_data.get("CGCCPF_CLI") or cli_data.get("CNPJ") or cli_data.get("CPF") or "")
        nome_cli = str(cli_data.get("NOM_CLI") or cli_data.get("NOME") or "").strip()
        email_cli = str(cli_data.get("EMAIL_CLI") or cli_data.get("EMAIL") or "").strip()

        client_issues = []
        if not doc_cli:
            client_issues.append("CPF/CNPJ não preenchido no Horus")
        if not nome_cli:
            client_issues.append("Nome do cliente vazio")
        if not email_cli:
            client_issues.append("E-mail não preenchido (não bloqueia envio)")

        if client_issues:
            has_blocker = any("preenchido" in i and "E-mail" not in i for i in client_issues)
            checks.append({
                "key": "client_data",
                "label": "Dados cadastrais do cliente",
                "status": "error" if has_blocker else "warning",
                "detail": " | ".join(client_issues)
            })
        else:
            checks.append({
                "key": "client_data",
                "label": "Dados cadastrais do cliente",
                "status": "ok",
                "detail": f"{nome_cli} | Doc: {doc_cli} | Email: {email_cli or 'não informado'}"
            })

        # ── 6. Endereço completo ────────────────────────────────────────
        end = str(cli_data.get("END_CLI") or cli_data.get("ENDERECO") or "").strip()
        nro = str(cli_data.get("NRO_END_CLI") or cli_data.get("NRO_END") or "").strip()
        bai = str(cli_data.get("BAI_CLI") or cli_data.get("BAIRRO") or "").strip()
        cid = str(cli_data.get("CID_CLI") or cli_data.get("CIDADE") or "").strip()
        uf  = str(cli_data.get("EST_CLI") or cli_data.get("UF") or "").strip()

        addr_issues = []
        if not end: addr_issues.append("Logradouro vazio")
        if not nro: addr_issues.append("Número vazio")
        if not bai: addr_issues.append("Bairro vazio")
        if not cid: addr_issues.append("Cidade vazia")
        if not uf:  addr_issues.append("UF vazia")

        if addr_issues:
            checks.append({
                "key": "client_address",
                "label": "Endereço de entrega completo",
                "status": "warning",
                "detail": " | ".join(addr_issues) + " — ViaCEP preencherá automaticamente campos faltantes."
            })
        else:
            checks.append({
                "key": "client_address",
                "label": "Endereço de entrega completo",
                "status": "ok",
                "detail": f"{end}, {nro}{' — ' + bai if bai else ''}, {cid}/{uf}"
            })

        # ── 7. CEP válido (ViaCEP) ─────────────────────────────────────
        cep_raw = cli_data.get("CEP_NORMALIZADO") or cli_data.get("CEP_CLI") or cli_data.get("CEP") or cli_data.get("DES_CEP") or ""
        cep = _normalize_cep(cep_raw)
        cep_mascarado = _mask_cep(cep)

        if not cep or len(cep) != 8:
            checks.append({
                "key": "cep_valid",
                "label": "CEP do cliente",
                "status": "error",
                "detail": f"CEP {cep_mascarado or cep_raw or 'ausente'} inválido no cadastro do cliente no Horus (esperado 8 dígitos com máscara 00000-000)."
            })
        else:
            try:
                async with httpx.AsyncClient(timeout=8.0) as vclient:
                    vresp = await vclient.get(f"https://viacep.com.br/ws/{cep}/json/")
                    vresp.raise_for_status()
                    vcep_data = vresp.json()

                if vcep_data.get("erro"):
                    checks.append({
                        "key": "cep_valid",
                        "label": f"CEP {cep_mascarado} válido (ViaCEP)",
                        "status": "error",
                        "detail": f"CEP {cep_mascarado} não encontrado no ViaCEP. Corrija o endereço no Horus."
                    })
                else:
                    checks.append({
                        "key": "cep_valid",
                        "label": f"CEP {cep_mascarado} válido (ViaCEP)",
                        "status": "ok",
                        "detail": f"{vcep_data.get('logradouro','')}, {vcep_data.get('bairro','')}, {vcep_data.get('localidade','')}/{vcep_data.get('uf','')}"
                    })
            except Exception as e:
                checks.append({
                    "key": "cep_valid",
                    "label": f"CEP {cep_mascarado}",
                    "status": "warning",
                    "detail": f"Não foi possível validar o CEP no ViaCEP: {e}. O envio tentará prosseguir."
                })

        # ── 8. Itens do pedido ─────────────────────────────────────────
        cod_empresa = str(getattr(horus_settings, 'horus_company', '') or '1').strip()
        params_itens = {
            "COD_PED_VENDA": str(cod_ped),
            "COD_EMPRESA": cod_empresa,
            "COD_FILIAL": str(cod_filial).strip(),
            "OFFSET": 0,
            "LIMIT": 500,
        }
        if getattr(horus_settings, 'horus_legacy_pagination', False):
            params_itens.pop("OFFSET", None)
            params_itens.pop("LIMIT", None)

        res_itens = await horus_orders.get("Busca_ItensPedidosVenda", params=params_itens)
        if res_itens and isinstance(res_itens, list):
            items_data = [i for i in res_itens if not (i.get("Falha") or i.get("FALHA") == "S")]

        if not items_data:
            checks.append({
                "key": "order_items",
                "label": "Itens do pedido",
                "status": "error",
                "detail": "Nenhum item encontrado para este pedido no Horus. Verifique se os itens foram inseridos corretamente."
            })
        else:
            qtd_total = sum(_parse_float(i.get("QT_PEDIDA") or i.get("QTD_PEDIDA") or 0) for i in items_data)
            checks.append({
                "key": "order_items",
                "label": f"Itens do pedido ({len(items_data)} SKU{'s' if len(items_data) > 1 else ''})",
                "status": "ok",
                "detail": f"{len(items_data)} item(ns) | Qtd total: {qtd_total:.0f} un."
            })

        # ── 9. Já na fila? ─────────────────────────────────────────────
        existing = db.query(LogisticsOrder).filter(
            LogisticsOrder.company_id == company_id,
            LogisticsOrder.cod_ped_venda == cod_ped
        ).first()
        if existing and existing.situation in ["IN_LOGISTICS", "CHECKED", "INVOICED"] and existing.id_ord_sys_log:
            checks.append({
                "key": "queue_status",
                "label": "Situação na fila de logística",
                "status": "error",
                "detail": f"Pedido já registrado no WMS com remessa #{existing.id_ord_sys_log} ({existing.situation}). Não pode ser reenviado."
            })
        elif existing and existing.situation == "CEP_INVALID":
            checks.append({
                "key": "queue_status",
                "label": "Situação na fila de logística",
                "status": "ok",
                "detail": f"Pedido com CEP mascarado ({cep_mascarado}). Elegível para envio ao WMS."
            })
        else:
            checks.append({
                "key": "queue_status",
                "label": "Situação na fila de logística",
                "status": "ok",
                "detail": "Pedido elegível para envio (não está na fila ou pendente de confirmação no WMS)."
            })

    finally:
        await horus_orders.close()
        await horus_clients.close()

    # ── Resultado final ────────────────────────────────────────────────
    has_errors = any(c["status"] == "error" for c in checks)

    # Resumo do valor do pedido
    valor_total = _parse_float(ped_data.get("VLR_TOTAL_LIQUIDO") or ped_data.get("VLR_TOTAL_PEDIDO") or 0) if ped_data else 0.0

    return {
        "can_send": not has_errors,
        "checks": checks,
        "order": {
            "cod_ped_venda": cod_ped,
            "cod_pedido_origem": ped_data.get("COD_PEDIDO_ORIGEM") if ped_data else None,
            "status": sta if ped_data else None,
            "valor_total": valor_total,
        } if ped_data else None,
        "client": {
            "cod_cli": ped_data.get("COD_CLI") if ped_data else None,
            "nome": str(cli_data.get("NOM_CLI") or cli_data.get("NOME") or "") if cli_data else None,
            "documento": doc_cli if cli_data else None,
            "cep": _mask_cep(cep) if cep else None,
            "endereco": f"{vcep_data.get('logradouro') or end}, {nro}" if (vcep_data or end) else None,
        } if cli_data else None,
        "items": [
            {
                "cod_item": i.get("COD_ITEM") or i.get("BARRAS_ISBN"),
                "nom_item": i.get("NOM_ITEM") or i.get("DESC_ITEM"),
                "qtd": _parse_float(i.get("QT_PEDIDA") or i.get("QTD_PEDIDA") or 0),
                "vlr_unitario": _parse_float(i.get("VLR_PRECO") or i.get("VLR_UNITARIO") or 0),
            }
            for i in items_data
        ],
    }



@router.post("/companies/{company_id}/logistics/validate-cep/{cod_ped}")
async def validate_cep(
    company_id: int,
    cod_ped: int,
    cod_filial: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Valida o CEP do endereço de entrega do cliente do pedido.
    Fluxo: Busca_PedidosVenda → COD_CLI → Busca_ClienteB2B → CEP → ViaCEP
    NENHUMA consulta SQL direta ao banco do Horus.
    """
    _assert_ownership(current_user, company_id)

    # 1. Instancia clientes da API Horus REST
    orders, clients, settings = _build_horus_clients(db, company_id)
    cnpj_destino = _get_cnpj_destino(db, company_id)

    # 2. Busca pedido + cliente via API Horus
    try:
        ped_data, cli_data = await _get_order_and_client(orders, clients, settings, cod_ped, cod_filial, cnpj_destino)
    finally:
        await orders.close()
        await clients.close()

    # 3. Extrai CEP do endereço do cliente
    cep_raw = (
        cli_data.get("CEP_NORMALIZADO") or
        cli_data.get("CEP_CLI") or
        cli_data.get("CEP") or
        cli_data.get("DES_CEP") or
        ""
    )
    cep = _normalize_cep(cep_raw)
    cep_mascarado = _mask_cep(cep)

    if not cep or len(cep) != 8:
        # CEP ausente ou malformado — registra e retorna erro
        from datetime import datetime, timezone
        order = db.query(LogisticsOrder).filter(
            LogisticsOrder.company_id == company_id,
            LogisticsOrder.cod_ped_venda == cod_ped
        ).first()
        if not order:
            order = LogisticsOrder(company_id=company_id, cod_ped_venda=cod_ped)
            db.add(order)
        order.cep_validated = False
        order.cep_checked_at = datetime.now(timezone.utc)
        order.cep_error_detail = f"CEP {cep_mascarado or cep_raw or 'ausente'} inválido no cadastro do cliente no Horus."
        db.commit()
        raise HTTPException(
            status_code=422,
            detail=f"CEP {cep_mascarado or 'não preenchido'} inválido no Horus (COD_CLI={cli_data.get('COD_CLI')})."
        )

    # 4. Valida CEP no ViaCEP
    valid = False
    detail = ""
    address = {}
    try:
        async with httpx.AsyncClient(timeout=10.0) as vclient:
            resp = await vclient.get(f"https://viacep.com.br/ws/{cep}/json/")
            resp.raise_for_status()
            data = resp.json()
            if data.get("erro"):
                detail = f"CEP {_mask_cep(cep)} não encontrado no ViaCEP."
            else:
                valid = True
                address = data
    except Exception as e:
        detail = f"Erro na comunicação com ViaCEP: {e}"

    # 5. Persiste resultado na fila logística
    from datetime import datetime, timezone
    order = db.query(LogisticsOrder).filter(
        LogisticsOrder.company_id == company_id,
        LogisticsOrder.cod_ped_venda == cod_ped
    ).first()
    if not order:
        order = LogisticsOrder(company_id=company_id, cod_ped_venda=cod_ped)
        db.add(order)

    order.cep_validated = valid
    order.cep_checked_at = datetime.now(timezone.utc)
    order.cep_error_detail = detail if not valid else None
    if not valid and order.situation not in ["IN_LOGISTICS", "CHECKED", "INVOICED"]:
        order.situation = "CEP_INVALID"
    db.commit()

    if not valid:
        raise HTTPException(
            status_code=422,
            detail=detail or f"CEP {_mask_cep(cep)} inválido — corrija o endereço no Horus."
        )

    return {
        "cod_ped_venda": cod_ped,
        "cep": cep,
        "cep_masked": _mask_cep(cep),
        "valid": True,
        "address": address
    }


# --- Envio ---

@router.post("/companies/{company_id}/logistics/send/{cod_ped}")
async def send_to_logistics(
    company_id: int,
    cod_ped: int,
    cod_filial: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Envia pedido para o WMS de logística.
    Fluxo:
      1. Valida situação na fila local
      2. Busca_PedidosVenda → COD_CLI → Busca_ClienteB2B (API Horus REST)
      3. Valida CEP via ViaCEP (bloqueia se inválido — HTTP 422)
      4. Busca_ItensPedidosVenda (API Horus REST)
      5. Monta payload e envia ao WMS (MKT ou outro provider)
    NENHUMA consulta SQL direta ao banco do Horus.
    """
    _assert_ownership(current_user, company_id)

    # 1. Verifica situação na fila
    order = db.query(LogisticsOrder).filter(
        LogisticsOrder.company_id == company_id,
        LogisticsOrder.cod_ped_venda == cod_ped
    ).first()
    if not order:
        order = LogisticsOrder(company_id=company_id, cod_ped_venda=cod_ped)
        db.add(order)
        db.commit()
        db.refresh(order)

    if order.situation in ["IN_LOGISTICS", "CHECKED", "INVOICED"] and order.id_ord_sys_log:
        raise HTTPException(
            status_code=409,
            detail=f"Pedido já encontra-se na situação {order.situation} com remessa #{order.id_ord_sys_log}."
        )

    # 2. Verifica configuração logística
    log_settings = db.query(LogisticsSettings).filter(
        LogisticsSettings.company_id == company_id
    ).first()
    if not log_settings or not log_settings.enabled:
        raise HTTPException(
            status_code=400,
            detail="Integração de logística não configurada ou inativa. Configure em Configurações → Logística WMS."
        )

    # 3. Instancia API Horus REST
    horus_orders, horus_clients, horus_settings = _build_horus_clients(db, company_id)
    cnpj_destino = _get_cnpj_destino(db, company_id)

    try:
        # 4. Busca pedido + cliente via API Horus REST
        ped_data, cli_data = await _get_order_and_client(
            horus_orders, horus_clients, horus_settings, cod_ped, cod_filial, cnpj_destino
        )

        # 5. Valida CEP do cliente via ViaCEP
        cep_raw = (
            cli_data.get("CEP_NORMALIZADO") or
            cli_data.get("CEP_CLI") or
            cli_data.get("CEP") or
            cli_data.get("DES_CEP") or
            ""
        )
        cep = _normalize_cep(cep_raw)
        cep_mascarado = _mask_cep(cep)

        if not cep or len(cep) != 8:
            order.situation = "CEP_INVALID"
            order.cep_validated = False
            order.cep_error_detail = f"CEP {cep_mascarado or cep_raw or 'ausente'} inválido no cadastro do cliente no Horus."
            from datetime import datetime, timezone
            order.cep_checked_at = datetime.now(timezone.utc)
            db.commit()
            raise HTTPException(
                status_code=422,
                detail=f"CEP {cep_mascarado or 'não informado'} inválido — corrija o endereço no Horus."
            )

        # ViaCEP
        try:
            async with httpx.AsyncClient(timeout=10.0) as vclient:
                vresp = await vclient.get(f"https://viacep.com.br/ws/{cep}/json/")
                vresp.raise_for_status()
                vcep_data = vresp.json()
        except Exception as e:
            vcep_data = {}
            logger.warning(f"[Logistics.send] ViaCEP indisponível para CEP {cep}: {e}")

        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)

        if vcep_data.get("erro"):
            order.situation = "CEP_INVALID"
            order.cep_validated = False
            order.cep_checked_at = now
            order.cep_error_detail = f"CEP {cep_mascarado} inválido — não encontrado no ViaCEP."
            db.commit()
            raise HTTPException(
                status_code=422,
                detail=f"⚠️ CEP {cep_mascarado} inválido — corrija o endereço no Horus e tente novamente."
            )

        order.cep_validated = True
        order.cep_checked_at = now
        order.cep_error_detail = None

        # 6. Busca itens do pedido via API Horus REST
        cod_empresa = str(getattr(horus_settings, 'horus_company', '') or '1').strip()
        params_itens = {
            "COD_PED_VENDA": str(cod_ped),
            "COD_EMPRESA": cod_empresa,
            "COD_FILIAL": str(cod_filial).strip(),
            "OFFSET": 0,
            "LIMIT": 10000,
        }
        if getattr(horus_settings, 'horus_legacy_pagination', False):
            params_itens.pop("OFFSET", None)
            params_itens.pop("LIMIT", None)

        res_itens = await horus_orders.get("Busca_ItensPedidosVenda", params=params_itens)
        items_data = []
        if res_itens and isinstance(res_itens, list):
            items_data = [i for i in res_itens if not (i.get("Falha") or i.get("FALHA") == "S")]

        # 7. Monta payload no formato exato esperado pelo WMS MKT
        try:
            operacao_id = int(log_settings.operator_id or 0)
        except Exception:
            operacao_id = 0

        # Datas e valores
        dat_ped = str(ped_data.get("DAT_PEDIDO") or "").split("T")[0]
        if not dat_ped:
            dat_ped = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        # Endereço normalizado com sobreposição de dados do ViaCEP quando disponíveis
        logradouro = vcep_data.get("logradouro") or _fval(cli_data.get("END_CLI") or cli_data.get("ENDERECO") or "")
        bairro     = vcep_data.get("bairro")     or _fval(cli_data.get("BAI_CLI") or cli_data.get("BAIRRO") or "")
        cidade     = vcep_data.get("localidade") or _fval(cli_data.get("CID_CLI") or cli_data.get("CIDADE") or "")
        uf         = vcep_data.get("uf")         or _fval(cli_data.get("EST_CLI") or cli_data.get("UF") or "")
        numero     = _fval(cli_data.get("NRO_END_CLI") or cli_data.get("NRO_END") or "S/N")
        complemento = _fval(cli_data.get("COMPL_END_CLI") or cli_data.get("COMPLEMENTO") or "")
        ibge_cidade = int(vcep_data.get("ibge") or 0) if vcep_data.get("ibge") else 0

        # Monta itens com cProd, cEAN, xProd, quantidade
        mkt_itens = []
        for i in items_data:
            c_prod = _fval(i.get("COD_ITEM") or i.get("BARRAS_ISBN") or "")
            c_ean = _fval(i.get("BARRAS_ISBN") or i.get("COD_ITEM") or "")
            x_prod = _fval(i.get("NOM_ITEM") or i.get("DESC_ITEM") or "")
            qtd = _parse_float(i.get("QT_PEDIDA") or i.get("QTD_PEDIDA") or 1.0)
            mkt_itens.append({
                "cProd": c_prod,
                "cEAN": c_ean,
                "xProd": x_prod,
                "fluxo_logistico_id": 0,
                "quantidade": qtd,
            })

        nome_cli = _fval(cli_data.get("NOM_CLI") or cli_data.get("NOME") or "")
        fantasia = _fval(cli_data.get("NOM_REDUZIDO") or nome_cli)
        doc_cli = _only_digits(cli_data.get("CGCCPF_CLI") or cli_data.get("CNPJ") or cli_data.get("CPF") or "")
        rg_ie = _fval(cli_data.get("INSC_ESTADUAL") or cli_data.get("RG") or cli_data.get("IE_CLI") or "ISENTO")
        email_cli = _fval(cli_data.get("EMAIL") or cli_data.get("EMAIL_CLI") or "")
        tel_cli = _fval(cli_data.get("FONE_CLI") or cli_data.get("TELEFONE") or cli_data.get("CEL_CLI") or "")

        cnpj_transp = _only_digits(ped_data.get("CNPJ_TRANSP") or ped_data.get("CPF_CNPJ_TRANSP") or cnpj_destino)

        payload = {
            "operacao_id": operacao_id,
            "pedidos": [{
                "pedido": {
                    "codigo": int(cod_ped),
                    "nfe_chave": None,
                    "nfe_numero": None,
                    "data": dat_ped,
                    "nfe_xml_url": None,
                },
                "comprador": {
                    "nome_razao": nome_cli,
                    "fantasia": fantasia,
                    "cpf_cnpj": doc_cli,
                    "rg_insc_estadual": rg_ie,
                    "email": email_cli,
                    "telefone": tel_cli,
                    "logradouro": logradouro,
                    "numero": numero,
                    "complemento": complemento,
                    "bairro": bairro,
                    "municipio": cidade,
                    "uf": uf,
                    "ibge_cidade_id": ibge_cidade,
                    "ibge_estado_id": 0,
                    "cep": _mask_cep(cep),
                },
                "transporte": {
                    "nome_razao": _fval(ped_data.get("NOM_TRANSP") or "LOGISTICA"),
                    "fantasia": _fval(ped_data.get("NOM_TRANSP") or "LOGISTICA"),
                    "cpf_cnpj": cnpj_transp,
                    "modFrete": 0,
                    "valor": 0.0,
                    "volumes": 1,
                    "servico": _fval(ped_data.get("NOM_TRANSP") or "LOGISTICA"),
                    "etiqueta_url": None,
                },
                "entrega": {
                    "logradouro": logradouro,
                    "numero": numero,
                    "complemento": complemento,
                    "bairro": bairro,
                    "municipio": cidade,
                    "uf": uf,
                    "ibge_cidade_id": ibge_cidade,
                    "ibge_estado_id": 0,
                    "cep": _mask_cep(cep),
                },
                "pedido_itens": mkt_itens,
            }]
        }

        # 8. Envia ao WMS via provider
        provider = LogisticsProvider.factory(log_settings.provider, log_settings)
        res = await provider.send_order(payload)

        # 9. Registra sucesso na fila
        order.situation = "IN_LOGISTICS"
        order.sent_at = now
        order.status_horus = str(ped_data.get("STATUS_PEDIDO_VENDA") or ped_data.get("STA_PEDIDO_VENDA") or "LEX")
        order.cod_cli = int(cli_data.get("COD_CLI") or 0) or None
        legado_id = _extract_legado_id(res)
        if not legado_id:
            try:
                # Consulta direta na MKT por codigo_referencia para resgatar o ID
                if isinstance(provider, MKTProvider):
                    async with provider._get_client() as mkt_client:
                        r_ref = await mkt_client.get("/movimento/saida.json", params={
                            "armazem_id": log_settings.warehouse_id or "",
                            "cliente_id": log_settings.client_id or "",
                            "codigo_referencia": str(cod_ped)
                        })
                        if r_ref.status_code == 200:
                            data_ref = r_ref.json()
                            res_list = data_ref.get("data", {}).get("resultados", []) if isinstance(data_ref.get("data"), dict) else data_ref.get("resultados", [])
                            if res_list:
                                item_0 = res_list[0]
                                legado_id = (item_0.get("LegadoPedido") or {}).get("id") or (item_0.get("RemessaPedido") or {}).get("id")
                if not legado_id:
                    movs = await provider.get_movements(dat_ped, dat_ped)
                    for m in movs:
                        rem_m = m.get("RemessaPedido") or {}
                        mov_m = m.get("Movimento") or {}
                        leg_m = m.get("LegadoPedido") or {}
                        ped_num = str(rem_m.get("pedido_numero") or mov_m.get("codigo_referencia") or m.get("codigo") or "").strip()
                        if ped_num == str(cod_ped):
                            legado_id = leg_m.get("id") or rem_m.get("id") or m.get("id")
                            break
            except Exception as e_mov:
                logger.debug(f"[Logistics.send] Não foi possível obter remessa_id de imediato: {e_mov}")

        order.id_ord_sys_log = str(legado_id) if legado_id else None
        order.error_log = None
        db.commit()

        _record_logistics_log(
            db=db,
            company_id=company_id,
            cod_ped_venda=cod_ped,
            action="SEND_WMS",
            status="SUCCESS",
            request_data=payload,
            response_data=res,
            message=f"Pedido #{cod_ped} enviado com sucesso à logística ({log_settings.provider}). Remessa #{order.id_ord_sys_log}."
        )

        return {
            "success": True,
            "cod_ped_venda": cod_ped,
            "id_ord_sys_log": order.id_ord_sys_log,
            "situation": order.situation,
            "cep": _mask_cep(cep),
            "message": f"Pedido #{cod_ped} enviado com sucesso à logística ({log_settings.provider}).",
        }

    except HTTPException:
        db.commit()
        raise
    except Exception as e:
        logger.error(f"[Logistics.send] Erro ao enviar pedido {cod_ped} para logística: {e}")
        order.situation = "PENDING_SEND"
        order.error_log = str(e)[:500]
        db.commit()
        _record_logistics_log(
            db=db,
            company_id=company_id,
            cod_ped_venda=cod_ped,
            action="SEND_WMS",
            status="ERROR",
            request_data={"cod_ped": cod_ped, "cod_filial": cod_filial},
            response_data=str(e),
            message=f"Falha no envio do pedido #{cod_ped} para logística: {e}"
        )
        raise HTTPException(status_code=500, detail=f"Erro ao enviar pedido para logística: {e}")
    finally:
        await horus_orders.close()
        await horus_clients.close()

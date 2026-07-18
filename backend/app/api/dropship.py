"""
API Dropship — Integração Hub-Erdos / Hórus ERP
Prefixo: /dropship
Versão API Hórus mínima: v.01.127

Fluxo completo:
1. Configurar token Erdos + customer vinculado + params fiscais em POST /dropship/config/{company_id}
2. Sincronizar pedidos: POST /dropship/orders/{company_id}/sync
   → Baixa pedidos do Hub, armazena documentos localmente (URLs expiram em 1h)
3. Enviar pedido ao Hórus: POST /dropship/orders/{company_id}/{order_id}/send-to-horus
   → Cria 2 pedidos no Hórus: remessa (6.923 c/ baixa estoque) + venda (6.118 s/ baixa estoque)
4. Confirmar despacho: POST /dropship/orders/{company_id}/{order_id}/confirm-dispatch
   → Envia tracking + chave NF-e 6.923 para o Hub-Erdos
"""
import os
import re
import json
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.models.user import User, UserRole
from app.models.dropship import DropshipConfig, DropshipOrder
from app.models.company import Company
from app.models.company_settings import CompanySettings
from app.models.customer import Customer
from app.integrators.erdos_client import ErdosClient, ErdosClientError

router = APIRouter()


# ==============================================================================
# HELPERS
# ==============================================================================

def _require_master(current_user: User):
    if current_user.type not in [UserRole.MASTER]:
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores.")


def _require_seller_or_master(current_user: User, company_id: int):
    """Permite MASTER acessar qualquer company; SELLER apenas a própria."""
    if current_user.type == UserRole.MASTER:
        return
    if current_user.type == UserRole.SELLER and current_user.company_id == company_id:
        return
    raise HTTPException(status_code=403, detail="Acesso negado.")


def _get_config_or_404(db: Session, company_id: int) -> DropshipConfig:
    config = db.query(DropshipConfig).filter(
        DropshipConfig.company_id == company_id,
        DropshipConfig.provider == "ERDOS"
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="Configuração Dropship não encontrada para esta empresa.")
    return config


def _build_erdos_client(config: DropshipConfig) -> ErdosClient:
    if not config.enabled:
        raise HTTPException(status_code=400, detail="Integração Dropship está desativada para esta empresa.")
    if not config.api_token or not config.api_base_url:
        raise HTTPException(status_code=400, detail="Token ou URL base do Hub-Erdos não configurados.")
    return ErdosClient(base_url=config.api_base_url, api_key=config.api_token)


async def _download_and_store(client: ErdosClient, url: Optional[str], dest_path: str) -> Optional[str]:
    """
    Baixa um arquivo de URL assinada e salva localmente.
    Retorna o caminho relativo para armazenamento no banco.
    URLs do Hub-Erdos expiram em 1 hora — download deve ser imediato.
    """
    if not url:
        return None
    try:
        content = await client.download_file(url)
        Path(dest_path).parent.mkdir(parents=True, exist_ok=True)
        with open(dest_path, "wb") as f:
            f.write(content)
        return dest_path
    except ErdosClientError:
        return None


# ==============================================================================
# SCHEMAS
# ==============================================================================

class DropshipConfigCreate(BaseModel):
    provider: str = "ERDOS"
    enabled: bool = False
    api_token: Optional[str] = None
    api_base_url: Optional[str] = "https://wxcapqbtvgttooamglxx.supabase.co/functions/v1/api-fornecedor"
    horus_customer_id: Optional[int] = None
    horus_fiscal_param_remessa: Optional[str] = None
    horus_fiscal_param_venda: Optional[str] = None
    stock_sync_interval_min: int = 30
    stock_sync_enabled: bool = False


class DropshipConfigResponse(BaseModel):
    id: int
    company_id: int
    provider: str
    enabled: bool
    api_token: Optional[str]
    api_base_url: Optional[str]
    horus_customer_id: Optional[int]
    horus_customer_name: Optional[str] = None
    horus_customer_document: Optional[str] = None
    horus_customer_id_guid: Optional[str] = None
    horus_customer_id_doc: Optional[str] = None
    horus_fiscal_param_remessa: Optional[str]
    horus_fiscal_param_venda: Optional[str]
    stock_sync_interval_min: int
    stock_sync_enabled: bool
    stock_sync_last_run: Optional[datetime]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class DropshipOrderResponse(BaseModel):
    id: int
    company_id: int
    config_id: int
    external_order_id: str
    external_reference: Optional[str]
    channel: Optional[str]
    status: str
    released_at: Optional[datetime]
    customer_data: Optional[Any]
    items_data: Optional[Any]
    logistics_data: Optional[Any]
    fiscal_data: Optional[Any]
    horus_pedido_remessa: Optional[str]
    horus_pedido_venda: Optional[str]
    tracking_code: Optional[str]
    nfe_remessa_key: Optional[str]
    label_path: Optional[str]
    danfe_path: Optional[str]
    xml_path: Optional[str]
    synced_at: Optional[datetime]
    sent_to_horus_at: Optional[datetime]
    dispatched_at: Optional[datetime]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    # Campos de integração Erdos em tempo real
    erdos_status: Optional[str]
    erdos_checked_at: Optional[datetime]
    erdos_alert: Optional[bool]
    logs: Optional[Any]  # list[dict]

    class Config:
        from_attributes = True


class ConfirmDispatchRequest(BaseModel):
    tracking_code: Optional[str] = None
    nfe_remessa_key: Optional[str] = None


class CustomerSearchResult(BaseModel):
    id: int
    name: str
    document: str
    id_guid: Optional[str]
    id_doc: Optional[str]

    class Config:
        from_attributes = True


# ==============================================================================
# CONFIGURAÇÃO
# ==============================================================================

@router.get("/config/{company_id}", response_model=DropshipConfigResponse)
def get_dropship_config(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retorna a configuração Dropship do seller. Apenas MASTER."""
    _require_master(current_user)

    config = db.query(DropshipConfig).filter(
        DropshipConfig.company_id == company_id,
        DropshipConfig.provider == "ERDOS"
    ).first()

    if not config:
        # Retorna configuração vazia (não é 404 — facilita UI)
        return DropshipConfigResponse(
            id=0, company_id=company_id, provider="ERDOS", enabled=False,
            api_token=None, api_base_url="https://wxcapqbtvgttooamglxx.supabase.co/functions/v1/api-fornecedor",
            horus_customer_id=None, horus_fiscal_param_remessa=None, horus_fiscal_param_venda=None,
            stock_sync_interval_min=30, stock_sync_enabled=False, stock_sync_last_run=None,
            created_at=None, updated_at=None
        )

    # Enriquecer com dados do customer vinculado
    response = DropshipConfigResponse.model_validate(config)
    if config.horus_customer:
        response.horus_customer_name = config.horus_customer.name
        response.horus_customer_document = config.horus_customer.document
        response.horus_customer_id_guid = config.horus_customer.id_guid
        response.horus_customer_id_doc = config.horus_customer.id_doc
    return response


@router.post("/config/{company_id}", response_model=DropshipConfigResponse)
def upsert_dropship_config(
    company_id: int,
    payload: DropshipConfigCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cria ou atualiza configuração Dropship. Apenas MASTER."""
    _require_master(current_user)

    config = db.query(DropshipConfig).filter(
        DropshipConfig.company_id == company_id,
        DropshipConfig.provider == payload.provider
    ).first()

    if config:
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(config, field, value)
    else:
        config = DropshipConfig(company_id=company_id, **payload.model_dump())
        db.add(config)

    db.commit()
    db.refresh(config)

    response = DropshipConfigResponse.model_validate(config)
    if config.horus_customer:
        response.horus_customer_name = config.horus_customer.name
        response.horus_customer_document = config.horus_customer.document
        response.horus_customer_id_guid = config.horus_customer.id_guid
        response.horus_customer_id_doc = config.horus_customer.id_doc
    return response


@router.post("/config/{company_id}/test-connection")
async def test_erdos_connection(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Testa conectividade com o Hub-Erdos usando as credenciais configuradas."""
    _require_master(current_user)

    config = _get_config_or_404(db, company_id)
    client = _build_erdos_client(config)
    try:
        result = await client.test_connection()
        return {"status": "connected", "detail": result}
    except ErdosClientError as e:
        return {"status": "error", "detail": str(e)}
    finally:
        await client.close()


# ==============================================================================
# BUSCA DE CUSTOMERS (para vincular ao dropship config)
# ==============================================================================

@router.get("/config/{company_id}/customers", response_model=List[CustomerSearchResult])
def search_horus_linked_customers(
    company_id: int,
    q: Optional[str] = Query(None, description="Busca por nome ou CNPJ"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retorna customers da empresa que possuem id_guid E id_doc configurados
    (necessário para integração Hórus). Usado para vincular o parceiro dropship.
    """
    _require_master(current_user)

    query = db.query(Customer).filter(
        Customer.company_id == company_id,
        Customer.id_guid.isnot(None),
        Customer.id_doc.isnot(None),
        Customer.id_guid != "",
        Customer.id_doc != "",
    )

    if q:
        like = f"%{q}%"
        query = query.filter(
            (Customer.name.ilike(like)) | (Customer.document.ilike(like))
        )

    customers = query.order_by(Customer.name).limit(50).all()
    return customers


# ==============================================================================
# PEDIDOS — SINCRONIZAÇÃO
# ==============================================================================

@router.post("/orders/{company_id}/sync")
async def sync_dropship_orders(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Busca pedidos prontos para despacho no Hub-Erdos e salva/atualiza localmente.
    Baixa documentos (XML, DANFE, etiqueta) imediatamente — URLs expiram em 1h.
    """
    _require_seller_or_master(current_user, company_id)

    config = _get_config_or_404(db, company_id)
    client = _build_erdos_client(config)

    try:
        pending_orders = await client.get_pending_orders()
    except ErdosClientError as e:
        raise HTTPException(status_code=502, detail=f"Erro ao conectar com Hub-Erdos: {str(e)}")

    synced = 0
    skipped = 0
    errors = []

    base_dir = f"uploads/{company_id}/dropship"

    for order_data in pending_orders:
        external_id = order_data.get("id_pedido_erdos")
        if not external_id:
            continue

        # Verificar se já existe
        existing = db.query(DropshipOrder).filter(
            DropshipOrder.company_id == company_id,
            DropshipOrder.external_order_id == external_id
        ).first()

        # Pedido já processado (fora da fila Erdos) — não sobrescrever
        if existing and existing.status not in ["PENDING"]:
            skipped += 1
            continue

        order_dir = f"{base_dir}/{external_id}"

        # Baixar documentos imediatamente (URLs assinadas expiram em 1h)
        xml_path = None
        danfe_path = None
        label_path = None

        doc_fiscal = order_data.get("documentos_fiscais", {}) or {}
        logistica = order_data.get("logistica", {}) or {}

        xml_url = doc_fiscal.get("url_xml_nfe_venda_6120")
        danfe_url = doc_fiscal.get("url_pdf_danfe")
        label_url = logistica.get("url_pdf_etiqueta_postagem")

        try:
            if xml_url:
                xml_path = await _download_and_store(client, xml_url, f"{order_dir}/nfe.xml")
            if danfe_url:
                danfe_path = await _download_and_store(client, danfe_url, f"{order_dir}/danfe.pdf")
            if label_url:
                label_path = await _download_and_store(client, label_url, f"{order_dir}/etiqueta.pdf")
        except Exception as e:
            errors.append({"order": external_id, "error": f"Download de documentos: {str(e)}"})

        # Parsear data_liberacao
        released_at = None
        try:
            data_lib = order_data.get("data_liberacao")
            if data_lib:
                released_at = datetime.fromisoformat(data_lib.replace("Z", "+00:00"))
        except Exception:
            pass

        if existing:
            # Atualizar pedido existente (PENDING)
            existing.external_reference = order_data.get("referencia")
            existing.channel = order_data.get("canal_origem")
            existing.released_at = released_at
            existing.customer_data = order_data.get("dados_cliente")
            existing.items_data = order_data.get("itens")
            existing.logistics_data = {k: v for k, v in logistica.items() if k != "url_pdf_etiqueta_postagem"}
            existing.fiscal_data = {k: v for k, v in doc_fiscal.items() if not k.startswith("url_")}
            if xml_path:
                existing.xml_path = xml_path
            if danfe_path:
                existing.danfe_path = danfe_path
            if label_path:
                existing.label_path = label_path
            existing.synced_at = datetime.utcnow()
        else:
            new_order = DropshipOrder(
                company_id=company_id,
                config_id=config.id,
                external_order_id=external_id,
                external_reference=order_data.get("referencia"),
                channel=order_data.get("canal_origem"),
                status="PENDING",
                released_at=released_at,
                customer_data=order_data.get("dados_cliente"),
                items_data=order_data.get("itens"),
                logistics_data={k: v for k, v in logistica.items() if k != "url_pdf_etiqueta_postagem"},
                fiscal_data={k: v for k, v in doc_fiscal.items() if not k.startswith("url_")},
                xml_path=xml_path,
                danfe_path=danfe_path,
                label_path=label_path,
                synced_at=datetime.utcnow(),
            )
            db.add(new_order)
            synced += 1

    db.commit()
    await client.close()

    return {
        "synced": synced,
        "skipped": skipped,
        "errors": errors,
        "total_hub": len(pending_orders),
    }


# ==============================================================================
# PEDIDOS — LISTAGEM
# ==============================================================================

@router.get("/orders/{company_id}", response_model=List[DropshipOrderResponse])
def list_dropship_orders(
    company_id: int,
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista pedidos dropship da empresa com filtro opcional de status."""
    _require_seller_or_master(current_user, company_id)

    query = db.query(DropshipOrder).filter(DropshipOrder.company_id == company_id)
    if status:
        query = query.filter(DropshipOrder.status == status.upper())

    return query.order_by(DropshipOrder.released_at.desc().nullslast()).all()


@router.get("/orders/{company_id}/{order_id}", response_model=DropshipOrderResponse)
def get_dropship_order(
    company_id: int,
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retorna detalhes de um pedido dropship específico."""
    _require_seller_or_master(current_user, company_id)

    order = db.query(DropshipOrder).filter(
        DropshipOrder.id == order_id,
        DropshipOrder.company_id == company_id,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido dropship não encontrado.")
    return order


# ==============================================================================
# ENVIAR PARA O HÓRUS (Gera 2 pedidos)
# ==============================================================================

@router.post("/orders/{company_id}/{order_id}/send-to-horus")
async def send_order_to_horus(
    company_id: int,
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Envia o pedido Dropship para o Hórus ERP criando dois pedidos:
    1. Pedido de Remessa (CFOP 6.923) — com TIPO_PEDIDO_V_T_D='L' e COD_PARAM_FISCAL de remessa
       → Movimenta estoque físico. Status → LEX.
    2. Pedido de Venda (CFOP 6.118) — para o customer ERDOS vinculado
       → Não movimenta estoque. Status → LAP → Pular_expedicao → LFT (pronto para faturar).

    O customer final (dados_cliente) é cadastrado/buscado no Hórus pelo CNPJ via Busca_ClienteB2B.
    """
    _require_seller_or_master(current_user, company_id)

    # 1. Carregar pedido dropship
    order = db.query(DropshipOrder).filter(
        DropshipOrder.id == order_id,
        DropshipOrder.company_id == company_id,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido dropship não encontrado.")

    if order.status != "PENDING":
        raise HTTPException(status_code=400, detail=f"Pedido não está pendente (status atual: {order.status}).")

    # 2. Carregar configuração dropship
    config = db.query(DropshipConfig).filter(
        DropshipConfig.id == order.config_id
    ).first()
    if not config:
        raise HTTPException(status_code=400, detail="Configuração Dropship não encontrada.")

    if not config.horus_fiscal_param_remessa:
        raise HTTPException(status_code=400, detail="COD_PARAM_FISCAL de remessa não configurado. Configure em Dropship → Configurações.")

    if not config.horus_customer_id:
        raise HTTPException(status_code=400, detail="Customer parceiro (ERDOS) não vinculado na configuração Dropship.")

    # 3. Carregar customer parceiro (ERDOS) — para o pedido de venda
    customer_erdos = db.query(Customer).filter(Customer.id == config.horus_customer_id).first()
    if not customer_erdos or not customer_erdos.id_guid or not customer_erdos.id_doc:
        raise HTTPException(status_code=400, detail="Customer ERDOS não possui id_guid/id_doc configurados.")

    # 4. Carregar configurações Hórus
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not settings or not settings.horus_enabled:
        raise HTTPException(status_code=400, detail="Integração Hórus não habilitada.")

    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    from app.integrators.horus_clients import HorusClients
    from app.integrators.horus_orders import HorusOrders

    # 5. Buscar/registrar o cliente final no Hórus pelo CNPJ
    customer_data = order.customer_data or {}
    cpf_cnpj_final = customer_data.get("cpf_cnpj", "")
    cpf_cnpj_clean = re.sub(r"\D", "", cpf_cnpj_final)

    horus_clients = HorusClients(db, company_id)
    horus_orders = HorusOrders(db, company_id)

    # COD_PEDIDO_ORIGEM para o pedido de remessa (identificador único baseado no id externo)
    cod_origem_remessa = f"DSP-REM-{order.external_order_id[:20]}"
    cod_origem_venda = f"DSP-VND-{order.external_order_id[:20]}"

    cnpj_destino = re.sub(r"\D", "", company.document or "")

    errors = []

    try:
        # -----------------------------------------------------------------------
        # PEDIDO 1 — REMESSA (6.923): cliente final, baixa estoque
        # -----------------------------------------------------------------------
        # Buscar cliente final no Hórus (apenas para validação — o Hórus precisa conhecer o CNPJ)
        # Para dropship a expedição ocorre para o cliente final
        remessa_params: Dict[str, Any] = {
            "ID_DOC": customer_erdos.id_doc,
            "ID_GUID": customer_erdos.id_guid,
            "CNPJ_DESTINO": cnpj_destino,
            "TIPO_PEDIDO_V_T_D": "L",
            "COD_PEDIDO_ORIGEM": cod_origem_remessa,
            "COD_PARAM_FISCAL": config.horus_fiscal_param_remessa,
            "OBS_PEDIDO": f"Dropship Erdos | Ref: {order.external_reference or order.external_order_id} | Cliente: {customer_data.get('nome', 'N/A')} | CEP: {customer_data.get('cep', 'N/A')}",
        }

        remessa_result = await horus_orders.get(  # type: ignore[attr-defined]
            "InsPedidoVenda", params=remessa_params
        )

        cod_ped_remessa = None
        if remessa_result and isinstance(remessa_result, list):
            if remessa_result[0].get("Falha"):
                errors.append(f"Pedido de Remessa: {remessa_result[0].get('Mensagem', 'Erro desconhecido')}")
            else:
                cod_ped_remessa = remessa_result[0].get("COD_PED_VENDA")

        if cod_ped_remessa:
            # Inserir itens no pedido de remessa
            itens = order.items_data or []
            for item in itens:
                sku = item.get("sku_fornecedor", "")
                qty = item.get("quantidade", 1)
                item_params = {
                    "ID_DOC": customer_erdos.id_doc,
                    "ID_GUID": customer_erdos.id_guid,
                    "CNPJ_DESTINO": cnpj_destino,
                    "COD_PEDIDO_ORIGEM": cod_origem_remessa,
                    "BARRAS_ISBN": sku,
                    "QTD_PEDIDA": qty,
                }
                await horus_orders.get("InsItensPedidoVenda", params=item_params)  # type: ignore[attr-defined]

            # Mudar status para LEX (expedição)
            await horus_orders.get(  # type: ignore[attr-defined]
                "AltStatus_Pedido",
                params={
                    "ID_DOC": customer_erdos.id_doc,
                    "ID_GUID": customer_erdos.id_guid,
                    "CNPJ_DESTINO": cnpj_destino,
                    "COD_PEDIDO_ORIGEM": cod_origem_remessa,
                }
            )

        # -----------------------------------------------------------------------
        # PEDIDO 2 — VENDA (6.118): customer ERDOS, não baixa estoque
        # -----------------------------------------------------------------------
        venda_params: Dict[str, Any] = {
            "ID_DOC": customer_erdos.id_doc,
            "ID_GUID": customer_erdos.id_guid,
            "CNPJ_DESTINO": cnpj_destino,
            "TIPO_PEDIDO_V_T_D": "L",
            "COD_PEDIDO_ORIGEM": cod_origem_venda,
            "OBS_PEDIDO": f"Dropship Venda Erdos | Ref: {order.external_reference or order.external_order_id}",
        }

        venda_result = await horus_orders.get(  # type: ignore[attr-defined]
            "InsPedidoVenda", params=venda_params
        )

        cod_ped_venda = None
        if venda_result and isinstance(venda_result, list):
            if venda_result[0].get("Falha"):
                errors.append(f"Pedido de Venda: {venda_result[0].get('Mensagem', 'Erro desconhecido')}")
            else:
                cod_ped_venda = venda_result[0].get("COD_PED_VENDA")

        if cod_ped_venda:
            # Inserir itens no pedido de venda
            itens = order.items_data or []
            for item in itens:
                sku = item.get("sku_fornecedor", "")
                qty = item.get("quantidade", 1)
                item_params = {
                    "ID_DOC": customer_erdos.id_doc,
                    "ID_GUID": customer_erdos.id_guid,
                    "CNPJ_DESTINO": cnpj_destino,
                    "COD_PEDIDO_ORIGEM": cod_origem_venda,
                    "BARRAS_ISBN": sku,
                    "QTD_PEDIDA": qty,
                }
                await horus_orders.get("InsItensPedidoVenda", params=item_params)  # type: ignore[attr-defined]

            # Mudar para LAP (evitar expedição)
            await horus_orders.get(  # type: ignore[attr-defined]
                "AltStatus_Pedido",
                params={
                    "ID_DOC": customer_erdos.id_doc,
                    "ID_GUID": customer_erdos.id_guid,
                    "CNPJ_DESTINO": cnpj_destino,
                    "COD_PEDIDO_ORIGEM": cod_origem_venda,
                }
            )

            # Pular expedição → LFT (pronto para faturar)
            pular_params: Dict[str, Any] = {
                "COD_EMPRESA": settings.horus_company,
                "COD_FILIAL": settings.horus_branch,
                "COD_CLI": customer_erdos.id_doc,
                "COD_PED_VENDA": cod_ped_venda,
                "COD_LOCAL": 0,
            }
            await horus_orders.get("Pular_expedicao", params=pular_params)  # type: ignore[attr-defined]

    except Exception as e:
        await horus_orders.close()  # type: ignore[attr-defined]
        raise HTTPException(status_code=500, detail=f"Erro na integração Hórus: {str(e)}")

    await horus_orders.close()  # type: ignore[attr-defined]

    # Atualizar status do pedido dropship
    if cod_ped_remessa or cod_ped_venda:
        order.status = "SENT_TO_HORUS"
        order.horus_pedido_remessa = cod_ped_remessa
        order.horus_pedido_venda = cod_ped_venda
        order.sent_to_horus_at = datetime.utcnow()
        db.commit()

        # Notificar Erdos: muda status para "preparando"
        # → pedido some imediatamente da fila /pedidos/prontos-para-despacho
        try:
            config_obj = db.query(DropshipConfig).filter(DropshipConfig.id == order.config_id).first()
            if config_obj:
                erdos_cli = _build_erdos_client(config_obj)
                await erdos_cli.update_order_status(
                    id_pedido_erdos=order.external_order_id,
                    status="preparando",
                )
                await erdos_cli.close()
        except Exception:
            pass  # não bloqueia o fluxo principal

    return {
        "status": "ok" if not errors else "partial",
        "horus_pedido_remessa": cod_ped_remessa,
        "horus_pedido_venda": cod_ped_venda,
        "errors": errors,
    }


# ==============================================================================
# VERIFICAR STATUS NO ERDOS (polling individual)
# ==============================================================================

@router.post("/orders/{company_id}/{order_id}/check-erdos-status")
async def check_erdos_status(
    company_id: int,
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Consulta GET /pedidos/{id} no Erdos e sincroniza o status local.

    Fluxo de acompanhamento após PATCH "preparando":
      - status Erdos = "preparando"  → mantém SENT_TO_HORUS localmente
      - status Erdos = "postado"     → registra tracking se disponível
      - status Erdos = "cancelado"   → marca CANCELLED localmente
    Matriz de cenários completa:

    Erdos \Local   | PENDING           | SENT_TO_HORUS         | DISPATCHED        | CANCELLED
    --------------|-------------------|-----------------------|-------------------|----------
    aguardando    | OK (sem ação)     | inconsistência (log)  | inconsistência    | log
    preparando    | atualiza log      | OK (sem ação)         | OK                | inconsistência
    postado       | log               | captura rastreio      | OK                | log
    cancelado     | cancela local ✅  | ALERTA BLOQUEANTE ⛔  | log crítico       | sem ação
    entregue      | inconsistência    | log                   | OK (log)          | log
    """
    _require_seller_or_master(current_user, company_id)

    order = db.query(DropshipOrder).filter(
        DropshipOrder.id == order_id,
        DropshipOrder.company_id == company_id,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")

    config = db.query(DropshipConfig).filter(DropshipConfig.id == order.config_id).first()
    client = _build_erdos_client(config)

    try:
        erdos_data = await client.get_order(order.external_order_id)
    except ErdosClientError as e:
        raise HTTPException(status_code=502, detail=f"Erro ao consultar Erdos: {str(e)}")
    finally:
        await client.close()

    erdos_status = (erdos_data.get("status") or "").lower().strip()
    previous_erdos_status = order.erdos_status or ""
    previous_local_status = order.status

    action = "none"
    alert = None
    changed = erdos_status != previous_erdos_status

    # Helper para registrar logs
    def _append_log(event: str, detail: str):
        current_logs = list(order.logs or [])
        current_logs.append({
            "at": datetime.utcnow().isoformat(),
            "event": event,
            "erdos_status": erdos_status,
            "local_status_before": previous_local_status,
            "local_status_after": order.status,
            "detail": detail,
        })
        order.logs = current_logs

    # Sempre atualiza o status Erdos conhecido e o timestamp da última consulta
    order.erdos_status = erdos_status
    order.erdos_checked_at = datetime.utcnow()

    # ─────────────────────────────────────────────────────────────────────────
    # CENÁRIO: CANCELADO no Erdos
    # ─────────────────────────────────────────────────────────────────────────
    if erdos_status == "cancelado":

        if order.status == "CANCELLED":
            # Já cancelado localmente — sem ação
            action = "already_cancelled"

        elif order.status == "DISPATCHED":
            # Conflito grave: despachamos mas Erdos cancelou
            # Não podemos desfazer — apenas registrar para análise manual
            action = "conflict_dispatched_but_cancelled"
            alert = (
                "⚠️ CONFLITO CRÍTICO: pedido foi despachado pelo Cronuz mas consta como "
                "CANCELADO no Erdos. Contate o suporte da Erdos para resolução manual."
            )
            if changed:
                _append_log("CONFLICT_DISPATCHED_CANCELLED", alert)

        elif order.status == "SENT_TO_HORUS":
            # Cancelado DEPOIS de já ter sido enviado ao Hórus
            # → Não cancela automaticamente: usuário DEVE cancelar no Hórus primeiro
            order.erdos_alert = True
            action = "alert_cancel_in_horus"
            alert = (
                "⛔ Pedido CANCELADO no Erdos após envio ao Hórus. "
                "Cancele os pedidos #remessa e #venda no Hórus ERP antes de prosseguir. "
                "O status local só será atualizado após confirmação manual."
            )
            if changed:
                _append_log("CANCELLED_AFTER_HORUS_SENT", alert)

        else:
            # PENDING ou qualquer outro — cancela localmente de forma segura
            order.status = "CANCELLED"
            order.erdos_alert = False
            action = "auto_cancelled"
            _append_log("AUTO_CANCELLED", "Cancelado no Erdos sem envio ao Hórus. Status local atualizado automaticamente.")

    # ─────────────────────────────────────────────────────────────────────────
    # CENÁRIO: POSTADO — capturar rastreio
    # ─────────────────────────────────────────────────────────────────────────
    elif erdos_status == "postado":
        tracking = (
            erdos_data.get("codigo_rastreio")
            or erdos_data.get("codigo_rastreamento")
            or (erdos_data.get("logistica") or {}).get("codigo_rastreio")
        )
        if tracking and not order.tracking_code:
            order.tracking_code = tracking
            action = "tracking_captured"
            _append_log("TRACKING_CAPTURED", f"Código de rastreio capturado: {tracking}")
        elif changed:
            action = "status_updated"
            _append_log("STATUS_UPDATED", f"Status Erdos atualizado para '{erdos_status}'.")
        else:
            action = "none"

    # ─────────────────────────────────────────────────────────────────────────
    # CENÁRIO: ENTREGUE
    # ─────────────────────────────────────────────────────────────────────────
    elif erdos_status == "entregue":
        if order.status == "DISPATCHED":
            action = "delivered_ok"
            if changed:
                _append_log("DELIVERED", "Pedido confirmado como entregue no Erdos.")
        else:
            action = "inconsistency_delivered_not_dispatched"
            if changed:
                _append_log("INCONSISTENCY", f"Erdos marcou como entregue mas status local é '{order.status}'.")

    # ─────────────────────────────────────────────────────────────────────────
    # CENÁRIO: PREPARANDO — verificar consistência
    # ─────────────────────────────────────────────────────────────────────────
    elif erdos_status == "preparando":
        if order.status == "SENT_TO_HORUS" or order.status == "DISPATCHED":
            action = "consistent"
            if changed:
                _append_log("STATUS_UPDATED", "Erdos confirmou status 'preparando' — consistente.")
        elif order.status == "PENDING":
            # Inconsistência: Erdos diz preparando mas não enviamos ao Hórus
            action = "inconsistency_preparando_but_pending"
            if changed:
                _append_log("INCONSISTENCY", "Erdos status 'preparando' mas pedido ainda está PENDING localmente.")
        else:
            action = "status_updated"
            if changed:
                _append_log("STATUS_UPDATED", f"Erdos status '{erdos_status}', local '{order.status}'.")

    # ─────────────────────────────────────────────────────────────────────────
    # CENÁRIO: AGUARDANDO — estado normal de fila
    # ─────────────────────────────────────────────────────────────────────────
    elif erdos_status == "aguardando":
        if order.status in ["SENT_TO_HORUS", "DISPATCHED"]:
            # Inconsistência: enviamos ao Hórus mas Erdos ainda vê como aguardando
            # Pode ser que o PATCH preparando não chegou
            action = "inconsistency_sent_but_aguardando"
            if changed:
                _append_log("INCONSISTENCY", f"Pedido enviado ao Hórus mas Erdos ainda está '{erdos_status}'. PATCH preparando pode ter falhado.")
        else:
            action = "queue_ok"

    # ─────────────────────────────────────────────────────────────────────────
    # STATUS DESCONHECIDO
    # ─────────────────────────────────────────────────────────────────────────
    else:
        action = "unknown_status"
        if changed:
            _append_log("UNKNOWN_STATUS", f"Status Erdos desconhecido: '{erdos_status}'.")

    db.commit()

    return {
        "erdos_status": erdos_status,
        "previous_erdos_status": previous_erdos_status,
        "local_status": order.status,
        "action": action,
        "alert": alert,
        "erdos_alert": order.erdos_alert,
        "changed": changed,
        "tracking_code": order.tracking_code,
        "erdos_checked_at": order.erdos_checked_at.isoformat() if order.erdos_checked_at else None,
    }


# ==============================================================================
# CONFIRMAR DESPACHO
# ==============================================================================

@router.post("/orders/{company_id}/{order_id}/confirm-dispatch")
async def confirm_dispatch(
    company_id: int,
    order_id: int,
    payload: ConfirmDispatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Confirma o despacho no Hub-Erdos enviando código de rastreamento e chave NF-e 6.923.
    """
    _require_seller_or_master(current_user, company_id)

    order = db.query(DropshipOrder).filter(
        DropshipOrder.id == order_id,
        DropshipOrder.company_id == company_id,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")

    if order.status != "SENT_TO_HORUS":
        raise HTTPException(status_code=400, detail=f"Pedido não está no status SENT_TO_HORUS (atual: {order.status}).")

    config = db.query(DropshipConfig).filter(DropshipConfig.id == order.config_id).first()
    client = _build_erdos_client(config)

    try:
        result = await client.confirm_dispatch(
            id_pedido_erdos=order.external_order_id,
            tracking_code=payload.tracking_code,
            chave_nfe_remessa=payload.nfe_remessa_key,
        )
    except ErdosClientError as e:
        raise HTTPException(status_code=502, detail=f"Erro ao confirmar despacho no Hub-Erdos: {str(e)}")
    finally:
        await client.close()

    # Atualizar pedido local
    order.status = "DISPATCHED"
    order.tracking_code = payload.tracking_code
    order.nfe_remessa_key = payload.nfe_remessa_key
    order.dispatched_at = datetime.utcnow()
    db.commit()

    return {"status": "dispatched", "detail": result}


# ==============================================================================
# DOWNLOAD DE DOCUMENTOS
# ==============================================================================

@router.get("/orders/{company_id}/{order_id}/documents/{doc_type}")
async def get_order_document(
    company_id: int,
    order_id: int,
    doc_type: str,  # xml | danfe | etiqueta
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retorna URL pública do documento armazenado localmente.
    doc_type: xml | danfe | etiqueta
    """
    _require_seller_or_master(current_user, company_id)

    order = db.query(DropshipOrder).filter(
        DropshipOrder.id == order_id,
        DropshipOrder.company_id == company_id,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")

    path_map = {
        "xml": order.xml_path,
        "danfe": order.danfe_path,
        "etiqueta": order.label_path,
    }

    if doc_type not in path_map:
        raise HTTPException(status_code=400, detail="Tipo de documento inválido. Use: xml, danfe ou etiqueta.")

    local_path = path_map[doc_type]
    if not local_path:
        raise HTTPException(status_code=404, detail=f"Documento '{doc_type}' não disponível para este pedido.")

    # Normalizar: o path pode estar salvo como relativo (ex: "uploads/...") ou absoluto
    # Resolver sempre relativo ao diretório raiz do backend
    import pathlib
    backend_dir = pathlib.Path(__file__).resolve().parent.parent.parent  # app/api -> app -> backend root
    abs_path = pathlib.Path(local_path)
    if not abs_path.is_absolute():
        abs_path = backend_dir / local_path

    if not abs_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Arquivo '{doc_type}' não encontrado em disco. Tente sincronizar o pedido novamente."
        )

    # Retornar URL pública via /uploads montado no main.py
    # Normalizar para sempre começar com "uploads/..."
    local_str = str(abs_path)
    uploads_marker = "uploads/"
    idx = local_str.find(uploads_marker)
    if idx >= 0:
        public_url = "/" + local_str[idx:]
    else:
        public_url = f"/uploads/{company_id}/dropship/{order.external_order_id}/{abs_path.name}"

    return {"url": public_url, "path": str(abs_path)}


# ==============================================================================
# ESTOQUE
# ==============================================================================

@router.post("/stock/{company_id}/push")
async def push_stock_to_hub(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Consulta estoque no Hórus via AcervoB2B (filtrando por COD_BARRA_ITEM/ISBN)
    e envia posição atualizada para o Hub-Erdos.
    Campo de vínculo: COD_BARRA_ITEM (ISBN-13) ↔ sku do Hub-Erdos.
    """
    _require_seller_or_master(current_user, company_id)

    config = _get_config_or_404(db, company_id)
    client = _build_erdos_client(config)

    if not config.horus_customer:
        await client.close()
        raise HTTPException(status_code=400, detail="Customer parceiro não configurado.")

    try:
        from app.integrators.horus_products import HorusProducts
        horus_prod = HorusProducts(db, company_id)

        customer = config.horus_customer
        # Busca acervo completo do seller no Hórus (paginação ampla)
        result = await horus_prod.busca_acervo_b2b(
            id_doc=customer.id_doc,
            id_guid=customer.id_guid,
            limit=10000,
            offset=0,
        )

        items_to_send = []
        if isinstance(result, list):
            for item in result:
                isbn = item.get("COD_BARRA_ITEM") or item.get("BARRAS_ISBN") or item.get("ISBN")
                saldo = item.get("SALDO") or item.get("QTD_SALDO") or item.get("QTD_DISPONIVEL") or 0
                if isbn and str(isbn).strip():
                    items_to_send.append({
                        "sku": str(isbn).strip(),
                        "quantidade": max(0, int(saldo))
                    })

        if not items_to_send:
            await horus_prod.close()
            await client.close()
            return {"status": "warning", "message": "Nenhum item encontrado no Hórus para enviar.", "skus": 0}

        push_result = await client.push_stock(items_to_send)

        # Atualizar last_run
        config.stock_sync_last_run = datetime.utcnow()
        db.commit()

        await horus_prod.close()
        await client.close()

        return {
            "status": "ok",
            "skus_sent": len(items_to_send),
            "hub_response": push_result,
        }

    except ErdosClientError as e:
        raise HTTPException(status_code=502, detail=f"Erro ao enviar estoque para Hub-Erdos: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro interno ao processar estoque: {str(e)}")


@router.get("/stock/{company_id}/hub")
async def get_hub_stock(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Consulta posição de estoque registrada no Hub-Erdos para este fornecedor."""
    _require_seller_or_master(current_user, company_id)

    config = _get_config_or_404(db, company_id)
    client = _build_erdos_client(config)
    try:
        result = await client.get_stock()
        return result
    except ErdosClientError as e:
        raise HTTPException(status_code=502, detail=str(e))
    finally:
        await client.close()

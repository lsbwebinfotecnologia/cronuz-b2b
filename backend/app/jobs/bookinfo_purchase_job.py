"""
Job automatico de pedidos de compra Bookinfo.

Logica:
- Roda a cada 15 minutos (registrado em app/core/scheduler.py)
- Itera por todos os sellers com bookinfo_purchase_auto=True e bookinfo_api_key preenchida
- Para cada supplier do seller:
    1. Busca pedidos NAO transmitidos no Horus (TRANSMITIDO=N)
    2. Filtra: COMPRA_CONSIG in ['N', 'S']
    3. Verifica duplicidade local (evita reenvio)
    4. Envia para Bookinfo
    5. Marca TRANSMITIDO=S no Horus
    6. Sincroniza transmissoes SENT que nao estao finalizadas
    7. Grava log na tabela spl_purchase_job_log
"""
import asyncio
import json
import logging
import re
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session
from app.db.session import SessionLocal

from app.models.company_settings import CompanySettings
from app.models.bookinfo_supplier import BookinfoSupplier
from app.models.bookinfo_transmission import BookinfoTransmission, BookinfoTransmissionItem
from app.models.bookinfo_purchase_log import BookinfoPurchaseJobLog

logger = logging.getLogger("background_jobs")

# Fuso horario de Brasilia conforme requisito do usuario
TZ_BRASILIA = ZoneInfo("America/Sao_Paulo")

# Statuses finais — transmissoes com todos os itens nesse status nao sao re-sincronizadas
FINALIZED_STATUSES = {"RESERVADO_TOTAL", "ATENDIDO", "SEM_ESTOQUE", "CANCELADO", "REJEITADO"}


def _is_transmission_finalized(transmission: BookinfoTransmission, items: list) -> bool:
    """
    Replica exatamente a logica de isTransmissionFinalized do frontend.
    Retorna True somente se:
    - status == 'SYNCED'
    - todos os itens possuem situacao_retorno em FINALIZED_STATUSES
    """
    if transmission.status != "SYNCED":
        return False
    if not items:
        return False
    return all(
        item.situacao_retorno and item.situacao_retorno in FINALIZED_STATUSES
        for item in items
    )


def _format_cnpj(cnpj_digits: str) -> str:
    """Formata CNPJ com mascara: xx.xxx.xxx/xxxx-xx"""
    d = re.sub(r"\D", "", cnpj_digits or "")
    if len(d) == 14:
        return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}"
    return d


def _to_float(val) -> float:
    if not val:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    val_str = str(val).replace(".", "").replace(",", ".")
    try:
        return float(val_str)
    except ValueError:
        return 0.0


async def _fetch_horus_orders(db: Session, company_id: int, supplier: BookinfoSupplier) -> list:
    """
    Busca pedidos nao transmitidos (TRANSMITIDO=N) no Horus para o supplier.
    Reusa exatamente a mesma logica do endpoint search_horus_orders.
    DATA_FIM = agora em Brasilia.
    DATA_INI = last_sync_at ou start_date ou 30 dias atras.
    """
    from app.integrators.horus import HorusClient, HorusConfigurationError

    now_brasilia = datetime.now(TZ_BRASILIA)

    dt_fim = now_brasilia
    if supplier.last_sync_at:
        dt_ini = supplier.last_sync_at
    elif supplier.start_date:
        dt_ini = supplier.start_date
    else:
        dt_ini = now_brasilia - timedelta(days=30)

    horus_data_ini = dt_ini.strftime("%d/%m/%Y %H:%M:%S")
    horus_data_fim = dt_fim.strftime("%d/%m/%Y %H:%M:%S")

    # CNPJ invertido (conforme logica do endpoint existente)
    cnpj_origem = re.sub(r"\D", "", supplier.document_destination or "")
    cnpj_destino_masked = _format_cnpj(supplier.document_origin or "")

    integrador = supplier.integrador_compra or "BOOKINFO"
    status_filtro = supplier.status_pedido_compra or "AE"

    params = {
        "INTEGRADOR_COMPRA": integrador,
        "STATUS_PEDIDO_COMPRA": status_filtro,
        "DATA_INI": horus_data_ini,
        "DATA_FIM": horus_data_fim,
        "CNPJ_ORIGEM": cnpj_origem,
        "CNPJ_DESTINO": cnpj_destino_masked,
        "TRANSMITIDO": "N",
    }

    try:
        client = HorusClient(db, company_id)
    except HorusConfigurationError as e:
        raise RuntimeError(f"Horus nao configurado: {e}")

    settings = client._settings
    if not getattr(settings, "horus_legacy_pagination", False):
        params["OFFSET"] = 0
        params["LIMIT"] = 10000

    try:
        result = await client.get("Busca_PedidosCompra", params=params)
        if result and isinstance(result, list) and len(result) > 0:
            first = result[0]
            if isinstance(first, dict) and first.get("Falha"):
                raise RuntimeError(first.get("Mensagem", "Falha Horus desconhecida"))
        elif isinstance(result, dict) and result.get("Falha"):
            raise RuntimeError(result.get("Mensagem", "Falha Horus desconhecida"))

        # Atualiza last_sync_at no supplier para proxima rodada pegar somente os novos
        supplier.last_sync_at = dt_fim
        db.commit()

        return result or []
    finally:
        await client.close()


async def _send_order_to_bookinfo(
    db: Session,
    company_id: int,
    supplier: BookinfoSupplier,
    order_data: dict,
) -> dict:
    """
    Envia um pedido para a Bookinfo e registra a transmissao local.
    Retorna: { "status": "sent"|"error"|"skipped"|"duplicate", "detail": str }
    """
    from app.api.bookinfo_hub import get_bookinfo_client
    from app.integrators.horus_orders import HorusOrders

    cod_pedido = order_data.get("COD_PEDIDO")
    if not cod_pedido:
        return {"status": "skipped", "detail": "COD_PEDIDO ausente"}

    cod_pedido = int(cod_pedido)

    # Valida COMPRA_CONSIG
    compra_consig_val = str(order_data.get("COMPRA_CONSIG") or "").strip().upper()
    if compra_consig_val not in ("N", "S"):
        return {
            "status": "skipped",
            "detail": f"COMPRA_CONSIG invalido: '{compra_consig_val}' (esperado N ou S)",
        }

    # Verifica duplicidade
    existing = db.query(BookinfoTransmission).filter(
        BookinfoTransmission.company_id == company_id,
        BookinfoTransmission.supplier_id == supplier.id,
        BookinfoTransmission.cod_pedido == cod_pedido,
        BookinfoTransmission.status.in_(["SENT", "SYNCED"]),
    ).first()
    if existing:
        return {"status": "duplicate", "detail": f"Pedido {cod_pedido} ja transmitido (id={existing.id})"}

    dest_list = order_data.get("DADOS_CADASTRAIS_DESTINO", [])
    if not dest_list:
        return {"status": "error", "detail": "DADOS_CADASTRAIS_DESTINO ausente"}
    dest = dest_list[0]

    cnpj_cliente = re.sub(r"\D", "", order_data.get("CNPJ_ORIGEM", ""))
    cnpj_empresa = re.sub(r"\D", "", order_data.get("CNPJ_DESTINO", ""))

    if not cnpj_cliente or not cnpj_empresa:
        return {"status": "error", "detail": "CNPJ_ORIGEM ou CNPJ_DESTINO ausente no pedido"}

    itens_payload = []
    for item in order_data.get("ITENS", []):
        isbn = item.get("COD_BARRA_ITEM") or item.get("COD_BARRA_ITEM_ALT") or ""
        qtd = int(item.get("QT_PEDIDA") or 0)
        desc = _to_float(item.get("PERC_DESCONTO", 0.0))
        preco = _to_float(item.get("VLR_PRECO", 0.0))
        itens_payload.append({
            "qtd": qtd,
            "isbn13": isbn,
            "desconto_negociado": desc,
            "preco_capa": preco,
        })

    compra_consig = "S" if compra_consig_val == "S" else "C"

    bookinfo_payload = {
        "formatoEncomenda": "MODELO_1",
        "payload": {
            "cnpj_cliente": cnpj_cliente,
            "cnpj_empresa": cnpj_empresa,
            "obs_pedido": order_data.get("OBS", ""),
            "obs_nota_fiscal": "",
            "pedido_cliente": str(cod_pedido),
            "metodo_pagamento": "DEPOSITO_A_VISTA",
            "condicao_pagamento_id": None,
            "compra_consignacao": compra_consig,
            "tipo_frete": "CIF",
            "atender_parcial": True,
            "itens": itens_payload,
        },
    }

    # Envia para Bookinfo
    bookinfo_pedido_id = None
    send_error = None
    async with get_bookinfo_client(company_id, db) as client:
        try:
            response = await client.post("/pedido", json=bookinfo_payload, timeout=25.0)
            if response.status_code not in (200, 201):
                raise RuntimeError(f"Bookinfo HTTP {response.status_code}: {response.text}")
            bookinfo_res = response.json()
            bookinfo_pedido_id = bookinfo_res.get("id")
        except Exception as e:
            send_error = str(e)

    horus_cod_empresa = int(dest.get("COD_EMPRESA", 1))
    horus_cod_filial = int(dest.get("COD_FILIAL", 1))
    horus_cod_fornecedor = int(dest.get("COD_FORNECEDOR", 1))
    horus_cod_grp_fornecedor = int(dest.get("COD_GRP_FORNECEDOR", 1))

    if send_error:
        # Persiste como ERROR
        tx = BookinfoTransmission(
            company_id=company_id,
            supplier_id=supplier.id,
            cod_pedido=cod_pedido,
            status="ERROR",
            horus_cod_empresa=horus_cod_empresa,
            horus_cod_filial=horus_cod_filial,
            horus_cod_fornecedor=horus_cod_fornecedor,
            horus_cod_grp_fornecedor=horus_cod_grp_fornecedor,
            error_message=send_error,
            created_at=datetime.utcnow(),
        )
        db.add(tx)
        db.commit()
        return {"status": "error", "detail": send_error}

    # Persiste SENT
    tx = BookinfoTransmission(
        company_id=company_id,
        supplier_id=supplier.id,
        cod_pedido=cod_pedido,
        bookinfo_pedido_id=bookinfo_pedido_id,
        status="SENT",
        horus_cod_empresa=horus_cod_empresa,
        horus_cod_filial=horus_cod_filial,
        horus_cod_fornecedor=horus_cod_fornecedor,
        horus_cod_grp_fornecedor=horus_cod_grp_fornecedor,
        sent_at=datetime.utcnow(),
        created_at=datetime.utcnow(),
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)

    for item in order_data.get("ITENS", []):
        isbn = item.get("COD_BARRA_ITEM") or item.get("COD_BARRA_ITEM_ALT") or ""
        qtd = int(item.get("QT_PEDIDA") or 0)
        t_item = BookinfoTransmissionItem(
            transmission_id=tx.id,
            cod_item=int(item.get("COD_ITEM", 0)),
            cod_barra=isbn,
            nom_item=item.get("NOM_ITEM", ""),
            qt_pedida=qtd,
            situacao_envio="PENDING",
        )
        db.add(t_item)
    db.commit()

    # Marca TRANSMITIDO=S no Horus
    horus_error = None
    try:
        hc = HorusOrders(db, company_id)
        await hc.sta_transmitido_pedido_compra(
            cod_empresa=horus_cod_empresa,
            cod_filial=horus_cod_filial,
            cod_fornecedor=horus_cod_fornecedor,
            cod_grp_fornecedor=horus_cod_grp_fornecedor,
            cod_pedido=cod_pedido,
            transmitido="S",
        )
        await hc.close()
    except Exception as he:
        horus_error = str(he)

    if horus_error:
        return {
            "status": "partial",
            "detail": f"Enviado Bookinfo ({bookinfo_pedido_id}), erro ao marcar Horus: {horus_error}",
        }
    return {"status": "sent", "detail": f"Pedido {cod_pedido} enviado. Bookinfo ID: {bookinfo_pedido_id}"}


async def _sync_transmission(
    db: Session,
    company_id: int,
    transmission: BookinfoTransmission,
) -> dict:
    """
    Sincroniza uma transmissao SENT com o retorno da Bookinfo.
    Nao sincroniza transmissoes finalizadas.
    Retorna: { "status": "synced"|"error"|"skipped", "detail": str }
    """
    from app.api.bookinfo_hub import get_bookinfo_client
    from app.integrators.horus_orders import HorusOrders

    items = db.query(BookinfoTransmissionItem).filter(
        BookinfoTransmissionItem.transmission_id == transmission.id
    ).all()

    if _is_transmission_finalized(transmission, items):
        return {"status": "skipped", "detail": "Transmissao ja finalizada"}

    if not transmission.bookinfo_pedido_id:
        return {"status": "error", "detail": "bookinfo_pedido_id ausente"}

    async with get_bookinfo_client(company_id, db) as client:
        try:
            response = await client.get(f"/pedido/{transmission.bookinfo_pedido_id}", timeout=25.0)
            if response.status_code != 200:
                raise RuntimeError(f"Bookinfo HTTP {response.status_code}: {response.text}")
            bookinfo_data = response.json()
        except Exception as e:
            transmission.status = "ERROR"
            transmission.error_message = f"Sync error: {str(e)}"
            db.commit()
            return {"status": "error", "detail": str(e)}

    bookinfo_items = bookinfo_data.get("itens", [])
    items_map = {bi.get("isbn13"): bi for bi in bookinfo_items if bi.get("isbn13")}

    horus_errors = []
    hc = None
    try:
        hc = HorusOrders(db, company_id)
    except Exception as he:
        horus_errors.append(str(he))

    for t_item in items:
        bi_item = items_map.get(t_item.cod_barra)
        if bi_item:
            status_item = bi_item.get("status")
            t_item.situacao_retorno = status_item
            t_item.obs_item = status_item if status_item else ""
            t_item.synced_at = datetime.utcnow()

            if hc and status_item:
                try:
                    await hc.obs_item_pedido_compra(
                        cod_empresa=transmission.horus_cod_empresa,
                        cod_filial=transmission.horus_cod_filial,
                        cod_fornecedor=transmission.horus_cod_fornecedor,
                        cod_grp_fornecedor=transmission.horus_cod_grp_fornecedor,
                        cod_pedido=transmission.cod_pedido,
                        cod_item=t_item.cod_item,
                        obs_item=t_item.obs_item,
                    )
                except Exception as e:
                    horus_errors.append(f"Item {t_item.cod_barra}: {e}")

    if hc:
        await hc.close()

    transmission.last_sync_at = datetime.utcnow()
    transmission.status = "SYNCED"
    transmission.error_message = None
    db.commit()

    if horus_errors:
        return {"status": "partial", "detail": f"Synced, erros Horus: {'; '.join(horus_errors)}"}
    return {"status": "synced", "detail": f"Transmissao {transmission.id} sincronizada"}


async def _process_supplier(
    db: Session,
    company_id: int,
    supplier: BookinfoSupplier,
) -> BookinfoPurchaseJobLog:
    """
    Processa um fornecedor completo: busca pedidos, envia, sincroniza.
    Retorna o log gravado.
    """
    log = BookinfoPurchaseJobLog(
        company_id=company_id,
        supplier_id=supplier.id,
        supplier_name=supplier.supplier_name or "",
    )
    details = []

    # --- PASSO 1: Busca e envio de novos pedidos ---
    try:
        orders = await _fetch_horus_orders(db, company_id, supplier)
    except Exception as e:
        log.status = "ERROR"
        log.details = json.dumps([{"step": "fetch_horus", "error": str(e)}], ensure_ascii=False)
        db.add(log)
        db.commit()
        logger.error(f"[PurchaseJob] company={company_id} supplier={supplier.id} fetch error: {e}")
        return log

    log.orders_found = len(orders)

    if not orders:
        log.status = "NO_ORDERS"
    else:
        for order_data in orders:
            result = await _send_order_to_bookinfo(db, company_id, supplier, order_data)
            status = result.get("status")
            cod = order_data.get("COD_PEDIDO", "?")
            details.append({"pedido": cod, "acao": "send", **result})

            if status == "sent":
                log.orders_sent += 1
            elif status in ("skipped", "duplicate"):
                log.orders_skipped += 1
            elif status == "error":
                log.orders_error += 1
            elif status == "partial":
                log.orders_sent += 1  # chegou na Bookinfo mas houve erro parcial no Horus

    # --- PASSO 2: Sincronizacao de transmissoes SENT ---
    pending_syncs = db.query(BookinfoTransmission).filter(
        BookinfoTransmission.company_id == company_id,
        BookinfoTransmission.supplier_id == supplier.id,
        BookinfoTransmission.status == "SENT",
        BookinfoTransmission.bookinfo_pedido_id.isnot(None),
    ).all()

    for tx in pending_syncs:
        result = await _sync_transmission(db, company_id, tx)
        status = result.get("status")
        details.append({"transmission_id": tx.id, "pedido": tx.cod_pedido, "acao": "sync", **result})

        if status in ("synced", "partial"):
            log.syncs_done += 1
        elif status == "error":
            log.syncs_error += 1
        # "skipped" nao conta como erro

    # Determina status final do log
    if log.orders_error > 0 or log.syncs_error > 0:
        log.status = "PARTIAL" if (log.orders_sent > 0 or log.syncs_done > 0) else "ERROR"
    elif log.orders_found == 0 and log.syncs_done == 0:
        log.status = "NO_ORDERS"
    else:
        log.status = "SUCCESS"

    log.details = json.dumps(details, ensure_ascii=False)
    db.add(log)
    db.commit()

    logger.info(
        f"[PurchaseJob] company={company_id} supplier={supplier.id} "
        f"found={log.orders_found} sent={log.orders_sent} skipped={log.orders_skipped} "
        f"err={log.orders_error} syncs={log.syncs_done} status={log.status}"
    )
    return log


async def _run_job_async():
    """Funcao assincrona principal do job — itera por todos os sellers habilitados."""
    db: Session = SessionLocal()
    try:
        # Busca todos os sellers com automacao habilitada E com bookinfo_api_key
        active_settings = db.query(CompanySettings).filter(
            CompanySettings.bookinfo_purchase_auto == True,  # noqa: E712
            CompanySettings.bookinfo_api_key.isnot(None),
            CompanySettings.bookinfo_api_key != "",
        ).all()

        if not active_settings:
            logger.info("[PurchaseJob] Nenhum seller com bookinfo_purchase_auto ativo.")
            return

        for settings in active_settings:
            company_id = settings.company_id
            suppliers = db.query(BookinfoSupplier).filter(
                BookinfoSupplier.company_id == company_id
            ).all()

            if not suppliers:
                logger.info(f"[PurchaseJob] company={company_id} sem suppliers cadastrados.")
                continue

            for supplier in suppliers:
                if not supplier.document_origin or not supplier.document_destination:
                    logger.warning(
                        f"[PurchaseJob] company={company_id} supplier={supplier.id} "
                        "sem CNPJ Emissor/Destino — pulando."
                    )
                    continue
                try:
                    await _process_supplier(db, company_id, supplier)
                except Exception as e:
                    logger.error(
                        f"[PurchaseJob] Erro inesperado company={company_id} "
                        f"supplier={supplier.id}: {e}"
                    )
    finally:
        db.close()


def run_bookinfo_purchase_job():
    """
    Ponto de entrada síncrono para o APScheduler (BackgroundScheduler).
    Cria um novo event loop e roda o job assíncrono.
    """
    logger.info("[PurchaseJob] Iniciando ciclo de pedidos de compra Bookinfo...")
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(_run_job_async())
    except Exception as e:
        logger.error(f"[PurchaseJob] Erro critico no job: {e}")
    finally:
        loop.close()
    logger.info("[PurchaseJob] Ciclo concluido.")

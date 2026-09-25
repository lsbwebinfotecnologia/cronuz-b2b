import json
import logging
import math
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.logistics_settings import LogisticsSettings
from app.models.logistics_order import LogisticsOrder
from app.models.logistics_order_log import LogisticsOrderLog
from app.models.company_settings import CompanySettings
from app.integrators.horus_logistics import HorusLogisticsClient
from app.integrators.logistics.base_provider import LogisticsProvider

logger = logging.getLogger("cronuz.logistics_check_job")


def _record_logistics_log(
    db: Session,
    company_id: int,
    cod_ped_venda: int,
    action: str,
    status: str,
    request_data: Any = None,
    response_data: Any = None,
    message: str = None
):
    """Grava log detalhado do ciclo de vida logístico e conferência de pedidos (expurgo de 30 dias)."""
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
        logger.warning(f"[LogisticsCheckJob.Log] Erro ao gravar log para pedido #{cod_ped_venda}: {e}")
        try:
            db.rollback()
        except Exception:
            pass


async def process_company_logistics_check(db: Session, company_id: int) -> Dict[str, Any]:
    """
    Processa a conferência dos pedidos que tiveram picking finalizado no WMS (MKT)
    para uma empresa específica e libera para faturamento (LFT) no ERP Horus.
    """
    log_settings = db.query(LogisticsSettings).filter(
        LogisticsSettings.company_id == company_id,
        LogisticsSettings.enabled == True
    ).first()

    if not log_settings or not log_settings.api_url or not log_settings.login or not log_settings.password:
        return {"processed": 0, "conferred": 0, "errors": 0, "message": "Logística inativa ou sem credenciais"}

    cmp_settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not cmp_settings or not cmp_settings.horus_enabled:
        return {"processed": 0, "conferred": 0, "errors": 0, "message": "Horus desativado para a empresa"}

    now_dt = datetime.now(timezone.utc)
    # Limita a no máximo 3 dias para garantir consulta leve e não estourar rate limit da MKT
    start_date = (now_dt - timedelta(days=3)).strftime("%Y-%m-%d")
    end_date = now_dt.strftime("%Y-%m-%d")

    provider = LogisticsProvider.factory(log_settings.provider, log_settings)

    try:
        # Executa uma única requisição no WMS para tratar todos os pedidos conferidos
        movements = await provider.get_movements(start_date, end_date, situacao="aguardando_nfe", max_pages=1)
    except Exception as e:
        logger.error(f"[LogisticsCheckJob] Erro ao consultar WMS para empresa {company_id}: {e}")
        return {"processed": 0, "conferred": 0, "errors": 1, "message": f"Erro WMS: {e}"}

    if not movements:
        return {"processed": 0, "conferred": 0, "errors": 0, "message": "Nenhum movimento pendente de conferência"}

    cod_empresa_padrao = str(getattr(cmp_settings, 'horus_company', '') or '1').strip()
    cod_filial_padrao = str(getattr(cmp_settings, 'horus_branch', '') or '2').strip()
    cod_local_cfg = str(getattr(log_settings, 'stock_local', '') or getattr(cmp_settings, 'horus_stock_local', '') or '').strip()

    horus_client = HorusLogisticsClient(db, company_id)
    stats = {"processed": 0, "conferred": 0, "invoiced": 0, "errors": 0, "skipped": 0}

    # Importa função de envio de NFe para aproveitar a mesma consulta
    from app.jobs.logistics_invoice_job import send_single_invoice_to_wms

    try:
        for item in movements:
            if not isinstance(item, dict):
                continue

            mov = item.get("Movimento") or {}
            rem = item.get("RemessaPedido") or {}
            leg = item.get("LegadoPedido") or {}

            raw_hs = mov.get("codigo_referencia") or rem.get("pedido_numero") or item.get("codigo") or item.get("codigo_referencia")
            if not raw_hs:
                continue

            try:
                ped_num = int(str(raw_hs).strip())
            except (ValueError, TypeError):
                continue

            # Checa picking finalizado
            has_picking = bool(mov.get("picking_dh_finish") or str(mov.get("situacao", "")).lower() in ["aguardando_nfe", "conferida", "faturada"])
            if not has_picking:
                continue

            stats["processed"] += 1

            local_order = db.query(LogisticsOrder).filter(
                LogisticsOrder.company_id == company_id,
                LogisticsOrder.cod_ped_venda == ped_num
            ).first()

            raw_wms_id = leg.get("id") or rem.get("id") or mov.get("id") or item.get("id") or item.get("legado_pedido_id")
            wms_id_str = str(raw_wms_id).strip() if raw_wms_id else None

            # Consulta status atual no Horus ERP
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
                stats["errors"] += 1
                continue

            status_erp = str(ord_horus.get("STATUS_PEDIDO_VENDA") or ord_horus.get("STA_PEDIDO_VENDA") or "").strip().upper()
            cod_cli = ord_horus.get("COD_CLI")
            cod_empresa = str(ord_horus.get("COD_EMPRESA") or cod_empresa_padrao).strip()
            cod_filial = str(ord_horus.get("COD_FILIAL") or cod_filial_padrao).strip()

            # Resolve local de estoque apropriado para a filial
            cod_local = cod_local_cfg
            if not cod_local or cod_local in ["1", "2", "5"]:
                if str(cod_filial) == "2":
                    cod_local = "15"  # EO-TRANSPO
                elif str(cod_filial) == "1":
                    cod_local = "9"   # CV-TRANSPO
                else:
                    cod_local = "15"

            if status_erp == "CAN":
                if local_order:
                    local_order.situation = "CANCELLED"
                    local_order.status_horus = "CAN"
                    db.commit()
                stats["skipped"] += 1
                continue

            # Se o pedido já estiver FATURADO (FAT) no Horus, já aproveita e envia a NFe para o WMS!
            if status_erp == "FAT":
                if wms_id_str:
                    logger.info(f"[LogisticsCheckJob] Pedido #{ped_num} já está FAT no Horus. Enviando NFe imediatamente para WMS...")
                    inv_sent = await send_single_invoice_to_wms(
                        db=db,
                        company_id=company_id,
                        ped_num=ped_num,
                        id_ord_sys_log=wms_id_str,
                        cod_cli=str(cod_cli),
                        cod_empresa=cod_empresa,
                        cod_filial=cod_filial,
                        horus_client=horus_client,
                        provider=provider,
                        log_settings=log_settings,
                        order=local_order
                    )
                    if inv_sent:
                        stats["invoiced"] += 1
                    else:
                        stats["errors"] += 1
                else:
                    if local_order:
                        local_order.situation = "CHECKED"
                        local_order.status_horus = "FAT"
                        db.commit()
                    stats["skipped"] += 1
                continue

            # Se já estiver LFT no ERP e localmente atualizado, pula
            if status_erp == "LFT":
                if local_order:
                    local_order.situation = "CHECKED"
                    local_order.status_horus = "LFT"
                    if not local_order.checked_at:
                        local_order.checked_at = now_dt
                    if wms_id_str and not local_order.id_ord_sys_log:
                        local_order.id_ord_sys_log = wms_id_str
                    db.commit()
                stats["skipped"] += 1
                continue

            # CASO PENDENTE DE CONFERÊNCIA (LEX, IMP, CON ou ABERTO):
            # 1. Confere itens no Horus atentando-se à quantidade real bipada
            items_mkt = item.get("MovimentoItensPedido") or []
            total_volumes = int(mov.get("total_volumes") or rem.get("volumes") or 1)
            total_weights = float(mov.get("total_pesos") or 0.5)

            all_items_ok = True
            for mkt_it in items_mkt:
                qty_bom = 0.0
                inner_mov = mkt_it.get("MovimentoItensPedido")
                if inner_mov and isinstance(inner_mov, list) and len(inner_mov) > 0 and isinstance(inner_mov[0], dict):
                    qty_bom = abs(float(inner_mov[0].get("quantidade_bom") or 0.0))
                elif "quantidade_bom" in mkt_it:
                    qty_bom = abs(float(mkt_it.get("quantidade_bom") or 0.0))
                elif "quantidade" in mkt_it:
                    qty_bom = abs(float(mkt_it.get("quantidade") or 0.0))

                qty_atendida = int(round(qty_bom))
                if qty_atendida <= 0:
                    continue

                prod_info = mkt_it.get("Produto") or {}
                cod_item_raw = prod_info.get("codigo_cliente") or mkt_it.get("cProd") or mkt_it.get("codigo")
                ean_raw = prod_info.get("codigo_barras") or mkt_it.get("cEAN") or mkt_it.get("ean")

                cod_item_final = str(cod_item_raw or "").strip()
                if len(cod_item_final) == 13 or (not cod_item_final and ean_raw):
                    isbn_to_search = ean_raw or cod_item_final
                    try:
                        acervo_res = await horus_client.busca_acervo_isbn(str(isbn_to_search), cod_empresa=cod_empresa, cod_filial=cod_filial)
                        if acervo_res and isinstance(acervo_res, list) and len(acervo_res) > 0:
                            first_ac = acervo_res[0]
                            if first_ac.get("COD_ITEM"):
                                cod_item_final = str(first_ac.get("COD_ITEM"))
                    except Exception:
                        pass

                if not cod_item_final:
                    cod_item_final = str(ean_raw or "")

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
                    _record_logistics_log(
                        db=db,
                        company_id=company_id,
                        cod_ped_venda=ped_num,
                        action="CONFERENCE_ITEM",
                        status="SUCCESS",
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
                        pass
                    else:
                        logger.error(f"[LogisticsCheckJob] Falha confere item {cod_item_final} ped {ped_num}: {e_conf}")
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
                stats["errors"] += 1
                continue

            # 2. Volumes e pesos
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
                except Exception:
                    pass

            # 3. Altera status para LFT no Horus ERP via AltStatus_Pedido oficial da API
            try:
                alt_res = await horus_client.alt_status_pedido(
                    cod_empresa=cod_empresa,
                    cod_filial=cod_filial,
                    cod_cli=str(cod_cli),
                    cod_ped_venda=ped_num,
                    sta_pedido="LFT"
                )
                _record_logistics_log(
                    db=db,
                    company_id=company_id,
                    cod_ped_venda=ped_num,
                    action="ALT_STATUS_LFT",
                    status="SUCCESS",
                    request_data={"COD_EMPRESA": cod_empresa, "COD_FILIAL": cod_filial, "STA_PEDIDO": "LFT"},
                    response_data=alt_res,
                    message="Status alterado para LFT no Horus com sucesso."
                )
            except Exception as e_alt:
                logger.error(f"[LogisticsCheckJob] Falha ao mudar status para LFT ped {ped_num}: {e_alt}")
                _record_logistics_log(
                    db=db,
                    company_id=company_id,
                    cod_ped_venda=ped_num,
                    action="ALT_STATUS_LFT",
                    status="ERROR",
                    request_data={"COD_EMPRESA": cod_empresa, "COD_FILIAL": cod_filial, "STA_PEDIDO": "LFT"},
                    response_data=str(e_alt),
                    message=f"Erro ao alterar status para LFT: {e_alt}"
                )

            # 4. Salva no banco local
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
            stats["conferred"] += 1
            logger.info(f"[LogisticsCheckJob] Pedido #{ped_num} conferido e liberado (LFT) via API com sucesso.")

    finally:
        await horus_client.close()

    return stats


async def run_logistics_check_job():
    """
    Executa a conferência automática WMS para todas as empresas ativas com auto_check ligado.
    """
    db = SessionLocal()
    try:
        active_settings = db.query(LogisticsSettings).filter(
            LogisticsSettings.enabled == True,
            LogisticsSettings.feature_auto_check == True
        ).all()

        for st in active_settings:
            try:
                res = await process_company_logistics_check(db, st.company_id)
                logger.info(f"[LogisticsCheckJob] Conferência Empresa {st.company_id}: {res}")

                # Verifica se há pedidos conferidos que viraram FAT no Horus para envio de NF
                from app.jobs.logistics_invoice_job import process_company_logistics_invoice
                inv_res = await process_company_logistics_invoice(db, st.company_id)
                logger.info(f"[LogisticsInvoiceJob] Faturamento Empresa {st.company_id}: {inv_res}")
            except Exception as e:
                logger.error(f"[LogisticsCheckJob] Erro na empresa {st.company_id}: {e}")
    finally:
        db.close()

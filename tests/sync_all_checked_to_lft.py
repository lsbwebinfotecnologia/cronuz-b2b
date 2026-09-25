import asyncio
import os
import sys
import logging
from datetime import datetime, timezone, timedelta

# Configura paths
sys.path.insert(0, '/var/www/cronuz/backend')
os.chdir('/var/www/cronuz/backend')

import main
from app.db.session import SessionLocal
from app.models.logistics_order import LogisticsOrder
from app.models.logistics_settings import LogisticsSettings
from app.models.company_settings import CompanySettings
from app.integrators.logistics.base_provider import LogisticsProvider
from app.integrators.horus_logistics import HorusLogisticsClient

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger('sync_all_checked_to_lft')

async def run_sync(company_id: int = 22):
    db = SessionLocal()
    st = db.query(LogisticsSettings).filter(LogisticsSettings.company_id == company_id).first()
    cmp_st = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()

    if not st or not cmp_st:
        logger.error(f"Configurações da empresa {company_id} não encontradas.")
        return

    provider = LogisticsProvider.factory(st.provider, st)
    horus = HorusLogisticsClient(db, company_id)

    cod_empresa_padrao = str(getattr(cmp_st, 'horus_company', '') or '1').strip()
    cod_filial_padrao = str(getattr(cmp_st, 'horus_branch', '') or '2').strip()
    cod_local_cfg = str(getattr(st, 'stock_local', '') or getattr(cmp_st, 'horus_stock_local', '') or '').strip()

    logger.info("=== PASSO 1: CARREGANDO MOVIMENTOS DO WMS MKT EM JANELAS SEGURAS ===")
    
    # Gera janelas de 2 dias dos últimos 14 dias para evitar 429 e estourar o limite de 50 por página
    now_dt = datetime.now(timezone.utc)
    windows = []
    for day_offset in range(0, 14, 2):
        w_end = (now_dt - timedelta(days=day_offset)).strftime("%Y-%m-%d")
        w_start = (now_dt - timedelta(days=day_offset + 1)).strftime("%Y-%m-%d")
        windows.append((w_start, w_end))

    all_wms_items = []
    for (w_start, w_end) in windows:
        logger.info(f"Buscando janela WMS MKT: {w_start} até {w_end}...")
        for retry in range(3):
            try:
                await asyncio.sleep(4.0)  # Delay preventivo anti-429
                movs = await provider.get_movements(start_date=w_start, end_date=w_end)
                if movs:
                    all_wms_items.extend(movs)
                    logger.info(f"  Janela {w_start}..{w_end}: {len(movs)} movimentos encontrados.")
                else:
                    logger.info(f"  Janela {w_start}..{w_end}: 0 movimentos.")
                break
            except Exception as e:
                logger.warning(f"  Aviso janela {w_start}..{w_end} (tentativa {retry+1}): {e}. Aguardando 12s...")
                await asyncio.sleep(12.0)

    logger.info(f"Total de movimentos brutos obtidos no WMS: {len(all_wms_items)}")

    # Indexa movimentos por código de pedido Horus
    movements_by_ped = {}
    for item in all_wms_items:
        mov = item.get("Movimento") or {}
        rem = item.get("RemessaPedido") or {}
        raw_ref = mov.get("codigo_referencia") or rem.get("pedido_numero") or item.get("codigo") or item.get("codigo_referencia")
        if not raw_ref:
            continue
        try:
            ped_num = int(str(raw_ref).strip())
            if ped_num not in movements_by_ped or (item.get("MovimentoItensPedido") and not movements_by_ped[ped_num].get("MovimentoItensPedido")):
                movements_by_ped[ped_num] = item
        except Exception:
            pass

    logger.info(f"Movimentos únicos indexados por pedido: {len(movements_by_ped)}")

    # PASSO 2: Identifica pedidos que foram finalizados no WMS
    logger.info("=== PASSO 2: IDENTIFICANDO PEDIDOS CONFERIDOS NO WMS PARA ATUALIZAR HORUS ===")
    
    checked_in_wms = []
    for ped_num, item_wms in movements_by_ped.items():
        mov = item_wms.get("Movimento") or {}
        sit = str(mov.get("situacao") or item_wms.get("situacao") or "").lower()
        dt_pick = mov.get("picking_dh_finish")
        if dt_pick or sit in ["aguardando_nfe", "conferida", "faturada"]:
            checked_in_wms.append(ped_num)

    checked_in_wms.sort(reverse=True)
    logger.info(f"Pedidos com conferência finalizada no WMS MKT: {len(checked_in_wms)}")

    stats = {
        "total_analisados": 0,
        "atualizados_lft": 0,
        "ja_estavam_lft": 0,
        "ja_estavam_fat": 0,
        "cancelados": 0,
        "erros": 0
    }

    for ped_num in checked_in_wms:
        stats["total_analisados"] += 1
        item_wms = movements_by_ped[ped_num]
        mov = item_wms.get("Movimento") or {}
        rem = item_wms.get("RemessaPedido") or {}
        leg = item_wms.get("LegadoPedido") or {}

        raw_wms_id = leg.get("id") or rem.get("id") or mov.get("id") or item_wms.get("id") or item_wms.get("legado_pedido_id")
        wms_id_str = str(raw_wms_id).strip() if raw_wms_id else None

        # Busca registro local
        order = db.query(LogisticsOrder).filter(
            LogisticsOrder.company_id == company_id,
            LogisticsOrder.cod_ped_venda == ped_num
        ).first()

        # Consulta status no Horus ERP
        ord_horus = None
        for try_filial in [cod_filial_padrao, "2", "1"]:
            try:
                res_h = await horus.get("Busca_PedidosVenda", params={
                    "COD_EMPRESA": cod_empresa_padrao,
                    "COD_FILIAL": try_filial,
                    "COD_PED_VENDA": ped_num
                })
                if res_h and isinstance(res_h, list) and len(res_h) > 0:
                    first_h = res_h[0]
                    if not (first_h.get("Falha") or first_h.get("FALHA") == "S"):
                        ord_horus = first_h
                        break
            except Exception:
                pass

        if not ord_horus:
            logger.warning(f"Pedido #{ped_num} não localizado no Horus ERP.")
            stats["erros"] += 1
            continue

        status_erp = str(ord_horus.get("STATUS_PEDIDO_VENDA") or ord_horus.get("STA_PEDIDO_VENDA") or "").strip().upper()
        cod_cli = str(ord_horus.get("COD_CLI") or (order.cod_cli if order else "")).strip()
        cod_empresa = str(ord_horus.get("COD_EMPRESA") or cod_empresa_padrao).strip()
        cod_filial = str(ord_horus.get("COD_FILIAL") or cod_filial_padrao).strip()

        if status_erp == "LFT":
            if order:
                order.status_horus = "LFT"
                order.situation = "CHECKED"
                if wms_id_str and not order.id_ord_sys_log:
                    order.id_ord_sys_log = wms_id_str
                db.commit()
            stats["ja_estavam_lft"] += 1
            logger.info(f"Pedido #{ped_num}: Já está LFT no Horus.")
            continue

        if status_erp == "FAT":
            if order:
                order.status_horus = "FAT"
                order.situation = "CHECKED"
                if wms_id_str and not order.id_ord_sys_log:
                    order.id_ord_sys_log = wms_id_str
                db.commit()
            stats["ja_estavam_fat"] += 1
            logger.info(f"Pedido #{ped_num}: Já está FAT no Horus.")
            continue

        if status_erp == "CAN":
            if order:
                order.status_horus = "CAN"
                order.situation = "CANCELLED"
                db.commit()
            stats["cancelados"] += 1
            logger.info(f"Pedido #{ped_num}: Está CANCELADO no Horus.")
            continue

        # CASO LEX ou IMP: Executa a conferência completa no Horus
        logger.info(f"===> ATUALIZANDO Pedido #{ped_num} (Horus status: {status_erp}) -> Conferindo e alterando para LFT...")

        # Resolve local de estoque correto
        cod_local = cod_local_cfg
        if not cod_local or cod_local in ["1", "2", "5"]:
            cod_local = "15" if str(cod_filial) == "2" else "9"

        # 1. Confere Itens do Pedido no Horus
        items_mkt = item_wms.get("MovimentoItensPedido") or []
        for mkt_it in items_mkt:
            prod_info = mkt_it.get("Produto") or {}
            cod_item_raw = prod_info.get("codigo_cliente") or mkt_it.get("cProd") or mkt_it.get("codigo")
            ean_raw = prod_info.get("codigo_barras") or mkt_it.get("cEAN") or mkt_it.get("ean")
            qty_raw = mkt_it.get("quantidade_bom") or mkt_it.get("quantidade") or 1
            qty_atendida = abs(int(round(float(qty_raw))))
            if qty_atendida <= 0:
                qty_atendida = 1

            cod_item_final = str(cod_item_raw or "").strip()
            if not cod_item_final and ean_raw:
                cod_item_final = str(ean_raw)

            try:
                await horus.confere_item_pedido(
                    cod_empresa=cod_empresa,
                    cod_filial=cod_filial,
                    cod_cli=cod_cli,
                    cod_ped_venda=str(ped_num),
                    cod_item=cod_item_final,
                    cod_local=cod_local,
                    qtd_atendida=qty_atendida
                )
            except Exception as e_conf:
                err_s = str(e_conf).upper()
                if "JÁ CONFERIDO" in err_s or "JA CONFERIDO" in err_s:
                    pass
                else:
                    logger.warning(f"  Item {cod_item_final} ped #{ped_num}: {e_conf}")

        # 2. Insere Volume no Horus
        total_vols = int(mov.get("total_volumes") or rem.get("volumes") or 1)
        total_peso = float(mov.get("total_pesos") or 0.5)
        try:
            await horus.ins_volume_pedido(
                cod_empresa=cod_empresa,
                cod_filial=cod_filial,
                cod_cli=cod_cli,
                cod_ped_venda=str(ped_num),
                cod_volume=1,
                pes_volume=max(0.1, total_peso)
            )
        except Exception:
            pass

        # 3. Altera Status para LFT no Horus
        try:
            await horus.alt_status_pedido(
                cod_empresa=cod_empresa,
                cod_filial=cod_filial,
                cod_cli=cod_cli,
                cod_ped_venda=ped_num,
                sta_pedido="LFT"
            )

            # Atualiza no banco local se o pedido existir
            if order:
                order.status_horus = "LFT"
                order.situation = "CHECKED"
                order.checked_at = now_dt
                if wms_id_str:
                    order.id_ord_sys_log = wms_id_str
                order.error_log = None
                db.commit()

            stats["atualizados_lft"] += 1
            logger.info(f"  [SUCESSO] Pedido #{ped_num} foi alterado para LFT no Horus com sucesso!")
        except Exception as e_alt:
            logger.error(f"  [FALHA] AltStatus LFT pedido #{ped_num}: {e_alt}")
            stats["erros"] += 1

        await asyncio.sleep(0.3)

    logger.info("==================================================")
    logger.info("=== RESULTADO DA ATUALIZAÇÃO GERAL PARA LFT ===")
    logger.info(f"Total de pedidos analisados: {stats['total_analisados']}")
    logger.info(f"Novos pedidos atualizados para LFT no Horus: {stats['atualizados_lft']}")
    logger.info(f"Pedidos que já estavam em LFT: {stats['ja_estavam_lft']}")
    logger.info(f"Pedidos que já estavam em FAT: {stats['ja_estavam_fat']}")
    logger.info(f"Pedidos cancelados: {stats['cancelados']}")
    logger.info(f"Erros de atualização: {stats['erros']}")
    logger.info("==================================================")

    await horus.close()
    db.close()

if __name__ == '__main__':
    asyncio.run(run_sync(22))

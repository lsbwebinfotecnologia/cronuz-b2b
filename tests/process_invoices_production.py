import asyncio
import os
import sys
import logging

sys.path.insert(0, "/var/www/cronuz/backend")
os.chdir("/var/www/cronuz/backend")

import main
from app.db.session import SessionLocal
from app.models.logistics_order import LogisticsOrder
from app.models.logistics_settings import LogisticsSettings
from app.models.company_settings import CompanySettings
from app.integrators.logistics.base_provider import LogisticsProvider
from app.integrators.horus_logistics import HorusLogisticsClient
from app.jobs.logistics_invoice_job import send_single_invoice_to_wms

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("process_invoices")

async def run(company_id: int = 22):
    db = SessionLocal()
    st = db.query(LogisticsSettings).filter(LogisticsSettings.company_id == company_id).first()
    cmp_st = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()

    if not st or not cmp_st:
        print("Configurações não encontradas.")
        return

    provider = LogisticsProvider.factory(st.provider, st)
    horus = HorusLogisticsClient(db, company_id)

    cod_empresa_padrao = str(getattr(cmp_st, "horus_company", "") or "1").strip()
    cod_filial_padrao = str(getattr(cmp_st, "horus_branch", "") or "2").strip()

    # Busca pedidos com número de logística e que ainda não estão marcados como INVOICED
    orders = db.query(LogisticsOrder).filter(
        LogisticsOrder.company_id == company_id,
        LogisticsOrder.id_ord_sys_log.isnot(None),
        LogisticsOrder.situation != "INVOICED"
    ).order_by(LogisticsOrder.cod_ped_venda.desc()).all()

    logger.info(f"Total de pedidos com ID no WMS pendentes de NFe: {len(orders)}")

    results = []
    for ord_obj in orders:
        ped_num = ord_obj.cod_ped_venda
        id_wms = ord_obj.id_ord_sys_log

        # 1. Consulta no Horus para saber se já faturou (FAT)
        ord_h = None
        for fil in [cod_filial_padrao, "2", "1"]:
            try:
                res_h = await horus.get("Busca_PedidosVenda", params={
                    "COD_EMPRESA": cod_empresa_padrao,
                    "COD_FILIAL": fil,
                    "COD_PED_VENDA": ped_num
                })
                if res_h and isinstance(res_h, list) and len(res_h) > 0:
                    first_h = res_h[0]
                    if not (first_h.get("Falha") or first_h.get("FALHA") == "S"):
                        ord_h = first_h
                        break
            except Exception:
                pass

        if not ord_h:
            continue

        status_erp = str(ord_h.get("STATUS_PEDIDO_VENDA") or ord_h.get("STA_PEDIDO_VENDA") or "").strip().upper()
        cod_cli = str(ord_h.get("COD_CLI") or ord_obj.cod_cli or "").strip()
        cod_empresa = str(ord_h.get("COD_EMPRESA") or cod_empresa_padrao).strip()
        cod_filial = str(ord_h.get("COD_FILIAL") or cod_filial_padrao).strip()

        # Atualiza status_horus no banco local se mudou
        if ord_obj.status_horus != status_erp:
            ord_obj.status_horus = status_erp
            db.commit()

        if status_erp == "CAN":
            ord_obj.situation = "CANCELLED"
            db.commit()
            continue

        if status_erp != "FAT":
            # Ainda não está faturado no ERP (está LFT ou LEX)
            continue

        # PEDIDO ESTÁ FAT! Envia a NFe para o WMS MKT
        logger.info(f"===> Pedido #{ped_num} (WMS ID: {id_wms}) está FAT! Enviando NFe para MKT...")
        
        success = await send_single_invoice_to_wms(
            db=db,
            company_id=company_id,
            ped_num=ped_num,
            id_ord_sys_log=str(id_wms),
            cod_cli=cod_cli,
            cod_empresa=cod_empresa,
            cod_filial=cod_filial,
            horus_client=horus,
            provider=provider,
            log_settings=st,
            order=ord_obj
        )

        if success:
            logger.info(f"  [CONFIRMADO] Pedido #{ped_num} | NF: {ord_obj.nfe_number} | Chave: {ord_obj.key_nfe} enviada com SUCESSO!")
            results.append({
                "pedido": ped_num,
                "wms_id": id_wms,
                "nfe": ord_obj.nfe_number,
                "chave": ord_obj.key_nfe,
                "status": "ENVIADO COM SUCESSO"
            })
        else:
            logger.warning(f"  [FALHA] Pedido #{ped_num} não enviou NF. Detalhe: {ord_obj.error_log}")
            results.append({
                "pedido": ped_num,
                "wms_id": id_wms,
                "status": f"FALHA: {ord_obj.error_log}"
            })

        await asyncio.sleep(1.5)  # Delay preventivo entre transmissões

    logger.info("==========================================")
    logger.info(f"Total de Notas Enviadas: {len([r for r in results if r.get('status') == 'ENVIADO COM SUCESSO'])}")
    for r in results:
        print(r)
    logger.info("==========================================")

    await horus.close()
    db.close()

if __name__ == "__main__":
    asyncio.run(run(22))

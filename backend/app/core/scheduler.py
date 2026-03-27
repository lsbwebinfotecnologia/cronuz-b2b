from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session
from app.db.session import SessionLocal

from app.models.order import Order
from app.models.company_settings import CompanySettings
from app.models.company import Company
from app.models.customer import Customer

import asyncio
import json
import logging

logger = logging.getLogger(__name__)

# Temporary: For later refactoring to share HTTP client
import httpx

def get_db_session():
    return SessionLocal()

def run_async(coro):
    """Utility to run async functions synchronously in APScheduler threads"""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)

# -----------------
# JOB 3: Sincronização de Status (Horus -> Cronuz)
# -----------------
def sync_horus_order_status():
    """
    Job 3: Busca pedidos no Cronuz que foram enviados para o Horus (SENT_TO_HORUS / DISPATCH),
    consulta a API do Horus, e se o status for FATURADO (FAT), atualiza a NFe no Cronuz.
    """
    logger.info("Executando Job 3: Sincronização Horus -> Cronuz...")
    db = get_db_session()
    try:
        from app.integrators.horus_orders import HorusOrders
        
        # Filtra os pedidos que precisam de acompanhamento
        orders = db.query(Order).filter(
            Order.origin == "bookinfo",
            # Order.status == "PROCESSING" # ou SENT_TO_HORUS (depende de como está no seu banco)
        ).all()
        
        for order in orders:
            # Pula pedidos já faturados e concluídos
            if order.invoice_xml is not None:
                continue

            customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
            company = db.query(Company).filter(Company.id == order.company_id).first()
            settings = db.query(CompanySettings).filter(CompanySettings.company_id == order.company_id).first()
            
            if not settings or not settings.horus_enabled:
                continue
                
            async def _fetch_horus_status():
                horus_client = HorusOrders(settings, db=db, company_id=order.company_id)
                await horus_client.authenticate()
                
                horus_data = await horus_client.get_order(
                    id_doc=customer.document if customer else None,
                    id_guid=customer.id_guid if customer else None,
                    cnpj_destino=company.document if company else None,
                    cod_pedido_origem=None if order.origin == "bookinfo" else order.id,
                    cod_ped_venda=order.horus_pedido_venda if order.origin == "bookinfo" else None,
                    ignore_customer_context=(order.origin == "bookinfo")
                )
                await horus_client.close()
                return horus_data

            try:
                raw_horus_data = run_async(_fetch_horus_status())
            except Exception as e:
                logger.error(f"Erro ao consultar pedido {order.id} no Horus: {str(e)}")
                continue
                
            if raw_horus_data and isinstance(raw_horus_data, list) and len(raw_horus_data) > 0:
                horus_order = raw_horus_data[0]
                
                status_venda = horus_order.get("STATUS_PEDIDO_VENDA", "")
                if status_venda == "FAT":
                    nf = horus_order.get("NOTA_FISCAL")
                    if nf and isinstance(nf, dict):
                        xml_base64 = nf.get("XML_Base64")
                        nro_nf = nf.get("NRO_NOTA_FISCAL")
                        chave_nfe = nf.get("CHAVE_ACESSO_NFE")
                        
                        if xml_base64 and order.invoice_xml != xml_base64:
                            order.invoice_xml = xml_base64
                            order.invoice_number = nro_nf
                            order.invoice_key = chave_nfe
                            order.status = "INVOICED"
                            logger.info(f"Pedido {order.id} marcado como FATURADO com NF {nro_nf}")
                            db.commit()

    except Exception as e:
        logger.error(f"Erro geral no Job 3: {str(e)}")
    finally:
        db.close()


# -----------------
# JOB 4: Devolutiva Final (Cronuz -> Bookinfo)
# -----------------
def send_nfe_to_bookinfo():
    """
    Job 4: Pega os pedidos INVOICED no Cronuz (origin=bookinfo) que ainda não tiveram a NF
    enviada de volta para a Bookinfo, e dispara a requisição.
    """
    logger.info("Executando Job 4: Devolutiva de NF para Bookinfo...")
    db = get_db_session()
    try:
        from app.models.integrator import Integrator
        
        # Filtra os pedidos originários da bookinfo, já faturados, que não tiveram NF enviada
        orders = db.query(Order).filter(
            Order.origin == "bookinfo",
            Order.invoice_xml.isnot(None),
            Order.bookinfo_nfe_sent == False
        ).all()

        for order in orders:
            # Buscar configs da bookinfo via Integrator
            config = db.query(Integrator).filter(
                Integrator.company_id == order.company_id,
                Integrator.platform == "BOOKINFO",
                Integrator.active == True
            ).first()
            
            if not config or not config.credentials:
                continue
                
            try:
                creds = json.loads(config.credentials) if isinstance(config.credentials, str) else config.credentials
            except Exception:
                continue
                
            env = creds.get("Ambiente", "PROD")
            token = creds.get("Token", "")
            if not token:
                continue
                
            base_url = "https://bookhub-api.bookinfo.com.br" if env == "PROD" else "https://bookhub-api-hml.bookinfo.com.br"
            bookinfo_pedido_id = order.tracking_code

            payload = {
                "base64": order.invoice_xml,
                "tipo_arquivo": "application/xml",
                "nome_arquivo": f"NFe_{order.invoice_number or 'Autorizada'}.xml"
            }
            
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
            
            endpoint = f"{base_url}/pedido/{bookinfo_pedido_id}/nota-fiscal/base64"
            
            try:
                response = httpx.post(endpoint, headers=headers, json=payload, timeout=20.0, verify=False)
                if response.status_code in [200, 201, 204]:
                    order.bookinfo_nfe_sent = True
                    logger.info(f"[JOB 4] NFe enviada com sucesso para Bookinfo. ID Cronuz: {order.id}")
                    db.commit()
                else:
                    logger.error(f"[JOB 4] Falha ao enviar NFe para Bookinfo. Pedido {order.id}. Status: {response.status_code} - {response.text}")
            except Exception as e:
                logger.error(f"Erro ao disparar HTTP POST para Bookinfo: {str(e)}")

    except Exception as e:
        logger.error(f"Erro geral no Job 4: {str(e)}")
    finally:
        db.close()


# -----------------
# Schedulers init
# -----------------
scheduler = BackgroundScheduler(timezone="America/Sao_Paulo")

def start_scheduler():
    # Sync status from Horus every 15 minutes
    scheduler.add_job(sync_horus_order_status, IntervalTrigger(minutes=15), id="job_sync_horus")
    
    # Send NFE back to Bookinfo every 15 minutes (offset by 2 minutes) 
    scheduler.add_job(send_nfe_to_bookinfo, IntervalTrigger(minutes=17), id="job_send_nfe_bookinfo")
    
    scheduler.start()
    logger.info("Cronuz BG Scheduler Started - Jobs: Horus Sync & Bookinfo NFe Return")

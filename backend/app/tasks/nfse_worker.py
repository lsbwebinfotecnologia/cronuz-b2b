import os
import logging
from datetime import datetime
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.nfse import NFSeQueue, NFSeQueueStatus
from app.models.service import ServiceOrder, Service, ServiceOrderNfseStatus
from app.models.company import Company
from app.models.customer import Customer, Address
from app.integrators.nfse.factory import NFSeFactory

logger = logging.getLogger(__name__)

def process_nfse_queue_jobs():
    """
    Trabalhador background para varrer a fila de NFS-e (svc_nfse_queue)
    que estão PENDING e enviá-las para a API Nacional do Serpro.
    Rodará a cada 15 minutos pelo scheduler.
    """
    logger.info("[NFS-e Worker] Iniciando processamento da fila fiscal...")
    db = SessionLocal()
    try:
        # Pega as mensagens pendentes (ou em erro com poucas retentativas)
        queue_items = db.query(NFSeQueue).filter(
            NFSeQueue.status.in_([NFSeQueueStatus.PENDING])
        ).all()
        
        if not queue_items:
            logger.info("[NFS-e Worker] Fila vazia. Nenhuma nota para emitir agora.")
            return

        logger.info(f"[NFS-e Worker] Encontradas {len(queue_items)} ordens na fila de emissão.")
        for job in queue_items:
            # 1. Update job to PROCESSING
            job.status = NFSeQueueStatus.PROCESSING
            db.commit()
            
            try:
                # 2. Setup relations
                order = db.query(ServiceOrder).filter(ServiceOrder.id == job.service_order_id).first()
                if not order:
                    raise Exception(f"OS {job.service_order_id} não encontrada.")
                    
                service = db.query(Service).filter(Service.id == order.service_id).first()
                customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
                address = db.query(Address).filter(Address.customer_id == customer.id).first()
                company = db.query(Company).filter(Company.id == job.company_id).first()

                if not company.cert_path:
                    raise Exception(f"Certificado A1 não encontrado para a Empresa {company.id}")
                    
                if not job.print_point:
                    raise Exception(f"Fila {job.id} não possui um Ponto de Impressão (Série) vinculado.")

                logger.info(f" -> Processando pacote NFS-e para Empresa {job.company_id}, OS ID: {job.service_order_id}, Ponto {job.print_point.name}")
                
                # 3. Call The API via mTLS Client OR Bypass if internal
                if job.print_point.document_type.value != "NFSE":
                    logger.info(f" -> Ponto Interno ({job.print_point.document_type.value}). Bypassando SEFAZ...")
                    job.print_point.current_number += 1
                    db.add(job.print_point)
                    result = {
                        "success": True, 
                        "nfe_number": job.print_point.current_number, 
                        "xml_content": None
                    }
                else:
                    try:
                        client = NFSeFactory.get_provider(company)
                    except ValueError as e:
                        logger.error(f"Erro Factory OS {job.service_order_id}: {str(e)}")
                        job.status = NFSeQueueStatus.ERROR
                        job.error_message = str(e)
                        order.status_nfse = ServiceOrderNfseStatus.ERROR
                        db.commit()
                        continue
                    
                    async def _call_serpro():
                        import asyncio
                        
                        # Bypass emission if we already have a protocol id awaiting check
                        if job.xml_protocol_id:
                            protocol_id = job.xml_protocol_id
                            logger.info(f"Retrying consulta para o protocolo {protocol_id} já existente...")
                            consulta_result = await client.consultar_dps_por_protocolo(protocol_id)
                            
                            return {
                                "success": consulta_result.get("success"),
                                "protocol_id": protocol_id,
                                "xml": consulta_result.get("xml"),
                                "response": consulta_result.get("response", {}),
                                "status_serpro": consulta_result.get("status_serpro"),
                                "error": consulta_result.get("error")
                            }
                            
                        # Otherwise, emit new DPS
                        emit_result = await client.emitir_nota(order, service, customer, address, job.print_point)
                        if emit_result.get("success") and emit_result.get("protocol_id"):
                            protocol_id = emit_result["protocol_id"]
                            logger.info(f"Aguardando processamento do recibo {protocol_id} na Sefaz...")
                            await asyncio.sleep(2)
                            consulta_result = await client.consultar_dps_por_protocolo(protocol_id)
                            
                            emit_result["xml"] = consulta_result.get("xml")
                            emit_result["response"]["consult_resp"] = consulta_result.get("response")
                            emit_result["status_serpro"] = consulta_result.get("status_serpro")
                            emit_result["error"] = consulta_result.get("error") if not consulta_result.get("success") else emit_result.get("error")
                            emit_result["success"] = consulta_result.get("success")
                        return emit_result
                        
                    from app.core.scheduler import run_async
                    result = run_async(_call_serpro())
                
                # 4. Storage Físico em Disco
                # Estrutura base: backend/storage/nfse/{company_id}/{year}/{month}/...
                now = datetime.now()
                storage_base_dir = os.path.join(
                    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                    "storage", "nfse", str(company.id), str(now.year), f"{now.month:02d}"
                )
                
                xml_dir = os.path.join(storage_base_dir, "xml")
                pdf_dir = os.path.join(storage_base_dir, "pdf")
                os.makedirs(xml_dir, exist_ok=True)
                os.makedirs(pdf_dir, exist_ok=True)
                
                if result.get("success") and result.get("status_serpro") == "Autorizada" and result.get("xml"):
                    # Success
                    job.status = NFSeQueueStatus.SUCCESS
                    job.xml_protocol_id = result.get("protocol_id", "")
                    job.nfse_response_json = result.get("response", {})
                    job.xml_retorno = result.get("xml")
                    
                    # Salva XML físico também, mas o layout agora lerá o xml_retorno do banco
                    xml_content = result.get("xml", "")
                    file_name_xml = f"DPS_{company.id}_{order.id}_{int(now.timestamp())}.xml"
                    xml_local_path = os.path.join(xml_dir, file_name_xml)
                    with open(xml_local_path, "w", encoding="utf-8") as f:
                        f.write(xml_content)
                        
                    # Simula PDF url (desacoplada)
                    job.pdf_url_link = ""
                    
                    # Atualiza Status OS e Next Number do Ponto
                    order.status_nfse = ServiceOrderNfseStatus.ISSUED
                    if not job.xml_protocol_id:
                        # Only increase if we just generated it, although here it's fine.
                        job.print_point.current_number += 1
                elif result.get("status_serpro") == "Em Processamento":
                    logger.warning(f"OS {job.service_order_id} ainda em processamento. Voltando para fila PENDING.")
                    job.status = NFSeQueueStatus.PENDING
                    job.xml_protocol_id = result.get("protocol_id", "")
                    job.nfse_response_json = result.get("response", {})
                else:
                    # Falha de regra de negogio ou comunicacao
                    raise Exception(result.get("error"))

                
            except Exception as e:
                # Em caso de erro na comunicação ou validação
                job.status = NFSeQueueStatus.REJECTED
                job.retry_count += 1
                job.error_message = str(e)
                
                if job.service_order_id:
                    order = db.query(ServiceOrder).filter(ServiceOrder.id == job.service_order_id).first()
                    if order:
                        order.status_nfse = ServiceOrderNfseStatus.ERROR
            
            db.commit()
            logger.info(f" -> Envio finalizado para OS {job.service_order_id}.")

    except Exception as e:
        logger.error(f"[NFS-e Worker] Falha global no lote: {e}")
    finally:
        db.close()

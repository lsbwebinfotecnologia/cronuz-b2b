import asyncio
import base64
import json
import logging
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.logistics_settings import LogisticsSettings
from app.models.logistics_order import LogisticsOrder
from app.models.logistics_order_log import LogisticsOrderLog
from app.models.company_settings import CompanySettings
from app.integrators.horus_logistics import HorusLogisticsClient
from app.integrators.logistics.base_provider import LogisticsProvider

logger = logging.getLogger("cronuz.logistics_invoice_job")


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
        logger.warning(f"[LogisticsInvoiceJob.Log] Erro ao gravar log para pedido #{cod_ped_venda}: {e}")
        try:
            db.rollback()
        except Exception:
            pass


def _extract_transport_from_xml(xml_base64: str) -> Dict[str, str]:
    """
    Decodifica o XML da NFe em Base64 e extrai os dados do transportador (<transporta>).
    """
    transport = {
        "nome_razao": "",
        "fantasia": "",
        "cpf_cnpj": "",
        "ie": "",
        "logradouro": "",
        "uf": "",
    }
    if not xml_base64:
        return transport

    try:
        raw_xml = base64.b64decode(xml_base64)
        root = ET.fromstring(raw_xml)
        for elem in root.iter():
            tag_name = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
            if tag_name == "transporta":
                for child in elem:
                    c_tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
                    val = (child.text or "").strip()
                    if c_tag in ["CNPJ", "CPF"]:
                        transport["cpf_cnpj"] = val
                    elif c_tag == "xNome":
                        transport["nome_razao"] = val
                        transport["fantasia"] = val
                    elif c_tag == "IE":
                        transport["ie"] = val
                    elif c_tag == "xEnder":
                        transport["logradouro"] = val
                    elif c_tag == "UF":
                        transport["uf"] = val
                break
    except Exception as e:
        logger.debug(f"[LogisticsInvoiceJob] Falha no parse do XML da transportadora: {e}")

    return transport


def _parse_nfe_date(date_str: Any) -> Optional[str]:
    """Converte datas como '24/09/2026 14:30:00' para 'YYYY-MM-DD'."""
    if not date_str:
        return None
    s = str(date_str).strip()
    try:
        # Formato comum Horus: DD/MM/YYYY HH:MM:SS ou DD/MM/YYYY
        if "/" in s:
            parts = s.split(" ")[0].split("/")
            if len(parts) == 3:
                return f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
        elif "-" in s:
            return s.split(" ")[0]
    except Exception:
        pass
    return None


async def send_single_invoice_to_wms(
    db: Session,
    company_id: int,
    ped_num: int,
    id_ord_sys_log: str,
    cod_cli: str,
    cod_empresa: str,
    cod_filial: str,
    horus_client: HorusLogisticsClient,
    provider: Any,
    log_settings: Any,
    order: Optional[LogisticsOrder] = None
) -> bool:
    """
    Busca a NFe no Horus ERP (com XML Base64), monta o payload e envia ao WMS (faturar.json).
    Atualiza o LogisticsOrder no banco local.
    """
    now_dt = datetime.now(timezone.utc)
    try:
        nf_resp = await horus_client.busca_nota_fiscal(
            cod_empresa=cod_empresa,
            cod_filial=cod_filial,
            cod_cli=cod_cli,
            cod_ped_venda=ped_num,
            xml_base64="S"
        )
    except Exception as e_nf:
        logger.warning(f"[LogisticsInvoiceJob] Erro ao buscar NF do pedido #{ped_num}: {e_nf}")
        return False

    invoice = None
    if nf_resp and isinstance(nf_resp, list) and len(nf_resp) > 0:
        first_nf = nf_resp[0]
        if not (first_nf.get("Falha") or first_nf.get("FALHA") == "S"):
            invoice = first_nf
    elif isinstance(nf_resp, dict) and not (nf_resp.get("Falha") or nf_resp.get("FALHA") == "S"):
        invoice = nf_resp

    if not invoice:
        logger.info(f"[LogisticsInvoiceJob] Pedido #{ped_num} está FAT no ERP mas Busca_NotaFiscal ainda não retornou registro.")
        return False

    chave_nfe = str(invoice.get("CHAVE_ACESSO_NFE") or invoice.get("chave_nfe") or "").strip()
    serie_nfe = str(invoice.get("SERIE_FISCAL") or invoice.get("SERIE_NOTA_FISCAL") or invoice.get("SERIE_NF") or "1").strip()
    nro_nfe = str(invoice.get("NRO_NOTA_FISCAL") or invoice.get("nro_nota_fiscal") or "").strip()
    xml_b64 = str(invoice.get("XML_Base64") or invoice.get("XML_BASE64") or invoice.get("xml_base64") or "").strip()
    raw_data_emissao = invoice.get("DAT_EMISSAO_NF") or invoice.get("DATA_EMISSAO") or invoice.get("DTA_EMISSAO")
    nfe_data = _parse_nfe_date(raw_data_emissao) or now_dt.strftime("%Y-%m-%d")

    vlr_liq = invoice.get("VLR_LIQUIDO_NF") or invoice.get("VLR_TOTAL_NF") or 0.0
    vlr_bruto = invoice.get("VLR_BRUTO_NF") or invoice.get("VLR_PRODUTOS_NF") or vlr_liq

    try:
        vlr_liq_flt = float(str(vlr_liq).replace(",", "."))
    except Exception:
        vlr_liq_flt = 0.0

    try:
        vlr_bruto_flt = float(str(vlr_bruto).replace(",", "."))
    except Exception:
        vlr_bruto_flt = vlr_liq_flt

    transport = _extract_transport_from_xml(xml_b64)

    operacao_id = getattr(log_settings, 'operator_id', None) or getattr(log_settings, 'operation_id', None) or 182
    try:
        operacao_id = int(operacao_id)
    except Exception:
        operacao_id = 182

    payload_faturar = {
        "operacao_id": operacao_id,
        "pedidos": [
            {
                "pedido": {
                    "pedido_id": str(id_ord_sys_log),
                    "nfe_chave": chave_nfe,
                    "nfe_serie": serie_nfe,
                    "nfe_numero": nro_nfe,
                    "nfe_data": nfe_data,
                    "nfe_valor_total": vlr_liq_flt,
                    "nfe_valor_produtos": vlr_bruto_flt,
                    "nfe_modFrete": 0,
                    "nfe_xml": xml_b64,
                    "transportadora": {
                        "nome_razao": transport.get("nome_razao") or "",
                        "fantasia": transport.get("fantasia") or transport.get("nome_razao") or "",
                        "cpf_cnpj": transport.get("cpf_cnpj") or "10401967000210",
                        "ie": transport.get("ie") or "",
                        "valor_prestacao": 0.0,
                        "logradouro": transport.get("logradouro") or "",
                        "numero": "",
                        "complemento": "",
                        "uf": transport.get("uf") or "",
                        "cidade_codigo_ibge": "",
                    }
                }
            }
        ]
    }

    try:
        wms_res = await provider.invoice_order(id_ord_sys_log, payload_faturar)
        has_errors = False
        err_msg = ""
        if isinstance(wms_res, dict):
            if wms_res.get("erros") or wms_res.get("errors"):
                has_errors = True
                err_msg = str(wms_res.get("erros") or wms_res.get("errors"))
            elif wms_res.get("status") == "erro" or wms_res.get("sucesso") is False:
                has_errors = True
                err_msg = str(wms_res.get("mensagem") or wms_res.get("message") or "Erro retornado pelo WMS")

        if has_errors:
            logger.error(f"[LogisticsInvoiceJob] Erro retornado pelo WMS ao faturar pedido #{ped_num}: {err_msg}")
            if order:
                order.error_log = f"Erro WMS Faturar: {err_msg[:400]}"
                db.commit()
            _record_logistics_log(
                db=db,
                company_id=company_id,
                cod_ped_venda=ped_num,
                action="INVOICE_ORDER",
                status="ERROR",
                request_data=payload_faturar,
                response_data=wms_res,
                message=f"Falha ao enviar NF: {err_msg}"
            )
            return False

        if not order:
            order = db.query(LogisticsOrder).filter(
                LogisticsOrder.company_id == company_id,
                LogisticsOrder.cod_ped_venda == ped_num
            ).first()

        if order:
            order.situation = "INVOICED"
            order.status_horus = "FAT"
            order.key_nfe = chave_nfe
            order.nfe_number = nro_nfe
            order.invoiced_at = now_dt
            order.error_log = None
            db.commit()

        logger.info(f"[LogisticsInvoiceJob] Pedido #{ped_num} faturado com sucesso no WMS! NF {nro_nfe}")
        _record_logistics_log(
            db=db,
            company_id=company_id,
            cod_ped_venda=ped_num,
            action="INVOICE_ORDER",
            status="SUCCESS",
            request_data={"pedido_id": id_ord_sys_log, "nfe_numero": nro_nfe, "chave": chave_nfe},
            response_data=wms_res,
            message=f"Nota fiscal {nro_nfe} enviada com sucesso ao WMS."
        )
        return True

    except Exception as e_send:
        logger.error(f"[LogisticsInvoiceJob] Exceção ao enviar faturamento #{ped_num}: {e_send}")
        if order:
            order.error_log = f"Falha envio NF: {str(e_send)[:400]}"
            db.commit()
        return False


async def process_company_logistics_invoice(db: Session, company_id: int, limit_orders: int = 20) -> Dict[str, Any]:
    """
    Varre pedidos da empresa que já foram conferidos (CHECKED) ou enviados (IN_LOGISTICS)
    e que possuem id_ord_sys_log, verifica se no Horus já foram faturados (FAT) e envia
    o XML e dados da NFe para a logística (WMS MKT).
    """
    log_settings = db.query(LogisticsSettings).filter(
        LogisticsSettings.company_id == company_id,
        LogisticsSettings.enabled == True
    ).first()

    if not log_settings or not log_settings.api_url or not log_settings.login or not log_settings.password:
        return {"processed": 0, "invoiced": 0, "errors": 0, "message": "Logística inativa ou sem credenciais"}

    if not getattr(log_settings, 'feature_auto_invoice', True):
        return {"processed": 0, "invoiced": 0, "errors": 0, "message": "Envio automático de notas fiscais desativado para esta empresa"}

    cmp_settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not cmp_settings or not cmp_settings.horus_enabled:
        return {"processed": 0, "invoiced": 0, "errors": 0, "message": "Horus desativado para a empresa"}

    min_order_number = getattr(log_settings, 'min_order_number', None)
    if min_order_number:
        try:
            min_order_number = int(min_order_number)
        except (ValueError, TypeError):
            min_order_number = None

    # Busca pedidos com ID no armazém que ainda não foram marcados como INVOICED
    orders_query = db.query(LogisticsOrder).filter(
        LogisticsOrder.company_id == company_id,
        LogisticsOrder.id_ord_sys_log.isnot(None),
        LogisticsOrder.id_ord_sys_log != "",
        LogisticsOrder.situation.in_(["CHECKED", "IN_LOGISTICS"])
    )
    if min_order_number:
        orders_query = orders_query.filter(LogisticsOrder.cod_ped_venda >= min_order_number)

    orders_to_check = orders_query.order_by(LogisticsOrder.updated_at.desc()).limit(limit_orders).all()

    if not orders_to_check:
        return {"processed": 0, "invoiced": 0, "errors": 0, "message": "Nenhum pedido pendente de faturamento"}

    cod_empresa_padrao = str(getattr(cmp_settings, 'horus_company', '') or '1').strip()
    cod_filial_padrao = str(getattr(cmp_settings, 'horus_branch', '') or '2').strip()

    provider = LogisticsProvider.factory(log_settings.provider, log_settings)
    horus_client = HorusLogisticsClient(db, company_id)

    stats = {"processed": 0, "invoiced": 0, "errors": 0, "skipped": 0}
    now_dt = datetime.now(timezone.utc)

    try:
        for order in orders_to_check:
            ped_num = order.cod_ped_venda
            if min_order_number and ped_num < min_order_number:
                continue
            stats["processed"] += 1

            # 1. Consulta status atual no Horus
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
                stats["skipped"] += 1
                continue

            status_erp = str(ord_horus.get("STATUS_PEDIDO_VENDA") or ord_horus.get("STA_PEDIDO_VENDA") or "").strip().upper()
            cod_cli = str(ord_horus.get("COD_CLI") or order.cod_cli or "").strip()
            cod_empresa = str(ord_horus.get("COD_EMPRESA") or cod_empresa_padrao).strip()
            cod_filial = str(ord_horus.get("COD_FILIAL") or cod_filial_padrao).strip()

            if status_erp == "CAN":
                order.situation = "CANCELLED"
                order.status_horus = "CAN"
                db.commit()
                stats["skipped"] += 1
                continue

            # Se ainda não faturou no ERP, não temos NFe para enviar
            if status_erp != "FAT":
                stats["skipped"] += 1
                continue

            # 2. Envia a NFe para o WMS chamando a função centralizada
            success = await send_single_invoice_to_wms(
                db=db,
                company_id=company_id,
                ped_num=ped_num,
                id_ord_sys_log=str(order.id_ord_sys_log),
                cod_cli=cod_cli,
                cod_empresa=cod_empresa,
                cod_filial=cod_filial,
                horus_client=horus_client,
                provider=provider,
                log_settings=log_settings,
                order=order
            )
            if success:
                stats["invoiced"] += 1
            else:
                stats["errors"] += 1

            await asyncio.sleep(5.0)  # Delay preventivo anti-429 para a API do WMS MKT

    finally:
        await horus_client.close()

    return stats


async def run_logistics_invoice_job():
    """Executa a rotina de envio de NFe para todas as empresas com logística habilitada."""
    db = SessionLocal()
    try:
        active_settings = db.query(LogisticsSettings).filter(
            LogisticsSettings.enabled == True
        ).all()
        for st in active_settings:
            try:
                res = await process_company_logistics_invoice(db, st.company_id)
                logger.info(f"[LogisticsInvoiceJob] Empresa {st.company_id}: {res}")
            except Exception as e:
                logger.error(f"[LogisticsInvoiceJob] Erro na empresa {st.company_id}: {e}")
    finally:
        db.close()

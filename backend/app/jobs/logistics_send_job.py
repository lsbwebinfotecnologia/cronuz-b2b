import logging
from datetime import datetime, timezone
from typing import Dict, Any, List
import httpx
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.logistics_settings import LogisticsSettings
from app.models.logistics_order import LogisticsOrder
from app.models.company_settings import CompanySettings
from app.models.company import Company
from app.integrators.horus_orders import HorusOrders
from app.integrators.horus_clients import HorusClients
from app.integrators.logistics.base_provider import LogisticsProvider

logger = logging.getLogger("cronuz.logistics_send_job")

def _only_digits(v: str) -> str:
    return "".join(c for c in str(v) if c.isdigit()) if v else ""

def _normalize_cep(cep: Any) -> str:
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

def _fval(v: Any) -> str:
    return str(v) if v is not None else ""

def _mask_cep(cep: str) -> str:
    digits = _normalize_cep(cep)
    if len(digits) == 8:
        return f"{digits[:5]}-{digits[5:]}"
    return digits

def _parse_float(v: Any) -> float:
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

from app.api.logistics import _extract_legado_id

async def process_company_logistics_send(db: Session, company_id: int) -> Dict[str, Any]:
    """
    Processa o envio automático de pedidos LEX para o WMS de uma empresa específica.
    """
    log_settings = db.query(LogisticsSettings).filter(
        LogisticsSettings.company_id == company_id,
        LogisticsSettings.enabled == True
    ).first()

    if not log_settings or not log_settings.api_url or not log_settings.login or not log_settings.password:
        return {"processed": 0, "sent": 0, "errors": 0, "message": "Logística WMS inativa ou sem credenciais"}

    if not log_settings.feature_auto_send:
        return {"processed": 0, "sent": 0, "errors": 0, "message": "Job de envio automático desativado para esta empresa"}

    cmp_settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not cmp_settings or not cmp_settings.horus_enabled:
        return {"processed": 0, "sent": 0, "errors": 0, "message": "Hórus desativado para a empresa"}

    company = db.query(Company).filter(Company.id == company_id).first()
    cnpj_destino = _only_digits(company.document if company and company.document else "")

    horus_orders = HorusOrders(db, company_id)
    horus_clients = HorusClients(db, company_id)

    # ── Instanciação e Caches em Memória do Ciclo ─────────────────────────
    # Reduz consultas N+1 ao Horus ERP e ViaCEP durante o processamento do lote
    client_cache: Dict[str, Dict[str, Any]] = {}
    address_cache: Dict[str, Dict[str, Any]] = {}
    viacep_cache: Dict[str, Dict[str, Any]] = {}

    provider = LogisticsProvider.factory(log_settings.provider, log_settings)
    stats = {"processed": 0, "sent": 0, "errors": 0, "skipped": 0, "rate_limited": 0}

    try:
        cod_empresa = str(cmp_settings.horus_company or "1").strip()
        cod_filial = str(cmp_settings.horus_branch or "1").strip()

        # 1. Busca pedidos com status LEX prontos para envio (Lote seguro de 20 pedidos)
        params_pedidos = {
            "COD_EMPRESA": cod_empresa,
            "COD_FILIAL": cod_filial,
            "STA_PEDIDO": "LEX",
            "OFFSET": 0,
            "LIMIT": 20,
        }
        if getattr(cmp_settings, 'horus_legacy_pagination', False):
            params_pedidos.pop("OFFSET", None)
            params_pedidos.pop("LIMIT", None)

        try:
            res_orders = await horus_orders.get("Busca_PedidosVenda", params=params_pedidos)
        except Exception as e_horus:
            logger.error(f"[LogisticsJob] Erro ao buscar pedidos LEX da empresa {company_id}: {e_horus}")
            return {"processed": 0, "sent": 0, "errors": 1, "message": f"Erro de conexão com Horus: {e_horus}"}

        if not res_orders or not isinstance(res_orders, list):
            return {"processed": 0, "sent": 0, "errors": 0, "message": "Nenhum pedido retornado pelo Horus"}

        pedidos_lex = [p for p in res_orders if isinstance(p, dict) and not (p.get("Falha") or p.get("FALHA") == "S")]

        for ped in pedidos_lex:
            cod_ped = int(ped.get("COD_PED_VENDA") or 0)
            if not cod_ped:
                continue

            stats["processed"] += 1

            # 1. Verifica se já está na fila com ID confirmado ou em situação finalizada
            existing = db.query(LogisticsOrder).filter(
                LogisticsOrder.company_id == company_id,
                LogisticsOrder.cod_ped_venda == cod_ped
            ).first()

            if existing and (existing.situation in ["IN_LOGISTICS", "CHECKED", "INVOICED"] or existing.id_ord_sys_log):
                # Se ainda constar como LEX no Horus, avança para IMP para não ser buscado novamente
                if str(ped.get("STA_PEDIDO") or "").upper() == "LEX":
                    try:
                        await horus_orders.get("AltStatus_Pedido", params={
                            "COD_EMPRESA": cod_empresa,
                            "COD_FILIAL": cod_filial,
                            "COD_CLI": str(existing.cod_cli or ped.get("COD_CLI") or ""),
                            "COD_PED_VENDA": str(cod_ped),
                            "STA_PEDIDO": "IMP"
                        })
                        existing.status_horus = "IMP"
                        db.commit()
                    except Exception:
                        pass
                stats["skipped"] += 1
                continue

            # 1.1. Checagem prévia no WMS: se já foi integrado diretamente no armazém
            try:
                ref_order = await provider.get_order_by_ref(cod_ped)
                if ref_order:
                    rem_m = ref_order.get("RemessaPedido") or {}
                    leg_m = ref_order.get("LegadoPedido") or {}
                    mov_m = ref_order.get("Movimento") or {}
                    legado_id = leg_m.get("id") or rem_m.get("id") or mov_m.get("id") or ref_order.get("id")
                    if legado_id:
                        if not existing:
                            existing = LogisticsOrder(
                                company_id=company_id,
                                provider=log_settings.provider,
                                cod_ped_venda=cod_ped,
                                pedido_web_origem=str(ped.get("COD_PEDIDO_ORIGEM") or ""),
                                status_horus="IMP",
                                situation="IN_LOGISTICS",
                                id_ord_sys_log=str(legado_id),
                                sent_at=now
                            )
                            db.add(existing)
                        else:
                            existing.situation = "IN_LOGISTICS"
                            existing.id_ord_sys_log = str(legado_id)
                            existing.status_horus = "IMP"
                            existing.error_log = None
                            existing.sent_at = existing.sent_at or now
                        db.commit()

                        # Altera status no Horus para IMP
                        try:
                            await horus_orders.get("AltStatus_Pedido", params={
                                "COD_EMPRESA": cod_empresa,
                                "COD_FILIAL": cod_filial,
                                "COD_CLI": str(ped.get("COD_CLI") or ""),
                                "COD_PED_VENDA": str(cod_ped),
                                "STA_PEDIDO": "IMP"
                            })
                        except Exception:
                            pass

                        stats["skipped"] += 1
                        logger.info(f"[LogisticsJob] Pedido #{cod_ped} já constava no WMS ({legado_id}). Vinculado e atualizado para IMP no Horus.")
                        continue
            except Exception as e_check:
                logger.debug(f"[LogisticsJob] Checagem prévia de ref {cod_ped}: {e_check}")

            if not existing:
                existing = LogisticsOrder(
                    company_id=company_id,
                    provider=log_settings.provider,
                    cod_ped_venda=cod_ped,
                    pedido_web_origem=str(ped.get("COD_PEDIDO_ORIGEM") or ""),
                    status_horus="LEX",
                    situation="PENDING_SEND"
                )
                db.add(existing)
                db.commit()
                db.refresh(existing)

            # 2. Busca dados cadastrais e endereço do cliente (com cache em memória)
            cod_cli = str(ped.get("COD_CLI") or "").strip()
            if not cod_cli:
                existing.error_log = "Pedido sem COD_CLI no Horus"
                db.commit()
                stats["errors"] += 1
                continue

            existing.cod_cli = int(cod_cli) if cod_cli.isdigit() else None

            try:
                if cod_cli in client_cache and cod_cli in address_cache:
                    cli_data = client_cache[cod_cli]
                    selected_end = address_cache[cod_cli]
                else:
                    res_cli = await horus_clients.get("Busca_Cliente", params={"COD_CLI": cod_cli})
                    cli_data = {}
                    if res_cli and isinstance(res_cli, list) and len(res_cli) > 0 and not (res_cli[0].get("Falha") or res_cli[0].get("FALHA") == "S"):
                        cli_data = dict(res_cli[0])
                    client_cache[cod_cli] = cli_data

                    res_end = await horus_clients.get("Busca_EndCliente", params={"COD_CLI": cod_cli})
                    selected_end = {}
                    if res_end and isinstance(res_end, list) and len(res_end) > 0:
                        ends = [e for e in res_end if isinstance(e, dict) and not (e.get("Falha") or e.get("FALHA") == "S")]
                        for e in ends:
                            if str(e.get("STA_DEFAULT", "")).upper() == "S":
                                selected_end = e
                                break
                        if not selected_end:
                            for e in ends:
                                if str(e.get("COD_TPO_END", "")) == "2":
                                    selected_end = e
                                    break
                        if not selected_end and ends:
                            selected_end = ends[0]
                    address_cache[cod_cli] = selected_end

            except Exception as e_cli:
                existing.error_log = f"Erro ao consultar cliente no Horus: {e_cli}"
                db.commit()
                stats["errors"] += 1
                continue

            # Valida CEP via ViaCEP aplicando máscara e cache
            cep_raw = (
                selected_end.get("CEP") or
                selected_end.get("CEP_CLI") or
                selected_end.get("DES_CEP") or
                cli_data.get("CEP") or
                cli_data.get("CEP_CLI") or
                cli_data.get("DES_CEP") or
                ""
            )
            cep = _normalize_cep(cep_raw)
            cep_mascarado = _mask_cep(cep)
            now = datetime.now(timezone.utc)
            existing.cep_checked_at = now

            if not cep or len(cep) != 8:
                existing.situation = "CEP_INVALID"
                existing.cep_validated = False
                existing.cep_error_detail = f"CEP {cep_mascarado or cep_raw or 'ausente'} inválido no Horus (esperado 8 dígitos com máscara 00000-000)"
                db.commit()
                stats["errors"] += 1
                continue

            vcep_data = {}
            if cep in viacep_cache:
                vcep_data = viacep_cache[cep]
            else:
                try:
                    async with httpx.AsyncClient(timeout=5.0) as vclient:
                        vresp = await vclient.get(f"https://viacep.com.br/ws/{cep}/json/")
                        if vresp.status_code == 200:
                            vcep_data = vresp.json()
                            viacep_cache[cep] = vcep_data
                except Exception as e_vcep:
                    logger.warning(f"[LogisticsJob] Erro ao consultar ViaCEP para {cep}: {e_vcep}")

            if vcep_data.get("erro"):
                existing.situation = "CEP_INVALID"
                existing.cep_validated = False
                existing.cep_error_detail = f"CEP {cep_mascarado} não localizado no ViaCEP"
                db.commit()
                stats["errors"] += 1
                continue

            existing.cep_validated = True
            existing.cep_error_detail = None
            if existing.situation == "CEP_INVALID":
                existing.situation = "PENDING_SEND"

            # 3. Busca itens do pedido
            params_itens = {
                "COD_PED_VENDA": str(cod_ped),
                "COD_EMPRESA": cod_empresa,
                "COD_FILIAL": cod_filial,
                "OFFSET": 0,
                "LIMIT": 500,
            }
            if getattr(cmp_settings, 'horus_legacy_pagination', False):
                params_itens.pop("OFFSET", None)
                params_itens.pop("LIMIT", None)

            try:
                res_itens = await horus_orders.get("Busca_ItensPedidosVenda", params=params_itens)
                items_data = [i for i in res_itens if isinstance(i, dict) and not (i.get("Falha") or i.get("FALHA") == "S")] if isinstance(res_itens, list) else []
            except Exception as e_it:
                existing.error_log = f"Erro ao buscar itens do pedido no Horus: {e_it}"
                db.commit()
                stats["errors"] += 1
                continue

            if not items_data:
                existing.error_log = "Pedido sem itens no Horus"
                db.commit()
                stats["errors"] += 1
                continue

            # 4. Monta payload do MKT
            try:
                operacao_id = int(log_settings.operator_id or 0)
            except Exception:
                operacao_id = 0

            dat_ped = str(ped.get("DAT_PEDIDO") or "").split("T")[0] or now.strftime("%Y-%m-%d")

            logradouro = vcep_data.get("logradouro") or _fval(selected_end.get("DESC_ENDERECO") or "")
            bairro     = vcep_data.get("bairro")     or _fval(selected_end.get("NOM_BAIRRO") or "")
            cidade     = vcep_data.get("localidade") or _fval(selected_end.get("NOM_LOCAL") or "")
            uf         = vcep_data.get("uf")         or _fval(selected_end.get("SIGLA_UF") or "")
            numero     = _fval(selected_end.get("NUM_END") or "S/N")
            complemento = _fval(selected_end.get("COM_ENDERECO") or "")
            ibge_cidade = int(vcep_data.get("ibge") or 0) if vcep_data.get("ibge") else 0

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

            nome_cli = _fval(cli_data.get("NOM_CLI") or "")
            fantasia = _fval(cli_data.get("NOM_REDUZIDO") or nome_cli)
            doc_cli = _only_digits(cli_data.get("CPF") or cli_data.get("CNPJ") or "")
            rg_ie = _fval(cli_data.get("INSC_ESTADUAL") or cli_data.get("RG") or "ISENTO")
            email_cli = _fval(cli_data.get("EMAIL") or "")
            tel_cli = _fval(selected_end.get("TEL_ENDERECO") or selected_end.get("CEL_ENDERECO") or "")

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
                        "nome_razao": _fval(ped.get("NOM_TRANSP") or "LOGISTICA"),
                        "fantasia": _fval(ped.get("NOM_TRANSP") or "LOGISTICA"),
                        "cpf_cnpj": _only_digits(ped.get("CNPJ_TRANSP") or ped.get("CPF_CNPJ_TRANSP") or cnpj_destino),
                        "modFrete": 0,
                        "valor": 0.0,
                        "volumes": 1,
                        "servico": _fval(ped.get("NOM_TRANSP") or "LOGISTICA"),
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

            # 5. Throttling suave de requisições (evita estourar TPS da API MKT)
            import asyncio
            await asyncio.sleep(0.35)

            try:
                res = await provider.send_order(payload)
                legado_id = _extract_legado_id(res)

                # Se não veio no body do POST, busca pontualmente pelo código de referência
                if not legado_id:
                    try:
                        ref_order = await provider.get_order_by_ref(cod_ped)
                        if ref_order:
                            rem_m = ref_order.get("RemessaPedido") or {}
                            leg_m = ref_order.get("LegadoPedido") or {}
                            mov_m = ref_order.get("Movimento") or {}
                            legado_id = leg_m.get("id") or rem_m.get("id") or mov_m.get("id") or ref_order.get("id")
                    except Exception as e_ref:
                        logger.debug(f"[LogisticsJob] Consulta pontual de ref {cod_ped}: {e_ref}")

                existing.situation = "IN_LOGISTICS"
                existing.sent_at = now
                existing.status_horus = "IMP"
                existing.error_log = None
                if legado_id:
                    existing.id_ord_sys_log = str(legado_id)

                db.commit()

                # Atualiza status no Horus para IMP
                try:
                    await horus_orders.get("AltStatus_Pedido", params={
                        "COD_EMPRESA": cod_empresa,
                        "COD_FILIAL": cod_filial,
                        "COD_CLI": cod_cli,
                        "COD_PED_VENDA": str(cod_ped),
                        "STA_PEDIDO": "IMP"
                    })
                except Exception as e_alt:
                    logger.warning(f"[LogisticsJob] Erro ao alterar status no Horus para IMP do pedido #{cod_ped}: {e_alt}")

                stats["sent"] += 1
                logger.info(f"[LogisticsJob] Pedido #{cod_ped} enviado com sucesso ao WMS (Company {company_id}) e status atualizado para IMP")

            except Exception as e_wms:
                err_str = str(e_wms)
                # Tratamento de Rate Limit: pausa e encerra o lote suavemente sem marcar como erro fatal
                if "RATE_LIMIT" in err_str or "429" in err_str:
                    logger.warning(f"[LogisticsJob] Rate limit atingido na API MKT: {err_str}. Interrompendo lote suavemente.")
                    existing.situation = "PENDING_SEND"
                    stats["rate_limited"] += 1
                    db.commit()
                    break

                existing.situation = "PENDING_SEND"
                existing.error_log = err_str
                db.commit()
                stats["errors"] += 1
                logger.warning(f"[LogisticsJob] Crítica do WMS para pedido #{cod_ped}: {err_str}")

    finally:
        await horus_orders.close()
        await horus_clients.close()

    return stats


def run_logistics_auto_send_job():
    """
    Função síncrona chamada pelo APScheduler a cada 15 minutos.
    Dispara o envio automático para todas as empresas ativas.
    """
    import asyncio
    db = SessionLocal()
    try:
        active_settings = db.query(LogisticsSettings).filter(
            LogisticsSettings.enabled == True,
            LogisticsSettings.feature_auto_send == True
        ).all()

        if not active_settings:
            return

        for s in active_settings:
            try:
                res = asyncio.run(process_company_logistics_send(db, s.company_id))
                logger.info(f"[LogisticsJob] Empresa {s.company_id}: {res}")
            except Exception as e:
                logger.error(f"[LogisticsJob] Falha na execução da empresa {s.company_id}: {e}")
    finally:
        db.close()

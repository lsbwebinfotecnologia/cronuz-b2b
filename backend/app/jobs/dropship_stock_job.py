"""
Job de Sincronização de Estoque Dropship — Hórus → Hub-Erdos
=============================================================

Lógica central reutilizável por:
  - Endpoint manual  : POST /dropship/stock/{company_id}/push
  - Job agendado     : APScheduler (a cada 5 min verifica todos os sellers habilitados)

Regra de DATA_INI:
  - Primeiro run (stock_sync_last_run IS NULL): "01/01/1900 00:00:00" → carga completa
  - Runs seguintes : stock_sync_last_run formatado → sync incremental (só atualizados)

Paginação Hórus:
  - PAGE_SIZE=50, loop OFFSET até retornar página vazia ou menor que PAGE_SIZE.

Filtro de saldo:
  - Apenas itens com saldo > 0 são enviados ao Erdos.
  - ISBNs que foram enviados anteriormente e agora têm saldo = 0 (ou sumiram)
    recebem qty=0 na Erdos e são removidos do rastreamento.
"""

import asyncio
import logging
from datetime import datetime
from typing import Any, Dict, List, Set

log = logging.getLogger("dropship_stock_job")

PAGE_SIZE = 50


async def do_stock_push(config: Any, db: Any, triggered_by: str = "manual") -> Dict[str, Any]:
    """
    Async: busca acervo no Hórus com DATA_INI/DATA_FIM incremental,
    pagina via OFFSET/LIMIT e envia ao Hub-Erdos.

    - Envia apenas itens com saldo > 0.
    - Zera automaticamente na Erdos os ISBNs que antes tinham saldo
      e agora retornaram com saldo = 0 ou não apareceram no retorno.
    - Salva um registro em dsp_stock_sync_log independente do resultado.

    Args:
        config      : instância de DropshipConfig (com horus_customer precarregado)
        db          : SQLAlchemy Session
        triggered_by: 'manual' (endpoint) ou 'scheduler' (job automático)

    Returns:
        dict com status, skus_sent, zeroed, data_ini, data_fim e hub_response
    """
    from app.integrators.horus_products import HorusProducts
    from app.integrators.erdos_client import ErdosClientError
    from app.api.dropship import _build_erdos_client
    from app.models.dropship_stock_sync_log import DropshipStockSyncLog
    from app.models.dropship_stock_sent_erdos import StockSentErdos

    def _save_log(status: str, skus_sent: int = 0,
                  items_payload=None, hub_response=None, error_msg: str = None,
                  data_ini: str = None, data_fim: str = None):
        try:
            entry = DropshipStockSyncLog(
                company_id=config.company_id,
                triggered_by=triggered_by,
                status=status,
                data_ini=data_ini,
                data_fim=data_fim,
                skus_sent=skus_sent,
                items_payload=items_payload,
                hub_response=hub_response,
                error_msg=error_msg,
            )
            db.add(entry)
            db.commit()
        except Exception as log_err:
            log.error(f"[StockSync] Falha ao salvar log: {log_err}")
            db.rollback()

    if not config.horus_customer:
        err = f"[StockSync] company_id={config.company_id}: Customer parceiro não configurado."
        _save_log("error", error_msg=err)
        raise ValueError(err)

    customer = config.horus_customer

    # ── Definição do período de busca ─────────────────────────────────────────
    if config.stock_sync_last_run:
        last = config.stock_sync_last_run
        if hasattr(last, "tzinfo") and last.tzinfo is not None:
            from datetime import timezone
            last = last.astimezone(timezone.utc).replace(tzinfo=None)
        data_ini = last.strftime("%d/%m/%Y %H:%M:%S")
    else:
        data_ini = "01/01/1900 00:00:00"

    run_time = datetime.utcnow()
    data_fim = run_time.strftime("%d/%m/%Y %H:%M:%S")

    log.info(
        f"[StockSync] company_id={config.company_id} "
        f"DATA_INI={data_ini!r}  DATA_FIM={data_fim!r}  trigger={triggered_by}"
    )

    # ── Coleta paginada no Hórus ──────────────────────────────────────────────
    horus_prod = HorusProducts(db, config.company_id)
    # all_items_raw: todos do período (positivos + zerados)
    all_items_raw: List[Dict[str, Any]] = []
    offset = 0

    try:
        while True:
            page = await horus_prod.busca_acervo_b2b(
                id_doc=customer.id_doc,
                id_guid=customer.id_guid,
                data_ini=data_ini,
                data_fim=data_fim,
                offset=offset,
                limit=PAGE_SIZE,
            )

            if not page or not isinstance(page, list) or len(page) == 0:
                log.info(
                    f"[StockSync] company_id={config.company_id} "
                    f"offset={offset} → página vazia, fim da paginação."
                )
                break

            for item in page:
                isbn = (
                    item.get("COD_BARRA_ITEM")
                    or item.get("BARRAS_ISBN")
                    or item.get("ISBN")
                )
                # Usar None-check para detectar saldo=0 corretamente
                # Campo confirmado no retorno real do Hórus: SALDO_DISPONIVEL
                saldo_raw = item.get("SALDO_DISPONIVEL")
                if saldo_raw is None:
                    saldo_raw = item.get("SALDO")
                if saldo_raw is None:
                    saldo_raw = item.get("QTD_SALDO")
                if saldo_raw is None:
                    saldo_raw = item.get("QTD_DISPONIVEL")
                saldo = max(0, int(float(saldo_raw))) if saldo_raw is not None else 0

                if isbn and str(isbn).strip():
                    all_items_raw.append({
                        "sku": str(isbn).strip(),
                        "quantidade": saldo,
                    })

            log.info(
                f"[StockSync] company_id={config.company_id} "
                f"offset={offset} → {len(page)} itens (acumulado: {len(all_items_raw)})"
            )

            if len(page) < PAGE_SIZE:
                break
            offset += PAGE_SIZE

    except Exception as e:
        await horus_prod.close()
        err_msg = f"Erro ao buscar acervo no Hórus: {e}"
        log.error(f"[StockSync] company_id={config.company_id} {err_msg}", exc_info=True)
        _save_log("error", error_msg=err_msg, data_ini=data_ini, data_fim=data_fim)
        raise

    finally:
        await horus_prod.close()

    # ── Filtrar por saldo e calcular zeragens ─────────────────────────────────
    # Itens com saldo > 0 (serão enviados ao Erdos)
    items_com_saldo: List[Dict[str, Any]] = [i for i in all_items_raw if i["quantidade"] > 0]
    # ISBNs que apareceram com saldo > 0 neste retorno
    isbns_com_saldo: Set[str] = {i["sku"] for i in items_com_saldo}

    # ISBNs que já foram enviados ao Erdos anteriormente (rastreados no banco)
    enviados_db = db.query(StockSentErdos).filter(
        StockSentErdos.company_id == config.company_id
    ).all()
    isbns_enviados: Set[str] = {row.isbn for row in enviados_db}

    # ISBNs para zerar = estavam no banco MAS não estão mais com saldo > 0
    # (apareceram com saldo=0 OU sumiram do retorno atual)
    isbns_para_zerar: Set[str] = isbns_enviados - isbns_com_saldo
    items_zeragem: List[Dict[str, Any]] = [
        {"sku": isbn, "quantidade": 0} for isbn in isbns_para_zerar
    ]

    log.info(
        f"[StockSync] company_id={config.company_id} "
        f"com_saldo={len(items_com_saldo)} | para_zerar={len(isbns_para_zerar)}"
    )

    # ── Nada a fazer ─────────────────────────────────────────────────────────
    payload_total = items_com_saldo + items_zeragem
    if not payload_total:
        log.info(
            f"[StockSync] company_id={config.company_id} "
            f"Nenhum item para enviar ou zerar — last_run não alterado."
        )
        _save_log("no_items", skus_sent=0, data_ini=data_ini, data_fim=data_fim)
        return {
            "status": "no_items",
            "skus_sent": 0,
            "zeroed": 0,
            "data_ini": data_ini,
            "data_fim": data_fim,
        }

    # ── Envia ao Hub-Erdos ────────────────────────────────────────────────────
    client = _build_erdos_client(config)
    try:
        push_result = await client.push_stock(payload_total)

        # ── Atualiza rastreamento dsp_stock_sent_erdos ────────────────────────
        # UPSERT: itens com saldo > 0
        for item in items_com_saldo:
            existing = next((r for r in enviados_db if r.isbn == item["sku"]), None)
            if existing:
                existing.last_qty = item["quantidade"]
                existing.last_sent_at = run_time
            else:
                db.add(StockSentErdos(
                    company_id=config.company_id,
                    isbn=item["sku"],
                    last_qty=item["quantidade"],
                    last_sent_at=run_time,
                ))

        # DELETE: itens zerados
        if isbns_para_zerar:
            db.query(StockSentErdos).filter(
                StockSentErdos.company_id == config.company_id,
                StockSentErdos.isbn.in_(list(isbns_para_zerar))
            ).delete(synchronize_session=False)

        # Atualiza last_run SOMENTE após push bem-sucedido
        config.stock_sync_last_run = run_time
        db.commit()

        log.info(
            f"[StockSync] company_id={config.company_id} "
            f"✅ {len(items_com_saldo)} SKUs enviados, {len(isbns_para_zerar)} zerados "
            f"— last_run={run_time.isoformat()}"
        )

        _save_log(
            "ok",
            skus_sent=len(payload_total),
            items_payload=payload_total,
            hub_response=push_result,
            data_ini=data_ini,
            data_fim=data_fim,
        )

        return {
            "status": "ok",
            "skus_sent": len(items_com_saldo),
            "zeroed": len(isbns_para_zerar),
            "data_ini": data_ini,
            "data_fim": data_fim,
            "hub_response": push_result,
        }

    except ErdosClientError as e:
        err_msg = f"Erro ao enviar ao Hub-Erdos: {e}"
        log.error(f"[StockSync] company_id={config.company_id} {err_msg}")
        _save_log("error", skus_sent=len(payload_total), items_payload=payload_total,
                  error_msg=err_msg, data_ini=data_ini, data_fim=data_fim)
        raise

    finally:
        await client.close()


def run_dropship_stock_sync_job() -> None:
    """
    Função síncrona para o APScheduler.
    Roda a cada 5 min, verifica todos os sellers com stock_sync_enabled=True
    e dispara o push apenas se o intervalo (stock_sync_interval_min) foi atingido.
    """
    from app.db.session import SessionLocal
    from app.models.dropship import DropshipConfig

    db = SessionLocal()
    try:
        configs: List[DropshipConfig] = (
            db.query(DropshipConfig)
            .filter(DropshipConfig.stock_sync_enabled == True)  # noqa: E712
            .all()
        )

        log.info(f"[StockSync] Verificando {len(configs)} seller(s) com sync habilitado.")

        for config in configs:
            now = datetime.utcnow()
            last = config.stock_sync_last_run
            interval_min: int = config.stock_sync_interval_min or 30

            # Verifica se o intervalo configurado já passou
            if last is not None:
                # Garante comparação naive vs naive
                last_naive = last.replace(tzinfo=None) if hasattr(last, "tzinfo") and last.tzinfo else last
                elapsed_min = (now - last_naive).total_seconds() / 60
                if elapsed_min < interval_min:
                    log.debug(
                        f"[StockSync] company_id={config.company_id} "
                        f"intervalo não atingido ({elapsed_min:.1f} / {interval_min} min)"
                    )
                    continue

            log.info(
                f"[StockSync] Iniciando push para company_id={config.company_id} "
                f"(interval={interval_min} min)"
            )

            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    result = loop.run_until_complete(do_stock_push(config, db))
                    log.info(
                        f"[StockSync] company_id={config.company_id} "
                        f"resultado: status={result.get('status')} skus={result.get('skus_sent')} zeroed={result.get('zeroed', 0)}"
                    )
                finally:
                    loop.close()

            except Exception as e:
                log.error(
                    f"[StockSync] company_id={config.company_id} ERRO: {e}",
                    exc_info=True,
                )

    except Exception as e:
        log.error(f"[StockSync] Erro geral no job: {e}", exc_info=True)

    finally:
        db.close()

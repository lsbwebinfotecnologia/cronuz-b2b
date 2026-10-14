import logging
import asyncio
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.integrators.horus import HorusClient, HorusConfigurationError
from app.models.company_settings import CompanySettings
from app.models.horus_bi_sale import HorusBISale
from app.core.cfop_utils import sanitize_cfop, classify_cfop_movement

logger = logging.getLogger(__name__)

class HorusBIClient:
    """
    Cliente para integração com os endpoints de BI do ERP Hórus:
    - bi_vendas_parametros
    - bi_vendas
    """
    def __init__(self, db: Session, company_id: int):
        self.db = db
        self.company_id = company_id
        self.settings = self._load_settings()
        self.horus_client = HorusClient(db, company_id)

    def _load_settings(self) -> CompanySettings:
        settings = self.db.query(CompanySettings).filter(
            CompanySettings.company_id == self.company_id
        ).first()
        if not settings:
            raise HorusConfigurationError(f"Configurações não encontradas para a empresa ID {self.company_id}.")
        return settings

    async def get_parameters(self) -> Dict[str, Any]:
        """
        Consulta os totalizadores do BI no Horus.
        Exemplo de retorno:
        [ { "TOTAL_REGISTROS": 936440, "MAX_LIMIT": 10000, "TOTAL_PAGINAS": 94 } ]
        """
        res = await self.horus_client.get("bi_vendas_parametros")
        if isinstance(res, list) and len(res) > 0:
            return res[0]
        if isinstance(res, dict):
            return res
        return {"TOTAL_REGISTROS": 0, "MAX_LIMIT": 5000, "TOTAL_PAGINAS": 0}

    async def get_sales_page(self, offset: int, limit: int) -> List[Dict[str, Any]]:
        """
        Retorna uma página de dados de vendas do Horus BI respeitando offset e limit.
        """
        params = {"offset": offset, "limit": limit}
        res = await self.horus_client.get("bi_vendas", params=params)
        if isinstance(res, list):
            return res
        if isinstance(res, dict) and "itens" in res:
            return res["itens"]
        return []

    async def sync_sales_incremental(self, max_pages: int = 20, batch_limit: Optional[int] = None) -> Dict[str, Any]:
        """
        Executa sincronização incremental das vendas do BI.
        - Respeita o flag horus_bi_sync_enabled.
        - Utiliza o maior horus_bi_id já salvo para evitar duplicações.
        - Persiste em lotes no PostgreSQL.
        """
        if not getattr(self.settings, "horus_bi_sync_enabled", False):
            return {
                "success": False,
                "message": "Sincronização de BI desativada nas configurações desta empresa."
            }

        # 1. Consulta parâmetros para saber limites
        params_info = await self.get_parameters()
        api_max_limit = params_info.get("MAX_LIMIT") or 5000
        page_limit = min(batch_limit or 2000, api_max_limit)

        # 2. Obtém maior ID já gravado
        last_saved_bi_id = self.db.query(func.max(HorusBISale.horus_bi_id)).filter(
            HorusBISale.company_id == self.company_id
        ).scalar() or 0

        # Para carga inicial, podemos limitar aos últimos 12 meses se last_saved_bi_id == 0
        cutoff_date = datetime.utcnow() - timedelta(days=365) if last_saved_bi_id == 0 else None

        offset = 0
        total_synced = 0
        pages_processed = 0

        logger.info(f"[HorusBI Sync] Iniciando para empresa {self.company_id}. Last BI ID: {last_saved_bi_id}, Page Limit: {page_limit}")

        while pages_processed < max_pages:
            try:
                page_data = await self.get_sales_page(offset=offset, limit=page_limit)
            except Exception as e:
                logger.error(f"[HorusBI Sync] Erro ao buscar página offset {offset}: {e}")
                break

            if not page_data:
                logger.info(f"[HorusBI Sync] Nenhum registro retornado no offset {offset}. Fim dos dados.")
                break

            records_to_insert = []
            reached_old_records = False

            for item in page_data:
                bi_id = item.get("ID")
                if not bi_id:
                    continue

                # Se já atingimos registros que já temos salvos (quando a API do Horus vem ordenada decrescente)
                if last_saved_bi_id > 0 and bi_id <= last_saved_bi_id:
                    # Se vier ordenado por ID desc, podemos parar
                    pass

                # Parse data
                raw_date = item.get("DATA")
                sale_dt = None
                if raw_date:
                    try:
                        sale_dt = datetime.fromisoformat(raw_date.replace("Z", "+00:00")).replace(tzinfo=None)
                    except Exception:
                        sale_dt = datetime.utcnow()
                else:
                    sale_dt = datetime.utcnow()

                # Se for carga inicial e a data for anterior a 12 meses, pula
                if cutoff_date and sale_dt < cutoff_date:
                    continue

                # Higieniza CFOP e classifica movimento
                cfop_raw = item.get("CFOP") or item.get("COD_CFOP") or item.get("NRO_CFOP") or ""
                clean_cfop = sanitize_cfop(cfop_raw)
                mov_type = classify_cfop_movement(
                    clean_cfop,
                    sales_cfops=self.settings.sales_cfops,
                    consign_cfops=self.settings.consign_cfops,
                    dev_sales_cfops=self.settings.dev_sales_cfops,
                    dev_consign_cfops=self.settings.dev_consign_cfops
                )

                ean_clean = str(item.get("EAN") or item.get("COD_BARRA_ITEM") or item.get("BARRAS_ISBN") or "").strip()
                if not ean_clean:
                    continue

                bi_sale = HorusBISale(
                    company_id=self.company_id,
                    horus_bi_id=bi_id,
                    customer_horus_id=item.get("COD_CLI") or 0,
                    customer_name=item.get("NOM_CLI"),
                    ean=ean_clean,
                    item_code=item.get("COD_ITEM"),
                    item_name=item.get("NOM_ITEM"),
                    publisher=item.get("NOM_EDITORA"),
                    genre=item.get("NOM_GENERO"),
                    genre_sub=item.get("NOM_GENERO_NIVEL2"),
                    sale_date=sale_dt,
                    month=item.get("MES"),
                    year=item.get("ANO"),
                    cfop=clean_cfop or None,
                    movement_type=mov_type,
                    qty_ordered=int(item.get("QT_PEDIDA") or 0),
                    qty_fulfilled=int(item.get("QTD_ATENDIDA") or 0),
                    qty_returned=int(item.get("QTD_ITENS_DEVOLVIDA") or 0),
                    net_value=float(item.get("VLR_TOTAL_LIQUIDO") or 0.0),
                    gross_value=float(item.get("VLR_BRUTO_ITEM") or 0.0),
                    discount_percent=float(item.get("DESCONTO_MEDIO") or 0.0),
                    freight_value=float(item.get("FRETE") or 0.0),
                    sales_channel=item.get("DESC_METODO"),
                    sales_order_horus=item.get("COD_PED_VENDA"),
                    invoice_number=item.get("COD_NF"),
                    local_warehouse=item.get("NOM_LOCAL"),
                    synced_at=datetime.utcnow()
                )
                records_to_insert.append(bi_sale)

            if records_to_insert:
                # Upsert em lote evitando duplicatas
                from sqlalchemy.dialects.postgresql import insert
                for rec in records_to_insert:
                    stmt = insert(HorusBISale).values(
                        company_id=rec.company_id,
                        horus_bi_id=rec.horus_bi_id,
                        customer_horus_id=rec.customer_horus_id,
                        customer_name=rec.customer_name,
                        ean=rec.ean,
                        item_code=rec.item_code,
                        item_name=rec.item_name,
                        publisher=rec.publisher,
                        genre=rec.genre,
                        genre_sub=rec.genre_sub,
                        sale_date=rec.sale_date,
                        month=rec.month,
                        year=rec.year,
                        cfop=rec.cfop,
                        movement_type=rec.movement_type,
                        qty_ordered=rec.qty_ordered,
                        qty_fulfilled=rec.qty_fulfilled,
                        qty_returned=rec.qty_returned,
                        net_value=rec.net_value,
                        gross_value=rec.gross_value,
                        discount_percent=rec.discount_percent,
                        freight_value=rec.freight_value,
                        sales_channel=rec.sales_channel,
                        sales_order_horus=rec.sales_order_horus,
                        invoice_number=rec.invoice_number,
                        local_warehouse=rec.local_warehouse,
                        synced_at=rec.synced_at
                    ).on_conflict_do_nothing(
                        constraint='uix_horus_bi_sales_company_bi_id'
                    )
                    self.db.execute(stmt)
                
                self.db.commit()
                total_synced += len(records_to_insert)

            pages_processed += 1
            offset += page_limit

            # Se retornou menos que o limit, acabaram os registros
            if len(page_data) < page_limit:
                break

        logger.info(f"[HorusBI Sync] Concluído para empresa {self.company_id}. Total inserido/verificado: {total_synced}")
        return {
            "success": True,
            "total_synced": total_synced,
            "pages_processed": pages_processed,
            "last_offset": offset
        }

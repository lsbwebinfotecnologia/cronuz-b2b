"""
horus_financial.py
------------------
Endpoints do módulo Horus Direct — Financeiro Vindi.

Funcionalidades:
  1. Upload e preview da planilha Vindi (CSV / XLSX) com comparação contra o SQL Server do Horus ERP.
  2. Apontamento de divergências (valor, status, não encontrados).
  3. Geração de Borderô de baixa no Horus ERP (INSERT em BORDERO + UPDATE em LANCTOS_CRECEBER/LANCTOS_CRECEBERA).
  4. Download de modelo de planilha CSV da Vindi.

PERFORMANCE & SEGURANÇA:
  - Processamento de arquivo 100% em memória (stateless).
  - Chamadas pytds executadas em thread pool (run_in_executor) para não bloquear o event loop FastAPI.
  - Ownership guard em todos os endpoints (_assert_ownership).
  - Cursores SQL fechados via context manager.
"""
import io
import time
import asyncio
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.core.utils import assert_company_ownership
from app.integrators.horus_sql_client import HorusSQLClient, HorusSQLConfigError
from app.integrators.vindi_financial_parser import parse_vindi_file

router = APIRouter()
logger = logging.getLogger(__name__)


def _assert_ownership(current_user, company_id: int) -> None:
    """[SEC] Delegado para assert_company_ownership centralizado."""
    assert_company_ownership(current_user, company_id)


def _get_settings_or_404(db: Session, company_id: int):
    from app.models.company_settings import CompanySettings
    settings = db.query(CompanySettings).filter(
        CompanySettings.company_id == company_id
    ).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Configurações da empresa não encontradas.")
    return settings


# ── Schemas ───────────────────────────────────────────────────────────────────

class ReleaseItemPayload(BaseModel):
    nro_lancamento: int
    cod_filial: str
    cod_ped_venda: Optional[int] = None
    pedido_web: Optional[str] = None
    valor: float
    status: str = "AB"


class CreateBorderoPayload(BaseModel):
    releases: List[ReleaseItemPayload]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/companies/{company_id}/horus-sql/vindi/template")
def download_vindi_template(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Retorna modelo CSV de exemplo para upload de extrato/planilha da Vindi.
    """
    _assert_ownership(current_user, company_id)

    csv_content = (
        "Pedido;Cliente;Documento;Valor;Data Pagamento;Status;Forma Pagamento\n"
        "1001;Livraria Exemplo LTDA;12.345.678/0001-90;250.00;01/09/2026;Paga;Cartao de Credito\n"
        "1002;Distribuidora Cultural;98.765.432/0001-10;480.50;01/09/2026;Paga;Boleto Bancario\n"
        "1003;Livraria Saber Mais;11.222.333/0001-44;120.00;01/09/2026;Paga;Pix\n"
    )

    return StreamingResponse(
        io.BytesIO(csv_content.encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=modelo_planilha_vindi.csv"}
    )


@router.post("/companies/{company_id}/horus-sql/vindi/preview")
async def preview_vindi_reconciliation(
    company_id: int,
    file: UploadFile = File(...),
    filial: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Recebe arquivo CSV/XLSX da Vindi, parseia em memória e consulta os lançamentos
    no SQL Server do Horus ERP correspondentes a cada pedido web.

    Retorna status de match, divergências de valores e lançamentos não encontrados.
    """
    _assert_ownership(current_user, company_id)
    settings = _get_settings_or_404(db, company_id)

    # 1. Lê os bytes do arquivo em memória
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="O arquivo enviado está vazio.")

    # 2. Parseia os dados da Vindi
    vindi_rows, parse_warnings = parse_vindi_file(contents, file.filename or "planilha.csv")
    if not vindi_rows:
        raise HTTPException(
            status_code=400,
            detail=f"Não foi possível extrair lançamentos da planilha. {'; '.join(parse_warnings)}"
        )

    # 3. Extrai lista de pedidos web para consulta no Horus
    pedidos_set = {str(r["pedido_web"]).strip() for r in vindi_rows if r.get("pedido_web")}
    if not pedidos_set:
        raise HTTPException(status_code=400, detail="Nenhum número de pedido identificado na planilha.")

    # 4. Conecta ao SQL Server do Horus via HorusSQLClient
    try:
        sql_client = HorusSQLClient(db, company_id)
    except HorusSQLConfigError as e:
        raise HTTPException(status_code=400, detail=str(e))

    cod_filial = str(filial or settings.horus_sql_cod_filial or settings.horus_branch or "1").strip()

    # 5. Executa a query no SQL Server em thread pool separada (não bloqueia event loop)
    # Consulta LANCTOS_CRECEBER + PEDIDOS_VENDA + NF_MESTRE
    def _fetch_horus_data():
        pedidos_list = list(pedidos_set)
        # Quebra em batches se houver muitos pedidos (máximo 1000 por batch)
        batch_size = 500
        all_horus_releases = []

        for i in range(0, len(pedidos_list), batch_size):
            batch = pedidos_list[i:i + batch_size]
            placeholders = ", ".join(["%s"] * len(batch))
            query_sql = f"""
                SELECT 
                    LR.NRO_LANCTO_CRECEBER,
                    LR.COD_PED_VENDA,
                    LR.COD_FILIAL,
                    LR.STA_LANCTO_CRECEBER,
                    LR.VLR_LANCTO_TOTAL AS VLR_LANCTO_CRECEBER,
                    LR.COD_BORDERO,
                    PV.COD_METODO,
                    PV.COD_PEDIDO_ORIGEM AS PEDIDO_WEB,
                    NF.NRO_NOTA_FISCAL
                FROM LANCTOS_CRECEBER LR
                INNER JOIN PEDIDOS_VENDA PV 
                    ON PV.COD_PED_VENDA = LR.COD_PED_VENDA 
                    AND PV.COD_FILIAL = LR.COD_FILIAL
                OUTER APPLY (
                    SELECT TOP 1 NRO_NOTA_FISCAL 
                    FROM NF_MESTRE 
                    WHERE NF_MESTRE.COD_PED_VENDA = PV.COD_PED_VENDA 
                    AND NF_MESTRE.COD_FILIAL = PV.COD_FILIAL
                ) NF
                WHERE LR.COD_FILIAL = %s
                  AND PV.COD_FILIAL = %s
                  AND PV.COD_PEDIDO_ORIGEM IN ({placeholders})
                ORDER BY PV.COD_PED_VENDA DESC, LR.NRO_LANCTO_CRECEBER DESC
            """
            params = tuple([cod_filial, cod_filial] + batch)
            rows = sql_client.query(query_sql, params, max_rows=5000)
            all_horus_releases.extend(rows)

        return all_horus_releases

    try:
        loop = asyncio.get_event_loop()
        horus_rows = await loop.run_in_executor(None, _fetch_horus_data)
    except Exception as e:
        logger.error("[HorusFinancialPreview] Erro na consulta ao SQL Horus company=%s: %s", company_id, e)
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao consultar lançamentos no SQL Server do Horus: {str(e)}"
        )

    # 6. Indexa os resultados do Horus por PEDIDO_WEB
    # Ordena os lançamentos priorizando títulos em aberto ('AB') e pedidos mais recentes
    horus_by_pedido: Dict[str, List[Dict[str, Any]]] = {}
    for hr in horus_rows:
        ped_key = str(hr.get("PEDIDO_WEB", "")).strip()
        if ped_key not in horus_by_pedido:
            horus_by_pedido[ped_key] = []
        horus_by_pedido[ped_key].append(hr)

    for ped_key, m_list in horus_by_pedido.items():
        m_list.sort(
            key=lambda m: (
                1 if str(m.get("STA_LANCTO_CRECEBER", "")).strip().upper() == "AB" and not (m.get("COD_BORDERO") and int(m.get("COD_BORDERO")) > 0) else 0,
                int(m.get("COD_PED_VENDA") or 0),
                int(m.get("NRO_LANCTO_CRECEBER") or 0)
            ),
            reverse=True
        )

    # 7. Faz a conciliação linha a linha da planilha Vindi
    items_ready = []          # ✅ Encontrados, em aberto ('AB'), valor bate -> selecionáveis
    items_divergence = []     # ⚠️ Encontrados, em aberto, mas com diferença de valor
    items_already_paid = []   # ℹ️ Encontrados, mas já baixados ou já com borderô
    items_not_found = []      # ❌ Não encontrados no Horus

    total_vindi_amount = 0.0
    total_ready_amount = 0.0
    total_divergence_amount = 0.0
    total_not_found_amount = 0.0

    for v_row in vindi_rows:
        ped = str(v_row["pedido_web"]).strip()
        v_valor = float(v_row["valor"])
        total_vindi_amount += v_valor

        matches = horus_by_pedido.get(ped, [])

        if not matches:
            # ❌ Não encontrado no Horus
            items_not_found.append({
                "linha": v_row["linha"],
                "pedido_web": ped,
                "cliente_nome": v_row["cliente_nome"],
                "documento": v_row["documento"],
                "valor_vindi": v_valor,
                "data_pagamento": v_row["data_pagamento"],
                "status_vindi": v_row["status_vindi"],
                "forma_pagamento": v_row["forma_pagamento"],
                "motivo": f"Pedido '{ped}' não localizado no Horus para a filial {cod_filial}.",
            })
            total_not_found_amount += v_valor
            continue

        # Identifica o pedido do Horus mais recente para este pedido web
        pedidos_horus_ids = sorted(
            list({int(m.get("COD_PED_VENDA") or 0) for m in matches if m.get("COD_PED_VENDA")}),
            reverse=True
        )
        mais_recente_ped_horus = pedidos_horus_ids[0] if pedidos_horus_ids else None
        has_multiplos_pedidos = len(pedidos_horus_ids) > 1

        # Para cada lançamento correspondente no Horus
        for idx_match, h_match in enumerate(matches):
            h_ped_venda = int(h_match.get("COD_PED_VENDA") or 0)
            is_pedido_mais_recente = (h_ped_venda == mais_recente_ped_horus)

            # Conta quantas parcelas/lançamentos este mesmo COD_PED_VENDA possui
            parcelas_deste_pedido = [m for m in matches if int(m.get("COD_PED_VENDA") or 0) == h_ped_venda]
            total_parcelas = len(parcelas_deste_pedido)
            parcela_num = parcelas_deste_pedido.index(h_match) + 1 if h_match in parcelas_deste_pedido else 1

            h_status = str(h_match.get("STA_LANCTO_CRECEBER", "")).strip().upper()
            h_valor = float(h_match.get("VLR_LANCTO_CRECEBER") or 0.0)
            h_bordero = h_match.get("COD_BORDERO")
            h_lancto = h_match.get("NRO_LANCTO_CRECEBER")
            h_nf = h_match.get("NRO_NOTA_FISCAL")

            diff_val = round(abs(v_valor - h_valor), 2)
            has_value_divergence = diff_val > 0.05  # tolerância de 5 centavos

            # Determina a situação simplificada no ERP
            is_bordero_set = bool(h_bordero and int(h_bordero) > 0)
            if h_status == "AB" and not is_bordero_set:
                situacao_horus = "ABERTO"
            elif is_bordero_set or h_status in ("PG", "LQ", "BX", "BA"):
                situacao_horus = "PAGO"
            elif h_status == "CA":
                situacao_horus = "CANCELADO"
            else:
                situacao_horus = h_status or "DESCONHECIDO"

            # Auto-seleção: marca por padrão TODOS os lançamentos em aberto DO PEDIDO HORUS MAIS RECENTE
            should_select = bool(situacao_horus == "ABERTO" and is_pedido_mais_recente)

            base_item = {
                "linha": v_row["linha"],
                "pedido_web": ped,
                "nro_lancamento": h_lancto,
                "cod_ped_venda": h_ped_venda,
                "cod_filial": cod_filial,
                "nro_nota_fiscal": h_nf or "-",
                "cliente_nome": v_row["cliente_nome"],
                "documento": v_row["documento"],
                "valor_vindi": v_valor,
                "valor_horus": h_valor,
                "diferenca_valor": diff_val if has_value_divergence else 0.0,
                "data_pagamento": v_row["data_pagamento"],
                "status_horus": h_status,
                "situacao_horus": situacao_horus,
                "status_vindi": v_row["status_vindi"],
                "cod_bordero": h_bordero,
                "forma_pagamento": v_row["forma_pagamento"],
                "is_mais_recente": is_pedido_mais_recente,
                "has_multiplos": has_multiplos_pedidos,
                "total_pedidos_horus": len(pedidos_horus_ids),
                "total_parcelas": total_parcelas,
                "parcela_num": parcela_num,
                "selected": should_select,
            }

            if is_bordero_set:
                base_item["motivo"] = f"Lançamento já incluído no Borderô #{h_bordero}."
                items_already_paid.append(base_item)
            elif h_status != "AB":
                base_item["motivo"] = f"Lançamento no Horus não está em aberto (Status: {h_status})."
                items_already_paid.append(base_item)
            elif has_value_divergence:
                base_item["motivo"] = f"Divergência de valor: Vindi R$ {v_valor:.2f} x Horus R$ {h_valor:.2f} (Dif: R$ {diff_val:.2f})."
                items_divergence.append(base_item)
                if should_select:
                    total_divergence_amount += v_valor
            else:
                items_ready.append(base_item)
                if should_select:
                    total_ready_amount += v_valor

    # 8. Estatísticas consolidadas
    abertos_qtd = sum(1 for it in (items_ready + items_divergence) if it.get("situacao_horus") == "ABERTO")
    abertos_valor = sum(it.get("valor_vindi", 0) for it in (items_ready + items_divergence) if it.get("situacao_horus") == "ABERTO")
    pagos_qtd = len(items_already_paid)
    pagos_valor = sum(it.get("valor_vindi", 0) for it in items_already_paid)

    summary = {
        "total_planilha_qtd": len(vindi_rows),
        "total_planilha_valor": round(total_vindi_amount, 2),
        "ready_qtd": len(items_ready),
        "ready_valor": round(total_ready_amount, 2),
        "divergence_qtd": len(items_divergence),
        "divergence_valor": round(total_divergence_amount, 2),
        "already_paid_qtd": len(items_already_paid),
        "already_paid_valor": round(pagos_valor, 2),
        "abertos_qtd": abertos_qtd,
        "abertos_valor": round(abertos_valor, 2),
        "pagos_qtd": pagos_qtd,
        "pagos_valor": round(pagos_valor, 2),
        "not_found_qtd": len(items_not_found),
        "not_found_valor": round(total_not_found_amount, 2),
        "filial_consultada": cod_filial,
    }

    # 9. Configurações bancárias ativas (para visualização no modal de borderô)
    bank_config = {
        "forma_pagto": settings.horus_banco_forma_pagto or "",
        "banco": settings.horus_banco_codigo or "",
        "agencia": settings.horus_banco_agencia or "",
        "conta": settings.horus_banco_conta or "",
        "carteira": settings.horus_banco_carteira or "",
        "cod_empresa": sql_client.cod_empresa,
        "cod_filial": sql_client.cod_filial,
        "is_configured": bool(
            settings.horus_banco_forma_pagto and settings.horus_banco_codigo
            and settings.horus_banco_agencia and settings.horus_banco_conta
            and settings.horus_banco_carteira
        )
    }

    return {
        "success": True,
        "summary": summary,
        "bank_config": bank_config,
        "items_ready": items_ready,
        "items_divergence": items_divergence,
        "items_already_paid": items_already_paid,
        "items_not_found": items_not_found,
        "warnings": parse_warnings,
    }


@router.post("/companies/{company_id}/horus-sql/vindi/bordero")
async def create_vindi_bordero(
    company_id: int,
    payload: CreateBorderoPayload,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Gera Borderô de liquidação no SQL Server do Horus ERP:
      1. Valida configurações bancárias em cmp_settings.
      2. Calcula valor total dos títulos selecionados (status 'AB').
      3. Obtém o próximo COD_BORDERO no SQL Server.
      4. Executa INSERT na tabela BORDERO.
      5. Executa UPDATE em LANCTOS_CRECEBER e LANCTOS_CRECEBERA atribuindo o COD_BORDERO.
    """
    _assert_ownership(current_user, company_id)
    settings = _get_settings_or_404(db, company_id)

    # 1. Validação dos parâmetros bancários obrigatórios
    required_bank_fields = {
        "Forma de Pagamento": settings.horus_banco_forma_pagto,
        "Código do Banco": settings.horus_banco_codigo,
        "Agência": settings.horus_banco_agencia,
        "Conta Corrente": settings.horus_banco_conta,
        "Carteira": settings.horus_banco_carteira,
    }
    missing_fields = [name for name, val in required_bank_fields.items() if not val or not str(val).strip()]
    if missing_fields:
        raise HTTPException(
            status_code=400,
            detail=f"Parâmetros bancários incompletos em Configurações Horus SQL: {', '.join(missing_fields)}. Preencha antes de gerar o borderô."
        )

    # 2. Validação dos lançamentos selecionados
    if not payload.releases:
        raise HTTPException(status_code=400, detail="Nenhum lançamento foi selecionado para o borderô.")

    releases_validos = [r for r in payload.releases if (r.status or "").upper() == "AB"]
    if not releases_validos:
        raise HTTPException(
            status_code=400,
            detail="Nenhum lançamento com status 'AB' (Em Aberto) foi selecionado. Borderô não pode ser criado."
        )

    # 3. Conecta ao SQL Server do Horus
    try:
        sql_client = HorusSQLClient(db, company_id)
    except HorusSQLConfigError as e:
        raise HTTPException(status_code=400, detail=str(e))

    cod_empresa = sql_client.cod_empresa
    cod_filial = sql_client.cod_filial

    total_bordero = round(sum(float(r.valor) for r in releases_validos), 2)
    lancto_ids = [int(r.nro_lancamento) for r in releases_validos]

    # 4. Executa a geração do borderô no SQL Server dentro de thread pool
    def _execute_bordero_transaction():
        conn = sql_client._get_connection()
        today_str = datetime.now().strftime("%d-%m-%y")
        nom_arquivo = f"cronuz{today_str}"

        with conn.cursor() as cur:
            # 4.1. Busca próximo COD_BORDERO
            cur.execute("SELECT ISNULL(MAX(COD_BORDERO), 0) + 1 AS next_id FROM BORDERO")
            row_id = cur.fetchone()
            id_bordero = int(row_id["next_id"] if isinstance(row_id, dict) else row_id[0])

            logger.info(
                "[HorusBordero] Criando Bordero #%s company=%s total=R$ %.2f itens=%s",
                id_bordero, company_id, total_bordero, len(releases_validos)
            )

            # 4.2. INSERT na tabela BORDERO
            insert_sql = """
                INSERT INTO BORDERO (
                    COD_EMPRESA, COD_FILIAL, COD_FORMA, COD_BORDERO,
                    VLR_TOT_BORDERO, STA_BORDERO, STA_APROVACAO, USU_APROVACAO,
                    TPO_BORDERO, NOM_ARQUIVO, SEQ_NOME, SEQ_REMESSA,
                    NOM_USU, COD_BANCO, COD_AGENCIA, COD_CONTAC, NRO_CARTEIRA,
                    DAT_ULT_ATL, DAT_GERACAO
                ) VALUES (
                    %s, %s, %s, %s,
                    %s, 'AP', 'S', 'dbo',
                    'CAR', %s, '', '',
                    'dbo', %s, %s, %s, %s,
                    GETDATE(), GETDATE()
                )
            """
            insert_params = (
                cod_empresa,
                cod_filial,
                settings.horus_banco_forma_pagto.strip(),
                id_bordero,
                total_bordero,
                nom_arquivo,
                settings.horus_banco_codigo.strip(),
                settings.horus_banco_agencia.strip(),
                settings.horus_banco_conta.strip(),
                settings.horus_banco_carteira.strip(),
            )
            cur.execute(insert_sql, insert_params)

            # 4.3. UPDATE em LANCTOS_CRECEBER e LANCTOS_CRECEBERA
            # Atualiza em batches para respeitar limite de parâmetros
            batch_size = 500
            for i in range(0, len(lancto_ids), batch_size):
                b_ids = lancto_ids[i:i + batch_size]
                placeholders = ", ".join(["%s"] * len(b_ids))

                # Atualiza LANCTOS_CRECEBER
                update_sql1 = f"""
                    UPDATE LANCTOS_CRECEBER
                    SET COD_BORDERO = %s
                    WHERE COD_FILIAL = %s
                      AND NRO_LANCTO_CRECEBER IN ({placeholders})
                """
                cur.execute(update_sql1, tuple([id_bordero, cod_filial] + b_ids))

                # Atualiza LANCTOS_CRECEBERA (espelho)
                try:
                    update_sql2 = f"""
                        UPDATE LANCTOS_CRECEBERA
                        SET COD_BORDERO = %s
                        WHERE COD_FILIAL = %s
                          AND NRO_LANCTO_CRECEBER IN ({placeholders})
                    """
                    cur.execute(update_sql2, tuple([id_bordero, cod_filial] + b_ids))
                except Exception as ex_a:
                    # Se LANCTOS_CRECEBERA não existir ou falhar, loga como aviso
                    logger.warning("[HorusBordero] Aviso ao atualizar LANCTOS_CRECEBERA: %s", ex_a)

        # Commit da transação no SQL Server
        conn.commit()
        return id_bordero

    try:
        loop = asyncio.get_event_loop()
        bordero_id = await loop.run_in_executor(None, _execute_bordero_transaction)
    except Exception as e:
        logger.error("[HorusBordero] Erro ao gravar bordero company=%s: %s", company_id, e)
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao gravar borderô no SQL Server do Horus: {str(e)}"
        )

    return {
        "success": True,
        "bordero_number": bordero_id,
        "total_valor": total_bordero,
        "itens_baixados": len(releases_validos),
        "message": f"Borderô #{bordero_id} gerado com sucesso no Horus ERP (Total: R$ {total_bordero:.2f} em {len(releases_validos)} lançamentos).",
    }

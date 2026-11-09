"""
reconciliation_parser.py
------------------------
Motor de parsing em memória (Stateless) para Conciliação Bancária & Marketplaces
calibrado com os layouts reais de exportação:
  1. Shopee (`my_balance_transaction_report.shopee.*.xlsx`):
     - Metadados nas linhas 1..17, cabeçalho na linha 18:
       `Data | Tipo de transação | Descrição | ID do pedido | Direção do dinheiro | Valor | Status | Balança após as transações | Valor a Ser Ajustado`
     - `Valor` na Shopee é o Valor Líquido do Repasse (`valor_liquido`). O Valor Bruto (`valor_bruto`), Cliente e CPF vêm do cruzamento com a planilha da Tray.
  2. Tray (`pedidos_*.csv` / `.xlsx`):
     - 47 colunas padrão da Tray (`Pedido;Data;Hora;Nome do Cliente;Razão Social;CPF;CNPJ;...;Subtotal produtos;...;Canal de venda;...;Obs. loja;Status pedido;...;Total;...;Valor pagamento;Forma pagamento paga;...;Pedido marketplace`).
     - Extrai `Pedido` (nº Tray integrado ao Horus em `COD_PEDIDO_ORIGEM`), `Pedido marketplace` (ou via regex em `Obs. loja`), `Total`, `Subtotal produtos`, `Nome do Cliente`, `CPF`/`CNPJ`.
  3. Vindi / Yapay (`Recebiveis-pagos*.csv`):
     - Colunas: `Data;ID Transação;N. Pedido;Descrição;Forma de Pagamento;Parcelas;Origem;Valor Liq.;Valor Bruto;Taxa Retenção;Taxa Antecipação`
     - `N. Pedido` já é o nº do pedido na Tray (`COD_PEDIDO_ORIGEM` no Horus).
     - Soma `Taxa Retenção + Taxa Antecipação`, extrai `Parcelas` (`1 de 2`), ignora linhas de saque bancário sem `N. Pedido` (`Origem = Vindi Pagamentos`) e sinaliza estornos (`Valor Liq. < 0`).
  4. Extrato Conta Digital PagCerto/Yapay (`ExtratoContaDigital_*.csv`):
     - Detecta quando o usuário envia o extrato de transferências bancárias (`Transferencia Bankline` / `NuLiquid`) que não possui números de pedidos individuais.
"""
import csv
import io
import logging
import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


def _normalize_header(header: Any) -> str:
    if header is None:
        return ""
    h = str(header).strip().lower()
    h = "".join(c for c in unicodedata.normalize("NFD", h) if unicodedata.category(c) != "Mn")
    h = re.sub(r"[^\w\s]", " ", h)
    h = re.sub(r"\s+", "_", h.strip())
    return h


def _clean_str(val: Any) -> str:
    if val is None:
        return ""
    if isinstance(val, float) and val.is_integer():
        return str(int(val))
    s = str(val).strip()
    if s.endswith(".0") and s[:-2].isdigit():
        return s[:-2]
    return s


def _normalize_order_key(code: Any) -> str:
    """Normaliza código de pedido para comparação (sem #, espaços extras ou .0 de Excel)."""
    s = _clean_str(code).upper()
    s = s.lstrip("#").strip()
    if s.startswith("'") or s.startswith('"'):
        s = s[1:].strip()
    return s


def _parse_currency(val: Any) -> float:
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip()
    if not s:
        return 0.0
    is_neg = "-" in s or (s.startswith("(") and s.endswith(")"))
    s = re.sub(r"[^\d,\.]", "", s)
    if not s or s in (".", ","):
        return 0.0
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        num = float(s)
        return -abs(num) if is_neg else num
    except ValueError:
        return 0.0


def _parse_installment_str(parc_str: str) -> Tuple[Optional[int], Optional[int]]:
    """Converte '1 de 2' ou '1/2' em (1, 2)."""
    if not parc_str:
        return None, None
    m = re.search(r"(\d+)\s*(?:de|/)\s*(\d+)", str(parc_str), flags=re.IGNORECASE)
    if m:
        try:
            return int(m.group(1)), int(m.group(2))
        except ValueError:
            return None, None
    return None, None


def _read_raw_rows(file_bytes: bytes, filename: str) -> Tuple[List[List[Any]], List[str]]:
    """Lê todas as linhas não-vazias de um CSV ou XLSX em memória."""
    errors: List[str] = []
    fn_lower = (filename or "").lower()

    if fn_lower.endswith(".xlsx") or fn_lower.endswith(".xlsm"):
        try:
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True, read_only=True)
            sheet = wb.active
            try:
                sheet.reset_dimensions()
            except Exception:
                pass
            raw_rows: List[List[Any]] = []
            for row in sheet.iter_rows(values_only=True):
                if row and any(c is not None and str(c).strip() != "" for c in row):
                    raw_rows.append(list(row))
            wb.close()
            if not raw_rows:
                return [], ["Planilha Excel está vazia."]
            return raw_rows, errors
        except Exception as e:
            logger.error("[ReconciliationParser] Erro ao ler XLSX (%s): %s", filename, e)
            return [], [f"Não foi possível ler a planilha Excel ({filename}): {str(e)}"]

    # Leitura CSV com detecção de encoding (UTF-8-SIG, UTF-8, CP1252, Latin-1) e delimitador
    text_content = ""
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            text_content = file_bytes.decode(enc)
            break
        except UnicodeDecodeError:
            continue

    if not text_content:
        return [], [f"Não foi possível decodificar o arquivo '{filename}'."]

    lines = [ln for ln in text_content.splitlines() if ln.strip()]
    if not lines:
        return [], [f"O arquivo '{filename}' está vazio."]

    sample_text = "\n".join(lines[:10])
    semi_cnt = sample_text.count(";")
    comma_cnt = sample_text.count(",")
    tab_cnt = sample_text.count("\t")
    if tab_cnt > max(semi_cnt, comma_cnt):
        delimiter = "\t"
    elif semi_cnt >= comma_cnt:
        delimiter = ";"
    else:
        delimiter = ","

    reader = csv.reader(io.StringIO(text_content), delimiter=delimiter)
    raw_rows = [r for r in reader if r and any(str(c).strip() for c in r)]
    if not raw_rows:
        return [], [f"Nenhuma linha válida encontrada em '{filename}'."]
    return raw_rows, errors


def _detect_header_row_index(raw_rows: List[List[Any]], candidate_keywords: List[str]) -> int:
    """
    Localiza em qual linha (entre as primeiras 30) está o cabeçalho real da planilha.
    No relatório oficial da Shopee (`my_balance_transaction_report`), o cabeçalho fica na linha 18
    (índice 10..18 após pular linhas em branco).
    """
    best_idx = 0
    best_score = -1
    max_scan = min(len(raw_rows), 30)

    for idx in range(max_scan):
        norm_cells = [_normalize_header(c) for c in raw_rows[idx] if c is not None and str(c).strip() != ""]
        if len(norm_cells) < 3:
            continue
        score = 0
        for cell in norm_cells:
            if any(k == cell or k in cell for k in candidate_keywords):
                score += 1
        # Bônus se tiver explicitamente id_do_pedido / n_pedido / pedido_marketplace
        if any(c in ("id_do_pedido", "n_pedido", "pedido_marketplace", "pedido", "order_id") for c in norm_cells):
            score += 3
        if score > best_score:
            best_score = score
            best_idx = idx

    return best_idx


def parse_channel_file(
    file_bytes: bytes,
    filename: str,
    profile_code: str = "TRAY_SHOPEE",
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Parseia a planilha do Canal de Recebimento:
      - Shopee (`my_balance_transaction_report.shopee.*.xlsx`)
      - Vindi (`Recebiveis-pagos*.csv`)
      - TikTok Shop (`settlement_report*.xlsx` / `.csv`)
    """
    raw_rows, errors = _read_raw_rows(file_bytes, filename)
    if not raw_rows:
        return [], errors

    header_keywords = [
        "id_do_pedido", "n_pedido", "pedido", "order_id", "id_transacao",
        "tipo_de_transacao", "direcao_do_dinheiro", "valor_liq", "valor_bruto",
        "taxa_retencao", "taxa_antecipacao", "forma_de_pagamento", "parcelas",
        "valor", "status", "data", "descricao", "settlement", "commission",
    ]
    h_idx = _detect_header_row_index(raw_rows, header_keywords)
    header_raw = [str(c or "") for c in raw_rows[h_idx]]
    data_rows = raw_rows[h_idx + 1:]
    headers_norm = [_normalize_header(h) for h in header_raw]

    # Detecta se o usuário subiu por engano o ExtratoContaDigital (lotes de saque Bankline sem N. Pedido)
    if "idsolicitacaotransferencia" in headers_norm or "detailslink" in headers_norm:
        return [], [
            f"O arquivo '{filename}' é um Extrato de Transferências da Conta Digital (lotes de saque Bankline/NuLiquid sem número de pedido individual). "
            "Para conciliar os pedidos no Horus, envie o arquivo 'Recebíveis Pagos' da Vindi (que possui a coluna 'N. Pedido')."
        ]

    # Detecta se é o layout oficial da Shopee (`my_balance_transaction_report`)
    is_shopee_balance_report = (
        "id_do_pedido" in headers_norm
        and ("direcao_do_dinheiro" in headers_norm or "tipo_de_transacao" in headers_norm or "balanca_apos_as_transacoes" in headers_norm)
    )

    # Detecta se é o layout oficial da Vindi (`Recebiveis-pagos`)
    is_vindi_recebiveis = (
        "n_pedido" in headers_norm
        and "id_transacao" in headers_norm
        and ("valor_liq" in headers_norm or "taxa_retencao" in headers_norm)
    )

    col_map = {
        "pedido": -1,
        "id_transacao": -1,
        "tipo_transacao": -1,
        "descricao": -1,
        "direcao_dinheiro": -1,
        "parcelas": -1,
        "origem": -1,
        "cliente": -1,
        "documento": -1,
        "valor_bruto": -1,
        "valor_liquido": -1,
        "taxa_retencao": -1,
        "taxa_antecipacao": -1,
        "valor_generico": -1,
        "data_pagamento": -1,
        "status": -1,
        "forma_pagamento": -1,
    }

    for idx, h in enumerate(headers_norm):
        if not h:
            continue
        # 1. Pedido (prioriza ID do pedido / N. Pedido exatamente)
        if col_map["pedido"] == -1 and h in (
            "id_do_pedido", "n_pedido", "nro_pedido", "numero_do_pedido",
            "pedido_shopee", "pedido_tiktok", "order_id", "pedido_web",
            "pedido_origem", "cod_pedido", "codigo_do_pedido", "pedido",
        ):
            col_map["pedido"] = idx
            continue

        if col_map["id_transacao"] == -1 and h in ("id_transacao", "transacao", "fatura_id", "id_fatura", "transaction_id"):
            col_map["id_transacao"] = idx
            continue

        if col_map["tipo_transacao"] == -1 and ("tipo_de_transacao" in h or h == "tipo"):
            col_map["tipo_transacao"] = idx
            continue

        if col_map["descricao"] == -1 and "descricao" in h:
            col_map["descricao"] = idx
            continue

        if col_map["direcao_dinheiro"] == -1 and "direcao" in h:
            col_map["direcao_dinheiro"] = idx
            continue

        if col_map["parcelas"] == -1 and "parcela" in h:
            col_map["parcelas"] = idx
            continue

        if col_map["origem"] == -1 and h == "origem":
            col_map["origem"] = idx
            continue

        if col_map["cliente"] == -1 and any(k in h for k in [
            "comprador", "cliente", "sacado", "buyer", "customer", "destinatario", "razao_social",
        ]):
            col_map["cliente"] = idx
            continue

        if col_map["documento"] == -1 and any(k in h for k in ["cpf", "cnpj", "documento", "tax_id"]):
            col_map["documento"] = idx
            continue

        if col_map["valor_bruto"] == -1 and any(k in h for k in [
            "valor_bruto", "vlr_bruto", "total_bruto", "preco_original",
            "valor_total_do_pedido", "order_amount", "gross_amount", "bruto",
        ]):
            col_map["valor_bruto"] = idx
            continue

        if col_map["valor_liquido"] == -1 and any(k in h for k in [
            "valor_liq", "valor_liquido", "vlr_liquido", "vlr_liq",
            "valor_total_lancado", "valor_do_repasse", "repasse",
            "liquido", "settlement_amount", "net_amount",
        ]):
            col_map["valor_liquido"] = idx
            continue

        if col_map["taxa_retencao"] == -1 and any(k in h for k in [
            "taxa_retencao", "taxa_de_comissao", "taxa_comissao", "comissao",
            "taxa_de_servico", "taxa_de_transacao", "commission", "fee", "taxa", "tarifa",
        ]):
            col_map["taxa_retencao"] = idx
            continue

        if col_map["taxa_antecipacao"] == -1 and "antecipacao" in h:
            col_map["taxa_antecipacao"] = idx
            continue

        if col_map["valor_generico"] == -1 and h in ("valor", "valor_pago", "valor_total", "total", "amount"):
            col_map["valor_generico"] = idx
            continue

        if col_map["data_pagamento"] == -1 and any(k in h for k in [
            "data_de_conclusao", "data_do_repasse", "data_pagamento", "dt_pagamento",
            "data_liquidacao", "settled_time", "paid_at", "data",
        ]):
            col_map["data_pagamento"] = idx
            continue

        if col_map["status"] == -1 and any(k in h for k in ["status_do_pedido", "status", "situacao", "estado"]):
            col_map["status"] = idx
            continue

        if col_map["forma_pagamento"] == -1 and any(k in h for k in [
            "forma_de_pagamento", "forma_pagamento", "metodo_de_pagamento",
            "forma_pgto", "meio_pagamento", "payment_method",
        ]):
            col_map["forma_pagamento"] = idx
            continue

    # Fallback se não achou coluna exata de pedido
    if col_map["pedido"] == -1:
        for idx, h in enumerate(headers_norm):
            if any(k in h for k in ["pedido", "order", "referencia", "codigo"]):
                col_map["pedido"] = idx
                break

    if col_map["pedido"] == -1:
        col_map["pedido"] = 0
        errors.append(f"Coluna do Nº do Pedido não identificada explicitamente em '{filename}'. Usando a 1ª coluna.")

    records: List[Dict[str, Any]] = []
    debit_rows: List[Dict[str, Any]] = []
    skipped_withdrawals = 0
    skipped_refunds = 0

    for offset, row in enumerate(data_rows, start=h_idx + 2):
        if not row or not any(row):
            continue

        def get_cell(c_idx: int) -> str:
            if 0 <= c_idx < len(row):
                return _clean_str(row[c_idx])
            return ""

        raw_ped = get_cell(col_map["pedido"])
        desc_str = get_cell(col_map["descricao"]) if col_map["descricao"] >= 0 else ""
        tipo_tx = get_cell(col_map["tipo_transacao"]) if col_map["tipo_transacao"] >= 0 else ""
        direcao = get_cell(col_map["direcao_dinheiro"]) if col_map["direcao_dinheiro"] >= 0 else ""
        origem_str = get_cell(col_map["origem"]) if col_map["origem"] >= 0 else ""

        # Se for Shopee e ID do pedido vier vazio, tenta extrair de `Descrição` (ex: "Renda do pedido #261015P4DJU18X")
        if not raw_ped and desc_str and "#" in desc_str:
            m_shp = re.search(r"#([A-Z0-9]{6,})", desc_str.upper())
            if m_shp:
                raw_ped = m_shp.group(1)

        ped_clean = _normalize_order_key(raw_ped)

        v_bruto = _parse_currency(get_cell(col_map["valor_bruto"])) if col_map["valor_bruto"] >= 0 else 0.0
        v_liq = _parse_currency(get_cell(col_map["valor_liquido"])) if col_map["valor_liquido"] >= 0 else 0.0
        t_ret = abs(_parse_currency(get_cell(col_map["taxa_retencao"]))) if col_map["taxa_retencao"] >= 0 else 0.0
        t_ant = abs(_parse_currency(get_cell(col_map["taxa_antecipacao"]))) if col_map["taxa_antecipacao"] >= 0 else 0.0
        v_taxa = round(t_ret + t_ant, 2)
        v_gen = _parse_currency(get_cell(col_map["valor_generico"])) if col_map["valor_generico"] >= 0 else 0.0

        # No relatório de saldo da Shopee (`my_balance_transaction_report`), a única coluna `Valor` é o Valor Líquido creditado!
        if is_shopee_balance_report and v_gen != 0.0 and v_liq == 0.0:
            v_liq = v_gen
            # Enquanto não cruzar com a Tray, valor_bruto inicia igual ao líquido e a flag `bruto_from_channel=False` avisa para pegar o bruto da Tray
            final_bruto = v_liq
            final_liq = v_liq
            bruto_from_channel = False
        else:
            final_bruto = v_bruto if v_bruto != 0.0 else (v_gen if v_gen != 0.0 else v_liq)
            final_liq = v_liq if v_liq != 0.0 else (final_bruto - v_taxa if v_taxa > 0 and final_bruto >= v_taxa else final_bruto)
            if v_taxa == 0.0 and final_bruto > 0 and final_liq > 0 and final_bruto > final_liq:
                v_taxa = round(final_bruto - final_liq, 2)
            bruto_from_channel = v_bruto > 0

        is_no_order_id = not ped_clean or ped_clean in ("TOTAL", "SUBTOTAL", "RESUMO", "-", "NONE")
        is_withdrawal_row = (
            "saque" in tipo_tx.lower()
            or "saque" in desc_str.lower()
            or "withdrawal" in tipo_tx.lower()
            or "transferencia" in tipo_tx.lower()
            or "transferência" in tipo_tx.lower()
            or "vindi pagamentos" in origem_str.lower()
        )
        is_debit_or_salida = (
            final_bruto < 0
            or final_liq < 0
            or v_gen < 0
            or "estorno" in desc_str.lower()
            or direcao.lower() in ("saída", "saida")
        )

        # Ignora linhas sem pedido que são Saques / Transferências / Resumos
        if is_no_order_id:
            if is_debit_or_salida and not is_withdrawal_row and (final_liq != 0.0 or v_gen != 0.0):
                # Ex: Penalização / Multa operacional na planilha da Shopee com ID do pedido = '-'
                debit_val = round(abs(final_liq if final_liq != 0.0 else v_gen), 2)
                debit_rows.append({
                    "linha": offset,
                    "pedido_canal": "",
                    "tipo_transacao": tipo_tx or "Ajuste",
                    "descricao": desc_str,
                    "valor_debito": debit_val,
                    "data_pagamento": get_cell(col_map["data_pagamento"]) or "-",
                })
                skipped_refunds += 1
            elif desc_str or tipo_tx:
                skipped_withdrawals += 1
            continue

        # Registra linhas de Saída / Débito / Reembolso / DIFAL com pedido na planilha para abater no fechamento líquido
        if is_debit_or_salida:
            if not is_withdrawal_row and (final_liq != 0.0 or v_gen != 0.0):
                debit_val = round(abs(final_liq if final_liq != 0.0 else v_gen), 2)
                debit_rows.append({
                    "linha": offset,
                    "pedido_canal": ped_clean,
                    "tipo_transacao": tipo_tx or "Saída",
                    "descricao": desc_str,
                    "valor_debito": debit_val,
                    "data_pagamento": get_cell(col_map["data_pagamento"]) or "-",
                })
            skipped_refunds += 1
            continue

        parc_str = get_cell(col_map["parcelas"]) if col_map["parcelas"] >= 0 else ""
        parc_num, parc_total = _parse_installment_str(parc_str)
        id_tx = get_cell(col_map["id_transacao"]) if col_map["id_transacao"] >= 0 else ""

        forma_pgto = get_cell(col_map["forma_pagamento"])
        if not forma_pgto:
            if is_shopee_balance_report or "SHOPEE" in profile_code:
                forma_pgto = "Shopee"
            elif "TIKTOK" in profile_code:
                forma_pgto = "TikTok Shop"
            else:
                forma_pgto = "Vindi"

        status_val = get_cell(col_map["status"])
        if not status_val:
            status_val = "Recebido" if is_vindi_recebiveis else "Pago"

        records.append({
            "linha": len(records) + 1,
            "linha_planilha": offset,
            "pedido_canal": ped_clean,
            "pedido_web": ped_clean,
            "id_transacao": id_tx,
            "parcela_canal_num": parc_num,
            "parcela_canal_total": parc_total,
            "parcelas_label": parc_str if parc_str and parc_str != "-" else "",
            "cliente_nome": get_cell(col_map["cliente"]) or "-",
            "documento": get_cell(col_map["documento"]) or "-",
            "valor": round(final_bruto, 2),
            "valor_bruto": round(final_bruto, 2),
            "valor_liquido": round(final_liq, 2),
            "valor_liquido_entrada_original": round(final_liq, 2),
            "debito_canal_abatido": 0.0,
            "taxa": round(v_taxa, 2),
            "bruto_from_channel": bruto_from_channel,
            "data_pagamento": get_cell(col_map["data_pagamento"]) or "-",
            "status_vindi": status_val,
            "forma_pagamento": forma_pgto,
            "descricao_canal": desc_str,
        })

    if not records:
        errors.append(f"Nenhum pedido de recebimento válido extraído do arquivo '{filename}'.")
        return records, errors

    # Consolida as linhas de Saída / Débito da planilha para que o líquido final bata 100% com a Soma do Excel (ex: R$ 45.485,04 na Shopee)
    entradas_liquido_total = round(sum(float(r.get("valor_liquido") or 0.0) for r in records), 2)
    saidas_total = round(sum(float(d.get("valor_debito") or 0.0) for d in debit_rows), 2)
    assigned_debits_total = 0.0
    unassigned_debits_total = 0.0

    if debit_rows:
        rec_by_ped: Dict[str, Dict[str, Any]] = {}
        for r in records:
            pk = r.get("pedido_canal") or ""
            if pk and pk not in rec_by_ped:
                rec_by_ped[pk] = r

        for deb in debit_rows:
            pk = deb.get("pedido_canal") or ""
            v_deb = round(float(deb.get("valor_debito") or 0.0), 2)
            if v_deb <= 0:
                continue
            target_rec = rec_by_ped.get(pk) if pk else None
            # Se o mesmo pedido está nas entradas da planilha e comporta o abatimento mantendo saldo líquido positivo >= R$ 1,00
            if target_rec and float(target_rec.get("valor_liquido") or 0.0) - v_deb >= 1.00:
                target_rec["valor_liquido"] = round(float(target_rec["valor_liquido"]) - v_deb, 2)
                target_rec["debito_canal_abatido"] = round(float(target_rec.get("debito_canal_abatido") or 0.0) + v_deb, 2)
                if not target_rec.get("bruto_from_channel", True):
                    target_rec["valor"] = target_rec["valor_liquido"]
                    target_rec["valor_bruto"] = target_rec["valor_liquido"]
                else:
                    target_rec["taxa"] = round(float(target_rec.get("taxa") or 0.0) + v_deb, 2)
                assigned_debits_total = round(assigned_debits_total + v_deb, 2)
                deb["assigned_to_order"] = pk
            else:
                unassigned_debits_total = round(unassigned_debits_total + v_deb, 2)
                deb["assigned_to_order"] = None

    records[0]["_channel_statement_meta"] = {
        "raw_rows_count": len(records) + len(debit_rows),
        "entradas_count": len(records),
        "entradas_liquido_total": entradas_liquido_total,
        "saidas_count": len(debit_rows),
        "saidas_total": saidas_total,
        "assigned_debits_total": assigned_debits_total,
        "unassigned_debits_total": unassigned_debits_total,
        "net_statement_total": round(entradas_liquido_total - saidas_total, 2),
        "debit_rows": debit_rows,
    }

    return records, errors


def parse_tray_bridge_file(
    file_bytes: bytes,
    filename: str,
) -> Tuple[Dict[str, Any], List[str]]:
    """
    Parseia a planilha de Pedidos da Tray (Arquivo 2: `pedidos_*.csv` / `.xlsx`) para construir o mapa de vínculos:
      - `by_channel_order`: { CODIGO_PEDIDO_MARKETPLACE: tray_record }
      - `by_tray_order`:    { CODIGO_PEDIDO_TRAY: tray_record }
      - `token_index`:      { QUALQUER_TOKEN_CELULA: tray_record }
    Calibrado com as 47 colunas da exportação oficial da Tray:
      `[0] Pedido`, `[3] Nome do Cliente`, `[5] CPF`, `[6] CNPJ`, `[10] Subtotal produtos`,
      `[12] Canal de venda`, `[14] Frete valor`, `[15] Pagamento tipo`, `[20] Obs. loja`,
      `[21] Status pedido`, `[25] Desconto`, `[34] Total`, `[37] Valor pagamento`,
      `[38] Forma pagamento paga`, `[46] Pedido marketplace`.
    """
    raw_rows, errors = _read_raw_rows(file_bytes, filename)
    if not raw_rows:
        return {"rows": [], "by_channel_order": {}, "by_tray_order": {}, "token_index": {}}, errors

    tray_keywords = [
        "pedido", "pedido_marketplace", "subtotal_produtos", "canal_de_venda",
        "obs_loja", "status_pedido", "forma_pagamento_paga", "nome_do_cliente",
        "cpf", "cnpj", "total", "valor_pagamento",
    ]
    h_idx = _detect_header_row_index(raw_rows, tray_keywords)
    header_raw = [str(c or "") for c in raw_rows[h_idx]]
    data_rows = raw_rows[h_idx + 1:]
    headers_norm = [_normalize_header(h) for h in header_raw]

    col_map = {
        "pedido_tray": -1,
        "pedido_marketplace": -1,
        "pedido_horus": -1,
        "ponto_venda": -1,
        "cliente": -1,
        "razao_social": -1,
        "cpf": -1,
        "cnpj": -1,
        "subtotal_produtos": -1,
        "frete_valor": -1,
        "desconto": -1,
        "acrescimo_forma": -1,
        "valor_tray": -1,
        "valor_pagamento": -1,
        "forma_pagamento_paga": -1,
        "pagamento_tipo": -1,
        "obs_loja": -1,
        "status_tray": -1,
        "nota_fiscal": -1,
    }

    for idx, h in enumerate(headers_norm):
        if not h:
            continue
        # 1. Coluna exata de Pedido Marketplace (`Pedido marketplace` na Tray)
        if col_map["pedido_marketplace"] == -1 and h in (
            "pedido_marketplace", "numero_pedido_marketplace", "nro_pedido_marketplace",
            "cod_marketplace", "codigo_marketplace", "id_marketplace", "pedido_parceiro",
            "pedido_loja", "pedido_canal", "pedido_shopee", "pedido_tiktok", "marketplace_order",
        ):
            col_map["pedido_marketplace"] = idx
            continue

        # 2. Coluna de Pedido Horus / ERP (se existir)
        if col_map["pedido_horus"] == -1 and h in (
            "pedido_horus", "cod_pedido_horus", "codigo_horus", "pedido_erp",
            "pedido_erp_horus", "cod_erp", "codigo_erp", "id_erp",
        ):
            col_map["pedido_horus"] = idx
            continue

        # 3. Coluna exata do Pedido Tray (`Pedido` na coluna 0 da Tray)
        if col_map["pedido_tray"] == -1 and h in (
            "pedido", "pedido_tray", "n_pedido", "nro_pedido", "numero_do_pedido",
            "numero_pedido", "id_do_pedido", "id_pedido", "cod_pedido",
        ):
            col_map["pedido_tray"] = idx
            continue

        # 4. Canal de venda (`Canal de venda` na Tray)
        if col_map["ponto_venda"] == -1 and h in (
            "canal_de_venda", "ponto_de_venda", "ponto_venda", "canal", "origem",
        ):
            col_map["ponto_venda"] = idx
            continue

        # 5. Cliente / Razão Social
        if col_map["cliente"] == -1 and h in ("nome_do_cliente", "cliente", "comprador", "nome", "destinatario"):
            col_map["cliente"] = idx
            continue
        if col_map["razao_social"] == -1 and h == "razao_social":
            col_map["razao_social"] = idx
            continue

        # 6. CPF e CNPJ (na Tray vêm em 2 colunas separadas: `CPF` e `CNPJ`)
        if col_map["cpf"] == -1 and h in ("cpf", "cpf_cnpj", "documento"):
            col_map["cpf"] = idx
            continue
        if col_map["cnpj"] == -1 and h == "cnpj":
            col_map["cnpj"] = idx
            continue

        # 7. Valores na Tray (`Subtotal produtos`, `Frete valor`, `Desconto`, `Total`, `Valor pagamento`)
        if col_map["subtotal_produtos"] == -1 and "subtotal" in h:
            col_map["subtotal_produtos"] = idx
            continue
        if col_map["frete_valor"] == -1 and h in ("frete_valor", "valor_frete", "frete"):
            col_map["frete_valor"] = idx
            continue
        if col_map["desconto"] == -1 and h == "desconto":
            col_map["desconto"] = idx
            continue
        if col_map["acrescimo_forma"] == -1 and h in ("acrescimo_forma", "acrescimo", "juros", "valor_acrescimo"):
            col_map["acrescimo_forma"] = idx
            continue
        if col_map["valor_tray"] == -1 and h in ("total", "valor_total", "total_do_pedido", "valor_do_pedido", "valor"):
            col_map["valor_tray"] = idx
            continue
        if col_map["valor_pagamento"] == -1 and h == "valor_pagamento":
            col_map["valor_pagamento"] = idx
            continue

        # 8. Forma de Pagamento e Obs. Loja
        if col_map["forma_pagamento_paga"] == -1 and h in ("forma_pagamento_paga", "forma_de_pagamento"):
            col_map["forma_pagamento_paga"] = idx
            continue
        if col_map["pagamento_tipo"] == -1 and h == "pagamento_tipo":
            col_map["pagamento_tipo"] = idx
            continue
        if col_map["obs_loja"] == -1 and h in ("obs_loja", "observacao_loja", "obs"):
            col_map["obs_loja"] = idx
            continue

        # 9. Status do pedido na Tray (`Status pedido`)
        if col_map["status_tray"] == -1 and h in ("status_pedido", "status", "situacao"):
            col_map["status_tray"] = idx
            continue

        # 10. Nota Fiscal
        if col_map["nota_fiscal"] == -1 and h in ("nota_fiscal", "nro_nf", "numero_nf", "nfe"):
            col_map["nota_fiscal"] = idx
            continue

    if col_map["pedido_tray"] == -1 and len(header_raw) >= 1:
        col_map["pedido_tray"] = 0

    tray_rows: List[Dict[str, Any]] = []
    by_channel_order: Dict[str, Dict[str, Any]] = {}
    by_tray_order: Dict[str, Dict[str, Any]] = {}
    token_index: Dict[str, Dict[str, Any]] = {}

    for offset, row in enumerate(data_rows, start=h_idx + 2):
        if not row or not any(row):
            continue

        def get_cell(c_idx: int) -> str:
            if 0 <= c_idx < len(row):
                return _clean_str(row[c_idx])
            return ""

        ped_tray = _normalize_order_key(get_cell(col_map["pedido_tray"]))
        ped_mkt = _normalize_order_key(get_cell(col_map["pedido_marketplace"]))
        ped_horus = _normalize_order_key(get_cell(col_map["pedido_horus"]))
        obs_loja = get_cell(col_map["obs_loja"]) if col_map["obs_loja"] >= 0 else ""

        # Se `Pedido marketplace` vier vazio mas `Obs. loja` tiver "Pedido(s) no Shopee: 2610205UKMTW5C"
        if not ped_mkt and obs_loja:
            m_obs = re.search(r"Pedido\(s\)\s+no\s+[^:]+:\s*([A-Z0-9_-]+)", obs_loja, flags=re.IGNORECASE)
            if m_obs:
                ped_mkt = _normalize_order_key(m_obs.group(1))

        if not ped_tray and not ped_mkt and not ped_horus:
            continue

        cod_busca_horus = ped_horus or ped_tray or ped_mkt

        cliente_val = get_cell(col_map["cliente"]) or get_cell(col_map["razao_social"]) or ""
        doc_val = get_cell(col_map["cpf"]) or get_cell(col_map["cnpj"]) or ""

        v_total = _parse_currency(get_cell(col_map["valor_tray"])) if col_map["valor_tray"] >= 0 else 0.0
        v_pag = _parse_currency(get_cell(col_map["valor_pagamento"])) if col_map["valor_pagamento"] >= 0 else 0.0
        v_sub = _parse_currency(get_cell(col_map["subtotal_produtos"])) if col_map["subtotal_produtos"] >= 0 else 0.0
        v_frete = _parse_currency(get_cell(col_map["frete_valor"])) if col_map["frete_valor"] >= 0 else 0.0
        v_desc = _parse_currency(get_cell(col_map["desconto"])) if col_map["desconto"] >= 0 else 0.0
        v_acr = _parse_currency(get_cell(col_map["acrescimo_forma"])) if col_map["acrescimo_forma"] >= 0 else 0.0

        base_tray_val = v_total or v_pag or v_sub
        # `valor_tray_sem_acrescimo` desconta o juros de parcelamento do comprador (`Acréscimo forma` na Tray)
        # pois a NF-e e o título no Horus ERP são gerados sobre `Subtotal + Frete - Desconto` (= `Total - Acréscimo forma`).
        val_sem_acr = round(base_tray_val - v_acr, 2) if v_acr > 0 and base_tray_val > v_acr else base_tray_val

        forma_paga = get_cell(col_map["forma_pagamento_paga"]) or get_cell(col_map["pagamento_tipo"]) or ""

        rec = {
            "linha_tray": offset,
            "pedido_tray": ped_tray or cod_busca_horus,
            "pedido_marketplace": ped_mkt or ped_tray,
            "pedido_horus_ref": cod_busca_horus,
            "ponto_venda": get_cell(col_map["ponto_venda"]) or "-",
            "cliente_tray": cliente_val,
            "documento_tray": doc_val,
            "valor_tray": base_tray_val,
            "valor_tray_sem_acrescimo": val_sem_acr,
            "acrescimo_tray": v_acr,
            "subtotal_tray": v_sub,
            "frete_tray": v_frete,
            "desconto_tray": v_desc,
            "forma_pagamento_tray": forma_paga,
            "status_tray": get_cell(col_map["status_tray"]) or "",
            "nf_tray": get_cell(col_map["nota_fiscal"]) or "",
        }
        tray_rows.append(rec)

        if ped_mkt:
            by_channel_order[ped_mkt] = rec
            stripped_mkt = re.sub(r"^[A-Z_\-]+", "", ped_mkt)
            if stripped_mkt and len(stripped_mkt) >= 4:
                by_channel_order.setdefault(stripped_mkt, rec)

        if ped_tray:
            by_tray_order[ped_tray] = rec

        # Indexa tokens relevantes para fallback rápido
        for tok in (ped_mkt, ped_tray, ped_horus):
            if tok and len(tok) >= 4:
                token_index.setdefault(tok, rec)

    if not tray_rows:
        errors.append(f"Nenhum registro de pedido identificado na planilha da Tray '{filename}'.")

    return {
        "rows": tray_rows,
        "by_channel_order": by_channel_order,
        "by_tray_order": by_tray_order,
        "token_index": token_index,
    }, errors

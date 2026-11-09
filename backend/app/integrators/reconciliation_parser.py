"""
reconciliation_parser.py
------------------------
Motor de parsing em memória (Stateless) para Conciliação Bancária & Marketplaces:
  - Perfis DUAL_FILE (2 arquivos):
      * TRAY_SHOPEE : Planilha Shopee (Arquivo 1) + Planilha Tray (Arquivo 2) -> Horus ERP
      * TRAY_TIKTOK : Planilha TikTok (Arquivo 1) + Planilha Tray (Arquivo 2) -> Horus ERP
      * TRAY_VINDI  : Planilha Vindi  (Arquivo 1) + Planilha Tray (Arquivo 2) -> Horus ERP
  - Perfil SINGLE_FILE (1 arquivo):
      * VINDI_DIRECT: Planilha Vindi  (Arquivo 1) -> Horus ERP
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
    s = re.sub(r"[^\d,\.-]", "", s)
    if not s or s in ("-", ".", ","):
        return 0.0
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def _read_raw_rows(file_bytes: bytes, filename: str) -> Tuple[List[List[Any]], List[str]]:
    """Lê todas as linhas não-vazias de um CSV ou XLSX em memória."""
    errors: List[str] = []
    fn_lower = (filename or "").lower()

    if fn_lower.endswith(".xlsx") or fn_lower.endswith(".xlsm"):
        try:
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True, read_only=True)
            sheet = wb.active
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

    # Leitura CSV com detecção de encoding e delimitador
    text_content = ""
    for enc in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
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
    Localiza em qual linha (entre as primeiras 20) está o cabeçalho real da planilha.
    Útil para relatórios da Shopee e TikTok que trazem linhas de resumo no topo.
    """
    best_idx = 0
    best_score = -1
    max_scan = min(len(raw_rows), 20)

    for idx in range(max_scan):
        norm_cells = [_normalize_header(c) for c in raw_rows[idx] if c is not None]
        if len(norm_cells) < 2:
            continue
        score = 0
        for cell in norm_cells:
            if any(k in cell for k in candidate_keywords):
                score += 1
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
    Parseia a planilha do Canal de Recebimento (Shopee, TikTok Shop ou Vindi).
    Retorna registros padronizados contendo `pedido_canal`, `valor_bruto`, `valor_liquido`, `taxa`, etc.
    """
    raw_rows, errors = _read_raw_rows(file_bytes, filename)
    if not raw_rows:
        return [], errors

    header_keywords = [
        "pedido", "order", "id_do_pedido", "order_id", "codigo", "fatura",
        "valor", "amount", "bruto", "liquido", "settlement", "repasse",
        "cliente", "comprador", "buyer", "status", "pagamento", "taxa", "commission",
    ]
    h_idx = _detect_header_row_index(raw_rows, header_keywords)
    header_raw = [str(c or "") for c in raw_rows[h_idx]]
    data_rows = raw_rows[h_idx + 1:]
    headers_norm = [_normalize_header(h) for h in header_raw]

    col_map = {
        "pedido": -1,
        "cliente": -1,
        "documento": -1,
        "valor_bruto": -1,
        "valor_liquido": -1,
        "taxa": -1,
        "valor_generico": -1,
        "data_pagamento": -1,
        "status": -1,
        "forma_pagamento": -1,
    }

    for idx, h in enumerate(headers_norm):
        if not h:
            continue
        # 1. Pedido do Canal (Shopee / TikTok / Vindi)
        if col_map["pedido"] == -1 and any(k in h for k in [
            "id_do_pedido", "numero_do_pedido", "nro_pedido", "pedido_shopee",
            "pedido_tiktok", "order_id", "pedido_web", "pedido_origem",
            "cod_pedido", "codigo_do_pedido", "pedido", "referencia", "bill_code",
        ]):
            col_map["pedido"] = idx

        # 2. Cliente / Comprador
        if col_map["cliente"] == -1 and any(k in h for k in [
            "nome_de_usuario", "comprador", "cliente", "sacado", "buyer",
            "customer", "destinatario", "nome", "razao_social",
        ]):
            col_map["cliente"] = idx

        # 3. Documento (CPF / CNPJ)
        if col_map["documento"] == -1 and any(k in h for k in [
            "cpf", "cnpj", "documento", "identificacao", "tax_id",
        ]):
            col_map["documento"] = idx

        # 4. Valor Bruto da Venda
        if col_map["valor_bruto"] == -1 and any(k in h for k in [
            "valor_bruto", "vlr_bruto", "total_bruto", "preco_original",
            "valor_total_do_pedido", "valor_do_pedido", "subtotal_do_produto",
            "order_amount", "gross_sales", "gross_amount", "bruto",
        ]):
            col_map["valor_bruto"] = idx

        # 5. Valor Líquido / Repasse
        if col_map["valor_liquido"] == -1 and any(k in h for k in [
            "valor_liquido", "vlr_liquido", "valor_liq", "vlr_liq",
            "valor_total_lancado", "total_de_lancamento", "valor_do_repasse",
            "repasse", "liquido", "settlement_amount", "net_amount", "net_sales",
            "valor_a_receber", "valor_recebido",
        ]):
            col_map["valor_liquido"] = idx

        # 6. Taxa / Comissão do Marketplace ou Gateway
        if col_map["taxa"] == -1 and any(k in h for k in [
            "taxa_de_comissao", "taxa_comissao", "comissao", "taxa_de_servico",
            "taxa_de_transacao", "taxa", "tarifa", "retencao", "commission", "fee",
        ]):
            col_map["taxa"] = idx

        # 7. Valor Genérico (fallback)
        if col_map["valor_generico"] == -1 and any(k in h for k in [
            "valor_pago", "valor_total", "valor", "vlr_total", "total", "amount",
        ]):
            col_map["valor_generico"] = idx

        # 8. Data de Pagamento / Repasse / Conclusão
        if col_map["data_pagamento"] == -1 and any(k in h for k in [
            "data_de_conclusao", "data_do_repasse", "data_pagamento", "dt_pagamento",
            "data_liquidacao", "settled_time", "paid_at", "data_baixa", "data_de_criacao", "data",
        ]):
            col_map["data_pagamento"] = idx

        # 9. Status
        if col_map["status"] == -1 and any(k in h for k in [
            "status_do_pedido", "status", "situacao", "estado", "state",
        ]):
            col_map["status"] = idx

        # 10. Forma de Pagamento
        if col_map["forma_pagamento"] == -1 and any(k in h for k in [
            "metodo_de_pagamento", "forma_de_pagamento", "forma_pagamento",
            "forma_pgto", "meio_pagamento", "payment_method", "canal_de_pagamento",
        ]):
            col_map["forma_pagamento"] = idx

    if col_map["pedido"] == -1:
        col_map["pedido"] = 0
        errors.append(f"Coluna do Nº do Pedido não identificada explicitamente em '{filename}'. Usando a 1ª coluna.")

    records: List[Dict[str, Any]] = []
    for offset, row in enumerate(data_rows, start=h_idx + 2):
        if not row or not any(row):
            continue

        def get_cell(c_idx: int) -> str:
            if 0 <= c_idx < len(row):
                return _clean_str(row[c_idx])
            return ""

        raw_ped = get_cell(col_map["pedido"])
        ped_clean = _normalize_order_key(raw_ped)
        if not ped_clean or ped_clean in ("TOTAL", "SUBTOTAL", "RESUMO", "-"):
            continue

        v_bruto = _parse_currency(get_cell(col_map["valor_bruto"])) if col_map["valor_bruto"] >= 0 else 0.0
        v_liq = _parse_currency(get_cell(col_map["valor_liquido"])) if col_map["valor_liquido"] >= 0 else 0.0
        v_taxa = abs(_parse_currency(get_cell(col_map["taxa"]))) if col_map["taxa"] >= 0 else 0.0
        v_gen = _parse_currency(get_cell(col_map["valor_generico"])) if col_map["valor_generico"] >= 0 else 0.0

        final_bruto = v_bruto or v_gen or v_liq
        final_liq = v_liq or (final_bruto - v_taxa if v_taxa > 0 and final_bruto >= v_taxa else final_bruto)
        if v_taxa == 0.0 and final_bruto > 0 and final_liq > 0 and final_bruto > final_liq:
            v_taxa = round(final_bruto - final_liq, 2)

        records.append({
            "linha": offset,
            "pedido_canal": ped_clean,
            "pedido_web": ped_clean,  # compatibilidade com Vindi Direto
            "cliente_nome": get_cell(col_map["cliente"]) or "-",
            "documento": get_cell(col_map["documento"]) or "-",
            "valor": round(final_bruto, 2),
            "valor_bruto": round(final_bruto, 2),
            "valor_liquido": round(final_liq, 2),
            "taxa": round(v_taxa, 2),
            "data_pagamento": get_cell(col_map["data_pagamento"]) or "-",
            "status_vindi": get_cell(col_map["status"]) or "Pago",
            "forma_pagamento": get_cell(col_map["forma_pagamento"]) or profile_code.replace("TRAY_", ""),
        })

    if not records:
        errors.append(f"Nenhum pedido válido extraído do arquivo '{filename}'.")

    return records, errors


def parse_tray_bridge_file(
    file_bytes: bytes,
    filename: str,
) -> Tuple[Dict[str, Any], List[str]]:
    """
    Parseia a planilha de Pedidos da Tray (Arquivo 2) para construir o mapa de vínculos:
      - `by_channel_order`: { CODIGO_PEDIDO_MARKETPLACE: tray_record }
      - `by_tray_order`:    { CODIGO_PEDIDO_TRAY: tray_record }
      - `token_index`:      { QUALQUER_TOKEN_CELULA: tray_record } (fallback inteligente caso o nº Shopee/TikTok esteja em coluna livre/observação)
    """
    raw_rows, errors = _read_raw_rows(file_bytes, filename)
    if not raw_rows:
        return {"rows": [], "by_channel_order": {}, "by_tray_order": {}, "token_index": {}}, errors

    tray_keywords = [
        "pedido", "marketplace", "parceiro", "partner", "ponto_de_venda",
        "loja_virtual", "erp", "horus", "cliente", "cpf", "cnpj", "valor", "total", "status",
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
        "documento": -1,
        "valor_tray": -1,
        "status_tray": -1,
        "nota_fiscal": -1,
    }

    for idx, h in enumerate(headers_norm):
        if not h:
            continue
        # 1. Coluna do Nº do Pedido Marketplace na Tray (Shopee / TikTok / Vindi / Partner)
        if col_map["pedido_marketplace"] == -1 and any(k in h for k in [
            "pedido_marketplace", "numero_pedido_marketplace", "nro_pedido_marketplace",
            "cod_marketplace", "codigo_marketplace", "id_marketplace",
            "pedido_parceiro", "partner_id", "codigo_parceiro",
            "pedido_loja", "pedido_canal", "pedido_shopee", "pedido_tiktok",
            "pedido_vindi", "transacao_vindi", "ref_externa", "referencia_externa",
            "codigo_externo", "pedido_origem", "id_pedido_mkt", "marketplace_order",
        ]):
            col_map["pedido_marketplace"] = idx
            continue

        # 2. Coluna do Nº do Pedido no ERP / Horus (quando a planilha da Tray já exporta o nº do Horus)
        if col_map["pedido_horus"] == -1 and any(k in h for k in [
            "pedido_horus", "cod_pedido_horus", "codigo_horus", "pedido_erp",
            "cod_erp", "codigo_erp", "id_erp", "nro_pedido_erp", "numero_erp",
        ]):
            col_map["pedido_horus"] = idx
            continue

        # 3. Coluna do Nº do Pedido da Tray (ID interno da Tray)
        if col_map["pedido_tray"] == -1 and any(k in h for k in [
            "pedido_tray", "n_pedido", "nro_pedido", "numero_do_pedido",
            "numero_pedido", "id_do_pedido", "id_pedido", "cod_pedido",
            "codigo_do_pedido", "pedido", "id", "codigo", "order_id",
        ]):
            col_map["pedido_tray"] = idx
            continue

        # 4. Ponto de venda / Canal
        if col_map["ponto_venda"] == -1 and any(k in h for k in [
            "ponto_de_venda", "ponto_venda", "canal", "origem", "marketplace",
        ]):
            col_map["ponto_venda"] = idx

        # 5. Cliente
        if col_map["cliente"] == -1 and any(k in h for k in [
            "cliente", "nome_do_cliente", "comprador", "nome", "razao_social",
        ]):
            col_map["cliente"] = idx

        # 6. CPF / CNPJ
        if col_map["documento"] == -1 and any(k in h for k in [
            "cpf", "cnpj", "documento", "cpf_cnpj",
        ]):
            col_map["documento"] = idx

        # 7. Valor Total na Tray
        if col_map["valor_tray"] == -1 and any(k in h for k in [
            "valor_total", "total_do_pedido", "valor_do_pedido", "valor", "total",
        ]):
            col_map["valor_tray"] = idx

        # 8. Status na Tray
        if col_map["status_tray"] == -1 and any(k in h for k in [
            "status", "situacao",
        ]):
            col_map["status_tray"] = idx

        # 9. Nota Fiscal na Tray
        if col_map["nota_fiscal"] == -1 and any(k in h for k in [
            "nota_fiscal", "nro_nf", "numero_nf", "nfe",
        ]):
            col_map["nota_fiscal"] = idx

    # Se não identificou coluna explícita de pedido_tray e pedido_marketplace, usa heurística das 2 primeiras colunas
    if col_map["pedido_tray"] == -1 and len(header_raw) >= 1:
        col_map["pedido_tray"] = 0
    if col_map["pedido_marketplace"] == -1 and len(header_raw) >= 2:
        for idx in range(len(header_raw)):
            if idx != col_map["pedido_tray"] and idx != col_map["pedido_horus"]:
                col_map["pedido_marketplace"] = idx
                break

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

        if not ped_tray and not ped_mkt and not ped_horus:
            continue

        # No fluxo Tray -> Horus ERP:
        # O código enviado ao Horus em PEDIDOS_VENDA.COD_PEDIDO_ORIGEM é `ped_horus` (se existir coluna explícita)
        # ou o próprio `ped_tray` (padrão do integrador Tray-Horus).
        cod_busca_horus = ped_horus or ped_tray or ped_mkt

        rec = {
            "linha_tray": offset,
            "pedido_tray": ped_tray or cod_busca_horus,
            "pedido_marketplace": ped_mkt or ped_tray,
            "pedido_horus_ref": cod_busca_horus,
            "ponto_venda": get_cell(col_map["ponto_venda"]) or "-",
            "cliente_tray": get_cell(col_map["cliente"]) or "",
            "documento_tray": get_cell(col_map["documento"]) or "",
            "valor_tray": _parse_currency(get_cell(col_map["valor_tray"])) if col_map["valor_tray"] >= 0 else 0.0,
            "status_tray": get_cell(col_map["status_tray"]) or "",
            "nf_tray": get_cell(col_map["nota_fiscal"]) or "",
        }
        tray_rows.append(rec)

        if ped_mkt:
            by_channel_order[ped_mkt] = rec
            # Também indexa sem prefixos comuns (ex: "SHP-240915..." -> "240915...")
            stripped_mkt = re.sub(r"^[A-Z_\-]+", "", ped_mkt)
            if stripped_mkt and len(stripped_mkt) >= 4:
                by_channel_order.setdefault(stripped_mkt, rec)

        if ped_tray:
            by_tray_order[ped_tray] = rec

        # Indexa todos os tokens de células da linha para fallback se o código da Shopee/TikTok estiver em outra coluna
        for cell_val in row:
            c_str = _normalize_order_key(cell_val)
            if c_str and len(c_str) >= 4:
                token_index.setdefault(c_str, rec)
                for part in re.split(r"[\s/|,;:\(\)\[\]]+", c_str):
                    p_clean = part.lstrip("#").strip()
                    if len(p_clean) >= 5:
                        token_index.setdefault(p_clean, rec)

    if not tray_rows:
        errors.append(f"Nenhum registro de pedido identificado na planilha da Tray '{filename}'.")

    return {
        "rows": tray_rows,
        "by_channel_order": by_channel_order,
        "by_tray_order": by_tray_order,
        "token_index": token_index,
    }, errors

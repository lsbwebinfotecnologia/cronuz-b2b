"""
vindi_financial_parser.py
-------------------------
Parser em memória de extratos e planilhas da Vindi (CSV e XLSX).

Extrai e normaliza:
  - pedido_web / codigo_origem (código de match com PEDIDOS_VENDA.COD_PEDIDO_ORIGEM no Horus)
  - cliente_nome / sacado
  - documento (CPF/CNPJ)
  - valor (float)
  - data_pagamento / data_vencimento
  - status_vindi
  - forma_pagamento
  - fatura_id

Suporta delimitadores ',' ou ';', e encodings UTF-8, Latin-1, Windows-1252.
"""
import io
import csv
import re
import unicodedata
import logging
from typing import Any, Dict, List, Tuple

logger = logging.getLogger(__name__)


def _normalize_header(header: str) -> str:
    """Normaliza o nome da coluna para facilitar o match flexivel."""
    if not header:
        return ""
    h = header.strip().lower()
    # Remove acentos
    h = "".join(c for c in unicodedata.normalize("NFD", h) if unicodedata.category(c) != "Mn")
    # Substitui espacos e caracteres especiais por underscore
    h = re.sub(r"[^\w\s]", "", h)
    h = re.sub(r"\s+", "_", h)
    return h


def _parse_currency(val: Any) -> float:
    """Converte strings no formato monetário (R$ 1.234,56 ou 1234.56) para float."""
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip()
    if not s:
        return 0.0
    # Remove R$, espacos, etc.
    s = re.sub(r"[^\d,\.-]", "", s)
    if not s:
        return 0.0
    # Se tem virgula e ponto (ex: 1.234,56)
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        # Se tem apenas virgula (ex: 1234,56)
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def _clean_str(val: Any) -> str:
    """Limpa e formata strings."""
    if val is None:
        return ""
    return str(val).strip()


def parse_vindi_file(file_bytes: bytes, filename: str) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Parseia arquivo CSV ou XLSX da Vindi em memoria.
    Retorna: (lista_de_registros_normalizados, lista_de_erros/avisos)
    """
    errors: List[str] = []
    rows: List[Dict[str, Any]] = []

    fn_lower = filename.lower()
    if fn_lower.endswith(".xlsx") or fn_lower.endswith(".xlsm"):
        rows, errors = _parse_xlsx(file_bytes)
    else:
        # Tenta como CSV
        rows, errors = _parse_csv(file_bytes)

    return rows, errors


def _parse_csv(file_bytes: bytes) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Parseia CSV tentando múltiplos encodings e delimitadores."""
    errors: List[str] = []
    text_content = ""

    # Tenta decodificar nos encodings mais comuns
    for enc in ["utf-8-sig", "utf-8", "latin-1", "cp1252"]:
        try:
            text_content = file_bytes.decode(enc)
            break
        except UnicodeDecodeError:
            continue

    if not text_content:
        return [], ["Não foi possível decodificar o arquivo. Verifique se o arquivo está corrompido."]

    lines = [line for line in text_content.splitlines() if line.strip()]
    if not lines:
        return [], ["Arquivo vazio."]

    # Detecta delimitador: ; ou , ou \t
    first_line = lines[0]
    delimiter = ";" if first_line.count(";") > first_line.count(",") else ","
    if first_line.count("\t") > max(first_line.count(";"), first_line.count(",")):
        delimiter = "\t"

    reader = csv.reader(io.StringIO(text_content), delimiter=delimiter)
    raw_rows = list(reader)
    if not raw_rows:
        return [], ["Nenhuma linha de dados encontrada no arquivo."]

    header_raw = raw_rows[0]
    data_rows = raw_rows[1:]

    return _process_table(header_raw, data_rows)


def _parse_xlsx(file_bytes: bytes) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Parseia planilha Excel (.xlsx) via openpyxl."""
    try:
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True, read_only=True)
        sheet = wb.active
        raw_rows = []
        for row in sheet.iter_rows(values_only=True):
            if any(cell is not None for cell in row):
                raw_rows.append([cell for cell in row])
        wb.close()

        if not raw_rows:
            return [], ["Planilha Excel vazia."]

        header_raw = [str(c or "") for c in raw_rows[0]]
        data_rows = raw_rows[1:]
        return _process_table(header_raw, data_rows)
    except Exception as e:
        logger.error("[VindiParser] Erro ao ler XLSX: %s", e)
        return [], [f"Erro ao ler arquivo Excel: {str(e)}"]


def _process_table(header_raw: List[str], data_rows: List[List[Any]]) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Normaliza as colunas e extrai os registros."""
    headers_norm = [_normalize_header(str(h)) for h in header_raw]
    errors: List[str] = []

    # Mapeamento de colunas por similaridade
    col_map = {
        "pedido": -1,
        "cliente": -1,
        "documento": -1,
        "valor": -1,
        "data_pagamento": -1,
        "status": -1,
        "forma_pagamento": -1,
        "fatura_id": -1,
    }

    for idx, h in enumerate(headers_norm):
        # Pedido / Código Web / Referência Externa
        if any(k in h for k in [
            "pedido", "cod_pedido", "codigo_do_pedido", "pedido_origem",
            "referencia", "codigo_externo", "code", "bill_code", "numero_pedido"
        ]) and col_map["pedido"] == -1:
            col_map["pedido"] = idx

        # Se não achou pedido, mas tem 'codigo' isolado ou 'id_fatura'
        elif any(k in h for k in ["codigo", "fatura", "id_fatura", "numero"]) and col_map["pedido"] == -1:
            col_map["pedido"] = idx

        # Cliente / Sacado
        if any(k in h for k in ["cliente", "nome", "sacado", "razao_social", "customer"]) and col_map["cliente"] == -1:
            col_map["cliente"] = idx

        # Documento / CPF / CNPJ
        if any(k in h for k in ["documento", "cpf", "cnpj", "cpf_cnpj", "identificacao"]) and col_map["documento"] == -1:
            col_map["documento"] = idx

        # Valor
        if any(k in h for k in [
            "valor_pago", "valor_liquido", "valor_total", "valor", "vlr_total",
            "vlr_pago", "total", "amount", "valor_da_fatura"
        ]) and col_map["valor"] == -1:
            col_map["valor"] = idx

        # Data de Pagamento / Liquidação
        if any(k in h for k in [
            "data_pagamento", "dt_pagamento", "data_liquidacao", "pago_em",
            "data_baixa", "paid_at", "vencimento", "data"
        ]) and col_map["data_pagamento"] == -1:
            col_map["data_pagamento"] = idx

        # Status
        if any(k in h for k in ["status", "situacao", "estado", "state"]) and col_map["status"] == -1:
            col_map["status"] = idx

        # Forma de pagamento
        if any(k in h for k in [
            "forma_pagamento", "forma_pgto", "metodo", "metodo_pagamento",
            "meio_pagamento", "payment_method", "tipo_pagamento"
        ]) and col_map["forma_pagamento"] == -1:
            col_map["forma_pagamento"] = idx

        # ID da Fatura
        if any(k in h for k in ["fatura_id", "id_fatura", "bill_id", "id_cobranca"]) and col_map["fatura_id"] == -1:
            col_map["fatura_id"] = idx

    # Se ainda não encontrou coluna de pedido ou valor
    if col_map["pedido"] == -1:
        # Assume primeira coluna como pedido/código
        col_map["pedido"] = 0
        errors.append("Coluna de Pedido/Referência não identificada com precisão. Utilizando a 1ª coluna.")

    if col_map["valor"] == -1:
        # Procura primeira coluna com 'valor' ou número
        for idx, h in enumerate(headers_norm):
            if "val" in h or "vlr" in h or "tot" in h or "preco" in h:
                col_map["valor"] = idx
                break

    records: List[Dict[str, Any]] = []

    for line_idx, row in enumerate(data_rows, start=2):
        if not row or not any(row):
            continue

        def get_val(col_idx: int) -> str:
            if 0 <= col_idx < len(row):
                return _clean_str(row[col_idx])
            return ""

        raw_pedido = get_val(col_map["pedido"])
        if not raw_pedido:
            continue

        # Normaliza número do pedido (ex: #1234 -> 1234, WEB-1234 -> WEB-1234)
        pedido_clean = raw_pedido.lstrip("#").strip()

        valor_float = _parse_currency(get_val(col_map["valor"])) if col_map["valor"] >= 0 else 0.0

        records.append({
            "linha": line_idx,
            "pedido_web": pedido_clean,
            "cliente_nome": get_val(col_map["cliente"]) or "-",
            "documento": get_val(col_map["documento"]) or "-",
            "valor": round(valor_float, 2),
            "data_pagamento": get_val(col_map["data_pagamento"]) or "-",
            "status_vindi": get_val(col_map["status"]) or "paid",
            "forma_pagamento": get_val(col_map["forma_pagamento"]) or "-",
            "fatura_id": get_val(col_map["fatura_id"]) or "",
        })

    if not records:
        errors.append("Nenhum lançamento válido encontrado nas linhas da planilha.")

    return records, errors

import re
import io
import csv
from typing import List, Dict, Any, Optional

try:
    import openpyxl
except ImportError:
    openpyxl = None

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None


def sanitize_isbn(val: any) -> str:
    """
    Remove hífens, pontos e espaços de um ISBN/EAN.
    Garante que só mantenha dígitos e X final (para ISBN-10).
    """
    if val is None:
        return ""
    clean = re.sub(r"[^0-9X]", "", str(val).upper().strip())
    return clean


def parse_text_to_items(raw_text: str) -> List[Dict[str, Any]]:
    """
    Extrai pares de (ISBN, Quantidade) de um texto livre (e-mail, WhatsApp, bloco colado).
    Suporta diversos formatos:
      - '9788591851003 5'
      - '978-85-91851-00-3 - 10 un'
      - '2x 9788591851003'
      - 'ISBN: 9788591851003 | QTD: 4'
    """
    if not raw_text or not raw_text.strip():
        return []

    lines = raw_text.splitlines()
    items_map: Dict[str, int] = {}

    # Regex para localizar ISBN-13 (começando com 978 ou 979, com ou sem hífens) ou ISBN-10
    isbn_pattern = re.compile(r"\b(97[89][-\s]?(?:\d[-\s]?){9}\d|\d[-\s]?(?:\d[-\s]?){8}[\dX])\b", re.IGNORECASE)

    for line in lines:
        line_str = line.strip()
        if not line_str:
            continue

        matches = list(isbn_pattern.finditer(line_str))
        if not matches:
            continue

        for match in matches:
            raw_isbn = match.group(1)
            isbn_clean = sanitize_isbn(raw_isbn)

            # Verifica se o tamanho do ISBN é válido (10 ou 13 dígitos)
            if len(isbn_clean) not in [10, 13]:
                continue

            # Tenta encontrar a quantidade associada na mesma linha
            # Remove o próprio ISBN da linha para analisar o restante
            remainder = line_str[:match.start()] + " " + line_str[match.end():]

            qty = 1

            # Padrão 1: "5x" ou "5 x" antes ou depois
            m_mult = re.search(r"\b(\d+)\s*[xX]\b", remainder)
            if m_mult:
                qty = max(1, int(m_mult.group(1)))
            else:
                # Padrão 2: "qtd: 5" ou "quantidade: 5" ou "quant: 5" ou "un: 5"
                m_label = re.search(r"(?:qtd|quantidade|quant|un|unid|unidades?)[:\s=-]+(\d+)", remainder, re.IGNORECASE)
                if m_label:
                    qty = max(1, int(m_label.group(1)))
                else:
                    # Padrão 3: número solto adjacente (ex: " - 5" ou "5 un" ou "  5")
                    m_num = re.search(r"[-:\s]+(\d+)(?:\s*(?:un|ex|unid|pçs?))?", remainder, re.IGNORECASE)
                    if m_num:
                        qty = max(1, int(m_num.group(1)))

            items_map[isbn_clean] = items_map.get(isbn_clean, 0) + qty

    return [{"ean": isbn, "quantity": qty} for isbn, qty in items_map.items()]


def parse_spreadsheet_to_items(file_bytes: bytes, filename: str) -> List[Dict[str, Any]]:
    """
    Lê uma planilha XLSX, XLS ou CSV e extrai (ISBN, Quantidade).
    Detecta automaticamente as colunas de ISBN e Qtd pelo cabeçalho.
    """
    items_map: Dict[str, int] = {}
    lower_name = filename.lower()

    if lower_name.endswith(".csv"):
        # Trata CSV
        try:
            text = file_bytes.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = file_bytes.decode("latin1", errors="replace")

        # Detecta delimitador (vírgula ou ponto-e-vírgula)
        delimiter = ";" if text.count(";") > text.count(",") else ","
        reader = csv.reader(io.StringIO(text), delimiter=delimiter)
        rows = list(reader)
    else:
        # Trata Excel (openpyxl)
        if not openpyxl:
            raise RuntimeError("Biblioteca openpyxl não instalada para processamento de planilhas.")

        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True, read_only=True)
        sheet = wb.active
        rows = []
        for row in sheet.iter_rows(values_only=True):
            rows.append([str(c) if c is not None else "" for c in row])

    if not rows:
        return []

    # Procura linha de cabeçalho
    header_idx = -1
    isbn_col_idx = -1
    qty_col_idx = -1

    isbn_aliases = {"isbn", "ean", "barras", "codigo_barras", "cod_barras", "cod_barra", "código", "codigo"}
    qty_aliases = {"qtd", "quantidade", "qtde", "quant", "qntd", "unidades", "unidade", "un", "pedido"}

    for idx, r in enumerate(rows[:10]): # busca nos primeiros 10 registros
        normalized_row = [re.sub(r"[^a-z0-9_]", "", str(c).lower().strip()) for c in r]
        for c_idx, col_name in enumerate(normalized_row):
            if any(alias in col_name for alias in isbn_aliases) and isbn_col_idx == -1:
                isbn_col_idx = c_idx
            if any(alias in col_name for alias in qty_aliases) and qty_col_idx == -1:
                qty_col_idx = c_idx

        if isbn_col_idx != -1:
            header_idx = idx
            break

    # Se não achou cabeçalho claro, assume primeira coluna como ISBN e segunda como Qtd
    if isbn_col_idx == -1:
        isbn_col_idx = 0
        qty_col_idx = 1 if len(rows[0]) > 1 else -1
        header_idx = -1

    # Itera sobre os dados
    start_row = header_idx + 1 if header_idx != -1 else 0
    for r in rows[start_row:]:
        if len(r) <= isbn_col_idx:
            continue

        raw_isbn = r[isbn_col_idx]
        isbn_clean = sanitize_isbn(raw_isbn)
        if len(isbn_clean) not in [10, 13]:
            continue

        qty = 1
        if qty_col_idx != -1 and len(r) > qty_col_idx:
            raw_qty = str(r[qty_col_idx]).strip()
            # Extrai apenas dígitos
            digits = re.sub(r"\D", "", raw_qty)
            if digits:
                qty = max(1, int(digits))

        items_map[isbn_clean] = items_map.get(isbn_clean, 0) + qty

    return [{"ean": isbn, "quantity": qty} for isbn, qty in items_map.items()]


def parse_pdf_to_items(file_bytes: bytes) -> List[Dict[str, Any]]:
    """
    Lê um arquivo PDF de pedido (padrão livrarias/distribuidoras) e extrai (ISBN, Quantidade).
    """
    if not PdfReader:
        raise RuntimeError("Biblioteca pypdf não instalada para processamento de PDFs.")

    reader = PdfReader(io.BytesIO(file_bytes))
    full_text = []

    for page in reader.pages:
        txt = page.extract_text()
        if txt:
            full_text.append(txt)

    combined_text = "\n".join(full_text)
    return parse_text_to_items(combined_text)

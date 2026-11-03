import re
import io
import csv
from typing import List, Dict, Any, Optional

try:
    import openpyxl
except ImportError:
    openpyxl = None

try:
    import xlrd
except ImportError:
    xlrd = None

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None


def sanitize_isbn(val: Any) -> str:
    """
    Remove hífens, pontos e espaços de um ISBN/EAN.
    Trata valores float vindos do Excel (ex: '9788535914849.0' -> '9788535914849').
    Garante que só mantenha dígitos e X final (para ISBN-10).
    """
    if val is None:
        return ""
    s = str(val).strip()
    if s.endswith(".0"):
        s = s[:-2]
    # Trata notação científica eventual do Excel (ex: 9.78853E+12)
    if "e+" in s.lower():
        try:
            s = f"{int(float(s))}"
        except Exception:
            pass
    clean = re.sub(r"[^0-9X]", "", s.upper())
    return clean


def _extract_qty_and_discount_from_context(
    after_isbn: str,
    before_isbn: str = "",
    next_line: str = ""
) -> tuple[int, float]:
    """
    Extrai (quantidade, desconto) de uma linha de pedido (texto ou PDF).
    Prioriza colunas após o ISBN (padrão de tabelas de pedidos como WMF, Livrarias, Distribuidoras).
    """
    qty = 1
    discount = 0.0

    combined_after = f"{after_isbn} {next_line}".strip()
    full_context = f"{before_isbn} {combined_after}".strip()

    # 1. Verifica padrão explícito "5x" ou "5 x"
    m_mult = re.search(r"(?:^|\s)(\d{1,4})\s*[xX](?:\s|$)", full_context)
    if m_mult:
        qty = max(1, int(m_mult.group(1)))
        return qty, discount

    # 2. Verifica rótulo explícito "qtd: 5", "quant: 5", "un: 5"
    m_label = re.search(
        r"(?:qtd|qtde|quantidade|quant|unid|unidades?)[:\s=.-]+(\d{1,5})\b",
        full_context,
        re.IGNORECASE,
    )
    if m_label:
        qty = max(1, int(m_label.group(1)))
        return qty, discount

    # 3. Verifica unidade de medida típica de ERP/PDF ("UN 5", "PC 10", "EX 3" ou "5 UN", "10 EX")
    m_unit_after = re.search(
        r"\b(?:UN|UND|UNID|PC|PÇ|EX|EXEMP|CX)\s+(\d{1,5})(?:[.,]00?\b|\b)",
        combined_after,
        re.IGNORECASE,
    )
    if m_unit_after:
        qty = max(1, int(m_unit_after.group(1)))
    else:
        m_unit_before = re.search(
            r"\b(\d{1,5})(?:[.,]00?)?\s+(?:UN|UND|UNID|PC|PÇ|EX|EXEMP|CX)\b",
            combined_after,
            re.IGNORECASE,
        )
        if m_unit_before:
            qty = max(1, int(m_unit_before.group(1)))
        else:
            # 4. Procura inteiros na parte APÓS o ISBN, ignorando valores decimais (preços/totais como 49,90)
            # Primeiro captura possíveis percentuais/descontos (ex: 50,00% ou 45%)
            m_disc = re.search(r"\b(\d{1,2}(?:[.,]\d{1,2})?)\s*%", combined_after)
            if m_disc:
                try:
                    discount = float(m_disc.group(1).replace(",", "."))
                except Exception:
                    pass

            # Remove valores monetários/decimais com 2 casas (ex: 1.234,56 ou 49,90 ou 49.90) exceto se for ",00" isolado
            cleaned_after = re.sub(r"\b\d{1,3}(?:\.\d{3})+,\d{2}\b", " ", after_isbn)
            cleaned_after = re.sub(r"\b\d+[.,](?!00\b)\d{2}\b", " ", cleaned_after)
            # Converte "10,00" ou "10.00" (quantidade formatada com decimais zerados em PDF) em inteiro "10"
            cleaned_after = re.sub(r"\b(\d{1,4})[.,]00\b", r"\1", cleaned_after)

            int_tokens = re.findall(r"(?<![.,\d])(\d{1,4})(?![.,\d])", cleaned_after)
            # Filtra anos comuns em títulos (ex: 1990-2030) caso haja outros números na linha
            candidates = [int(t) for t in int_tokens if int(t) > 0]
            if len(candidates) > 1:
                non_year = [c for c in candidates if not (1980 <= c <= 2035)]
                if non_year:
                    candidates = non_year

            if candidates:
                qty = max(1, candidates[0])
            elif before_isbn:
                # Se não havia nenhum número após o ISBN, olha imediatamente antes (mas ignora sequencial 001, 002 se houver outro)
                before_tokens = [int(t) for t in re.findall(r"(?<![.,\d])(\d{1,4})(?![.,\d])", before_isbn) if int(t) > 0]
                if before_tokens:
                    qty = max(1, before_tokens[-1])

    return qty, discount


def parse_text_to_items(raw_text: str) -> List[Dict[str, Any]]:
    """
    Extrai pares de (ISBN, Quantidade, Desconto) de um texto livre ou texto extraído de PDF.
    Funciona mesmo quando o PDF cola o ISBN junto ao título ou código sem espaço.
    """
    if not raw_text or not raw_text.strip():
        return []

    lines = raw_text.splitlines()
    items_map: Dict[str, int] = {}
    disc_map: Dict[str, float] = {}

    # Regex para ISBN-13 (978 ou 979 com ou sem hífens/pontos, mesmo colado a letras)
    isbn13_pattern = re.compile(r"(?<!\d)(97[89][-\s.]?(?:\d[-\s.]?){9}\d)(?!\d)")
    # Regex para ISBN-10 isolado por fronteira de palavra (não parte de CNPJ/CPF de 11-14 dígitos)
    isbn10_pattern = re.compile(r"(?<![0-9/.-])(\d[-\s]?(?:\d[-\s]?){8}[\dX])(?![0-9/.-])", re.IGNORECASE)

    for i, line in enumerate(lines):
        line_str = line.strip()
        if not line_str:
            continue

        matches = list(isbn13_pattern.finditer(line_str))
        if not matches:
            # Tenta ISBN-10 apenas se a linha não for cabeçalho de CNPJ/IE/Telefone
            if not re.search(r"\b(cnpj|cpf|insc|fone|tel|cep)\b", line_str, re.IGNORECASE):
                matches = list(isbn10_pattern.finditer(line_str))

        if not matches:
            continue

        next_line_str = ""
        if i + 1 < len(lines):
            nl = lines[i + 1].strip()
            if nl and not isbn13_pattern.search(nl):
                next_line_str = nl

        for match in matches:
            raw_isbn = match.group(1)
            isbn_clean = sanitize_isbn(raw_isbn)

            if len(isbn_clean) not in (10, 13):
                continue

            before_isbn = line_str[:match.start()]
            after_isbn = line_str[match.end():]

            qty, disc = _extract_qty_and_discount_from_context(after_isbn, before_isbn, next_line_str)
            items_map[isbn_clean] = items_map.get(isbn_clean, 0) + qty
            if disc > 0:
                disc_map[isbn_clean] = disc

    return [
        {"ean": isbn, "quantity": qty, "discount": disc_map.get(isbn, 0.0)}
        for isbn, qty in items_map.items()
    ]


def _extract_rows_from_spreadsheet_bytes(file_bytes: bytes, filename: str) -> List[List[str]]:
    """
    Extrai linhas de qualquer planilha (.xlsx, .xls binário BIFF8, .csv, .tsv ou HTML exportado como .xls).
    """
    lower_name = (filename or "").lower()

    # 1. Se for explicitamente CSV/TXT
    if lower_name.endswith((".csv", ".txt")):
        return _parse_delimited_bytes(file_bytes)

    # 2. Verifica assinatura do arquivo:
    # ZIP/OOXML (.xlsx) começa com b'PK\x03\x04'
    # OLE2/BIFF8 (.xls nativo) começa com b'\xd0\xcf\x11\xe0'
    is_zip = file_bytes[:4] == b"PK\x03\x04"
    is_ole2 = file_bytes[:4] == b"\xd0\xcf\x11\xe0"

    if is_zip and openpyxl:
        try:
            wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True, read_only=True)
            sheet = wb.active
            rows = []
            for row in sheet.iter_rows(values_only=True):
                rows.append([str(c).strip() if c is not None else "" for c in row])
            return rows
        except Exception:
            pass

    if is_ole2 and xlrd:
        try:
            wb = xlrd.open_workbook(file_contents=file_bytes)
            sheet = wb.sheet_by_index(0)
            rows = []
            for r_idx in range(sheet.nrows):
                row_vals = []
                for c_idx in range(sheet.ncols):
                    cell_val = sheet.cell_value(r_idx, c_idx)
                    if isinstance(cell_val, float) and cell_val.is_integer():
                        row_vals.append(str(int(cell_val)))
                    else:
                        row_vals.append(str(cell_val).strip() if cell_val is not None else "")
                rows.append(row_vals)
            return rows
        except Exception:
            pass

    # 3. Fallback cruzado: tenta openpyxl, depois xlrd, depois HTML/CSV/TSV (muito comum em .xls exportado de ERP)
    if openpyxl:
        try:
            wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True, read_only=True)
            sheet = wb.active
            return [[str(c).strip() if c is not None else "" for c in row] for row in sheet.iter_rows(values_only=True)]
        except Exception:
            pass

    if xlrd:
        try:
            wb = xlrd.open_workbook(file_contents=file_bytes)
            sheet = wb.sheet_by_index(0)
            rows = []
            for r_idx in range(sheet.nrows):
                row_vals = []
                for c_idx in range(sheet.ncols):
                    cell_val = sheet.cell_value(r_idx, c_idx)
                    if isinstance(cell_val, float) and cell_val.is_integer():
                        row_vals.append(str(int(cell_val)))
                    else:
                        row_vals.append(str(cell_val).strip() if cell_val is not None else "")
                rows.append(row_vals)
            return rows
        except Exception:
            pass

    # 4. Fallback HTML Table (arquivos .xls que na verdade são <table> HTML) ou CSV/TSV
    return _parse_delimited_or_html_bytes(file_bytes)


def _parse_delimited_bytes(file_bytes: bytes) -> List[List[str]]:
    try:
        text = file_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = file_bytes.decode("latin1", errors="replace")

    first_lines = "\n".join(text.splitlines()[:10])
    counts = {
        ";": first_lines.count(";"),
        "\t": first_lines.count("\t"),
        ",": first_lines.count(","),
    }
    delimiter = max(counts, key=counts.get) if max(counts.values()) > 0 else ";"
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    return [[str(c).strip() for c in row] for row in reader if any(str(c).strip() for c in row)]


def _parse_delimited_or_html_bytes(file_bytes: bytes) -> List[List[str]]:
    try:
        text = file_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = file_bytes.decode("latin1", errors="replace")

    if "<table" in text.lower() or "<tr" in text.lower():
        tr_matches = re.findall(r"<tr[^>]*>(.*?)</tr>", text, flags=re.IGNORECASE | re.DOTALL)
        rows = []
        for tr in tr_matches:
            cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, flags=re.IGNORECASE | re.DOTALL)
            cleaned = [re.sub(r"<[^>]+>", "", c).strip() for c in cells]
            if any(cleaned):
                rows.append(cleaned)
        if rows:
            return rows

    return _parse_delimited_bytes(file_bytes)


def parse_spreadsheet_to_items(file_bytes: bytes, filename: str) -> List[Dict[str, Any]]:
    """
    Lê uma planilha XLSX, XLS ou CSV e extrai (ISBN/Código, Quantidade, Desconto).
    Detecta automaticamente as colunas de ISBN e Qtd pelo cabeçalho ou pelo formato dos dados.
    """
    rows = _extract_rows_from_spreadsheet_bytes(file_bytes, filename)
    if not rows:
        return []

    items_map: Dict[str, int] = {}
    disc_map: Dict[str, float] = {}

    header_idx = -1
    isbn_col_idx = -1
    qty_col_idx = -1
    disc_col_idx = -1

    isbn_aliases = {"isbn", "ean", "barras", "codigo_barras", "cod_barras", "cod_barra", "isbn13", "ean13", "coditem", "codigo", "código", "produto", "item"}
    qty_aliases = {"qtd", "quantidade", "qtde", "quant", "qntd", "unidades", "unidade", "un", "pedido", "exemplares", "pecas", "peças", "solicitado", "qtd_pedida"}
    disc_aliases = {"desconto", "desc", "descontoproposto", "perc_desc", "discount", "pct_desc"}

    for idx, r in enumerate(rows[:20]):
        normalized_row = [re.sub(r"[^a-z0-9_]", "", str(c).lower().strip()) for c in r]
        # Prioriza match exato de isbn/ean/barras antes de 'codigo'
        for c_idx, col_name in enumerate(normalized_row):
            if not col_name:
                continue
            if any(k in col_name for k in ("isbn", "ean", "barra")) and isbn_col_idx == -1:
                isbn_col_idx = c_idx
            if any(alias == col_name or alias in col_name for alias in qty_aliases) and qty_col_idx == -1 and c_idx != isbn_col_idx:
                qty_col_idx = c_idx
            if any(alias in col_name for alias in disc_aliases) and disc_col_idx == -1 and c_idx not in (isbn_col_idx, qty_col_idx):
                disc_col_idx = c_idx

        if isbn_col_idx == -1:
            for c_idx, col_name in enumerate(normalized_row):
                if any(alias in col_name for alias in isbn_aliases) and c_idx not in (qty_col_idx, disc_col_idx):
                    isbn_col_idx = c_idx
                    break

        if isbn_col_idx != -1:
            header_idx = idx
            break

    # Se não achou cabeçalho claro, descobre dinamicamente qual coluna contém ISBNs de 13 dígitos
    if isbn_col_idx == -1:
        for r in rows[:30]:
            for c_idx, cell in enumerate(r):
                clean_c = sanitize_isbn(cell)
                if len(clean_c) == 13 and clean_c.startswith(("978", "979")):
                    isbn_col_idx = c_idx
                    break
            if isbn_col_idx != -1:
                break

    if isbn_col_idx == -1:
        isbn_col_idx = 0
        qty_col_idx = 1 if len(rows[0]) > 1 else -1
        header_idx = -1

    start_row = header_idx + 1 if header_idx != -1 else 0
    for r in rows[start_row:]:
        if len(r) <= isbn_col_idx:
            continue

        raw_isbn = r[isbn_col_idx]
        isbn_clean = sanitize_isbn(raw_isbn)

        # Se a coluna apontada não tinha o ISBN nesta linha, procura em qualquer célula da linha um ISBN-13
        if len(isbn_clean) not in (10, 13):
            for c_idx, cell in enumerate(r):
                cand = sanitize_isbn(cell)
                if len(cand) == 13 and cand.startswith(("978", "979")):
                    isbn_clean = cand
                    break

        if len(isbn_clean) not in (10, 13):
            continue

        qty = 1
        if qty_col_idx != -1 and len(r) > qty_col_idx:
            raw_qty = str(r[qty_col_idx]).strip()
            try:
                qty = max(1, int(float(raw_qty.replace(",", "."))))
            except Exception:
                digits = re.sub(r"\D", "", raw_qty)
                if digits:
                    qty = max(1, int(digits))
        else:
            # Se não tinha coluna de Qtd mapeada, procura o primeiro inteiro positivo nas colunas após o ISBN
            for c_idx in range(isbn_col_idx + 1, len(r)):
                val_str = str(r[c_idx]).strip()
                if re.match(r"^\d+([.,]0+)?$", val_str):
                    cand_q = int(float(val_str.replace(",", ".")))
                    if 0 < cand_q < 10000:
                        qty = cand_q
                        break

        if disc_col_idx != -1 and len(r) > disc_col_idx:
            raw_disc = str(r[disc_col_idx]).strip().replace("%", "").replace(",", ".")
            try:
                d_val = float(raw_disc)
                if 0 < d_val <= 100:
                    disc_map[isbn_clean] = d_val
            except Exception:
                pass

        items_map[isbn_clean] = items_map.get(isbn_clean, 0) + qty

    return [
        {
            "ean": isbn,
            "quantity": qty,
            "discount": disc_map.get(isbn, 0.0),
        }
        for isbn, qty in items_map.items()
    ]


def parse_pdf_to_items(file_bytes: bytes) -> List[Dict[str, Any]]:
    """
    Lê um arquivo PDF de pedido (padrão livrarias/distribuidoras como WMF, Martins Fontes, etc.)
    e extrai (ISBN, Quantidade, Desconto).
    """
    if not PdfReader:
        raise RuntimeError("Biblioteca pypdf não instalada para processamento de PDFs.")

    reader = PdfReader(io.BytesIO(file_bytes))
    full_text = []

    for page in reader.pages:
        try:
            # Tenta layout mode se disponível na versão do pypdf para preservar colunas horizontais
            txt = page.extract_text(extraction_mode="layout")
        except Exception:
            txt = page.extract_text()
        if txt:
            full_text.append(txt)

    combined_text = "\n".join(full_text)
    items = parse_text_to_items(combined_text)

    # Caso o modo layout não tenha retornado itens, tenta o modo plain padrão do pypdf
    if not items:
        plain_text = []
        for page in reader.pages:
            txt = page.extract_text()
            if txt:
                plain_text.append(txt)
        items = parse_text_to_items("\n".join(plain_text))

    return items


"""
ebook_pearson.py
----------------
Rotina dedicada para Importação, Conciliação Financeira (Rateio)
e Envio de Pedidos de E-book (Biblioteca Virtual Pearson) para o Horus ERP.

Regras e Diretrizes:
1. Leitura de planilha XLSX ou CSV enviada pela Pearson (BV).
2. Consulta de produtos via API do Horus (Busca_AcervoB2B / Busca_Acervo) sem consultas SQL diretas.
3. Pré-pedido interativo na tela com conciliação do Valor Total Recebido.
4. Rateio dinâmico com distribuição exata ao centavo nos itens selecionados.
5. Injeção no Horus ERP via HorusOrders (InsPedidoVenda / InsItensPedidoVenda com VLR_LIQUIDO).
6. 100% isolado de outras rotinas (StoreFront, PDV, Dropship, Bookinfo).
"""

import io
import os
import re
import csv
import math
import asyncio
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
import openpyxl

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.core.utils import assert_company_ownership, parse_horus_price
from app.models.user import User
from app.models.customer import Customer
from app.models.company import Company
from app.models.company_settings import CompanySettings
from app.models.order import Order, OrderItem
from app.models.order_log import OrderLog
from app.models.product import Product
from app.integrators.horus_orders import HorusOrders
from app.integrators.horus_products import HorusProducts
from app.integrators.horus_product_search import HorusProductSearch

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orders/ebook-pearson", tags=["ebook-pearson"])

# Limite máximo de arquivo: 10 MB (Diretriz de Arquitetura Cronuz B2B)
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024


def _safe_int(val: Any) -> int:
    """Extrai inteiro de forma resiliente mesmo com decimais ou formatações brasileiras."""
    if val is None:
        return 0
    try:
        s = str(val).split(",")[0].split(".")[0].strip()
        digits = re.sub(r'[^\d-]', '', s)
        return int(digits) if digits else 0
    except Exception:
        return 0


# ── Schemas Pydantic ─────────────────────────────────────────────────────────

class PearsonItemPreview(BaseModel):
    id: str
    row: int
    isbn: str
    title_pearson: str
    pageviews: int = 0
    percentage: float = 0.0
    original_value: float = 0.0
    quantity: int = 1
    liquid_value: float = 0.0
    subtotal: float = 0.0
    selected_for_rateio: bool = True
    
    # Dados consultados via API Horus / Cadastro Sincronizado DBM
    in_horus: bool = False
    horus_cod_item: Optional[str] = None
    horus_isbn: Optional[str] = None
    merged_isbns: Optional[List[str]] = None
    horus_title: Optional[str] = None
    horus_cover_price: Optional[float] = None
    horus_stock: Optional[int] = None
    is_ebook: Optional[bool] = None  # True = E-book (EBOOK: 'S'), False = Livro Físico (EBOOK: 'N')
    api_message: Optional[str] = None



class PearsonPreviewResponse(BaseModel):
    success: bool
    filename: str
    report_model: str = "PEARSON"
    period: Optional[str] = None
    receipt_month: Optional[str] = None
    receipt_number: Optional[str] = None
    suggested_reference: str
    total_items: int
    total_original_value: float
    total_found_in_horus: int = 0
    total_not_found: int = 0
    not_found_isbns: List[str] = []
    total_zero_cover: int = 0
    zero_cover_isbns: List[str] = []
    total_physical_books: int = 0
    physical_book_isbns: List[str] = []
    has_critical_errors: bool = False
    items: List[PearsonItemPreview]


class LookupItemRequest(BaseModel):
    isbn: str
    title: Optional[str] = None
    original_isbn: Optional[str] = None
    save_secondary_isbn: Optional[bool] = True


class LookupItemResponse(BaseModel):
    found: bool
    isbn: str
    horus_isbn: Optional[str] = None
    horus_cod_item: Optional[str] = None
    horus_title: Optional[str] = None
    horus_cover_price: Optional[float] = None
    horus_stock: Optional[int] = None
    is_ebook: Optional[bool] = None
    linked_secondary_isbn: Optional[str] = None
    api_message: str


class ReapportionItemInput(BaseModel):
    id: str
    isbn: str
    quantity: int = 1
    original_value: float
    liquid_value: float
    selected_for_rateio: bool = True


class ReapportionRequest(BaseModel):
    target_received_total: float
    items: List[ReapportionItemInput]


class CreateEbookOrderItem(BaseModel):
    isbn: str
    horus_isbn: Optional[str] = None
    title: str
    quantity: int = 1
    liquid_unit_price: float
    original_value: Optional[float] = None
    pageviews: Optional[int] = 0
    horus_cod_item: Optional[str] = None
    horus_cover_price: Optional[float] = None
    is_ebook: Optional[bool] = None


class CreateEbookOrderRequest(BaseModel):
    customer_id: int
    reference: str = Field(..., description="Cód. Pedido Origem (ex: BV-407-10/2026 ou BW-A-231309-08/2026)")
    target_received_total: float
    report_model: Optional[str] = "PEARSON"
    payment_condition: Optional[str] = "30 DDL"
    payment_method: Optional[str] = "Boleto"
    cod_forma: Optional[Any] = None
    obs_pedido: Optional[str] = "REPASSE E-BOOK BIBLIOTECA VIRTUAL PEARSON"
    skip_expedition: bool = True
    items: List[CreateEbookOrderItem]


def _clean_isbn(raw_val: Any) -> str:
    """
    Extrai o código exatamente como informado na planilha Pearson/Bookwire,
    removendo apenas espaços, quebras de linha e hífens, sem alterar
    ou manobrar os dígitos originais da célula.
    """
    if not raw_val:
        return ""
    val_str = str(raw_val).strip()
    # Se veio como número float do Excel com terminação '.0'
    if val_str.endswith(".0"):
        val_str = val_str[:-2]
    # Remove espaços em branco e traços
    return re.sub(r'[\s\-]', '', val_str)


def _extract_additional_isbn_list(raw_additional: Optional[str]) -> List[str]:
    """Quebra a string de ISBNs adicionais em lista limpa de códigos."""
    if not raw_additional:
        return []
    tokens = []
    for part in re.split(r'[,;\s\n|]+', str(raw_additional)):
        c = _clean_isbn(part)
        if c and c not in tokens:
            tokens.append(c)
    return tokens


def _find_dbm_product_by_any_isbn(db: Session, company_id: int, search_code: str) -> Optional[Product]:
    """
    Vasculha o cadastro de produtos sincronizado do DBM no Cronuz (prd_product):
    1) Pelo ISBN principal (ean_gtin), código de barras (barcode), SKU ou Cod DBM
    2) Pelo Código Horus (horus_cod_item) se o termo for numérico curto
    3) Pelos ISBNs adicionais/secundários (additional_isbns) cadastrados no livro do DBM!
    """
    clean = _clean_isbn(search_code)
    if not clean:
        return None

    # 1. Busca direta nos campos indexados (ISBN principal, SKU, Barcode, Cod DBM)
    prod = db.query(Product).filter(
        Product.company_id == company_id,
        (Product.ean_gtin == clean) |
        (Product.sku == clean) |
        (Product.barcode == clean) |
        (Product.cod_dbm == clean)
    ).first()
    if prod:
        return prod

    # 2. Se for código numérico curto (ex: Cód. Horus), verifica horus_cod_item
    if clean.isdigit() and len(clean) < 10:
        prod = db.query(Product).filter(
            Product.company_id == company_id,
            Product.horus_cod_item == int(clean)
        ).first()
        if prod:
            return prod

    # 3. Vasculha nos ISBNs adicionais/secundários (additional_isbns) do cadastro DBM
    candidates = db.query(Product).filter(
        Product.company_id == company_id,
        Product.additional_isbns.isnot(None),
        Product.additional_isbns.ilike(f"%{clean}%")
    ).all()
    for cand in candidates:
        extra_list = _extract_additional_isbn_list(cand.additional_isbns)
        if clean in extra_list:
            return cand

    return None


def _save_secondary_isbn_on_dbm_product(
    db: Session,
    company_id: int,
    secondary_isbn: str,
    horus_cod_item: Optional[str] = None,
    horus_primary_isbn: Optional[str] = None,
    horus_title: Optional[str] = None,
    horus_cover_price: Optional[float] = None,
) -> Optional[str]:
    """
    Quando um 2º ISBN (da Pearson/Bookwire) é vinculado a um item do Horus,
    persiste automaticamente esse 2º ISBN em `additional_isbns` do cadastro DBM (prd_product).
    """
    sec_clean = _clean_isbn(secondary_isbn)
    prim_clean = _clean_isbn(horus_primary_isbn)
    if not sec_clean or len(sec_clean) < 8:
        return None
    if prim_clean and sec_clean == prim_clean:
        return None

    prod = None
    if horus_cod_item and str(horus_cod_item).isdigit():
        prod = db.query(Product).filter(
            Product.company_id == company_id,
            Product.horus_cod_item == int(horus_cod_item)
        ).first()
    if not prod and prim_clean:
        prod = _find_dbm_product_by_any_isbn(db, company_id, prim_clean)
    if not prod and horus_cod_item:
        prod = db.query(Product).filter(
            Product.company_id == company_id,
            Product.sku == str(horus_cod_item)
        ).first()

    if prod:
        existing_list = _extract_additional_isbn_list(prod.additional_isbns)
        if sec_clean != _clean_isbn(prod.ean_gtin) and sec_clean not in existing_list:
            existing_list.append(sec_clean)
            prod.additional_isbns = ", ".join(existing_list)
            db.commit()
        return sec_clean
    elif horus_cod_item and (prim_clean or horus_title):
        # Cria o registro sincronizado no catálogo DBM já com o 2º ISBN vinculado
        new_prod = Product(
            company_id=company_id,
            sku=str(horus_cod_item),
            cod_dbm=str(horus_cod_item),
            horus_cod_item=int(horus_cod_item) if str(horus_cod_item).isdigit() else None,
            name=horus_title or f"E-book {prim_clean or sec_clean}",
            ean_gtin=prim_clean or sec_clean,
            barcode=prim_clean or sec_clean,
            additional_isbns=sec_clean if prim_clean and prim_clean != sec_clean else None,
            base_price=float(horus_cover_price or 0.0),
            binding_finish="E-book",
            royalty_rule="Sem Royalties",
            status="ACTIVE"
        )
        db.add(new_prod)
        db.commit()
        return sec_clean
    return None




def _parse_pearson_workbook(file_bytes: bytes, filename: str) -> Dict[str, Any]:
    """Lê a planilha da Pearson (.xlsx ou .csv) e extrai metadados e linhas de repasse."""
    try:
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Não foi possível abrir o arquivo Excel da Pearson: {str(e)}"
        )

    sheet = wb.active
    if not sheet:
        raise HTTPException(status_code=400, detail="A planilha informada está vazia.")

    # 1. Busca metadados nas primeiras 5 linhas
    period = ""
    receipt_month = ""
    receipt_number = ""

    for r in range(1, 6):
        cell_val = str(sheet.cell(row=r, column=1).value or '')
        if "período" in cell_val.lower():
            period = cell_val.split(":", 1)[-1].strip()
        elif "recebimento" in cell_val.lower() and not receipt_month:
            receipt_month = cell_val.split(":", 1)[-1].strip()

    # 2. Localiza a linha de cabeçalho
    header_row_idx = None
    col_map: Dict[str, int] = {}

    for r in range(1, 15):
        row_vals = [str(sheet.cell(row=r, column=c).value or '').strip().lower() for c in range(1, sheet.max_column + 1)]
        if any("isbn" in v for v in row_vals) and any("valor" in v or "repasse" in v for v in row_vals):
            header_row_idx = r
            for c_idx, val in enumerate(row_vals, start=1):
                clean_header = val.replace("º", "").replace("°", "").strip()
                if "n recebimento" in clean_header or "recebimento" in clean_header and "mes" not in clean_header:
                    col_map["num_recebimento"] = c_idx
                elif "mes" in clean_header:
                    col_map["mes_recebimento"] = c_idx
                elif "selo" in clean_header or "editora" in clean_header:
                    col_map["selo"] = c_idx
                elif "isbn" in clean_header:
                    col_map["isbn"] = c_idx
                elif "titulo" in clean_header or "obra" in clean_header:
                    col_map["titulo"] = c_idx
                elif "pageviews" in clean_header or "visualiz" in clean_header:
                    col_map["pageviews"] = c_idx
                elif "porcentagem" in clean_header or "%" in clean_header:
                    col_map["porcentagem"] = c_idx
                elif "valor" in clean_header or "repasse" in clean_header:
                    col_map["valor"] = c_idx
            break

    if not header_row_idx or "isbn" not in col_map:
        raise HTTPException(
            status_code=400,
            detail="Estrutura da planilha Pearson não reconhecida. Não foram localizadas as colunas 'ISBN' e 'Valor'."
        )

    # 3. Itera sobre as linhas de dados
    raw_items = []
    total_val = 0.0

    for r in range(header_row_idx + 1, sheet.max_row + 1):
        raw_isbn = sheet.cell(row=r, column=col_map["isbn"]).value
        raw_val = sheet.cell(row=r, column=col_map.get("valor", col_map["isbn"] + 4)).value
        titulo = str(sheet.cell(row=r, column=col_map.get("titulo", 5)).value or '').strip()

        # Condições de parada ou linha de totalização
        if not raw_isbn and not titulo and raw_val is None:
            continue
        if str(titulo).lower() == "total" or (str(raw_isbn or '').strip().startswith("=")):
            continue

        clean_isbn = _clean_isbn(raw_isbn)
        if not clean_isbn or len(clean_isbn) < 9:
            continue

        # Nº Recebimento se houver na linha
        if not receipt_number and "num_recebimento" in col_map:
            num_val = sheet.cell(row=r, column=col_map["num_recebimento"]).value
            if num_val and str(num_val).strip() and str(num_val).strip().isdigit():
                receipt_number = str(num_val).strip()

        # Mês de recebimento se houver na linha
        if not receipt_month and "mes_recebimento" in col_map:
            mes_val = str(sheet.cell(row=r, column=col_map["mes_recebimento"]).value or '').strip()
            if mes_val:
                receipt_month = mes_val

        pageviews = 0
        if "pageviews" in col_map:
            pageviews = _safe_int(sheet.cell(row=r, column=col_map["pageviews"]).value)

        percentage = 0.0
        if "porcentagem" in col_map:
            try:
                raw_pct = str(sheet.cell(row=r, column=col_map["porcentagem"]).value or '').replace('%', '').strip()
                percentage = round(parse_horus_price(raw_pct), 4)
            except Exception:
                percentage = 0.0

        val_rounded = round(parse_horus_price(raw_val), 2)
        total_val += val_rounded

        raw_items.append({
            "id": f"pearson-{r}",
            "row": r,
            "isbn": clean_isbn,
            "title_pearson": titulo or f"Livro {clean_isbn}",
            "pageviews": pageviews,
            "percentage": percentage,
            "original_value": val_rounded,
            "quantity": 1,
            "liquid_value": val_rounded,
            "subtotal": val_rounded,
            "selected_for_rateio": True,
        })

    # Sugestão de referência
    now = datetime.now()
    ref_suffix = f"{receipt_number or 'BV'}-{receipt_month or now.strftime('%m/%Y')}"
    suggested_ref = f"BV-{ref_suffix}".replace(" ", "-")

    return {
        "report_model": "PEARSON",
        "period": period,
        "receipt_month": receipt_month,
        "receipt_number": receipt_number,
        "suggested_reference": suggested_ref,
        "total_items": len(raw_items),
        "total_original_value": round(total_val, 2),
        "items": raw_items,
    }


def _read_tabular_rows(file_bytes: bytes, filename: str) -> List[List[Any]]:
    """Lê todas as linhas de um arquivo .csv ou .xlsx como matriz de células."""
    ext = os.path.splitext(filename or "")[1].lower()
    is_zip_xlsx = file_bytes[:4] == b"PK\x03\x04"

    if ext in (".xlsx", ".xlsm") or is_zip_xlsx:
        try:
            wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
            sheet = wb.active
            if not sheet:
                return []
            rows = []
            for r in range(1, sheet.max_row + 1):
                rows.append([sheet.cell(row=r, column=c).value for c in range(1, sheet.max_column + 1)])
            return rows
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Não foi possível abrir a planilha Excel informada: {str(e)}"
            )

    # Leitura CSV resiliente (UTF-8-sig, UTF-8, CP1252, Latin-1) e delimitador (; ou , ou \t)
    decoded_text = None
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            decoded_text = file_bytes.decode(enc)
            break
        except UnicodeDecodeError:
            continue

    if decoded_text is None:
        decoded_text = file_bytes.decode("utf-8", errors="replace")

    sample_lines = [line for line in decoded_text.splitlines()[:5] if line.strip()]
    first_line = sample_lines[0] if sample_lines else ""
    if first_line.count(";") >= first_line.count(",") and first_line.count(";") > 0:
        delimiter = ";"
    elif "\t" in first_line and first_line.count("\t") > first_line.count(","):
        delimiter = "\t"
    else:
        delimiter = ","

    reader = csv.reader(io.StringIO(decoded_text), delimiter=delimiter)
    return [row for row in reader]


def _parse_bookwire_file(file_bytes: bytes, filename: str) -> Dict[str, Any]:
    """
    Lê o relatório de repasse de E-books da Bookwire (.csv ou .xlsx),
    agrupa lançamentos (sales e retours) por ISBN, extrai período/fatura
    e retorna os itens consolidados prontos para consulta no Horus ERP e rateio.
    """
    rows = _read_tabular_rows(file_bytes, filename)
    if not rows:
        raise HTTPException(status_code=400, detail="O arquivo da Bookwire informado está vazio.")

    header_row_idx = None
    col_map: Dict[str, int] = {}

    for r_idx, row in enumerate(rows[:20]):
        row_vals = [str(c or "").strip().lower() for c in row]
        has_isbn = any(v == "isbn" or "isbn" in v for v in row_vals)
        has_bw_val = any(
            "payment amount publisher" in v
            or "bookwire income" in v
            or "share publisher" in v
            or "valor" in v
            or "repasse" in v
            for v in row_vals
        )
        if has_isbn and has_bw_val:
            header_row_idx = r_idx
            for c_idx, val in enumerate(row_vals):
                clean_h = val.strip()
                if clean_h == "isbn" or ("isbn" in clean_h and "isbn" not in col_map):
                    col_map["isbn"] = c_idx
                elif clean_h in ("title", "título", "titulo") or ("title" in clean_h and "title" not in col_map):
                    col_map["title"] = c_idx
                elif clean_h in ("units", "unidades", "qtd", "quantidade"):
                    col_map["units"] = c_idx
                elif "share publisher" in clean_h or "porcentagem" in clean_h:
                    col_map["percentage"] = c_idx
                elif "payment amount publisher" in clean_h:
                    col_map["valor"] = c_idx
                elif ("bookwire income (payment currency)" in clean_h or "valor" in clean_h or "repasse" in clean_h) and "valor" not in col_map:
                    col_map["valor"] = c_idx
                elif "period start date" in clean_h or ("report start date" in clean_h and "period_start" not in col_map):
                    col_map["period_start"] = c_idx
                elif "period end date" in clean_h or ("report end date" in clean_h and "period_end" not in col_map):
                    col_map["period_end"] = c_idx
                elif "account number" in clean_h:
                    col_map["account_number"] = c_idx
            break

    if header_row_idx is None or "isbn" not in col_map or "valor" not in col_map:
        raise HTTPException(
            status_code=400,
            detail=(
                "Estrutura da planilha Bookwire não reconhecida. "
                "Certifique-se de que o arquivo possui as colunas 'ISBN' e 'Payment Amount Publisher'."
            )
        )

    period_start = ""
    period_end = ""
    account_number = ""

    # Tenta extrair código da fatura Bookwire do nome do arquivo (ex: A-231309)
    m_doc = re.search(r'\b(A-\d+)\b', filename or "", re.IGNORECASE)
    receipt_number = m_doc.group(1).upper() if m_doc else ""

    # Agrupamento por ISBN preservando a ordem de aparição (soma unidades e valores líquidos de sale/retour)
    grouped: Dict[str, Dict[str, Any]] = {}
    total_sheet_net = 0.0

    for r_idx in range(header_row_idx + 1, len(rows)):
        row = rows[r_idx]
        if not row or all(not str(c or "").strip() for c in row):
            continue

        def _get_col(key: str, default: Any = "") -> Any:
            idx = col_map.get(key)
            if idx is None or idx >= len(row):
                return default
            return row[idx]

        raw_isbn = _get_col("isbn", "")
        raw_val = _get_col("valor", None)
        titulo = str(_get_col("title", "") or "").strip()

        if str(titulo).lower() == "total" or str(raw_isbn or "").strip().lower() == "total":
            continue

        clean_isbn = _clean_isbn(raw_isbn)
        if not clean_isbn or len(clean_isbn) < 9:
            continue

        if not period_start and "period_start" in col_map:
            ps = str(_get_col("period_start", "") or "").strip()
            if ps:
                period_start = ps.replace(".", "/")
        if not period_end and "period_end" in col_map:
            pe = str(_get_col("period_end", "") or "").strip()
            if pe:
                period_end = pe.replace(".", "/")
        if not account_number and "account_number" in col_map:
            acc = str(_get_col("account_number", "") or "").strip()
            if acc:
                account_number = acc

        units = _safe_int(_get_col("units", 0)) if "units" in col_map else 1
        pct = 0.0
        if "percentage" in col_map:
            try:
                raw_pct = str(_get_col("percentage", "") or "").replace("%", "").strip()
                pct = round(parse_horus_price(raw_pct), 4)
            except Exception:
                pct = 0.0

        val_float = round(parse_horus_price(raw_val), 2)
        total_sheet_net = round(total_sheet_net + val_float, 2)

        if clean_isbn not in grouped:
            grouped[clean_isbn] = {
                "first_row": r_idx + 1,
                "isbn": clean_isbn,
                "title_pearson": titulo or f"E-book {clean_isbn}",
                "pageviews": units,
                "percentage": pct,
                "original_value": val_float,
            }
        else:
            grouped[clean_isbn]["pageviews"] += units
            grouped[clean_isbn]["original_value"] = round(grouped[clean_isbn]["original_value"] + val_float, 2)
            if not grouped[clean_isbn]["title_pearson"] and titulo:
                grouped[clean_isbn]["title_pearson"] = titulo
            if pct > 0 and grouped[clean_isbn]["percentage"] <= 0:
                grouped[clean_isbn]["percentage"] = pct

    # Filtra itens com saldo positivo após compensação de retours (devoluções/estornos)
    raw_items = []
    positive_sum = 0.0
    for idx_item, (isbn_key, g) in enumerate(grouped.items(), start=1):
        val_net = round(g["original_value"], 2)
        if val_net <= 0.0:
            # Item 100% estornado (ex: 1 sale e 1 retour de mesmo valor que zeram no mês)
            continue
        positive_sum = round(positive_sum + val_net, 2)
        raw_items.append({
            "id": f"bookwire-{idx_item}",
            "row": g["first_row"],
            "isbn": isbn_key,
            "title_pearson": g["title_pearson"],
            "pageviews": max(1, int(g["pageviews"])) if g["pageviews"] > 0 else 1,
            "percentage": g["percentage"],
            "original_value": val_net,
            "quantity": 1,
            "liquid_value": val_net,
            "subtotal": val_net,
            "selected_for_rateio": True,
        })

    # Se houve algum ISBN que ficou líquido negativo no mês (retour isolado sem venda do mesmo ISBN),
    # ajusta proporcionalmente o original_value dos itens positivos para bater 100% com o líquido da planilha Bookwire
    if raw_items and total_sheet_net > 0 and abs(positive_sum - total_sheet_net) >= 0.01:
        diff_neg = round(total_sheet_net - positive_sum, 2)
        largest = max(raw_items, key=lambda x: x["original_value"])
        if largest["original_value"] + diff_neg > 0.01:
            largest["original_value"] = round(largest["original_value"] + diff_neg, 2)
            largest["liquid_value"] = largest["original_value"]
            largest["subtotal"] = largest["original_value"]

    total_val = round(sum(it["original_value"] for it in raw_items), 2)

    period = ""
    if period_start and period_end:
        period = f"{period_start} a {period_end}"
    elif period_start:
        period = period_start

    receipt_month = ""
    if period_start:
        parts = period_start.split("/")
        if len(parts) == 3:
            receipt_month = f"{parts[1]}/{parts[2]}"
    if not receipt_month:
        m_ym = re.search(r'(20\d{2})[-_]?(\d{2})\d{2}', filename or "")
        if m_ym:
            receipt_month = f"{m_ym.group(2)}/{m_ym.group(1)}"

    if not receipt_number and account_number:
        receipt_number = account_number

    now = datetime.now()
    ref_suffix = f"{receipt_number or 'BW'}-{receipt_month or now.strftime('%m/%Y')}"
    suggested_ref = f"BW-{ref_suffix}".replace(" ", "-")

    return {
        "report_model": "BOOKWIRE",
        "period": period,
        "receipt_month": receipt_month,
        "receipt_number": receipt_number,
        "suggested_reference": suggested_ref,
        "total_items": len(raw_items),
        "total_original_value": total_val,
        "items": raw_items,
    }


def _unify_duplicate_horus_items(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Unifica itens que apontam para o mesmo código Horus (`horus_cod_item`)
    ou mesmo ISBN principal do Horus (`horus_isbn`), somando `original_value`,
    `subtotal`, `pageviews` e `percentage` para que não haja duplicidade no envio
    ao Horus ERP e os valores sejam devidamente rateados/decompostos.
    """
    if not items:
        return items

    unified: List[Dict[str, Any]] = []

    for it in items:
        item_copy = dict(it)
        in_horus = bool(item_copy.get("in_horus"))
        cod_item = str(item_copy.get("horus_cod_item") or "").strip()
        horus_isbn = _clean_isbn(item_copy.get("horus_isbn") or item_copy.get("isbn"))
        raw_isbn = _clean_isbn(item_copy.get("isbn"))

        if not in_horus or (not cod_item and not horus_isbn):
            unified.append(item_copy)
            continue

        # Procura se já existe na lista unificada um item localizado para o mesmo produto Horus
        existing_match = None
        for u in unified:
            if not u.get("in_horus"):
                continue
            u_cod = str(u.get("horus_cod_item") or "").strip()
            u_hisbn = _clean_isbn(u.get("horus_isbn") or u.get("isbn"))
            if (cod_item and u_cod and cod_item == u_cod) or (horus_isbn and u_hisbn and horus_isbn == u_hisbn):
                existing_match = u
                break

        if existing_match is None:
            if not item_copy.get("merged_isbns"):
                item_copy["merged_isbns"] = [raw_isbn] if raw_isbn else []
            unified.append(item_copy)
        else:
            # Unifica os valores no item existente
            merged_list = list(existing_match.get("merged_isbns") or [existing_match.get("isbn")])
            if raw_isbn and raw_isbn not in merged_list:
                merged_list.append(raw_isbn)
            existing_match["merged_isbns"] = merged_list

            # Garante que o ISBN principal do Horus fique como referência principal
            primary_isbn = _clean_isbn(existing_match.get("horus_isbn")) or horus_isbn or existing_match["isbn"]
            existing_match["horus_isbn"] = primary_isbn
            existing_match["isbn"] = primary_isbn

            existing_match["original_value"] = round(
                float(existing_match.get("original_value") or 0.0) + float(item_copy.get("original_value") or 0.0), 2
            )
            existing_match["subtotal"] = round(
                float(existing_match.get("subtotal") or 0.0) + float(item_copy.get("subtotal") or 0.0), 2
            )
            existing_match["liquid_value"] = existing_match["subtotal"]
            existing_match["quantity"] = 1
            existing_match["pageviews"] = int(existing_match.get("pageviews") or 0) + int(item_copy.get("pageviews") or 0)
            existing_match["percentage"] = round(
                float(existing_match.get("percentage") or 0.0) + float(item_copy.get("percentage") or 0.0), 4
            )
            if not existing_match.get("horus_cover_price") and item_copy.get("horus_cover_price"):
                existing_match["horus_cover_price"] = item_copy["horus_cover_price"]

            joined_isbns = " + ".join(merged_list)
            existing_match["api_message"] = (
                f"✓ Unificado ({joined_isbns}) → Horus #{existing_match.get('horus_cod_item')}"
            )

    return unified


def decompose_and_reconcile_items(
    items: List[Dict[str, Any]], 
    target_total: Optional[float] = None
) -> List[Dict[str, Any]]:
    """
    Inteligência de Decomposição de Quantidade e Preço de Capa:
    Garante estritamente que nenhum item seja enviado com valor unitário (liquid_value)
    maior que o Preço de Capa (cover_price) cadastrado no Horus ERP.
    
    1. Se o valor do item (subtotal desejado) for maior que o preço de capa, calcula a quantidade mínima
       Q >= ceil(subtotal / capa) e valor unitário Pu <= capa.
       Testa candidatos de Q próximos para tentar divisão exata em centavos (sem quebra).
    2. Calcula a quebra residual global de centavos (soma dos subtotais vs total desejado).
    3. Atribui a quebra centavo a centavo exclusivamente a itens com quantidade == 1,
       pois itens unitários absorvem centavos com precisão exata sem efeito multiplicador.
    """
    if not items:
        return items

    if target_total is None:
        target_total = round(sum(float(it.get("subtotal") or it.get("original_value") or 0.0) for it in items), 2)
    else:
        target_total = round(float(target_total), 2)

    results = []

    # Passo 1: Determinar Q e Pu preliminar para cada item respeitando Capa
    for it in items:
        target_s = round(float(it.get("subtotal") or it.get("original_value") or 0.0), 2)
        cover = float(it.get("horus_cover_price") or 0.0)

        if cover > 0.0 and target_s > cover:
            q_min = max(1, math.ceil(target_s / cover))

            # Tenta encontrar Q em [q_min, q_min + 3] que divida exatamente em centavos
            best_q = q_min
            cents = int(round(target_s * 100))
            for q_cand in range(q_min, q_min + 4):
                if cents % q_cand == 0:
                    best_q = q_cand
                    break

            q = best_q
            pu = round(target_s / q, 2)
            # Garantia estrita de Pu <= cover
            while pu > cover:
                q += 1
                pu = round(target_s / q, 2)
        else:
            q = 1
            pu = target_s

        subtotal = round(q * pu, 2)
        item_copy = dict(it)
        item_copy["quantity"] = q
        item_copy["liquid_value"] = pu
        item_copy["subtotal"] = subtotal
        results.append(item_copy)

    # Passo 2: Calcular a Quebra (diferença residual de centavos vs total desejado)
    current_sum = round(sum(it["subtotal"] for it in results), 2)
    diff_cents = int(round((target_total - current_sum) * 100))

    # Passo 3: Atribuir a Quebra a itens com quantidade == 1
    if diff_cents != 0:
        q1_items = [it for it in results if it["quantity"] == 1]
        step = 1 if diff_cents > 0 else -1
        idx = 0
        max_loops = abs(diff_cents) * 4
        loops = 0

        while diff_cents != 0 and loops < max_loops:
            loops += 1
            if q1_items:
                target_item = q1_items[idx % len(q1_items)]
                idx += 1
                cover = float(target_item.get("horus_cover_price") or 0.0)
                new_pu = round(target_item["liquid_value"] + (step * 0.01), 2)

                # Valida se não estoura o preço de capa nem fica zerado/negativo
                if new_pu > 0 and (cover <= 0 or new_pu <= cover):
                    target_item["liquid_value"] = new_pu
                    target_item["subtotal"] = new_pu  # pois Q == 1
                    diff_cents -= step
            else:
                # Se não houver itens com Q == 1, usa o item com menor Q
                sorted_items = sorted(results, key=lambda x: x["quantity"])
                target_item = sorted_items[0]
                new_pu = round(target_item["liquid_value"] + (step * 0.01), 2)
                cover = float(target_item.get("horus_cover_price") or 0.0)
                if new_pu > 0 and (cover <= 0 or new_pu <= cover):
                    target_item["liquid_value"] = new_pu
                    target_item["subtotal"] = round(target_item["quantity"] * new_pu, 2)
                    current_sum = round(sum(it["subtotal"] for it in results), 2)
                    diff_cents = int(round((target_total - current_sum) * 100))
                else:
                    break

    return results



# ── Endpoint 1: Upload, Leitura e Consulta de ISBNs via API Horus ─────────────

@router.post("/parse-and-preview", response_model=PearsonPreviewResponse)
async def parse_and_preview_pearson_sheet(
    file: UploadFile = File(...),
    customer_id: Optional[int] = Form(None),
    report_model: Optional[str] = Form("PEARSON"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Recebe a planilha enviada pela Pearson (BV) ou Bookwire (XLSX/CSV),
    extrai os dados de repasse por ISBN, e consulta CADA ISBN
    diretamente na API do Horus ERP (sem consultas SQL diretas).
    """
    assert_company_ownership(current_user, current_user.company_id)

    try:
        content = await file.read()
        if len(content) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=413,
                detail="O arquivo excede o limite máximo permitido de 10 MB."
            )

        filename = file.filename or "planilha_repasse.xlsx"
        normalized_model = (report_model or "PEARSON").strip().upper()
        if normalized_model not in ("PEARSON", "BOOKWIRE"):
            normalized_model = "PEARSON"

        if normalized_model == "BOOKWIRE":
            parsed_data = _parse_bookwire_file(content, filename)
        else:
            # Se o usuário deixou PEARSON selecionado mas subiu um CSV da Bookwire, detecta de forma resiliente
            ext_lower = os.path.splitext(filename)[1].lower()
            if ext_lower == ".csv" and b"Payment Amount Publisher" in content[:2048]:
                parsed_data = _parse_bookwire_file(content, filename)
                normalized_model = "BOOKWIRE"
            else:
                parsed_data = _parse_pearson_workbook(content, filename)

        items = parsed_data["items"]
        model_label = "Bookwire" if normalized_model == "BOOKWIRE" else "Pearson"

        if not items:
            raise HTTPException(
                status_code=400,
                detail=f"Nenhum item com ISBN válido e saldo positivo foi encontrado na planilha {model_label} informada."
            )

        # Busca configurações da empresa
        settings = db.query(CompanySettings).filter(
            CompanySettings.company_id == current_user.company_id
        ).first()

        customer = None
        if customer_id:
            customer = db.query(Customer).filter(
                Customer.id == customer_id,
                Customer.company_id == current_user.company_id
            ).first()

        # ══════════════════════════════════════════════════════════════════════
        # CONSULTA DOS PRODUTOS VIA API DO HORUS (NÃO VIA SQL DIRETO)
        # ══════════════════════════════════════════════════════════════════════
        horus_map: Dict[str, Any] = {}

        if settings and settings.horus_enabled and settings.horus_url:
            try:
                # 1. Se cliente tiver B2B ID_GUID, tenta busca em lote via Busca_AcervoB2B
                if customer and customer.id_guid:
                    try:
                        horus_prod_client = HorusProducts(db=db, company_id=current_user.company_id)
                        isbns_payload = [{"BARRAS_ISBN": it["isbn"]} for it in items if it["isbn"]]
                        
                        horus_res = await horus_prod_client.busca_acervo_b2b(
                            id_doc=customer.document or "0",
                            id_guid=customer.id_guid,
                            isbns=isbns_payload,
                            limit=5000
                        )
                        items_list = horus_res if isinstance(horus_res, list) else []
                        if isinstance(horus_res, dict) and "itens" in horus_res:
                            items_list = horus_res["itens"]

                        for hi in items_list:
                            key = str(hi.get("COD_BARRA_ITEM") or hi.get("BARRAS_ISBN") or "").strip()
                            if key:
                                horus_map[key] = hi
                    except Exception as e_b2b:
                        logger.warning(f"[Ebook Pearson] Busca B2B em lote falhou, tentando Busca_Acervo padrão: {e_b2b}")

                # 2. Para itens restantes ou caso padrão, utiliza Busca_Acervo padrão via API buscando estritamente por BARRAS_ISBN
                missing_items = [it for it in items if it["isbn"] not in horus_map]
                if missing_items:
                    search_client = HorusProductSearch(db=db, company_id=current_user.company_id)
                    for m_it in missing_items[:100]:
                        isbn_val = m_it["isbn"]
                        hr_found = None
                        
                        # Busca direta e estrita por BARRAS_ISBN (sem adivinhar ou buscar por título)
                        for attempt in range(2):
                            try:
                                res = await search_client.busca_acervo(term=isbn_val, search_option="BARRAS_ISBN", limit=5)
                                if res and isinstance(res, list) and len(res) > 0 and not res[0].get("Falha"):
                                    hr_found = res[0]
                                    break
                            except Exception as _e_s:
                                if attempt == 0:
                                    await asyncio.sleep(0.1)
                                    continue
                                logger.debug(f"[Ebook Pearson] Busca por ISBN {isbn_val} falhou: {_e_s}")

                        if hr_found:
                            horus_map[isbn_val] = hr_found

                        # Pequeno intervalo para não saturar conexões do TServerB2B (Windows)
                        await asyncio.sleep(0.04)
            except Exception as e:
                logger.warning(f"[Ebook Pearson] Erro geral ao consultar API Horus: {e}")

        # Fallback complementar: Cadastro Sincronizado do DBM no Cronuz (incluindo 2º/3º ISBNs de E-book)
        raw_enriched = []
        search_client_fallback = (
            HorusProductSearch(db=db, company_id=current_user.company_id)
            if (settings and settings.horus_enabled and settings.horus_url)
            else None
        )

        for it in items:
            isbn = it["isbn"]
            hr = horus_map.get(isbn)
            if not hr:
                for k, v in horus_map.items():
                    if k == isbn or str(v.get("COD_BARRA_ITEM") or v.get("BARRAS_ISBN") or "") == isbn:
                        hr = v
                        break

            is_ebook = None
            horus_isbn_resolved = isbn
            matched_via_secondary = False

            # Se não achou pelo ISBN da planilha diretamente no Horus, vasculha no Cadastro Sincronizado do DBM (incluindo ISBNs adicionais)
            prod_dbm = None
            if not hr:
                prod_dbm = _find_dbm_product_by_any_isbn(db, current_user.company_id, isbn)
                if prod_dbm and prod_dbm.ean_gtin:
                    prim_isbn = _clean_isbn(prod_dbm.ean_gtin)
                    if prim_isbn and prim_isbn != isbn:
                        matched_via_secondary = True
                        horus_isbn_resolved = prim_isbn
                        hr = horus_map.get(prim_isbn)
                        if not hr and search_client_fallback:
                            try:
                                res_sec = await search_client_fallback.busca_acervo(
                                    term=prim_isbn, search_option="BARRAS_ISBN", limit=5
                                )
                                if res_sec and isinstance(res_sec, list) and len(res_sec) > 0 and not res_sec[0].get("Falha"):
                                    hr = res_sec[0]
                                    horus_map[prim_isbn] = hr
                            except Exception as _e_sec:
                                logger.debug(f"[Ebook DBM] Busca Horus por ISBN principal {prim_isbn} falhou: {_e_sec}")

            if hr:
                in_horus = True
                horus_cod = str(hr.get("COD_ITEM") or hr.get("ID") or (prod_dbm.horus_cod_item if prod_dbm else "") or "")
                horus_barras = _clean_isbn(hr.get("COD_BARRA_ITEM") or hr.get("BARRAS_ISBN") or horus_isbn_resolved)
                if horus_barras:
                    horus_isbn_resolved = horus_barras
                horus_title = str(hr.get("NOM_ITEM") or hr.get("NOME") or it["title_pearson"])
                cover_price = parse_horus_price(
                    hr.get("VLR_CAPA") or hr.get("PRECO") or hr.get("PRECO_TABELA") or hr.get("VALOR_CAPA") or 0.0
                )
                if cover_price <= 0.0 and prod_dbm:
                    cover_price = parse_horus_price(prod_dbm.promotional_price or prod_dbm.base_price or 0.0)
                if cover_price <= 0.0:
                    cover_price = None
                stock = _safe_int(hr.get("SALDO_DISPONIVEL") or hr.get("QTD_ESTOQUE") or 0)
                
                # Validação de E-book vs Livro Físico (EBOOK: 'S' = E-book, 'N' = Físico)
                raw_ebook = str(hr.get("EBOOK") or "").strip().upper()
                nom_upper = horus_title.upper()
                if raw_ebook == "S" or "[E-BOOK]" in nom_upper or "[EBOOK]" in nom_upper:
                    is_ebook = True
                    if matched_via_secondary:
                        api_msg = f"✓ 2º ISBN vinculado via DBM → Horus #{horus_cod} (ISBN Horus: {horus_isbn_resolved})"
                    else:
                        api_msg = f"✓ Localizado na API Horus (Cód: {horus_cod})"
                elif raw_ebook == "N":
                    is_ebook = False
                    api_msg = f"⚠ Livro Físico no Horus (Cód: {horus_cod}) - Requer ISBN do E-book"
                else:
                    is_ebook = True
                    if matched_via_secondary:
                        api_msg = f"✓ 2º ISBN vinculado via DBM → Horus #{horus_cod} (ISBN Horus: {horus_isbn_resolved})"
                    else:
                        api_msg = f"✓ Localizado na API Horus (Cód: {horus_cod})"
            else:
                if not prod_dbm:
                    prod_dbm = _find_dbm_product_by_any_isbn(db, current_user.company_id, isbn)

                if prod_dbm:
                    in_horus = True
                    horus_cod = str(prod_dbm.horus_cod_item or prod_dbm.sku or prod_dbm.id)
                    horus_isbn_resolved = _clean_isbn(prod_dbm.ean_gtin) or isbn
                    horus_title = prod_dbm.name
                    cover_price = parse_horus_price(prod_dbm.promotional_price or prod_dbm.base_price or 0.0)
                    if cover_price <= 0.0:
                        cover_price = None
                    stock = _safe_int(prod_dbm.stock_quantity or 0)
                    is_ebook = True
                    if horus_isbn_resolved != isbn:
                        api_msg = f"✓ Localizado por 2º ISBN no Cadastro DBM (Cód: {horus_cod} | ISBN Horus: {horus_isbn_resolved})"
                    else:
                        api_msg = f"✓ Cadastro Sincronizado DBM (Cód: {horus_cod})"
                else:
                    in_horus = False
                    horus_cod = None
                    horus_isbn_resolved = None
                    horus_title = None
                    cover_price = None
                    stock = None
                    is_ebook = None
                    api_msg = "⚠ Não localizado na API Horus nem no Cadastro DBM"

            raw_enriched.append({
                "id": it["id"],
                "row": it["row"],
                "isbn": it["isbn"],
                "horus_isbn": horus_isbn_resolved,
                "title_pearson": it["title_pearson"],
                "pageviews": it["pageviews"],
                "percentage": it["percentage"],
                "original_value": it["original_value"],
                "quantity": 1,
                "liquid_value": it["original_value"],
                "subtotal": it["original_value"],
                "in_horus": in_horus,
                "horus_cod_item": horus_cod,
                "horus_title": horus_title,
                "horus_cover_price": cover_price,
                "horus_stock": stock,
                "is_ebook": is_ebook,
                "api_message": api_msg,
                "selected_for_rateio": True,
                "merged_isbns": [it["isbn"]],
            })

        # Unifica itens que apontam para o mesmo produto no Horus (ex: 2º ISBN resolvido para o mesmo livro)
        raw_enriched = _unify_duplicate_horus_items(raw_enriched)

        # Aplica Inteligência de Decomposição (Quantidade x Preço de Capa e Quebra em Q=1)
        decomposed = decompose_and_reconcile_items(raw_enriched, target_total=parsed_data["total_original_value"])

        enriched_items: List[PearsonItemPreview] = [
            PearsonItemPreview(
                id=d["id"],
                row=d["row"],
                isbn=d["isbn"],
                horus_isbn=d.get("horus_isbn"),
                merged_isbns=d.get("merged_isbns"),
                title_pearson=d["title_pearson"],
                pageviews=d["pageviews"],
                percentage=d["percentage"],
                original_value=d["original_value"],
                quantity=d["quantity"],
                liquid_value=d["liquid_value"],
                subtotal=d["subtotal"],
                selected_for_rateio=True,
                in_horus=d["in_horus"],
                horus_cod_item=d["horus_cod_item"],
                horus_title=d["horus_title"],
                horus_cover_price=d["horus_cover_price"],
                horus_stock=d["horus_stock"],
                is_ebook=d.get("is_ebook"),
                api_message=d["api_message"]
            )
            for d in decomposed
        ]

        total_found = sum(1 for it in enriched_items if it.in_horus)
        total_not_found = sum(1 for it in enriched_items if not it.in_horus)
        not_found_isbns = [it.isbn for it in enriched_items if not it.in_horus]

        # Itens com Preço de Capa zerado ou ausente no Horus
        zero_cover_items = [it for it in enriched_items if it.in_horus and (it.horus_cover_price is None or it.horus_cover_price <= 0)]
        total_zero_cover = len(zero_cover_items)
        zero_cover_isbns = [it.isbn for it in zero_cover_items]

        # Itens cadastrados no Horus como Livro Físico (EBOOK == False)
        physical_items = [it for it in enriched_items if it.in_horus and it.is_ebook is False]
        total_physical_books = len(physical_items)
        physical_book_isbns = [it.isbn for it in physical_items]

        has_critical_errors = (total_not_found > 0) or (total_zero_cover > 0) or (total_physical_books > 0)

        return PearsonPreviewResponse(
            success=True,
            filename=filename,
            report_model=parsed_data.get("report_model", normalized_model),
            period=parsed_data["period"],
            receipt_month=parsed_data["receipt_month"],
            receipt_number=parsed_data["receipt_number"],
            suggested_reference=parsed_data["suggested_reference"],
            total_items=len(enriched_items),
            total_original_value=parsed_data["total_original_value"],
            total_found_in_horus=total_found,
            total_not_found=total_not_found,
            not_found_isbns=not_found_isbns,
            total_zero_cover=total_zero_cover,
            zero_cover_isbns=zero_cover_isbns,
            total_physical_books=total_physical_books,
            physical_book_isbns=physical_book_isbns,
            has_critical_errors=has_critical_errors,
            items=enriched_items
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[Ebook Repasse] Erro inesperado ao processar planilha: {exc}", exc_info=True)
        raise HTTPException(
            status_code=400,
            detail=f"Não foi possível processar a planilha de E-book: {str(exc)}. Verifique o formato do arquivo."
        )


# ── Endpoint: Reconsulta Individual de Item no Horus / Catálogo DBM ──────────

@router.post("/lookup-item", response_model=LookupItemResponse)
async def lookup_single_item(
    payload: LookupItemRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Reconsulta um item individual diretamente no Horus (por ISBN ou Cód. Horus)
    e, quando não localizar direto no Horus, vasculha o Cadastro Sincronizado do DBM
    no Cronuz (incluindo 2º/3º ISBNs em `additional_isbns`).
    Se `original_isbn` for informado e diferente do ISBN principal do Horus,
    salva automaticamente esse 2º ISBN no cadastro DBM do produto.
    """
    assert_company_ownership(current_user, current_user.company_id)
    clean_isbn = _clean_isbn(payload.isbn)
    orig_isbn = _clean_isbn(payload.original_isbn) if payload.original_isbn else clean_isbn

    settings = db.query(CompanySettings).filter(
        CompanySettings.company_id == current_user.company_id
    ).first()

    hr_found = None
    prod_dbm = _find_dbm_product_by_any_isbn(db, current_user.company_id, clean_isbn)
    matched_via_dbm_secondary = False

    if settings and settings.horus_enabled and settings.horus_url:
        search_client = HorusProductSearch(db=db, company_id=current_user.company_id)
        
        # 1. Busca direta no Horus por BARRAS_ISBN (>= 8 dígitos) ou COD_ITEM (< 8 dígitos)
        if clean_isbn and len(clean_isbn) >= 8:
            try:
                res = await search_client.busca_acervo(term=clean_isbn, search_option="BARRAS_ISBN", limit=5)
                if res and isinstance(res, list) and len(res) > 0 and not res[0].get("Falha"):
                    hr_found = res[0]
            except Exception as _e:
                logger.debug(f"[Lookup Item] Busca por ISBN falhou: {_e}")
        elif clean_isbn and clean_isbn.isdigit():
            try:
                res = await search_client.busca_acervo(term=clean_isbn, search_option="COD_ITEM", limit=5)
                if res and isinstance(res, list) and len(res) > 0 and not res[0].get("Falha"):
                    hr_found = res[0]
            except Exception as _e_cod:
                logger.debug(f"[Lookup Item] Busca por COD_ITEM falhou: {_e_cod}")

        # 2. Se não achou direto no Horus, mas achou no Cadastro DBM (ex: pelo 2º ISBN), consulta o Horus pelo ISBN principal do DBM
        if not hr_found and prod_dbm and prod_dbm.ean_gtin:
            prim_isbn = _clean_isbn(prod_dbm.ean_gtin)
            if prim_isbn and prim_isbn != clean_isbn:
                matched_via_dbm_secondary = True
                try:
                    res_prim = await search_client.busca_acervo(term=prim_isbn, search_option="BARRAS_ISBN", limit=5)
                    if res_prim and isinstance(res_prim, list) and len(res_prim) > 0 and not res_prim[0].get("Falha"):
                        hr_found = res_prim[0]
                except Exception as _e_prim:
                    logger.debug(f"[Lookup Item] Busca Horus via ISBN principal DBM ({prim_isbn}) falhou: {_e_prim}")

    if hr_found:
        horus_cod = str(hr_found.get("COD_ITEM") or hr_found.get("ID") or (prod_dbm.horus_cod_item if prod_dbm else "") or "")
        horus_primary_isbn = _clean_isbn(
            hr_found.get("COD_BARRA_ITEM") or hr_found.get("BARRAS_ISBN") or (prod_dbm.ean_gtin if prod_dbm else clean_isbn)
        )
        horus_title = str(hr_found.get("NOM_ITEM") or hr_found.get("NOME") or payload.title or clean_isbn)
        cover_price = parse_horus_price(
            hr_found.get("VLR_CAPA") or hr_found.get("PRECO") or hr_found.get("PRECO_TABELA") or hr_found.get("VALOR_CAPA") or 0.0
        )
        if cover_price <= 0.0 and prod_dbm:
            cover_price = parse_horus_price(prod_dbm.promotional_price or prod_dbm.base_price or 0.0)
        if cover_price <= 0.0:
            cover_price = None
        stock = _safe_int(hr_found.get("SALDO_DISPONIVEL") or hr_found.get("QTD_ESTOQUE") or 0)
        
        # Checagem E-book vs Físico
        raw_ebook = str(hr_found.get("EBOOK") or "").strip().upper()
        nom_upper = horus_title.upper()
        if raw_ebook == "S" or "[E-BOOK]" in nom_upper or "[EBOOK]" in nom_upper:
            is_ebook = True
            api_msg = (
                f"✓ Localizado via 2º ISBN no Cadastro DBM → Horus #{horus_cod} (ISBN Horus: {horus_primary_isbn})"
                if matched_via_dbm_secondary
                else f"✓ Localizado no Horus ERP (Cód: #{horus_cod})"
            )
        elif raw_ebook == "N":
            is_ebook = False
            api_msg = f"⚠ Livro Físico no Horus (Cód: #{horus_cod}) - Requer ISBN do E-book"
        else:
            is_ebook = True
            api_msg = (
                f"✓ Localizado via 2º ISBN no Cadastro DBM → Horus #{horus_cod} (ISBN Horus: {horus_primary_isbn})"
                if matched_via_dbm_secondary
                else f"✓ Localizado no Horus ERP (Cód: #{horus_cod})"
            )

        linked_sec = None
        if payload.save_secondary_isbn and orig_isbn and horus_primary_isbn and orig_isbn != horus_primary_isbn:
            linked_sec = _save_secondary_isbn_on_dbm_product(
                db=db,
                company_id=current_user.company_id,
                secondary_isbn=orig_isbn,
                horus_cod_item=horus_cod,
                horus_primary_isbn=horus_primary_isbn,
                horus_title=horus_title,
                horus_cover_price=cover_price,
            )
            if linked_sec:
                api_msg = f"✓ Vinculado ao Horus #{horus_cod} e 2º ISBN ({linked_sec}) salvo no Cadastro DBM!"

        return LookupItemResponse(
            found=True,
            isbn=orig_isbn or clean_isbn or payload.isbn,
            horus_isbn=horus_primary_isbn or clean_isbn,
            horus_cod_item=horus_cod,
            horus_title=horus_title,
            horus_cover_price=cover_price,
            horus_stock=stock,
            is_ebook=is_ebook,
            linked_secondary_isbn=linked_sec,
            api_message=api_msg
        )

    # Fallback: Cadastro Sincronizado do DBM no Cronuz (incluindo `additional_isbns`)
    if prod_dbm:
        horus_cod = str(prod_dbm.horus_cod_item or prod_dbm.sku or prod_dbm.id)
        horus_primary_isbn = _clean_isbn(prod_dbm.ean_gtin) or clean_isbn
        cover_price = parse_horus_price(prod_dbm.promotional_price or prod_dbm.base_price or 0.0)
        if cover_price <= 0.0:
            cover_price = None
        stock = _safe_int(prod_dbm.stock_quantity or 0)

        linked_sec = None
        if payload.save_secondary_isbn and orig_isbn and horus_primary_isbn and orig_isbn != horus_primary_isbn:
            linked_sec = _save_secondary_isbn_on_dbm_product(
                db=db,
                company_id=current_user.company_id,
                secondary_isbn=orig_isbn,
                horus_cod_item=horus_cod,
                horus_primary_isbn=horus_primary_isbn,
                horus_title=prod_dbm.name,
                horus_cover_price=cover_price,
            )

        msg_dbm = (
            f"✓ Localizado via 2º ISBN no Cadastro DBM (Cód: #{horus_cod} | ISBN Horus: {horus_primary_isbn})"
            if horus_primary_isbn != (orig_isbn or clean_isbn)
            else f"✓ Localizado no Cadastro Sincronizado DBM (Cód: #{horus_cod})"
        )
        return LookupItemResponse(
            found=True,
            isbn=orig_isbn or clean_isbn or payload.isbn,
            horus_isbn=horus_primary_isbn,
            horus_cod_item=horus_cod,
            horus_title=prod_dbm.name,
            horus_cover_price=cover_price,
            horus_stock=stock,
            is_ebook=True,
            linked_secondary_isbn=linked_sec,
            api_message=msg_dbm
        )

    return LookupItemResponse(
        found=False,
        isbn=clean_isbn or payload.isbn,
        horus_isbn=None,
        horus_cod_item=None,
        horus_title=None,
        horus_cover_price=None,
        horus_stock=None,
        api_message="⚠ Não localizado no Horus ERP nem no Cadastro Sincronizado do DBM"
    )


# ── Endpoint 2: Rateio Dinâmico com Distribuição Exata ao Centavo ────────────

@router.post("/reapportion")
def reapportion_ebook_values(
    payload: ReapportionRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Aplica o rateio dinâmico da diferença entre o Valor Total Recebido informado
    e o total atual dos itens da proposta.
    
    Distribui proporcionalmente sobre os itens selecionados,
    e ajusta o residual de centavos de modo que:
    sum(liquid_value * quantity) == target_received_total com 100% de exatidão!
    """
    target_total = round(float(payload.target_received_total), 2)
    items = payload.items

    if not items:
        raise HTTPException(status_code=400, detail="Nenhum item informado para rateio.")

    # Filtra selecionados
    selected_indices = [idx for idx, it in enumerate(items) if it.selected_for_rateio]
    if not selected_indices:
        raise HTTPException(
            status_code=400,
            detail="Selecione ao menos 1 item para aplicar o rateio da diferença."
        )

    current_total = round(sum(it.liquid_value * it.quantity for it in items), 2)
    diff = round(target_total - current_total, 2)

    # Se a diferença já for nula
    if abs(diff) < 0.001:
        return {
            "success": True,
            "target_total": target_total,
            "current_total": current_total,
            "difference": 0.0,
            "items": [it.dict() for it in items]
        }

    # Soma dos subtotais dos itens selecionados para servir de base proporcional
    selected_weight = sum(items[idx].liquid_value * items[idx].quantity for idx in selected_indices)
    
    # Se o peso selecionado for zero, divide igualmente
    use_equal_distribution = (selected_weight <= 0)

    updated_items = [it.dict() for it in items]

    for idx in selected_indices:
        it = updated_items[idx]
        qty = max(1, it["quantity"])
        
        if use_equal_distribution:
            share = diff / len(selected_indices)
        else:
            item_weight = it["liquid_value"] * qty
            ratio = item_weight / selected_weight
            share = diff * ratio

        unit_delta = round(share / qty, 2)
        new_unit = max(0.01, round(it["liquid_value"] + unit_delta, 2))
        it["liquid_value"] = new_unit
        it["subtotal"] = round(new_unit * qty, 2)

    # Verifica residual de centavos decorrente do arredondamento a 2 casas decimais
    new_sum = round(sum(it["liquid_value"] * it["quantity"] for it in updated_items), 2)
    residual = round(target_total - new_sum, 2)

    # Distribui o residual de centavos sobre o maior item selecionado
    if residual != 0 and selected_indices:
        largest_idx = max(selected_indices, key=lambda i: updated_items[i]["liquid_value"])
        largest_item = updated_items[largest_idx]
        qty = max(1, largest_item["quantity"])
        adjusted_price = max(0.01, round(largest_item["liquid_value"] + (residual / qty), 2))
        largest_item["liquid_value"] = adjusted_price
        largest_item["subtotal"] = round(adjusted_price * qty, 2)

    final_total = round(sum(it["liquid_value"] * it["quantity"] for it in updated_items), 2)
    final_diff = round(target_total - final_total, 2)

    return {
        "success": True,
        "target_total": target_total,
        "final_total": final_total,
        "difference": final_diff,
        "is_matched": abs(final_diff) < 0.005,
        "items": updated_items
    }


# ── Endpoint 3: Gerar e Injetar Pedido de E-book no Horus ERP ─────────────────

@router.post("/create-order")
async def create_and_send_ebook_order(
    payload: CreateEbookOrderRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Gera o pedido definitivo de E-book no Cronuz e transmite para o Horus ERP
    utilizando a rotina padrão com envio explícito do VLR_LIQUIDO por item.
    
    NÃO interfere com rotinas existentes de StoreFront, PDV ou Bookinfo.
    """
    assert_company_ownership(current_user, current_user.company_id)

    try:
        customer = db.query(Customer).filter(
            Customer.id == payload.customer_id,
            Customer.company_id == current_user.company_id
        ).first()

        if not customer:
            raise HTTPException(status_code=404, detail="Cliente/Empresa selecionada não encontrada.")

        company = db.query(Company).filter(Company.id == current_user.company_id).first()
        if not company or not company.document:
            raise HTTPException(status_code=400, detail="CNPJ da empresa não configurado no Cronuz.")

        settings = db.query(CompanySettings).filter(
            CompanySettings.company_id == current_user.company_id
        ).first()

        if not payload.items:
            raise HTTPException(status_code=400, detail="Adicione pelo menos 1 item para gerar o pedido.")

        is_bookwire = str(payload.report_model or "PEARSON").strip().upper() == "BOOKWIRE"
        platform_label = "Bookwire" if is_bookwire else "Pearson"

        # Se houver itens duplicados apontando para o mesmo código/ISBN Horus no payload, unifica e re-decompõe
        seen_keys: Dict[str, int] = {}
        has_dup = False
        for it in payload.items:
            k = (str(it.horus_cod_item or "").strip().upper() or _clean_isbn(it.horus_isbn or it.isbn))
            if k and k in seen_keys:
                has_dup = True
                break
            if k:
                seen_keys[k] = 1

        if has_dup:
            raw_for_unify = [
                {
                    "id": str(idx),
                    "row": idx + 1,
                    "isbn": it.isbn,
                    "horus_isbn": it.horus_isbn or it.isbn,
                    "title_pearson": it.title,
                    "pageviews": it.pageviews,
                    "percentage": 0.0,
                    "original_value": it.original_value,
                    "quantity": max(1, it.quantity),
                    "liquid_value": round(float(it.liquid_unit_price), 2),
                    "subtotal": round(float(it.liquid_unit_price) * max(1, it.quantity), 2),
                    "in_horus": bool(it.horus_cod_item),
                    "horus_cod_item": it.horus_cod_item,
                    "horus_title": it.title,
                    "horus_cover_price": it.horus_cover_price,
                    "horus_stock": 0.0,
                    "is_ebook": it.is_ebook,
                    "api_message": "",
                }
                for idx, it in enumerate(payload.items)
            ]
            unified_raw = _unify_duplicate_horus_items(raw_for_unify)
            target_for_reconcile = (
                payload.target_received_total
                if payload.target_received_total > 0
                else round(sum(d["subtotal"] for d in unified_raw), 2)
            )
            reconciled_raw = decompose_and_reconcile_items(unified_raw, target_total=target_for_reconcile)
            payload.items = [
                PearsonOrderItemInput(
                    isbn=d["isbn"],
                    horus_isbn=d.get("horus_isbn"),
                    title=d["title_pearson"],
                    pageviews=d.get("pageviews", 0),
                    original_value=d["original_value"],
                    liquid_unit_price=d["liquid_value"],
                    quantity=d["quantity"],
                    horus_cod_item=d.get("horus_cod_item"),
                    horus_cover_price=d.get("horus_cover_price"),
                    is_ebook=d.get("is_ebook"),
                )
                for d in reconciled_raw
            ]

        # ── VALIDAÇÃO DE VALOR TOTAL RECEBIDO ──────────────────────────────────
        total_liquido_itens = round(sum(float(it.liquid_unit_price) * max(1, it.quantity) for it in payload.items), 2)
        if payload.target_received_total <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"Obrigatório informar o Valor Total Recebido ({platform_label}) antes de gerar o pedido."
            )
        if payload.target_received_total < total_liquido_itens - 0.01:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"O Valor Total Recebido (R$ {payload.target_received_total:.2f}) não pode ser menor que o total "
                    f"líquido dos itens (R$ {total_liquido_itens:.2f}). Ele precisa ser igual ou maior."
                )
            )

        # ── BLOQUEIO CRÍTICO DE FATURAMENTO: ITENS NÃO LOCALIZADOS ─────────────
        # Nenhum item sem código no Horus pode ser transmitido
        unlocated_items = [it for it in payload.items if not it.horus_cod_item]
        if unlocated_items:
            unlocated_sample = ", ".join(f"ISBN {it.isbn}" for it in unlocated_items[:5])
            raise HTTPException(
                status_code=400,
                detail=(
                    f"ERRO CRÍTICO DE FATURAMENTO: Existem {len(unlocated_items)} item(ns) não localizados no Horus ERP ({unlocated_sample}). "
                    f"O pedido está BLOQUEADO para transmissão. Todos os itens devem estar devidamente vinculados ao Horus "
                    f"ou removidos da grade antes de gerar o pedido."
                )
            )

        # ── BLOQUEIO CRÍTICO DE FATURAMENTO: PREÇO DE CAPA ZERADO ──────────────
        zero_cover_items = [it for it in payload.items if not it.horus_cover_price or float(it.horus_cover_price) <= 0.0]
        if zero_cover_items:
            zero_cover_sample = ", ".join(f"ISBN {it.isbn}" for it in zero_cover_items[:5])
            raise HTTPException(
                status_code=400,
                detail=(
                    f"BLOQUEIO CRÍTICO DE FATURAMENTO: Existem {len(zero_cover_items)} item(ns) com Preço de Capa zerado "
                    f"ou não cadastrado no Horus ERP ({zero_cover_sample}). O Horus ERP não permite faturamento de itens "
                    f"sem preço de tabela ativo. Ajuste no Horus o preço de capa do item para poder prosseguir."
                )
            )

        # ── BLOQUEIO CRÍTICO DE FATURAMENTO: LIVROS FÍSICOS NA ROTINA E-BOOK ──
        physical_items = [it for it in payload.items if it.is_ebook is False]
        if physical_items:
            physical_sample = ", ".join(f"ISBN {it.isbn}" for it in physical_items[:5])
            raise HTTPException(
                status_code=400,
                detail=(
                    f"BLOQUEIO CRÍTICO DE FATURAMENTO: Existem {len(physical_items)} item(ns) identificados no Horus como Livro Físico "
                    f"({physical_sample}). O repasse de E-Books ({platform_label}) é restrito exclusivamente a E-Books. "
                    f"Corrija o ISBN na planilha para o da versão digital (E-Book) antes de transmitir o pedido."
                )
            )

        # 1. Monta os itens do pedido local
        order_items = []
        total_liquido = 0.0

        for it in payload.items:
            qty = max(1, it.quantity)
            price = round(float(it.liquid_unit_price), 2)
            cover = float(it.horus_cover_price or 0.0)

            # Trava mandatória: valor unitário não pode ser maior que o preço de capa do Horus
            if cover > 0.0 and price > cover + 0.01:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"BLOQUEIO DE TRANSMISSÃO: O item '{it.title}' (ISBN {it.isbn}) possui valor unitário "
                        f"(R$ {price:.2f}) superior ao Preço de Capa no Horus (R$ {cover:.2f}). "
                        f"Aumente a quantidade deste item na grade para que o valor unitário fique abaixo do preço de capa."
                    )
                )

            line_total = round(price * qty, 2)
            total_liquido += line_total

            # Localiza se existe produto no Cadastro Sincronizado do DBM vinculado ao ISBN (principal ou secundário)
            prod = _find_dbm_product_by_any_isbn(db, current_user.company_id, it.isbn)

            order_item = OrderItem(
                product_id=prod.id if prod else None,
                quantity=qty,
                quantity_requested=qty,
                unit_price=price,
                total_price=line_total,
                ean_isbn=_clean_isbn(it.horus_isbn) or (prod.ean_gtin if prod and prod.ean_gtin else it.isbn),
                sku=it.horus_cod_item or (prod.sku if prod else it.isbn),
                name=it.title or (prod.name if prod else f"E-book {it.isbn}"),
                brand="Bookwire" if is_bookwire else "Pearson BV"
            )
            order_items.append(order_item)

        total_liquido = round(total_liquido, 2)
        default_prefix = "BW" if is_bookwire else "BV"
        clean_ref = str(payload.reference or f"{default_prefix}-{datetime.now().strftime('%Y%m%d%H%M')}").strip()
        if clean_ref.startswith("BV-BV-"):
            clean_ref = clean_ref.replace("BV-BV-", "BV-")
        elif clean_ref.startswith("BW-BW-"):
            clean_ref = clean_ref.replace("BW-BW-", "BW-")

        # 2. Validação obrigatória da integração Horus ERP
        if not settings or not settings.horus_enabled or getattr(settings, "horus_api_mode", "B2B") != "B2B":
            raise HTTPException(
                status_code=400,
                detail="A integração com o Horus ERP B2B não está habilitada para sua empresa."
            )

        if not customer.id_guid:
            raise HTTPException(
                status_code=400,
                detail=f"O cliente '{customer.name}' não possui ID_GUID cadastrado para comunicação com o Horus ERP."
            )

        horus_client = HorusOrders(db, current_user.company_id)
        default_obs = "PEDIDO E-BOOK BOOKWIRE" if is_bookwire else "PEDIDO E-BOOK PEARSON"
        base_obs = (payload.obs_pedido or default_obs).strip()
        obs_texto = base_obs if clean_ref in base_obs else f"{base_obs} | REF: {clean_ref}"

        # 3. Transmissão do cabeçalho do pedido via API Horus (InsPedidoVenda)
        # B2B estrito: apenas ID_DOC, ID_GUID, CNPJ_DESTINO, TIPO_PEDIDO_V_T_D="V", COD_PEDIDO_ORIGEM, OBS_PEDIDO
        try:
            order_res = await horus_client.send_order(
                id_doc=customer.document,
                id_guid=customer.id_guid,
                cnpj_destino=company.document,
                cod_pedido_origem=clean_ref,
                type_order="V",
                obs=obs_texto
            )
        except Exception as e_comm:
            raise HTTPException(
                status_code=400,
                detail=f"Falha de conexão com a API do Horus ERP: {str(e_comm)}"
            )

        if not order_res or order_res.get("error"):
            err = order_res.get("msg") if order_res else "Resposta sem dados do Horus ERP."
            logger.error(f"[Ebook Pearson] Horus recusou InsPedidoVenda: {err}")
            raise HTTPException(
                status_code=400,
                detail=f"Horus ERP recusou o pedido: {err}"
            )

        horus_ped_venda = order_res.get("COD_PED_VENDA")
        if not horus_ped_venda:
            raise HTTPException(
                status_code=400,
                detail="Horus ERP não retornou o número do Pedido de Venda (COD_PED_VENDA). O pedido não foi processado."
            )

        # 4. Transmissão de cada item com o VLR_LIQUIDO unitário rateado
        # Usa o ISBN principal do Horus (horus_isbn ou prod.ean_gtin) caso o item da planilha tenha vindo com 2º ISBN
        items_sent = 0
        items_failed = []
        for it in payload.items:
            clean_it_isbn = _clean_isbn(it.isbn) or it.isbn
            prod_match = _find_dbm_product_by_any_isbn(db, current_user.company_id, clean_it_isbn)
            horus_isbn_to_send = (
                _clean_isbn(it.horus_isbn)
                or (_clean_isbn(prod_match.ean_gtin) if prod_match and prod_match.ean_gtin else None)
                or clean_it_isbn
            )
            try:
                res_item = await horus_client.send_order_item(
                    id_doc=customer.document,
                    id_guid=customer.id_guid,
                    cnpj_destino=company.document,
                    cod_pedido_origem=clean_ref,
                    isbn=horus_isbn_to_send,
                    qty=max(1, it.quantity),
                    price=round(float(it.liquid_unit_price), 2)  # VLR_LIQUIDO exato
                )
                if res_item and isinstance(res_item, list) and len(res_item) > 0:
                    if res_item[0].get("Falha"):
                        items_failed.append(f"ISBN {horus_isbn_to_send}: {res_item[0].get('Mensagem', 'Erro no item')}")
                    else:
                        items_sent += 1
                else:
                    items_sent += 1
            except Exception as e_item:
                items_failed.append(f"ISBN {horus_isbn_to_send}: {str(e_item)}")


        if items_failed:
            logger.error(f"[Ebook Pearson] Erro nos itens no Horus: {items_failed}")
            raise HTTPException(
                status_code=400,
                detail=f"Horus ERP abriu pedido #{horus_ped_venda}, mas rejeitou {len(items_failed)} item(ns): {'; '.join(items_failed[:3])}"
            )

        # 5. Pular expedição (se configurado) ou avançar status no Horus
        cod_cli = customer.horus_cod_cli
        if not cod_cli and customer.document:
            try:
                from app.integrators.horus_clients import HorusClients
                hc = HorusClients(db, current_user.company_id)
                res_cli = await hc.get_client(cnpj_destino=company.document, cnpj_cliente=customer.document)
                if res_cli and not res_cli.get("error") and res_cli.get("data"):
                    found_cod = res_cli["data"].get("COD_CLI")
                    if found_cod:
                        cod_cli = int(found_cod)
                        customer.horus_cod_cli = cod_cli
                        db.commit()
            except Exception as e_c:
                logger.warning(f"[Ebook Pearson] Aviso ao obter COD_CLI do cliente: {e_c}")

        cod_empresa = settings.horus_company if (settings and settings.horus_company) else "1"
        cod_filial = settings.horus_branch if (settings and settings.horus_branch) else "2"
        cod_local = getattr(settings, 'horus_stock_local', None)
        if cod_local is not None and str(cod_local).strip() != '':
            cod_local = str(cod_local).strip()
        else:
            cod_local = None

        pular_sucesso = False
        if payload.skip_expedition:
            try:
                res_pular = await horus_client.pular_expedicao(
                    cod_ped_venda=horus_ped_venda,
                    cod_local=cod_local,
                    cod_empresa=cod_empresa,
                    cod_filial=cod_filial,
                    cod_cli=cod_cli
                )
                logger.info(f"[Ebook Pearson] Resposta Pular_expedicao #{horus_ped_venda}: {res_pular}")
                if res_pular and isinstance(res_pular, list) and len(res_pular) > 0:
                    item_p = res_pular[0]
                    msg_p = item_p.get("MSG") or item_p.get("Mensagem") or item_p.get("MENSAGEM") or ""
                    if "SUCESSO" in msg_p.upper() or item_p.get("Falha") != "S":
                        pular_sucesso = True
                    else:
                        logger.warning(f"[Ebook Pearson] Pular_expedicao retornou aviso/falha: {msg_p}")
                else:
                    pular_sucesso = True
            except Exception as _e_exp:
                logger.warning(f"[Ebook Pearson] Erro ao pular expedição no Horus: {_e_exp}")

        # Se NÃO pulou expedição (ou se pular expedição falhou), avança via AltStatus_Pedido (LEX)
        if not payload.skip_expedition or not pular_sucesso:
            try:
                await horus_client.alt_status_pedido(
                    id_doc=customer.document,
                    id_guid=customer.id_guid,
                    cnpj_destino=company.document,
                    cod_pedido_origem=clean_ref
                )
            except Exception as _e_alt:
                logger.info(f"[Ebook Pearson] Aviso ao chamar AltStatus_Pedido no Horus: {_e_alt}")

        # 6. Grava o pedido definitivo no Cronuz SOMENTE com o COD_PED_VENDA confirmado
        order = Order(
            company_id=current_user.company_id,
            customer_id=customer.id,
            agent_id=current_user.id,
            status="SENT_TO_HORUS",
            horus_pedido_venda=str(horus_ped_venda),
            type_order="V",
            origin="ebook_pearson",
            customer_order_ref=clean_ref,
            subtotal=total_liquido,
            discount=0.0,
            total=total_liquido,
            payment_condition=payload.payment_condition or "30 DDL",
            items=order_items
        )

        db.add(order)
        db.commit()
        db.refresh(order)

        # Registra log de auditoria
        log = OrderLog(
            order_id=order.id,
            old_status="NEW",
            new_status="SENT_TO_HORUS",
            note=f"Pedido E-book Pearson transmitido com sucesso ao Horus ERP. Pedido Horus #{horus_ped_venda} ({items_sent} itens)."
        )
        db.add(log)
        db.commit()

        return {
            "success": True,
            "order_id": order.id,
            "horus_pedido_venda": str(horus_ped_venda),
            "status": order.status,
            "reference": clean_ref,
            "total_liquido": total_liquido,
            "total_items": len(order_items),
            "message": f"Pedido transmitido e confirmado com sucesso no Horus ERP (#{horus_ped_venda})!"
        }
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        logger.error(f"[Ebook Pearson] Erro ao criar ou transmitir pedido de e-book: {exc}", exc_info=True)
        raise HTTPException(
            status_code=400,
            detail=f"Não foi possível gerar o pedido de E-book: {str(exc)}"
        )

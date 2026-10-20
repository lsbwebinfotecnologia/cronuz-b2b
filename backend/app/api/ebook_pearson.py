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
import re
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
    
    # Dados consultados via API Horus
    in_horus: bool = False
    horus_cod_item: Optional[str] = None
    horus_title: Optional[str] = None
    horus_cover_price: Optional[float] = None
    horus_stock: Optional[int] = None
    is_ebook: Optional[bool] = None  # True = E-book (EBOOK: 'S'), False = Livro Físico (EBOOK: 'N')
    api_message: Optional[str] = None


class PearsonPreviewResponse(BaseModel):
    success: bool
    filename: str
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


class LookupItemResponse(BaseModel):
    found: bool
    isbn: str
    horus_cod_item: Optional[str] = None
    horus_title: Optional[str] = None
    horus_cover_price: Optional[float] = None
    horus_stock: Optional[int] = None
    is_ebook: Optional[bool] = None
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
    reference: str = Field(..., description="Cód. Pedido Origem (ex: BV-407-10/2026)")
    target_received_total: float
    payment_condition: Optional[str] = "30 DDL"
    payment_method: Optional[str] = "Boleto"
    cod_forma: Optional[Any] = None
    obs_pedido: Optional[str] = "REPASSE E-BOOK BIBLIOTECA VIRTUAL PEARSON"
    skip_expedition: bool = True
    items: List[CreateEbookOrderItem]


def _clean_isbn(raw_val: Any) -> str:
    """
    Extrai o código exatamente como informado na planilha Pearson,
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
        "period": period,
        "receipt_month": receipt_month,
        "receipt_number": receipt_number,
        "suggested_reference": suggested_ref,
        "total_items": len(raw_items),
        "total_original_value": round(total_val, 2),
        "items": raw_items,
    }


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
        target_total = round(sum(float(it.get("original_value") or it.get("subtotal") or 0.0) for it in items), 2)
    else:
        target_total = round(float(target_total), 2)

    results = []

    # Passo 1: Determinar Q e Pu preliminar para cada item respeitando Capa
    for it in items:
        target_s = round(float(it.get("original_value") or it.get("subtotal") or 0.0), 2)
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
            q = max(1, int(it.get("quantity") or 1))
            pu = round(target_s / q, 2)

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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Recebe a planilha enviada pela Pearson (XLSX/CSV),
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

        filename = file.filename or "planilha_pearson.xlsx"
        parsed_data = _parse_pearson_workbook(content, filename)
        items = parsed_data["items"]

        if not items:
            raise HTTPException(
                status_code=400,
                detail="Nenhum item com ISBN válido foi encontrado na planilha Pearson informada."
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

        # Fallback complementar: catálogo local PostgreSQL para itens que não vieram do Horus
        raw_enriched = []
        for it in items:
            isbn = it["isbn"]
            hr = horus_map.get(isbn)
            if not hr:
                for k, v in horus_map.items():
                    if k == isbn or str(v.get("COD_BARRA_ITEM") or v.get("BARRAS_ISBN") or "") == isbn:
                        hr = v
                        break

            is_ebook = None
            if hr:
                in_horus = True
                horus_cod = str(hr.get("COD_ITEM") or hr.get("ID") or "")
                horus_title = str(hr.get("NOM_ITEM") or hr.get("NOME") or it["title_pearson"])
                cover_price = parse_horus_price(
                    hr.get("VLR_CAPA") or hr.get("PRECO") or hr.get("PRECO_TABELA") or hr.get("VALOR_CAPA") or 0.0
                )
                if cover_price <= 0.0:
                    cover_price = None
                stock = _safe_int(hr.get("SALDO_DISPONIVEL") or hr.get("QTD_ESTOQUE") or 0)
                
                # Validação de E-book vs Livro Físico (EBOOK: 'S' = E-book, 'N' = Físico)
                raw_ebook = str(hr.get("EBOOK") or "").strip().upper()
                nom_upper = horus_title.upper()
                if raw_ebook == "S" or "[E-BOOK]" in nom_upper or "[EBOOK]" in nom_upper:
                    is_ebook = True
                    api_msg = f"✓ Localizado na API Horus (Cód: {horus_cod})"
                elif raw_ebook == "N":
                    is_ebook = False
                    api_msg = f"⚠ Livro Físico no Horus (Cód: {horus_cod}) - Requer ISBN do E-book"
                else:
                    is_ebook = True
                    api_msg = f"✓ Localizado na API Horus (Cód: {horus_cod})"
            else:
                # Fallback para tabela de produtos do Cronuz
                prod = db.query(Product).filter(
                    Product.company_id == current_user.company_id,
                    (Product.ean_gtin == isbn) | (Product.sku == isbn)
                ).first()

                if prod:
                    in_horus = True
                    horus_cod = str(prod.sku or prod.id)
                    horus_title = prod.name
                    cover_price = parse_horus_price(prod.promotional_price or prod.base_price or 0.0)
                    if cover_price <= 0.0:
                        cover_price = None
                    stock = _safe_int(prod.stock_quantity or 0)
                    is_ebook = True
                    api_msg = f"✓ Catálogo Local Cronuz (Cód: {horus_cod})"
                else:
                    in_horus = False
                    horus_cod = None
                    horus_title = None
                    cover_price = None
                    stock = None
                    is_ebook = None
                    api_msg = "⚠ Não localizado na API Horus nem no catálogo"

            raw_enriched.append({
                "id": it["id"],
                "row": it["row"],
                "isbn": it["isbn"],
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
            })

        # Aplica Inteligência de Decomposição (Quantidade x Preço de Capa e Quebra em Q=1)
        decomposed = decompose_and_reconcile_items(raw_enriched, target_total=parsed_data["total_original_value"])

        enriched_items: List[PearsonItemPreview] = [
            PearsonItemPreview(
                id=d["id"],
                row=d["row"],
                isbn=d["isbn"],
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
        logger.error(f"[Ebook Pearson] Erro inesperado ao processar planilha: {exc}", exc_info=True)
        raise HTTPException(
            status_code=400,
            detail=f"Não foi possível processar a planilha da Pearson: {str(exc)}. Verifique o formato do arquivo."
        )


# ── Endpoint: Reconsulta Individual de Item no Horus / Catálogo ─────────────

@router.post("/lookup-item", response_model=LookupItemResponse)
async def lookup_single_item(
    payload: LookupItemRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Reconsulta um item individual diretamente no Horus (por ISBN ou Nome)
    ou no catálogo local, permitindo ajuste manual inline pelo usuário.
    """
    assert_company_ownership(current_user, current_user.company_id)
    clean_isbn = _clean_isbn(payload.isbn)
    clean_title = (payload.title or "").split(":")[0].strip()

    settings = db.query(CompanySettings).filter(
        CompanySettings.company_id == current_user.company_id
    ).first()

    hr_found = None

    if settings and settings.horus_enabled and settings.horus_url:
        search_client = HorusProductSearch(db=db, company_id=current_user.company_id)
        
        # Busca direta e estrita por ISBN
        if clean_isbn and len(clean_isbn) >= 9:
            try:
                res = await search_client.busca_acervo(term=clean_isbn, search_option="BARRAS_ISBN", limit=5)
                if res and isinstance(res, list) and len(res) > 0 and not res[0].get("Falha"):
                    hr_found = res[0]
            except Exception as _e:
                logger.debug(f"[Lookup Item] Busca por ISBN falhou: {_e}")

    if hr_found:
        horus_cod = str(hr_found.get("COD_ITEM") or hr_found.get("ID") or "")
        horus_title = str(hr_found.get("NOM_ITEM") or hr_found.get("NOME") or payload.title or clean_isbn)
        cover_price = parse_horus_price(
            hr_found.get("VLR_CAPA") or hr_found.get("PRECO") or hr_found.get("PRECO_TABELA") or hr_found.get("VALOR_CAPA") or 0.0
        )
        if cover_price <= 0.0:
            cover_price = None
        stock = _safe_int(hr_found.get("SALDO_DISPONIVEL") or hr_found.get("QTD_ESTOQUE") or 0)
        
        # Checagem E-book vs Físico
        raw_ebook = str(hr_found.get("EBOOK") or "").strip().upper()
        nom_upper = horus_title.upper()
        if raw_ebook == "S" or "[E-BOOK]" in nom_upper or "[EBOOK]" in nom_upper:
            is_ebook = True
            api_msg = f"✓ Localizado no Horus ERP (Cód: #{horus_cod})"
        elif raw_ebook == "N":
            is_ebook = False
            api_msg = f"⚠ Livro Físico no Horus (Cód: #{horus_cod}) - Requer ISBN do E-book"
        else:
            is_ebook = True
            api_msg = f"✓ Localizado no Horus ERP (Cód: #{horus_cod})"

        return LookupItemResponse(
            found=True,
            isbn=clean_isbn or payload.isbn,
            horus_cod_item=horus_cod,
            horus_title=horus_title,
            horus_cover_price=cover_price,
            horus_stock=stock,
            is_ebook=is_ebook,
            api_message=api_msg
        )

    # Fallback catálogo local Cronuz
    prod = None
    if clean_isbn:
        prod = db.query(Product).filter(
            Product.company_id == current_user.company_id,
            (Product.ean_gtin == clean_isbn) | (Product.sku == clean_isbn)
        ).first()

    if prod:
        horus_cod = str(prod.sku or prod.id)
        cover_price = parse_horus_price(prod.promotional_price or prod.base_price or 0.0)
        if cover_price <= 0.0:
            cover_price = None
        stock = _safe_int(prod.stock_quantity or 0)
        return LookupItemResponse(
            found=True,
            isbn=clean_isbn or payload.isbn,
            horus_cod_item=horus_cod,
            horus_title=prod.name,
            horus_cover_price=cover_price,
            horus_stock=stock,
            is_ebook=True,
            api_message=f"✓ Localizado no Catálogo Cronuz (Cód: #{horus_cod})"
        )

    return LookupItemResponse(
        found=False,
        isbn=clean_isbn or payload.isbn,
        horus_cod_item=None,
        horus_title=None,
        horus_cover_price=None,
        horus_stock=None,
        api_message="⚠ Não localizado no Horus ERP nem no catálogo local"
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

        # ── VALIDAÇÃO DE VALOR TOTAL RECEBIDO (PEARSON) ────────────────────────
        total_liquido_itens = round(sum(float(it.liquid_unit_price) * max(1, it.quantity) for it in payload.items), 2)
        if payload.target_received_total <= 0:
            raise HTTPException(
                status_code=400,
                detail="Obrigatório informar o Valor Total Recebido (Pearson) antes de gerar o pedido."
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
                    f"({physical_sample}). O repasse da Biblioteca Virtual Pearson é restrito exclusivamente a E-Books. "
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

            # Localiza se existe produto Cronuz vinculado ao ISBN
            prod = db.query(Product).filter(
                Product.company_id == current_user.company_id,
                (Product.ean_gtin == it.isbn) | (Product.sku == it.isbn)
            ).first()

            order_item = OrderItem(
                product_id=prod.id if prod else None,
                quantity=qty,
                quantity_requested=qty,
                unit_price=price,
                total_price=line_total,
                ean_isbn=it.isbn,
                sku=it.horus_cod_item or (prod.sku if prod else it.isbn),
                name=it.title or (prod.name if prod else f"E-book {it.isbn}"),
                brand="Pearson BV"
            )
            order_items.append(order_item)

        total_liquido = round(total_liquido, 2)
        clean_ref = str(payload.reference or f"BV-{datetime.now().strftime('%Y%m%d%H%M')}").strip()
        if clean_ref.startswith("BV-BV-"):
            clean_ref = clean_ref.replace("BV-BV-", "BV-")

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
        base_obs = (payload.obs_pedido or "PEDIDO E-BOOK PEARSON").strip()
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
        items_sent = 0
        items_failed = []
        for it in payload.items:
            clean_it_isbn = _clean_isbn(it.isbn) or it.isbn
            try:
                res_item = await horus_client.send_order_item(
                    id_doc=customer.document,
                    id_guid=customer.id_guid,
                    cnpj_destino=company.document,
                    cod_pedido_origem=clean_ref,
                    isbn=clean_it_isbn,
                    qty=max(1, it.quantity),
                    price=round(float(it.liquid_unit_price), 2)  # VLR_LIQUIDO exato
                )
                if res_item and isinstance(res_item, list) and len(res_item) > 0:
                    if res_item[0].get("Falha"):
                        items_failed.append(f"ISBN {clean_it_isbn}: {res_item[0].get('Mensagem', 'Erro no item')}")
                    else:
                        items_sent += 1
                else:
                    items_sent += 1
            except Exception as e_item:
                items_failed.append(f"ISBN {clean_it_isbn}: {str(e_item)}")

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

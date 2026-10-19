# -*- coding: utf-8 -*-
"""
Serviço de Exportação de Relatórios Financeiros de Fluxo de Caixa Previsto em Excel (.xlsx) e PDF (.pdf).
Suporta agrupamento por cliente/fornecedor com detalhes minuciosos das observações e composição de lançamentos agrupados.
"""

from io import BytesIO
from datetime import datetime
from typing import List, Optional, Any, Dict
import unicodedata

import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

from fpdf import FPDF


def _sanitize_text(text: Any) -> str:
    """Higieniza o texto para codificação compatível com o FPDF standard."""
    if text is None:
        return ""
    s = str(text)
    s = unicodedata.normalize('NFKD', s)
    return s.encode('latin-1', 'replace').decode('latin-1')


class FinancialPDFReport(FPDF):
    """Classe base para relatórios em PDF de Fluxo de Caixa."""

    def __init__(self, title: str, subtitle: str, company_name: str, orientation: str = "L"):
        super().__init__(orientation=orientation, unit="mm", format="A4")
        self.report_title = title
        self.report_subtitle = subtitle
        self.company_name = company_name

    def header(self):
        page_width = 297 if self.cur_orientation == "L" else 210
        self.set_fill_color(15, 23, 42)
        self.rect(0, 0, page_width, 18, 'F')
        
        self.set_xy(10, 4)
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(255, 255, 255)
        comp = _sanitize_text(f"CRONUZ B2B | {self.company_name}")
        self.cell(140, 6, comp, 0, 0, 'L')
        
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(203, 213, 225)
        now_str = datetime.now().strftime("%d/%m/%Y %H:%M")
        self.cell(page_width - 160, 6, f"Emitido em: {now_str}", 0, 1, 'R')

        self.set_xy(10, 10)
        self.set_font("Helvetica", "B", 8)
        self.set_text_color(52, 211, 153)
        self.cell(page_width - 20, 5, _sanitize_text(self.report_title.upper()), 0, 1, 'L')

        self.ln(7)

    def footer(self):
        page_width = 297 if self.cur_orientation == "L" else 210
        self.set_y(-12)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(148, 163, 184)
        page_str = f"Pagina {self.page_no()}"
        self.cell(0, 6, _sanitize_text(f"{self.report_subtitle}  -  {page_str}"), 0, 0, 'C')


def export_cashflow_forecast_excel(
    customer_groups: List[Dict[str, Any]],
    company_name: str,
    period_label: str = ""
) -> BytesIO:
    """Gera planilha Excel (.xlsx) de Fluxo de Caixa Previsto agrupado por cliente/contato."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Fluxo Previsto por Cliente"
    ws.views.sheetView[0].showGridLines = True

    font_title = Font(name="Calibri", size=14, bold=True, color="0F172A")
    font_subtitle = Font(name="Calibri", size=10, italic=True, color="64748B")
    font_header = Font(name="Calibri", size=9, bold=True, color="FFFFFF")
    fill_header = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    fill_cust_header = PatternFill(start_color="ECFDF5", end_color="ECFDF5", fill_type="solid")
    font_cust_header = Font(name="Calibri", size=11, bold=True, color="065F46")
    fill_zebra = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    font_data = Font(name="Calibri", size=9, color="0F172A")
    font_subtotal = Font(name="Calibri", size=9, bold=True, color="0F172A")
    fill_subtotal = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
    font_total = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
    fill_total = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")

    thin_border_side = Side(border_style="thin", color="CBD5E1")
    border_cell = Border(left=thin_border_side, right=thin_border_side, top=thin_border_side, bottom=thin_border_side)

    ws["A1"] = f"CRONUZ B2B — FLUXO DE CAIXA PREVISTO POR CLIENTE / FORNECEDOR"
    ws["A1"].font = font_title
    
    sub = f"Empresa: {company_name}"
    if period_label:
        sub += f" | Período Previsto: {period_label}"
    ws["A2"] = sub
    ws["A2"].font = font_subtitle

    headers = [
        "Nº Parcela", "Tipo", "Categoria", "Conta Prevista", "Vencimento",
        "Valor Previsto (R$)", "Status", "Descrição e Composição (Lançamentos Agrupados)"
    ]

    row_idx = 4
    grand_total_entradas = 0.0
    grand_total_saidas = 0.0
    grand_saldo_liquido = 0.0

    for group in customer_groups:
        cust_name = group.get("customer_name") or "Geral / Sem Cliente Definido"
        cust_doc = group.get("customer_document") or ""
        total_entradas = group.get("total_entradas", 0.0)
        total_saidas = group.get("total_saidas", 0.0)
        saldo_cliente = group.get("saldo_cliente", 0.0)

        grand_total_entradas += total_entradas
        grand_total_saidas += total_saidas
        grand_saldo_liquido += saldo_cliente

        # Cabeçalho do Cliente
        ws.merge_cells(start_row=row_idx, start_column=1, end_row=row_idx, end_column=len(headers))
        cust_cell = ws.cell(row=row_idx, column=1)
        doc_part = f" — CNPJ/CPF: {cust_doc}" if cust_doc else ""
        cust_cell.value = f"CONTATO / CLIENTE: {cust_name}{doc_part}"
        cust_cell.font = font_cust_header
        cust_cell.fill = fill_cust_header
        cust_cell.alignment = Alignment(vertical="center", indent=1)
        for col in range(1, len(headers) + 1):
            ws.cell(row=row_idx, column=col).border = border_cell
        row_idx += 1

        # Cabeçalhos de coluna
        for col_idx, h in enumerate(headers, 1):
            c = ws.cell(row=row_idx, column=col_idx, value=h)
            c.font = font_header
            c.fill = fill_header
            c.alignment = Alignment(horizontal="center" if col_idx in [1, 2, 5, 7] else ("right" if col_idx == 6 else "left"), vertical="center")
            c.border = border_cell
        row_idx += 1

        # Linhas de lançamentos
        items = group.get("items", [])
        for i_idx, item in enumerate(items):
            is_even = i_idx % 2 == 0
            row_fill = None if is_even else fill_zebra

            inst_num = f"#{item.get('id')}"
            tipo_desc = "ENTRADA" if item.get("type") == "RECEIVABLE" else "SAÍDA"
            cat_name = item.get("category_name") or "Sem Categoria"
            acc_name = item.get("account_name") or "Padrão"
            due_dt = item.get("due_date") or ""
            val = float(item.get("amount") or 0.0)
            status_desc = item.get("status") or "PENDENTE"
            obs = item.get("description") or ""

            cells_data = [
                (inst_num, "center"),
                (tipo_desc, "center"),
                (cat_name, "left"),
                (acc_name, "left"),
                (due_dt, "center"),
                (val, "right"),
                (status_desc, "center"),
                (obs, "left")
            ]

            for col_idx, (val_data, align) in enumerate(cells_data, 1):
                c = ws.cell(row=row_idx, column=col_idx, value=val_data)
                c.font = font_data
                if row_fill:
                    c.fill = row_fill
                c.border = border_cell
                c.alignment = Alignment(horizontal=align, vertical="center")
                if col_idx == 6:
                    c.number_format = '"R$ "#,##0.00'
                    if item.get("type") == "RECEIVABLE":
                        c.font = Font(name="Calibri", size=9, color="059669", bold=True)
                    else:
                        c.font = Font(name="Calibri", size=9, color="DC2626", bold=True)

            row_idx += 1

        # Linha de Subtotal do Cliente
        ws.cell(row=row_idx, column=1, value="SUBTOTAL CONTATO:").font = font_subtotal
        ws.cell(row=row_idx, column=1).alignment = Alignment(horizontal="right")
        ws.merge_cells(start_row=row_idx, start_column=1, end_row=row_idx, end_column=5)

        c_val = ws.cell(row=row_idx, column=6, value=saldo_cliente)
        c_val.font = font_subtotal
        c_val.number_format = '"R$ "#,##0.00'
        c_val.alignment = Alignment(horizontal="right")

        ws.cell(row=row_idx, column=7, value=f"Entradas: R$ {total_entradas:,.2f} | Saídas: R$ {total_saidas:,.2f}").font = font_subtitle
        ws.merge_cells(start_row=row_idx, start_column=7, end_row=row_idx, end_column=len(headers))

        for col in range(1, len(headers) + 1):
            ws.cell(row=row_idx, column=col).border = border_cell
            ws.cell(row=row_idx, column=col).fill = fill_subtotal

        row_idx += 2

    # Linha de Total Geral da Projeção
    ws.merge_cells(start_row=row_idx, start_column=1, end_row=row_idx, end_column=5)
    c_tot_label = ws.cell(row=row_idx, column=1, value="SALDO LÍQUIDO PREVISTO TOTAL:")
    c_tot_label.font = font_total
    c_tot_label.alignment = Alignment(horizontal="right", vertical="center")
    
    c_tot_val = ws.cell(row=row_idx, column=6, value=grand_saldo_liquido)
    c_tot_val.font = font_total
    c_tot_val.number_format = '"R$ "#,##0.00'
    c_tot_val.alignment = Alignment(horizontal="right", vertical="center")

    ws.merge_cells(start_row=row_idx, start_column=7, end_row=row_idx, end_column=len(headers))
    c_tot_extra = ws.cell(row=row_idx, column=7, value=f"Total Entradas Previstas: R$ {grand_total_entradas:,.2f} | Total Saídas Previstas: R$ {grand_total_saidas:,.2f}")
    c_tot_extra.font = font_total
    c_tot_extra.alignment = Alignment(horizontal="left", vertical="center")

    for col in range(1, len(headers) + 1):
        c = ws.cell(row=row_idx, column=col)
        c.fill = fill_total
        c.border = border_cell

    # Larguras
    col_widths = {1: 12, 2: 12, 3: 24, 4: 20, 5: 14, 6: 18, 7: 14, 8: 55}
    for col_idx, width in col_widths.items():
        col_letter = get_column_letter(col_idx)
        ws.column_dimensions[col_letter].width = width

    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer


def export_cashflow_forecast_pdf(
    customer_groups: List[Dict[str, Any]],
    company_name: str,
    period_label: str = ""
) -> BytesIO:
    """Gera relatório em PDF de Fluxo de Caixa Previsto com layout financeiro executivo."""
    pdf = FinancialPDFReport(
        title="Projeção de Fluxo de Caixa por Cliente / Fornecedor",
        subtitle=f"Período: {period_label}" if period_label else "Todos os Lançamentos Previstos",
        company_name=company_name,
        orientation="L"
    )
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    grand_total_entradas = 0.0
    grand_total_saidas = 0.0
    grand_saldo_liquido = 0.0

    col_widths = [16, 18, 38, 30, 22, 26, 22, 95]

    for group in customer_groups:
        cust_name = group.get("customer_name") or "Geral / Sem Cliente Definido"
        cust_doc = group.get("customer_document") or ""
        total_entradas = group.get("total_entradas", 0.0)
        total_saidas = group.get("total_saidas", 0.0)
        saldo_cliente = group.get("saldo_cliente", 0.0)

        grand_total_entradas += total_entradas
        grand_total_saidas += total_saidas
        grand_saldo_liquido += saldo_cliente

        # Cabeçalho do Cliente
        pdf.set_fill_color(236, 253, 245)
        pdf.set_text_color(6, 95, 70)
        pdf.set_font("Helvetica", "B", 9)
        doc_part = f" (CNPJ/CPF: {cust_doc})" if cust_doc else ""
        pdf.cell(sum(col_widths), 6.5, _sanitize_text(f" CONTATO: {cust_name}{doc_part}"), border=1, ln=1, fill=True)

        # Cabeçalho de colunas
        pdf.set_fill_color(30, 41, 59)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Helvetica", "B", 7.5)
        headers = ["Nº Parc.", "Tipo", "Categoria", "Conta", "Vencimento", "Valor (R$)", "Status", "Descrição e Composição"]
        for idx, (h, w) in enumerate(zip(headers, col_widths)):
            align = "C" if idx in [0, 1, 4, 6] else ("R" if idx == 5 else "L")
            pdf.cell(w, 5.5, _sanitize_text(h), border=1, align=align, fill=True)
        pdf.ln()

        # Linhas de lançamentos
        items = group.get("items", [])
        pdf.set_font("Helvetica", "", 7.5)
        for i_idx, item in enumerate(items):
            if i_idx % 2 == 1:
                pdf.set_fill_color(248, 250, 252)
                fill = True
            else:
                fill = False

            pdf.set_text_color(15, 23, 42)
            inst_num = f"#{item.get('id')}"
            tipo = "RECEITA" if item.get("type") == "RECEIVABLE" else "DESPESA"
            cat_name = item.get("category_name") or "Sem Categoria"
            if len(cat_name) > 22:
                cat_name = cat_name[:20] + ".."
            acc_name = item.get("account_name") or "Padrão"
            if len(acc_name) > 18:
                acc_name = acc_name[:16] + ".."
            due_dt = item.get("due_date") or ""
            val_str = f"{float(item.get('amount') or 0.0):,.2f}"
            status_desc = item.get("status") or "PENDENTE"
            obs = item.get("description") or ""
            if len(obs) > 60:
                obs = obs[:58] + ".."

            row_data = [inst_num, tipo, cat_name, acc_name, due_dt, val_str, status_desc, obs]
            for idx, (val, w) in enumerate(zip(row_data, col_widths)):
                align = "C" if idx in [0, 1, 4, 6] else ("R" if idx == 5 else "L")
                # Cor do valor
                if idx == 5:
                    if item.get("type") == "RECEIVABLE":
                        pdf.set_text_color(5, 150, 105)
                    else:
                        pdf.set_text_color(220, 38, 38)
                else:
                    pdf.set_text_color(15, 23, 42)
                pdf.cell(w, 5, _sanitize_text(val), border=1, align=align, fill=fill)
            pdf.ln()

        # Subtotal do Contato
        pdf.set_fill_color(241, 245, 249)
        pdf.set_font("Helvetica", "B", 7.5)
        pdf.set_text_color(30, 41, 59)
        pdf.cell(sum(col_widths[:5]), 5.5, _sanitize_text(f"Subtotal: Entradas R$ {total_entradas:,.2f} | Saídas R$ {total_saidas:,.2f}"), border=1, align="R", fill=True)
        pdf.cell(col_widths[5], 5.5, f"R$ {saldo_cliente:,.2f}", border=1, align="R", fill=True)
        pdf.cell(sum(col_widths[6:]), 5.5, "", border=1, fill=True)
        pdf.ln(7)

    # Total Geral
    pdf.set_fill_color(15, 23, 42)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 8.5)
    pdf.cell(sum(col_widths[:5]), 6.5, _sanitize_text(f"TOTAL PREVISTO (Entradas: R$ {grand_total_entradas:,.2f} | Saídas: R$ {grand_total_saidas:,.2f})"), border=1, align="R", fill=True)
    pdf.cell(col_widths[5], 6.5, f"R$ {grand_saldo_liquido:,.2f}", border=1, align="R", fill=True)
    pdf.cell(sum(col_widths[6:]), 6.5, "", border=1, fill=True)

    buffer = BytesIO()
    out = pdf.output()
    pdf_bytes = bytes(out) if not isinstance(out, (bytes, bytearray)) else bytes(out)
    buffer.write(pdf_bytes)
    buffer.seek(0)
    return buffer


def export_synthetic_overview_excel(
    data: Dict[str, Any],
    model: str,
    company_name: str,
    subtitle: str = ""
) -> BytesIO:
    """
    Gera planilha Excel (.xlsx) para os 3 modelos do Relatório Sintético Administrativo:
    - executive_360: Multi-abas (Resumo & Tempo, Categorias, Ranking Clientes, Ranking Fornecedores)
    - category_matrix: Matriz Sintética Categorias x Período (Ano/Mês/Dia)
    - abc_ranking: Ranking Curva ABC Completo (Clientes e Fornecedores)
    """
    wb = openpyxl.Workbook()
    # Remove default sheet after creating custom sheets
    default_ws = wb.active

    font_title = Font(name="Calibri", size=14, bold=True, color="0F172A")
    font_sub = Font(name="Calibri", size=10, italic=True, color="475569")
    font_header = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
    font_section = Font(name="Calibri", size=11, bold=True, color="0F172A")
    font_cell = Font(name="Calibri", size=10, color="1E293B")
    font_bold = Font(name="Calibri", size=10, bold=True, color="0F172A")
    font_green = Font(name="Calibri", size=10, bold=True, color="059669")
    font_red = Font(name="Calibri", size=10, bold=True, color="DC2626")

    fill_header_dark = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
    fill_header_green = PatternFill(start_color="065F46", end_color="065F46", fill_type="solid")
    fill_header_red = PatternFill(start_color="991B1B", end_color="991B1B", fill_type="solid")
    fill_zebra = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    fill_total = PatternFill(start_color="E2E8F0", end_color="E2E8F0", fill_type="solid")

    thin_side = Side(style='thin', color='CBD5E1')
    border_cell = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)

    kpis = data.get("kpis", {})
    timeline = data.get("timeline", [])
    cats_pay = data.get("categories_payable", [])
    cats_rec = data.get("categories_receivable", [])
    rank_rec = data.get("ranking_receivables", [])
    rank_pay = data.get("ranking_payables", [])
    period_cols = data.get("period_columns", [])

    def _style_sheet_header(ws, title_str: str):
        ws.views.sheetView[0].showGridLines = True
        ws["A1"] = f"CRONUZ B2B - {title_str.upper()} ({company_name})"
        ws["A1"].font = font_title
        ws["A2"] = f"{subtitle}  |  Gerado em: {datetime.now().strftime('%d/%m/%Y %H:%M')}"
        ws["A2"].font = font_sub

    def _build_timeline_and_kpis_sheet(ws):
        _style_sheet_header(ws, "Resumo Executivo & Evolução Temporal")
        # Bloco KPIs
        ws["A4"] = "INDICADORES EXECUTIVOS DO PERÍODO"
        ws["A4"].font = font_section

        kpi_rows = [
            ("Total Recebido (Entradas)", float(kpis.get("total_received") or 0.0), kpis.get("received_count") or 0, float(kpis.get("avg_ticket_received") or 0.0)),
            ("Total Pago (Saídas)", float(kpis.get("total_paid") or 0.0), kpis.get("paid_count") or 0, float(kpis.get("avg_ticket_paid") or 0.0)),
            ("Resultado Líquido de Caixa", float(kpis.get("net_cashflow") or 0.0), "-", float(kpis.get("cash_margin_pct") or 0.0) / 100.0)
        ]
        headers_kpi = ["Indicador", "Valor Total (R$)", "Qtd. Baixas/Títulos", "Ticket Médio / Margem"]
        for c_idx, h in enumerate(headers_kpi, start=1):
            c = ws.cell(row=5, column=c_idx, value=h)
            c.font = font_header
            c.fill = fill_header_dark
            c.border = border_cell

        for r_offset, (lbl, val, cnt, avg_or_m) in enumerate(kpi_rows, start=6):
            c1 = ws.cell(row=r_offset, column=1, value=lbl)
            c2 = ws.cell(row=r_offset, column=2, value=val)
            c3 = ws.cell(row=r_offset, column=3, value=cnt)
            c4 = ws.cell(row=r_offset, column=4, value=avg_or_m)
            c1.font = font_bold
            c2.font = font_green if (r_offset == 6 or (r_offset == 8 and val >= 0)) else font_red
            c2.number_format = 'R$ #,##0.00'
            c3.alignment = Alignment(horizontal="center")
            if r_offset == 8:
                c4.number_format = '0.0%'
            else:
                c4.number_format = 'R$ #,##0.00'
            for col_i in range(1, 5):
                ws.cell(row=r_offset, column=col_i).border = border_cell

        # Evolução Temporal
        row = 10
        ws.cell(row=row, column=1, value="EVOLUÇÃO POR PERÍODO (ANO / MÊS / DIA)").font = font_section
        row += 1
        t_headers = ["Período", "Qtd. Entradas", "Recebimentos (R$)", "Qtd. Saídas", "Pagamentos (R$)", "Resultado do Período (R$)", "Saldo Acumulado (R$)", "% Margem"]
        for c_idx, h in enumerate(t_headers, start=1):
            cell = ws.cell(row=row, column=c_idx, value=h)
            cell.font = font_header
            cell.fill = fill_header_dark
            cell.alignment = Alignment(horizontal="center" if c_idx in (1, 2, 4, 8) else "right")
            cell.border = border_cell
        row += 1

        for idx, t in enumerate(timeline):
            vals = [
                t.get("period_label"),
                t.get("receivables_count", 0),
                float(t.get("receivables", 0.0)),
                t.get("payables_count", 0),
                float(t.get("payables", 0.0)),
                float(t.get("net_result", 0.0)),
                float(t.get("cumulative_balance", 0.0)),
                float(t.get("margin_pct", 0.0)) / 100.0
            ]
            for c_idx, v in enumerate(vals, start=1):
                cell = ws.cell(row=row, column=c_idx, value=v)
                cell.font = font_cell
                cell.border = border_cell
                if idx % 2 == 1:
                    cell.fill = fill_zebra
                if c_idx in (3, 5, 6, 7):
                    cell.number_format = 'R$ #,##0.00'
                    if c_idx == 3:
                        cell.font = font_green
                    elif c_idx == 5:
                        cell.font = font_red
                    elif c_idx == 6:
                        cell.font = font_green if v >= 0 else font_red
                elif c_idx == 8:
                    cell.number_format = '0.0%'
                    cell.alignment = Alignment(horizontal="right")
                elif c_idx in (1, 2, 4):
                    cell.alignment = Alignment(horizontal="center")
            row += 1

        for col_i, w in enumerate([22, 16, 22, 16, 22, 24, 24, 14], start=1):
            ws.column_dimensions[get_column_letter(col_i)].width = w

    def _build_categories_synthetic_sheet(ws):
        _style_sheet_header(ws, "Relatório Sintético por Categoria (Pagamentos e Recebimentos)")
        row = 4
        ws.cell(row=row, column=1, value="1. O QUE JÁ PAGUEI / DESPESAS POR CATEGORIA").font = font_section
        row += 1
        c_headers = ["#", "Categoria / Subcategoria", "Grupo DRE", "Qtd. Lançamentos", "Total Pago (R$)", "% Sobre Saídas", "Média por Período (R$)", "Principais Fornecedores / Favorecidos"]
        for c_idx, h in enumerate(c_headers, start=1):
            cell = ws.cell(row=row, column=c_idx, value=h)
            cell.font = font_header
            cell.fill = fill_header_red
            cell.border = border_cell
        row += 1

        for idx, c in enumerate(cats_pay, start=1):
            top_e = ", ".join([f"{e['name']} (R$ {e['total']:,.2f})" for e in c.get("top_entities", [])[:3]])
            vals = [
                idx,
                c.get("category_name"),
                c.get("dre_group") or "-",
                c.get("count", 0),
                float(c.get("total", 0.0)),
                float(c.get("share_pct", 0.0)) / 100.0,
                float(c.get("avg_per_period", 0.0)),
                top_e
            ]
            for c_idx, v in enumerate(vals, start=1):
                cell = ws.cell(row=row, column=c_idx, value=v)
                cell.font = font_bold if c_idx == 5 else font_cell
                cell.border = border_cell
                if idx % 2 == 0:
                    cell.fill = fill_zebra
                if c_idx in (5, 7):
                    cell.number_format = 'R$ #,##0.00'
                elif c_idx == 6:
                    cell.number_format = '0.00%'
                elif c_idx in (1, 4):
                    cell.alignment = Alignment(horizontal="center")
            row += 1

        row += 2
        ws.cell(row=row, column=1, value="2. O QUE JÁ RECEBI / RECEITAS POR CATEGORIA").font = font_section
        row += 1
        r_headers = ["#", "Categoria / Subcategoria", "Grupo DRE", "Qtd. Lançamentos", "Total Recebido (R$)", "% Sobre Entradas", "Média por Período (R$)", "Principais Clientes Pagadores"]
        for c_idx, h in enumerate(r_headers, start=1):
            cell = ws.cell(row=row, column=c_idx, value=h)
            cell.font = font_header
            cell.fill = fill_header_green
            cell.border = border_cell
        row += 1

        for idx, c in enumerate(cats_rec, start=1):
            top_e = ", ".join([f"{e['name']} (R$ {e['total']:,.2f})" for e in c.get("top_entities", [])[:3]])
            vals = [
                idx,
                c.get("category_name"),
                c.get("dre_group") or "-",
                c.get("count", 0),
                float(c.get("total", 0.0)),
                float(c.get("share_pct", 0.0)) / 100.0,
                float(c.get("avg_per_period", 0.0)),
                top_e
            ]
            for c_idx, v in enumerate(vals, start=1):
                cell = ws.cell(row=row, column=c_idx, value=v)
                cell.font = font_bold if c_idx == 5 else font_cell
                cell.border = border_cell
                if idx % 2 == 0:
                    cell.fill = fill_zebra
                if c_idx in (5, 7):
                    cell.number_format = 'R$ #,##0.00'
                elif c_idx == 6:
                    cell.number_format = '0.00%'
                elif c_idx in (1, 4):
                    cell.alignment = Alignment(horizontal="center")
            row += 1

        for col_i, w in enumerate([6, 38, 22, 16, 20, 16, 20, 55], start=1):
            ws.column_dimensions[get_column_letter(col_i)].width = w

    def _build_category_matrix_sheet(ws):
        _style_sheet_header(ws, "Matriz Sintética de Categorias x Período")
        row = 4
        for section_title, cats_list, fill_hdr, grand_tot in [
            ("MATRIZ DE PAGAMENTOS (SAÍDAS) POR CATEGORIA", cats_pay, fill_header_red, float(kpis.get("total_paid") or 0.0)),
            ("MATRIZ DE RECEBIMENTOS (ENTRADAS) POR CATEGORIA", cats_rec, fill_header_green, float(kpis.get("total_received") or 0.0))
        ]:
            ws.cell(row=row, column=1, value=section_title).font = font_section
            row += 1
            headers = ["Categoria / Subcategoria"] + [p["label"] for p in period_cols] + ["Total Geral (R$)", "% Vertical"]
            for c_idx, h in enumerate(headers, start=1):
                cell = ws.cell(row=row, column=c_idx, value=h)
                cell.font = font_header
                cell.fill = fill_hdr
                cell.border = border_cell
                cell.alignment = Alignment(horizontal="left" if c_idx == 1 else "right")
            row += 1

            for idx, c in enumerate(cats_list):
                ws.cell(row=row, column=1, value=c.get("category_name")).border = border_cell
                ws.cell(row=row, column=1).font = font_bold
                by_p = c.get("by_period", {})
                for p_idx, p in enumerate(period_cols, start=2):
                    val = float(by_p.get(p["key"], 0.0))
                    cell = ws.cell(row=row, column=p_idx, value=val)
                    cell.number_format = 'R$ #,##0.00'
                    cell.font = font_cell
                    cell.border = border_cell
                tot_col = len(period_cols) + 2
                c_tot = ws.cell(row=row, column=tot_col, value=float(c.get("total", 0.0)))
                c_tot.number_format = 'R$ #,##0.00'
                c_tot.font = font_bold
                c_tot.border = border_cell

                c_pct = ws.cell(row=row, column=tot_col + 1, value=float(c.get("share_pct", 0.0)) / 100.0)
                c_pct.number_format = '0.00%'
                c_pct.font = font_cell
                c_pct.border = border_cell
                row += 1

            # Linha Total
            ws.cell(row=row, column=1, value="TOTAL DO GRUPO").font = font_bold
            ws.cell(row=row, column=1).fill = fill_total
            ws.cell(row=row, column=1).border = border_cell
            for p_idx, p in enumerate(period_cols, start=2):
                col_sum = sum(float(c.get("by_period", {}).get(p["key"], 0.0)) for c in cats_list)
                c_s = ws.cell(row=row, column=p_idx, value=col_sum)
                c_s.number_format = 'R$ #,##0.00'
                c_s.font = font_bold
                c_s.fill = fill_total
                c_s.border = border_cell
            tot_col = len(period_cols) + 2
            c_gt = ws.cell(row=row, column=tot_col, value=grand_tot)
            c_gt.number_format = 'R$ #,##0.00'
            c_gt.font = font_bold
            c_gt.fill = fill_total
            c_gt.border = border_cell
            c_gp = ws.cell(row=row, column=tot_col + 1, value=1.0 if grand_tot > 0 else 0.0)
            c_gp.number_format = '0.00%'
            c_gp.font = font_bold
            c_gp.fill = fill_total
            c_gp.border = border_cell
            row += 3

        ws.column_dimensions["A"].width = 38
        for col_i in range(2, len(period_cols) + 4):
            ws.column_dimensions[get_column_letter(col_i)].width = 18

    def _build_ranking_sheet(ws, title_str: str, items: list, is_receivable: bool):
        _style_sheet_header(ws, title_str)
        row = 4
        headers = [
            "Posição",
            "Cliente / Pagador" if is_receivable else "Fornecedor / Favorecido",
            "CNPJ / CPF",
            "Categoria Principal",
            "Qtd. Títulos",
            "Total Realizado (R$)" if is_receivable else "Total Pago (R$)",
            "Ticket Médio (R$)",
            "% Participação",
            "% Acumulado",
            "Curva ABC",
            "Último Movimento"
        ]
        hdr_fill = fill_header_green if is_receivable else fill_header_red
        for c_idx, h in enumerate(headers, start=1):
            cell = ws.cell(row=row, column=c_idx, value=h)
            cell.font = font_header
            cell.fill = hdr_fill
            cell.border = border_cell
            cell.alignment = Alignment(horizontal="center" if c_idx in (1, 3, 5, 10, 11) else ("right" if c_idx in (6, 7, 8, 9) else "left"))
        row += 1

        for idx, item in enumerate(items):
            vals = [
                f"#{item.get('rank')}",
                item.get("entity_name"),
                item.get("document") or "-",
                item.get("main_category"),
                item.get("count", 0),
                float(item.get("total", 0.0)),
                float(item.get("avg_ticket", 0.0)),
                float(item.get("share_pct", 0.0)) / 100.0,
                float(item.get("cumulative_pct", 0.0)) / 100.0,
                f"Classe {item.get('abc_class')}",
                item.get("last_date") or "-"
            ]
            for c_idx, v in enumerate(vals, start=1):
                cell = ws.cell(row=row, column=c_idx, value=v)
                cell.border = border_cell
                cell.font = (font_green if is_receivable else font_red) if c_idx == 6 else (font_bold if c_idx in (1, 2, 10) else font_cell)
                if idx % 2 == 1:
                    cell.fill = fill_zebra
                if c_idx in (6, 7):
                    cell.number_format = 'R$ #,##0.00'
                elif c_idx in (8, 9):
                    cell.number_format = '0.00%'
                elif c_idx in (1, 3, 5, 10, 11):
                    cell.alignment = Alignment(horizontal="center")
            row += 1

        for col_i, w in enumerate([10, 40, 20, 30, 14, 20, 18, 16, 16, 14, 16], start=1):
            ws.column_dimensions[get_column_letter(col_i)].width = w

    if model == "category_matrix":
        ws_mat = wb.create_sheet(title="Matriz Categorias x Tempo")
        _build_category_matrix_sheet(ws_mat)
        ws_cat = wb.create_sheet(title="Sintético por Categoria")
        _build_categories_synthetic_sheet(ws_cat)
    elif model == "abc_ranking":
        ws_pay = wb.create_sheet(title="Ranking Quem Mais Pago")
        _build_ranking_sheet(ws_pay, "Ranking Curva ABC - Para Quem Mais Pago (Fornecedores/Favorecidos)", rank_pay, False)
        ws_rec = wb.create_sheet(title="Ranking Quem Mais Recebo")
        _build_ranking_sheet(ws_rec, "Ranking Curva ABC - De Quem Mais Recebo (Clientes)", rank_rec, True)
    else:
        # executive_360 (4 abas completas)
        ws1 = wb.create_sheet(title="1. Resumo & Evolução")
        _build_timeline_and_kpis_sheet(ws1)
        ws2 = wb.create_sheet(title="2. Sintético Categorias")
        _build_categories_synthetic_sheet(ws2)
        ws3 = wb.create_sheet(title="3. Ranking Pagamentos")
        _build_ranking_sheet(ws3, "Ranking Curva ABC - Para Quem Mais Pago", rank_pay, False)
        ws4 = wb.create_sheet(title="4. Ranking Recebimentos")
        _build_ranking_sheet(ws4, "Ranking Curva ABC - De Quem Mais Recebo", rank_rec, True)
        ws5 = wb.create_sheet(title="5. Matriz Categorias")
        _build_category_matrix_sheet(ws5)

    wb.remove(default_ws)
    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer


def export_synthetic_overview_pdf(
    data: Dict[str, Any],
    model: str,
    company_name: str,
    subtitle: str = ""
) -> BytesIO:
    """
    Gera PDF executivo em Paisagem (A4 Landscape) para os 3 modelos administrativos:
    - executive_360: Visão 360° (KPIs + Evolução Temporal + Categorias + Rankings Top 15)
    - category_matrix: Sintético & Matriz de Categorias (Pagamentos e Recebimentos)
    - abc_ranking: Rankings Curva ABC (Quem Mais Pago e Quem Mais Recebo)
    """
    model_titles = {
        "executive_360": "Relatório Administrativo 360° - Recebimentos, Pagamentos e Rankings",
        "category_matrix": "Relatório Sintético por Categorias e Matriz Temporal",
        "abc_ranking": "Ranking Curva ABC - Maiores Recebimentos e Maiores Pagamentos"
    }
    pdf = FinancialPDFReport(
        title=model_titles.get(model, "Relatório Financeiro Sintético"),
        subtitle=subtitle or "Análise Gerencial",
        company_name=company_name,
        orientation="L"
    )
    pdf.set_auto_page_break(auto=True, margin=14)
    pdf.add_page()

    kpis = data.get("kpis", {})
    timeline = data.get("timeline", [])
    cats_pay = data.get("categories_payable", [])
    cats_rec = data.get("categories_receivable", [])
    rank_rec = data.get("ranking_receivables", [])
    rank_pay = data.get("ranking_payables", [])
    period_cols = data.get("period_columns", [])

    total_rec = float(kpis.get("total_received") or 0.0)
    total_pay = float(kpis.get("total_paid") or 0.0)
    net_cash = float(kpis.get("net_cashflow") or 0.0)

    # Banner KPIs no topo
    pdf.set_fill_color(241, 245, 249)
    pdf.set_draw_color(203, 213, 225)
    pdf.rect(10, pdf.get_y(), 277, 14, 'DF')
    pdf.set_xy(14, pdf.get_y() + 2)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(71, 85, 105)
    pdf.cell(68, 4, _sanitize_text("TOTAL RECEBIDO (ENTRADAS)"), 0, 0, 'L')
    pdf.cell(68, 4, _sanitize_text("TOTAL PAGO (SAÍDAS)"), 0, 0, 'L')
    pdf.cell(72, 4, _sanitize_text("GERAÇÃO LÍQUIDA DE CAIXA"), 0, 0, 'L')
    pdf.cell(65, 4, _sanitize_text("COMPROMETIMENTO / MARGEM"), 0, 1, 'L')

    pdf.set_x(14)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(5, 150, 105)
    pdf.cell(68, 6, f"R$ {total_rec:,.2f} ({kpis.get('received_count', 0)} tit.)", 0, 0, 'L')
    pdf.set_text_color(220, 38, 38)
    pdf.cell(68, 6, f"R$ {total_pay:,.2f} ({kpis.get('paid_count', 0)} tit.)", 0, 0, 'L')
    if net_cash >= 0:
        pdf.set_text_color(5, 150, 105)
    else:
        pdf.set_text_color(220, 38, 38)
    pdf.cell(72, 6, f"R$ {net_cash:,.2f}", 0, 0, 'L')
    pdf.set_text_color(15, 23, 42)
    pdf.cell(65, 6, _sanitize_text(f"Saídas: {kpis.get('expense_commitment_pct', 0)}% | Margem: {kpis.get('cash_margin_pct', 0)}%"), 0, 1, 'L')
    pdf.ln(5)

    def _render_timeline_pdf():
        if not timeline:
            return
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(0, 6, _sanitize_text("1. EVOLUÇÃO TEMPORAL AGRUPADA (ANO / MÊS / DIA)"), 0, 1, 'L')

        widths = [38, 28, 45, 28, 45, 45, 48]
        headers = ["Período", "Qtd. Entradas", "Recebimentos (R$)", "Qtd. Saídas", "Pagamentos (R$)", "Resultado (R$)", "Saldo Acumulado (R$)"]
        pdf.set_fill_color(15, 23, 42)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Helvetica", "B", 7.5)
        for idx, (h, w) in enumerate(zip(headers, widths)):
            pdf.cell(w, 5.5, _sanitize_text(h), border=1, align="C" if idx in (0, 1, 3) else "R", fill=True)
        pdf.ln()

        pdf.set_font("Helvetica", "", 7.5)
        for i_idx, t in enumerate(timeline):
            fill = i_idx % 2 == 1
            if fill:
                pdf.set_fill_color(248, 250, 252)
            row_vals = [
                str(t.get("period_label") or ""),
                str(t.get("receivables_count", 0)),
                f"R$ {float(t.get('receivables', 0.0)):,.2f}",
                str(t.get("payables_count", 0)),
                f"R$ {float(t.get('payables', 0.0)):,.2f}",
                f"R$ {float(t.get('net_result', 0.0)):,.2f}",
                f"R$ {float(t.get('cumulative_balance', 0.0)):,.2f}"
            ]
            for c_i, (v, w) in enumerate(zip(row_vals, widths)):
                if c_i == 2:
                    pdf.set_text_color(5, 150, 105)
                elif c_i == 4:
                    pdf.set_text_color(220, 38, 38)
                elif c_i == 5:
                    pdf.set_text_color(5, 150, 105) if float(t.get("net_result", 0.0)) >= 0 else pdf.set_text_color(220, 38, 38)
                else:
                    pdf.set_text_color(15, 23, 42)
                pdf.cell(w, 5, _sanitize_text(v), border=1, align="C" if c_i in (0, 1, 3) else "R", fill=fill)
            pdf.ln()
        pdf.ln(4)

    def _render_categories_pdf():
        for sec_title, c_list, is_rec in [
            ("SINTÉTICO POR CATEGORIA - O QUE JÁ PAGUEI (SAÍDAS)", cats_pay, False),
            ("SINTÉTICO POR CATEGORIA - O QUE JÁ RECEBI (ENTRADAS)", cats_rec, True)
        ]:
            if not c_list:
                continue
            if pdf.get_y() > 165:
                pdf.add_page()
            pdf.set_font("Helvetica", "B", 9)
            pdf.set_text_color(15, 23, 42)
            pdf.cell(0, 6, _sanitize_text(sec_title), 0, 1, 'L')

            widths = [12, 85, 22, 38, 25, 35, 60]
            headers = ["#", "Categoria / Subcategoria", "Qtd.", "Valor Total (R$)", "% Share", "Média/Período", "Principais Favorecidos / Clientes"]
            if is_rec:
                pdf.set_fill_color(6, 95, 70)
            else:
                pdf.set_fill_color(153, 27, 27)
            pdf.set_text_color(255, 255, 255)
            pdf.set_font("Helvetica", "B", 7.5)
            for idx, (h, w) in enumerate(zip(headers, widths)):
                pdf.cell(w, 5.5, _sanitize_text(h), border=1, align="C" if idx in (0, 2, 4) else ("R" if idx in (3, 5) else "L"), fill=True)
            pdf.ln()

            pdf.set_font("Helvetica", "", 7.5)
            for idx, c in enumerate(c_list, start=1):
                fill = idx % 2 == 0
                if fill:
                    pdf.set_fill_color(248, 250, 252)
                top_e = ", ".join([f"{e['name']}" for e in c.get("top_entities", [])[:2]])
                if len(top_e) > 36:
                    top_e = top_e[:34] + ".."
                cname = c.get("category_name") or ""
                if len(cname) > 48:
                    cname = cname[:46] + ".."
                vals = [
                    str(idx),
                    cname,
                    str(c.get("count", 0)),
                    f"R$ {float(c.get('total', 0.0)):,.2f}",
                    f"{float(c.get('share_pct', 0.0)):.2f}%",
                    f"R$ {float(c.get('avg_per_period', 0.0)):,.2f}",
                    top_e
                ]
                for c_i, (v, w) in enumerate(zip(vals, widths)):
                    pdf.set_text_color(15, 23, 42)
                    pdf.cell(w, 5, _sanitize_text(v), border=1, align="C" if c_i in (0, 2, 4) else ("R" if c_i in (3, 5) else "L"), fill=fill)
                pdf.ln()
            pdf.ln(4)

    def _render_rankings_pdf(limit_rows: int = 50):
        for sec_title, r_list, is_rec in [
            ("RANKING CURVA ABC - PARA QUEM MAIS PAGO (FORNECEDORES / FAVORECIDOS)", rank_pay[:limit_rows], False),
            ("RANKING CURVA ABC - DE QUEM MAIS RECEBO (CLIENTES)", rank_rec[:limit_rows], True)
        ]:
            if not r_list:
                continue
            if pdf.get_y() > 160:
                pdf.add_page()
            pdf.set_font("Helvetica", "B", 9)
            pdf.set_text_color(15, 23, 42)
            pdf.cell(0, 6, _sanitize_text(sec_title), 0, 1, 'L')

            widths = [14, 78, 34, 52, 16, 34, 18, 16, 15]
            headers = ["Pos.", "Nome / Razão Social", "CNPJ / CPF", "Categoria Principal", "Qtd.", "Total (R$)", "% Share", "% Acum.", "ABC"]
            if is_rec:
                pdf.set_fill_color(6, 95, 70)
            else:
                pdf.set_fill_color(153, 27, 27)
            pdf.set_text_color(255, 255, 255)
            pdf.set_font("Helvetica", "B", 7.5)
            for idx, (h, w) in enumerate(zip(headers, widths)):
                pdf.cell(w, 5.5, _sanitize_text(h), border=1, align="C" if idx in (0, 2, 4, 6, 7, 8) else ("R" if idx == 5 else "L"), fill=True)
            pdf.ln()

            pdf.set_font("Helvetica", "", 7.5)
            for idx, item in enumerate(r_list):
                fill = idx % 2 == 1
                if fill:
                    pdf.set_fill_color(248, 250, 252)
                ename = item.get("entity_name") or ""
                if len(ename) > 42:
                    ename = ename[:40] + ".."
                mcat = item.get("main_category") or ""
                if len(mcat) > 28:
                    mcat = mcat[:26] + ".."
                vals = [
                    f"#{item.get('rank')}",
                    ename,
                    item.get("document") or "-",
                    mcat,
                    str(item.get("count", 0)),
                    f"R$ {float(item.get('total', 0.0)):,.2f}",
                    f"{float(item.get('share_pct', 0.0)):.2f}%",
                    f"{float(item.get('cumulative_pct', 0.0)):.1f}%",
                    str(item.get("abc_class") or "A")
                ]
                for c_i, (v, w) in enumerate(zip(vals, widths)):
                    if c_i == 5:
                        pdf.set_text_color(5, 150, 105) if is_rec else pdf.set_text_color(220, 38, 38)
                    else:
                        pdf.set_text_color(15, 23, 42)
                    pdf.cell(w, 5, _sanitize_text(v), border=1, align="C" if c_i in (0, 2, 4, 6, 7, 8) else ("R" if c_i == 5 else "L"), fill=fill)
                pdf.ln()
            pdf.ln(4)

    if model == "category_matrix":
        _render_categories_pdf()
        _render_timeline_pdf()
    elif model == "abc_ranking":
        _render_rankings_pdf(limit_rows=100)
    else:
        _render_timeline_pdf()
        _render_categories_pdf()
        _render_rankings_pdf(limit_rows=20)

    buffer = BytesIO()
    out = pdf.output()
    pdf_bytes = bytes(out) if not isinstance(out, (bytes, bytearray)) else bytes(out)
    buffer.write(pdf_bytes)
    buffer.seek(0)
    return buffer


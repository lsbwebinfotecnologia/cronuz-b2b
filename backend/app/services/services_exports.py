# -*- coding: utf-8 -*-
"""
Serviço de Exportação de Relatórios de Serviços por Cliente em Excel (.xlsx) e PDF (.pdf).
Suporta visualização por cliente com separação de serviços Previstos vs Concluídos (com data de pagamento).
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


class ServicesPDFReport(FPDF):
    """Classe base para relatórios em PDF de Serviços por Cliente."""

    def __init__(self, title: str, subtitle: str, company_name: str, orientation: str = "L"):
        super().__init__(orientation=orientation, unit="mm", format="A4")
        self.report_title = title
        self.report_subtitle = subtitle
        self.company_name = company_name

    def header(self):
        page_width = 297 if self.cur_orientation == "L" else 210
        self.set_fill_color(30, 41, 59)
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
        self.set_text_color(147, 197, 253)
        self.cell(page_width - 20, 5, _sanitize_text(self.report_title.upper()), 0, 1, 'L')

        self.ln(7)

    def footer(self):
        page_width = 297 if self.cur_orientation == "L" else 210
        self.set_y(-12)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(148, 163, 184)
        page_str = f"Pagina {self.page_no()}"
        self.cell(0, 6, _sanitize_text(f"{self.report_subtitle}  -  {page_str}"), 0, 0, 'C')


def export_services_by_customer_excel(
    customer_groups: List[Dict[str, Any]],
    company_name: str,
    period_label: str = ""
) -> BytesIO:
    """Gera planilha Excel (.xlsx) de serviços agrupados por cliente com subtotais."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Servicos por Cliente"
    ws.views.sheetView[0].showGridLines = True

    font_title = Font(name="Calibri", size=14, bold=True, color="1E293B")
    font_subtitle = Font(name="Calibri", size=10, italic=True, color="64748B")
    font_header = Font(name="Calibri", size=9, bold=True, color="FFFFFF")
    fill_header = PatternFill(start_color="334155", end_color="334155", fill_type="solid")
    fill_cust_header = PatternFill(start_color="E0E7FF", end_color="E0E7FF", fill_type="solid")
    font_cust_header = Font(name="Calibri", size=11, bold=True, color="3730A3")
    fill_zebra = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    font_data = Font(name="Calibri", size=9, color="0F172A")
    font_subtotal = Font(name="Calibri", size=9, bold=True, color="1E293B")
    fill_subtotal = PatternFill(start_color="EEF2F6", end_color="EEF2F6", fill_type="solid")
    font_total = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
    fill_total = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")

    thin_border_side = Side(border_style="thin", color="CBD5E1")
    border_cell = Border(left=thin_border_side, right=thin_border_side, top=thin_border_side, bottom=thin_border_side)

    ws["A1"] = f"CRONUZ B2B — RELATÓRIO DE SERVIÇOS POR CLIENTE"
    ws["A1"].font = font_title
    
    sub = f"Empresa: {company_name}"
    if period_label:
        sub += f" | Período: {period_label}"
    ws["A2"] = sub
    ws["A2"].font = font_subtitle

    headers = [
        "Nº O.S.", "Serviço", "Data Execução", "Status", "Status NFS-e",
        "Valor (R$)", "Data Pagamento", "Forma / Conta", "Observações / Composição"
    ]

    row_idx = 4
    grand_total_previsto = 0.0
    grand_total_concluido = 0.0
    grand_total_geral = 0.0

    for group in customer_groups:
        cust_name = group.get("customer_name") or "Sem Cliente Vinculado"
        cust_doc = group.get("customer_document") or ""
        total_previsto = group.get("total_previsto", 0.0)
        total_concluido = group.get("total_concluido", 0.0)
        total_cliente = group.get("total_cliente", 0.0)

        grand_total_previsto += total_previsto
        grand_total_concluido += total_concluido
        grand_total_geral += total_cliente

        # Cabeçalho do Cliente
        ws.merge_cells(start_row=row_idx, start_column=1, end_row=row_idx, end_column=len(headers))
        cust_cell = ws.cell(row=row_idx, column=1)
        doc_part = f" — CNPJ/CPF: {cust_doc}" if cust_doc else ""
        cust_cell.value = f"CLIENTE: {cust_name}{doc_part}"
        cust_cell.font = font_cust_header
        cust_cell.fill = fill_cust_header
        cust_cell.alignment = Alignment(vertical="center", indent=1)
        for col in range(1, len(headers) + 1):
            ws.cell(row=row_idx, column=col).border = border_cell
        row_idx += 1

        # Cabeçalhos da tabela do cliente
        for col_idx, h in enumerate(headers, 1):
            c = ws.cell(row=row_idx, column=col_idx, value=h)
            c.font = font_header
            c.fill = fill_header
            c.alignment = Alignment(horizontal="center" if col_idx in [1, 3, 4, 5, 7] else "left", vertical="center")
            c.border = border_cell
        row_idx += 1

        # Linhas de serviços
        items = group.get("items", [])
        for i_idx, item in enumerate(items):
            is_even = i_idx % 2 == 0
            row_fill = None if is_even else fill_zebra

            os_num = f"#{item.get('local_id') or item.get('id')}"
            val = float(item.get("negotiated_value") or 0.0)
            status_desc = item.get("status") or "Pendente"
            nfse_desc = item.get("status_nfse") or "Nao Emitida"
            exec_dt = item.get("execution_date") or ""
            pay_dt = item.get("payment_date") or ("Pendente" if status_desc == "Pendente" else "Aguardando Pagamento")
            acc_name = item.get("account_name") or "-"
            obs = item.get("custom_description") or ""

            cells_data = [
                (os_num, "center"),
                (item.get("service_name") or "Serviço", "left"),
                (exec_dt, "center"),
                (status_desc, "center"),
                (nfse_desc, "center"),
                (val, "right"),
                (pay_dt, "center"),
                (acc_name, "left"),
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

            row_idx += 1

        # Linha de Subtotal do Cliente
        ws.cell(row=row_idx, column=1, value="SUBTOTAL DO CLIENTE:").font = font_subtotal
        ws.cell(row=row_idx, column=1).alignment = Alignment(horizontal="right")
        ws.merge_cells(start_row=row_idx, start_column=1, end_row=row_idx, end_column=5)
        
        c_val = ws.cell(row=row_idx, column=6, value=total_cliente)
        c_val.font = font_subtotal
        c_val.number_format = '"R$ "#,##0.00'
        c_val.alignment = Alignment(horizontal="right")

        ws.cell(row=row_idx, column=7, value=f"Previsto: R$ {total_previsto:,.2f} | Concluído: R$ {total_concluido:,.2f}").font = font_subtitle
        ws.merge_cells(start_row=row_idx, start_column=7, end_row=row_idx, end_column=len(headers))

        for col in range(1, len(headers) + 1):
            ws.cell(row=row_idx, column=col).border = border_cell
            ws.cell(row=row_idx, column=col).fill = fill_subtotal

        row_idx += 2

    # Linha de Total Geral da Empresa
    ws.merge_cells(start_row=row_idx, start_column=1, end_row=row_idx, end_column=5)
    c_tot_label = ws.cell(row=row_idx, column=1, value="TOTAL GERAL DE SERVIÇOS:")
    c_tot_label.font = font_total
    c_tot_label.alignment = Alignment(horizontal="right", vertical="center")
    
    c_tot_val = ws.cell(row=row_idx, column=6, value=grand_total_geral)
    c_tot_val.font = font_total
    c_tot_val.number_format = '"R$ "#,##0.00'
    c_tot_val.alignment = Alignment(horizontal="right", vertical="center")

    ws.merge_cells(start_row=row_idx, start_column=7, end_row=row_idx, end_column=len(headers))
    c_tot_extra = ws.cell(row=row_idx, column=7, value=f"Total Previsto: R$ {grand_total_previsto:,.2f} | Total Concluído: R$ {grand_total_concluido:,.2f}")
    c_tot_extra.font = font_total
    c_tot_extra.alignment = Alignment(horizontal="left", vertical="center")

    for col in range(1, len(headers) + 1):
        c = ws.cell(row=row_idx, column=col)
        c.fill = fill_total
        c.border = border_cell

    # Auto ajuste de largura das colunas
    col_widths = {1: 12, 2: 28, 3: 14, 4: 15, 5: 16, 6: 18, 7: 18, 8: 20, 9: 45}
    for col_idx, width in col_widths.items():
        col_letter = get_column_letter(col_idx)
        ws.column_dimensions[col_letter].width = width

    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer


def export_services_by_customer_pdf(
    customer_groups: List[Dict[str, Any]],
    company_name: str,
    period_label: str = ""
) -> BytesIO:
    """Gera relatório em PDF de serviços agrupados por cliente com layout executivo."""
    pdf = ServicesPDFReport(
        title="Relatório de Serviços por Cliente",
        subtitle=f"Período: {period_label}" if period_label else "Todos os Períodos",
        company_name=company_name,
        orientation="L"
    )
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    grand_total_previsto = 0.0
    grand_total_concluido = 0.0
    grand_total_geral = 0.0

    col_widths = [16, 50, 22, 24, 25, 26, 26, 88]

    for group in customer_groups:
        cust_name = group.get("customer_name") or "Sem Cliente Vinculado"
        cust_doc = group.get("customer_document") or ""
        total_previsto = group.get("total_previsto", 0.0)
        total_concluido = group.get("total_concluido", 0.0)
        total_cliente = group.get("total_cliente", 0.0)

        grand_total_previsto += total_previsto
        grand_total_concluido += total_concluido
        grand_total_geral += total_cliente

        # Cabeçalho do Cliente
        pdf.set_fill_color(224, 231, 255)
        pdf.set_text_color(55, 48, 163)
        pdf.set_font("Helvetica", "B", 9)
        doc_part = f" (CNPJ/CPF: {cust_doc})" if cust_doc else ""
        pdf.cell(sum(col_widths), 6.5, _sanitize_text(f" CLIENTE: {cust_name}{doc_part}"), border=1, ln=1, fill=True)

        # Cabeçalho de colunas
        pdf.set_fill_color(51, 65, 85)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Helvetica", "B", 7.5)
        headers = ["Nº OS", "Serviço", "Data Exec.", "Status", "NFS-e", "Valor (R$)", "Pagamento", "Obs / Composição"]
        for idx, (h, w) in enumerate(zip(headers, col_widths)):
            align = "C" if idx in [0, 2, 3, 4, 6] else ("R" if idx == 5 else "L")
            pdf.cell(w, 5.5, _sanitize_text(h), border=1, align=align, fill=True)
        pdf.ln()

        # Linhas de serviços
        items = group.get("items", [])
        pdf.set_font("Helvetica", "", 7.5)
        for i_idx, item in enumerate(items):
            if i_idx % 2 == 1:
                pdf.set_fill_color(248, 250, 252)
                fill = True
            else:
                fill = False

            pdf.set_text_color(15, 23, 42)
            os_num = f"#{item.get('local_id') or item.get('id')}"
            srv_name = item.get("service_name") or "Serviço"
            if len(srv_name) > 30:
                srv_name = srv_name[:28] + ".."
            exec_dt = item.get("execution_date") or ""
            status_desc = item.get("status") or "Pendente"
            nfse_desc = item.get("status_nfse") or "Nao Emitida"
            val_str = f"{float(item.get('negotiated_value') or 0.0):,.2f}"
            pay_dt = item.get("payment_date") or ("Pendente" if status_desc == "Pendente" else "Aguardando")
            obs = item.get("custom_description") or ""
            if len(obs) > 55:
                obs = obs[:53] + ".."

            row_data = [os_num, srv_name, exec_dt, status_desc, nfse_desc, val_str, pay_dt, obs]
            for idx, (val, w) in enumerate(zip(row_data, col_widths)):
                align = "C" if idx in [0, 2, 3, 4, 6] else ("R" if idx == 5 else "L")
                pdf.cell(w, 5, _sanitize_text(val), border=1, align=align, fill=fill)
            pdf.ln()

        # Subtotal do Cliente
        pdf.set_fill_color(238, 242, 246)
        pdf.set_font("Helvetica", "B", 7.5)
        pdf.set_text_color(30, 41, 59)
        pdf.cell(sum(col_widths[:5]), 5.5, _sanitize_text(f"Subtotal: Previsto R$ {total_previsto:,.2f} | Concluído R$ {total_concluido:,.2f}"), border=1, align="R", fill=True)
        pdf.cell(col_widths[5], 5.5, f"R$ {total_cliente:,.2f}", border=1, align="R", fill=True)
        pdf.cell(sum(col_widths[6:]), 5.5, "", border=1, fill=True)
        pdf.ln(7)

    # Total Geral
    pdf.set_fill_color(30, 41, 59)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 8.5)
    pdf.cell(sum(col_widths[:5]), 6.5, _sanitize_text(f"TOTAL GERAL (Previsto: R$ {grand_total_previsto:,.2f} | Concluído: R$ {grand_total_concluido:,.2f})"), border=1, align="R", fill=True)
    pdf.cell(col_widths[5], 6.5, f"R$ {grand_total_geral:,.2f}", border=1, align="R", fill=True)
    pdf.cell(sum(col_widths[6:]), 6.5, "", border=1, fill=True)

    buffer = BytesIO()
    out = pdf.output()
    pdf_bytes = bytes(out) if not isinstance(out, (bytes, bytearray)) else bytes(out)
    buffer.write(pdf_bytes)
    buffer.seek(0)
    return buffer

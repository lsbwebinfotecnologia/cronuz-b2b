# -*- coding: utf-8 -*-
from io import BytesIO
from datetime import datetime
from fpdf import FPDF

class EditorialManualPDF(FPDF):
    def header(self):
        self.set_fill_color(30, 41, 59)
        self.rect(0, 0, 210, 18, 'F')
        self.set_xy(10, 4)
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(255, 255, 255)
        self.cell(100, 10, "CRONUZ B2B - GESTAO & PRODUCAO EDITORIAL", 0, 0, 'L')
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(203, 213, 225)
        self.cell(90, 10, "Manual Pratico, Conceitos & Benchmarks de Mercado", 0, 0, 'R')
        self.ln(18)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(148, 163, 184)
        self.cell(0, 10, f"Pagina {self.page_no()} | Gerado em {datetime.now().strftime('%d/%m/%Y %H:%M')}", 0, 0, 'C')

    def chapter_title(self, title: str, subtitle: str = ""):
        self.set_font("Helvetica", "B", 13)
        self.set_text_color(79, 70, 229)
        self.cell(0, 8, title.encode('latin-1', 'replace').decode('latin-1'), 0, 1, 'L')
        if subtitle:
            self.set_font("Helvetica", "I", 8.5)
            self.set_text_color(100, 116, 139)
            self.cell(0, 5, subtitle.encode('latin-1', 'replace').decode('latin-1'), 0, 1, 'L')
        self.ln(2)

    def paragraph(self, text: str):
        self.set_font("Helvetica", "", 9)
        self.set_text_color(51, 65, 85)
        self.multi_cell(0, 5, text.encode('latin-1', 'replace').decode('latin-1'))
        self.ln(2)

def gerar_manual_editorial_pdf(company_name: str = "Editora") -> bytes:
    pdf = EditorialManualPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()

    # Capa / Titulo
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(30, 41, 59)
    pdf.cell(0, 10, "Manual Operacional de Producao Editorial".encode('latin-1', 'replace').decode('latin-1'), 0, 1, 'L')
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(99, 102, 241)
    pdf.cell(0, 6, f"Editora: {company_name}".encode('latin-1', 'replace').decode('latin-1'), 0, 1, 'L')
    pdf.ln(4)

    # 1. Visao Geral
    pdf.chapter_title("1. Visao Geral da Cadeia Editorial", "Conceito e fluxo de valor na transformacao do original ao livro publicado")
    pdf.paragraph(
        "A producao editorial moderna combina gestao artistica, precisao tecnica e rigor financeiro. "
        "O Modulo Editorial do Cronuz B2B foi desenvolvido sob o modelo flexivel Kanban, permitindo que a editora "
        "estruture suas esteiras sem engessamento, acompanhando prazos (SLA), orcamento e prestadores de servico por cada etapa."
    )

    # 2. Etapas
    pdf.chapter_title("2. As Etapas do Fluxo Editorial Profissional", "Padrao industrial adotado pelas principais editoras")
    
    stages_info = [
        ("1. Preparacao de Original", "Analise de viabilidade, padronizacao ortografica e adequacao ao projeto editorial."),
        ("2. 1a Revisao de Texto", "Revisao aprofundada de gramatica, concordancia, fluidez narrativa e coesao textual."),
        ("3. Diagramacao de Miolo", "Composicao tipografica (InDesign), definicao de fontes, margens, capitulares e abertura."),
        ("4. Criacao de Capa", "Projeto grafico visual da 1a capa, 4a capa, lombada e orelhas."),
        ("5. 2a Revisao / Cotejo", "Revisao das provas diagramadas, eliminacao de viuvas, orfas e hifenizacao incorreta."),
        ("6. Ficha e Legalizacao", "Elaboracao da ficha catalografica por bibliotecario (CRB) e registro de ISBN oficial."),
        ("7. Orcamento & Grafica", "Fechamento de arquivos em PDF/X-1a com sangria, cotacao industrial e impressao.")
    ]

    for st_title, st_desc in stages_info:
        pdf.set_font("Helvetica", "B", 8.5)
        pdf.set_text_color(30, 41, 59)
        pdf.cell(48, 5, st_title.encode('latin-1', 'replace').decode('latin-1'), 0, 0, 'L')
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(71, 85, 105)
        pdf.multi_cell(0, 5, st_desc.encode('latin-1', 'replace').decode('latin-1'))
        pdf.ln(0.5)

    pdf.ln(3)

    # 3. Engenharia de Custos
    pdf.chapter_title("3. Engenharia de Custos & Benchmarks de Mercado", "Metricas de cobranca e medias praticadas no Brasil")
    pdf.paragraph(
        "Para garantir a saude financeira de cada lancamento, o sistema calcula automaticamente os custos orcados e realizados "
        "com base na tiragem planejada e volume de paginas e laudas."
    )

    pdf.set_font("Helvetica", "B", 8)
    pdf.set_fill_color(241, 245, 249)
    pdf.set_text_color(51, 65, 85)
    pdf.cell(50, 6, "Servico Editorial", 1, 0, 'L', fill=True)
    pdf.cell(45, 6, "Metrica Padrao", 1, 0, 'C', fill=True)
    pdf.cell(45, 6, "Valor de Referencia", 1, 0, 'C', fill=True)
    pdf.cell(50, 6, "Impacto na Qualidade", 1, 1, 'L', fill=True)

    rows = [
        ("Revisao de Texto", "Lauda (2.100 caracteres)", "R$ 8,00 a R$ 14,00", "Elimina ruidos e erros"),
        ("Diagramacao de Miolo", "Pagina Diagramada", "R$ 4,50 a R$ 8,00", "Leiturabilidade e estetica"),
        ("Projeto de Capa", "Valor Fechado", "R$ 800,00 a R$ 2.500,00", "Fator decisivo de venda"),
        ("Leitura Critica", "Lauda ou Fechado", "R$ 4,00 a R$ 7,00", "Ajuste de tom e narrativa"),
        ("Ficha Catalografica", "Titulo", "R$ 90,00 a R$ 150,00", "Exigencia legal / Venda"),
        ("Impressao Grafica", "Exemplar (Tiragem)", "R$ 8,00 a R$ 18,00/un", "Custo industrial direto")
    ]

    pdf.set_font("Helvetica", "", 7.5)
    pdf.set_text_color(71, 85, 105)
    for r in rows:
        pdf.cell(50, 5, r[0].encode('latin-1', 'replace').decode('latin-1'), 1, 0, 'L')
        pdf.cell(45, 5, r[1].encode('latin-1', 'replace').decode('latin-1'), 1, 0, 'C')
        pdf.cell(45, 5, r[2].encode('latin-1', 'replace').decode('latin-1'), 1, 0, 'C')
        pdf.cell(50, 5, r[3].encode('latin-1', 'replace').decode('latin-1'), 1, 1, 'L')

    pdf.ln(4)

    # 4. Precificacao
    pdf.chapter_title("4. Formacao de Preco de Venda & Ponto de Equilibrio", "Como calcular a margem de contribuicao sem prejuizo")
    pdf.paragraph(
        "No mercado de livros fisicos comercializados via livrarias e e-commerce B2B, o desconto comercial para distribuidores "
        "e livreiros varia entre 45% a 55% sobre o Preco de Capa.\n\n"
        "Regra de Ouro da Precificacao Editorial:\n"
        "- Custo Unitario = (Custo Editorial Total + Custo Grafico) / Tiragem\n"
        "- Preco de Capa Sugerido = Custo Unitario x Multiplicador (Recomendado 4x a 5x)\n"
        "- Ponto de Equilibrio (Break-Even) = Total Investido / Receita Liquida por Livro\n\n"
        "Exemplo: Se um livro custou R$ 12,00 por exemplar para ser produzido (tiragem 1.000 un = R$ 12.000), "
        "seu preco de capa deve ser no minimo R$ 48,00 a R$ 54,00. Vendendo com 50% de desconto para livrarias (R$ 24,00 liquido), "
        "a editora precisa vender 500 exemplares (50% da tiragem) para empatar o investimento. O restante representa lucro bruto."
    )

    # 5. Boas Praticas
    pdf.chapter_title("5. Boas Praticas de Gestao no Cronuz B2B", "Maximizando a produtividade da sua equipe")
    pdf.paragraph(
        "1. Cadastre todos os profissionais parceiros na aba 'Profissionais' com suas especialidades e chave Pix.\n"
        "2. Ao criar a demanda, informe a Tiragem Planejada e Paginas Estimadas para ativacao da calculadora automatica.\n"
        "3. Em cada projeto, vincule o servico ao prestador responsavel. Acompanhe na aba 'Custos & Margens' a relacao orcado vs realizado.\n"
        "4. Mantenha os arquivos de prova (PDFs de miolo e capas) anexados diretamente no card da demanda para historico.\n"
        "5. Conecte itens ao acervo do Horus ERP sempre que o livro for integrado ao catalogo comercial."
    )

    return pdf.output()

import os
import io
import qrcode
from fpdf import FPDF
from lxml import etree
import tempfile
from datetime import datetime
import re

class DanfseGenerator:
    """
    Constrói visualmente o DANFSe (Documento Auxiliar da Nota Fiscal de Serviço Eletrônica)
    baseado no padrão ABRASF / Padrão Nacional (Sefin Nacional).
    """
    
    def __init__(self, xml_content: str, prestador_nome: str = "", prestador_email: str = "", tomador_nome: str = "", tomador_email: str = ""):
        self.xml_content = xml_content
        self.p_nome = prestador_nome
        self.p_email = prestador_email
        self.t_nome = tomador_nome
        self.t_email = tomador_email
        self._parse_xml()

    def _parse_xml(self):
        try:
            root = etree.fromstring(self.xml_content.encode('utf-8'))
            for elem in root.getiterator():
                if not hasattr(elem.tag, 'find'): continue
                i = elem.tag.find('}')
                if i >= 0: elem.tag = elem.tag[i+1:]
        except Exception:
            root = None
            
        def s(path, default=""):
            if root is not None:
                el = root.find(path)
                return el.text if el is not None else default
            return default

        # CABEÇALHO DA NOTA
        self.nNFSe = s('.//nNFSe') or s('.//nNfse') or s('.//numero') or "0"
        self.dhEmi = s('.//dhEmi')
        self.cSitNFSe = s('.//cSitNFSe')
        
        # DPS
        self.nDPS = s('.//nDPS') or s('.//infDPS/nro') or "1"
        self.serieDPS = s('.//serieDPS') or s('.//infDPS/serie') or "1"
        self.dhEmiDPS = s('.//dhEmiDPS') or s('.//infDPS/dhEmi') or self.dhEmi
        
        self.competencia = self.dhEmi[:10] if self.dhEmi else ""
        if self.dhEmi and 'T' in self.dhEmi:
            self.competencia_formatada = datetime.fromisoformat(self.dhEmi[:19]).strftime("%d/%m/%Y")
            self.dh_emissao_formatada = datetime.fromisoformat(self.dhEmi[:19]).strftime("%d/%m/%Y %H:%M:%S")
        else:
            self.competencia_formatada = self.dhEmi
            self.dh_emissao_formatada = self.dhEmi
            
        if self.dhEmiDPS and 'T' in self.dhEmiDPS:
            self.dh_emissao_dps_formatada = datetime.fromisoformat(self.dhEmiDPS[:19]).strftime("%d/%m/%Y %H:%M:%S")
        else:
            self.dh_emissao_dps_formatada = self.dhEmiDPS

        self.protocol_id = ""
        inf_dps = root.find('.//infDPS') if root is not None else None
        if inf_dps is not None:
            self.protocol_id = inf_dps.get('Id', '').replace('TESTE_MOCK_', '').replace('DPS', '')
        if not self.protocol_id:
            inf_nfse = root.find('.//infNFSe') if root is not None else None
            if inf_nfse is not None:
                self.protocol_id = inf_nfse.get('Id', '').replace('NFS', '')
        if not self.protocol_id:
            sig_ref = root.find('.//Reference') if root is not None else None
            if sig_ref is not None:
                self.protocol_id = sig_ref.get('URI', '').replace('#', '').replace('NFS', '')
        if not self.protocol_id:
            self.protocol_id = "SEM VALIDADE FISCAL"

        # FORMATAR CPF/CNPJ
        def format_doc(doc):
            if not doc: return "-"
            d = "".join(filter(str.isdigit, doc))
            if len(d) == 14: return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}"
            if len(d) == 11: return f"{d[:3]}.{d[3:6]}.{d[6:9]}-{d[9:]}"
            return d

        # EMITENTE
        self.e_cnpj = format_doc(s('.//prest/CNPJ') or s('.//emit/CNPJ'))
        self.e_im = s('.//prest/IM') or s('.//emit/IM') or "-"
        self.e_nome = s('.//prest/xNome') or s('.//emit/xNome') or self.p_nome
        self.e_email = s('.//prest/email') or s('.//emit/email') or self.p_email or "-"
        self.e_fone = s('.//prest/fone') or s('.//emit/fone') or "-"
        self.e_end_lgr = s('.//prest/end/xLgr') or s('.//emit/end/xLgr') or ""
        self.e_end_nro = s('.//prest/end/nro') or s('.//emit/end/nro') or ""
        self.e_end_bairro = s('.//prest/end/xBairro') or s('.//emit/end/xBairro') or ""
        self.e_end_mun = s('.//prest/end/xMun') or s('.//emit/end/xMun') or "-"
        self.e_end_uf = s('.//prest/end/UF') or s('.//emit/end/UF') or "-"
        self.e_end_cep = s('.//prest/end/CEP') or s('.//emit/end/CEP') or ""
        if len(self.e_end_cep) == 8: self.e_end_cep = f"{self.e_end_cep[:5]}-{self.e_end_cep[5:]}"
        else: self.e_end_cep = "-"
        
        self.e_endereco_completo = f"{self.e_end_lgr}, {self.e_end_nro}, {self.e_end_bairro}" if self.e_end_lgr else "-"
        self.e_municipio_uf = f"{self.e_end_mun} - {self.e_end_uf}" if self.e_end_mun != "-" else "-"
        
        self.e_simples = "Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)" if s('.//regTrib/opSimpNac') == "1" else "Não Optante"
        self.e_regime = "Regime de apuração dos tributos federais e municipal pelo Simples Nacional" if s('.//regTrib/regApuracaoSN') == "1" else "-"

        # TOMADOR
        self.t_cnpj = format_doc(s('.//toma/CNPJ') or s('.//toma/CPF'))
        self.t_im = s('.//toma/IM') or "-"
        self.t_nome = s('.//toma/xNome') or self.t_nome or "-"
        self.t_email = s('.//toma/email') or self.t_email or "-"
        self.t_fone = s('.//toma/fone') or "-"
        self.t_end_lgr = s('.//toma/end/xLgr') or ""
        self.t_end_nro = s('.//toma/end/nro') or ""
        self.t_end_bairro = s('.//toma/end/xBairro') or ""
        self.t_end_mun = s('.//toma/end/xMun') or "-"
        self.t_end_uf = s('.//toma/end/UF') or "-"
        self.t_end_cep = s('.//toma/end/CEP') or ""
        if len(self.t_end_cep) == 8: self.t_end_cep = f"{self.t_end_cep[:5]}-{self.t_end_cep[5:]}"
        else: self.t_end_cep = "-"
        
        self.t_endereco_completo = f"{self.t_end_lgr}, {self.t_end_nro}, {self.t_end_bairro}" if self.t_end_lgr else "-"
        self.t_municipio_uf = f"{self.t_end_mun} - {self.t_end_uf}" if self.t_end_mun != "-" else "-"

        # SERVIÇO
        self.s_trib_nac = s('.//serv/cTribNac') or "-"
        self.s_trib_mun = s('.//serv/cTribMun') or "-"
        self.s_mun_prest = s('.//serv/xMunPrestacao') or "-"
        self.s_uf_prest = s('.//serv/UFPrestacao') or "-" # Pode nao vir
        self.s_local_prest = f"{self.s_mun_prest}" + (f" - {self.s_uf_prest}" if self.s_uf_prest != "-" else "")
        self.s_pais_prest = s('.//serv/cPaisPrestacao') or "Brasil"
        self.s_desc = s('.//serv/xDescSrv') or s('.//serv/descSrv') or "-"

        # TRIBUTAÇÃO MUNICIPAL
        self.v_serv = float(s('.//valores/vServPrest') or "0")
        self.v_deducao = float(s('.//valores/vDeducao') or "0")
        self.v_bciss = float(s('.//valores/vBCISS') or "0")
        self.p_iss = float(s('.//valores/pISS') or "0")
        self.v_iss = float(s('.//valores/vISS') or "0")
        self.v_iss_ret = float(s('.//valores/vISSRet') or "0")
        self.v_desc_incond = float(s('.//valores/vDescIncond') or "0")
        self.v_desc_cond = float(s('.//valores/vDescCond') or "0")
        self.v_liq = float(s('.//valores/vLiq') or self.v_serv)

        # TRIBUTAÇÃO FEDERAL
        self.v_pis = float(s('.//tribFed/vPIS') or "0")
        self.v_cofins = float(s('.//tribFed/vCOFINS') or "0")
        self.v_inss = float(s('.//tribFed/vINSS') or "0")
        self.v_ir = float(s('.//tribFed/vIR') or "0")
        self.v_csll = float(s('.//tribFed/vCSLL') or "0")
        self.v_ret_cp = float(s('.//tribFed/vRetCP') or "0")

    def generate_pdf(self) -> bytes:
        pdf = FPDF(orientation="P", unit="mm", format="A4")
        pdf.add_page()
        pdf.set_auto_page_break(auto=False) # Manual control for precise layout
        
        # Cores padrao
        pdf.set_draw_color(150, 150, 150)
        pdf.set_text_color(0, 0, 0)
        
        # UTIL: Função desenhar celula
        def d_cell(x, y, w, h, title, val, title_font=6, val_font=7):
            pdf.set_xy(x, y)
            pdf.set_font("Helvetica", style="B", size=title_font)
            pdf.cell(w, 3, title, border=0, align="L")
            pdf.set_xy(x, y+3)
            pdf.set_font("Helvetica", size=val_font)
            # handle multi-line value
            pdf.multi_cell(w, 3, str(val), align="L")

        # CABEÇALHO
        # Retangulo Cabecalho Esquerdo
        pdf.rect(10, 10, 190, 20)
        
        # Fake Logo NFS-e (Green and Blue text)
        pdf.set_xy(12, 12)
        pdf.set_font("Helvetica", style="B", size=18)
        pdf.set_text_color(0, 128, 0) # Green
        pdf.cell(15, 6, "NFS-e")
        pdf.set_font("Helvetica", size=8)
        pdf.set_text_color(0, 0, 255) # Blue
        pdf.set_xy(30, 12)
        pdf.multi_cell(25, 3, "Nota Fiscal de\nServiço eletrônica")
        
        pdf.set_text_color(0, 0, 0)
        pdf.set_xy(60, 12)
        pdf.set_font("Helvetica", style="B", size=12)
        pdf.cell(80, 5, "DANFSe v1.0", align="C")
        pdf.set_xy(60, 17)
        pdf.set_font("Helvetica", size=10)
        pdf.cell(80, 5, "Documento Auxiliar da NFS-e", align="C")

        # Fake Brasão Prefeitura
        pdf.set_xy(140, 12)
        pdf.set_font("Helvetica", style="B", size=7)
        pdf.multi_cell(58, 3, f"Prefeitura Municipal de {self.e_end_mun} - {self.e_end_uf}", align="R")

        # BLOCO CHAVE DE ACESSO
        y_chave = 30
        pdf.rect(10, y_chave, 190, 20)
        
        pdf.set_xy(12, y_chave + 2)
        pdf.set_font("Helvetica", style="B", size=7)
        pdf.cell(140, 3, "Chave de Acesso da NFS-e")
        pdf.set_xy(12, y_chave + 5)
        pdf.set_font("Helvetica", size=8)
        pdf.cell(140, 4, self.protocol_id)

        # Draw columns inside Chave de acesso
        pdf.line(10, y_chave+10, 155, y_chave+10) # horizontal line below chave
        pdf.line(155, y_chave, 155, y_chave+20) # vertical line for QR Code
        
        # Cols for NFSe info
        col_w = 48
        d_cell(12, y_chave+11, col_w, 9, "Número da NFS-e", self.nNFSe)
        pdf.line(10+col_w, y_chave+10, 10+col_w, y_chave+20)
        d_cell(12+col_w, y_chave+11, col_w, 9, "Competência da NFS-e", self.competencia_formatada)
        pdf.line(10+col_w*2, y_chave+10, 10+col_w*2, y_chave+20)
        d_cell(12+col_w*2, y_chave+11, col_w, 9, "Data e Hora da emissão da NFS-e", self.dh_emissao_formatada)
        
        pdf.line(10, y_chave+20, 155, y_chave+20)
        
        # QR CODE no retângulo lateral
        qr_url = f"https://www.nfse.gov.br/consultar?chave={self.protocol_id}"
        qr = qrcode.QRCode(version=1, box_size=10, border=0)
        qr.add_data(qr_url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as temp_img:
            img.save(temp_img.name)
            pdf.image(temp_img.name, x=168, y=y_chave+2, w=16)
        os.remove(temp_img.name)
        
        pdf.set_xy(156, y_chave+18)
        pdf.set_font("Helvetica", size=4.5)
        pdf.multi_cell(43, 2, "A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e", align="C")

        # DPS INFO (linha extra abaixo)
        y_dps = 50
        pdf.line(10, y_dps, 10, y_dps+10) # borda esq
        pdf.line(200, y_dps, 200, y_dps+10) # borda dir
        
        d_cell(12, y_dps+1, col_w, 9, "Número da DPS", self.nDPS)
        pdf.line(10+col_w, y_dps, 10+col_w, y_dps+10)
        d_cell(12+col_w, y_dps+1, col_w, 9, "Série da DPS", self.serieDPS)
        pdf.line(10+col_w*2, y_dps, 10+col_w*2, y_dps+10)
        d_cell(12+col_w*2, y_dps+1, col_w, 9, "Data e Hora da emissão da DPS", self.dh_emissao_dps_formatada)

        pdf.line(10, y_dps+10, 200, y_dps+10)

        # ==========================================
        # EMITENTE DA NFS-e
        # ==========================================
        y_em = y_dps + 12
        pdf.rect(10, y_em, 190, 28)
        pdf.set_xy(10, y_em)
        pdf.set_font("Helvetica", style="B", size=8)
        pdf.cell(190, 5, "  EMITENTE DA NFS-e", border="B", ln=1)
        
        y_em_body = y_em + 5
        col1 = 70; col2 = 60; col3 = 56
        
        # row 1
        d_cell(12, y_em_body+1, col1, 7, "Nome / Nome Empresarial", self.e_nome)
        pdf.line(10+col1, y_em_body, 10+col1, y_em_body+7)
        d_cell(12+col1, y_em_body+1, col2, 7, "CNPJ / CPF / NIF", self.e_cnpj)
        pdf.line(10+col1+col2, y_em_body, 10+col1+col2, y_em_body+7)
        d_cell(12+col1+col2, y_em_body+1, col3/2, 7, "Inscrição Municipal", self.e_im)
        d_cell(12+col1+col2+28, y_em_body+1, col3/2, 7, "Telefone", self.e_fone)
        pdf.line(10, y_em_body+7, 200, y_em_body+7)

        # row 2
        d_cell(12, y_em_body+8, col1+col2, 7, "Endereço", self.e_endereco_completo)
        pdf.line(10+col1+col2, y_em_body+7, 10+col1+col2, y_em_body+14)
        d_cell(12+col1+col2, y_em_body+8, col3/2 + 10, 7, "Município", self.e_municipio_uf)
        d_cell(12+col1+col2+38, y_em_body+8, col3/2 - 10, 7, "CEP", self.e_end_cep)
        pdf.line(10, y_em_body+14, 200, y_em_body+14)
        
        # row 3
        d_cell(12, y_em_body+15, col1+20, 7, "Simples Nacional na Data de Competência", self.e_simples)
        pdf.line(10+col1+20, y_em_body+14, 10+col1+20, y_em_body+23)
        d_cell(12+col1+20, y_em_body+15, col2+col3-20, 7, "Regime de Apuração Tributária pelo SN", self.e_regime)

        # ==========================================
        # TOMADOR DO SERVIÇO
        # ==========================================
        y_tom = y_em + 30
        pdf.rect(10, y_tom, 190, 21)
        pdf.set_xy(10, y_tom)
        pdf.set_font("Helvetica", style="B", size=8)
        pdf.cell(190, 5, "  TOMADOR DO SERVIÇO", border="B", ln=1)
        
        y_tom_body = y_tom + 5
        # row 1
        d_cell(12, y_tom_body+1, col1, 7, "Nome / Nome Empresarial", self.t_nome)
        pdf.line(10+col1, y_tom_body, 10+col1, y_tom_body+7)
        d_cell(12+col1, y_tom_body+1, col2, 7, "CNPJ / CPF / NIF", self.t_cnpj)
        pdf.line(10+col1+col2, y_tom_body, 10+col1+col2, y_tom_body+7)
        d_cell(12+col1+col2, y_tom_body+1, col3/2, 7, "Inscrição Municipal", self.t_im)
        d_cell(12+col1+col2+28, y_tom_body+1, col3/2, 7, "Telefone", self.t_fone)
        pdf.line(10, y_tom_body+7, 200, y_tom_body+7)

        # row 2
        d_cell(12, y_tom_body+8, col1+col2, 7, "Endereço", self.t_endereco_completo)
        pdf.line(10+col1+col2, y_tom_body+7, 10+col1+col2, y_tom_body+16)
        d_cell(12+col1+col2, y_tom_body+8, col3/2 + 10, 7, "Município", self.t_municipio_uf)
        d_cell(12+col1+col2+38, y_tom_body+8, col3/2 - 10, 7, "CEP", self.t_end_cep)


        # INTERMEDIARIO
        y_int = y_tom + 23
        pdf.set_xy(10, y_int)
        pdf.set_font("Helvetica", size=7)
        pdf.cell(190, 4, "INTERMEDIÁRIO DO SERVIÇO NÃO IDENTIFICADO NA NFS-e", align="C", border="TB")

        # ==========================================
        # SERVIÇO PRESTADO
        # ==========================================
        y_srv = y_int + 6
        pdf.rect(10, y_srv, 190, 35) # altura dinamica ideal, mas fixaremos
        pdf.set_xy(10, y_srv)
        pdf.set_font("Helvetica", style="B", size=8)
        pdf.cell(190, 5, "  SERVIÇO PRESTADO", border="B", ln=1)

        y_srv_body = y_srv + 5
        cw1 = 45; cw2 = 45; cw3 = 50; cw4 = 50
        d_cell(12, y_srv_body+1, cw1-2, 10, "Código de Tributação Nacional", self.s_trib_nac)
        pdf.line(10+cw1, y_srv_body, 10+cw1, y_srv_body+10)
        d_cell(12+cw1, y_srv_body+1, cw2-2, 10, "Código de Tributação Municipal", self.s_trib_mun)
        pdf.line(10+cw1+cw2, y_srv_body, 10+cw1+cw2, y_srv_body+10)
        d_cell(12+cw1+cw2, y_srv_body+1, cw3-2, 10, "Local da Prestação", self.s_local_prest)
        pdf.line(10+cw1+cw2+cw3, y_srv_body, 10+cw1+cw2+cw3, y_srv_body+10)
        d_cell(12+cw1+cw2+cw3, y_srv_body+1, cw4-2, 10, "País da Prestação", self.s_pais_prest)

        pdf.line(10, y_srv_body+10, 200, y_srv_body+10)
        
        pdf.set_xy(12, y_srv_body+11)
        pdf.set_font("Helvetica", style="B", size=6)
        pdf.cell(186, 3, "Descrição do Serviço", align="L")
        pdf.set_xy(12, y_srv_body+14)
        pdf.set_font("Helvetica", size=7)
        pdf.multi_cell(186, 3, self.s_desc, align="L")

        # ==========================================
        # TRIBUTAÇÃO MUNICIPAL
        # ==========================================
        y_tm = y_srv + 37
        pdf.rect(10, y_tm, 190, 25)
        pdf.set_xy(10, y_tm)
        pdf.set_font("Helvetica", style="B", size=8)
        pdf.cell(190, 5, "  TRIBUTAÇÃO MUNICIPAL", border="B", ln=1)

        y_tm_b = y_tm + 5
        cm1 = 45; cm2 = 50; cm3 = 45; cm4 = 50
        # row 1
        d_cell(12, y_tm_b+1, cm1, 7, "Tributação do ISSQN", "Operação Tributável")
        d_cell(12+cm1, y_tm_b+1, cm2, 7, "País Resultado da Prestação do Serviço", "-")
        d_cell(12+cm1+cm2, y_tm_b+1, cm3, 7, "Município de Incidência do ISSQN", self.s_local_prest)
        d_cell(12+cm1+cm2+cm3, y_tm_b+1, cm4, 7, "Regime Especial de Tributação", "Nenhum")
        pdf.line(10, y_tm_b+7, 200, y_tm_b+7)
        # row 2
        d_cell(12, y_tm_b+8, cm1, 7, "Tipo de Imunidade", "-")
        d_cell(12+cm1, y_tm_b+8, cm2, 7, "Suspensão da Exigibilidade do ISSQN", "Não")
        d_cell(12+cm1+cm2, y_tm_b+8, cm3, 7, "Número Processo Suspensão", "-")
        d_cell(12+cm1+cm2+cm3, y_tm_b+8, cm4, 7, "Benefício Municipal", "-")
        pdf.line(10, y_tm_b+14, 200, y_tm_b+14)
        # row 3
        d_cell(12, y_tm_b+15, cm1, 6, "Valor do Serviço", f"R$ {self.v_serv:,.2f}".replace(',','_').replace('.',',').replace('_','.'))
        d_cell(12+cm1, y_tm_b+15, cm2, 6, "Desconto Incondicionado", f"R$ {self.v_desc_incond:,.2f}".replace(',','_').replace('.',',').replace('_','.'))
        d_cell(12+cm1+cm2, y_tm_b+15, cm3, 6, "Total Deduções/Reduções", f"R$ {self.v_deducao:,.2f}".replace(',','_').replace('.',',').replace('_','.'))
        d_cell(12+cm1+cm2+cm3, y_tm_b+15, cm4, 6, "Cálculo do BM", "-")
        # row 4 (extrair de TM)
        # we will just add it logically, or skip to save space to match layout

        # ==========================================
        # TRIBUTAÇÃO FEDERAL
        # ==========================================
        y_tf = y_tm + 27
        pdf.rect(10, y_tf, 190, 14)
        pdf.set_xy(10, y_tf)
        pdf.set_font("Helvetica", style="B", size=8)
        pdf.cell(190, 5, "  TRIBUTAÇÃO FEDERAL", border="B", ln=1)

        y_tf_b = y_tf + 5
        cf1 = 38; cf2 = 38; cf3 = 38; cf4 = 38; cf5 = 38
        d_cell(12, y_tf_b+1, cf1, 7, "IRRF", f"R$ {self.v_ir:,.2f}".replace('.',','))
        d_cell(12+cf1, y_tf_b+1, cf2, 7, "Contribuição Previdenciária", f"R$ {self.v_ret_cp:,.2f}".replace('.',','))
        d_cell(12+cf1+cf2, y_tf_b+1, cf3, 7, "Contribuições Sociais - Retidas", f"R$ {self.v_csll:,.2f}".replace('.',','))
        d_cell(12+cf1*3, y_tf_b+1, cf4, 7, "PIS", f"R$ {self.v_pis:,.2f}".replace('.',','))
        d_cell(12+cf1*4, y_tf_b+1, cf5, 7, "COFINS", f"R$ {self.v_cofins:,.2f}".replace('.',','))

        # ==========================================
        # VALOR TOTAL DA NFS-E
        # ==========================================
        y_vt = y_tf + 16
        pdf.rect(10, y_vt, 190, 14)
        pdf.set_xy(10, y_vt)
        pdf.set_font("Helvetica", style="B", size=8)
        pdf.cell(190, 5, "  VALOR TOTAL DA NFS-E", border="B", ln=1)

        y_vt_b = y_vt + 5
        d_cell(12, y_vt_b+1, cf1, 7, "Valor do Serviço", f"R$ {self.v_serv:,.2f}".replace('.',','))
        d_cell(12+cf1, y_vt_b+1, cf2, 7, "Desconto Condicionado", f"R$ {self.v_desc_cond:,.2f}".replace('.',','))
        d_cell(12+cf1+cf2, y_vt_b+1, cf3, 7, "Desconto Incondicionado", f"R$ {self.v_desc_incond:,.2f}".replace('.',','))
        d_cell(12+cf1*3, y_vt_b+1, cf4, 7, "ISSQN Retido", f"R$ {self.v_iss_ret:,.2f}".replace('.',','))
        
        pdf.set_xy(12+cf1*4, y_vt_b+1)
        pdf.set_font("Helvetica", style="B", size=8)
        pdf.cell(cf5, 4, "Valor Líquido da NFS-e", border=0, align="L")
        pdf.set_xy(12+cf1*4, y_vt_b+5)
        pdf.set_font("Helvetica", style="B", size=10)
        pdf.cell(cf5, 4, f"R$ {self.v_liq:,.2f}".replace(',','_').replace('.',',').replace('_','.'), border=0, align="L")

        return pdf.output(dest='S')

import os
import io
import qrcode
from fpdf import FPDF
from lxml import etree
import tempfile

class DanfseGenerator:
    """
    Constrói visualmente o DANFSe (Documento Auxiliar da Nota Fiscal de Serviço Eletrônica)
    baseado no padrão ABRASF / Padrão Nacional.
    Lê o XML autorizado e usa FPDF2 para compor os quadros e tabelas.
    """
    
    def __init__(self, xml_content: str, prestador_nome: str = "", prestador_email: str = "", tomador_nome: str = "", tomador_email: str = ""):
        self.xml_content = xml_content
        # As APIs Sefaz/Serpro na DPS XML as vezes não retornam o nome social ou dados estáticos, 
        # então aceitamos injeção complementar da base local.
        self.prestador_nome = prestador_nome
        self.prestador_email = prestador_email
        self.tomador_nome = tomador_nome
        self.tomador_email = tomador_email
        self._parse_xml()

    def _parse_xml(self):
        try:
            root = etree.fromstring(self.xml_content.encode('utf-8'))
            # Strip namespaces to avoid matching issues with different SEFAZ/Serpro schemas
            for elem in root.getiterator():
                if not hasattr(elem.tag, 'find'): continue
                i = elem.tag.find('}')
                if i >= 0:
                    elem.tag = elem.tag[i+1:]
        except Exception:
            root = None
            
        def safe_find(path):
            if root is not None:
                el = root.find(path)
                return el.text if el is not None else ""
            return ""

        self.dh_emi = safe_find('.//dhEmi')
        self.prest_cnpj = safe_find('.//prest/CNPJ')
        self.toma_cnpj = safe_find('.//toma/CNPJ')
        self.desc_srv = safe_find('.//serv/descSrv')
        self.v_serv = safe_find('.//vServPrest')
        self.n_nfse = safe_find('.//nNFSe') or safe_find('.//nNfse') or safe_find('.//numero')
        if not self.v_serv:
            self.v_serv = "0.00"

        self.protocol_id = ""
        # The protocol ID could be the id attribute of infDPS or from signature
        inf_dps = root.find('.//infDPS') if root is not None else None
        if inf_dps is not None:
            self.protocol_id = inf_dps.get('Id', '').replace('TESTE_MOCK_', '')
            
        if not self.protocol_id:
            sig_ref = root.find('.//Reference') if root is not None else None
            if sig_ref is not None:
                self.protocol_id = sig_ref.get('URI', '').replace('#', '')
        
        if not self.protocol_id:
            self.protocol_id = "PROCESSANDO NA SEFAZ"
            
    def generate_pdf(self) -> bytes:
        pdf = FPDF(orientation="P", unit="mm", format="A4")
        pdf.add_page()
        pdf.set_auto_page_break(auto=True, margin=15)
        
        # Cores padrao
        pdf.set_draw_color(120, 120, 120)
        
        # CABEÇALHO (Brasão / Prefeitura / Título DANFSE)
        pdf.set_font("Helvetica", style="B", size=15)
        pdf.cell(0, 8, "NFS-e - Nota Fiscal de Serviço Eletrônica", ln=1, align="C")
        pdf.set_font("Helvetica", size=9)
        pdf.cell(0, 5, "Documento Auxiliar da NFS-e - Padrão Nacional", ln=1, align="C")
        
        pdf.ln(5)
        
        # CHAVE DE ACESSO E NUMERO
        pdf.set_font("Helvetica", style="B", size=9)
        pdf.cell(95, 4, "Número da NFS-e:", ln=0, align="L")
        pdf.cell(95, 4, "Chave de Acesso (Protocolo):", ln=1, align="L")
        
        pdf.set_font("Helvetica", size=10)
        num_nota = self.n_nfse if self.n_nfse else (self.protocol_id[:8] if self.protocol_id else "00000000")
        pdf.cell(95, 5, num_nota, ln=0, align="L")
        pdf.cell(95, 5, self.protocol_id or "SEM VALIDADE FISCAL", ln=1, align="L")
        
        pdf.ln(4)
        
        # Dados Base Box
        pdf.rect(10, pdf.get_y(), 190, 15)
        y_start = pdf.get_y()
        pdf.set_xy(12, y_start + 2)
        
        pdf.set_font("Helvetica", style="B", size=8)
        pdf.cell(60, 4, "Data e Hora Emissão", ln=0)
        pdf.cell(60, 4, "Competência", ln=0)
        pdf.cell(60, 4, "Código Verificação", ln=1)
        
        pdf.set_font("Helvetica", size=8)
        pdf.set_x(12)
        pdf.cell(60, 5, self.dh_emi.replace('T', ' ')[:19] if self.dh_emi else "-", ln=0)
        pdf.cell(60, 5, self.dh_emi[:10] if self.dh_emi else "-", ln=0)
        pdf.cell(60, 5, self.protocol_id[-10:] if self.protocol_id else "-", ln=1)
        
        pdf.set_y(y_start + 18)
        
        # EMITENTE BOX
        pdf.set_fill_color(240, 240, 240)
        pdf.rect(10, pdf.get_y(), 190, 6, "DF")
        pdf.set_xy(12, pdf.get_y() + 1)
        pdf.set_font("Helvetica", style="B", size=9)
        pdf.cell(0, 4, "PRESTADOR DE SERVIÇOS", ln=1)
        
        y_emm = pdf.get_y()
        pdf.rect(10, y_emm, 190, 20)
        pdf.set_xy(12, y_emm + 2)
        pdf.set_font("Helvetica", size=9)
        pdf.cell(0, 5, f"Nome/Razão Social: {self.prestador_nome}", ln=1)
        pdf.set_x(12)
        pdf.cell(100, 5, f"CNPJ: {self.prest_cnpj or '-'}", ln=0)
        pdf.cell(0, 5, f"E-mail: {self.prestador_email}", ln=1)
        
        pdf.set_y(y_emm + 23)
        
        # TOMADOR BOX
        pdf.rect(10, pdf.get_y(), 190, 6, "DF")
        pdf.set_xy(12, pdf.get_y() + 1)
        pdf.set_font("Helvetica", style="B", size=9)
        pdf.cell(0, 4, "TOMADOR DE SERVIÇOS", ln=1)
        
        y_tom = pdf.get_y()
        pdf.rect(10, y_tom, 190, 20)
        pdf.set_xy(12, y_tom + 2)
        pdf.set_font("Helvetica", size=9)
        pdf.cell(0, 5, f"Nome/Razão Social: {self.tomador_nome}", ln=1)
        pdf.set_x(12)
        pdf.cell(100, 5, f"CNPJ/CPF: {self.toma_cnpj or '-'}", ln=0)
        pdf.cell(0, 5, f"E-mail: {self.tomador_email}", ln=1)
        
        pdf.set_y(y_tom + 23)
        
        # SERVIÇOS BOX
        pdf.rect(10, pdf.get_y(), 190, 6, "DF")
        pdf.set_xy(12, pdf.get_y() + 1)
        pdf.set_font("Helvetica", style="B", size=9)
        pdf.cell(0, 4, "DISCRIMINAÇÃO DOS SERVIÇOS", ln=1)
        
        y_srv = pdf.get_y()
        pdf.rect(10, y_srv, 190, 40)
        pdf.set_xy(12, y_srv + 2)
        pdf.set_font("Helvetica", size=9)
        pdf.multi_cell(186, 5, f"{self.desc_srv}")
        
        pdf.set_y(y_srv + 43)
        
        # VALORES TOTAIS BOX
        pdf.rect(10, pdf.get_y(), 190, 15)
        y_val = pdf.get_y()
        pdf.set_xy(12, y_val + 2)
        pdf.set_font("Helvetica", style="B", size=8)
        pdf.cell(40, 4, "Valor dos Serviços (R$)", ln=0)
        pdf.cell(40, 4, "Deduções (R$)", ln=0)
        pdf.cell(40, 4, "Base de Cálculo (R$)", ln=0)
        pdf.cell(40, 4, "Alíquota (%)", ln=0)
        pdf.cell(40, 4, "Valor do ISS (R$)", ln=1)
        
        pdf.set_x(12)
        pdf.set_font("Helvetica", style="B", size=10)
        pdf.cell(40, 6, f"{float(self.v_serv):.2f}", ln=0)
        pdf.cell(40, 6, "0.00", ln=0)
        pdf.cell(40, 6, f"{float(self.v_serv):.2f}", ln=0)
        pdf.cell(40, 6, "0.00", ln=0)
        pdf.cell(40, 6, "0.00", ln=1)

        # QR CODE (Gerado no canto superior direito)
        qr_url = f"https://www.nfse.gov.br/consultar?chave={self.protocol_id}"
        qr = qrcode.QRCode(version=1, box_size=10, border=1)
        qr.add_data(qr_url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Salva img em temp e injeta
        with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as temp_img:
            img.save(temp_img.name)
            pdf.image(temp_img.name, x=165, y=10, w=30)
        os.remove(temp_img.name)

        return pdf.output(dest='S')

import os
import sys

# Ensure backend modules are found
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from app.core.danfse_generator import DanfseGenerator

with open('mock_nfse.xml', 'r') as f:
    xml_data = f.read()

generator = DanfseGenerator(
    xml_content=xml_data,
    prestador_nome="LSBWEBINFO SERVICOS EM TECNOLOGIA LTDA",
    prestador_email="FINANCEIRO@LSBWEBINFO.COM.BR",
    tomador_nome="HISTORIA SEM FIM LIVRARIA DE AUTORA",
    tomador_email="contato@historia.com.br"
)

pdf_bytes = generator.generate_pdf()
with open('output_danfse.pdf', 'wb') as f:
    f.write(pdf_bytes)
print("Gerado output_danfse.pdf")

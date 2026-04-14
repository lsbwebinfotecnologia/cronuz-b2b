from app.db.session import SessionLocal
from app.models.nfse import NFSeQueue
from app.models.service import ServiceOrder
from app.core.danfse_generator import DanfseGenerator
import json
import os

db = SessionLocal()
order = db.query(ServiceOrder).order_by(ServiceOrder.id.desc()).first()
nfse_q = db.query(NFSeQueue).filter(NFSeQueue.service_order_id == order.id).first()

if order and nfse_q:
    print(f"Testando PDF para OS {order.id}")
    xml_content = f"<?xml version='1.0'?><DPS><infDPS Id='{nfse_q.xml_protocol_id}'/></DPS>"
    
    prestador_nome = "EMPRESA DE TESTE LTDA"
    prestador_email = "teste@teste.com"
    tomador_nome = "CLIENTE DE TESTE S/A"
    tomador_email = "cliente@teste.com"
    
    generator = DanfseGenerator(
        xml_content=xml_content,
        prestador_nome=prestador_nome,
        prestador_email=prestador_email,
        tomador_nome=tomador_nome,
        tomador_email=tomador_email
    )
    
    pdf_bytes = generator.generate_pdf()
    print(f"PDF Gerado com sucesso: {len(pdf_bytes)} bytes")
    with open('test_danfse.pdf', 'wb') as f:
        f.write(pdf_bytes)
    print("Salvo em test_danfse.pdf")

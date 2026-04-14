from app.db.session import SessionLocal
from app.models.nfse import NFSeQueue
from app.models.service import ServiceOrder
from app.core.danfse_generator import DanfseGenerator
import json
import os
import traceback

try:
    db = SessionLocal()
    order = db.query(ServiceOrder).filter(ServiceOrder.id == 21).first()
    nfse_q = db.query(NFSeQueue).filter(NFSeQueue.service_order_id == 21).order_by(NFSeQueue.created_at.desc()).first()

    now = nfse_q.created_at
    xml_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "storage", "nfse", str(order.company_id), str(now.year), f"{now.month:02d}", "xml"
    )
    xml_local_path = os.path.join(xml_dir, f"DPS_{order.company_id}_{order.id}_{int(now.timestamp())}.xml")

    xml_content = ""
    if os.path.exists(xml_local_path):
        with open(xml_local_path, "r", encoding="utf-8") as f:
            xml_content = f.read()
    else:
        xml_content = f"<?xml version='1.0'?><DPS><infDPS Id='{nfse_q.xml_protocol_id}'/></DPS>"

    prestador_nome = order.company.trade_name or order.company.name
    prestador_email = order.company.email or ""
    tomador_nome = order.customer.name
    tomador_email = order.customer.email or ""

    generator = DanfseGenerator(
        xml_content=xml_content,
        prestador_nome=prestador_nome,
        prestador_email=prestador_email,
        tomador_nome=tomador_nome,
        tomador_email=tomador_email
    )

    pdf_bytes = generator.generate_pdf()
    print("Sucesso!")
except Exception as e:
    print("ERRO:")
    traceback.print_exc()
